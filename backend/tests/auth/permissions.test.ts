import { vi } from 'vitest';
vi.hoisted(async () => {
  const { TEST_SOCKET_DIR } = await import('./testEnv.js');
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = TEST_SOCKET_DIR;
  process.env.DB_PORT = '55433';
  process.env.DB_NAME = 'sgpm_auth_test';
  process.env.DB_USER = 'sgpm_test';
  process.env.DB_POOL_MIN = '0';
  process.env.DB_POOL_MAX = '8';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.AUTH_RATE_KEY = 't'.repeat(40);
  process.env.AUTH_IP_RATE_LIMIT_MAX = '10000';
  process.env.AUTH_GLOBAL_RATE_LIMIT_MAX = '100000';
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/authCrypto';
import { bootstrapAuth } from '../../src/scripts/bootstrap-auth';
import {
  AUTH_PERMISSIONS,
  canGrant,
  getCurrentAuthContext,
} from '../../src/authorization/permissions';

const ORIGIN = 'http://localhost:5173';
const MIG1 = path.resolve(process.cwd(), '..', 'database', 'migrations', '001_create_base_tables.sql');
const MIG2 = path.resolve(process.cwd(), '..', 'database', 'migrations', '002_auth_security.sql');
const SEED = path.resolve(process.cwd(), '..', 'database', 'seeds', '001_seed_base.sql');

const USERS_MANAGE = AUTH_PERMISSIONS.USERS_MANAGE;
const ROLES_MANAGE = AUTH_PERMISSIONS.ROLES_MANAGE;

let dbPool: Pool;

async function resetDb(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_sessions');
    await client.query('DELETE FROM auth_login_limits');
    await client.query('DELETE FROM auditoria');
    await client.query('DELETE FROM usuarios');
    await client.query('DELETE FROM auth_role_permissions');
    await client.query("DELETE FROM roles WHERE nombre NOT IN ('ADMIN','COBRADOR','DIRECTOR','CONSULTA')");
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function createRole(name: string, grants: string[] = [], description: string | null = null): Promise<number> {
  const client = await dbPool.connect();
  try {
    const r = await client.query<{ id: number }>(
      'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
      [name, description]
    );
    const id = r.rows[0].id;
    for (const code of grants) {
      await client.query('INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)', [id, code]);
    }
    return id;
  } finally {
    client.release();
  }
}

async function createUser(
  email: string,
  password: string,
  roleId: number,
  active = true
): Promise<{ id: number; email: string; password: string }> {
  const hash = await hashPassword(password, 12);
  const client = await dbPool.connect();
  try {
    const r = await client.query<{ id: number; email: string }>(
      'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email',
      [email, hash, 'Test', 'User', roleId, active]
    );
    return { id: r.rows[0].id, email: r.rows[0].email, password };
  } finally {
    client.release();
  }
}

async function getAdminRoleId(): Promise<number> {
  const client = await dbPool.connect();
  try {
    const r = await client.query<{ id: number }>("SELECT id FROM roles WHERE nombre='ADMIN'");
    return r.rows[0].id;
  } finally {
    client.release();
  }
}

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const sc = res.headers['set-cookie'];
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  return arr.map((c) => String(c).split(';')[0]).join('; ');
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .set('Content-Type', 'application/json')
    .send({ email, password });
  return { res, cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

function authHeaders(cookie: string, csrf: string): Record<string, string> {
  return { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf };
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  dbPool = await createTestPool();
  const client = await dbPool.connect();
  try {
    await client.query(readFileSync(MIG1, 'utf8'));
    await client.query(readFileSync(MIG2, 'utf8'));
    await client.query(readFileSync(SEED, 'utf8'));
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await closeTestPool(dbPool);
  await closePool().catch(() => undefined);
});

beforeEach(async () => {
  await resetDb();
});

describe('authorization - anonymous and missing permissions', () => {
  it('anonymous GET /api/users -> 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('anonymous GET /api/roles -> 401', async () => {
    const res = await request(app).get('/api/roles');
    expect(res.status).toBe(401);
  });

  it('user without auth grants -> 403 on users and roles', async () => {
    const roleId = await createRole('noauth', []);
    await createUser('noauth@example.com', 'Password12345!', roleId);
    const { cookie } = await login('noauth@example.com', 'Password12345!');
    const r1 = await request(app).get('/api/users').set('Cookie', cookie);
    const r2 = await request(app).get('/api/roles').set('Cookie', cookie);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('legacy ADMIN (seed) has base permissions but no auth grants -> 403', async () => {
    const adminRoleId = await getAdminRoleId();
    await createUser('legacyadmin@example.com', 'Password12345!', adminRoleId);
    const { cookie } = await login('legacyadmin@example.com', 'Password12345!');
    const r1 = await request(app).get('/api/users').set('Cookie', cookie);
    const r2 = await request(app).get('/api/roles').set('Cookie', cookie);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('actor is sourced from session, not body/headers', async () => {
    const roleId = await createRole('noauth2', []);
    await createUser('noauth2@example.com', 'Password12345!', roleId);
    const { cookie } = await login('noauth2@example.com', 'Password12345!');
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', cookie)
      .set('X-User-Id', '999')
      .send({ userId: 999, role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('GET /api/users returns safe profile (no hash/token/secret)', async () => {
    const bothRoleId = await createRole('both1', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actor1@example.com', 'Password12345!', bothRoleId);
    await createUser('target1@example.com', 'Password12345!', bothRoleId);
    const { cookie } = await login('actor1@example.com', 'Password12345!');
    const res = await request(app).get('/api/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    for (const u of res.body.users) {
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('email');
      expect(u).toHaveProperty('nombre');
      expect(u).toHaveProperty('apellido');
      expect(u).toHaveProperty('rolId');
      expect(u).toHaveProperty('activo');
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('password_hash');
    }
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/password_hash|sessionToken|secret|token/i);
  });

  it('GET /api/roles returns correct permission codes', async () => {
    const bothRoleId = await createRole('both2', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actor2@example.com', 'Password12345!', bothRoleId);
    const { cookie } = await login('actor2@example.com', 'Password12345!');
    const res = await request(app).get('/api/roles').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const role = (res.body.roles as Array<{ nombre: string; permisos: string[] }>).find(
      (r) => r.nombre === 'both2'
    );
    expect(role).toBeDefined();
    expect(role!.permisos).toEqual([ROLES_MANAGE, USERS_MANAGE].sort());
  });

  it('IDOR: no-permission user cannot read another user by id', async () => {
    const noauthRoleId = await createRole('noauth3', []);
    const bothRoleId = await createRole('both3', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('victim@example.com', 'Password12345!', bothRoleId);
    await createUser('attacker@example.com', 'Password12345!', noauthRoleId);
    const victimId = (
      await dbPool.query<{ id: number }>("SELECT id FROM usuarios WHERE email='victim@example.com'")
    ).rows[0].id;
    const { cookie } = await login('attacker@example.com', 'Password12345!');
    const res = await request(app).get(`/api/users/${victimId}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('path injection / bad ids are rejected, not coerced', async () => {
    const bothRoleId = await createRole('both4', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actor4@example.com', 'Password12345!', bothRoleId);
    const { cookie } = await login('actor4@example.com', 'Password12345!');
    for (const bad of ['abc', '1abc', '01', '1.5', "1%20OR%201=1", '-1', '0']) {
      const res = await request(app).get(`/api/users/${bad}`).set('Cookie', cookie);
      expect([400, 404]).toContain(res.status);
      expect(res.status).not.toBe(200);
    }
  });

  it('unknown JSON keys -> 400 on user/role endpoints', async () => {
    const bothRoleId = await createRole('both5', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actor5@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actor5@example.com', 'Password12345!');
    const h = authHeaders(cookie, csrf);

    const r1 = await request(app).post('/api/users').set(h).send({
      email: 'new@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId, extra: 1,
    });
    expect(r1.status).toBe(400);

    const r2 = await request(app).patch('/api/users/999').set(h).send({ nombre: 'X', extra: 1 });
    expect([400, 404]).toContain(r2.status);

    const r3 = await request(app).post('/api/roles').set(h).send({
      nombre: 'newrole', permisos: [ROLES_MANAGE], extra: 1,
    });
    expect(r3.status).toBe(400);

    const r4 = await request(app).patch('/api/roles/999').set(h).send({ nombre: 'X', extra: 1 });
    expect([400, 404]).toContain(r4.status);
  });
});

describe('authorization - users create', () => {
  it('create requires both codes (users-only actor -> 403)', async () => {
    const usersOnlyRoleId = await createRole('usersOnly1', [USERS_MANAGE]);
    const bothRoleId = await createRole('bothU1', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actoru1@example.com', 'Password12345!', usersOnlyRoleId);
    const { cookie, csrf } = await login('actoru1@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'newu1@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(403);
  });

  it('create requires CSRF (both actor without CSRF -> 403)', async () => {
    const bothRoleId = await createRole('bothU2', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actoru2@example.com', 'Password12345!', bothRoleId);
    const { cookie } = await login('actoru2@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set('Cookie', cookie).set('Origin', ORIGIN).send({
      email: 'newu2@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(403);
  });

  it('create with both codes + CSRF succeeds and assigns subset role', async () => {
    const bothRoleId = await createRole('bothU3', [USERS_MANAGE, ROLES_MANAGE]);
    const targetRoleId = await createRole('targetSubset', [USERS_MANAGE]);
    await createUser('actoru3@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actoru3@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'newu3@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: targetRoleId,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('newu3@example.com');
    expect(res.body.user.rolId).toBe(targetRoleId);
  });

  it('duplicate email -> 409 and no hash leaked', async () => {
    const bothRoleId = await createRole('bothU4', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('dup@example.com', 'Password12345!', bothRoleId);
    await createUser('actoru4@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actoru4@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'dup@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|token/i);
  });

  it('email is normalized to lowercase', async () => {
    const bothRoleId = await createRole('bothU5', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actoru5@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actoru5@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'newuser@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('newuser@example.com');
    const db = await dbPool.query<{ email: string }>("SELECT email FROM usuarios WHERE email='newuser@example.com'");
    expect(db.rows.length).toBe(1);
  });

  it('password validation: min 12, max 72 UTF-8 bytes', async () => {
    const bothRoleId = await createRole('bothU6', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actoru6@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actoru6@example.com', 'Password12345!');

    const short = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'shortpw@example.com', password: 'short', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(short.status).toBe(400);

    const eleven = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'eleven@example.com', password: 'a'.repeat(11), nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(eleven.status).toBe(400);

    const seventyThree = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'longpw@example.com', password: 'a'.repeat(73), nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(seventyThree.status).toBe(400);

    const ok12 = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'ok12@example.com', password: 'a'.repeat(12), nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(ok12.status).toBe(201);

    const pw72 = 'a'.repeat(72);
    const ok72 = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'ok72@example.com', password: pw72, nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(ok72.status).toBe(201);
    const db = await dbPool.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE email='ok72@example.com'");
    expect(db.rows[0].password_hash).toMatch(/^\$2[aby]\$1[2-4]\$/);
  });

  it('bcrypt cost >= 12 on created user', async () => {
    const bothRoleId = await createRole('bothU7', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actoru7@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actoru7@example.com', 'Password12345!');
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'cost@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(201);
    const db = await dbPool.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE email='cost@example.com'");
    const rounds = bcrypt.getRounds(db.rows[0].password_hash);
    expect(rounds).toBeGreaterThanOrEqual(12);
  });
});

describe('authorization - users patch and session revocation', () => {
  it('users-only actor cannot modify high-priv (roles grant) target', async () => {
    const usersOnlyRoleId = await createRole('usersOnlyP1', [USERS_MANAGE]);
    const highRoleId = await createRole('highP1', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('attackerp1@example.com', 'Password12345!', usersOnlyRoleId);
    const target = await createUser('highuserp1@example.com', 'Password12345!', highRoleId);
    const { cookie, csrf } = await login('attackerp1@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(cookie, csrf)).send({ nombre: 'Changed' });
    expect(res.status).toBe(403);
  });

  it('users-only actor cannot change password of high-priv target', async () => {
    const usersOnlyRoleId = await createRole('usersOnlyP2', [USERS_MANAGE]);
    const highRoleId = await createRole('highP2', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('attackerp2@example.com', 'Password12345!', usersOnlyRoleId);
    const target = await createUser('highuserp2@example.com', 'Password12345!', highRoleId);
    const { cookie, csrf } = await login('attackerp2@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(cookie, csrf)).send({ password: 'NewPassword12345!' });
    expect(res.status).toBe(403);
  });

  it('role assignment requires roles:manage (users-only -> 403)', async () => {
    const usersOnlyRoleId = await createRole('usersOnlyP3', [USERS_MANAGE]);
    const targetRoleId = await createRole('targetP3', []);
    await createUser('attackerp3@example.com', 'Password12345!', usersOnlyRoleId);
    const target = await createUser('targetuserp3@example.com', 'Password12345!', targetRoleId);
    const { cookie, csrf } = await login('attackerp3@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(cookie, csrf)).send({ rolId: targetRoleId });
    expect(res.status).toBe(403);
  });

  it('password change revokes target sessions (old cookie 401)', async () => {
    const bothRoleId = await createRole('bothP4', [USERS_MANAGE, ROLES_MANAGE]);
    const targetRoleId = await createRole('targetP4', []);
    await createUser('actorp4@example.com', 'Password12345!', bothRoleId);
    const target = await createUser('targetp4@example.com', 'Password12345!', targetRoleId);
    const targetLogin = await login('targetp4@example.com', 'Password12345!');
    const { cookie: actorCookie, csrf: actorCsrf } = await login('actorp4@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(actorCookie, actorCsrf)).send({ password: 'NewPassword12345!' });
    expect(res.status).toBe(200);
    const meRes = await request(app).get('/api/auth/me').set('Cookie', targetLogin.cookie);
    expect(meRes.status).toBe(401);
  });

  it('deactivation revokes target sessions (old cookie 401)', async () => {
    const bothRoleId = await createRole('bothP5', [USERS_MANAGE, ROLES_MANAGE]);
    const targetRoleId = await createRole('targetP5', []);
    await createUser('actorp5@example.com', 'Password12345!', bothRoleId);
    const target = await createUser('targetp5@example.com', 'Password12345!', targetRoleId);
    const targetLogin = await login('targetp5@example.com', 'Password12345!');
    const { cookie: actorCookie, csrf: actorCsrf } = await login('actorp5@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(actorCookie, actorCsrf)).send({ activo: false });
    expect(res.status).toBe(200);
    const meRes = await request(app).get('/api/auth/me').set('Cookie', targetLogin.cookie);
    expect(meRes.status).toBe(401);
  });

  it('role change revokes target sessions (old cookie 401)', async () => {
    const bothRoleId = await createRole('bothP6', [USERS_MANAGE, ROLES_MANAGE]);
    const targetRoleId = await createRole('targetP6a', []);
    const newRoleId = await createRole('targetP6b', []);
    await createUser('actorp6@example.com', 'Password12345!', bothRoleId);
    const target = await createUser('targetp6@example.com', 'Password12345!', targetRoleId);
    const targetLogin = await login('targetp6@example.com', 'Password12345!');
    const { cookie: actorCookie, csrf: actorCsrf } = await login('actorp6@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/users/${target.id}`).set(authHeaders(actorCookie, actorCsrf)).send({ rolId: newRoleId });
    expect(res.status).toBe(200);
    const meRes = await request(app).get('/api/auth/me').set('Cookie', targetLogin.cookie);
    expect(meRes.status).toBe(401);
  });

  it('actor who lost grants is rechecked against DB (stale context not trusted)', async () => {
    const bothRoleId = await createRole('bothP7', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorp7@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorp7@example.com', 'Password12345!');
    await dbPool.query(
      'DELETE FROM auth_role_permissions WHERE rol_id = $1 AND permiso_codigo = $2',
      [bothRoleId, ROLES_MANAGE]
    );
    const res = await request(app).post('/api/users').set(authHeaders(cookie, csrf)).send({
      email: 'shouldfail@example.com', password: 'Password12345!', nombre: 'N', apellido: 'A', rolId: bothRoleId,
    });
    expect(res.status).toBe(403);
    const res2 = await request(app).get('/api/roles').set('Cookie', cookie);
    expect(res2.status).toBe(403);
  });
});

describe('authorization - roles', () => {
  it('POST role requires roles:manage (users-only -> 403)', async () => {
    const usersOnlyRoleId = await createRole('usersOnlyR1', [USERS_MANAGE]);
    await createUser('actorr1@example.com', 'Password12345!', usersOnlyRoleId);
    const { cookie, csrf } = await login('actorr1@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'newroleR1', permisos: [ROLES_MANAGE],
    });
    expect(res.status).toBe(403);
  });

  it('POST role requires CSRF', async () => {
    const bothRoleId = await createRole('bothR2', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr2@example.com', 'Password12345!', bothRoleId);
    const { cookie } = await login('actorr2@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set('Cookie', cookie).set('Origin', ORIGIN).send({
      nombre: 'newroleR2', permisos: [ROLES_MANAGE],
    });
    expect(res.status).toBe(403);
  });

  it('roles-only actor cannot grant users:manage', async () => {
    const rolesOnlyRoleId = await createRole('rolesOnlyR3', [ROLES_MANAGE]);
    await createUser('actorr3@example.com', 'Password12345!', rolesOnlyRoleId);
    const { cookie, csrf } = await login('actorr3@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'newroleR3', permisos: [USERS_MANAGE],
    });
    expect(res.status).toBe(403);
  });

  it('both actor can create role with subset grants', async () => {
    const bothRoleId = await createRole('bothR4', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr4@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorr4@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'newroleR4', permisos: [USERS_MANAGE, ROLES_MANAGE],
    });
    expect(res.status).toBe(201);
    expect(res.body.role.permisos).toEqual([USERS_MANAGE, ROLES_MANAGE].sort());
  });

  it('roles-only actor can create role with roles:manage only', async () => {
    const rolesOnlyRoleId = await createRole('rolesOnlyR5', [ROLES_MANAGE]);
    await createUser('actorr5@example.com', 'Password12345!', rolesOnlyRoleId);
    const { cookie, csrf } = await login('actorr5@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'newroleR5', permisos: [ROLES_MANAGE],
    });
    expect(res.status).toBe(201);
  });

  it('unknown permission -> 400', async () => {
    const bothRoleId = await createRole('bothR6', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr6@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorr6@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'badpermrole', permisos: ['auth:super:admin'],
    });
    expect(res.status).toBe(400);
  });

  it('duplicate permission in array -> 400', async () => {
    const bothRoleId = await createRole('bothR7', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr7@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorr7@example.com', 'Password12345!');
    const res = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'duppermrole', permisos: [ROLES_MANAGE, ROLES_MANAGE],
    });
    expect(res.status).toBe(400);
  });

  it('duplicate role name -> 409', async () => {
    const bothRoleId = await createRole('bothR8', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr8@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorr8@example.com', 'Password12345!');
    const first = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'duprolename', permisos: [ROLES_MANAGE],
    });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/roles').set(authHeaders(cookie, csrf)).send({
      nombre: 'duprolename', permisos: [ROLES_MANAGE],
    });
    expect(second.status).toBe(409);
  });

  it('roles-only cannot edit existing both role', async () => {
    const rolesOnlyRoleId = await createRole('rolesOnlyR9', [ROLES_MANAGE]);
    const bothRoleId = await createRole('bothExistingR9', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr9@example.com', 'Password12345!', rolesOnlyRoleId);
    const { cookie, csrf } = await login('actorr9@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/roles/${bothRoleId}`).set(authHeaders(cookie, csrf)).send({
      nombre: 'renamed',
    });
    expect(res.status).toBe(403);
  });

  it('roles-only cannot grant users:manage via PATCH', async () => {
    const rolesOnlyRoleId = await createRole('rolesOnlyR10', [ROLES_MANAGE]);
    const targetRoleId = await createRole('targetR10', [ROLES_MANAGE]);
    await createUser('actorr10@example.com', 'Password12345!', rolesOnlyRoleId);
    const { cookie, csrf } = await login('actorr10@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/roles/${targetRoleId}`).set(authHeaders(cookie, csrf)).send({
      permisos: [USERS_MANAGE],
    });
    expect(res.status).toBe(403);
  });

  it('PATCH unknown permission -> 400', async () => {
    const bothRoleId = await createRole('bothR11', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr11@example.com', 'Password12345!', bothRoleId);
    const targetRoleId = await createRole('targetR11', [ROLES_MANAGE]);
    const { cookie, csrf } = await login('actorr11@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/roles/${targetRoleId}`).set(authHeaders(cookie, csrf)).send({
      permisos: ['auth:super:admin'],
    });
    expect(res.status).toBe(400);
  });

  it('grant change revokes all role users sessions including current actor', async () => {
    const bothRoleId = await createRole('bothR12', [USERS_MANAGE, ROLES_MANAGE]);
    await createUser('actorr12@example.com', 'Password12345!', bothRoleId);
    await createUser('actorr12b@example.com', 'Password12345!', bothRoleId);
    const login1 = await login('actorr12@example.com', 'Password12345!');
    const login2 = await login('actorr12b@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/roles/${bothRoleId}`).set(authHeaders(login1.cookie, login1.csrf)).send({
      permisos: [ROLES_MANAGE],
    });
    expect(res.status).toBe(200);
    const me1 = await request(app).get('/api/auth/me').set('Cookie', login1.cookie);
    const me2 = await request(app).get('/api/auth/me').set('Cookie', login2.cookie);
    expect(me1.status).toBe(401);
    expect(me2.status).toBe(401);
  });

  it('audit actor userId from session, not body; no PII/password/token in detail', async () => {
    const bothRoleId = await createRole('bothR13', [USERS_MANAGE, ROLES_MANAGE]);
    const actor = await createUser('actorr13@example.com', 'Password12345!', bothRoleId);
    const targetRoleId = await createRole('targetR13', [ROLES_MANAGE]);
    const { cookie, csrf } = await login('actorr13@example.com', 'Password12345!');
    const res = await request(app).patch(`/api/roles/${targetRoleId}`).set(authHeaders(cookie, csrf)).send({
      permisos: [ROLES_MANAGE],
    });
    expect(res.status).toBe(200);
    const client = await dbPool.connect();
    let rows: Array<{ usuario_id: number | null; detalle: unknown }>;
    try {
      const r = await client.query<{ usuario_id: number | null; detalle: unknown }>(
        "SELECT usuario_id, detalle FROM auditoria WHERE accion='role_update' ORDER BY id DESC LIMIT 1"
      );
      rows = r.rows;
    } finally {
      client.release();
    }
    expect(rows.length).toBe(1);
    expect(rows[0].usuario_id).toBe(actor.id);
    const serialized = JSON.stringify(rows[0].detalle);
    expect(serialized).not.toMatch(/Password12345!|csrfToken|sessionToken|token/i);
  });

  it('atomic rollback on conflict during role update', async () => {
    const bothRoleId = await createRole('bothR14', [USERS_MANAGE, ROLES_MANAGE]);
    const roleA = await createRole('roleA14', [ROLES_MANAGE]);
    const roleB = await createRole('roleB14', [ROLES_MANAGE]);
    await createUser('actorr14@example.com', 'Password12345!', bothRoleId);
    const { cookie, csrf } = await login('actorr14@example.com', 'Password12345!');
    const before = await dbPool.query<{ permiso_codigo: string }>(
      'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1', [roleA]
    );
    const beforeCodes = before.rows.map((r) => r.permiso_codigo).sort();
    const res = await request(app).patch(`/api/roles/${roleA}`).set(authHeaders(cookie, csrf)).send({
      nombre: 'roleB14',
      permisos: [USERS_MANAGE, ROLES_MANAGE],
    });
    expect(res.status).toBe(409);
    const after = await dbPool.query<{ permiso_codigo: string }>(
      'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1', [roleA]
    );
    const afterCodes = after.rows.map((r) => r.permiso_codigo).sort();
    expect(afterCodes).toEqual(beforeCodes);
  });
});

describe('authorization - bootstrapAuth', () => {
  const DEV_EMAIL = 'devbootstrap@example.com';
  const DEV_PASSWORD = 'Password12345!';

  function baseEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
      NODE_ENV: 'development',
      BOOTSTRAP_AUTH_CONFIRM: 'create-development-admin',
      BOOTSTRAP_AUTH_EMAIL: DEV_EMAIL,
      BOOTSTRAP_AUTH_PASSWORD: DEV_PASSWORD,
      ...extra,
    };
  }

  it('rejects non-development nodeEnv', async () => {
    await expect(
      bootstrapAuth(
        { env: baseEnv({ NODE_ENV: 'production' }), nodeEnv: 'production', confirm: 'create-development-admin' },
        dbPool
      )
    ).rejects.toThrow();
    await expect(
      bootstrapAuth(
        { env: baseEnv({ NODE_ENV: 'test' }), nodeEnv: 'test', confirm: 'create-development-admin' },
        dbPool
      )
    ).rejects.toThrow();
  });

  it('requires explicit confirmation', async () => {
    await expect(
      bootstrapAuth({ env: baseEnv(), nodeEnv: 'development', confirm: 'nope' }, dbPool)
    ).rejects.toThrow();
    await expect(
      bootstrapAuth({ env: { ...baseEnv(), BOOTSTRAP_AUTH_CONFIRM: undefined }, nodeEnv: 'development' }, dbPool)
    ).rejects.toThrow();
  });

  it('rejects empty/invalid credentials', async () => {
    await expect(
      bootstrapAuth({ env: baseEnv({ BOOTSTRAP_AUTH_EMAIL: '' }), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool)
    ).rejects.toThrow();
    await expect(
      bootstrapAuth({ env: baseEnv({ BOOTSTRAP_AUTH_PASSWORD: '' }), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool)
    ).rejects.toThrow();
    await expect(
      bootstrapAuth({ env: baseEnv({ BOOTSTRAP_AUTH_EMAIL: 'not-an-email' }), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool)
    ).rejects.toThrow();
    await expect(
      bootstrapAuth({ env: baseEnv({ BOOTSTRAP_AUTH_PASSWORD: 'short' }), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool)
    ).rejects.toThrow();
  });

  it('creates exactly one role with exact two auth grants, no legacy elevations', async () => {
    const result = await bootstrapAuth(
      { env: baseEnv(), nodeEnv: 'development', confirm: 'create-development-admin' },
      dbPool
    );
    expect(typeof result.userId).toBe('number');
    expect(typeof result.roleId).toBe('number');

    const roleRow = await dbPool.query<{ nombre: string }>('SELECT nombre FROM roles WHERE id = $1', [result.roleId]);
    expect(roleRow.rows[0].nombre).toBe('SGPM_AUTH_DEVELOPMENT');

    const grants = await dbPool.query<{ permiso_codigo: string }>(
      'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1', [result.roleId]
    );
    expect(grants.rows.map((r) => r.permiso_codigo).sort()).toEqual([USERS_MANAGE, ROLES_MANAGE].sort());

    const legacy = await dbPool.query<{ c: string }>(
      'SELECT count(*)::text AS c FROM rol_permiso WHERE rol_id = $1', [result.roleId]
    );
    expect(Number(legacy.rows[0].c)).toBe(0);

    const seedUser = await dbPool.query<{ password_hash: string }>(
      "SELECT password_hash FROM usuarios WHERE email='admin@sgpm.local'"
    );
    if (seedUser.rows.length > 0) {
      expect(seedUser.rows[0].password_hash).toContain('placeholder');
    }
  });

  it('rerun with existing email/role -> 409, no overwrite, transaction rollback', async () => {
    await bootstrapAuth({ env: baseEnv(), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool);

    const roleCountBefore = (await dbPool.query<{ c: string }>("SELECT count(*)::text AS c FROM roles WHERE nombre='SGPM_AUTH_DEVELOPMENT'")).rows[0].c;
    const userCountBefore = (await dbPool.query<{ c: string }>("SELECT count(*)::text AS c FROM usuarios WHERE email=$1", [DEV_EMAIL])).rows[0].c;

    await expect(
      bootstrapAuth({ env: baseEnv(), nodeEnv: 'development', confirm: 'create-development-admin' }, dbPool)
    ).rejects.toThrow();

    const roleCountAfter = (await dbPool.query<{ c: string }>("SELECT count(*)::text AS c FROM roles WHERE nombre='SGPM_AUTH_DEVELOPMENT'")).rows[0].c;
    const userCountAfter = (await dbPool.query<{ c: string }>("SELECT count(*)::text AS c FROM usuarios WHERE email=$1", [DEV_EMAIL])).rows[0].c;
    expect(roleCountAfter).toBe(roleCountBefore);
    expect(userCountAfter).toBe(userCountBefore);
  });
});

describe('authorization - canGrant helper', () => {
  it('subset checks', () => {
    expect(canGrant([USERS_MANAGE, ROLES_MANAGE], [USERS_MANAGE])).toBe(true);
    expect(canGrant([ROLES_MANAGE], [USERS_MANAGE])).toBe(false);
    expect(canGrant([USERS_MANAGE, ROLES_MANAGE], [USERS_MANAGE, ROLES_MANAGE])).toBe(true);
    expect(canGrant([], [])).toBe(true);
  });
});

describe('authorization - fresh context helper', () => {
  it('getCurrentAuthContext reflects DB grants', async () => {
    const roleId = await createRole('ctxRole', [USERS_MANAGE]);
    const u = await createUser('ctx@example.com', 'Password12345!', roleId);
    const ctx1 = await getCurrentAuthContext(u.id);
    expect(ctx1!.grants).toContain(USERS_MANAGE);
    await dbPool.query('DELETE FROM auth_role_permissions WHERE rol_id = $1', [roleId]);
    const ctx2 = await getCurrentAuthContext(u.id);
    expect(ctx2!.grants).not.toContain(USERS_MANAGE);
  });
});
