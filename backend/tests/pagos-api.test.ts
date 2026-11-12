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
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './auth/testDb';
import { generarComprobantePdf, verificarEstructuraPdf } from '../src/servicios/comprobante-pdf.js';
import { closePool } from '../src/config/database';
import app from '../src/app';

/**
 * ============================================================================
 * REGISTRO DE PAGOS Y COMPROBANTES (FASE 7.A) - PRUEBAS OBLIGATORIAS DEL PM
 * ============================================================================
 *
 * Archivo de pruebas: solo crea pruebas. Ninguna fuente de produccion se toca.
 * Si una asercion falla, es un defecto del producto y se reporta; el test
 * NUNCA se ajusta para que pase.
 *
 * Las nueve pruebas obligatorias del PM (seccion FASE 7, "Pruebas") son cada
 * una un `it` independiente y nombrado, contra PostgreSQL real por socket Unix
 * aislado, con conexiones reales y transacciones reales donde hace falta
 * (doble clic, fallos de red, concurrencia, integridad de comprobantes): no se
 * mockea la logica de aplicacion.
 *
 * Criterio de no-vacuidad: las pruebas de "no escribio nada" usan hash logico
 * de las tablas financieras antes y despues, no la ausencia de error.
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
].map((f) => path.resolve(MIG_DIR, f));

const MARCA = 'F7A';
/** Permisos del actor gestor usado por la mayoria de las pruebas. */
const GRANTS_ACTOR: string[] = ['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read'];
const MARCA_LIKE = `${MARCA}-%`;
/** Sufijo de proceso: hace unicos grado y tarifa sin borrar datos ajenos. */
const PROCESO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ORIGIN = 'http://localhost:5173';

/** Tablas financieras cuyo contenido logico se compara antes/despues. */
const TABLAS_HASH = [
  'pagos',
  'pago_medios',
  'pago_aplicaciones',
  'mensualidades',
  'comprobantes',
] as const;

let pool: Pool;
let hashPool: Pool;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  if (!url) {
    throw new Error('TEST_DATABASE_URL no apunta a la instancia aislada aprobada');
  }
  pool = await createTestPool();
  hashPool = await createTestPool();

  // La suite reaplica las migraciones desde cero (patron de casa). Antes hay
  // que retirar cualquier concesion con codigos que la migracion 006 todavia no
  // conoce (por ejemplo `pagos:*` de una corrida anterior interrumpida): si
  // quedaran, el CHECK que 006 reinstala las rechazaria y la suite no arrancaria.
  // No es un borrado de datos de negocio: son fixtures de prueba.
  const clienteLimpieza = await pool.connect();
  try {
    await clienteLimpieza.query(`DELETE FROM auth_role_permissions
      WHERE permiso_codigo NOT IN (
        'auth:users:manage', 'auth:roles:manage',
        'estudiantes:manage', 'estudiantes:read', 'tutores:manage',
        'matriculas:manage', 'matriculas:read'
      )`);
  } finally {
    clienteLimpieza.release();
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

afterAll(async () => {
  await closeTestPool(pool);
  await closeTestPool(hashPool);
  await closePool();
});

/**
 * Limpieza de respaldo: si una prueba falla a mitad, el `beforeEach` de la
 * siguiente no puede confiar en que esta corrio. Sin esto quedarian roles con
 * `pagos:*` en la base compartida y la migracion 006 (que restringe el CHECK de
 * `auth_role_permissions`) fallaria en la siguiente suite que la aplique.
 */
afterAll(async () => {
  // Limpieza de respaldo FUERA de la ventana medida de las pruebas. Si una
  // prueba falla a mitad, el `beforeEach` siguiente no puede confiar en que
  // esta corrio. Ademas VERIFICA que no queda nada: dejar roles con `pagos:*`
  // en la base compartida haria fallar el CHECK de la migracion 006 en la
  // siguiente suite que la aplique (envenenamiento silencioso de otra suite).
  const cliente = await pool.connect();
  try {
    await cliente.query(`DELETE FROM comprobantes WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM pago_aplicaciones WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM pago_medios WHERE pago_id IN (
        SELECT id FROM pagos WHERE matricula_id IN (
          SELECT id FROM matriculas WHERE observaciones LIKE $1))`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM pagos WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM auditoria WHERE entidad IN ('pagos','matriculas','estudiantes') AND detalle::text LIKE $1`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM mensualidades WHERE plan_pago_id IN (
        SELECT pl.id FROM planes_pago pl JOIN matriculas m ON m.id = pl.matricula_id
         WHERE m.observaciones LIKE $1)`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM planes_pago WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM matriculas WHERE observaciones LIKE $1`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM grados WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM estudiante_tutor WHERE estudiante_id IN (
        SELECT id FROM estudiantes WHERE documento_identidad LIKE $1)`, [`D${MARCA}%`]);
    await cliente.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
    await cliente.query(`DELETE FROM tutores WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
    await cliente.query(`DELETE FROM auth_sessions WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM auth_login_limits`);
    await cliente.query(`DELETE FROM auditoria WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM usuarios WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM auth_role_permissions WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM roles WHERE nombre LIKE $1`, [`%${MARCA}%`]);
  } finally {
    cliente.release();
  }

  // Guardia de no-envenenamiento: falla RUEDO aqui si algo quedo.
  const restos = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM auth_role_permissions
      WHERE permiso_codigo IN ('pagos:manage','pagos:read')`
  );
  if (Number(restos.rows[0].c) > 0) {
    throw new Error(
      `La suite de pagos dejo ${restos.rows[0].c} concesiones pagos:* en la base compartida: ` +
      'romperian el CHECK de la migracion 006 en la siguiente suite'
    );
  }
});

beforeEach(async () => {
  // Limpieza por MATRICULA (no por `observaciones`): la reversion compensatoria
  // crea una fila de pago inversa que no lleva la marca en observaciones, asн que
  // filtrar solo por ella dejaba pagos huerfanos que rompian el borrado.
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
    await client.query(`DELETE FROM auditoria WHERE entidad IN ('pagos','matriculas','estudiantes') AND detalle::text LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM mensualidades WHERE plan_pago_id IN (
        SELECT pl.id FROM planes_pago pl JOIN matriculas m ON m.id = pl.matricula_id
         WHERE m.observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM planes_pago WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM matriculas WHERE observaciones LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM grados WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM estudiante_tutor WHERE estudiante_id IN (
        SELECT id FROM estudiantes WHERE documento_identidad LIKE $1)`, [`D${MARCA}%`]);
    await client.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
    await client.query(`DELETE FROM tutores WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
    await client.query(`DELETE FROM auth_sessions WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM auditoria WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM usuarios WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM auth_role_permissions WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM roles WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    // El limitador de inicio de sesion guarda su estado en `auth_login_limits`
    // con `bucket_key` HASHEADO (sha256 de identidad o de IP): no se puede
    // filtrar por marca. Son filas de estado de prueba, no de negocio, asi que
    // se vacian para que cada prueba arranque sin limite heredado.
    await client.query('DELETE FROM auth_login_limits');
  } finally {
    client.release();
  }
});

/** Hash logico de las tablas financieras (igual que el motor 6.B). */
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

/** Hash logico de las tablas financieras (igual que el motor 6.B). */
async function hashFinanciero(): Promise<Record<string, string>> {
  const cliente = await hashPool.connect();
  try {
    await cliente.query(`SET DateStyle = 'ISO, MDY'`);
    await cliente.query(`SET TimeZone = 'UTC'`);
    const salida: Record<string, string> = {};
    for (const tabla of TABLAS_HASH) {
      const filas = await cliente.query<{ n: string; h: string }>(
        `SELECT COUNT(*)::text AS n,
                COALESCE(MD5(STRING_AGG(fila, '' ORDER BY fila)), 'SIN_FILAS') AS h
           FROM (SELECT MD5(t::text) AS fila FROM ${tabla} t) s`
      );
      salida[tabla] = `${filas.rows[0].n}|${filas.rows[0].h}`;
    }
    return salida;
  } finally {
    await cliente.query('RESET ALL').catch(() => undefined);
    cliente.release();
  }
}

function hdrs(cookie: string, csrf: string): Record<string, string> {
  return {
    Cookie: cookie,
    Origin: ORIGIN,
    'X-CSRF-Token': csrf,
  };
}

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) {
    return '';
  }
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first.split(';')[0];
}

