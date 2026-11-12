import { vi } from 'vitest';
vi.hoisted(async () => {
  const { TEST_SOCKET_DIR } = await import('./auth/testEnv.js');
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = TEST_SOCKET_DIR;
  process.env.DB_PORT = '55433';
  process.env.DB_NAME = 'sgpm_auth_test';
  process.env.DB_USER = 'sgpm_test';
  process.env.DB_POOL_MIN = '0';
  process.env.DB_POOL_MAX = '20';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.AUTH_RATE_KEY = 't'.repeat(40);
  process.env.AUTH_IP_RATE_LIMIT_MAX = '10000';
  process.env.AUTH_GLOBAL_RATE_LIMIT_MAX = '100000';
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { Pool, QueryResultRow } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './auth/testDb';
import { closePool } from '../src/config/database';
import app from '../src/app';

/**
 * ============================================================================
 * CATALOGOS PARA EL ALTA DE MATRICULA (FASE 9.B) — PRUEBAS
 * ============================================================================
 *
 * El formulario de matricula pedia los identificadores a mano (id de año, de
 * grado, de tarifa, de estudiante). Eso es informacion de maquina: nadie en un
 * colegio habla asi. Estos endpoints devuelven las LISTAS para elegir.
 *
 * Se verifica que:
 *   - los catalogos se devuelven (año, grados y tarifas);
 *   - la busqueda de estudiantes es parcial e insensible a acentos;
 *   - el monto de la tarifa viaja como TEXTO exacto, no como numero;
 *   - sin permiso no se exponen.
 */

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
  '009_fase7_comprobantes.sql',
  '010_reportes_permisos.sql',
].map((f) => path.resolve(MIG_DIR, f));

const MARCA = 'C7';
const MARCA_LIKE = `${MARCA}-%`;
const ANIO = 2440;
const ANIO_ANCHO = 20;
const GRANTS = [
  'matriculas:manage',
  'matriculas:read',
  'estudiantes:manage',
  'estudiantes:read',
];

let pool: Pool;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  if (!url) {
    throw new Error('TEST_DATABASE_URL no apunta a la instancia aislada aprobada');
  }
  pool = await createTestPool();

  const limpieza = await pool.connect();
  try {
    await limpieza.query(`DELETE FROM auth_role_permissions
      WHERE permiso_codigo NOT IN (
        'auth:users:manage', 'auth:roles:manage',
        'estudiantes:manage', 'estudiantes:read', 'tutores:manage',
        'matriculas:manage', 'matriculas:read'
      )`);
  } finally {
    limpieza.release();
  }

  const client = await pool.connect();
  try {
    for (const file of MIG_FILES) {
      await client.query(readFileSync(file, 'utf8'));
    }
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM comprobantes WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await client.query(`DELETE FROM pago_aplicaciones WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await client.query(`DELETE FROM pago_medios WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await client.query(`DELETE FROM pagos WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM mensualidades WHERE plan_pago_id IN (
        SELECT pl.id FROM planes_pago pl JOIN matriculas m ON m.id = pl.matricula_id
         WHERE m.observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM planes_pago WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM matriculas WHERE observaciones LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM grados WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`${MARCA}%`]);
    await client.query('DELETE FROM auth_login_limits');
  } finally {
    client.release();
  }
});

afterAll(async () => {
  // La suite deja la base como la encontro (misma disciplina que el resto).
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM auth_sessions WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM auditoria WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await client.query('DELETE FROM auth_login_limits');
    await client.query(`DELETE FROM usuarios WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM auth_role_permissions WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM roles WHERE nombre LIKE $1`, [`%${MARCA}%`]);
  } finally {
    client.release();
  }

  const restos = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM auth_role_permissions rp
      JOIN roles r ON r.id = rp.rol_id
      WHERE r.nombre LIKE $1
        AND rp.permiso_codigo IN ('matriculas:manage','matriculas:read','estudiantes:manage','estudiantes:read')`,
    [`%${MARCA}%`]
  );
  if (Number(restos.rows[0].c) > 0) {
    throw new Error(`La suite de catalogos dejo ${restos.rows[0].c} concesiones en la base compartida`);
  }

  await closeTestPool(pool);
  await closePool();
});

async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

async function uno<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const filas = await q<T>(sql, params);
  if (filas.length === 0) {
    throw new Error('se esperaba exactamente una fila');
  }
  return filas[0];
}

function hdrs(cookie: string): Record<string, string> {
  return { Cookie: cookie, Origin: 'http://localhost:5173' };
}

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) {
    return '';
  }
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first.split(';')[0];
}

