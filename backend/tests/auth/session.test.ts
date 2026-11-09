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
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/authCrypto';
import { hashToken } from '../../src/utils/authCrypto';
import { parseCookieHeader, getSessionTokenFromCookieHeader } from '../../src/utils/cookies';
import { SessionRepository } from '../../src/repositories/session.repository';

const ORIGIN = 'http://localhost:5173';
const MIG1 = path.resolve(process.cwd(), '..', 'database', 'migrations', '001_create_base_tables.sql');
const MIG2 = path.resolve(process.cwd(), '..', 'database', 'migrations', '002_auth_security.sql');
const SEED = path.resolve(process.cwd(), '..', 'database', 'seeds', '001_seed_base.sql');

let dbPool: Pool;

async function resetDb(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_sessions');
    await client.query('DELETE FROM auth_login_limits');
    await client.query('DELETE FROM auditoria');
    await client.query('DELETE FROM usuarios');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function createActiveUser(email: string, password: string, active = true): Promise<{ id: number; password: string }> {
  const hash = await hashPassword(password, 12);
  const client = await dbPool.connect();
  try {
    const roleRes = await client.query("SELECT id FROM roles WHERE nombre='ADMIN'");
    const roleId = roleRes.rows[0].id as number;
    const userRes = await client.query(
      'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [email, hash, 'Test', 'User', roleId, active]
    );
    return { id: userRes.rows[0].id as number, password };
  } finally {
    client.release();
  }
}

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const sc = res.headers['set-cookie'];
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  return arr.map((c) => String(c).split(';')[0]).join('; ');
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

describe('SessionRepository (integration, real pool)', () => {
  it('creates and finds a session by token hash', async () => {
    const u = await createActiveUser('repo@example.com', 'Password12345!');
    const repo = new SessionRepository(dbPool);
    const token = 'a'.repeat(64);
    const csrf = 'b'.repeat(64);
    await repo.create({ tokenHash: hashToken(token), userId: u.id, csrfHash: hashToken(csrf), expiresAt: new Date(Date.now() + 3600000) });
    const found = await repo.findByTokenHash(hashToken(token));
    expect(found).not.toBeNull();
    expect(found!.userId).toBe(u.id);
    expect(found!.revokedAt).toBeNull();
  });

  it('revoke marks session revoked', async () => {
    const u = await createActiveUser('repo2@example.com', 'Password12345!');
    const repo = new SessionRepository(dbPool);
    const token = 'c'.repeat(64);
    const csrf = 'd'.repeat(64);
    await repo.create({ tokenHash: hashToken(token), userId: u.id, csrfHash: hashToken(csrf), expiresAt: new Date(Date.now() + 3600000) });
    await repo.revoke(hashToken(token));
    const found = await repo.findByTokenHash(hashToken(token));
    expect(found!.revokedAt).not.toBeNull();
  });
});

describe('cookie helpers (measured-ish unit)', () => {
  it('parseCookieHeader returns null on malformed/duplicate/empty values', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
    expect(parseCookieHeader('a=1; a=2')).toBeNull();
    expect(parseCookieHeader('badname=1')).not.toBeNull();
    expect(parseCookieHeader('x=')).toBeNull();
    expect(parseCookieHeader('!!!bad!!!')).toBeNull();
  });
  it('getSessionTokenFromCookieHeader validates 64-hex', () => {
    const valid = 'a'.repeat(64);
    expect(getSessionTokenFromCookieHeader(`sgpm_session=${valid}`)).toBe(valid);
    expect(getSessionTokenFromCookieHeader('sgpm_session=not-hex')).toBeNull();
    expect(getSessionTokenFromCookieHeader('sgpm_session=' + 'a'.repeat(63))).toBeNull();
  });
});

