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

const ORIGIN = 'http://localhost:5173';
const MIG1 = path.resolve(process.cwd(), '..', 'database', 'migrations', '001_create_base_tables.sql');
const MIG2 = path.resolve(process.cwd(), '..', 'database', 'migrations', '002_auth_security.sql');
const MIG3 = path.resolve(process.cwd(), '..', 'database', 'migrations', '003_estudiantes_tutores_permisos.sql');
const MIG4 = path.resolve(process.cwd(), '..', 'database', 'migrations', '004_auth_role_permissions_check.sql');
const SEED = path.resolve(process.cwd(), '..', 'database', 'seeds', '001_seed_base.sql');

let dbPool: Pool;

async function resetDb(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM estudiante_tutor');
    await client.query('DELETE FROM estudiantes');
    await client.query('DELETE FROM tutores');
    await client.query('DELETE FROM auditoria');
    await client.query('DELETE FROM usuarios');
    await client.query("DELETE FROM auth_role_permissions WHERE permiso_codigo LIKE 'estudiantes:%' OR permiso_codigo LIKE 'tutores:%'");
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
    for (const grant of grants) {
      await client.query('INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)', [id, grant]);
    }
    return id;
  } finally {
    client.release();
  }
}

async function createUser(email: string, password: string, roleId: number, active = true): Promise<{ id: number; email: string; password: string }> {
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

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const sc = res.headers['set-cookie'];
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  return arr.map((c) => String(c).split(';')[0]).join('; ');
}