async function actor(grants: string[] = GRANTS) {
  const rol = await uno<{ id: number }>(
    'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
    [`actor_${MARCA}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, `rol ${MARCA}`]
  );
  for (const grant of grants) {
    await pool.query('INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)', [rol.id, grant]);
  }
  const { hashPassword } = await import('../src/utils/authCrypto.js');
  const hash = await hashPassword('Password12345!', 12);
  const email = `actor-${rol.id}-${Date.now()}@example.com`;
  await pool.query(
    'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id) VALUES ($1, $2, $3, $4, $5)',
    [email, hash, 'Actor', MARCA, rol.id]
  );
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .set('Content-Type', 'application/json')
    .send({ email, password: 'Password12345!' });
  return cookieFrom(res);
}

/** Crea año, grado, tarifa y estudiantes de prueba. */
async function sembrar() {
  const anio = ANIO + Math.floor(Math.random() * ANIO_ANCHO);
  await pool.query(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [anio, `${anio}-02-10`, `${anio}-11-10`]
  );
  const anioRow = await uno<{ id: number }>('SELECT id FROM anio_lectivo WHERE anio = $1', [anio]);
  const grado = await uno<{ id: number }>(
    'INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ($1, $2, $3) RETURNING id',
    [`${MARCA} Sexto`, 'Primaria', anioRow.id]
  );
  const tarifa = await uno<{ id: number; monto: string }>(
    `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
     VALUES ($1, $2::numeric, 'NIO', $3, TRUE) RETURNING id, monto::text AS monto`,
    [`${MARCA} Matricula`, '1500.00', anioRow.id]
  );
  const estudiante = await uno<{ id: number }>(
    `INSERT INTO estudiantes (nombres, apellidos, documento_identidad, activo)
     VALUES ($1, $2, $3, TRUE) RETURNING id`,
    ['María Alejandra', `Perez ${MARCA}`, `${MARCA}-DOC-1`]
  );
  return { anioId: anioRow.id, anio, grado, tarifa, estudiante };
}

// ---------------------------------------------------------------------------

describe('catalogos para el alta de matricula', () => {
  it('devuelve años, grados y tarifas reales, con el monto como TEXTO exacto', async () => {
    const cookie = await actor();
    const datos = await sembrar();

    const anios = await request(app).get('/api/estudiantes/anios-lectivos').set(hdrs(cookie));
    expect(anios.status).toBe(200);
    expect(anios.body.anios.some((a: { id: number }) => a.id === datos.anioId)).toBe(true);
    expect(anios.body.anios[0]).toHaveProperty('fecha_inicio');

    const grados = await request(app).get('/api/estudiantes/grados').set(hdrs(cookie));
    expect(grados.status).toBe(200);
    expect(grados.body.grados.some((g: { id: number }) => g.id === datos.grado.id)).toBe(true);

    const tarifas = await request(app).get('/api/estudiantes/tarifas').set(hdrs(cookie));
    expect(tarifas.status).toBe(200);
    const tarifa = tarifas.body.tarifas.find((t: { id: number }) => t.id === datos.tarifa.id);
    expect(tarifa).toBeDefined();
    // El monto viaja como texto: no se convierte a numero en ningun lado.
    expect(typeof tarifa.monto).toBe('string');
    expect(tarifa.monto).toBe('1500.00');
    expect(tarifa.moneda).toBe('NIO');

    // Filtro por año: solo ese año.
    const gradosFiltrados = await request(app)
      .get(`/api/estudiantes/grados?anio_lectivo_id=${datos.anioId}`)
      .set(hdrs(cookie));
    expect(gradosFiltrados.status).toBe(200);
    expect(gradosFiltrados.body.grados.every((g: { anio_lectivo_id: number }) => g.anio_lectivo_id === datos.anioId)).toBe(true);
  });

  it('la busqueda de estudiantes es parcial e insensible a acentos', async () => {
    const cookie = await actor();
    await sembrar();

    // Sin tilde, aunque el registro la tenga.
    const porNombre = await request(app).get('/api/estudiantes?q=Maria').set(hdrs(cookie));
    expect(porNombre.status).toBe(200);
    expect(Array.isArray(porNombre.body.estudiantes)).toBe(true);
    expect(
      (porNombre.body.estudiantes as Array<{ apellidos: string }>).some((e) => e.apellidos.includes(MARCA))
    ).toBe(true);

    // Por apellido parcial.
    const porApellido = await request(app)
      .get(`/api/estudiantes?q=${encodeURIComponent(`rez ${MARCA}`)}`)
      .set(hdrs(cookie));
    expect(porApellido.status).toBe(200);
    expect(
      (porApellido.body.estudiantes as Array<{ apellidos: string }>).some((e) => e.apellidos.includes(MARCA))
    ).toBe(true);

    // Por documento.
    const porDocumento = await request(app)
      .get(`/api/estudiantes?q=${encodeURIComponent(`${MARCA}-DOC-1`)}`)
      .set(hdrs(cookie));
    expect(porDocumento.status).toBe(200);
    expect((porDocumento.body.estudiantes as unknown[]).length).toBeGreaterThan(0);

    // Sin parametros: listado completo (tabla de trabajo).
    const todos = await request(app).get('/api/estudiantes?limite=50').set(hdrs(cookie));
    expect(todos.status).toBe(200);
    expect(Array.isArray(todos.body.estudiantes)).toBe(true);
  });

  it('los catalogos no se exponen sin el permiso de matricula', async () => {
    const cookie = await actor(['estudiantes:read']);
    const anios = await request(app).get('/api/estudiantes/anios-lectivos').set(hdrs(cookie));
    expect([401, 403]).toContain(anios.status);

    const grados = await request(app).get('/api/estudiantes/grados').set(hdrs(cookie));
    expect([401, 403]).toContain(grados.status);
  });

  it('un filtro de año invalido se rechaza', async () => {
    const cookie = await actor();
    const respuesta = await request(app).get('/api/estudiantes/grados?anio_lectivo_id=abc').set(hdrs(cookie));
    expect(respuesta.status).toBe(400);
  });
});
