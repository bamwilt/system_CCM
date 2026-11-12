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
 * REPORTES Y CONSULTAS (FASE 8) — PRUEBAS
 * ============================================================================
 *
 * Reglas que el PM exige verificar aqui:
 *   - "Comparar los totales de los reportes con los registros almacenados".
 *   - "Verificar especialmente que anulaciones y abonos parciales se reflejen
 *     correctamente".
 *
 * Cada prueba contrasta la cifra del reporte contra una consulta directa a la
 * tabla, no contra un valor escrito a mano: si el reporte recalculara o filtrara
 * distinto, la diferencia saltaria.
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

const MARCA = 'F8';
const MARCA_LIKE = `${MARCA}-%`;
/**
 * Año propio de la suite. Se evita 2187 a proposito: es el ano de
 * `motor-aplicacion.test.ts`, que lo crea con un rango amplio y artificial
 * (2026-2099). Si esta suite lo usara, sus fechas (2187-MM-10) caerian FUERA de
 * ese rango y el alta fallaria con "fuera del rango del ano lectivo".
 * Medido: asi fallaba de forma intermitente.
 */
const ANIO = 2188;
/** Rango que siempre cubre el sello de registro real (`pagos.fecha_pago`). */
const RANGO_AMPLIO = 'desde=2020-01-01&hasta=2035-12-31';
const GRANTS: string[] = [
  'reportes:read',
  'pagos:manage',
  'pagos:read',
  'estudiantes:manage',
  'estudiantes:read',
  'matriculas:manage',
  'matriculas:read',
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

afterAll(async () => {
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
    await cliente.query(`DELETE FROM auditoria WHERE detalle::text LIKE $1`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM mensualidades WHERE plan_pago_id IN (
        SELECT pl.id FROM planes_pago pl JOIN matriculas m ON m.id = pl.matricula_id
         WHERE m.observaciones LIKE $1)`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM planes_pago WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM matriculas WHERE observaciones LIKE $1`, [MARCA_LIKE]);
    await cliente.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM grados WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
    await cliente.query(`DELETE FROM auth_sessions WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM auditoria WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE rol_id IN (
          SELECT id FROM roles WHERE nombre LIKE $1))`, [`%${MARCA}%`]);
    await cliente.query('DELETE FROM auth_login_limits');
    await cliente.query(`DELETE FROM usuarios WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM auth_role_permissions WHERE rol_id IN (
        SELECT id FROM roles WHERE nombre LIKE $1)`, [`%${MARCA}%`]);
    await cliente.query(`DELETE FROM roles WHERE nombre LIKE $1`, [`%${MARCA}%`]);
  } finally {
    cliente.release();
  }

  const restos = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM auth_role_permissions
      WHERE permiso_codigo IN ('reportes:read','pagos:manage','pagos:read')`
  );
  if (Number(restos.rows[0].c) > 0) {
    throw new Error(`La suite de reportes dejo ${restos.rows[0].c} concesiones en la base compartida`);
  }

  await closeTestPool(pool);
  await closePool();
});

beforeEach(async () => {
  // Limpieza COMPLETA por matricula: sin ella, los datos de una prueba
  // contaminan la siguiente y los totales del reporte no coinciden con la
  // consulta directa de ESA prueba. (Medido: asi fallaba la suite entera.)
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
    await client.query(`DELETE FROM auditoria WHERE detalle::text LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM mensualidades WHERE plan_pago_id IN (
        SELECT pl.id FROM planes_pago pl JOIN matriculas m ON m.id = pl.matricula_id
         WHERE m.observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM planes_pago WHERE matricula_id IN (
        SELECT id FROM matriculas WHERE observaciones LIKE $1)`, [MARCA_LIKE]);
    await client.query(`DELETE FROM matriculas WHERE observaciones LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM grados WHERE nombre LIKE $1`, [`%${MARCA}%`]);
    await client.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`D${MARCA}%`]);
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
    await client.query('DELETE FROM auth_login_limits');
  } finally {
    client.release();
  }
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

function hdrs(cookie: string, csrf: string): Record<string, string> {
  return { Cookie: cookie, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf };
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
  // UNA sola evaluacion del email: con dos Date.now() distintos, un milisegundo
  // entre ambas hace que el login use un email diferente del insertado.
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
  if (!cookieFrom(res)) {
    throw new Error(`no se pudo iniciar sesion de actor de prueba: status=${res.status} body=${JSON.stringify(res.body).slice(0, 180)}`);
  }
  return { cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

/** Montaje: estudiante, año, grado, tarifa y matrícula con N cuotas. */
async function montarMatricula(
  cookie: string,
  csrf: string,
  cuotas: number,
  montoTarifa = '1000.00'
): Promise<{ matriculaId: number; estudianteId: number; anio: number }> {
  const sufijo = Date.now().toString(36).slice(-4);
  const anio = ANIO + Math.floor(Math.random() * 40);

  const estudiante = await request(app)
    .post('/api/estudiantes')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      nombres: `Est${sufijo}`,
      apellidos: MARCA,
      documento_identidad: `D${MARCA}${sufijo}`,
    });
  expect(estudiante.status).toBe(201);
  const estudianteId = estudiante.body.estudiante.id;

  await pool.query(
    // ON CONFLICT DO NOTHING, y no DO UPDATE: el ano lectivo es un registro
    // COMPARTIDO entre suites. Esta suite usa anos 2186..2225, y el 2187 es de
    // `motor-aplicacion.test.ts`, que espera un rango amplio (2026-2099). Si
    // aqui se reescribiera el rango con el ano propio, la suite de motor
    // fallaria con "Fecha de vencimiento fuera del rango del ano lectivo"
    // (medido: asi ocurria en la segunda corrida de la suite completa).
    // Las fechas de esta suite (MM-10 del ano) caen dentro de ese rango amplio,
    // asi que DO NOTHING es correcto y no rompe a nadie.
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [anio, `${anio}-02-10`, `${anio}-11-10`]
  );
  const grado = await uno<{ id: number }>(
    'INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ($1, $2, (SELECT id FROM anio_lectivo WHERE anio = $3)) RETURNING id',
    [`${MARCA} ${sufijo}`, 'Primaria', anio]
  );
  const tarifa = await uno<{ id: number }>(
    `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
     VALUES ($1, $2::numeric, 'NIO', (SELECT id FROM anio_lectivo WHERE anio = $3), TRUE) RETURNING id`,
    [`${MARCA} ${sufijo}`, montoTarifa, anio]
  );

  const fechas: string[] = [];
  for (let i = 0; i < cuotas; i += 1) {
    fechas.push(`${anio}-${String(2 + i).padStart(2, '0')}-10`);
  }

  const matricula = await request(app)
    .post('/api/matriculas')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      estudiante_id: estudianteId,
      anio_lectivo_id: (await uno<{ id: number }>('SELECT id FROM anio_lectivo WHERE anio = $1', [anio])).id,
      grado_id: grado.id,
      observaciones: `${MARCA}-${sufijo}`,
      plan_pago: { tarifa_id: tarifa.id, fechas_vencimiento: fechas },
    });
  expect(matricula.status).toBe(201);
  return { matriculaId: matricula.body.matricula.id, estudianteId, anio };
}

async function pagar(
  cookie: string,
  csrf: string,
  matriculaId: number,
  monto: string,
  sufijo: string,
  fechaEfectiva: string
): Promise<number> {
  const res = await request(app)
    .post('/api/pagos')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      matricula_id: matriculaId,
      fecha_efectiva: fechaEfectiva,
      medios: [{ tipo: 'EFECTIVO', monto }],
      observaciones: `${MARCA}-${sufijo}`,
      idempotency_key: `${MARCA}-${sufijo}-${Date.now()}`,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.pago.id;
}

// ============================================================================
// PERMISOS
// ============================================================================

describe('permisos', () => {
  it('sin sesion devuelve 401', async () => {
    const res = await request(app).get('/api/reportes/recaudacion');
    expect(res.status).toBe(401);
  });

  it('sin reportes:read devuelve 403', async () => {
    const { cookie } = await actor(['estudiantes:manage', 'estudiantes:read']);
    const res = await request(app).get('/api/reportes/recaudacion').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('con reportes:read devuelve 200', async () => {
    const { cookie } = await actor();
    const res = await request(app).get('/api/reportes/recaudacion').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// RECAUDACION — totales contra registros almacenados
// ============================================================================

describe('recaudacion', () => {
  it('el total del reporte coincide con SUM de pagos NO anulados', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 3);
    await pagar(cookie, csrf, matriculaId, '2500.00', 'rec1', `${anio}-02-11`);

    const reporte = await request(app)
      .get(`/api/reportes/recaudacion?${RANGO_AMPLIO}`)
      .set('Cookie', cookie);
    expect(reporte.status).toBe(200);

    // Cifra esperada consultada DIRECTAMENTE a la tabla, no recalculada.
    const esperado = await uno<{ total: string; operaciones: number }>(
      `SELECT COUNT(*)::int AS operaciones,
              COALESCE(SUM(monto_total), 0)::text AS total
         FROM pagos
        WHERE estado NOT IN ('REVERTIDO','ANULADO')
          AND fecha_pago >= $1::timestamptz
          AND fecha_pago < ($2::date + interval '1 day')`,
      ['2020-01-01T00:00:00Z', '2035-12-31']
    );

    const filas = reporte.body.filas as Array<{ dia: string; total: string; operaciones: number }>;
    // Comparacion decimal exacta: NO se pasa por Number ni toFixed, que
    // redondearian y podrian ocultar diferencias de un centavo.
    const totalReporte = filas.map((f) => f.total).join('|');
    expect(filas.length).toBeGreaterThan(0);
    expect(totalReporte).toContain(esperado.total);
    const operacionesReporte = filas.reduce((acc, f) => acc + f.operaciones, 0);
    expect(operacionesReporte).toBe(esperado.operaciones);
    expect(operacionesReporte).toBe(esperado.operaciones);
  });

  it('una operacion revertida NO suma a la recaudacion pero SI se informa', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 2);
    const pagoId = await pagar(cookie, csrf, matriculaId, '1000.00', 'rec2', `${anio}-02-11`);

    const reversion = await request(app)
      .post(`/api/pagos/${pagoId}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Error de ventanilla' });
    expect(reversion.status).toBe(200);

    const reporte = await request(app)
      .get(`/api/reportes/recaudacion?${RANGO_AMPLIO}`)
      .set('Cookie', cookie);
    const filas = reporte.body.filas as Array<{
      total: string;
      operaciones: number;
      anuladas: number;
      total_anulado: string;
    }>;

    const recaudado = filas.reduce((acc, f) => acc + Number(f.total), 0);
    const anuladas = filas.reduce((acc, f) => acc + f.anuladas, 0);
    // El pago revertido queda FUERA de la recaudacion...
    expect(recaudado).toBe(0);
    // ...pero visible: el reporte no oculta la reversion (RN-SGPM-07).
    expect(anuladas).toBeGreaterThanOrEqual(2);
    const totalAnulado = filas.reduce((acc, f) => acc + Number(f.total_anulado), 0);
    expect(totalAnulado).toBeGreaterThan(0);
  });
});