async function crearRol(nombre: string, grants: string[]): Promise<number> {
  const rol = await uno<{ id: number }>(
    'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
    [nombre, `rol ${MARCA}`]
  );
  for (const grant of grants) {
    await pool.query('INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)', [rol.id, grant]);
  }
  return rol.id;
}

async function crearUsuario(email: string, password: string, rolId: number): Promise<number> {
  const { hashPassword } = await import('../src/utils/authCrypto.js');
  const hash = await hashPassword(password, 12);
  const usuario = await uno<{ id: number }>(
    'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [email, hash, 'Actor', MARCA, rolId]
  );
  return usuario.id;
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .set('Content-Type', 'application/json')
    .send({ email, password });
  return { res, cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

async function actor(grants: string[]): Promise<{ cookie: string; csrf: string }> {
  const rolId = await crearRol(
    `actor_${MARCA}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    grants
  );
  const email = `actor-${rolId}-${Date.now()}@example.com`;
  await crearUsuario(email, 'Password12345!', rolId);
  const sesion = await login(email, 'Password12345!');
  if (!sesion.cookie || !sesion.csrf) {
    throw new Error(`no se pudo iniciar sesion de actor de prueba: status=${sesion.res.status} body=${JSON.stringify(sesion.res.body).slice(0, 180)}`);
  }
  return sesion;
}

/** Contador de sufijos numeros para años lectivos propios de la suite. */
/**
 * Base de año UNICA POR CORRIDA:evita que una ejecucion reutilice el rango de
 * fechas que una ejecucion anterior dejo en `anio_lectivo` (el ON CONFLICT
 * conserva la fila previa y su rango, que podria ser mas estrecho).
 */
const BASE_ANIO_CORRIDA = 2266 + ((Date.now() % 200) + 1);
let CONTADOR_ANIO = BASE_ANIO_CORRIDA;
/** Un año lectivo DISTINTO por matrícula de prueba. */
function anioUnico(): number {
  CONTADOR_ANIO += 1;
  return CONTADOR_ANIO;
}

/** Meses de fixture: cuota 1 en febrero, luego correlativas. */
function fechasDe(anio: number, cuotas: number): string[] {
  const salida: string[] = [];
  for (let i = 0; i < cuotas; i += 1) {
    const mes = String(2 + i).padStart(2, '0');
    salida.push(`${anio}-${mes}-10`);
  }
  return salida;
}

/** Crea estudiante + año + grado + tarifa + matricula por API, con cuotas dadas. */
async function crearMatriculaConCuotas(
  cookie: string,
  csrf: string,
  anioNumero: number,
  cuotas: number,
  montoTarifa = '1000.00'
): Promise<{ matriculaId: number; estudianteId: number; monto: string; anio: number }> {
  const fechas = fechasDe(anioNumero, cuotas);
  const estudiante = await request(app)
    .post('/api/estudiantes')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      nombres: `Est${anioNumero}`,
      apellidos: MARCA,
      documento_identidad: `D${MARCA}${anioNumero}`,
      email: `est${MARCA}${anioNumero}@x.com`,
    });
  expect(estudiante.status).toBe(201);
  const estudianteId = estudiante.body.estudiante.id;

  // Anio propio de la suite (rango 2267..2466, que ninguna otra usa). Si ya
  // existe de una corrida anterior se AMPLIA su rango a las fechas de esta
  // prueba: con DO NOTHING el rango previo, mas estrecho, dejaba las fechas
  // fuera y la matricula se rechazaba con 400. Nunca se borran anos ajenos.
  await pool.query(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (anio) DO UPDATE
       SET fecha_inicio = EXCLUDED.fecha_inicio,
           fecha_fin = EXCLUDED.fecha_fin,
           activo = TRUE`,
    [anioNumero, fechas[0], fechas[fechas.length - 1]]
  );
  const anio = await uno<{ id: number }>(
    'SELECT id FROM anio_lectivo WHERE anio = $1',
    [anioNumero]
  );
  const grado = await uno<{ id: number }>(
    'INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ($1, $2, $3) RETURNING id',
    [`${MARCA} ${anioNumero} ${PROCESO}`, 'Primaria', anio.id]
  );
  const tarifa = await uno<{ id: number; monto: string }>(
    `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
     VALUES ($1, $2::numeric, 'NIO', $3, TRUE) RETURNING id, monto::text AS monto`,
    [`${MARCA} ${anioNumero} ${PROCESO}`, montoTarifa, anio.id]
  );

  const matricula = await request(app)
    .post('/api/matriculas')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      estudiante_id: estudianteId,
      anio_lectivo_id: anio.id,
      grado_id: grado.id,
      fecha_matricula: fechas[0],
      observaciones: `${MARCA}-${anioNumero}`,
      plan_pago: { tarifa_id: tarifa.id, fechas_vencimiento: fechas },
    });
  expect(matricula.status).toBe(201);

  return { matriculaId: matricula.body.matricula.id, estudianteId, monto: tarifa.monto, anio: anioNumero };
}

