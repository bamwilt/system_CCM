import { vi } from 'vitest';
vi.hoisted(async () => {
  const { TEST_SOCKET_DIR } = await import('./auth/testEnv.js');
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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './auth/testDb';
import { closePool } from '../src/config/database';
import { ObligacionesRepository } from '../src/repositories/obligaciones.repository';
import type { CuotaProyeccion, ObligacionesRow } from '../src/repositories/obligaciones.repository';
import {
  SALDO_CERO_PROYECTADO,
  ObligacionesService,
  esPositivoExacto,
} from '../src/services/obligaciones.service';
import type { ProyeccionObligaciones } from '../src/services/obligaciones.service';
import { AppError } from '../src/middleware/errorHandler';

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

const MARCA = 'OBL6A-S';
const ANIO_PRINCIPAL = 2026;
const ANIO_OTRO = 2099;

/** Tablas cuyo contenido logico se compara antes/despues de las lecturas. */
const TABLAS_HASH = [
  'matriculas',
  'planes_pago',
  'mensualidades',
  'pagos',
  'pago_aplicaciones',
  'tarifas',
  'auditoria',
  'estudiantes',
] as const;

/** Identificador de matricula que no existe (nunca asignado por el serial). */
const MATRICULA_INEXISTENTE = 2147483646;

interface Fixtures {
  matMixed: number;
  matCentavos: number;
  matGrandes: number;
  matCero: number;
  matNegativo: number;
  matSinPlan: number;
  matSinCuotas: number;
  matLegacy: number;
  tarifaUsd: number;
  matNaN: number;
  planNaN: number;
  matAnioA: number;
  matAnioB: number;
  matOtroEstudiante: number;
}

let pool: Pool;
let hashPool: Pool;
let esc: Fixtures;

async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

async function limpiarFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM mensualidades
        WHERE plan_pago_id IN (
          SELECT p.id FROM planes_pago p
            JOIN matriculas m ON m.id = p.matricula_id
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [`${MARCA}%`]
    );
    await client.query(
      `DELETE FROM planes_pago
        WHERE matricula_id IN (
          SELECT m.id FROM matriculas m
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [`${MARCA}%`]
    );
    await client.query(
      `DELETE FROM matriculas
        WHERE estudiante_id IN (SELECT id FROM estudiantes WHERE documento_identidad LIKE $1)`,
      [`${MARCA}%`]
    );
    await client.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [`${MARCA}%`]);
    await client.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [`${MARCA}%`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function asegurarReferencia(): Promise<{ anioId: number; otroAnioId: number }> {
  await q(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo)
     VALUES ($1, '2026-02-01', '2026-11-30', TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [ANIO_PRINCIPAL]
  );
  await q(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo)
     VALUES ($1, '2099-02-01', '2099-11-30', TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [ANIO_OTRO]
  );
  for (const anio of [ANIO_PRINCIPAL, ANIO_OTRO]) {
    await q(
      `INSERT INTO grados (nombre, nivel, anio_lectivo_id)
       SELECT $1, 'Primaria', id FROM anio_lectivo WHERE anio = $2
       ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING`,
      [`${MARCA} Grado`, anio]
    );
  }
  const [principal] = await q<{ id: number }>(
    `SELECT a.id FROM anio_lectivo a JOIN grados g ON g.anio_lectivo_id = a.id
      WHERE a.anio = $1 AND g.nombre = $2 LIMIT 1`,
    [ANIO_PRINCIPAL, `${MARCA} Grado`]
  );
  const [otro] = await q<{ id: number }>(
    `SELECT a.id FROM anio_lectivo a JOIN grados g ON g.anio_lectivo_id = a.id
      WHERE a.anio = $1 AND g.nombre = $2 LIMIT 1`,
    [ANIO_OTRO, `${MARCA} Grado`]
  );
  return { anioId: principal.id, otroAnioId: otro.id };
}

async function crearMatricula(documento: string, anioId: number): Promise<number> {
  await q(`INSERT INTO estudiantes (nombres, apellidos, documento_identidad) VALUES ($1, $2, $3)`, [
    'Fixture',
    '6A',
    documento,
  ]);
  const rows = await q<{ id: number }>(
    `INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado)
     SELECT e.id, $1, g.id, 'ACTIVA'
       FROM estudiantes e
       JOIN grados g ON g.anio_lectivo_id = $1 AND g.nombre = $3
      WHERE e.documento_identidad = $2
      RETURNING id`,
    [anioId, documento, `${MARCA} Grado`]
  );
  return rows[0].id;
}

async function crearPlan(
  matriculaId: number,
  total: number,
  monto: string,
  moneda: string | null
): Promise<number> {
  await q(
    `INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, $2, $3, $4)`,
    [matriculaId, total, monto, moneda]
  );
  const rows = await q<{ id: number }>(`SELECT id FROM planes_pago WHERE matricula_id = $1`, [
    matriculaId,
  ]);
  return rows[0].id;
}

async function crearCuotas(
  planId: number,
  cuotas: Array<{ n: number; saldo: string; fecha: string }>
): Promise<void> {
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     SELECT $1, c.n, 'C' || c.n, c.saldo::numeric(12,2), '0.00', c.saldo::numeric(12,2),
            c.fecha::date, 'PENDIENTE', '0.00'
       FROM (VALUES ${cuotas.map((_c, i) => `($${i * 3 + 2}::int, $${i * 3 + 3}::text, $${i * 3 + 4}::date)`).join(', ')}) AS c(n, saldo, fecha)`,
    [planId, ...cuotas.flatMap((c) => [c.n, c.saldo, c.fecha])]
  );
}