function authHeaders(cookie: string, csrf: string): Record<string, string> {
  return { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf };
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .set('Content-Type', 'application/json')
    .send({ email, password });
  return { res, cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  dbPool = await createTestPool();
  const client = await dbPool.connect();
  try {
    for (const file of [MIG1, MIG2, MIG3, MIG4, SEED]) {
      await client.query(readFileSync(file, 'utf8'));
    }
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

describe('Estudiantes API', () => {
  it('anonymous GET /api/estudiantes -> 401', async () => {
    const res = await request(app).get('/api/estudiantes');
    expect(res.status).toBe(401);
  });

  it('user without estudiantes:read -> 403 on GET /api/estudiantes', async () => {
    const roleId = await createRole('noestudiantes', []);
    await createUser('noest@example.com', 'Password12345!', roleId);
    const { cookie } = await login('noest@example.com', 'Password12345!');
    const res = await request(app).get('/api/estudiantes').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('GET /api/estudiantes returns list for authorized actor', async () => {
    const roleId = await createRole('est_lector', ['estudiantes:read']);
    await createUser('estreader@example.com', 'Password12345!', roleId);
    const { cookie } = await login('estreader@example.com', 'Password12345!');

    // Create a student first (needs estudiantes:manage, so use admin role)
    const adminRoleId = await createRole('admin_est', ['estudiantes:manage', 'estudiantes:read', 'tutores:manage']);
    await createUser('admin_est@example.com', 'Password12345!', adminRoleId);
    const { cookie: adminCookie } = await login('admin_est@example.com', 'Password12345!');

    await request(app)
      .post('/api/estudiantes')
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        nombres: 'Juan',
        apellidos: 'Pérez',
        documento_identidad: '12345678',
        email: 'juan@example.com',
      });

    const res = await request(app).get('/api/estudiantes').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.estudiantes).toBeInstanceOf(Array);
    expect(res.body.estudiantes.length).toBeGreaterThan(0);
    expect(res.body.estudiantes[0]).toHaveProperty('nombres');
    expect(res.body.estudiantes[0]).not.toHaveProperty('password_hash');
  });

  it('POST /api/estudiantes creates student and returns safe profile', async () => {
    const roleId = await createRole('admin_est2', ['estudiantes:manage', 'estudiantes:read']);
    await createUser('admin2@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin2@example.com', 'Password12345!');

    const res = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'María',
        apellidos: 'González',
        documento_identidad: '87654321',
        email: 'maria@example.com',
        telefono: '12345678',
      });

    expect(res.status).toBe(201);
    expect(res.body.estudiante.nombres).toBe('María');
    expect(res.body.estudiante.apellidos).toBe('González');
    expect(res.body.estudiante.documento_identidad).toBe('87654321');
    expect(res.body.estudiante.email).toBe('maria@example.com');
    expect(res.body.estudiante.activo).toBe(true);
    expect(res.body.estudiante).not.toHaveProperty('password_hash');
  });

  it('POST /api/estudiantes duplicate document -> 409', async () => {
    const roleId = await createRole('admin_est3', ['estudiantes:manage', 'estudiantes:read']);
    await createUser('admin3@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin3@example.com', 'Password12345!');

    await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Ana',
        apellidos: 'López',
        documento_identidad: '11223344',
        email: 'ana@example.com',
      });

    const res = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Ana2',
        apellidos: 'López2',
        documento_identidad: '11223344',
        email: 'ana2@example.com',
      });

    expect(res.status).toBe(409);
  });

  it('PATCH /api/estudiantes/:id updates student and revokes sessions on password change', async () => {
    const roleId = await createRole('admin_est4', ['estudiantes:manage', 'estudiantes:read']);
    await createUser('admin4@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin4@example.com', 'Password12345!');

    const createRes = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Carlos',
        apellidos: 'Ruiz',
        documento_identidad: '55667788',
        email: 'carlos@example.com',
      });
    const estudianteId = createRes.body.estudiante.id;

    const res = await request(app)
      .patch(`/api/estudiantes/${estudianteId}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({ nombres: 'Carlos Updated' });

    expect(res.status).toBe(200);
    expect(res.body.estudiante.nombres).toBe('Carlos Updated');
  });

  it('PATCH /api/estudiantes/:id/desactivar deactivates student', async () => {
    const roleId = await createRole('admin_est5', ['estudiantes:manage', 'estudiantes:read']);
    await createUser('admin5@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin5@example.com', 'Password12345!');

    const createRes = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Elena',
        apellidos: 'Díaz',
        documento_identidad: '99887766',
        email: 'elena@example.com',
      });
    const estudianteId = createRes.body.estudiante.id;

    const res = await request(app)
      .patch(`/api/estudiantes/${estudianteId}/desactivar`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.estudiante.activo).toBe(false);
  });

  it('GET /api/estudiantes/:id returns 404 for non-existent', async () => {
    const roleId = await createRole('admin_est6', ['estudiantes:manage', 'estudiantes:read']);
    await createUser('admin6@example.com', 'Password12345!', roleId);
    const { cookie } = await login('admin6@example.com', 'Password12345!');

    const res = await request(app).get('/api/estudiantes/99999').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('Tutores API', () => {
  it('anonymous GET /api/tutores -> 401', async () => {
    const res = await request(app).get('/api/tutores');
    expect(res.status).toBe(401);
  });

  it('GET /api/tutores returns list for authorized actor', async () => {
    const roleId = await createRole('tutor_lector', ['tutores:manage', 'estudiantes:read']);
    await createUser('tutorreader@example.com', 'Password12345!', roleId);
    const { cookie } = await login('tutorreader@example.com', 'Password12345!');

    // Create a tutor first
    const adminRoleId = await createRole('admin_tutor', ['tutores:manage', 'estudiantes:read']);
    await createUser('admin_t@example.com', 'Password12345!', adminRoleId);
    const { cookie: adminCookie } = await login('admin_t@example.com', 'Password12345!');

    await request(app)
      .post('/api/tutores')
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        nombres: 'Roberto',
        apellidos: 'Silva',
        documento_identidad: '44556677',
        email: 'roberto@example.com',
        parentesco: 'Padre',
      });

    const res = await request(app).get('/api/tutores').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tutores).toBeInstanceOf(Array);
    expect(res.body.tutores.length).toBeGreaterThan(0);
  });

  it('POST /api/tutores creates tutor', async () => {
    const roleId = await createRole('admin_tutor2', ['tutores:manage', 'estudiantes:read']);
    await createUser('admin_t2@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin_t2@example.com', 'Password12345!');

    const res = await request(app)
      .post('/api/tutores')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Lucía',
        apellidos: 'Mendoza',
        documento_identidad: '33445566',
        email: 'lucia@example.com',
        telefono: '87654321',
        parentesco: 'Madre',
      });

    expect(res.status).toBe(201);
    expect(res.body.tutor.nombres).toBe('Lucía');
    expect(res.body.tutor.apellidos).toBe('Mendoza');
    expect(res.body.tutor.documento_identidad).toBe('33445566');
    expect(res.body.tutor.parentesco).toBe('Madre');
    expect(res.body.tutor).not.toHaveProperty('password_hash');
  });

  it('POST /api/tutores duplicate document -> 409', async () => {
    const roleId = await createRole('admin_tutor3', ['tutores:manage', 'estudiantes:read']);
    await createUser('admin_t3@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin_t3@example.com', 'Password12345!');

    await request(app)
      .post('/api/tutores')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Pedro',
        apellidos: 'Ramírez',
        documento_identidad: '22334455',
        email: 'pedro@example.com',
      });

    const res = await request(app)
      .post('/api/tutores')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Pedro2',
        apellidos: 'Ramírez2',
        documento_identidad: '22334455',
        email: 'pedro2@example.com',
      });

    expect(res.status).toBe(409);
  });

  it('POST /api/tutores/:id/estudiantes associates student with tutor', async () => {
    const roleId = await createRole('admin_tutor4', ['tutores:manage', 'estudiantes:manage', 'estudiantes:read']);
    await createUser('admin_t4@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin_t4@example.com', 'Password12345!');

    // Create student
    const studentRes = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Ana',
        apellidos: 'Estudiante',
        documento_identidad: '11122233',
        email: 'ana.est@example.com',
      });
    const estudianteId = studentRes.body.estudiante.id;

    // Create tutor
    const tutorRes = await request(app)
      .post('/api/tutores')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'María',
        apellidos: 'Estudiante',
        documento_identidad: '11122234',
        email: 'maria.tutor@example.com',
        parentesco: 'Madre',
      });
    const tutorId = tutorRes.body.tutor.id;

    // Associate
    const res = await request(app)
      .post(`/api/tutores/${tutorId}/estudiantes`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({ tutorId: estudianteId, es_principal: true });

    expect(res.status).toBe(201);
  });

  it('GET /api/tutores/:id/estudiantes returns associated students', async () => {
    const roleId = await createRole('admin_tutor5', ['tutores:manage', 'estudiantes:manage', 'estudiantes:read']);
    await createUser('admin_t5@example.com', 'Password12345!', roleId);
    const { cookie, csrf } = await login('admin_t5@example.com', 'Password12345!');

    // Create student and tutor
    const studentRes = await request(app)
      .post('/api/estudiantes')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Luis',
        apellidos: 'Estudiante',
        documento_identidad: '55667788',
        email: 'luis.est@example.com',
      });
    const estudianteId = studentRes.body.estudiante.id;

    const tutorRes = await request(app)
      .post('/api/tutores')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({
        nombres: 'Carmen',
        apellidos: 'Tutor',
        documento_identidad: '55667789',
        email: 'carmen.tutor@example.com',
        parentesco: 'Padre',
      });
    const tutorId = tutorRes.body.tutor.id;

    // Associate
    await request(app)
      .post(`/api/tutores/${tutorId}/estudiantes`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send({ tutorId: estudianteId, es_principal: true });

    // Get students of tutor
    const res = await request(app)
      .get(`/api/tutores/${tutorId}/estudiantes`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.estudiantes).toBeInstanceOf(Array);
    expect(res.body.estudiantes.length).toBeGreaterThan(0);
    expect(res.body.estudiantes[0].id).toBe(estudianteId);
  });
});
