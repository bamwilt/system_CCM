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
import {
  ID_MAXIMO_SEGURO,
  ID_MINIMO_SEGURO,
  ObligacionesRepository,
  esIdSeguro32,
  proyectarDetalleCuotas,
  proyectarPlan,
} from '../src/repositories/obligaciones.repository';
import type {
  CuotaProyeccion,
  ObligacionesRow,
} from '../src/repositories/obligaciones.repository';

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

const MARCA = 'OBL6A-R';
const ANIO_PRINCIPAL = 2026;
const ANIO_OTRO = 2099;

/** Tablas cuyo contenido logico se comparara antes/despues de las lecturas. */
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

interface Fixtures {
  matMixed: number;
  planMixed: number;
  matCentavos: number;
  matGrandes: number;
  matCero: number;
  matSinPlan: number;
  matSinCuotas: number;
  matLegacy: number;
  tarifaUsd: number;
  matNaN: number;
  planNaN: number;
  matAnioA: number;
  planAnioA: number;
  matAnioB: number;
  planAnioB: number;
  matOtroEstudiante: number;
  planOtroEstudiante: number;
  matMonedaUsd: number;
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

/**
 * Limpieza acotada a la marca de esta suite. Nunca borra filas ajenas.
 */
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

async function idPlan(matriculaId: number): Promise<number> {
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

  // Mezcla de positivos y negativos: +1000.00 / -30.00 / +234.50.
  const matMixed = await crearMatricula(`${MARCA}-MIX`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 3, '100.00', 'NIO')`, [matMixed]);
  const planMixed = await idPlan(matMixed);
  await crearCuotas(planMixed, [
    { n: 1, saldo: '1000.00', fecha: '2026-03-15' },
    { n: 2, saldo: '-30.00', fecha: '2026-01-31' },
    { n: 3, saldo: '234.50', fecha: '2026-12-31' },
  ]);

  // Precision de centavos: tres centavos positivos y uno negativo.
  const matCentavos = await crearMatricula(`${MARCA}-CENT`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 4, '0.01', 'NIO')`, [matCentavos]);
  const planCentavos = await idPlan(matCentavos);
  await crearCuotas(planCentavos, [
    { n: 1, saldo: '0.01', fecha: '2026-02-28' },
    { n: 2, saldo: '0.01', fecha: '2026-03-31' },
    { n: 3, saldo: '-0.01', fecha: '2026-04-30' },
    { n: 4, saldo: '0.01', fecha: '2026-05-31' },
  ]);