async function crearFixtures(): Promise<Fixtures> {
  const { anioId, otroAnioId } = await asegurarReferencia();

  const matMixed = await crearMatricula(`${MARCA}-MIX`, anioId);
  await crearPlan(matMixed, 3, '100.00', 'NIO');
  await crearCuotas(await idPlanDe(matMixed), [
    { n: 1, saldo: '1000.00', fecha: '2026-03-15' },
    { n: 2, saldo: '-30.00', fecha: '2026-01-31' },
    { n: 3, saldo: '234.50', fecha: '2026-12-31' },
  ]);

  const matCentavos = await crearMatricula(`${MARCA}-CENT`, anioId);
  await crearPlan(matCentavos, 4, '0.01', 'NIO');
  await crearCuotas(await idPlanDe(matCentavos), [
    { n: 1, saldo: '0.01', fecha: '2026-02-28' },
    { n: 2, saldo: '0.01', fecha: '2026-03-31' },
    { n: 3, saldo: '-0.01', fecha: '2026-04-30' },
    { n: 4, saldo: '0.01', fecha: '2026-05-31' },
  ]);

  const matGrandes = await crearMatricula(`${MARCA}-BIG`, otroAnioId);
  const planGrandes = await crearPlan(matGrandes, 60, '9999999999.99', 'NIO');
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     SELECT $1, g, 'C' || g, '9999999999.99', '0.00', '9999999999.99', '2026-04-30', 'PENDIENTE', '0.00'
       FROM generate_series(1, 60) g`,
    [planGrandes]
  );

  const matCero = await crearMatricula(`${MARCA}-ZERO`, anioId);
  await crearPlan(matCero, 2, '500.00', 'NIO');
  await crearCuotas(await idPlanDe(matCero), [
    { n: 1, saldo: '0.00', fecha: '2026-06-30' },
    { n: 2, saldo: '0.00', fecha: '2026-07-31' },
  ]);

  const matNegativo = await crearMatricula(`${MARCA}-NEG`, anioId);
  await crearPlan(matNegativo, 3, '100.00', 'NIO');
  await crearCuotas(await idPlanDe(matNegativo), [
    { n: 1, saldo: '-5000.00', fecha: '2026-08-31' },
    { n: 2, saldo: '120.00', fecha: '2026-09-30' },
    { n: 3, saldo: '3.00', fecha: '2026-10-31' },
  ]);

  const matSinPlan = await crearMatricula(`${MARCA}-NOPLAN`, anioId);

  const matSinCuotas = await crearMatricula(`${MARCA}-NOCUOTAS`, anioId);
  await crearPlan(matSinCuotas, 4, '250.00', 'USD');

  const tarifaUsd = (
    await q<{ id: number }>(
      `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
       VALUES ($1, '123.45', 'USD', $2, TRUE) RETURNING id`,
      [`${MARCA} Tarifa vigente`, anioId]
    )
  )[0].id;
  const matLegacy = await crearMatricula(`${MARCA}-LEGACY`, anioId);
  await q(
    `INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda, tarifa_id)
     VALUES ($1, 2, '123.45', NULL, $2)`,
    [matLegacy, tarifaUsd]
  );
  await crearCuotas(await idPlanDe(matLegacy), [
    { n: 1, saldo: '123.45', fecha: '2026-01-15' },
    { n: 2, saldo: '123.45', fecha: '2026-02-15' },
  ]);

  const matNaN = await crearMatricula(`${MARCA}-NAN`, anioId);
  const planNaN = await crearPlan(matNaN, 1, '100.00', 'NIO');
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     VALUES ($1, 1, 'C1', '100.00', '0.00', 'NaN', '2026-10-31', 'PENDIENTE', '0.00')`,
    [planNaN]
  );

  await q(`INSERT INTO estudiantes (nombres, apellidos, documento_identidad) VALUES ($1, $2, $3)`, [
    'Fixture',
    '6A',
    `${MARCA}-DOSANIOS`,
  ]);
  const [estudianteDosAnios] = await q<{ id: number }>(
    `SELECT id FROM estudiantes WHERE documento_identidad = $1`,
    [`${MARCA}-DOSANIOS`]
  );
  const [matAnioA] = await q<{ id: number }>(
    `INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado)
     SELECT $1, a.id, g.id, 'ACTIVA' FROM anio_lectivo a
       JOIN grados g ON g.anio_lectivo_id = a.id AND g.nombre = $3
      WHERE a.anio = $2 RETURNING id`,
    [estudianteDosAnios.id, ANIO_PRINCIPAL, `${MARCA} Grado`]
  );
  const [matAnioB] = await q<{ id: number }>(
    `INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado)
     SELECT $1, a.id, g.id, 'ACTIVA' FROM anio_lectivo a
       JOIN grados g ON g.anio_lectivo_id = a.id AND g.nombre = $3
      WHERE a.anio = $2 RETURNING id`,
    [estudianteDosAnios.id, ANIO_OTRO, `${MARCA} Grado`]
  );
  for (const mat of [matAnioA.id, matAnioB.id]) {
    await crearPlan(mat, 2, '10.00', 'NIO');
  }
  await crearCuotas(await idPlanDe(matAnioA.id), [
    { n: 1, saldo: '10.00', fecha: '2026-02-15' },
    { n: 2, saldo: '5.00', fecha: '2026-03-15' },
  ]);
  await crearCuotas(await idPlanDe(matAnioB.id), [
    { n: 1, saldo: '700.00', fecha: '2099-02-15' },
    { n: 2, saldo: '800.00', fecha: '2099-03-15' },
  ]);

  const matOtroEstudiante = await crearMatricula(`${MARCA}-OTROEST`, anioId);
  await crearPlan(matOtroEstudiante, 1, '3.00', 'USD');
  await crearCuotas(await idPlanDe(matOtroEstudiante), [
    { n: 1, saldo: '3.00', fecha: '2026-04-15' },
  ]);

  return {
    matMixed,
    matCentavos,
    matGrandes,
    matCero,
    matNegativo,
    matSinPlan,
    matSinCuotas,
    matLegacy,
    tarifaUsd,
    matNaN,
    planNaN,
    matAnioA: matAnioA.id,
    matAnioB: matAnioB.id,
    matOtroEstudiante,
  };
}

