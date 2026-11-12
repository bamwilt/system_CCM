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
 * BUSQUEDA DE A QUIEN COBRAR (FASE 9.B) — PRUEBAS
 * ============================================================================
 *
 * El motivo de esta suite es una queja real de uso: "tengo que adivinar el
 * numero de matricula". Aqui se verifica que la ventanilla pueda buscar por
 * como se habla en el colegio (nombre, apellido, grado, documento) y que la
 * deuda que se muestra sea la ALMACENADA, no un recalculo.
 *
 * Cada cifra se contrasta con una consulta directa a `mensualidades`: si la
 * busqueda sumara distinto, la prueba falla.
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

const MARCA = 'B9';
const MARCA_LIKE = `${MARCA}-%`;
/**
 * Año propio de esta suite, en un rango que NADIE mas usa: chocar con el año
 * de otra suite significa pelear por el rango de fechas del mismo registro
 * `anio_lectivo` (medido: así se rompió la suite de motor, que inserta con
 * `ON CONFLICT DO NOTHING` y espera un rango amplio).
 */
const ANIO = 2400;
const ANIO_ANCHO = 30;
const GRANTS = [
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

  // Igual que la suite de reportes: antes de reaplicar migraciones se quitan
  // las concesiones que no reconoce el check de `auth_role_permissions`, o el
  // ALTER TABLE de la migracion 004 falla sobre filas existentes.
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
    await client.query(`DELETE FROM auditoria WHERE detalle::text LIKE $1`, [MARCA_LIKE]);
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
  // La suite DEJA LA BASE COMO LA ENCONTRO: comparte la instancia de prueba
  // con las demas, y un resto en `auth_role_permissions` impide que la
  // siguiente reaplique migraciones (check constraint). Verificado: asi
  // fallaba `proyecciones-financieras.test.ts` despues de esta suite.
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
        AND rp.permiso_codigo IN ('pagos:manage','pagos:read','estudiantes:manage','estudiantes:read')`,
    [`%${MARCA}%`]
  );
  if (Number(restos.rows[0].c) > 0) {
    throw new Error(`La suite de busqueda dejo ${restos.rows[0].c} concesiones en la base compartida`);
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
  return { cookie: cookieFrom(res), csrf: (res.body?.csrfToken as string) ?? '' };
}

/**
 * Monta una matricula real (con plan y cuotas) y opcionalmente un pago parcial,
 * para que la deuda mostrada no sea un numero escrito a mano.
 */
async function montar(
  cookie: string,
  csrf: string,
  datos: {
    nombres: string;
    apellidos: string;
    documento: string;
    grado: string;
    cuotas: number;
    montoCuota?: string;
    pagosParciales?: number;
  }
): Promise<{ matriculaId: number; estudianteId: number; saldo: string }> {
  const sufijo = Date.now().toString(36).slice(-4);
  const anio = ANIO + Math.floor(Math.random() * ANIO_ANCHO);
  const montoCuota = datos.montoCuota ?? '1000.00';

  const estudiante = await request(app)
    .post('/api/estudiantes')
    .set(hdrs(cookie, csrf))
    .set('Content-Type', 'application/json')
    .send({
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      documento_identidad: datos.documento,
    });
  expect(estudiante.status).toBe(201);
  const estudianteId = estudiante.body.estudiante.id;

  await pool.query(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (anio) DO UPDATE SET fecha_inicio = EXCLUDED.fecha_inicio,
       fecha_fin = EXCLUDED.fecha_fin, activo = TRUE`,
    [anio, `${anio}-02-10`, `${anio}-11-10`]
  );
  const grado = await uno<{ id: number }>(
    'INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ($1, $2, (SELECT id FROM anio_lectivo WHERE anio = $3)) RETURNING id',
    [datos.grado, 'Primaria', anio]
  );
  const tarifa = await uno<{ id: number }>(
    `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
     VALUES ($1, $2::numeric, 'NIO', (SELECT id FROM anio_lectivo WHERE anio = $3), TRUE) RETURNING id`,
    // El monto de la tarifa es el de CADA cuota: el plan multiplica por la
    // cantidad de vencimientos.
    [`${MARCA} ${sufijo}`, montoCuota, anio]
  );

  const fechas: string[] = [];
  for (let i = 0; i < datos.cuotas; i += 1) {
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
  const matriculaId = matricula.body.matricula.id as number;

  for (let i = 0; i < (datos.pagosParciales ?? 0); i += 1) {
    const pago = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: matriculaId,
        fecha_efectiva: fechas[0],
        medios: [{ tipo: 'EFECTIVO', monto: '100.00' }],
      });
    expect(pago.status).toBe(201);
  }

  const saldo = await uno<{ s: string }>(
    `SELECT COALESCE(SUM(m.saldo_pendiente), 0)::text AS s
       FROM mensualidades m JOIN planes_pago pl ON pl.id = m.plan_pago_id
      WHERE pl.matricula_id = $1`,
    [matriculaId]
  );
  return { matriculaId, estudianteId, saldo: saldo.s };
}