  // Suma por encima del rango de una cuota: 60 cuotas de 9,999,999,999.99.
  const matGrandes = await crearMatricula(`${MARCA}-BIG`, otroAnioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 60, '9999999999.99', 'NIO')`, [matGrandes]);
  const planGrandes = await idPlan(matGrandes);
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     SELECT $1, g, 'C' || g, '9999999999.99', '0.00', '9999999999.99', '2026-04-30', 'PENDIENTE', '0.00'
       FROM generate_series(1, 60) g`,
    [planGrandes]
  );

  // Todo a cero: NO es SIN_CUOTAS (hay cuotas, el saldo es cero).
  const matCero = await crearMatricula(`${MARCA}-ZERO`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 2, '500.00', 'NIO')`, [matCero]);
  const planCero = await idPlan(matCero);
  await crearCuotas(planCero, [
    { n: 1, saldo: '0.00', fecha: '2026-06-30' },
    { n: 2, saldo: '0.00', fecha: '2026-07-31' },
  ]);

  // Matricula sin plan almacenado.
  const matSinPlan = await crearMatricula(`${MARCA}-NOPLAN`, anioId);

  // Matricula con plan y sin cuotas almacenadas (moneda explicita).
  const matSinCuotas = await crearMatricula(`${MARCA}-NOCUOTAS`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 4, '250.00', 'USD')`, [matSinCuotas]);

  // Moneda legacy NULL con tarifa_id almacenada: la tarifa vigente es USD y NO se toma.
  const tarifaUsd = (
    await q<{ id: number }>(
      `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
       VALUES ($1, '123.45', 'USD', $2, TRUE) RETURNING id`,
      [`${MARCA} Tarifa vigente`, anioId]
    )
  )[0].id;
  const matLegacy = await crearMatricula(`${MARCA}-LEGACY`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda, tarifa_id) VALUES ($1, 2, '123.45', NULL, $2)`, [matLegacy, tarifaUsd]);
  const planLegacy = await idPlan(matLegacy);
  await crearCuotas(planLegacy, [
    { n: 1, saldo: '123.45', fecha: '2026-08-31' },
    { n: 2, saldo: '123.45', fecha: '2026-09-30' },
  ]);

  // NaN almacenado en una columna NUMERIC: no es normalizable a cero.
  const matNaN = await crearMatricula(`${MARCA}-NAN`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 1, '100.00', 'NIO')`, [matNaN]);
  const planNaN = await idPlan(matNaN);
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     VALUES ($1, 1, 'C1', '100.00', '0.00', 'NaN', '2026-10-31', 'PENDIENTE', '0.00')`,
    [planNaN]
  );

  // Aislamiento: mismo estudiante en dos años lectivos distintos.
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
  for (const [mat, moneda] of [
    [matAnioA.id, 'NIO'],
    [matAnioB.id, 'NIO'],
  ] as const) {
    await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 2, '10.00', $2)`, [mat, moneda]);
  }
  const planAnioA = await idPlan(matAnioA.id);
  const planAnioB = await idPlan(matAnioB.id);
  await crearCuotas(planAnioA, [
    { n: 1, saldo: '10.00', fecha: '2026-02-15' },
    { n: 2, saldo: '5.00', fecha: '2026-03-15' },
  ]);
  await crearCuotas(planAnioB, [
    { n: 1, saldo: '700.00', fecha: '2099-02-15' },
    { n: 2, saldo: '800.00', fecha: '2099-03-15' },
  ]);

  // Aislamiento: otro estudiante del MISMO año lectivo.
  const matOtroEstudiante = await crearMatricula(`${MARCA}-OTROEST`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 1, '3.00', 'NIO')`, [matOtroEstudiante]);
  const planOtroEstudiante = await idPlan(matOtroEstudiante);
  await crearCuotas(planOtroEstudiante, [{ n: 1, saldo: '3.00', fecha: '2026-04-15' }]);

  // Monedas: plan NIO de un estudiante y plan USD de otro.
  const matMonedaUsd = await crearMatricula(`${MARCA}-USD`, anioId);
  await q(`INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda) VALUES ($1, 2, '60.00', 'USD')`, [matMonedaUsd]);
  const planUsd = await idPlan(matMonedaUsd);
  await crearCuotas(planUsd, [
    { n: 1, saldo: '60.00', fecha: '2026-01-15' },
    { n: 2, saldo: '40.00', fecha: '2026-02-15' },
  ]);

  return {
    matMixed,
    planMixed,
    matCentavos,
    matGrandes,
    matCero,
    matSinPlan,
    matSinCuotas,
    matLegacy,
    tarifaUsd,
    matNaN,
    planNaN,
    matAnioA: matAnioA.id,
    planAnioA,
    matAnioB: matAnioB.id,
    planAnioB,
    matOtroEstudiante,
    planOtroEstudiante,
    matMonedaUsd,
  };
}

/**
 * Hash logico por tabla: recuento + md5 concatenado de cada fila (orden
 * determinista). Se calcula en tiempo de ejecucion: nunca se codifica un
 * recuento esperado.
 *
 * Se ejecuta sobre una conexion dedicada con DateStyle/TimeZone fijados:
 * `t::text` de columnas timestamptz/date depende de ambos parametros de sesion
 * (queda probado en la prueba de fechas), asi que fijarlos evita que el hash
 * mida el entorno en lugar del contenido.
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
 * Pool real instrumentado (contador de consultas) y pool en fallo.   *
 * No son mocks del codigo bajo prueba: delegan en PostgreSQL real.   *
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
 * un doble de prueba solo necesita implementar `query`, no los 12 metodos de
 * `Pool`. Al inyectarlo se conserva el cast a `Pool` porque el constructor del
 * repositorio tipa el pool de aplicacion.
 */
interface ConsultaMinima {
  query(
    texto: string | { text: string; values?: unknown[] },
    valores?: unknown[]
  ): Promise<QueryResult<QueryResultRow>>;
}

/** El contrato usado por el repositorio es unicamente `query` (Pool inyectable). */
function inyectarPool(objeto: ConsultaMinima): Pool {
  return objeto as unknown as Pool;
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
  // Migraciones aplicadas en una transaccion (patron de la casa): el esquema
  // que necesita 6.A (indice unico de plan por matricula, tarifa_id, moneda)
  // queda garantizado sin depender del estado previo.
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

describe('ObligacionesRepository — guardas puras de dominio (sin tocar la BD)', () => {
  it('esIdSeguro32 acepta solo enteros seguros dentro del rango serial32', () => {
    const casos: Array<{ valor: unknown; esperado: boolean; nota: string }> = [
      { valor: ID_MINIMO_SEGURO, esperado: true, nota: 'limite inferior' },
      { valor: ID_MAXIMO_SEGURO, esperado: true, nota: 'limite superior' },
      { valor: 42, esperado: true, nota: 'entero habitual' },
      { valor: 0, esperado: false, nota: 'cero' },
      { valor: -1, esperado: false, nota: 'negativo' },
      { valor: 1.5, esperado: false, nota: 'decimal' },
      { valor: 2147483648, esperado: false, nota: 'un por encima del maximo serial32' },
      { valor: ID_MAXIMO_SEGURO + 1, esperado: false, nota: 'desborde serial32' },
      { valor: Number.MAX_SAFE_INTEGER, esperado: false, nota: 'seguro pero fuera de serial32' },
      { valor: 2 ** 53, esperado: false, nota: 'no es entero seguro' },
      { valor: 9007199254740993, esperado: false, nota: 'no representable exactamente' },
      { valor: Number.NaN, esperado: false, nota: 'NaN' },
      { valor: Number.POSITIVE_INFINITY, esperado: false, nota: 'infinito positivo' },
      { valor: Number.NEGATIVE_INFINITY, esperado: false, nota: 'infinito negativo' },
      { valor: '5', esperado: false, nota: 'string numerica' },
      { valor: 'abc', esperado: false, nota: 'string no numerica' },
      { valor: '', esperado: false, nota: 'string vacia' },
      { valor: null, esperado: false, nota: 'null' },
      { valor: undefined, esperado: false, nota: 'undefined' },
      { valor: {}, esperado: false, nota: 'objeto' },
      { valor: [], esperado: false, nota: 'array vacio' },
      { valor: [7], esperado: false, nota: 'array con numero' },
      { valor: true, esperado: false, nota: 'booleano' },
    ];
    for (const caso of casos) {
      expect(esIdSeguro32(caso.valor), `${caso.nota} (${String(caso.valor)})`).toBe(caso.esperado);
    }
    // Las constantes exportadas coinciden con el dominio serial32 de PostgreSQL.
    expect(ID_MINIMO_SEGURO).toBe(1);
    expect(ID_MAXIMO_SEGURO).toBe(2147483647);
  });

  it('proyectarDetalleCuotas mapea el detalle almacenado y devuelve null si la forma no es la esperada', () => {
    const cuota = {
      id: 7,
      numero_cuota: 1,
      concepto: 'C1',
      monto_original: '100.00',
      monto_pagado: '0.00',
      saldo_pendiente: '100.00',
      fecha_vencimiento: '2026-03-15',
      estado: 'PENDIENTE',
      mora_aplicada: '0.00',
    };
    const detalle = proyectarDetalleCuotas([cuota]);
    expect(detalle).toHaveLength(1);
    expect(detalle?.[0]).toEqual(cuota);

    expect(proyectarDetalleCuotas([])).toEqual([]);
    expect(proyectarDetalleCuotas(null)).toBeNull();
    expect(proyectarDetalleCuotas({ cuotas: [cuota] })).toBeNull();
    expect(proyectarDetalleCuotas('[]')).toBeNull();
    expect(proyectarDetalleCuotas([null])).toBeNull();
    expect(proyectarDetalleCuotas([{ ...cuota, id: '7' }])).toBeNull();
    expect(proyectarDetalleCuotas([{ ...cuota, numero_cuota: 1.5 }])).toBeNull();
    expect(proyectarDetalleCuotas([{ ...cuota, monto_pagado: 0 }])).toBeNull();
    expect(proyectarDetalleCuotas([{ ...cuota, saldo_pendiente: 'NaN' }])).not.toBeNull();
    expect(proyectarDetalleCuotas([cuota, { concepto: 'C2' }])).toBeNull();
  });

  it('proyectarPlan devuelve null sin plan y conserva la moneda tal cual (null legacy)', () => {
    const fila: ObligacionesRow = {
      matricula_id: 10,
      matricula_estado: 'ACTIVA',
      plan_pago_id: null,
      total_cuotas: null,
      monto_cuota: null,
      moneda: null,
      tarifa_id: null,
      cuotas_contadas: 0,
      saldo_total: '0.00',
      cuotas: [],
    };
    expect(proyectarPlan(fila)).toBeNull();
    expect(
      proyectarPlan({
        ...fila,
        plan_pago_id: 'no-entero' as unknown as number,
      })
    ).toBeNull();

    const proyectado = proyectarPlan({
      ...fila,
      plan_pago_id: 22,
      total_cuotas: 2,
      monto_cuota: '123.45',
      moneda: null,
      tarifa_id: 157,
    });
    expect(proyectado).toEqual({
      plan_pago_id: 22,
      matricula_id: 10,
      total_cuotas: 2,
      monto_cuota: '123.45',
      moneda: null,
      tarifa_id: 157,
    });
  });
});

describe('ObligacionesRepository — proyeccion lectora sobre la BD aislada real', () => {
  it('matricula inexistente devuelve null (no es una fila con saldo cero)', async () => {
    const repo = new ObligacionesRepository(pool);
    await expect(repo.proyectarObligaciones(2147483646)).resolves.toBeNull();
  });

  it('matricula sin plan: plan_pago_id null, detalle vacio y saldo_total "0.00"', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matSinPlan);
    expect(fila).not.toBeNull();
    expect(fila?.matricula_id).toBe(esc.matSinPlan);
    expect(fila?.plan_pago_id).toBeNull();
    expect(fila?.moneda).toBeNull();
    expect(fila?.cuotas_contadas).toBe(0);
    expect(fila?.saldo_total).toBe('0.00');
    expect(fila?.cuotas).toEqual([]);
  });

  it('matricula con plan y sin cuotas: plan proyectado, detalle vacio y saldo_total "0.00"', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matSinCuotas);
    expect(fila?.plan_pago_id).toBeGreaterThan(0);
    expect(fila?.total_cuotas).toBe(4);
    expect(fila?.monto_cuota).toBe('250.00');
    expect(fila?.moneda).toBe('USD');
    expect(fila?.cuotas_contadas).toBe(0);
    expect(fila?.saldo_total).toBe('0.00');
    expect(fila?.cuotas).toEqual([]);
  });

  it('CON_OBLIGACIONES: detalle y agregado coherentes del mismo snapshot (saldo "1204.50")', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matMixed);
    expect(fila?.plan_pago_id).toBe(esc.planMixed);
    expect(fila?.cuotas_contadas).toBe(3);

    const detalle = proyectarDetalleCuotas(fila?.cuotas);
    expect(detalle).not.toBeNull();
    const cuotas = detalle as CuotaProyeccion[];
    expect(cuotas.map((c) => c.numero_cuota)).toEqual([1, 2, 3]);
    expect(cuotas.map((c) => c.saldo_pendiente)).toEqual(['1000.00', '-30.00', '234.50']);
    expect(cuotas[0].monto_original).toBe('1000.00');
    expect(cuotas[1].monto_pagado).toBe('0.00');
    expect(cuotas.map((c) => c.fecha_vencimiento)).toEqual(['2026-03-15', '2026-01-31', '2026-12-31']);
    expect(fila?.saldo_total).toBe('1204.50');

    // Suma algebraica exacta e independiente del codigo de produccion.
    expect(fila?.saldo_total).toBe(desdeCentavos(cuotas.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n)));
  });

  it('la suma supera el rango de una cuota: 60 cuotas de 9,999,999,999.99 suman "599999999999.40"', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matGrandes);
    expect(fila?.cuotas_contadas).toBe(60);

    const detalle = proyectarDetalleCuotas(fila?.cuotas) as CuotaProyeccion[];
    expect(detalle).toHaveLength(60);
    expect(detalle[0].saldo_pendiente).toBe('9999999999.99');
    // El agregado NO se limita al NUMERIC(12,2) de una cuota: es 60 veces mayor.
    expect(fila?.saldo_total).toBe('599999999999.40');
    expect(Number(fila?.saldo_total)).toBeGreaterThan(Number('9999999999.99') * 60 - 1);
    expect(fila?.saldo_total).toBe(desdeCentavos(detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n)));
    // La lectura devuelve el agregado en la MISMA fila que el detalle.
    expect(detalle).toHaveLength(fila?.cuotas_contadas ?? -1);
  });

  it('precision en centavos: 0.01 + 0.01 - 0.01 + 0.01 = "0.02" (sin redondeo inventado)', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matCentavos);
    expect(fila?.cuotas_contadas).toBe(4);
    const detalle = proyectarDetalleCuotas(fila?.cuotas) as CuotaProyeccion[];
    expect(detalle.map((c) => c.saldo_pendiente)).toEqual(['0.01', '0.01', '-0.01', '0.01']);
    expect(fila?.saldo_total).toBe('0.02');
    expect(fila?.saldo_total).toBe(desdeCentavos(detalle.reduce((acc, c) => acc + aCentavos(c.saldo_pendiente), 0n)));
  });

  it('cuotas todas a cero: saldo "0.00" con detalle presente (no es SIN_CUOTAS)', async () => {
    const fila = await new ObligacionesRepository(pool).proyectarObligaciones(esc.matCero);
    expect(fila?.cuotas_contadas).toBe(2);
    expect(fila?.saldo_total).toBe('0.00');
    const detalle = proyectarDetalleCuotas(fila?.cuotas) as CuotaProyeccion[];
    expect(detalle).toHaveLength(2);
    expect(detalle.every((c) => c.saldo_pendiente === '0.00')).toBe(true);
  });

  it('NaN almacenado en columna NUMERIC: la fila se devuelve tal cual (no se normaliza a cero)', async () => {
    const repo = new ObligacionesRepository(pool);
    const fila = await repo.proyectarObligaciones(esc.matNaN);
    expect(fila?.saldo_total).toBe('NaN');
    const detalle = proyectarDetalleCuotas(fila?.cuotas) as CuotaProyeccion[];
    expect(detalle[0].saldo_pendiente).toBe('NaN');

    // El valor almacenado sigue siendo NaN despues de la lectura.
    const almacenado = await q<{ v: string }>(
      `SELECT saldo_pendiente::text AS v FROM mensualidades WHERE plan_pago_id = $1`,
      [esc.planNaN]
    );
    expect(almacenado[0].v).toBe('NaN');
  });

  it('fecha_vencimiento se proyecta como YYYY-MM-DD estable bajo DateStyle "Postgres, DMY" y otra zona horaria', async () => {
    const repo = new ObligacionesRepository(pool);
    const fila = await repo.proyectarObligaciones(esc.matMixed);
    const detalle = proyectarDetalleCuotas(fila?.cuotas) as CuotaProyeccion[];
    for (const cuota of detalle) {
      expect(cuota.fecha_vencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Sesion real con DateStyle y zona horaria alterados: misma proyeccion.
    const cliente = await pool.connect();
    try {
      await cliente.query(`SET DateStyle = 'Postgres, DMY'`);
      await cliente.query(`SET TimeZone = 'Asia/Tokyo'`);
      const config = await cliente.query<{ datestyle: string; zone: string }>(
        `SELECT current_setting('DateStyle') AS datestyle, current_setting('TimeZone') AS zone`
      );
      expect(config.rows[0].datestyle).toContain('DMY');
      expect(config.rows[0].zone).toBe('Asia/Tokyo');

      const filaDmy = await new ObligacionesRepository(
        inyectarPool(new PoolDelegado(cliente))
      ).proyectarObligaciones(esc.matMixed);
      const detalleDmy = proyectarDetalleCuotas(filaDmy?.cuotas) as CuotaProyeccion[];
      expect(detalleDmy.map((c) => c.fecha_vencimiento)).toEqual(
        detalle.map((c) => c.fecha_vencimiento)
      );
      expect(filaDmy?.saldo_total).toBe(fila?.saldo_total);
    } finally {
      // Se restaura la sesion antes de devolverla al pool compartido: los
      // parametros de formato no deben filtrarse a otras pruebas.
      await cliente.query(`RESET ALL`).catch(() => undefined);
      cliente.release();
    }
  });

  it('moneda legacy null se preserva con tarifa_id almacenada y NUNCA se consulta tarifas', async () => {
    const contador = new PoolContador(pool);
    const repo = new ObligacionesRepository(inyectarPool(contador));
    const fila = await repo.proyectarObligaciones(esc.matLegacy);

    expect(fila?.moneda).toBeNull();
    expect(fila?.tarifa_id).toBe(esc.tarifaUsd);
    expect(fila?.monto_cuota).toBe('123.45');

    // Todas las consultas de la proyeccion: ninguna menciona tarifas.
    expect(contador.consultas.length).toBeGreaterThan(0);
    for (const consulta of contador.consultas) {
      expect(consulta.texto.toLowerCase()).not.toContain('tarifas');
    }
  });

  it('aislamiento: la proyeccion de una matricula no incluye planes ni cuotas de otra matricula ni de otro año', async () => {
    const repo = new ObligacionesRepository(pool);

    const filaA = await repo.proyectarObligaciones(esc.matAnioA);
    expect(filaA?.plan_pago_id).toBe(esc.planAnioA);
    expect(filaA?.matricula_id).toBe(esc.matAnioA);
    const detalleA = proyectarDetalleCuotas(filaA?.cuotas) as CuotaProyeccion[];
    expect(detalleA.map((c) => c.saldo_pendiente)).toEqual(['10.00', '5.00']);
    expect(filaA?.saldo_total).toBe('15.00');

    const filaB = await repo.proyectarObligaciones(esc.matAnioB);
    expect(filaB?.plan_pago_id).toBe(esc.planAnioB);
    expect(filaB?.matricula_id).toBe(esc.matAnioB);
    const detalleB = proyectarDetalleCuotas(filaB?.cuotas) as CuotaProyeccion[];
    expect(detalleB.map((c) => c.saldo_pendiente)).toEqual(['700.00', '800.00']);
    expect(filaB?.saldo_total).toBe('1500.00');

    // Otro estudiante del mismo año: tampoco entra en el agregado.
    const filaOtro = await repo.proyectarObligaciones(esc.matOtroEstudiante);
    expect(filaOtro?.plan_pago_id).toBe(esc.planOtroEstudiante);
    expect(proyectarDetalleCuotas(filaOtro?.cuotas)).toHaveLength(1);
    expect(filaOtro?.saldo_total).toBe('3.00');
  });

  it('monedas: cada agregado se limita a su propio plan (NIO y USD no se mezclan)', async () => {
    const repo = new ObligacionesRepository(pool);
    const filaUsd = await repo.proyectarObligaciones(esc.matMonedaUsd);
    expect(filaUsd?.moneda).toBe('USD');
    expect(filaUsd?.cuotas_contadas).toBe(2);
    expect(filaUsd?.saldo_total).toBe('100.00');

    const filaNio = await repo.proyectarObligaciones(esc.matMixed);
    expect(filaNio?.moneda).toBe('NIO');
    expect(filaNio?.saldo_total).toBe('1204.50');
    // Los planes ajenos (otra moneda) no aportan al agregado.
    expect(filaNio?.plan_pago_id).toBe(esc.planMixed);
  });

  it('un solo SELECT parametrizado por lectura valida (pool real instrumentado 1:1)', async () => {
    const contador = new PoolContador(pool);
    const repo = new ObligacionesRepository(inyectarPool(contador));

    let lecturasValidas = 0;
    for (const id of [esc.matMixed, esc.matGrandes, esc.matSinPlan, esc.matSinCuotas, esc.matAnioA]) {
      contador.consultas.length = 0;
      const fila = await repo.proyectarObligaciones(id);
      expect(contador.consultas).toHaveLength(1);
      const consulta = contador.consultas[0];
      expect(consulta.valores).toEqual([id]);
      expect(consulta.texto).toContain('$1');
      // El id viaja como parametro: nunca interpolado en el texto.
      expect(consulta.texto).not.toContain(String(id));
      expect(fila?.matricula_id).toBe(id);
      lecturasValidas += 1;
    }
    expect(lecturasValidas).toBe(5);

    // 5 lecturas validas contabilizadas = 5 consultas reales (ni una mas).
    await repo.proyectarObligaciones(esc.matLegacy);
    expect(contador.consultas).toHaveLength(2);
    expect(contador.consultas[contador.consultas.length - 1].valores).toEqual([esc.matLegacy]);
  });

  it('el repositorio no revalida el rango: ejecuta UNA consulta parametrizada incluso con id fuera de dominio', async () => {
    const contador = new PoolContador(pool);
    const repo = new ObligacionesRepository(inyectarPool(contador));
    await expect(repo.proyectarObligaciones(0)).resolves.toBeNull();
    expect(contador.consultas).toHaveLength(1);
    expect(contador.consultas[0].valores).toEqual([0]);
    // Por eso la validacion del dominio vive en el servicio.
  });

  it('errores tecnicos de BD se propagan crudos (transaccion abortada real, 25P02)', async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const division = await cliente.query('SELECT 1/0').catch((e: unknown) => e);
      expect(division).toBeInstanceOf(Error);
      // Comprobacion previa: el backend aborto la transaccion (error real de PG).
      const previo = await cliente.query('SELECT 1').catch((e: unknown) => e);
      expect((previo as { code?: string }).code).toBe('25P02');

      const repo = new ObligacionesRepository(inyectarPool(new PoolDelegado(cliente)));
      let error: unknown = null;
      try {
        await repo.proyectarObligaciones(esc.matMixed);
      } catch (e) {
        error = e;
      }
      expect(error).not.toBeNull();
      const pg = error as { code?: string; message?: string; severity?: string };
      // Se propaga el error tecnico TAL CUAL: no es un estado de negocio.
      expect(pg.code).toBe('25P02');
      expect(pg.severity).toBe('ERROR');
      expect(String(pg.message)).toMatch(/current transaction is aborted/i);
    } finally {
      await cliente.query('ROLLBACK').catch(() => undefined);
      cliente.release();
    }
  });

  it('hash logico identico antes y despues de un lote de lecturas: no hay escrituras', async () => {
    // Los fixtures se crean en beforeEach y se limpian en afterEach, es decir
    // FUERA de la ventana medida: los dos hashes solo ven el efecto de las
    // lecturas del slice 6.A. Los valores de secuencia (matriculas_id_seq...)
    // quedan excluidos a proposito: avanzan al crear los fixtures, no al leer.
    const antes = await hashLogico();

    // Lote de lecturas: cinco estados, validos y no existentes.
    const repo = new ObligacionesRepository(pool);
    await repo.proyectarObligaciones(esc.matMixed);
    await repo.proyectarObligaciones(esc.matCentavos);
    await repo.proyectarObligaciones(esc.matGrandes);
    await repo.proyectarObligaciones(esc.matCero);
    await repo.proyectarObligaciones(esc.matSinPlan);
    await repo.proyectarObligaciones(esc.matSinCuotas);
    await repo.proyectarObligaciones(esc.matLegacy);
    await repo.proyectarObligaciones(esc.matNaN);
    await repo.proyectarObligaciones(esc.matAnioA);
    await repo.proyectarObligaciones(esc.matAnioB);
    await repo.proyectarObligaciones(esc.matOtroEstudiante);
    await repo.proyectarObligaciones(esc.matMonedaUsd);
    await repo.proyectarObligaciones(2147483646);
    await Promise.all([
      repo.proyectarObligaciones(esc.matMixed),
      repo.proyectarObligaciones(esc.matGrandes),
    ]);

    const despues = await hashLogico();
    expect(despues).toEqual(antes);
    // Ademas: cada tabla con filas conserva su recuento (no se crea ni borra nada).
    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla].split('|')[0], tabla).toBe(antes[tabla].split('|')[0]);
    }
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