async function idPlanDe(matriculaId: number): Promise<number> {
  const rows = await q<{ id: number }>(`SELECT id FROM planes_pago WHERE matricula_id = $1`, [
    matriculaId,
  ]);
  return rows[0].id;
}

/**
 * Hash logico por tabla: recuento + md5 concatenado de cada fila (orden
 * determinista). Se calcula en tiempo de ejecucion: nunca se codifica un
 * recuento esperado.
 *
 * Conexion dedicada con DateStyle/TimeZone fijados: `t::text` de columnas
 * timestamptz/date depende de ambos parametros de sesion, asi que fijarlos
 * evita que el hash mida el entorno en lugar del contenido.
 */
async function hashLogico(): Promise<Record<string, string>> {
  const cliente = await hashPool.connect();
  try {
    await cliente.query(`SET DateStyle = 'ISO, MDY'`);
    await cliente.query(`SET TimeZone = 'UTC'`);
    const salida: Record<string, string> = {};
    for (const tabla of TABLAS_HASH) {
      const rows = await cliente.query<{ n: string; h: string }>(
        `SELECT COUNT(*)::text AS n,
                COALESCE(MD5(STRING_AGG(fila, '' ORDER BY fila)), 'SIN_FILAS') AS h
           FROM (SELECT MD5(t::text) AS fila FROM ${tabla} t) s`
      );
      salida[tabla] = `${rows.rows[0].n}|${rows.rows[0].h}`;
    }
    return salida;
  } finally {
    await cliente.query(`RESET ALL`).catch(() => undefined);
    cliente.release();
  }
}

/* ------------------------------------------------------------------ *
 * Pool real instrumentado (contador de consultas) y pool delegado.    *
 * Delegan en PostgreSQL real: no son mocks del codigo bajo prueba.    *
 * ------------------------------------------------------------------ */

interface ConsultaRegistrada {
  texto: string;
  valores: unknown[];
}

class PoolContador {
  readonly consultas: ConsultaRegistrada[] = [];
  constructor(private readonly interno: Pool) {}

  async query(
    texto: string | { text: string; values?: unknown[] },
    valores?: unknown[]
  ): Promise<QueryResult<QueryResultRow>> {
    const sql = typeof texto === 'string' ? texto : texto.text;
    const params = typeof texto === 'string' ? valores ?? [] : texto.values ?? [];
    this.consultas.push({ texto: sql, valores: params });
    return this.interno.query(sql, params);
  }
}

class PoolDelegado {
  constructor(private readonly cliente: PoolClient) {}

  async query(
    texto: string | { text: string; values?: unknown[] },
    valores?: unknown[]
  ): Promise<QueryResult<QueryResultRow>> {
    return this.cliente.query(texto, valores ?? []);
  }
}

/**
 * Contrato minimo que consume el repositorio: una consulta con texto y
 * parametros. Mas angosto que `Pool` a proposito (segregacion de interfaces):
 * un doble de prueba solo necesita implementar `query`. Tambien admite dobles
 * que devuelven una respuesta parcial (`{ rows }`), que es lo unico que el
 * servicio observa.
 */
type RespuestaParcial = { rows: unknown[] };
interface ConsultaMinima {
  query(
    texto: string | { text: string; values?: unknown[] },
    valores?: unknown[]
  ): Promise<QueryResult<QueryResultRow> | RespuestaParcial>;
}

/** El contrato usado por el repositorio es unicamente `query` (Pool inyectable). */
function inyectarPool(objeto: ConsultaMinima): Pool {
  return objeto as unknown as Pool;
}