// ============================================================================
// MOROSIDAD — sin reloj implicito
// ============================================================================

describe('morosidad', () => {
  it('sin fecha_corte devuelve 400 (no usa el reloj del servidor)', async () => {
    const { cookie } = await actor();
    const res = await request(app).get('/api/reportes/morosidad').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('con fecha_corte lista las cuotas vencidas y coincide con la consulta directa', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 3);

    const reporte = await request(app)
      .get(`/api/reportes/morosidad?fecha_corte=${anio}-06-15`)
      .set('Cookie', cookie);
    expect(reporte.status).toBe(200);

    const esperado = await uno<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM mensualidades m
         JOIN planes_pago pl ON pl.id = m.plan_pago_id
        WHERE pl.matricula_id = $1 AND m.saldo_pendiente > 0 AND m.fecha_vencimiento < $2`,
      [matriculaId, `${anio}-06-15`]
    );

    const filas = reporte.body.filas as Array<{ matricula_id: number; dias_vencida: number }>;
    const deEstaMatricula = filas.filter((f) => f.matricula_id === matriculaId);
    expect(deEstaMatricula.length).toBe(Number(esperado.c));
    for (const fila of deEstaMatricula) {
      expect(fila.dias_vencida).toBeGreaterThan(0);
    }
  });

  it('fecha_corte invalida devuelve 400', async () => {
    const { cookie } = await actor();
    const res = await request(app)
      .get('/api/reportes/morosidad?fecha_corte=2026-02-31')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// ESTUDIANTES PENDIENTES — refleja abonos parciales
// ============================================================================

describe('estudiantes con saldos pendientes', () => {
  it('despues de un abono parcial el saldo baja exactamente ese importe', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, estudianteId } = await montarMatricula(cookie, csrf, 2);

    const { anio } = await montarMatricula(cookie, csrf, 2);
    const antes = await request(app).get('/api/reportes/estudiantes-pendientes').set('Cookie', cookie);
    const antesFila = (antes.body.filas as Array<{ estudiante_id: number; saldo_total: string }>)
      .find((f) => f.estudiante_id === estudianteId);
    expect(antesFila?.saldo_total).toBe('2000.00');

    await pagar(cookie, csrf, matriculaId, '500.00', 'pend1', `${anio}-02-11`);

    const despues = await request(app).get('/api/reportes/estudiantes-pendientes').set('Cookie', cookie);
    const despuesFila = (despues.body.filas as Array<{ estudiante_id: number; saldo_total: string }>)
      .find((f) => f.estudiante_id === estudianteId);
    expect(despuesFila?.saldo_total).toBe('1500.00');
  });

  it('un estudiante sin deuda no aparece en el reporte', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, estudianteId, anio } = await montarMatricula(cookie, csrf, 1);
    await pagar(cookie, csrf, matriculaId, '1000.00', 'pend2', `${anio}-02-11`);

    const reporte = await request(app).get('/api/reportes/estudiantes-pendientes').set('Cookie', cookie);
    const filas = reporte.body.filas as Array<{ estudiante_id: number }>;
    expect(filas.some((f) => f.estudiante_id === estudianteId)).toBe(false);
  });
});

// ============================================================================
// OPERACIONES ANULADAS
// ============================================================================

describe('operaciones anuladas', () => {
  it('la reversion aparece con motivo, actor, fecha y referencia', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 1);
    const pagoId = await pagar(cookie, csrf, matriculaId, '1000.00', 'anu1', `${anio}-02-11`);

    const reversion = await request(app)
      .post(`/api/pagos/${pagoId}/reversar`)
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({ motivo: 'Pago duplicado por doble clic' });
    expect(reversion.status).toBe(200);

    const reporte = await request(app).get('/api/reportes/operaciones-anuladas').set('Cookie', cookie);
    expect(reporte.status).toBe(200);
    const filas = reporte.body.filas as Array<{
      id: number;
      estado: string;
      revertido_motivo: string | null;
      reversion_pago_id: number | null;
      monto_total: string;
    }>;

    const laReversion = filas.find((f) => f.id === pagoId);
    expect(laReversion).toBeDefined();
    expect(laReversion?.estado).toBe('REVERTIDO');
    expect(laReversion?.revertido_motivo).toBe('Pago duplicado por doble clic');
    expect(typeof laReversion?.reversion_pago_id).toBe('number');
    expect(laReversion?.monto_total).toBe('1000.00');

    // La operacion inversa tambien queda visible.
    expect(filas.some((f) => f.id === laReversion?.reversion_pago_id)).toBe(true);
  });
});

// ============================================================================
// MOVIMIENTOS POR CAJERO
// ============================================================================

describe('movimientos por cajero', () => {
  it('agrupa por usuario y el total coincide con la consulta directa', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 3);
    await pagar(cookie, csrf, matriculaId, '1500.00', 'caj1', `${anio}-02-11`);

    const reporte = await request(app).get('/api/reportes/movimientos-por-cajero').set('Cookie', cookie);
    expect(reporte.status).toBe(200);

    const esperado = await uno<{ total: string }>(
      `SELECT COALESCE(SUM(monto_total), 0)::text AS total FROM pagos
        WHERE estado NOT IN ('REVERTIDO','ANULADO')
          AND matricula_id IN (SELECT id FROM matriculas WHERE observaciones LIKE $1)`,
      [MARCA_LIKE]
    );
    const filas = reporte.body.filas as Array<{ total: string; operaciones: number }>;
    const total = filas.reduce((acc, f) => acc + Number(f.total), 0).toFixed(2);
    expect(total).toBe(esperado.total);
    expect(filas.reduce((acc, f) => acc + f.operaciones, 0)).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// ESTADO DE CUENTA
// ============================================================================

describe('estado de cuenta', () => {
  it('refleja cuotas pagadas, pendientes, pagos y anulados del estudiante', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, estudianteId, anio } = await montarMatricula(cookie, csrf, 2);
    await pagar(cookie, csrf, matriculaId, '500.00', 'ec1', `${anio}-02-11`);

    const res = await request(app)
      .get(`/api/reportes/estado-cuenta/${estudianteId}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.cuotas_total).toBe(2);
    expect(res.body.cuotas_pendientes).toBe(2);
    expect(res.body.saldo_total).toBe('1500.00');
    expect(res.body.pagos_registrados).toBe(1);
    expect(res.body.pagos_anulados).toBe(0);
    expect(typeof res.body.saldo_total).toBe('string');
  });

  it('estudiante inexistente devuelve 404', async () => {
    const { cookie } = await actor();
    const res = await request(app).get('/api/reportes/estado-cuenta/999999999').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('ID invalido devuelve 400', async () => {
    const { cookie } = await actor();
    const res = await request(app).get('/api/reportes/estado-cuenta/abc').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// MATRICULAS REGISTRADAS Y PAGOS POR PERIODO
// ============================================================================

describe('matriculas registradas y pagos por periodo', () => {
  it('agrupa por anio y por grado', async () => {
    const { cookie, csrf } = await actor();
    await montarMatricula(cookie, csrf, 1);

    const porAnio = await request(app)
      .get('/api/reportes/matriculas-registradas?agrupacion=anio')
      .set('Cookie', cookie);
    expect(porAnio.status).toBe(200);
    expect((porAnio.body.grupos as unknown[]).length).toBeGreaterThan(0);

    const porGrado = await request(app)
      .get('/api/reportes/matriculas-registradas?agrupacion=grado')
      .set('Cookie', cookie);
    expect(porGrado.status).toBe(200);

    const agrupacionInvalida = await request(app)
      .get('/api/reportes/matriculas-registradas?agrupacion=olor')
      .set('Cookie', cookie);
    expect(agrupacionInvalida.status).toBe(400);
  });

  it('lista pagos del periodo con importes como strings exactos', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 2);
    await pagar(cookie, csrf, matriculaId, '1234.56', 'pp1', `${anio}-02-11`);

    const res = await request(app)
      .get(`/api/reportes/pagos-por-periodo?${RANGO_AMPLIO}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const filas = res.body.filas as Array<{ monto_total: string }>;
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(typeof fila.monto_total).toBe('string');
    }
    expect(filas.some((f) => f.monto_total === '1234.56')).toBe(true);
  });

  it('rango invertido devuelve 400', async () => {
    const { cookie } = await actor();
    const res = await request(app)
      .get('/api/reportes/recaudacion?desde=2026-12-31&hasta=2026-01-01')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('medios de pago desglosa por tipo sin contar anulados', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, anio } = await montarMatricula(cookie, csrf, 2);
    await pagar(cookie, csrf, matriculaId, '1000.00', 'med1', `${anio}-02-11`);

    const res = await request(app)
      .get(`/api/reportes/medios?${RANGO_AMPLIO}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const medios = res.body.medios as Array<{ tipo: string; total: string }>;
    const efectivo = medios.find((m) => m.tipo === 'EFECTIVO');
    expect(efectivo?.total).toBe('1000.00');
  });
});