// ---------------------------------------------------------------------------
// BUSQUEDA
// ---------------------------------------------------------------------------

describe('buscar a quien cobrar', () => {
  it('encuentra por fragmento de nombre y muestra la deuda ALMACENADA', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, saldo } = await montar(cookie, csrf, {
      nombres: 'María Alejandra',
      apellidos: `Perez ${MARCA}`,
      documento: `${MARCA}-DOC-1`,
      grado: `${MARCA} Tercero`,
      cuotas: 3,
    });

    const res = await request(app).get('/api/pagos/buscar-deudor?q=Mar%C3%ADa').set(hdrs(cookie, csrf));
    expect(res.status).toBe(200);
    const fila = res.body.filas.find((f: { matricula_id: number }) => f.matricula_id === matriculaId);
    expect(fila).toBeDefined();
    // Nombre completo, no un numero suelto.
    expect(fila.nombre).toContain('María Alejandra');
    expect(fila.nombre).toContain('Perez');
    // Grado y moneda: contexto para no equivocarse de familia.
    expect(fila.grado).toBe(`${MARCA} Tercero`);
    expect(fila.moneda).toBe('NIO');
    // La deuda coincide con la suma de saldos almacenados.
    expect(fila.saldo_total).toBe(saldo);
    expect(Number(fila.cuotas_pendientes)).toBe(3);
    expect(fila.proximo_vencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('encuentra por apellido y por grado, y es insensible a acentos', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId } = await montar(cookie, csrf, {
      nombres: 'José Ángel',
      apellidos: `Ñuñoa ${MARCA}`,
      documento: `${MARCA}-DOC-2`,
      grado: `${MARCA} Sexto`,
      cuotas: 2,
    });

    // Sin tilde en la busqueda: "Jose" debe encontrar a "José".
    const porNombre = await request(app).get('/api/pagos/buscar-deudor?q=Jose').set(hdrs(cookie, csrf));
    expect(porNombre.status).toBe(200);
    expect(
      porNombre.body.filas.some((f: { matricula_id: number }) => f.matricula_id === matriculaId)
    ).toBe(true);

    const porApellido = await request(app)
      .get(`/api/pagos/buscar-deudor?q=${encodeURIComponent(`Ñuñoa ${MARCA}`)}`)
      .set(hdrs(cookie, csrf));
    expect(porApellido.status).toBe(200);
    expect(
      porApellido.body.filas.some((f: { matricula_id: number }) => f.matricula_id === matriculaId)
    ).toBe(true);

    const porGrado = await request(app)
      .get(`/api/pagos/buscar-deudor?q=${encodeURIComponent(`${MARCA} Sexto`)}`)
      .set(hdrs(cookie, csrf));
    expect(porGrado.status).toBe(200);
    expect(
      porGrado.body.filas.some((f: { matricula_id: number }) => f.matricula_id === matriculaId)
    ).toBe(true);
  });

  it('la deuda baja al registrar un pago parcial (lee saldo, no lo recalcula)', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId, saldo: saldoInicial } = await montar(cookie, csrf, {
      nombres: 'Carlos',
      apellidos: `Lopez ${MARCA}`,
      documento: `${MARCA}-DOC-3`,
      grado: `${MARCA} Cuarto`,
      cuotas: 2,
    });
    const conPago = await montar(cookie, csrf, {
      nombres: 'Ana',
      apellidos: `Diaz ${MARCA}`,
      documento: `${MARCA}-DOC-4`,
      grado: `${MARCA} Quinto`,
      cuotas: 2,
      pagosParciales: 2,
    });

    const res = await request(app).get(`/api/pagos/buscar-deudor?q=${MARCA}`).set(hdrs(cookie, csrf));
    expect(res.status).toBe(200);
    const filaPura = res.body.filas.find((f: { matricula_id: number }) => f.matricula_id === matriculaId);
    const filaPagada = res.body.filas.find((f: { matricula_id: number }) => f.matricula_id === conPago.matriculaId);

    expect(filaPura.saldo_total).toBe(saldoInicial);
    // Dos pagos de 100 sobre 2000 de deuda: quedan 1800 almacenados.
    expect(filaPagada.saldo_total).toBe('1800.00');
    expect(Number(filaPagada.cuotas_pendientes)).toBe(2);
  });

  it('los filtros funcionan sobre la tabla: grado, deuda y texto parcial', async () => {
    const { cookie, csrf } = await actor();
    const estudiante = await montar(cookie, csrf, {
      nombres: 'María Alejandra',
      apellidos: `Perez ${MARCA}`,
      documento: `${MARCA}-DOC-1`,
      grado: `${MARCA} Tercero`,
      cuotas: 3,
    });
    const otro = await montar(cookie, csrf, {
      nombres: 'José Ángel',
      apellidos: `Ñuñoa ${MARCA}`,
      documento: `${MARCA}-DOC-2`,
      grado: `${MARCA} Sexto`,
      cuotas: 2,
    });

    // Sin filtros se listan las matriculas activas (tabla de trabajo).
    const todas = await request(app).get('/api/pagos/buscar-deudor?limite=50').set(hdrs(cookie, csrf));
    expect(todas.status).toBe(200);
    expect(todas.body.filas.some((f: { matricula_id: number }) => f.matricula_id === estudiante.matriculaId)).toBe(true);
    expect(todas.body.filas.some((f: { matricula_id: number }) => f.matricula_id === otro.matriculaId)).toBe(true);
    // La lista de grados alimenta el filtro desplegable.
    expect(todas.body.grados).toContain(`${MARCA} Tercero`);
    expect(todas.body.grados).toContain(`${MARCA} Sexto`);

    // Por grado: solo la del grado pedido.
    const porGrado = await request(app)
      .get(`/api/pagos/buscar-deudor?grado=${encodeURIComponent(`${MARCA} Tercero`)}&limite=50`)
      .set(hdrs(cookie, csrf));
    expect(porGrado.status).toBe(200);
    expect(porGrado.body.filas.some((f: { matricula_id: number }) => f.matricula_id === estudiante.matriculaId)).toBe(true);
    expect(porGrado.body.filas.some((f: { matricula_id: number }) => f.matricula_id === otro.matriculaId)).toBe(false);

    // Por texto parcial sobre el APELLIDO.
    const porApellido = await request(app)
      .get(`/api/pagos/buscar-deudor?q=${encodeURIComponent(`uñoa ${MARCA}`)}&limite=50`)
      .set(hdrs(cookie, csrf));
    expect(porApellido.status).toBe(200);
    expect(porApellido.body.filas.some((f: { matricula_id: number }) => f.matricula_id === otro.matriculaId)).toBe(true);
    expect(porApellido.body.filas.some((f: { matricula_id: number }) => f.matricula_id === estudiante.matriculaId)).toBe(false);

    // Filtro "solo con deuda": al pagar todo, la persona sale del listado.
    const pagoTotal = otro.saldo.replace('.00', '');
    const r = await request(app)
      .post('/api/pagos')
      .set(hdrs(cookie, csrf))
      .set('Content-Type', 'application/json')
      .send({
        matricula_id: otro.matriculaId,
        fecha_efectiva: '2026-03-10',
        medios: [{ tipo: 'EFECTIVO', monto: otro.saldo }],
      });
    expect(r.status).toBe(201);
    expect(pagoTotal.length).toBeGreaterThan(0);

    const conDeuda = await request(app)
      .get('/api/pagos/buscar-deudor?deuda=pendiente&limite=50')
      .set(hdrs(cookie, csrf));
    expect(conDeuda.status).toBe(200);
    expect(conDeuda.body.filas.some((f: { matricula_id: number }) => f.matricula_id === estudiante.matriculaId)).toBe(true);
    expect(conDeuda.body.filas.some((f: { matricula_id: number }) => f.matricula_id === otro.matriculaId)).toBe(false);
  });

  it('no ofrece matriculas DESACTIVADAS', async () => {
    const { cookie, csrf } = await actor();
    const { matriculaId } = await montar(cookie, csrf, {
      nombres: 'Baja',
      apellidos: `Temporal ${MARCA}`,
      documento: `${MARCA}-DOC-5`,
      grado: `${MARCA} Primero`,
      cuotas: 1,
    });
    await pool.query('UPDATE matriculas SET estado = $1 WHERE id = $2', ['DESACTIVADA', matriculaId]);

    const res = await request(app).get(`/api/pagos/buscar-deudor?q=Temporal%20${MARCA}`).set(hdrs(cookie, csrf));
    expect(res.status).toBe(200);
    expect(res.body.filas.some((f: { matricula_id: number }) => f.matricula_id === matriculaId)).toBe(false);
  });

  it('sin resultados devuelve lista vacia, no error', async () => {
    const { cookie, csrf } = await actor();
    const res = await request(app).get('/api/pagos/buscar-deudor?q=Zzzzzz').set(hdrs(cookie, csrf));
    expect(res.status).toBe(200);
    expect(res.body.filas).toEqual([]);
  });

  it('rechaza filtros demasiado cortos y los comodines de LIKE', async () => {
    const { cookie, csrf } = await actor();
    const corto = await request(app).get('/api/pagos/buscar-deudor?q=a').set(hdrs(cookie, csrf));
    expect(corto.status).toBe(400);

    const comodin = await request(app).get('/api/pagos/buscar-deudor?q=%25').set(hdrs(cookie, csrf));
    expect(comodin.status).toBe(400);

    const gradoCorto = await request(app).get('/api/pagos/buscar-deudor?grado=a').set(hdrs(cookie, csrf));
    expect(gradoCorto.status).toBe(400);

    const deudaInvalida = await request(app).get('/api/pagos/buscar-deudor?deuda=todavia').set(hdrs(cookie, csrf));
    expect(deudaInvalida.status).toBe(400);

    // SIN filtros el listado se devuelve completo: es la tabla de trabajo.
    const sinFiltros = await request(app).get('/api/pagos/buscar-deudor?limite=50').set(hdrs(cookie, csrf));
    expect(sinFiltros.status).toBe(200);
    expect(Array.isArray(sinFiltros.body.filas)).toBe(true);
  });

  it('sin permiso de cobro no expone la busqueda', async () => {
    const { cookie, csrf } = await actor(['estudiantes:read']);
    const res = await request(app).get('/api/pagos/buscar-deudor?q=Mar%C3%ADa').set(hdrs(cookie, csrf));
    expect([401, 403]).toContain(res.status);
  });
});