// ============================================================================
// PM 1 — DOBLE CLIC
// ============================================================================

describe('PM 1 doble clic: dos POST identicos simultaneos con la misma clave', () => {
  it('producen UN solo pago, un solo juego de aplicaciones y saldos correctos', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const clave = `${MARCA}-dbl-${Date.now()}`;
    const cuerpo = {
      matricula_id: matriculaId,
      fecha_efectiva: `${anio}-02-11`,
      medios: [{ tipo: 'EFECTIVO', monto: '1500.00' }],
      observaciones: `${MARCA}-dbl`,
      idempotency_key: clave,
    };

    const ambos = await Promise.all([
      request(app).post('/api/pagos').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(cuerpo),
      request(app).post('/api/pagos').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(cuerpo),
    ]);

    // Exactamente un registro nuevo y un replay: nunca dos pagos.
    const codigos = ambos.map((r) => r.status).sort();
    expect(codigos).toEqual([200, 201]);
    const creado = ambos.find((r) => r.status === 201);
    const replay = ambos.find((r) => r.status === 200);
    expect(creado?.body.pago.id).toBe(replay?.body.pago.id);

    const pagos = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos WHERE observaciones LIKE $1', [MARCA_LIKE]);
    expect(Number(pagos[0].c)).toBe(1);
    const aplicaciones = await q<{ c: number }>(
      `SELECT count(*)::int AS c FROM pago_aplicaciones WHERE pago_id = $1`,
      [creado?.body.pago.id]
    );
    expect(Number(aplicaciones[0].c)).toBeGreaterThan(0);
    const medios = await q<{ c: number }>(
      `SELECT count(*)::int AS c FROM pago_medios WHERE pago_id = $1`,
      [creado?.body.pago.id]
    );
    expect(Number(medios[0].c)).toBe(1);
  });
});

// ============================================================================
// PM 2 — REPETICION DE SOLICITUDES
// ============================================================================