/** Devuelve null cuando la proyeccion no aporta un resumen fiable. */
function esPositivo(proyeccion: ProyeccionObligaciones): boolean | null {
  if (!('resumen' in proyeccion) || proyeccion.resumen === null) return null;
  return proyeccion.resumen.tiene_saldo_positivo;
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  pool = await createTestPool();
  hashPool = new Pool({
    connectionString: getTestDatabaseUrl() ?? undefined,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  await hashPool.connect().then((c) => c.release());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of MIG_FILES) {
      await client.query<QueryResultRow>(readFileSync(file, 'utf8'));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await limpiarFixtures().catch(() => undefined);
  await closeTestPool(hashPool);
  await closeTestPool(pool);
  await closePool().catch(() => undefined);
});

beforeEach(async () => {
  await limpiarFixtures();
  esc = await crearFixtures();
});

afterEach(async () => {
  await limpiarFixtures();
});

describe('ObligacionesService — union discriminada de los cinco estados (BD real)', () => {
  it('MATRICULA_INEXISTENTE: no incluye resumen y no equivale a deuda cero', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(MATRICULA_INEXISTENTE);

    expect(proyeccion.estado).toBe('MATRICULA_INEXISTENTE');
    expect(proyeccion.matricula_id).toBe(MATRICULA_INEXISTENTE);
    // No hay resumen en absoluto: no se puede confundir con saldo 0.00.
    expect(proyeccion).not.toHaveProperty('resumen');
    expect(proyeccion).not.toHaveProperty('detalle');
    expect(proyeccion).not.toHaveProperty('saldo_total');
    expect(proyeccion).not.toHaveProperty('tiene_saldo_positivo');
    expect(JSON.stringify(proyeccion)).not.toContain('0.00');
    expect(JSON.stringify(proyeccion)).toBe(
      `{"estado":"MATRICULA_INEXISTENTE","matricula_id":${MATRICULA_INEXISTENTE}}`
    );
  });

  it('SIN_PLAN: detalle vacio y saldo_total "0.00" explicitamente proyectado', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matSinPlan);

    expect(proyeccion.estado).toBe('SIN_PLAN');
    expect(proyeccion.matricula_id).toBe(esc.matSinPlan);
    if (proyeccion.estado !== 'SIN_PLAN') throw new Error('estado inesperado');
    expect(proyeccion.plan).toBeNull();
    expect(proyeccion.detalle).toEqual([]);
    expect(proyeccion.resumen.saldo_total).toBe(SALDO_CERO_PROYECTADO);
    expect(proyeccion.resumen.saldo_total).toBe('0.00');
    expect(proyeccion.resumen.tiene_saldo_positivo).toBe(false);
    expect(proyeccion.resumen.cuotas_contadas).toBe(0);
    expect(proyeccion.resumen.moneda).toBeNull();
  });

  it('SIN_CUOTAS: plan conservado, detalle vacio y saldo_total "0.00" explicito', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matSinCuotas);

    expect(proyeccion.estado).toBe('SIN_CUOTAS');
    if (proyeccion.estado !== 'SIN_CUOTAS') throw new Error('estado inesperado');
    expect(proyeccion.plan.moneda).toBe('USD');
    expect(proyeccion.plan.total_cuotas).toBe(4);
    expect(proyeccion.detalle).toEqual([]);
    expect(proyeccion.resumen.saldo_total).toBe('0.00');
    expect(proyeccion.resumen.tiene_saldo_positivo).toBe(false);
    expect(proyeccion.resumen.cuotas_contadas).toBe(0);
    expect(proyeccion.resumen.moneda).toBe('USD');
  });

  it('CON_OBLIGACIONES: detalle real y agregado real del mismo snapshot', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matMixed);

    expect(proyeccion.estado).toBe('CON_OBLIGACIONES');
    if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(proyeccion.detalle.map((c) => c.numero_cuota)).toEqual([1, 2, 3]);
    expect(proyeccion.detalle.map((c) => c.saldo_pendiente)).toEqual(['1000.00', '-30.00', '234.50']);
    expect(proyeccion.resumen.saldo_total).toBe('1204.50');
    expect(proyeccion.resumen.tiene_saldo_positivo).toBe(true);
    expect(proyeccion.resumen.cuotas_contadas).toBe(3);
    expect(proyeccion.resumen.moneda).toBe('NIO');
    // Detalle y agregado de la misma lectura: coherentes entre si.
    expect(proyeccion.resumen.cuotas_contadas).toBe(proyeccion.detalle.length);
    expect(proyeccion.resumen.saldo_total).toBe(
      desdeCentavos(proyeccion.detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n))
    );
  });

  it('INTEGRIDAD_INVALIDA: NaN almacenado en NUMERIC, resumen null y valor intacto', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matNaN);

    expect(proyeccion.estado).toBe('INTEGRIDAD_INVALIDA');
    if (proyeccion.estado !== 'INTEGRIDAD_INVALIDA') throw new Error('estado inesperado');
    expect(proyeccion.resumen).toBeNull();
    expect(proyeccion.motivo).toBe('IMPORTE_NO_NUMERICO');
    // El valor almacenado se conserva tal cual: no se normaliza a cero.
    expect(proyeccion.detalle).toHaveLength(1);
    expect(proyeccion.detalle[0].saldo_pendiente).toBe('NaN');
    expect(JSON.stringify(proyeccion.resumen)).toBe('null');

    const almacenado = await q<{ v: string }>(
      `SELECT saldo_pendiente::text AS v FROM mensualidades WHERE plan_pago_id = $1`,
      [esc.planNaN]
    );
    expect(almacenado[0].v).toBe('NaN');
  });

  it('INTEGRIDAD_INVALIDA: infinito inyectado en la fila (no almacenable en NUMERIC(12,2))', async () => {
    // PG rechaza 'Infinity'::numeric(12,2) por desborde: la guarda es de codigo
    // y se prueba inyectando la fila en el repositorio (Pool inyectable).
    const filaInyectada: ObligacionesRow = {
      matricula_id: esc.matMixed,
      matricula_estado: 'ACTIVA',
      plan_pago_id: 900001,
      total_cuotas: 3,
      monto_cuota: 'Infinity',
      moneda: 'NIO',
      tarifa_id: null,
      cuotas_contadas: 3,
      saldo_total: 'Infinity',
      cuotas: [
        {
          id: 1,
          numero_cuota: 1,
          concepto: 'C1',
          monto_original: 'Infinity',
          monto_pagado: '0.00',
          saldo_pendiente: 'Infinity',
          fecha_vencimiento: '2026-03-15',
          estado: 'PENDIENTE',
          mora_aplicada: '0.00',
        },
      ],
    };
    const poolInfinito = {
      query: async () => ({ rows: [filaInyectada] }),
    };
    const servicio = new ObligacionesService(
      new ObligacionesRepository(inyectarPool(poolInfinito))
    );
    const proyeccion = await servicio.proyectarObligaciones(esc.matMixed);

    expect(proyeccion.estado).toBe('INTEGRIDAD_INVALIDA');
    if (proyeccion.estado !== 'INTEGRIDAD_INVALIDA') throw new Error('estado inesperado');
    expect(proyeccion.resumen).toBeNull();
    expect(proyeccion.motivo).toBe('IMPORTE_NO_NUMERICO');
    expect(proyeccion.detalle[0].monto_original).toBe('Infinity');
    expect(proyeccion.detalle[0].saldo_pendiente).toBe('Infinity');
    // La fila real en BD no se toca: la proyeccion real sigue siendo valida.
    const real = await new ObligacionesService(new ObligacionesRepository(pool)).proyectarObligaciones(
      esc.matMixed
    );
    expect(real.estado).toBe('CON_OBLIGACIONES');
  });
});

