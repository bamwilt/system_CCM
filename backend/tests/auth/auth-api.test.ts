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
import bcrypt from 'bcryptjs';
import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/authCrypto';
import { hashToken, rateBucketKey } from '../../src/utils/authCrypto';
import { parseCookieHeader } from '../../src/utils/cookies';
import { env } from '../../src/config/env';

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

async function loginReq(email: string, password: string, extraHeaders: Record<string, string> = {}) {
  let r = request(app).post('/api/auth/login').set('Content-Type', 'application/json');
  if (extraHeaders.Origin) r = r.set('Origin', extraHeaders.Origin);
  else r = r.set('Origin', ORIGIN);
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (k !== 'Origin') r = r.set(k, v);
  }
  return r.send({ email, password });
}

describe('login success and data exposure', () => {
  it('returns 200 with user+csrfToken, no sessionToken/passwordHash/secret; DB hash only', async () => {
    await createActiveUser('succ@example.com', 'Password12345!');
    const res = await loginReq('succ@example.com', 'Password12345!');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('succ@example.com');
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body).not.toHaveProperty('sessionToken');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|secret/i);
  });
});

describe('invalid credentials generic', () => {
  it('unknown user and wrong password produce identical 401 body', async () => {
    await createActiveUser('known@example.com', 'Password12345!');
    const r1 = await loginReq('nope@example.com', 'WrongPassword123!');
    const r2 = await loginReq('known@example.com', 'WrongPassword123!');
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r1.body).toEqual(r2.body);
  });

  it('placeholder/invalid hash user cannot authenticate', async () => {
    const client = await dbPool.connect();
    try {
      const roleRes = await client.query("SELECT id FROM roles WHERE nombre='ADMIN'");
      const roleId = roleRes.rows[0].id as number;
      await client.query(
        'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1,$2,$3,$4,$5,$6)',
        ['placeholder@example.com', 'not-a-valid-hash', 'T', 'U', roleId, true]
      );
    } finally {
      client.release();
    }
    const res = await loginReq('placeholder@example.com', 'Password12345!');
    expect(res.status).toBe(401);
  });

  it('SQL injection email never authenticates', async () => {
    await createActiveUser('victim@example.com', 'Password12345!');
    const res = await loginReq("' OR 1=1 --", 'Password12345!');
    expect(res.status).toBe(401);
  });
});

describe('audit redaction', () => {
  it('login_failure/success/logout audit has no PII/password/token', async () => {
    await createActiveUser('audit@example.com', 'Password12345!');
    await loginReq('audit@example.com', 'WrongPassword123!');
    const lr = await loginReq('audit@example.com', 'Password12345!');
    const cookie = cookieFrom(lr);
    const csrf = lr.body.csrfToken;
    await request(app).post('/api/auth/logout')
      .set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', csrf);
    const client = await dbPool.connect();
    let rows;
    try {
      rows = await client.query('SELECT accion, detalle FROM auditoria ORDER BY id');
    } finally {
      client.release();
    }
    const serialized = JSON.stringify(rows.rows);
    expect(serialized).not.toMatch(/audit@example\.com/i);
    expect(serialized).not.toMatch(/Password12345!/);
    expect(serialized).not.toMatch(/csrfToken|sessionToken/i);
    const actions = rows.rows.map((r: { accion: string }) => r.accion);
    expect(actions).toContain('login_failure');
    expect(actions).toContain('login_success');
    expect(actions).toContain('logout');
  });
});

describe('malformed and oversize payloads', () => {
  it('malformed JSON -> 400 BAD_REQUEST', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send('{ bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('oversize payload -> 413', async () => {
    const big = 'a'.repeat(1200000);
    const res = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'x@y.com', password: big });
    expect(res.status).toBe(413);
  });
});

describe('recovery', () => {
  it('recovery uniform 503 no echo/token', async () => {
    const r1 = await request(app).post('/api/auth/recovery')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({ email: 'foo@bar.com' });
    expect(r1.status).toBe(503);
    expect(JSON.stringify(r1.body)).not.toMatch(/foo@bar\.com/i);
    const r2 = await request(app).post('/api/auth/recovery')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .send({});
    expect(r2.status).toBe(503);
  });
});

