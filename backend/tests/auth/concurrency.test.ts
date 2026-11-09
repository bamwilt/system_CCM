import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '/home/bryan/Documentos/clase/DOCUMENTS/proyecto final/.tmp/test-artifacts/sgpm-fase3-db';
  process.env.DB_PORT = '55433';
  process.env.DB_NAME = 'sgpm_auth_test';
  process.env.DB_USER = 'sgpm_test';
  process.env.DB_POOL_MIN = '0';
  process.env.DB_POOL_MAX = '8';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.AUTH_RATE_KEY = 't'.repeat(40);
  process.env.AUTH_IP_RATE_LIMIT_MAX = '10';
  process.env.AUTH_GLOBAL_RATE_LIMIT_MAX = '100';
  process.env.AUTH_LOGIN_MAX_FAILURES = '5';
  process.env.AUTH_LOGIN_WINDOW_MINUTES = '15';
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';
import app from '../../src/app';
import { AuthRepository } from '../../src/repositories/auth.repository';
import { authService } from '../../src/services/auth.service';
import { hashPassword, hashToken, rateBucketKey } from '../../src/utils/authCrypto';
import { getSessionTokenFromCookieHeader } from '../../src/utils/cookies';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'ConcurrencyFixture123!';
const NEW_PASSWORD = 'ConcurrencyChanged456!';
const LOCK = 4315003;
const GRANTS = ['auth:users:manage', 'auth:roles:manage'];
let db: Pool;
let fixtureHash: string;

async function cleanup(): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_sessions');
    await client.query('DELETE FROM auth_login_limits');
    await client.query('DELETE FROM auditoria');
    await client.query('DELETE FROM usuarios');
    await client.query('DELETE FROM auth_role_permissions');
    await client.query("DELETE FROM roles WHERE nombre NOT IN ('ADMIN','COBRADOR','DIRECTOR','CONSULTA')");
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) throw new Error('Approved isolated TEST_DATABASE_URL required');
  db = await createTestPool();
  const evidence = (await db.query<{ version: string; db: string; addr: string | null }>(
    'SELECT version(), current_database() AS db, inet_server_addr() AS addr'
  )).rows[0];
  expect(evidence.version).toMatch(/^PostgreSQL 16/);
  expect(evidence.db).toBe('sgpm_auth_test');
  expect(evidence.addr).toBeNull();
  console.log('CONCURRENCY DB: PostgreSQL 16 / sgpm_auth_test / Unix socket');
  for (const file of ['migrations/001_create_base_tables.sql', 'migrations/002_auth_security.sql', 'seeds/001_seed_base.sql']) {
    await db.query(readFileSync(path.resolve(process.cwd(), '..', 'database', file), 'utf8'));
  }
  fixtureHash = await hashPassword(PASSWORD, 12);
}, 15000);
beforeEach(cleanup);
afterEach(async () => { vi.restoreAllMocks(); await cleanup(); });
afterAll(async () => {
  try { await closeTestPool(db); } finally { await closePool(); }
});