describe('ObligacionesService — validacion de identificadores', () => {
  it('identificador invalido devuelve AppError 400 con CERO consultas (pool real instrumentado)', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    const invalidos: Array<{ valor: unknown; nota: string }> = [
      { valor: 0, nota: 'cero' },
      { valor: -1, nota: 'negativo' },
      { valor: 1.5, nota: 'decimal' },
      { valor: 2147483648, nota: 'fuera de serial32' },
      { valor: 2 ** 53, nota: 'no entero seguro' },
      { valor: 9007199254740993, nota: 'no representable exactamente' },
      { valor: Number.NaN, nota: 'NaN' },
      { valor: Number.POSITIVE_INFINITY, nota: 'infinito positivo' },
      { valor: Number.NEGATIVE_INFINITY, nota: 'infinito negativo' },
      { valor: '5', nota: 'string numerica' },
      { valor: 'abc', nota: 'string no numerica' },
      { valor: null, nota: 'null' },
      { valor: undefined, nota: 'undefined' },
      { valor: {}, nota: 'objeto' },
      { valor: [], nota: 'array' },
    ];
    for (const caso of invalidos) {
      let error: unknown = null;
      try {
        await servicio.proyectarObligaciones(caso.valor as number);
      } catch (e) {
        error = e;
      }
      expect(error, caso.nota).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode, caso.nota).toBe(400);
      expect(appError.code, caso.nota).toBe('BAD_REQUEST');
      // CERO consultas reales: la medicion es del pool, no del error.
      expect(contador.consultas, caso.nota).toHaveLength(0);
    }
  });

  it('los limites del dominio serial32 son validos y consultan exactamente una vez', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    for (const id of [1, 2147483647]) {
      contador.consultas.length = 0;
      const proyeccion = await servicio.proyectarObligaciones(id);
      expect(proyeccion.estado).toBe('MATRICULA_INEXISTENTE');
      expect(proyeccion.matricula_id).toBe(id);
      expect(contador.consultas).toHaveLength(1);
      expect(contador.consultas[0].valores).toEqual([id]);
    }
  });

  it('una sola consulta parametrizada por lectura valida, 1:1 (pool real instrumentado)', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    const ids = [
      esc.matMixed,
      esc.matCentavos,
      esc.matGrandes,
      esc.matCero,
      esc.matNegativo,
      esc.matSinPlan,
      esc.matSinCuotas,
      esc.matLegacy,
      esc.matNaN,
      esc.matAnioA,
      esc.matAnioB,
      esc.matOtroEstudiante,
    ];
    for (const id of ids) {
      contador.consultas.length = 0;
      await servicio.proyectarObligaciones(id);
      expect(contador.consultas, `id ${id}`).toHaveLength(1);
      expect(contador.consultas[0].valores).toEqual([id]);
      expect(contador.consultas[0].texto).toContain('$1');
      expect(contador.consultas[0].texto).not.toContain(String(id));
    }
    expect(contador.consultas).toHaveLength(1);
  });

  it('ninguna consulta de la proyeccion toca tarifas (no se reconstruye la moneda)', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));
    await servicio.proyectarObligaciones(esc.matLegacy);
    expect(contador.consultas.length).toBeGreaterThan(0);
    for (const consulta of contador.consultas) {
      expect(consulta.texto.toLowerCase()).not.toContain('tarifas');
    }
  });
});