describe('rate limiting (identity)', () => {
  it('5 failures then 429 with Retry-After; successful login resets', { timeout: 30000 }, async () => {
    await createActiveUser('rl@example.com', 'Password12345!');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await loginReq('rl@example.com', 'WrongPassword123!');
      statuses.push(r.status);
      if (r.status === 429) {
        expect(r.headers['retry-after']).toBeDefined();
      }
    }
    expect(statuses.slice(0, 5)).toEqual(Array(5).fill(401));
    expect(statuses[5]).toBe(429);

    // reset: new user to avoid blocked state
    await resetDb();
    await createActiveUser('rl2@example.com', 'Password12345!');
    // 3 failures
    for (let i = 0; i < 3; i++) await loginReq('rl2@example.com', 'WrongPassword123!');
    const ok = await loginReq('rl2@example.com', 'Password12345!');
    expect(ok.status).toBe(200);
    const after = await loginReq('rl2@example.com', 'WrongPassword123!');
    expect(after.status).toBe(401);
  });

  it('expired window with future blocked_until still 429 (repro suspected reset bug)', { timeout: 30000 }, async () => {
    const email = 'expiredwin@example.com';
    await createActiveUser(email, 'Password12345!');
    const key = rateBucketKey({ prefix: 'identity', value: email.toLowerCase(), secret: env.auth.rateKey });
    const client = await dbPool.connect();
    try {
      await client.query(
        "INSERT INTO auth_login_limits (bucket_key, window_start, attempts, blocked_until) VALUES ($1, NOW() - INTERVAL '16 minutes', 5, NOW() + INTERVAL '1 minute')",
        [key]
      );
    } finally {
      client.release();
    }
    const res = await loginReq(email, 'WrongPassword123!');
    expect(res.status).toBe(429);
  });

  it('concurrency same identity: <=5 password checks + >=2 rate 429', { timeout: 30000 }, async () => {
    await createActiveUser('conc@example.com', 'Password12345!');
    const spy = vi.spyOn(bcrypt, 'compare');
    spy.mockClear();
    const results = await Promise.all(
      Array.from({ length: 7 }, () => loginReq('conc@example.com', 'WrongPassword123!'))
    );
    const statuses = results.map((r) => r.status);
    const rl = statuses.filter((s) => s === 429).length;
    const unauthorized = statuses.filter((s) => s === 401).length;
    expect(rl).toBeGreaterThanOrEqual(2);
    expect(unauthorized).toBeLessThanOrEqual(5);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    spy.mockRestore();
  });

  it('IP limit consumed before bcrypt (11th request 429)', { timeout: 30000 }, async () => {
    await createActiveUser('ip@example.com', 'Password12345!');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await loginReq('ip@example.com', 'WrongPassword123!');
      statuses.push(r.status);
    }
    expect(statuses[10]).toBe(429);
  });
});

describe('anti-enumeration', () => {
  it('invalid password format (short/over72) uses dummy bcrypt equally for known vs unknown', async () => {
    await createActiveUser('ae@example.com', 'Password12345!');
    const spy = vi.spyOn(bcrypt, 'compare');

    spy.mockClear();
    const rKnownShort = await loginReq('ae@example.com', 'short');
    const knownShortCalls = spy.mock.calls.length;

    spy.mockClear();
    const rUnknownShort = await loginReq('unknown-ae@example.com', 'short');
    const unknownShortCalls = spy.mock.calls.length;

    expect(rKnownShort.status).toBe(rUnknownShort.status);
    expect(knownShortCalls).toBe(unknownShortCalls);

    const longPw = 'a'.repeat(73);
    spy.mockClear();
    const rKnownLong = await loginReq('ae@example.com', longPw);
    const knownLongCalls = spy.mock.calls.length;

    spy.mockClear();
    const rUnknownLong = await loginReq('unknown-ae2@example.com', longPw);
    const unknownLongCalls = spy.mock.calls.length;

    expect(rKnownLong.status).toBe(rUnknownLong.status);
    expect(knownLongCalls).toBe(unknownLongCalls);

    spy.mockRestore();
  });
});

describe('CSRF and origin', () => {
  it('login requires Origin and JSON content type', async () => {
    await createActiveUser('csrflogin@example.com', 'Password12345!');
    const noOrigin = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'csrflogin@example.com', password: 'Password12345!' });
    expect(noOrigin.status).toBe(403);

    const notJson = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send('email=csrflogin@example.com&password=Password12345!');
    expect(notJson.status).toBe(400);
  });

  it('random userID header cannot override actor', async () => {
    await createActiveUser('fake@example.com', 'Password12345!');
    const lr = await request(app).post('/api/auth/login')
      .set('Origin', ORIGIN).set('Content-Type', 'application/json')
      .set('X-User-Id', '999')
      .send({ email: 'fake@example.com', password: 'Password12345!' });
    expect(lr.status).toBe(200);
    const cookie = cookieFrom(lr);
    const me = await request(app).get('/api/auth/me')
      .set('Cookie', cookie).set('X-User-Id', '999');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('fake@example.com');
  });
});

describe('production cookie flags (unit via parseEnv)', () => {
  it('secure true in production and cookie helpers handle invalid headers', async () => {
    const { parseEnv } = await import('../../src/config/env.js');
    const envProd = parseEnv({
      NODE_ENV: 'production',
      DB_HOST: 'h', DB_NAME: 'n', DB_USER: 'u',
      DB_PASSWORD: 'Sup3rStr0ngDbP4ssphrase9876543210',
      CORS_ORIGIN: 'https://app.example.com',
      AUTH_RATE_KEY: 'z'.repeat(32),
    } as NodeJS.ProcessEnv);
    expect(envProd.auth.cookie.secure).toBe(true);
    expect(envProd.auth.cookie.httpOnly).toBe(true);
    expect(parseCookieHeader('totally invalid !!!')).toBeNull();
  });
});

describe('health regression (via app)', () => {
  it('health/ready/notFound', async () => {
    const h = await request(app).get('/api/health');
    expect([200, 503]).toContain(h.status);
    expect(h.body).toHaveProperty('status');
    const r = await request(app).get('/api/ready');
    expect([200, 503]).toContain(r.status);
    const nf = await request(app).get('/api/nonexistent');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
  });
});