describe('session lifecycle via HTTP', () => {
  it('login sets cookie flags HttpOnly/SameSite/Path and no sessionToken in JSON', async () => {
    await createActiveUser('life@example.com', 'Password12345!');
    const res = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'life@example.com', password: 'Password12345!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.body).not.toHaveProperty('sessionToken');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const sc = res.headers['set-cookie'];
    const arr = Array.isArray(sc) ? sc : [sc];
    const joined = arr.join('; ');
    expect(joined).toMatch(/HttpOnly/i);
    expect(joined).toMatch(/SameSite=Lax/i);
    expect(joined).toMatch(/Path=\//i);
    // secure false in test
    expect(joined).not.toMatch(/Secure/i);
  });

  it('GET /me returns safe own profile and same CSRF', async () => {
    await createActiveUser('me@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'me@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const csrf = loginRes.body.csrfToken;
    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('me@example.com');
    expect(meRes.body.csrfToken).toBe(csrf);
    expect(meRes.body.user).not.toHaveProperty('passwordHash');
  });

  it('missing/wrong/malformed/duplicate cookies -> 401', async () => {
    // missing
    let r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
    // wrong (valid hex not in DB)
    r = await request(app).get('/api/auth/me').set('Cookie', `sgpm_session=${'f'.repeat(64)}`);
    expect(r.status).toBe(401);
    // malformed
    r = await request(app).get('/api/auth/me').set('Cookie', 'sgpm_session=not-hex');
    expect(r.status).toBe(401);
    // duplicate
    r = await request(app).get('/api/auth/me').set('Cookie', `sgpm_session=${'a'.repeat(64)}; sgpm_session=${'b'.repeat(64)}`);
    expect(r.status).toBe(401);
  });

  it('expired session (manipulated DB) -> 401', async () => {
    await createActiveUser('exp@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'exp@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    // extract raw token from cookie
    const rawToken = cookie.split('=')[1];
    const tokenHash = hashToken(rawToken);
    const client = await dbPool.connect();
    try {
      await client.query(
        "UPDATE auth_sessions SET creado_en = NOW() - INTERVAL '2 hours', expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1",
        [tokenHash]
      );
    } finally {
      client.release();
    }
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('manually revoked session -> 401', async () => {
    await createActiveUser('rev@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'rev@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const rawToken = cookie.split('=')[1];
    const tokenHash = hashToken(rawToken);
    const client = await dbPool.connect();
    try {
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    } finally {
      client.release();
    }
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('deactivated user -> 401', async () => {
    const u = await createActiveUser('deact@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'deact@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const client = await dbPool.connect();
    try {
      await client.query('UPDATE usuarios SET activo = FALSE WHERE id = $1', [u.id]);
    } finally {
      client.release();
    }
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('no cross-user /me exposure (no userId param accepted)', async () => {
    await createActiveUser('a@example.com', 'Password12345!');
    await createActiveUser('b@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'a@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const res = await request(app).get('/api/auth/me?userId=999').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('a@example.com');
  });

  it('DB stores only hash of raw cookie token and csrf hash not plaintext', async () => {
    await createActiveUser('hash@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'hash@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const rawToken = cookie.split('=')[1];
    const csrfToken = loginRes.body.csrfToken;
    const client = await dbPool.connect();
    try {
      const row = await client.query('SELECT token_hash, csrf_hash FROM auth_sessions');
      expect(row.rows[0].token_hash).toBe(hashToken(rawToken));
      expect(row.rows[0].csrf_hash).toBe(hashToken(csrfToken));
      expect(row.rows[0].token_hash).not.toBe(rawToken);
    } finally {
      client.release();
    }
  });

  it('logout without CSRF -> 403; wrong origin -> 403; wrong token -> 403; cross-session CSRF -> 403', async () => {
    await createActiveUser('lo@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'lo@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const csrf = loginRes.body.csrfToken;

    // no csrf header
    let r = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN);
    expect(r.status).toBe(403);

    // wrong origin
    r = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', 'http://evil.com').set('X-CSRF-Token', csrf);
    expect(r.status).toBe(403);

    // wrong csrf token
    r = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', '0'.repeat(64));
    expect(r.status).toBe(403);

    // cross-session CSRF: second login, use first cookie with second csrf
    const loginRes2 = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'lo@example.com', password: 'Password12345!' });
    const cookie2 = cookieFrom(loginRes2);
    const csrf2 = loginRes2.body.csrfToken;
    r = await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', csrf2);
    expect(r.status).toBe(403);
  });

  it('correct logout -> 204, cookie cleared, DB revoked, future /me 401', async () => {
    await createActiveUser('logoutok@example.com', 'Password12345!');
    const loginRes = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'logoutok@example.com', password: 'Password12345!' });
    const cookie = cookieFrom(loginRes);
    const csrf = loginRes.body.csrfToken;
    const res = await request(app).post('/api/auth/logout')
      .set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(204);
    const sc = res.headers['set-cookie'];
    const joined = Array.isArray(sc) ? sc.join('; ') : String(sc ?? '');
    expect(joined.toLowerCase()).toMatch(/sgpm_session=|max-age=0|expires=/i);
    const rawToken = cookie.split('=')[1];
    const tokenHash = hashToken(rawToken);
    const client = await dbPool.connect();
    try {
      const row = await client.query('SELECT revoked_at FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
      expect(row.rows[0].revoked_at).not.toBeNull();
    } finally {
      client.release();
    }
    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).toBe(401);
  });

  it('Cache-Control no-store on auth responses', async () => {
    const res = await request(app).post('/api/auth/recovery').set('Origin', ORIGIN).set('Content-Type', 'application/json').send({});
    expect(res.headers['cache-control']).toMatch(/no-store/i);
  });
});