describe('ObligacionesService — propagacion de errores tecnicos', () => {
  it('el error de BD se propaga crudo: no es estado de negocio ni saldo cero', async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const division = await cliente.query('SELECT 1/0').catch((e: unknown) => e);
      expect(division).toBeInstanceOf(Error);
      const previo = await cliente.query('SELECT 1').catch((e: unknown) => e);
      expect((previo as { code?: string }).code).toBe('25P02');

      const servicio = new ObligacionesService(
        new ObligacionesRepository(inyectarPool(new PoolDelegado(cliente)))
      );
      let error: unknown = null;
      try {
        await servicio.proyectarObligaciones(esc.matMixed);
      } catch (e) {
        error = e;
      }
      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(Error);
      // NO se convierte en AppError ni en estado de negocio.
      expect(error).not.toBeInstanceOf(AppError);
      const crudo = error as {
        code?: string;
        message?: string;
        severity?: string;
        estado?: unknown;
        resumen?: unknown;
        saldo_total?: unknown;
      };
      // Es el error tecnico de PostgreSQL, tal cual.
      expect(crudo.code).toBe('25P02');
      expect(crudo.severity).toBe('ERROR');
      expect(String(crudo.message)).toMatch(/current transaction is aborted/i);
      // Y no arrastra ninguna forma de estado de negocio ni saldo cero.
      expect(crudo.estado).toBeUndefined();
      expect(crudo.resumen).toBeUndefined();
      expect(crudo.saldo_total).toBeUndefined();
      const texto = `${String(crudo.message)} ${String(crudo.code)}`;
      expect(texto).toMatch(/aborted/i);
      for (const prohibido of [
        'MATRICULA_INEXISTENTE',
        'SIN_PLAN',
        'SIN_CUOTAS',
        'CON_OBLIGACIONES',
        'INTEGRIDAD_INVALIDA',
        '0.00',
      ]) {
        expect(texto, prohibido).not.toContain(prohibido);
      }
    } finally {
      // Se cierra la transaccion abortada y se restaura la sesion antes de
      // devolver la conexion al pool compartido.
      await cliente.query('ROLLBACK').catch(() => undefined);
      await cliente.query(`RESET ALL`).catch(() => undefined);
      cliente.release();
    }
  });
});

describe('ObligacionesService — precision, limite de suma y signos', () => {
  it('precision en centavos: suma exacta de 0.01 con negativo = "0.02"', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matCentavos);
    if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(proyeccion.resumen.saldo_total).toBe('0.02');
    expect(proyeccion.detalle.map((c) => c.saldo_pendiente)).toEqual(['0.01', '0.01', '-0.01', '0.01']);
    expect(proyeccion.resumen.saldo_total).toBe(
      desdeCentavos(proyeccion.detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n))
    );
  });

  it('la suma supera el rango de una cuota: 60 x 9,999,999,999.99 = "599999999999.40"', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matGrandes);
    if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(proyeccion.resumen.cuotas_contadas).toBe(60);
    expect(proyeccion.detalle).toHaveLength(60);
    expect(proyeccion.detalle[0].saldo_pendiente).toBe('9999999999.99');
    expect(proyeccion.resumen.saldo_total).toBe('599999999999.40');
    // El agregado no se trunca al maximo de una cuota.
    expect(proyeccion.resumen.saldo_total).not.toBe('9999999999.99');
    expect(proyeccion.resumen.saldo_total).toBe(
      desdeCentavos(proyeccion.detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n))
    );
  });

  it('cero y negativos mezclados: negativos preservados y total algebraico exacto', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));

    const mixto = await servicio.proyectarObligaciones(esc.matMixed);
    if (mixto.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(mixto.detalle[1].saldo_pendiente).toBe('-30.00');
    expect(mixto.resumen.saldo_total).toBe('1204.50');

    const negativo = await servicio.proyectarObligaciones(esc.matNegativo);
    if (negativo.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(negativo.detalle.map((c) => c.saldo_pendiente)).toEqual(['-5000.00', '120.00', '3.00']);
    expect(negativo.resumen.saldo_total).toBe('-4877.00');
    expect(negativo.resumen.tiene_saldo_positivo).toBe(false);
    expect(negativo.resumen.saldo_total).toBe(
      desdeCentavos(negativo.detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n))
    );

    const cero = await servicio.proyectarObligaciones(esc.matCero);
    if (cero.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(cero.resumen.saldo_total).toBe('0.00');
    expect(cero.resumen.cuotas_contadas).toBe(2);
    expect(cero.resumen.tiene_saldo_positivo).toBe(false);
  });

  it('tiene_saldo_positivo solo si el saldo TOTAL exacto es mayor que cero', async () => {
    expect(SALDO_CERO_PROYECTADO).toBe('0.00');
    const casos: Array<{ monto: string; esperado: boolean }> = [
      { monto: '0.00', esperado: false },
      { monto: '0', esperado: false },
      { monto: '-0.00', esperado: false },
      { monto: '-0.01', esperado: false },
      { monto: '-4877.00', esperado: false },
      { monto: '0.01', esperado: true },
      { monto: '1204.50', esperado: true },
      { monto: '599999999999.40', esperado: true },
      { monto: '9999999999.99', esperado: true },
      { monto: 'NaN', esperado: false },
      { monto: 'Infinity', esperado: false },
      { monto: '-Infinity', esperado: false },
      { monto: '1e3', esperado: false },
      { monto: '', esperado: false },
      { monto: '00.10', esperado: true },
    ];
    for (const caso of casos) {
      expect(esPositivoExacto(caso.monto), caso.monto).toBe(caso.esperado);
    }

    // Ademas, medido sobre datos reales: positivo, cero y negativo.
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    expect(esPositivo(await servicio.proyectarObligaciones(esc.matMixed))).toBe(true);
    expect(esPositivo(await servicio.proyectarObligaciones(esc.matCero))).toBe(false);
    expect(esPositivo(await servicio.proyectarObligaciones(esc.matNegativo))).toBe(false);
    expect(esPositivo(await servicio.proyectarObligaciones(esc.matSinCuotas))).toBe(false);
    expect(esPositivo(await servicio.proyectarObligaciones(esc.matNaN))).toBeNull();
  });
});