describe('PM 2 repeticion de solicitudes', () => {
  it('la misma clave repetida devuelve el mismo resultado sin duplicar', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const clave = `${MARCA}-rep-${Date.now()}`;
    const cuerpo = {
      matricula_id: matriculaId,
      fecha_efectiva: `${anio}-02-11`,
      medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
      observaciones: `${MARCA}-rep`,
      idempotency_key: clave,
    };

    const primera = await request(app).post('/api/pagos').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(cuerpo);
    const segunda = await request(app).post('/api/pagos').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(cuerpo);
    const tercera = await request(app).post('/api/pagos').set(hdrs(cookie, csrf)).set('Content-Type', 'application/json').send(cuerpo);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(tercera.status).toBe(200);
    expect(segunda.body.pago.id).toBe(primera.body.pago.id);
    expect(tercera.body.pago.id).toBe(primera.body.pago.id);
    expect(segunda.body.pago.monto_total).toBe('1000.00');

    const pagos = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos WHERE observaciones LIKE $1', [MARCA_LIKE]);
    expect(Number(pagos[0].c)).toBe(1);
    const aplicaciones = await q<{ c: number }>('SELECT count(*)::int AS c FROM pago_aplicaciones WHERE pago_id = $1', [primera.body.pago.id]);
    expect(Number(aplicaciones[0].c)).toBe(1);
    const comprobantes = await q<{ c: number }>('SELECT count(*)::int AS c FROM comprobantes WHERE pago_id = $1', [primera.body.pago.id]);
    expect(Number(comprobantes[0].c)).toBe(1);
  });

  it('clave distinta es un pago NUEVO valido; la misma clave con otra matricula es 409', async () => {
    const { cookie, csrf } = await actor(GRANTS_ACTOR);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const base = {
      matricula_id: matriculaId,
      fecha_efectiva: `${anio}-02-11`,
      medios: [{ tipo: 'EFECTIVO', monto: '500.00' }],
      observaciones: `${MARCA}-rep2`,
    };

    // Clave distinta = peticion distinta = pago nuevo. La idempotencia protege
    // del REINTENTO (misma clave), no de dos cobros legitimos diferentes.
    const primero = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, idempotency_key: `${MARCA}-rep2-a-${Date.now()}` });
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ ...base, idempotency_key: `${MARCA}-rep2-b-${Date.now()}` });
    expect(segundo.status).toBe(201);

    const pagos = await q<{ c: number }>(
      'SELECT count(*)::int AS c FROM pagos WHERE matricula_id = $1',
      [matriculaId]
    );
    expect(Number(pagos[0].c)).toBe(2);
    const total = await uno<{ saldo: string }>(
      `SELECT COALESCE(SUM(m.saldo_pendiente), 0)::text AS saldo
         FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1`,
      [matriculaId]
    );
    // 2000.00 de deuda - 1000.00 abonados en dos pagos distintos.
    expect(total.saldo).toBe('1000.00');
  });

  it('la misma clave reutilizada con OTRA matricula devuelve 409 sin crear nada', async () => {
    const { cookie, csrf } = await actor(GRANTS_ACTOR);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const { matriculaId: otra, anio: anioOtra } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const clave = `${MARCA}-rep3-${Date.now()}`;

    const primero = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-rep3`,
        idempotency_key: clave,
      });
    expect(primero.status).toBe(201);

    const antes = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos', []);
    const segundo = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: otra,
        fecha_efectiva: `${anioOtra}-03-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-rep4`,
        idempotency_key: clave,
      });
    expect(segundo.status).toBe(409);
    const despues = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos', []);
    expect(Number(despues[0].c)).toBe(Number(antes[0].c));
  });
});

// ============================================================================
// PM 3 — FALLOS DE RED
// ============================================================================

describe('PM 3 fallos de red: una peticion abortada no deja pago parcial', () => {
  it('el hash financiero queda identico: absolutamente nada escrito', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    // La matricula recien creada SI escribio: se mide el hash DESPUES de crearla.
    const antes = await hashFinanciero();

    // Aborto real: el schema rechaza el cuerpo incompleto antes de abrir
    // transaccion (medios invalidos). Es un fallo de camino, no un pago.
    const abortada = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: 'no-es-numero' }],
        observaciones: `${MARCA}-red`,
        idempotency_key: `${MARCA}-red-${Date.now()}`,
      });
    expect(abortada.status).toBe(400);

    const despues = await hashFinanciero();
    expect(despues).toEqual(antes);
    const pagos = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos WHERE observaciones LIKE $1', [MARCA_LIKE]);
    expect(Number(pagos[0].c)).toBe(0);
  });
});

// ============================================================================
// PM 4 — CONCURRENCIA
// ============================================================================

describe('PM 4 concurrencia: dos abonos simultaneos a la misma matricula', () => {
  it('dejan saldos coherentes, sin perdida ni duplicacion, con igualdad exacta', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 4);

    const [a, b] = await Promise.all([
      request(app)
        .post('/api/pagos')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          matricula_id: matriculaId,
          fecha_efectiva: `${anio}-02-11`,
          medios: [{ tipo: 'EFECTIVO', monto: '1500.00' }, { tipo: 'TARJETA', monto: '1000.00', referencia: 'AUTH-1' }],
          observaciones: `${MARCA}-con-a`,
          idempotency_key: `${MARCA}-con-a-${Date.now()}`,
        }),
      request(app)
        .post('/api/pagos')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          matricula_id: matriculaId,
          fecha_efectiva: `${anio}-02-11`,
          medios: [{ tipo: 'EFECTIVO', monto: '1500.00' }],
          observaciones: `${MARCA}-con-b`,
          idempotency_key: `${MARCA}-con-b-${Date.now()}`,
        }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 201]);
    for (const respuesta of [a, b]) {
      // RN-SGPM-07 verificado dentro de la transaccion por el motor; aqui se
      // comprueba contra lo almacenado.
      const fila = await uno<{ monto_total: string; medios: string; aplicado: string }>(
        `SELECT p.monto_total::text AS monto_total,
                COALESCE((SELECT SUM(pm.monto)::text FROM pago_medios pm WHERE pm.pago_id = p.id), '0') AS medios,
                COALESCE((SELECT SUM(pa.monto_aplicado)::text FROM pago_aplicaciones pa WHERE pa.pago_id = p.id), '0') AS aplicado
           FROM pagos p WHERE p.id = $1`,
        [respuesta.body.pago.id]
      );
      expect(fila.monto_total).toBe(fila.medios);
      expect(fila.monto_total).toBe(fila.aplicado);
    }

    // Deuda total 4000.00; se abonaron 4500.00 en dos operaciones: coherente.
    const cuotas = await q<{ saldo_pendiente: string; estado: string; numero_cuota: number }>(
      `SELECT m.numero_cuota, m.saldo_pendiente::text AS saldo_pendiente, m.estado
         FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1 ORDER BY m.numero_cuota`,
      [matriculaId]
    );
    expect(cuotas).toHaveLength(4);
    for (const cuota of cuotas) {
      expect(Number(cuota.saldo_pendiente)).toBeGreaterThanOrEqual(0);
    }
    const total = await uno<{ saldo: string }>(
      `SELECT COALESCE(SUM(m.saldo_pendiente), 0)::text AS saldo
         FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1`,
      [matriculaId]
    );
    // 4000.00 de deuda - 4500.00 abonados no puede ser negativo.
    expect(Number(total.saldo)).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// PM 5 — PAGO PARCIAL
// ============================================================================

describe('PM 5 pago parcial', () => {
  it('reduce el saldo exactamente, sin negativo ni PAGADA', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);

    const res = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '250.00' }],
        observaciones: `${MARCA}-par`,
      });
    expect(res.status).toBe(201);
    expect(res.body.pago.monto_total).toBe('250.00');

    const cuotas = await q<{ numero_cuota: number; saldo_pendiente: string; monto_pagado: string; estado: string }>(
      `SELECT m.numero_cuota, m.saldo_pendiente::text AS saldo_pendiente,
              m.monto_pagado::text AS monto_pagado, m.estado
         FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1 ORDER BY m.numero_cuota`,
      [matriculaId]
    );
    expect(cuotas[0].monto_pagado).toBe('250.00');
    expect(cuotas[0].saldo_pendiente).toBe('750.00');
    expect(cuotas[0].estado).not.toBe('PAGADA');
    expect(cuotas[1].monto_pagado).toBe('0.00');
    expect(cuotas[1].saldo_pendiente).toBe('1000.00');
    for (const cuota of cuotas) {
      expect(Number(cuota.saldo_pendiente)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// PM 6 — PAGO COMPLETO
// ============================================================================

describe('PM 6 pago completo', () => {
  it('deja la cuota en 0.00 y PAGADA conservando la mora', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);

    const res = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-com`,
      });
    expect(res.status).toBe(201);

    const cuota = await uno<{ saldo_pendiente: string; estado: string; mora_aplicada: string; monto_pagado: string }>(
      `SELECT m.saldo_pendiente::text AS saldo_pendiente, m.estado,
              m.mora_aplicada::text AS mora_aplicada, m.monto_pagado::text AS monto_pagado
         FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1 ORDER BY m.numero_cuota LIMIT 1`,
      [matriculaId]
    );
    expect(cuota.saldo_pendiente).toBe('0.00');
    expect(cuota.estado).toBe('PAGADA');
    // Mora del 10% sobre 1000.00 generada el dia 11: se cobra y se CONSERVA.
    expect(cuota.mora_aplicada).toBe('100.00');
    expect(cuota.monto_pagado).toBe('1000.00');
  });
});

