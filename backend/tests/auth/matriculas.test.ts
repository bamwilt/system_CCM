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
import { Pool, PoolClient } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';
import app from '../../src/app';
import { hashPassword, hashToken } from '../../src/utils/authCrypto';

const ORIGIN = 'http://localhost:5173';
const MIG_DIR = path.resolve(process.cwd(), '..', 'database', 'migrations');
const MIG_FILES = [
  '001_create_base_tables.sql',
  '002_auth_security.sql',
  '003_estudiantes_tutores_permisos.sql',
  '004_auth_role_permissions_check.sql',
  '005_matriculas_permisos.sql',
  '006_auth_role_permissions_matriculas.sql',
  '007_fase5_integridad.sql',
  '008_fase5_cierre.sql',
].map((f) => path.resolve(MIG_DIR, f));
const SEED = path.resolve(process.cwd(), '..', 'database', 'seeds', '001_seed_base.sql');

let dbPool: Pool;

async function applyMigrations(client: PoolClient): Promise<void> {
  for (const file of MIG_FILES) {
    await client.query(readFileSync(file, 'utf8'));
  }
}

async function resetDb(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    // El estado de rate-limit es efímero del cluster de test: se reinicia en cada
    // prueba para que los logins de actor() no fallen por buckets bloqueados
    // dejados por ejecuciones previas.
    await client.query('DELETE FROM auth_login_limits');
    await client.query('DELETE FROM mensualidades');
    await client.query('DELETE FROM planes_pago');
    await client.query('DELETE FROM matriculas');
    await client.query('DELETE FROM estudiante_tutor');
    await client.query('DELETE FROM estudiantes');
    await client.query('DELETE FROM tutores');
    await client.query('DELETE FROM auditoria');
    await client.query('DELETE FROM usuarios');
    await client.query("DELETE FROM auth_role_permissions WHERE permiso_codigo LIKE 'estudiantes:%' OR permiso_codigo LIKE 'tutores:%' OR permiso_codigo LIKE 'matriculas:%'");
    await client.query("DELETE FROM roles WHERE nombre NOT IN ('ADMIN','COBRADOR','DIRECTOR','CONSULTA')");
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function ensurePermisos(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO permisos (codigo, descripcion) VALUES
        ('estudiantes:manage', 'Gestionar estudiantes'),
        ('estudiantes:read', 'Leer estudiantes'),
        ('tutores:manage', 'Gestionar tutores'),
        ('matriculas:manage', 'Gestionar matrículas'),
        ('matriculas:read', 'Leer matrículas')
      ON CONFLICT (codigo) DO NOTHING
    `);
    await client.query(`
      INSERT INTO auth_role_permissions (rol_id, permiso_codigo)
      SELECT r.id, p.codigo
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'ADMIN'
        AND p.codigo IN ('auth:users:manage','auth:roles:manage','estudiantes:manage','estudiantes:read','tutores:manage','matriculas:manage','matriculas:read')
      ON CONFLICT DO NOTHING
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function createRole(name: string, grants: string[] = []): Promise<number> {
  const client = await dbPool.connect();
  try {
    const r = await client.query<{ id: number }>('INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id', [name, null]);
    const id = r.rows[0].id;
    for (const grant of grants) {
      await client.query('INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)', [id, grant]);
    }
    return id;
  } finally {
    client.release();
  }
}

async function createUser(email: string, password: string, roleId: number, active = true): Promise<number> {
  const hash = await hashPassword(password, 12);
  const client = await dbPool.connect();
  try {
    const r = await client.query<{ id: number }>(
      'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [email, hash, 'Test', 'User', roleId, active]
    );
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

function hdrs(cookie: string, csrf: string): Record<string, string> {
  return { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf };
}

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send({ email, password });
  return { res, cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

async function actor(grants: string[] = []) {
  const roleId = await createRole(`actor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, grants);
  const email = `actor-${roleId}-${Date.now()}@example.com`;
  await createUser(email, 'Password12345!', roleId);
  return login(email, 'Password12345!');
}

async function clientQuery(sql: string, params: unknown[] = []): Promise<any> {
  const client = await dbPool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// Claves de año activo, grado perteneciente y tarifa activa (consulta real, sin ids
// hardcodeados: los seriales de la BD de test avanzan entre ejecuciones).
async function clavesAnioActivo(): Promise<{ anioId: number; gradoId: number; tarifaId: number; monto: string; moneda: string }> {
  const anio = await clientQuery('SELECT id FROM anio_lectivo WHERE activo = TRUE LIMIT 1');
  if (anio.rows.length === 0) throw new Error('no hay año lectivo activo');
  const grado = await clientQuery('SELECT id FROM grados WHERE anio_lectivo_id = $1 LIMIT 1', [anio.rows[0].id]);
  if (grado.rows.length === 0) throw new Error('no hay grado para el año activo');
  const tarifa = await clientQuery('SELECT id, monto::text AS monto, moneda FROM tarifas WHERE anio_lectivo_id = $1 AND activo = TRUE ORDER BY id LIMIT 1', [anio.rows[0].id]);
  if (tarifa.rows.length === 0) throw new Error('no hay tarifa activa para el año activo');
  return { anioId: anio.rows[0].id, gradoId: grado.rows[0].id, tarifaId: tarifa.rows[0].id, monto: tarifa.rows[0].monto, moneda: tarifa.rows[0].moneda };
}

async function crearEstudiantePorApi(cookie: string, csrf: string, sufijo = ''): Promise<number> {
  const res = await request(app).post('/api/estudiantes').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
    nombres: `Estudiante${sufijo}`, apellidos: 'Apellido', documento_identidad: `D${Date.now()}${sufijo}`, email: `est${Date.now()}${sufijo}@x.com`,
  });
  expect(res.status).toBe(201);
  return res.body.estudiante.id;
}

async function crearTutorPorApi(cookie: string, csrf: string, sufijo = ''): Promise<number> {
  const res = await request(app).post('/api/tutores').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
    nombres: `Tutor${sufijo}`, apellidos: 'Apellido', documento_identidad: `T${Date.now()}${sufijo}`, email: `tut${Date.now()}${sufijo}@x.com`, parentesco: 'Madre',
  });
  expect(res.status).toBe(201);
  return res.body.tutor.id;
}

async function asociarTutorPorApi(cookie: string, csrf: string, tutorId: number, estudianteId: number): Promise<void> {
  const res = await request(app)
    .post(`/api/tutores/${tutorId}/estudiantes`)
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({ estudiante_id: estudianteId, es_principal: true });
  expect(res.status).toBe(201);
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  dbPool = await createTestPool();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await applyMigrations(client);
    await client.query(readFileSync(SEED, 'utf8'));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
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
  await ensurePermisos();
});

describe('Matrículas API', () => {
  const GRANTS = ['matriculas:manage', 'matriculas:read', 'estudiantes:manage', 'estudiantes:read', 'tutores:manage'];

  it('anonymous GET /api/matriculas -> 401', async () => {
    const res = await request(app).get('/api/matriculas');
    expect(res.status).toBe(401);
  });

  it('user without matriculas:read -> 403 on GET /api/matriculas', async () => {
    const roleId = await createRole('no-matriculas-read', []);
    await createUser('no-matriculas-read@example.com', 'Password12345!', roleId);
    const { cookie } = await login('no-matriculas-read@example.com', 'Password12345!');
    const res = await request(app).get('/api/matriculas').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('POST without CSRF header -> 403', async () => {
    const { cookie } = await actor(GRANTS);
    const res = await request(app).post('/api/matriculas').set('Cookie', cookie).set('Origin', ORIGIN).set('Content-Type', 'application/json').send({});
    expect(res.status).toBe(403);
  });

  it('POST with wrong Origin -> 403', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const res = await request(app).post('/api/matriculas').set('Cookie', cookie).set('Origin', 'http://evil.example.com').set('Content-Type', 'application/json').set('X-CSRF-Token', csrf).send({});
    expect(res.status).toBe(403);
  });

  it('POST with malformed CSRF token -> 403', async () => {
    const { cookie } = await actor(GRANTS);
    const res = await request(app).post('/api/matriculas').set('Cookie', cookie).set('Origin', ORIGIN).set('Content-Type', 'application/json').set('X-CSRF-Token', 'not-hex').send({});
    expect(res.status).toBe(403);
  });

  it('POST with revoked session -> 401', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const token = cookie.split(';').find((c) => c.trim().startsWith('sgpm_session='))?.split('=')[1] ?? '';
    await clientQuery('UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1', [hashToken(token)]);
    const res = await request(app).get('/api/matriculas').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('POST with expired session -> 401', async () => {
    const { cookie } = await actor(GRANTS);
    const token = cookie.split(';').find((c) => c.trim().startsWith('sgpm_session='))?.split('=')[1] ?? '';
    // auth_sessions_expiry_check exige expires_at > creado_en, por eso se retrotrae creado_en también.
    await clientQuery('UPDATE auth_sessions SET creado_en = $1, expires_at = $2 WHERE token_hash = $3', ['2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z', hashToken(token)]);
    const res = await request(app).get('/api/matriculas').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('POST N10 -> 201, 1 matricula, 1 plan, 10 cuotas, auditoria y snapshot tarifario', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId, monto, moneda } = await clavesAnioActivo();

    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'n10');
    const tutorId = await crearTutorPorApi(cookie, csrf, 'n10');

    await asociarTutorPorApi(cookie, csrf, tutorId, estudianteId);

    const fechas: string[] = [];
    for (let m = 2; m <= 11; m++) {
      fechas.push(`2026-${String(m).padStart(2, '0')}-15`);
    }
    expect(fechas).toHaveLength(10);

    const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId,
      anio_lectivo_id: anioId,
      grado_id: gradoId,
      tutor_id: tutorId,
      fecha_matricula: '2026-02-01',
      estado: 'ACTIVA',
      observaciones: 'Matrícula N10',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: fechas },
    });

    expect(res.status).toBe(201);
    expect(res.body.matricula.estudiante_id).toBe(estudianteId);
    expect(res.body.matricula.estado).toBe('ACTIVA');
    expect(res.body.plan_pago_id).toBeDefined();
    expect(typeof res.body.plan_pago_id).toBe('number');
    expect(res.body.total_cuotas).toBe(10);

    const aud = await clientQuery("SELECT count(*)::int AS c FROM auditoria WHERE entidad = 'matriculas' AND accion = 'matricula_crear'");
    expect(Number(aud.rows[0].c)).toBeGreaterThan(0);

    const snap = await clientQuery('SELECT id, monto::text AS monto, moneda FROM tarifas WHERE id = $1', [tarifaId]);
    expect(snap.rows[0].monto).toBe(monto);
    expect(snap.rows[0].moneda).toBe(moneda);

    const plan = await request(app).get(`/api/matriculas/${res.body.matricula.id}/plan-pago`).set('Cookie', cookie);
    expect(plan.status).toBe(200);
    expect(plan.body.plan_pago_id).toBe(res.body.plan_pago_id);
    expect(plan.body.total_cuotas).toBe(10);
    expect(plan.body.monto_cuota).toBe(monto);
    expect(plan.body.moneda).toBe(moneda);
    expect(plan.body.tarifa_id).toBe(tarifaId);
    expect(plan.body.mensualidades).toHaveLength(10);
    for (const cuota of plan.body.mensualidades) {
      expect(cuota.monto_original).toBe(monto);
      expect(cuota.saldo_pendiente).toBe(monto);
      expect(cuota.estado).toBe('PENDIENTE');
    }
  });

  it('POST idempotency_key replay -> 200 misma matricula/plan y sin filas nuevas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'replay');
    const idempotencyKey = `replay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = {
      estudiante_id: estudianteId,
      anio_lectivo_id: anioId,
      grado_id: gradoId,
      idempotency_key: idempotencyKey,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
    };

    const first = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.idempotent_replay).toBe(false);

    const before = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);

    const replay = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.matricula.id).toBe(first.body.matricula.id);
    expect(replay.body.plan_pago_id).toBe(first.body.plan_pago_id);
    expect(replay.body.total_cuotas).toBe(first.body.total_cuotas);

    const after = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // La auditoria de la creacion NO guarda la clave cruda: solo el hash truncado.
    const aud = await clientQuery(
      `SELECT detalle::text AS detalle FROM auditoria
       WHERE entidad = 'matriculas' AND entidad_id = $1 AND accion = 'matricula_crear'`,
      [first.body.matricula.id]
    );
    expect(aud.rows.length).toBeGreaterThan(0);
    expect(aud.rows[0].detalle).toContain('idempotency_key_hash');
    expect(aud.rows[0].detalle).not.toContain(idempotencyKey);
  });

  it('idempotency_key acotada al actor: otro actor NO recibe la matricula ajena (SEC-02)', async () => {
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const idempotencyKey = `oraculo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Actor A crea la matricula con su clave.
    const a = await actor(GRANTS);
    const estudianteA = await crearEstudiantePorApi(a.cookie, a.csrf, 'oraculo-a');
    const creada = await request(app)
      .post('/api/matriculas')
      .set(hdrs(a.cookie, a.csrf))
      .set('Content-Type', 'application/json')
      .send({
        estudiante_id: estudianteA,
        anio_lectivo_id: anioId,
        grado_id: gradoId,
        idempotency_key: idempotencyKey,
        plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
      });
    expect(creada.status).toBe(201);

    // Actor B (mismo permiso matriculas:manage) reutiliza la clave ajena.
    const b = await actor(GRANTS);
    const reuso = await request(app)
      .post('/api/matriculas')
      .set(hdrs(b.cookie, b.csrf))
      .set('Content-Type', 'application/json')
      .send({
        estudiante_id: estudianteA,
        anio_lectivo_id: anioId,
        grado_id: gradoId,
        idempotency_key: idempotencyKey,
        plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
      });
    // No es un replay del autor B: no se devuelven datos de la matricula ajena
    // y no se reinyecta. Cae en el conflicto de identidad academica (409).
    expect(reuso.status).toBe(409);
    expect(reuso.body.matricula).toBeUndefined();
    expect(reuso.body.plan_pago_id).toBeUndefined();
    expect(reuso.body.idempotent_replay).toBeUndefined();

    const auditoriaAjena = await clientQuery(
      `SELECT count(*)::int AS c FROM auditoria
       WHERE entidad = 'matriculas' AND entidad_id = $1 AND accion = 'matricula_crear_replay'`,
      [creada.body.matricula.id]
    );
    expect(Number(auditoriaAjena.rows[0].c)).toBe(0);
  });

  it('POST idempotency_key reutilizada con otro estudiante -> 409 y sin filas nuevas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteOriginal = await crearEstudiantePorApi(cookie, csrf, 'key-est-a');
    const estudianteDistinto = await crearEstudiantePorApi(cookie, csrf, 'key-est-b');
    const idempotencyKey = `conflicto-estudiante-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base = {
      anio_lectivo_id: anioId,
      grado_id: gradoId,
      idempotency_key: idempotencyKey,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    };

    const first = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, estudiante_id: estudianteOriginal });
    expect(first.status).toBe(201);

    const before = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    const conflict = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, estudiante_id: estudianteDistinto });
    expect(conflict.status).toBe(409);

    const after = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // La auditoria de la creacion NO guarda la clave cruda: solo el hash truncado.
    const aud = await clientQuery(
      `SELECT detalle::text AS detalle FROM auditoria
       WHERE entidad = 'matriculas' AND entidad_id = $1 AND accion = 'matricula_crear'`,
      [first.body.matricula.id]
    );
    expect(aud.rows.length).toBeGreaterThan(0);
    expect(aud.rows[0].detalle).toContain('idempotency_key_hash');
    expect(aud.rows[0].detalle).not.toContain(idempotencyKey);
  });

  it('POST idempotency_key reutilizada con otro grado -> 409 y sin filas nuevas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'key-grado');
    const nombreGrado = `Grado Idempotencia ${Date.now()}`;
    await clientQuery(
      'INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ($1, $2, $3) RETURNING id',
      [nombreGrado, 'Primaria', anioId]
    );
    const gradoDistinto = await clientQuery(
      'SELECT id FROM grados WHERE nombre = $1 AND anio_lectivo_id = $2',
      [nombreGrado, anioId]
    );
    expect(gradoDistinto.rows).toHaveLength(1);
    const idempotencyKey = `conflicto-grado-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base = {
      estudiante_id: estudianteId,
      anio_lectivo_id: anioId,
      idempotency_key: idempotencyKey,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    };

    const first = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, grado_id: gradoId });
    expect(first.status).toBe(201);

    const before = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    const conflict = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, grado_id: gradoDistinto.rows[0].id });
    expect(conflict.status).toBe(409);

    const after = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // La auditoria de la creacion NO guarda la clave cruda: solo el hash truncado.
    const aud = await clientQuery(
      `SELECT detalle::text AS detalle FROM auditoria
       WHERE entidad = 'matriculas' AND entidad_id = $1 AND accion = 'matricula_crear'`,
      [first.body.matricula.id]
    );
    expect(aud.rows.length).toBeGreaterThan(0);
    expect(aud.rows[0].detalle).toContain('idempotency_key_hash');
    expect(aud.rows[0].detalle).not.toContain(idempotencyKey);
  });

  it('POST idempotency_key invalida (vacia, espacios, no-string, 256 chars) -> 400 y sin filas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'key-invalida');
    const invalidKeys: unknown[] = ['', '   ', 12345, 'x'.repeat(256)];

    for (const idempotency_key of invalidKeys) {
      const res = await request(app)
        .post('/api/matriculas')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          estudiante_id: estudianteId,
          anio_lectivo_id: anioId,
          grado_id: gradoId,
          idempotency_key,
          plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
        });
      expect(res.status).toBe(400);
    }

    const counts = await clientQuery(`
      SELECT
        (SELECT count(*)::int FROM matriculas) AS matriculas,
        (SELECT count(*)::int FROM planes_pago) AS planes_pago,
        (SELECT count(*)::int FROM mensualidades) AS mensualidades
    `);
    expect(Number(counts.rows[0].matriculas)).toBe(0);
    expect(Number(counts.rows[0].planes_pago)).toBe(0);
    expect(Number(counts.rows[0].mensualidades)).toBe(0);
  });

  it('GET /api/matriculas/:id/historial -> 200 con plan/cuotas/auditoria', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'historial');
    const created = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        estudiante_id: estudianteId,
        anio_lectivo_id: anioId,
        grado_id: gradoId,
        plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
      });
    expect(created.status).toBe(201);
    const matriculaId = created.body.matricula.id;

    const history = await request(app)
      .get(`/api/matriculas/${matriculaId}/historial`)
      .set('Cookie', cookie);
    expect(history.status).toBe(200);
    expect(history.body.matricula_id).toBe(matriculaId);
    expect(history.body.matricula).toEqual(expect.objectContaining({ id: matriculaId, estudiante_id: estudianteId }));
    expect(history.body.plan_pago).toEqual(expect.objectContaining({ matricula_id: matriculaId, tarifa_id: tarifaId }));
    expect(history.body.mensualidades).toHaveLength(2);
    expect(history.body.cuotas).toHaveLength(2);
    expect(history.body.auditoria).toBeInstanceOf(Array);
    expect(history.body.auditoria.length).toBeGreaterThan(0);
    expect(history.body.auditoria.map((entry: { accion: string }) => entry.accion)).toContain('matricula_crear');
  });

  it('GET /api/matriculas/:id/historial -> 404 para id desconocido', async () => {
    const { cookie } = await actor(GRANTS);
    const unknown = await request(app)
      .get('/api/matriculas/999999999/historial')
      .set('Cookie', cookie);
    expect(unknown.status).toBe(404);
  });

  it('GET /api/matriculas/:id/historial -> 403 para actor sin matriculas:read', async () => {
    const { cookie } = await actor([]);
    const forbidden = await request(app)
      .get('/api/matriculas/1/historial')
      .set('Cookie', cookie);
    expect(forbidden.status).toBe(403);
  });

  it('GET historial tras desactivar conserva las mismas cuotas y auditoria', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'historial-desact');
    const created = await request(app)
      .post('/api/matriculas')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        estudiante_id: estudianteId,
        anio_lectivo_id: anioId,
        grado_id: gradoId,
        plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
      });
    expect(created.status).toBe(201);
    const matriculaId = created.body.matricula.id;

    const before = await request(app)
      .get(`/api/matriculas/${matriculaId}/historial`)
      .set('Cookie', cookie);
    expect(before.status).toBe(200);

    const deactivated = await request(app)
      .patch(`/api/matriculas/${matriculaId}/desactivar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.matricula.estado).toBe('DESACTIVADA');

    const after = await request(app)
      .get(`/api/matriculas/${matriculaId}/historial`)
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.plan_pago).toEqual(before.body.plan_pago);
    expect(after.body.mensualidades.map((cuota: { id: number }) => cuota.id)).toEqual(
      before.body.mensualidades.map((cuota: { id: number }) => cuota.id)
    );
    expect(after.body.mensualidades).toHaveLength(2);
    expect(after.body.cuotas).toHaveLength(2);
    const acciones = after.body.auditoria.map((entry: { accion: string }) => entry.accion);
    expect(acciones).toContain('matricula_crear');
    expect(acciones).toContain('matricula_actualizar');
  });

  it('POST DTO desconocido (campo extra) -> 400', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: 1, anio_lectivo_id: 1, grado_id: 1, campo_inexistente: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('POST IDs inseguros (estudiante_id 0 / negativo / texto) -> 400', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const base = { anio_lectivo_id: 1, grado_id: 1 };
    for (const estudiante_id of [0, -5, 'abc']) {
      const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ ...base, estudiante_id });
      expect(res.status).toBe(400);
    }
  });

  it('POST fecha inválida / duplicada de calendario / sin plan_pago -> 400/409', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'fechas');

    const base = { estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId, plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] } };

    const res1 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ ...base, plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-02-30'] } });
    expect(res1.status).toBe(400);

    const res2 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ ...base, plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-03-10'] } });
    expect(res2.status).toBe(409);

    const res3 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
    });
    expect(res3.status).toBe(400);

    const res4 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ ...base, plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2025-01-01', '2026-03-10'] } });
    expect(res4.status).toBe(400);

    const res5 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ ...base, plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-02-10'] } });
    expect(res5.status).toBe(400);
  });

  it('POST estudiante/año/tarifa/grado inactivos o fuera de año -> 400', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();

    // Estudiante inactivo
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'inact');
    await clientQuery('UPDATE estudiantes SET activo = FALSE WHERE id = $1', [estudianteId]);
    const r1 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r1.status).toBe(400);

    const estudianteValido = await crearEstudiantePorApi(cookie, csrf, 'inact-valido');

    // Año lectivo inactivo (año aparte para no contaminar)
    await clientQuery("INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES (2099, '2099-02-01', '2099-11-30', FALSE) ON CONFLICT (anio) DO NOTHING");
    const anioInactivo = await clientQuery("SELECT id FROM anio_lectivo WHERE anio = 2099 LIMIT 1");
    const r2 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteValido, anio_lectivo_id: anioInactivo.rows[0].id, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2099-03-10'] },
    });
    expect(r2.status).toBe(400);

    // Grado de otro año
    await clientQuery("INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ('Grado X', 'Primaria', (SELECT id FROM anio_lectivo WHERE anio = 2099)) ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING");
    const gradoOtro = await clientQuery("SELECT id FROM grados WHERE anio_lectivo_id = (SELECT id FROM anio_lectivo WHERE anio = 2099) LIMIT 1");
    const r3 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteValido, anio_lectivo_id: anioId, grado_id: gradoOtro.rows[0].id,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r3.status).toBe(400);

    // Tarifa inactiva
    const tarifaInactiva = await clientQuery("INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo) VALUES ('Inactiva', 100.00, 'NIO', $1, FALSE) RETURNING id", [anioId]);
    const r4 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteValido, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaInactiva.rows[0].id, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r4.status).toBe(400);

    // Tarifa de otro año
    await clientQuery("INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES (2098, '2098-02-01', '2098-11-30', TRUE) ON CONFLICT (anio) DO NOTHING");
    const anioOtro = await clientQuery("SELECT id FROM anio_lectivo WHERE anio = 2098 LIMIT 1");
    const tarifaOtroAnio = await clientQuery("INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo) VALUES ('Otro anio', 100.00, 'NIO', $1, TRUE) RETURNING id", [anioOtro.rows[0].id]);
    const r5 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteValido, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaOtroAnio.rows[0].id, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r5.status).toBe(400);
  });

  it('POST tutor no asociado / tutor inactivo -> 400', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'tutor');

    const tutorId = await crearTutorPorApi(cookie, csrf, 'tutor');

    const r1 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId, tutor_id: tutorId,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r1.status).toBe(400);

    const tutor2 = await crearTutorPorApi(cookie, csrf, 'tutor2');
    await clientQuery('UPDATE tutores SET activo = FALSE WHERE id = $1', [tutor2]);
    const r2 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId, tutor_id: tutor2,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(r2.status).toBe(400);
  });

  it('POST monto 0 / negativo -> 400 y sin filas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'monto');

    for (const monto of [0, -50.00]) {
      const tarifa = await clientQuery('INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo) VALUES ($1, $2, $3, $4, TRUE) RETURNING id', [`monto-${monto}`, monto, 'NIO', anioId]);
      const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
        estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
        plan_pago: { tarifa_id: tarifa.rows[0].id, fechas_vencimiento: ['2026-03-10'] },
      });
      expect(res.status).toBe(400);
      const rows = await clientQuery('SELECT count(*)::int AS c FROM planes_pago p JOIN matriculas m ON m.id = p.matricula_id WHERE m.estudiante_id = $1', [estudianteId]);
      expect(Number(rows.rows[0].c)).toBe(0);
    }
  });

  it('POST monto NaN (PG numeric lo admite) -> reproducible FAIL si el servicio lo acepta', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'nan');

    const tarifa = await clientQuery("INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo) VALUES ('NaN tarifa', 'NaN'::numeric, 'NIO', $1, TRUE) RETURNING id", [anioId]);
    const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifa.rows[0].id, fechas_vencimiento: ['2026-03-10'] },
    });
    // Contrato: debe rechazarse sin filas. Si Number(monto) <= 0 admite NaN, el servicio acepta y el test falla (bug reproducido, no se toca prod).
    expect(res.status).not.toBe(201);
    const rows = await clientQuery('SELECT count(*)::int AS c FROM planes_pago p JOIN matriculas m ON m.id = p.matricula_id WHERE m.estudiante_id = $1', [estudianteId]);
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  it('PATCH campo desconocido -> reproducible FAIL si schema no estricto lo acepta', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'patch');

    const mat = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(mat.status).toBe(201);
    const matriculaId = mat.body.matricula.id;

    const res = await request(app).patch(`/api/matriculas/${matriculaId}`).set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estado: 'DESACTIVADA',
      campo_inexistente: 'debe-ser-rechazado',
    });
    // Contrato: PATCH sin .strict() debe rechazar campos desconocidos con 400. Si devuelve 200, bug reproducido (no se toca prod).
    expect(res.status).toBe(400);
  });

  it('PATCH omitidos conserva / nulls solo nullables / identidad con plan -> 409', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'conserva');

    const mat = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
      fecha_matricula: '2026-02-01', observaciones: 'original',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(mat.status).toBe(201);
    const matriculaId = mat.body.matricula.id;

    const patch = await request(app).patch(`/api/matriculas/${matriculaId}`).set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ estado: 'DESACTIVADA' });
    expect(patch.status).toBe(200);

    const detail = await request(app).get(`/api/matriculas/${matriculaId}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.matricula.estado).toBe('DESACTIVADA');
    expect(detail.body.matricula.observaciones).toBe('original');

    const nulls = await request(app).patch(`/api/matriculas/${matriculaId}`).set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ tutor_id: null });
    expect(nulls.status).toBe(200);
    expect(nulls.body.matricula.tutor_id).toBeNull();

    const otroEst = await crearEstudiantePorApi(cookie, csrf, 'otro');
    const ident = await request(app).patch(`/api/matriculas/${matriculaId}`).set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({ estudiante_id: otroEst });
    expect(ident.status).toBe(409);
  });

  it('PATCH desactivar conserva obligaciones e historial', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'desact');

    const mat = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
    });
    expect(mat.status).toBe(201);
    const matriculaId = mat.body.matricula.id;

    const des = await request(app).patch(`/api/matriculas/${matriculaId}/desactivar`).set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({});
    expect(des.status).toBe(200);
    expect(des.body.matricula.estado).toBe('DESACTIVADA');

    const plan = await request(app).get(`/api/matriculas/${matriculaId}/plan-pago`).set('Cookie', cookie);
    expect(plan.status).toBe(200);
    expect(plan.body.mensualidades).toHaveLength(2); // historial de cuotas conservado
  });

  it('GET /api/matriculas/:id -> 404 inexistente', async () => {
    const { cookie } = await actor(GRANTS);
    const res = await request(app).get('/api/matriculas/99999').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('GET listado con filtros activo=false (DESACTIVADA) y paginación', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();

    const e1Id = await crearEstudiantePorApi(cookie, csrf, 'f1');
    const e2Id = await crearEstudiantePorApi(cookie, csrf, 'f2');

    const m1 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: e1Id, anio_lectivo_id: anioId, grado_id: gradoId, estado: 'ACTIVA',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(m1.status).toBe(201);
    const m2 = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
      estudiante_id: e2Id, anio_lectivo_id: anioId, grado_id: gradoId, estado: 'DESACTIVADA',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] },
    });
    expect(m2.status).toBe(201);

    const desactivadas = await request(app).get('/api/matriculas?activo=false').set('Cookie', cookie);
    expect(desactivadas.status).toBe(200);
    expect(desactivadas.body.matriculas).toHaveLength(1);
    expect(desactivadas.body.matriculas[0].estado).toBe('DESACTIVADA');

    const activas = await request(app).get('/api/matriculas?estado=ACTIVA').set('Cookie', cookie);
    expect(activas.status).toBe(200);
    expect(activas.body.matriculas).toHaveLength(1);

    const pag = await request(app).get('/api/matriculas?limite=1').set('Cookie', cookie);
    expect(pag.status).toBe(200);
    expect(pag.body.matriculas).toHaveLength(1);
  });

  it('duplicado concurrente: 2 POST -> 1x201 + 1x409, solo 1 plan con 10 cuotas', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'conc');
    const tutorId = await crearTutorPorApi(cookie, csrf, 'conc');
    await asociarTutorPorApi(cookie, csrf, tutorId, estudianteId);

    const fechas: string[] = [];
    for (let m = 2; m <= 11; m++) fechas.push(`2026-${String(m).padStart(2, '0')}-15`);

    const body = {
      estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId, tutor_id: tutorId,
      fecha_matricula: '2026-02-01', estado: 'ACTIVA',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: fechas },
    };
    const results = await Promise.all([
      request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(body),
      request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(body),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const creado = results.find((r) => r.status === 201)!;
    const matriculaId = creado.body.matricula.id;
    const planes = await clientQuery('SELECT count(*)::int AS c FROM planes_pago WHERE matricula_id = $1', [matriculaId]);
    expect(Number(planes.rows[0].c)).toBe(1);
    const cuotas = await clientQuery('SELECT count(*)::int AS c FROM mensualidades WHERE plan_pago_id = $1', [creado.body.plan_pago_id]);
    expect(Number(cuotas.rows[0].c)).toBe(10);
  });

  it('fallo de cuota via trigger -> ROLLBACK total (cero residuos), cleanup del trigger en finally', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'rb');

    await clientQuery(`CREATE OR REPLACE FUNCTION trg_fail_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo controlado: cuota'; END; $$;`);
    await clientQuery(`CREATE TRIGGER trg_fail_cuota BEFORE INSERT ON mensualidades FOR EACH ROW EXECUTE FUNCTION trg_fail_fn();`);
    try {
      const res = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send({
        estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId,
        plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10', '2026-04-10'] },
      });
      expect(res.status).toBe(500);

      const m = await clientQuery('SELECT count(*)::int AS c FROM matriculas WHERE estudiante_id = $1', [estudianteId]);
      expect(Number(m.rows[0].c)).toBe(0);
      const p = await clientQuery('SELECT count(*)::int AS c FROM planes_pago');
      expect(Number(p.rows[0].c)).toBe(0);
      const mu = await clientQuery('SELECT count(*)::int AS c FROM mensualidades');
      expect(Number(mu.rows[0].c)).toBe(0);
      const aud = await clientQuery("SELECT count(*)::int AS c FROM auditoria WHERE accion = 'matricula_crear'");
      expect(Number(aud.rows[0].c)).toBe(0);
    } finally {
      await clientQuery('DROP TRIGGER IF EXISTS trg_fail_cuota ON mensualidades');
      await clientQuery('DROP FUNCTION IF EXISTS trg_fail_fn()');
    }
  });

  it('POST duplicado estudiante+anio -> 409', async () => {
    const { cookie, csrf } = await actor(GRANTS);
    const { anioId, gradoId, tarifaId } = await clavesAnioActivo();
    const estudianteId = await crearEstudiantePorApi(cookie, csrf, 'dup');

    const body = { estudiante_id: estudianteId, anio_lectivo_id: anioId, grado_id: gradoId, estado: 'ACTIVA',
      plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: ['2026-03-10'] } };

    const primera = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(body);
    expect(primera.status).toBe(201);

    const segunda = await request(app).post('/api/matriculas').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(body);
    expect(segunda.status).toBe(409);
  });
});