async function role(name: string, grants: string[] = []): Promise<number> {
  const id = (await db.query<{ id: number }>('INSERT INTO roles(nombre) VALUES ($1) RETURNING id', [name])).rows[0].id;
  for (const grant of grants) await db.query('INSERT INTO auth_role_permissions VALUES ($1,$2)', [id, grant]);
  return id;
}
async function user(email: string, roleId: number): Promise<number> {
  return (await db.query<{ id: number }>(
    'INSERT INTO usuarios(email,password_hash,nombre,apellido,rol_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [email, fixtureHash, 'Original', 'Fixture', roleId]
  )).rows[0].id;
}
function login(email: string, password = PASSWORD) {
  return request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password }).timeout(12000);
}
async function actor() {
  const roleId = await role('concurrency_actor', GRANTS);
  const id = await user('concurrency_actor@example.test', roleId);
  const res = await login('concurrency_actor@example.test');
  expect(res.status).toBe(200);
  const header: unknown = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [header];
  const cookie = cookies.map(c => String(c).split(';')[0]).join('; ');
  const raw = getSessionTokenFromCookieHeader(cookie);
  if (!raw) throw new Error('Missing fixture session cookie');
  const csrf: string = res.body.csrfToken;
  return { id, roleId, tokenHash: hashToken(raw), raw, csrf,
    headers: { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf } };
}
function signal() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Harness deadline: ${label}`)), 10000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

describe('A — old password snapshot versus committed password update', () => {
  it('rejects stale credentials, creates no session/audit success; new password works', async () => {
    const admin = await actor();
    const email = 'concurrency_victim@example.test';
    const victim = await user(email, admin.roleId);
    const captured = signal();
    const resume = signal();
    const original = AuthRepository.prototype.findUserByEmail;
    let paused = false;
    const spy = vi.spyOn(AuthRepository.prototype, 'findUserByEmail').mockImplementation(
      async function (this: AuthRepository, ...args: Parameters<typeof original>) {
        const snapshot = await original.apply(this, args);
        if (args[0] === email && !paused) {
          paused = true;
          captured.release();
          await bounded(resume.promise, 'resume real credential snapshot');
        }
        return snapshot;
      }
    );
    const pending = login(email).then(res => res);
    try {
      await bounded(captured.promise, 'real credential SQL read');
      const update = await request(app).patch(`/api/users/${victim}`).set(admin.headers)
        .send({ password: NEW_PASSWORD }).timeout(12000);
      expect(update.status).toBe(200);
      const watermark = (await db.query<{ id: number }>('SELECT COALESCE(MAX(id),0)::int AS id FROM auditoria')).rows[0].id;
      resume.release();
      const res = await pending;
      const sessions = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth_sessions WHERE usuario_id=$1', [victim])).rows[0].n;
      const successes = (await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM auditoria WHERE usuario_id=$1 AND accion='login_success' AND id>$2", [victim, watermark]
      )).rows[0].n;
      expect.soft(res.status, 'A stale password login status').toBe(401);
      expect.soft(sessions, 'A no new victim session').toBe(0);
      expect.soft(successes, 'A no stale login_success after update').toBe(0);
      spy.mockRestore();
      expect((await login(email, NEW_PASSWORD)).status).toBe(200);
    } finally {
      resume.release();
      await pending;
      spy.mockRestore();
    }
  }, 15000);
});

type Mutation = 'POST users' | 'PATCH users' | 'POST roles' | 'PATCH roles';
async function snapshot() {
  // Exclude secrets and timestamps from assertion output.
  return {
    users: (await db.query('SELECT id,email,nombre,apellido,rol_id,activo FROM usuarios ORDER BY id')).rows,
    roles: (await db.query('SELECT id,nombre,descripcion FROM roles ORDER BY id')).rows,
    grants: (await db.query('SELECT rol_id,permiso_codigo FROM auth_role_permissions ORDER BY 1,2')).rows,
  };
}
async function waitForAdvisory(controlPid: number): Promise<Date> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await db.query<{ xact_start: Date }>(
      `SELECT a.xact_start FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
       WHERE a.datname=current_database() AND a.pid<>$1 AND a.wait_event='advisory'
       AND a.query='SELECT pg_advisory_xact_lock($1)' AND l.locktype='advisory'
       AND NOT l.granted AND l.classid=0 AND l.objid=$2`, [controlPid, LOCK]
    );
    if (result.rows[0]) return result.rows[0].xact_start;
    await nextTurn();
  }
  throw new Error('Harness deadline: mutation did not enter observed advisory wait');
}
async function mutationSchedule(kind: Mutation, invalidation: 'revoke' | 'expire' | 'none') {
  const auth = await actor();
  const targetRole = await role('concurrency_target');
  const targetUser = await user('concurrency_target@example.test', targetRole);
  const before = await snapshot();
  const [method, resource] = kind.split(' ');
  const url = `/api/${resource}${method === 'PATCH' ? `/${resource === 'users' ? targetUser : targetRole}` : ''}`;
  const body = kind === 'POST users'
    ? { email: 'concurrency_new@example.test', password: PASSWORD, nombre: 'New', apellido: 'Fixture', rolId: targetRole }
    : kind === 'PATCH users' ? { nombre: 'Changed' }
    : kind === 'POST roles' ? { nombre: 'concurrency_new', permisos: [GRANTS[0]] }
    : { descripcion: 'Changed', permisos: [GRANTS[0]] };
  const action = `${resource === 'users' ? 'user' : 'role'}_${method === 'POST' ? 'create' : 'update'}`;
  const control = await db.connect();
  let pending: Promise<request.Response> | undefined;
  try {
    await control.query('BEGIN');
    await control.query("SET LOCAL statement_timeout='10s'");
    await control.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    const pid = (await control.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const req = method === 'POST' ? request(app).post(url) : request(app).patch(url);
    pending = req.set(auth.headers).send(body).timeout(12000).then(res => res);
    const start = await waitForAdvisory(pid);
    if (invalidation === 'revoke') {
      const updated = await control.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [auth.tokenHash]);
      expect(updated.rowCount).toBe(1);
    } else if (invalidation === 'expire') {
      const updated = await control.query<{ expires_at: Date; after_start: boolean }>(
        `UPDATE auth_sessions SET creado_en=clock_timestamp()-INTERVAL '1 hour', expires_at=clock_timestamp()
         WHERE token_hash=$1 RETURNING expires_at, expires_at > $2::timestamptz AS after_start`, [auth.tokenHash, start]
      );
      expect(updated.rows[0].after_start, 'Expiry occurred after waiting transaction began').toBe(true);
    }
    await control.query('COMMIT');
    const response = await pending;
    const after = await snapshot();
    const audits = (await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM auditoria WHERE usuario_id=$1 AND accion=$2', [auth.id, action]
    )).rows[0].n;
    if (invalidation === 'none') {
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(after).not.toEqual(before);
      expect(audits).toBe(1);
    } else {
      expect.soft(response.status, `${kind} ${invalidation}: status`).toBe(401);
      expect.soft(after, `${kind} ${invalidation}: no mutation effects`).toEqual(before);
      expect.soft(audits, `${kind} ${invalidation}: no operation success audit`).toBe(0);
    }
  } finally {
    try { await control.query('ROLLBACK'); } finally {
      control.release();
      if (pending) await pending;
    }
  }
}
describe('B/C — session freshness after measured advisory-lock wait', () => {
  for (const kind of ['POST users', 'PATCH users', 'POST roles', 'PATCH roles'] as const) {
    it(`B ${kind}: committed revocation rejects mutation without effects`, () => mutationSchedule(kind, 'revoke'), 15000);
    it(`E ${kind}: same barrier without revocation succeeds`, () => mutationSchedule(kind, 'none'), 15000);
  }
  it('C PATCH users: expiry after transaction start rejects without effects', () => mutationSchedule('PATCH users', 'expire'), 15000);
});

const globalKey = rateBucketKey({ prefix: 'global', value: 'global', secret: 't'.repeat(40) });
async function seedGlobal() {
  await db.query('INSERT INTO auth_login_limits(bucket_key,window_start,attempts) VALUES ($1,clock_timestamp(),3)', [globalKey]);
}
async function globalAttempts(): Promise<number> {
  return (await db.query<{ attempts: number }>('SELECT attempts FROM auth_login_limits WHERE bucket_key=$1', [globalKey])).rows[0].attempts;
}
describe('D — rejected traffic cannot exhaust the global login budget', () => {
  it('blocked synthetic IP returns 429/Retry-After without charging global', async () => {
    await seedGlobal();
    const ip = '192.0.2.31';
    const key = rateBucketKey({ prefix: 'ip', value: ip, secret: 't'.repeat(40) });
    await db.query(
      "INSERT INTO auth_login_limits(bucket_key,window_start,attempts,blocked_until) VALUES ($1,clock_timestamp(),10,clock_timestamp()+INTERVAL '10 minutes')", [key]
    );
    await expect(authService.preLoginRateLimit(ip)).rejects.toMatchObject({ statusCode: 429, retryAfter: expect.any(Number) });
    expect(await globalAttempts()).toBe(3);
  }, 15000);
  it('positive: another synthetic IP is allowed and increments global once', async () => {
    await seedGlobal();
    await authService.preLoginRateLimit('192.0.2.32');
    expect(await globalAttempts()).toBe(4);
  }, 15000);
  for (const invalid of ['Origin', 'Content-Type'] as const) {
    it(`invalid ${invalid} with otherwise valid login body does not charge global`, async () => {
      await seedGlobal();
      const before = await globalAttempts();
      const req = request(app).post('/api/auth/login').set('Origin', invalid === 'Origin' ? 'http://invalid.example.test' : ORIGIN);
      const body = { email: 'concurrency_actor@example.test', password: PASSWORD };
      const res = await (invalid === 'Content-Type' ? req.set('Content-Type', 'text/plain').send(JSON.stringify(body)) : req.send(body));
      expect(res.status).toBe(invalid === 'Origin' ? 403 : 400);
      expect(await globalAttempts()).toBe(before);
    }, 15000);
  }
});
describe('E — ordinary lifecycle control', () => {
  it('login stores only session/CSRF hashes; logout completes and revokes', async () => {
    const auth = await actor();
    const row = (await db.query<{ token_hash: string; csrf_hash: string; revoked_at: Date | null }>(
      'SELECT token_hash,csrf_hash,revoked_at FROM auth_sessions WHERE usuario_id=$1', [auth.id]
    )).rows[0];
    // Boolean assertions avoid displaying tokens or their hashes on failure.
    expect(row.token_hash === hashToken(auth.raw)).toBe(true);
    expect(row.csrf_hash === hashToken(auth.csrf)).toBe(true);
    expect(row.token_hash === auth.raw).toBe(false);
    expect(row.revoked_at).toBeNull();
    const res = await request(app).post('/api/auth/logout').set(auth.headers).timeout(12000);
    expect(res.status).toBe(204);
    const revoked = (await db.query<{ revoked: boolean }>('SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE token_hash=$1', [auth.tokenHash])).rows[0];
    expect(revoked.revoked).toBe(true);
    expect((await request(app).get('/api/auth/me').set('Cookie', auth.headers.Cookie)).status).toBe(401);
  }, 15000);
});