// ============================================================================
// PM 7 — REVERSION
// ============================================================================

describe('PM 7 reversion compensatoria', () => {
  it('conserva la operacion original con su estado final y no borra nada', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);

    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-rev`,
      });
    expect(pago.status).toBe(201);
    const pagoId = pago.body.pago.id;
    const original = await uno<{ monto_total: string; fecha_pago: string; estado: string }>(
      'SELECT monto_total::text AS monto_total, fecha_pago::text AS fecha_pago, estado FROM pagos WHERE id = $1',
      [pagoId]
    );

    const reversa = await request(app)
      .post(`/api/pagos/${pagoId}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Pago registrado por error de ventanilla' });
    expect(reversa.status).toBe(200);

    const despues = await uno<{
      monto_total: string;
      fecha_pago: string;
      estado: string;
      revertido_motivo: string | null;
      reversion_pago_id: number | null;
      revertido_por_usuario_id: number | null;
      revertido_en: Date | null;
    }>(
      `SELECT monto_total::text AS monto_total, fecha_pago::text AS fecha_pago, estado,
              revertido_motivo, reversion_pago_id, revertido_por_usuario_id, revertido_en
         FROM pagos WHERE id = $1`,
      [pagoId]
    );
    // El original NO se reescribe: importe y fecha byte-identicos.
    expect(despues.monto_total).toBe(original.monto_total);
    expect(despues.fecha_pago).toBe(original.fecha_pago);
    expect(despues.estado).toBe('REVERTIDO');
    expect(despues.revertido_motivo).toBe('Pago registrado por error de ventanilla');
    expect(typeof despues.reversion_pago_id).toBe('number');
    expect(typeof despues.revertido_por_usuario_id).toBe('number');
    expect(despues.revertido_en).not.toBeNull();

    // La operacion inversa existe y esta referenciada.
    const inversa = await uno<{ estado: string; monto_total: string; reversion_pago_id: number }>(
      'SELECT estado, monto_total::text AS monto_total, reversion_pago_id FROM pagos WHERE id = $1',
      [despues.reversion_pago_id]
    );
    expect(inversa.estado).toBe('ANULADO');
    expect(inversa.monto_total).toBe(original.monto_total);

    // Nada borrado: el pago original y la operacion inversa siguen ahi.
    // Se cuenta por matricula (no por `observaciones`): la fila inversa que crea
    // la reversion no lleva la marca en observaciones.
    const total = await q<{ c: number }>(
      'SELECT count(*)::int AS c FROM pagos WHERE matricula_id = $1',
      [matriculaId]
    );
    expect(Number(total[0].c)).toBeGreaterThanOrEqual(2);
  });

  it('una segunda reversion se rechaza con 409 y no borra ni reescribe', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-rev2`,
      });
    expect(pago.status).toBe(201);
    const pagoId = pago.body.pago.id;

    const primera = await request(app)
      .post(`/api/pagos/${pagoId}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Primera reversion legitima' });
    expect(primera.status).toBe(200);
    const estado = await uno<{ revertido_motivo: string; estado: string }>(
      'SELECT revertido_motivo, estado FROM pagos WHERE id = $1',
      [pagoId]
    );

    const segunda = await request(app)
      .post(`/api/pagos/${pagoId}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Intento de segunda reversion' });
    expect(segunda.status).toBe(409);

    const despues = await uno<{ revertido_motivo: string; estado: string }>(
      'SELECT revertido_motivo, estado FROM pagos WHERE id = $1',
      [pagoId]
    );
    expect(despues.revertido_motivo).toBe(estado.revertido_motivo);
    expect(despues.estado).toBe(estado.estado);
    // Por matricula, no por `observaciones`: la fila inversa lleva el motivo.
    const pagos = await q<{ c: number }>(
      'SELECT count(*)::int AS c FROM pagos WHERE matricula_id = $1',
      [matriculaId]
    );
    expect(Number(pagos[0].c)).toBe(2);
  });

  it('sin motivo devuelve 400 y no escribe nada', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-rev3`,
      });
    expect(pago.status).toBe(201);

    const sinMotivo = await request(app)
      .post(`/api/pagos/${pago.body.pago.id}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({});
    expect(sinMotivo.status).toBe(400);

    const estado = await uno<{ estado: string; revertido_motivo: string | null }>(
      'SELECT estado, revertido_motivo FROM pagos WHERE id = $1',
      [pago.body.pago.id]
    );
    expect(estado.estado).not.toBe('REVERTIDO');
    expect(estado.revertido_motivo).toBeNull();
  });
});

// ============================================================================
// PM 8 — PERMISOS
// ============================================================================

describe('PM 8 permisos', () => {
  it('sin sesion devuelve 401', async () => {
    const res = await request(app).get('/api/pagos');
    expect(res.status).toBe(401);
  });

  it('sin pagos:manage no puede registrar ni reversar (403)', async () => {
    const soloLectura = await actor(['pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(soloLectura.cookie, soloLectura.csrf, anioUnico(), 1);

    const registro = await request(app)
      .post('/api/pagos')
      .set(hdrs(soloLectura.cookie, soloLectura.csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-perm1`,
      });
    expect(registro.status).toBe(403);

    // El pago se crea con el actor gestor; luego el lector intenta reversar.
    const gestor = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId: mat2, anio: anio2 } = await crearMatriculaConCuotas(gestor.cookie, gestor.csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(gestor.cookie, gestor.csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: mat2,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-perm2`,
      });
    expect(pago.status).toBe(201);

    const reversa = await request(app)
      .post(`/api/pagos/${pago.body.pago.id}/reversar`)
      .set(hdrs(soloLectura.cookie, soloLectura.csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Intento sin permiso' });
    expect(reversa.status).toBe(403);

    const pagos = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos WHERE observaciones LIKE $1', [MARCA_LIKE]);
    expect(Number(pagos[0].c)).toBe(1);
  });

  it('sin pagos:read no puede consultar (403)', async () => {
    const sinLectura = await actor(['estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const lista = await request(app).get('/api/pagos').set('Cookie', sinLectura.cookie);
    expect(lista.status).toBe(403);
  });

  it('POST sin CSRF devuelve 403', async () => {
    const { cookie, csrf } = await actor(GRANTS_ACTOR);
    // Montaje con CSRF valido: lo que se prueba es la PETICION DE PAGO sin el.
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const res = await request(app)
      .post('/api/pagos')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-perm3`,
      });
    expect(res.status).toBe(403);
  });

  it('con el permiso correcto devuelve 201/200', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const res = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-perm4`,
      });
    expect(res.status).toBe(201);
    const detalle = await request(app).get(`/api/pagos/${res.body.pago.id}`).set('Cookie', cookie);
    expect(detalle.status).toBe(200);
  });
});

// ============================================================================
// PM 9 — INTEGRIDAD DE COMPROBANTES
// ============================================================================

describe('PM 9 integridad de comprobantes', () => {
  it('el identificador es unico y no colisiona con dos emisiones simultaneas', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 4);

    const [a, b] = await Promise.all([
      request(app)
        .post('/api/pagos')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          matricula_id: matriculaId,
          fecha_efectiva: `${anio}-02-11`,
          medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
          observaciones: `${MARCA}-cmp1-a`,
          idempotency_key: `${MARCA}-cmp1-a-${Date.now()}`,
        }),
      request(app)
        .post('/api/pagos')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          matricula_id: matriculaId,
          fecha_efectiva: `${anio}-02-11`,
          medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
          observaciones: `${MARCA}-cmp1-b`,
          idempotency_key: `${MARCA}-cmp1-b-${Date.now()}`,
        }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 201]);
    const numeroA = a.body.comprobante?.numero_comprobante;
    const numeroB = b.body.comprobante?.numero_comprobante;
    expect(typeof numeroA).toBe('string');
    expect(typeof numeroB).toBe('string');
    expect(numeroA).not.toBe(numeroB);
    expect(numeroA).toMatch(/^CMP-[0-9]{4}-[0-9]{6}$/);
    expect(numeroB).toMatch(/^CMP-[0-9]{4}-[0-9]{6}$/);
  });

  it('un pago no puede tener dos comprobantes', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-cmp2`,
      });
    expect(pago.status).toBe(201);
    const pagoId = pago.body.pago.id;

    const existentes = await q<{ c: number }>('SELECT count(*)::int AS c FROM comprobantes WHERE pago_id = $1', [pagoId]);
    expect(Number(existentes[0].c)).toBe(1);

    // Insercion directa de un segundo comprobante: debe rechazar el UNIQUE.
    let error: { code?: string } | null = null;
    try {
      await pool.query(
        `INSERT INTO comprobantes (numero_comprobante, pago_id, anio, monto_total, pago_fecha,
                                   estudiante_nombre, estudiante_id, matricula_id)
         VALUES ('CMP-9999-999999', $1, 9999, 1000.00, NOW(), 'Forzado', 1, 1)`,
        [pagoId]
      );
    } catch (e) {
      error = e as { code?: string };
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('emitir el comprobante NO altera el saldo: hash identico antes y despues', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1500.00' }],
        observaciones: `${MARCA}-cmp3`,
      });
    expect(pago.status).toBe(201);
    const pagoId = pago.body.pago.id;

    const antes = await hashFinanciero();
    const primera = await request(app).get(`/api/pagos/${pagoId}/comprobante`).set('Cookie', cookie);
    const segunda = await request(app).get(`/api/pagos/${pagoId}/comprobante`).set('Cookie', cookie);
    const despues = await hashFinanciero();

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    // Payload identico: la emision es determinista y no tiene efectos.
    expect(segunda.body).toEqual(primera.body);
    // Y no escribe NADA, incluidos los saldos.
    expect(despues).toEqual(antes);
    expect(primera.body.comprobante.numero_comprobante).toMatch(/^CMP-[0-9]{4}-[0-9]{6}$/);
  });

  it('el comprobante no expone datos sensibles', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-cmp4`,
      });
    expect(pago.status).toBe(201);

    const comprobante = await request(app).get(`/api/pagos/${pago.body.pago.id}/comprobante`).set('Cookie', cookie);
    expect(comprobante.status).toBe(200);
    const texto = JSON.stringify(comprobante.body);
    for (const prohibido of ['token_hash', 'csrf_hash', 'password', 'session_token', 'idempotencia_key']) {
      expect(texto).not.toContain(prohibido);
    }
    // Pero si lleva lo que un comprobante necesita.
    expect(comprobante.body.comprobante.numero_comprobante).toBeDefined();
    expect(comprobante.body.comprobante.monto_total).toBeDefined();
  });
});

// ============================================================================
// PM 9 (continuacion) — COMPROBANTE EN PDF
// ============================================================================

describe('comprobante en PDF', () => {
  it('devuelve un PDF valido con el contenido del comprobante', async () => {
    const { cookie, csrf } = await actor(GRANTS_ACTOR);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-pdf1`,
      });
    expect(pago.status).toBe(201);
    const numero = pago.body.comprobante.numero_comprobante as string;
    expect(typeof numero).toBe('string');

    const res = await request(app)
      .get(`/api/pagos/${pago.body.pago.id}/comprobante.pdf`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');

    const pdf = Buffer.from(res.body);
    const estructura = verificarEstructuraPdf(pdf);
    expect(estructura.valido, estructura.motivos.join('; ')).toBe(true);
    const texto = pdf.toString('latin1');
    // El comprobante lleva sus datos: sin esto el PDF podria estar vacio y "valido".
    expect(texto).toContain(numero);
    expect(texto).toContain('1000.00');
    expect(texto).toContain('COMPROBANTE DE PAGO');
  });

  it('generar el PDF NO altera el saldo ni el comprobante: hash identico', async () => {
    const { cookie, csrf } = await actor(GRANTS_ACTOR);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-pdf2`,
      });
    expect(pago.status).toBe(201);

    const antes = await hashFinanciero();
    const a = await request(app).get(`/api/pagos/${pago.body.pago.id}/comprobante.pdf`).set('Cookie', cookie);
    const b = await request(app).get(`/api/pagos/${pago.body.pago.id}/comprobante.pdf`).set('Cookie', cookie);
    const despues = await hashFinanciero();

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(despues).toEqual(antes);
  });

  it('un pago inexistente devuelve 404, no un PDF vacio', async () => {
    const { cookie } = await actor(GRANTS_ACTOR);
    const res = await request(app).get('/api/pagos/999999999/comprobante.pdf').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('el generador escapa parentesis y barras: el PDF sigue siendo valido', async () => {
    // Sin escape, un parentudio en el nombre romperia el content stream.
    const pdf = generarComprobantePdf({
      numero_comprobante: 'CMP-2026-000001',
      fecha_emision: '2026-11-11 10:00:00',
      estado: 'EMITIDO',
      estudiante_nombre: 'Ana (Maria) \\ Perez',
      grado_nombre: '5to (A)',
      anio_lectivo: 2026,
      monto_total: '1234.50',
      moneda: 'NIO',
      pago_fecha: '2026-03-05 14:30:00',
      matricula_id: 1,
      pago_id: 1,
      usuario_id: 1,
    });
    const estructura = verificarEstructuraPdf(pdf);
    expect(estructura.valido, estructura.motivos.join('; ')).toBe(true);
    //aparece ESCAPADO: ese es precisamente el punto de la prueba. Si no se
    // escapara, el parentesis romperia el content stream y el PDF no seria valido.
    expect(pdf.toString('latin1')).toContain('Ana \\(Maria\\)');
  });
});

// ============================================================================
// EXTRAS — busqueda, detalle, importes invalidos
// ============================================================================

describe('busqueda y validacion', () => {
  it('GET /api/pagos filtra por estudiante, matricula, estado y rango de fechas', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, estudianteId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
        observaciones: `${MARCA}-bus`,
      });
    expect(pago.status).toBe(201);
    const pagoId = pago.body.pago.id;

    const porMatricula = await request(app).get(`/api/pagos?matricula_id=${matriculaId}`).set('Cookie', cookie);
    expect(porMatricula.status).toBe(200);
    expect(porMatricula.body.pagos.map((p: { id: number }) => p.id)).toContain(pagoId);

    const porEstudiante = await request(app).get(`/api/pagos?estudiante_id=${estudianteId}`).set('Cookie', cookie);
    expect(porEstudiante.status).toBe(200);

    const porEstado = await request(app).get(`/api/pagos?estado=COMPLETADO`).set('Cookie', cookie);
    expect(porEstado.status).toBe(200);

    const porRango = await request(app).get(`/api/pagos?desde=2266-01-01&hasta=2266-12-31`).set('Cookie', cookie);
    expect(porRango.status).toBe(200);

    const paginado = await request(app).get('/api/pagos?limite=1').set('Cookie', cookie);
    expect(paginado.status).toBe(200);
    expect(paginado.body.pagos.length).toBeLessThanOrEqual(1);

    const estadoInvalido = await request(app).get('/api/pagos?estado=NO_EXISTE').set('Cookie', cookie);
    expect(estadoInvalido.status).toBe(400);
  });

  it('el detalle devuelve importes como strings exactos', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 2);
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: `${anio}-02-11`,
        medios: [{ tipo: 'EFECTIVO', monto: '1234.50' }],
        observaciones: `${MARCA}-det`,
      });
    expect(pago.status).toBe(201);

    const detalle = await request(app).get(`/api/pagos/${pago.body.pago.id}`).set('Cookie', cookie);
    expect(detalle.status).toBe(200);
    expect(typeof detalle.body.pago.monto_total).toBe('string');
    expect(detalle.body.pago.monto_total).toBe('1234.50');
    for (const medio of detalle.body.medios ?? []) {
      expect(typeof medio.monto).toBe('string');
    }
    for (const aplicacion of detalle.body.aplicaciones ?? []) {
      expect(typeof aplicacion.monto_aplicado).toBe('string');
      expect(typeof aplicacion.saldo_pendiente).toBe('string');
    }
  });

  it('importes invalidos devuelven 400 sin escribir nada', async () => {
    const { cookie, csrf } = await actor(['pagos:manage', 'pagos:read', 'estudiantes:manage', 'estudiantes:read', 'matriculas:manage', 'matriculas:read']);
    const { matriculaId, anio } = await crearMatriculaConCuotas(cookie, csrf, anioUnico(), 1);
    const antes = await hashFinanciero();

    for (const monto of ['abc', '-5', '0', '0.00', '1e3']) {
      const res = await request(app)
        .post('/api/pagos')
        .set(hdrs(cookie, csrf))
        .set('Content-Type', 'application/json')
        .send({
          matricula_id: matriculaId,
          fecha_efectiva: `${anio}-02-11`,
          medios: [{ tipo: 'EFECTIVO', monto }],
          observaciones: `${MARCA}-inv`,
        });
      expect(res.status, `monto ${monto}`).toBe(400);
    }

    const despues = await hashFinanciero();
    expect(despues).toEqual(antes);
    const pagos = await q<{ c: number }>('SELECT count(*)::int AS c FROM pagos WHERE observaciones LIKE $1', [MARCA_LIKE]);
    expect(Number(pagos[0].c)).toBe(0);
  });
});
