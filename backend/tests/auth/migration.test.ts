import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { getTestDatabaseUrl, createTestPool, closeTestPool } from './testDb';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const migrationsDir = join(process.cwd(), '..', 'database', 'migrations');
const seedsDir = join(process.cwd(), '..', 'database', 'seeds');
const migrationFiles = ['001_create_base_tables.sql', '002_auth_security.sql'];

describe('migrations - static file checks (not DB-verified)', () => {
  it('migration files exist and declare expected tables', () => {
    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      expect(sql.length).toBeGreaterThan(0);
    }
    const sql1 = readFileSync(join(migrationsDir, '001_create_base_tables.sql'), 'utf8');
    const sql2 = readFileSync(join(migrationsDir, '002_auth_security.sql'), 'utf8');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS usuarios');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS roles');
    expect(sql2).toContain('CREATE TABLE IF NOT EXISTS auth_sessions');
    expect(sql2).toContain('CREATE TABLE IF NOT EXISTS auth_login_limits');
    expect(sql2).toContain('CREATE TABLE IF NOT EXISTS auth_role_permissions');
    expect(sql2).toContain("token_hash CHAR(64)");
    expect(sql2).toContain("csrf_hash CHAR(64)");
  });

  it('declares key constraints in SQL text', () => {
    const sql2 = readFileSync(join(migrationsDir, '002_auth_security.sql'), 'utf8');
    expect(sql2).toContain('auth_sessions_token_hash_hex');
    expect(sql2).toContain('auth_sessions_expiry_check');
    expect(sql2).toContain('auth_login_limits_attempts_nonnegative');
    expect(sql2).toContain('auth_role_permissions_codigo_check');
  });
});

const dbUrl = getTestDatabaseUrl();
const describeDb = dbUrl ? describe : describe.skip;

describeDb('migrations - integration against isolated DB', () => {
  let pool: Pool;
  let dbEvidence: Record<string, unknown>;

  beforeAll(async () => {
    pool = await createTestPool();
    const client = await pool.connect();
    try {
      const res = await client.query(
        "SELECT version() AS version, current_database() AS db, inet_server_addr() AS server_addr, inet_server_port() AS server_port, current_setting('listen_addresses') AS listen_addresses"
      );
      dbEvidence = res.rows[0] as Record<string, unknown>;
      // eslint-disable-next-line no-console
      console.log('DB EVIDENCE:', JSON.stringify(dbEvidence));
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool(pool);
  });

  it('connects to isolated PostgreSQL 16 over Unix socket (no TCP)', async () => {
    expect(String(dbEvidence.version)).toMatch(/^PostgreSQL 16/);
    expect(dbEvidence.db).toBe('sgpm_auth_test');
    expect(dbEvidence.server_addr).toBeNull();
  });

  it('applies migrations twice, enforces constraints, seed leaves auth_role_permissions empty', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sql1 = readFileSync(join(migrationsDir, '001_create_base_tables.sql'), 'utf8');
      const sql2 = readFileSync(join(migrationsDir, '002_auth_security.sql'), 'utf8');
      const seedSql = readFileSync(join(seedsDir, '001_seed_base.sql'), 'utf8');

      await client.query(sql1);
      await client.query(sql2);
      await client.query(sql2); // execute 002 a second time (idempotency)

      // Minimal fixtures for FK validation (data fixtures only; no real credential comparison).
      await client.query("INSERT INTO roles (nombre) VALUES ('test_role') ON CONFLICT (nombre) DO NOTHING");
      const roleRes = await client.query("SELECT id FROM roles WHERE nombre='test_role'");
      const roleId = roleRes.rows[0].id as number;
      await client.query(
        'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id) VALUES ($1,$2,$3,$4,$5)',
        ['t@example.com', '$2b$12$' + 'a'.repeat(53), 'T', 'U', roleId]
      );
      const userRes = await client.query("SELECT id FROM usuarios WHERE email='t@example.com'");
      const userId = userRes.rows[0].id as number;

      const validHash = 'a'.repeat(64);
      const validCsrf = 'b'.repeat(64);
      await client.query(
        'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
        [validHash, userId, validCsrf]
      );

      async function expectPgError(sql: string, params: unknown[] | undefined, code: string, constraint?: string) {
        await client.query('SAVEPOINT sp_test');
        try {
          const assertion = expect(client.query(sql, params)).rejects.toMatchObject(
            constraint ? { code, constraint } : { code }
          );
          await assertion;
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT sp_test').catch(() => undefined);
          await client.query('RELEASE SAVEPOINT sp_test').catch(() => undefined);
        }
      }

      // invalid token_hash (non-hex) rejected -> 23514 + constraint name
      await expectPgError(
        'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
        ['not-hex', userId, validCsrf],
        '23514',
        'auth_sessions_token_hash_hex'
      );

      // expires_at <= creado_en rejected
      await expectPgError(
        'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1,$2,$3,NOW()-INTERVAL \'1 hour\')',
        ['c'.repeat(64), userId, validCsrf],
        '23514',
        'auth_sessions_expiry_check'
      );

      // nonnegative attempts
      await expectPgError(
        "INSERT INTO auth_login_limits (bucket_key, attempts) VALUES ('bk', -1)",
        undefined,
        '23514',
        'auth_login_limits_attempts_nonnegative'
      );

      // permiso codigo check
      await expectPgError(
        'INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1,$2)',
        [roleId, 'invalid:perm'],
        '23514',
        'auth_role_permissions_codigo_check'
      );

      // FK bad user -> 23503
      await expectPgError(
        'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
        ['d'.repeat(64), 999999, validCsrf],
        '23503'
      );

      // duplicate token_hash -> 23505
      await expectPgError(
        'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
        [validHash, userId, validCsrf],
        '23505'
      );

      // Catalog evidence: indexes
      const idxSessions = await client.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='auth_sessions'"
      );
      const sessionIdx = idxSessions.rows.map((r) => r.indexname as string);
      expect(sessionIdx).toEqual(expect.arrayContaining(['idx_auth_sessions_usuario_id', 'idx_auth_sessions_expires_at']));

      const idxLimits = await client.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='auth_login_limits'"
      );
      const limitIdx = idxLimits.rows.map((r) => r.indexname as string);
      expect(limitIdx).toEqual(expect.arrayContaining(['idx_auth_login_limits_blocked_until']));

      const idxPerms = await client.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='auth_role_permissions'"
      );
      const permIdx = idxPerms.rows.map((r) => r.indexname as string);
      expect(permIdx).toEqual(expect.arrayContaining(['idx_auth_role_permissions_rol_id']));

      // Catalog evidence: constraints
      const sessConstraints = await client.query(
        "SELECT conname FROM pg_constraint WHERE conrelid='auth_sessions'::regclass"
      );
      const sessConstraintNames = sessConstraints.rows.map((r) => r.conname as string);
      expect(sessConstraintNames).toEqual(
        expect.arrayContaining(['auth_sessions_token_hash_hex', 'auth_sessions_csrf_hash_hex', 'auth_sessions_expiry_check'])
      );

      // Apply seed 001 and verify auth_role_permissions remains empty (legacy ADMIN all via rol_permiso, no auth grants).
      await client.query(seedSql);
      const arp = await client.query('SELECT count(*)::int AS c FROM auth_role_permissions');
      expect(arp.rows[0].c).toBe(0);

      const legacy = await client.query(
        "SELECT count(*)::int AS c FROM rol_permiso rp JOIN roles r ON r.id=rp.rol_id WHERE r.nombre='ADMIN'"
      );
      expect(legacy.rows[0].c).toBeGreaterThan(0);

      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});