describe('ObligacionesService — aislamiento, monedas y fechas', () => {
  it('moneda legacy null se preserva (ni tarifas ni default NIO)', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarObligaciones(esc.matLegacy);
    if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(proyeccion.plan.moneda).toBeNull();
    expect(proyeccion.plan.tarifa_id).toBe(esc.tarifaUsd);
    expect(proyeccion.resumen.moneda).toBeNull();
    expect(proyeccion.resumen.saldo_total).toBe('246.90');
    // La tarifa vigente es USD: no se toma como moneda del plan.
    const tarifa = await q<{ moneda: string }>(`SELECT moneda FROM tarifas WHERE id = $1`, [
      esc.tarifaUsd,
    ]);
    expect(tarifa[0].moneda).toBe('USD');
    expect(proyeccion.resumen.moneda).not.toBe(tarifa[0].moneda);
  });

  it('aislamiento: sin cuotas ni planes de otra matricula ni de otro ano lectivo', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));

    const anioA = await servicio.proyectarObligaciones(esc.matAnioA);
    if (anioA.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(anioA.resumen.saldo_total).toBe('15.00');
    expect(anioA.detalle.map((c) => c.saldo_pendiente)).toEqual(['10.00', '5.00']);

    const anioB = await servicio.proyectarObligaciones(esc.matAnioB);
    if (anioB.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(anioB.resumen.saldo_total).toBe('1500.00');
    expect(anioB.detalle.map((c) => c.saldo_pendiente)).toEqual(['700.00', '800.00']);

    const otro = await servicio.proyectarObligaciones(esc.matOtroEstudiante);
    if (otro.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(otro.plan.moneda).toBe('USD');
    expect(otro.resumen.saldo_total).toBe('3.00');
    expect(otro.detalle).toHaveLength(1);
  });

  it('monedas: los planes con monedas distintas no se mezclan en un agregado', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const usd = await servicio.proyectarObligaciones(esc.matOtroEstudiante);
    const nio = await servicio.proyectarObligaciones(esc.matMixed);
    if (usd.estado !== 'CON_OBLIGACIONES' || nio.estado !== 'CON_OBLIGACIONES') {
      throw new Error('estado inesperado');
    }
    expect(usd.resumen.moneda).toBe('USD');
    expect(usd.resumen.saldo_total).toBe('3.00');
    expect(nio.resumen.moneda).toBe('NIO');
    expect(nio.resumen.saldo_total).toBe('1204.50');
    expect(nio.resumen.cuotas_contadas).toBe(3);
    expect(usd.resumen.cuotas_contadas).toBe(1);
  });

  it('fecha_vencimiento es YYYY-MM-DD estable bajo DateStyle "Postgres, DMY" y otra zona horaria', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const base = await servicio.proyectarObligaciones(esc.matMixed);
    if (base.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    const fechasBase = base.detalle.map((c) => c.fecha_vencimiento);
    expect(fechasBase).toEqual(['2026-03-15', '2026-01-31', '2026-12-31']);
    for (const fecha of fechasBase) {
      expect(fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Sesion real con DateStyle y zona horaria alterados: misma proyeccion.
    const cliente = await pool.connect();
    try {
      await cliente.query(`SET DateStyle = 'Postgres, DMY'`);
      await cliente.query(`SET TimeZone = 'Pacific/Kiritimati'`);
      const config = await cliente.query<{ datestyle: string; zone: string }>(
        `SELECT current_setting('DateStyle') AS datestyle, current_setting('TimeZone') AS zone`
      );
      expect(config.rows[0].datestyle).toContain('DMY');
      expect(config.rows[0].zone).toBe('Pacific/Kiritimati');
      const alterado = await new ObligacionesService(
        new ObligacionesRepository(inyectarPool(new PoolDelegado(cliente)))
      ).proyectarObligaciones(esc.matMixed);
      if (alterado.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
      expect(alterado.detalle.map((c) => c.fecha_vencimiento)).toEqual(fechasBase);
      expect(alterado.resumen).toEqual(base.resumen);
    } finally {
      await cliente.query(`RESET ALL`).catch(() => undefined);
      cliente.release();
    }
  });
});

describe('ObligacionesService — concurrencia y ausencia de escrituras', () => {
  it('dos lecturas simultaneas de la misma matricula devuelven resultados coherentes consigo mismos', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const secuencial = await servicio.proyectarObligaciones(esc.matGrandes);
    const simultaneas = await Promise.all([
      servicio.proyectarObligaciones(esc.matGrandes),
      servicio.proyectarObligaciones(esc.matGrandes),
      servicio.proyectarObligaciones(esc.matGrandes),
    ]);

    for (const paralela of simultaneas) {
      expect(paralela).toEqual(secuencial);
      if (paralela.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
      // Sin hibridacion: detalle y agregado son de la misma lectura.
      expect(paralela.resumen.cuotas_contadas).toBe(paralela.detalle.length);
      expect(paralela.resumen.saldo_total).toBe(
        desdeCentavos(paralela.detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n))
      );
    }
  });

  it('lecturas entremezcladas de matriculas distintas no se contaminan entre si', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const esperado: Record<number, { saldo: string; cuotas: number }> = {
      [esc.matMixed]: { saldo: '1204.50', cuotas: 3 },
      [esc.matGrandes]: { saldo: '599999999999.40', cuotas: 60 },
      [esc.matAnioA]: { saldo: '15.00', cuotas: 2 },
      [esc.matAnioB]: { saldo: '1500.00', cuotas: 2 },
    };
    const lotes = await Promise.all(
      Array.from({ length: 4 }, () =>
        Promise.all(
          Object.keys(esperado).map((k) => servicio.proyectarObligaciones(Number(k)))
        )
      )
    );
    for (const [indice, lote] of lotes.entries()) {
      for (const [pos, proyeccion] of lote.entries()) {
        const id = Number(Object.keys(esperado)[pos]);
        expect(proyeccion.matricula_id, `lote ${indice}`).toBe(id);
        if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
        expect(proyeccion.resumen.saldo_total, `lote ${indice}`).toBe(esperado[id].saldo);
        expect(proyeccion.resumen.cuotas_contadas).toBe(esperado[id].cuotas);
        expect(proyeccion.detalle.every((c: CuotaProyeccion) => Number.isInteger(c.id))).toBe(true);
      }
    }
  });

  it('hash logico identico antes y despues de un lote de lecturas del servicio: no hay escrituras', async () => {
    // Los fixtures se crean en beforeEach y se limpian en afterEach, es decir
    // FUERA de la ventana medida: los dos hashes solo ven el efecto de las
    // lecturas. Los valores de secuencia quedan excluidos a proposito: avanzan
    // al crear los fixtures, no al leer.
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const antes = await hashLogico();

    // Lote de lecturas: cinco estados, validos e invalidos (los invalidos ni
    // siquiera llegan a la base de datos).
    const ids = [
      esc.matMixed,
      esc.matCentavos,
      esc.matGrandes,
      esc.matCero,
      esc.matNegativo,
      esc.matSinPlan,
      esc.matSinCuotas,
      esc.matLegacy,
      esc.matNaN,
      esc.matAnioA,
      esc.matAnioB,
      esc.matOtroEstudiante,
      MATRICULA_INEXISTENTE,
    ];
    await Promise.all(ids.map((id) => servicio.proyectarObligaciones(id)));
    for (const id of ids) {
      await servicio.proyectarObligaciones(id);
    }
    await servicio.proyectarObligaciones(0).catch(() => undefined);
    await servicio.proyectarObligaciones(-7).catch(() => undefined);

    const despues = await hashLogico();
    expect(despues).toEqual(antes);
    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla].split('|')[0], tabla).toBe(antes[tabla].split('|')[0]);
    }
    // Control de no vacuidad: las tablas medidas SI tienen filas.
    expect(Number(antes['matriculas'].split('|')[0])).toBeGreaterThan(0);
    expect(Number(antes['mensualidades'].split('|')[0])).toBeGreaterThan(0);
    expect(Number(antes['tarifas'].split('|')[0])).toBeGreaterThan(0);
  });
});

/** Conversion exacta a centavos con BigInt (verificacion independiente). */
function aCentavos(texto: string): bigint {
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(texto);
  if (!m) throw new Error(`importe no numerico de 2 decimales: ${texto}`);
  const signo = m[1] === '-' ? -1n : 1n;
  return signo * (BigInt(m[2]) * 100n + BigInt(m[3]));
}

function desdeCentavos(centavos: bigint): string {
  const signo = centavos < 0n ? '-' : '';
  const abs = centavos < 0n ? -centavos : centavos;
  return `${signo}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
}
