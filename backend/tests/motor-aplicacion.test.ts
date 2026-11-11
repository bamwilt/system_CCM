/**
 * ============================================================================
 * MOTOR DE APLICACION DE ABONOS (FASE 6.B) - PRUEBAS OBLIGATORIAS DEL PM
 * ============================================================================
 *
 * Archivo de pruebas del motor: solo crea/modifica pruebas. Ninguna fuente de
 * produccion se toca aqui. Si una asercion falla, es un defecto del motor y se
 * reporta; el test NUNCA se ajusta para que pase.
 *
 * Las diez pruebas obligatorias (PM FASE 6) son cada una un `it` independiente
 * y nombrado, contra PostgreSQL real (socket Unix aislado), con transacciones
 * reales y conexiones reales en las de idempotencia y concurrencia.
 *
 * Politica financiera: FIJADA explicamente en el entorno del proceso (linea
 * base DEC-20, propuesta tecnica pendiente de ratificacion institucional) para
 * que la suite no dependa del entorno ambiente de la maquina. La prueba
 * "politicas financieras fijadas" comprueba que la resolucion efectivamente
 * usada por el motor coincide con esos valores.
 *
 * Importes: comparaciones EXACTAS de cadena. Ningun importe se convierte con
 * Number ni parseFloat en este archivo: la aritmetica y el redondeo los
 * resuelve PostgreSQL (NUMERIC) y se leen como texto.
 */

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
  // Politica financiera del motor FIJADA (linea base DEC-20).
  const POLITICAS: Record<string, string> = {
    MOTOR_DIA_VENCIMIENTO: '10',
    MOTOR_DIA_INICIO_MORA: '11',
    MOTOR_PORCENTAJE_MORA: '10',
    MOTOR_MORA_UNICA_SOBRE_MONTO_BASE: 'true',
    MOTOR_MORA_CAPITALIZABLE: 'false',
    MOTOR_ORDEN_FIFO: 'fecha_vencimiento_asc',
    MOTOR_DESEMPATE_FIFO: 'numero_cuota_asc,id_asc',
    MOTOR_AMBITO_FIFO: 'plan_de_la_matricula',
    MOTOR_TRATAMIENTO_EXCEDENTE: 'rechazar',
    MOTOR_MODO_ABONO_PARCIAL: 'secuencial_con_remanente',
    MOTOR_PERMITIR_SALDO_NEGATIVO: 'false',
    MOTOR_MODO_REDONDEO: 'half_up_por_postgresql',
    MOTOR_MOMENTO_REDONDEO: 'en_base_de_datos',
    MOTOR_PRECISION_DECIMALES: '2',
    MOTOR_POLITICA_DESCUENTO: 'antes_de_generar_el_plan',
    MOTOR_DESCUENTO_COMO_EFECTIVO: 'false',
    MOTOR_PORCENTAJE_DESCUENTO_POR_DEFECTO: 'ninguno',
    MOTOR_FUENTE_MONEDA: 'planes_pago.moneda',
    MOTOR_CONVERSION_MONEDA: 'false',
    MOTOR_MONEDA_POR_DEFECTO: 'ninguna',
    MOTOR_ESTADO_CUOTA_SALDADA: 'PAGADA',
    MOTOR_CONSERVAR_MORA_AL_SALDAR: 'true',
  };
  for (const clave of Object.keys(POLITICAS)) {
    process.env[clave] = POLITICAS[clave];
  }
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, QueryResult, QueryResultRow } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './auth/testDb';
import { closePool } from '../src/config/database';
import {
  aplicacionPagosService,
  AplicacionPagosService,
} from '../src/services/aplicacion-pagos.service';
import type {
  AplicarAbonoInput,
  AplicarAbonoResultado,
  MedioPagoInput,
} from '../src/services/aplicacion-pagos.service';
import {
  AplicacionPagosRepository,
} from '../src/repositories/aplicacion-pagos.repository';
import type {
  CuotaPendienteFifoRow,
} from '../src/repositories/aplicacion-pagos.repository';
import { AppError } from '../src/middleware/errorHandler';
import { MatriculaService } from '../src/services/matricula.service';
import type { CrearMatriculaDatos } from '../src/services/matricula.service';
import { ObligacionesService } from '../src/services/obligaciones.service';
import { ObligacionesRepository } from '../src/repositories/obligaciones.repository';
import {
  politicasFinancieras,
  resolverPoliticasFinancieras,
  VALORES_PROPUESTA_EN_ENTORNO,
} from '../src/dominio/politicas-financieras';

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

/** Marca de todas las filas creadas por esta suite (limpieza acotada). */
const MARCA = 'MOT6B';
const MARCA_LIKE = `${MARCA}-%`;
/** Anio lectivo propio de la suite (rango amplio para cualquier fixture). */
const ANIO = 2187;
const GRADO = `${MARCA} Grado`;
/** Email del actor de la suite (usuario real: `pagos.usuario_id` es NOT NULL-safe FK). */
const ACTOR_EMAIL = `${MARCA}-actor@test.local`;
/** Actor registrado en pagos/auditoria (id real resuelto en beforeAll). */
let ACTOR = 0;

/** Tablas del motor cuyo contenido logico se compara antes/despues. */
const TABLAS_HASH = [
  'pagos',
  'pago_medios',
  'pago_aplicaciones',
  'mensualidades',
] as const;

interface Escena {
  matriculaId: number;
  planId: number;
  estudianteId: number;
}

interface CuotaFila {
  id: number;
  numero_cuota: number;
  monto_original: string;
  monto_pagado: string;
  saldo_pendiente: string;
  fecha_vencimiento: string;
  estado: string;
  mora_aplicada: string;
}

let pool: Pool;
let hashPool: Pool;

/** Duraciones medidas del motor (contexto, no criterio de aceptacion). */
const LATENCIAS: number[] = [];

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
  expect(filas.length, `se esperaba exactamente una fila: ${sql}`).toBe(1);
  return filas[0];
}

/** Recuento de filas (no es un importe: no hay comparacion exacta de texto). */
async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const fila = await uno<{ c: string }>(sql, params);
  return Number(fila.c);
}

async function limpiarFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Auditoria del motor antes de borrar los pagos que referencia.
    await client.query(
      `DELETE FROM auditoria
        WHERE entidad = 'pagos'
          AND entidad_id IN (
            SELECT p.id FROM pagos p
              JOIN matriculas m ON m.id = p.matricula_id
              JOIN estudiantes e ON e.id = m.estudiante_id
             WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM auditoria
        WHERE entidad = 'matriculas'
          AND entidad_id IN (
            SELECT m.id FROM matriculas m
              JOIN estudiantes e ON e.id = m.estudiante_id
             WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM pago_aplicaciones
        WHERE pago_id IN (
          SELECT p.id FROM pagos p
            JOIN matriculas m ON m.id = p.matricula_id
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM pago_medios
        WHERE pago_id IN (
          SELECT p.id FROM pagos p
            JOIN matriculas m ON m.id = p.matricula_id
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM pagos
        WHERE matricula_id IN (
          SELECT m.id FROM matriculas m
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM mensualidades
        WHERE plan_pago_id IN (
          SELECT p.id FROM planes_pago p
            JOIN matriculas m ON m.id = p.matricula_id
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM planes_pago
        WHERE matricula_id IN (
          SELECT m.id FROM matriculas m
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(
      `DELETE FROM matriculas
        WHERE estudiante_id IN (SELECT id FROM estudiantes WHERE documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query(`DELETE FROM estudiantes WHERE documento_identidad LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM tarifas WHERE concepto LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM usuarios WHERE email LIKE $1`, [MARCA_LIKE]);
    await client.query(`DELETE FROM roles WHERE nombre LIKE $1`, [`${MARCA}%`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actor real de la suite: `pagos.usuario_id` referencia `usuarios(id)`, asi
 * que el motor solo puede registrar un autor que exista. Se crea (o se reusa)
 * un usuario propio con la marca de la suite.
 */
async function asegurarActor(): Promise<number> {
  const roles = await q<{ id: number }>(`SELECT id FROM roles ORDER BY id ASC LIMIT 1`);
  let rolId: number;
  if (roles.length === 0) {
    const creado = await uno<{ id: number }>(
      `INSERT INTO roles (nombre) VALUES ($1) RETURNING id`,
      [`${MARCA} Rol`]
    );
    rolId = creado.id;
  } else {
    rolId = roles[0].id;
  }
  await q(
    `INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo)
     VALUES ($1, $2, 'Fixture', '6B', $3, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [ACTOR_EMAIL, 'mot6b-hash-no-usado', rolId]
  );
  const fila = await uno<{ id: number }>(`SELECT id FROM usuarios WHERE email = $1`, [ACTOR_EMAIL]);
  return fila.id;
}

async function asegurarReferencia(): Promise<{ anioId: number }> {
  await q(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo)
     VALUES ($1, '2026-01-01', '2099-12-31', TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [ANIO]
  );
  await q(
    `INSERT INTO grados (nombre, nivel, anio_lectivo_id)
     SELECT $1, 'Primaria', id FROM anio_lectivo WHERE anio = $2
     ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING`,
    [GRADO, ANIO]
  );
  const fila = await uno<{ id: number }>(
    `SELECT a.id FROM anio_lectivo a JOIN grados g ON g.anio_lectivo_id = a.id
      WHERE a.anio = $1 AND g.nombre = $2 LIMIT 1`,
    [ANIO, GRADO]
  );
  return { anioId: fila.id };
}

/**
 * Escenario completo: estudiante + matricula + plan + cuotas.
 *
 * Las cuotas se insertan UNA A U UNO en el orden recibido: asi el `id` serial
 * sigue el orden de insercion y la prueba FIFO puede invertirlo de verdad
 * (un solo INSERT ... VALUES multiple no conservaria el orden fisico).
 */
async function crearEscena(opciones: {
  sufijo: string;
  cuotas: Array<{
    numero: number;
    monto: string;
    saldo?: string;
    fecha: string;
    estado?: string;
    mora?: string;
  }>;
  montoCuota?: string;
  moneda?: string | null;
}): Promise<Escena> {
  const { anioId } = await asegurarReferencia();
  const documento = `${MARCA}-${opciones.sufijo}`;

  await q(
    `INSERT INTO estudiantes (nombres, apellidos, documento_identidad)
     VALUES ($1, $2, $3)`,
    ['Fixture', '6B', documento]
  );
  const estudiante = await uno<{ id: number }>(
    `SELECT id FROM estudiantes WHERE documento_identidad = $1`,
    [documento]
  );
  const matricula = await uno<{ id: number }>(
    `INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado)
     VALUES ($1, $2, (SELECT id FROM grados WHERE nombre = $3 AND anio_lectivo_id = $2), 'ACTIVA')
     RETURNING id`,
    [estudiante.id, anioId, GRADO]
  );
  const plan = await uno<{ id: number }>(
    `INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      matricula.id,
      opciones.cuotas.length,
      opciones.montoCuota ?? opciones.cuotas[0].monto,
      opciones.moneda ?? 'NIO',
    ]
  );

  for (const cuota of opciones.cuotas) {
    await q(
      `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original,
                                  monto_pagado, saldo_pendiente, fecha_vencimiento, estado,
                                  mora_aplicada)
       VALUES ($1, $2, $3, $4::numeric, '0.00', COALESCE($5::numeric, $4::numeric),
               $6::date, $7, COALESCE($8::numeric, '0.00'::numeric))`,
      [
        plan.id,
        cuota.numero,
        `Mensualidad ${cuota.numero}`,
        cuota.monto,
        cuota.saldo ?? null,
        cuota.fecha,
        cuota.estado ?? 'PENDIENTE',
        cuota.mora ?? null,
      ]
    );
  }

  return { matriculaId: matricula.id, planId: plan.id, estudianteId: estudiante.id };
}

async function cuotasDe(planId: number): Promise<CuotaFila[]> {
  return q<CuotaFila>(
    `SELECT id, numero_cuota, monto_original::text AS monto_original,
            monto_pagado::text AS monto_pagado, saldo_pendiente::text AS saldo_pendiente,
            fecha_vencimiento::text AS fecha_vencimiento, estado,
            mora_aplicada::text AS mora_aplicada
       FROM mensualidades
      WHERE plan_pago_id = $1
      ORDER BY numero_cuota ASC, id ASC`,
    [planId]
  );
}

/** Aplica el abono MIDIENDO la duracion (contexto, no criterio). */
async function aplicar(
  datos: AplicarAbonoInput,
  actorId: number = ACTOR
): Promise<AplicarAbonoResultado> {
  const inicio = performance.now();
  try {
    return await aplicacionPagosService.aplicarAbono(datos, actorId);
  } finally {
    LATENCIAS.push(performance.now() - inicio);
  }
}

/** Espera un AppError con estado concretado y devuelve la instancia. */
async function esperarAppError(
  promesa: Promise<unknown>,
  estado: number
): Promise<AppError> {
  let capturado: unknown = null;
  try {
    await promesa;
  } catch (error) {
    capturado = error;
  }
  expect(capturado, `se esperaba un rechazo con estado ${estado}`).toBeInstanceOf(AppError);
  const appError = capturado as AppError;
  expect(appError.statusCode).toBe(estado);
  return appError;
}

/**
 * Hash logico por tabla: recuento + md5 concatenado de cada fila (orden
 * determinista), sobre TODAS las columnas de la fila (`t::text`).
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
      const fila = await cliente.query<{ n: string; h: string }>(
        `SELECT COUNT(*)::text AS n,
                COALESCE(MD5(STRING_AGG(fila, '' ORDER BY fila)), 'SIN_FILAS') AS h
           FROM (SELECT MD5(t::text) AS fila FROM ${tabla} t) s`
      );
      salida[tabla] = `${fila.rows[0].n}|${fila.rows[0].h}`;
    }
    return salida;
  } finally {
    await cliente.query(`RESET ALL`).catch(() => undefined);
    cliente.release();
  }
}

async function recuentos(): Promise<Record<string, number>> {
  return {
    pagos: await contar(`SELECT COUNT(*)::text AS c FROM pagos`),
    pago_medios: await contar(`SELECT COUNT(*)::text AS c FROM pago_medios`),
    pago_aplicaciones: await contar(`SELECT COUNT(*)::text AS c FROM pago_aplicaciones`),
  };
}

/** Ninguna cuota del plan queda con saldo negativo (comprobado en PG). */
async function exigirSinSaldoNegativo(planId: number): Promise<void> {
  const negativas = await contar(
    `SELECT COUNT(*)::text AS c FROM mensualidades WHERE plan_pago_id = $1 AND saldo_pendiente < 0`,
    [planId]
  );
  expect(negativas, 'ninguna cuota puede quedar con saldo negativo').toBe(0);
  for (const cuota of await cuotasDe(planId)) {
    expect(cuota.saldo_pendiente.startsWith('-')).toBe(false);
  }
}

/**
 * RN-SGPM-07: para el pago indicado, monto_total = suma de medios = suma de
 * aplicaciones. Las tres sumas las resuelve PostgreSQL (NUMERIC exacto) y se
 * comparan como texto exacto.
 */
async function exigirIgualdadExacta(pagoId: number): Promise<void> {
  const fila = await uno<{ total: string; medios: string; aplicaciones: string }>(
    `SELECT p.monto_total::text AS total,
            (SELECT COALESCE(SUM(mdis.monto), '0.00'::numeric)::text
               FROM pago_medios mdis WHERE mdis.pago_id = p.id) AS medios,
            (SELECT COALESCE(SUM(apli.monto_aplicado), '0.00'::numeric)::text
               FROM pago_aplicaciones apli WHERE apli.pago_id = p.id) AS aplicaciones
       FROM pagos p WHERE p.id = $1`,
    [pagoId]
  );
  expect(fila.medios, `suma de medios del pago ${pagoId}`).toBe(fila.total);
  expect(fila.aplicaciones, `suma de aplicaciones del pago ${pagoId}`).toBe(fila.total);
}

async function crearTarifa(sufijo: string, monto: string): Promise<number> {
  const { anioId } = await asegurarReferencia();
  const fila = await uno<{ id: number }>(
    `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
     VALUES ($1, $2, 'NIO', $3, TRUE) RETURNING id`,
    [`${MARCA} Tarifa ${sufijo}`, monto, anioId]
  );
  return fila.id;
}

/**
 * Crea matricula + plan + cuotas por la via de produccion
 * (`MatriculaService.crear`) dentro de una transaccion real, incluyendo el
 * descuento autorizado opcional.
 */
async function crearMatriculaPorServicio(
  sufijo: string,
  tarifaId: number,
  fechas: string[],
  descuento?: { porcentaje: string; autorizado_por: string }
): Promise<{ matriculaId: number; planPagoId: number; totalCuotas: number }> {
  const { anioId } = await asegurarReferencia();
  const documento = `${MARCA}-${sufijo}`;
  await q(
    `INSERT INTO estudiantes (nombres, apellidos, documento_identidad)
     VALUES ($1, $2, $3)`,
    ['Fixture', '6B', documento]
  );
  const estudiante = await uno<{ id: number }>(
    `SELECT id FROM estudiantes WHERE documento_identidad = $1`,
    [documento]
  );
  const datos: CrearMatriculaDatos = {
    estudiante_id: estudiante.id,
    anio_lectivo_id: anioId,
    grado_id: (
      await uno<{ id: number }>(
        `SELECT id FROM grados WHERE nombre = $1 AND anio_lectivo_id = $2`,
        [GRADO, anioId]
      )
    ).id,
    estado: 'ACTIVA',
    plan_pago: { tarifa_id: tarifaId, fechas_vencimiento: fechas },
    ...(descuento ? { descuento } : {}),
  };

  const servicio = new MatriculaService();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await servicio.crear(datos, client, ACTOR);
    await client.query('COMMIT');
    return {
      matriculaId: resultado.matricula.id,
      planPagoId: resultado.plan_pago_id,
      totalCuotas: resultado.total_cuotas,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  ACTOR = await asegurarActor();
};

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
  ACTOR = await asegurarActor();
});

afterAll(async () => {
  await limpiarFixtures().catch(() => undefined);
  // Limpieza defensiva de triggers de prueba (nunca deben sobrevivir).
  const client = await pool.connect().catch(() => null);
  if (client) {
    await client.query('DROP TRIGGER IF EXISTS trg_mot6b_fallar ON pago_aplicaciones').catch(() => undefined);
    await client.query('DROP TRIGGER IF EXISTS trg_mot6b_fallar ON auditoria').catch(() => undefined);
    await client.query('DROP FUNCTION IF EXISTS fn_mot6b_fallar()').catch(() => undefined);
    client.release();
  }
  await closeTestPool(hashPool);
  await closeTestPool(pool);
  await closePool().catch(() => undefined);

  if (LATENCIAS.length > 0) {
    const ordenadas = [...LATENCIAS].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];
    // eslint-disable-next-line no-console
    console.log(
      `MOT6B latencia del motor: ${LATENCIAS.length} abonos, ` +
        `mediana ${mediana.toFixed(1)} ms, max ${ordenadas[ordenadas.length - 1].toFixed(1)} ms`
    );
  }
});

/**
 * Invariante global de la suite: NINGUNA cuota de la marca de esta suite queda
 * con saldo negativo, en ninguna prueba. Se comprueba despues de cada test,
 * antes de limpiar, sobre todas las cuotas creadas por el archivo.
 */
async function exigirNingunSaldoNegativoGlobal(): Promise<void> {
  const negativas = await contar(
    `SELECT COUNT(*)::text AS c
       FROM mensualidades m
       JOIN planes_pago p ON p.id = m.plan_pago_id
       JOIN matriculas ma ON ma.id = p.matricula_id
       JOIN estudiantes e ON e.id = ma.estudiante_id
      WHERE e.documento_identidad LIKE $1 AND m.saldo_pendiente < 0`,
    [MARCA_LIKE]
  );
  expect(
    negativas,
    'ninguna cuota de la suite puede quedar con saldo negativo'
  ).toBe(0);
}

beforeEach(async () => {
  await limpiarFixtures();
  ACTOR = await asegurarActor();
});

afterEach(async () => {
  await exigirNingunSaldoNegativoGlobal();
  await limpiarFixtures();
});

/* ==========================================================================
 * 0. Politicas financieras fijadas (guard de deriva de configuracion)
 * ======================================================================== */

describe('politicas financieras del motor (fijadas, no ambientales)', () => {
  it('la resolucion efectivamente usada por el motor es la linea base DEC-20', () => {
    // Lo que consume el motor es `politicasFinancieras` (process.env): se
    // compara contra la resolucion explicita de los valores propuestos.
    const esperadas = resolverPoliticasFinancieras(VALORES_PROPUESTA_EN_ENTORNO);
    expect(politicasFinancieras.ordenFifo).toBe(esperadas.ordenFifo);
    expect(politicasFinancieras.desempate).toBe(esperadas.desempate);
    expect(politicasFinancieras.ambitoFifo).toBe(esperadas.ambitoFifo);
    expect(politicasFinancieras.tratamientoExcedente).toBe(esperadas.tratamientoExcedente);
    expect(politicasFinancieras.modoAbonoParcial).toBe(esperadas.modoAbonoParcial);
    expect(politicasFinancieras.diaVencimiento).toBe(esperadas.diaVencimiento);
    expect(politicasFinancieras.diaInicioMora).toBe(esperadas.diaInicioMora);
    expect(politicasFinancieras.porcentajeMora).toBe(esperadas.porcentajeMora);
    expect(politicasFinancieras.precisionDecimales).toBe(esperadas.precisionDecimales);
    expect(politicasFinancieras.estadoCuotaSaldada).toBe(esperadas.estadoCuotaSaldada);
    expect(politicasFinancieras.moraCapitalizable).toBe(esperadas.moraCapitalizable);
    expect(politicasFinancieras.permitirSaldoNegativoEnCuota).toBe(
      esperadas.permitirSaldoNegativoEnCuota
    );
    expect(politicasFinancieras.momentoRedondeo).toBe(esperadas.momentoRedondeo);
    expect(politicasFinancieras.politicaDescuento).toBe(esperadas.politicaDescuento);
    expect(politicasFinancieras.descuentoComoEfectivo).toBe(esperadas.descuentoComoEfectivo);
    // Los valores concretos que las diez pruebas dan por supuestos.
    expect(politicasFinancieras.diaVencimiento).toBe(10);
    expect(politicasFinancieras.diaInicioMora).toBe(11);
    expect(politicasFinancieras.porcentajeMora).toBe('10');
    expect(politicasFinancieras.estadoCuotaSaldada).toBe('PAGADA');
    expect(politicasFinancieras.desempate).toBe('numero_cuota_asc,id_asc');
    // Una deriva de configuracion NO pasa en silencio: `saldo_a_favor` es un
    // valor valido del enum, la resolucion lo acepta y el MOTOR lo rechaza
    // (ver la prueba dedicada mas abajo).
    const derivada = resolverPoliticasFinancieras({
      ...VALORES_PROPUESTA_EN_ENTORNO,
      MOTOR_TRATAMIENTO_EXCEDENTE: 'saldo_a_favor',
    });
    expect(derivada.tratamientoExcedente).toBe('saldo_a_favor');
    expect(derivada.tratamientoExcedente).not.toBe(politicasFinancieras.tratamientoExcedente);
  });
});

/* ==========================================================================
 * 0b. Deriva de politica: el motor falla ruidoso, nunca aplica en silencio
 * ======================================================================== */

describe('politicas financieras: deriva de configuracion', () => {
  it('si la politica se aparta de la linea base implementada, el motor rechaza sin escribir nada', async () => {
    const escena = await crearEscena({
      sufijo: 'DRIFT',
      cuotas: [{ numero: 1, monto: '100.00', fecha: '2026-03-10' }],
      montoCuota: '100.00',
    });

    const anterior = process.env.MOTOR_TRATAMIENTO_EXCEDENTE;
    const antes = await recuentos();
    let error: unknown = null;
    try {
      // Entorno derivado SOLO para esta resolucion (se restaura en finally).
      process.env.MOTOR_TRATAMIENTO_EXCEDENTE = 'saldo_a_favor';
      vi.resetModules();
      const { AplicacionPagosService: ServicioDerivado } = await import(
        '../src/services/aplicacion-pagos.service.js'
      );
      const { ErrorPoliticaFinancieraInvalida } = await import(
        '../src/dominio/politicas-financieras.js'
      );
      try {
        await new ServicioDerivado().aplicarAbono(
          {
            matricula_id: escena.matriculaId,
            medios: [{ tipo: 'EFECTIVO', monto: '50.00' }],
            fecha_efectiva: '2026-04-15',
          },
          ACTOR
        );
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ErrorPoliticaFinancieraInvalida);
      expect((error as Error).message).toContain('tratamientoExcedente');
    } finally {
      if (anterior === undefined) {
        delete process.env.MOTOR_TRATAMIENTO_EXCEDENTE;
      } else {
        process.env.MOTOR_TRATAMIENTO_EXCEDENTE = anterior;
      }
      vi.resetModules();
    }

    // La guarda falla ANTES de abrir transaccion: nada escrito.
    expect(await recuentos()).toEqual(antes);
    const cuotas = await cuotasDe(escena.planId);
    expect(cuotas[0].monto_pagado).toBe('0.00');
    expect(cuotas[0].saldo_pendiente).toBe('100.00');
  });
});

/* ==========================================================================
 * PM 1 - PAGO COMPLETO
 * ======================================================================== */

describe('PM 1 pago completo', () => {
  it('un abono por el total de la cuota la deja en saldo 0.00 y PAGADA conservando la mora', async () => {
    const escena = await crearEscena({
      sufijo: 'PM1',
      cuotas: [{ numero: 1, monto: '1000.00', fecha: '2026-03-10' }],
      montoCuota: '1000.00',
    });

    const resultado = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '1000.00' }],
      fecha_efectiva: '2026-04-15',
      observaciones: 'PM1 abono total',
    });

    expect(resultado.idempotent_replay).toBe(false);
    expect(resultado.monto_total).toBe('1000.00');
    expect(resultado.estado).toBe('COMPLETADO');
    expect(resultado.aplicaciones).toHaveLength(1);
    expect(resultado.aplicaciones[0].numero_cuota).toBe(1);
    expect(resultado.aplicaciones[0].monto_aplicado).toBe('1000.00');
    expect(resultado.aplicaciones[0].saldo_pendiente).toBe('0.00');
    expect(resultado.aplicaciones[0].estado).toBe('PAGADA');
    // Mora de la cuota vencida: 10% sobre el monto base, conservada al saldar.
    expect(resultado.aplicaciones[0].mora_aplicada).toBe('100.00');
    expect(resultado.cuotas_saldadas).toHaveLength(1);

    const cuotas = await cuotasDe(escena.planId);
    expect(cuotas).toHaveLength(1);
    expect(cuotas[0].saldo_pendiente).toBe('0.00');
    expect(cuotas[0].monto_pagado).toBe('1000.00');
    expect(cuotas[0].mora_aplicada).toBe('100.00');
    expect(cuotas[0].estado).toBe('PAGADA');

    await exigirIgualdadExacta(resultado.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 2 - PAGO PARCIAL
 * ======================================================================== */

describe('PM 2 pago parcial', () => {
  it('un abono menor reduce el saldo exactamente, no deja negativo ni PAGADA y agota el remanente antes de pasar a la siguiente', async () => {
    const escena = await crearEscena({
      sufijo: 'PM2',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
        { numero: 3, monto: '100.00', fecha: '2026-05-10' },
      ],
      montoCuota: '100.00',
    });

    // 150.00 sobre tres cuotas de 100.00: la primera se salda y el remanente
    // (50.00) se agota en la segunda. La tercera no se toca.
    const resultado = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'TRANSFERENCIA', monto: '150.00' }],
      fecha_efectiva: '2026-06-15',
    });

    expect(resultado.monto_total).toBe('150.00');
    expect(resultado.aplicaciones).toHaveLength(2);

    // Cuota 1: saldada por completo (el remanente se consume dentro de ella).
    expect(resultado.aplicaciones[0].numero_cuota).toBe(1);
    expect(resultado.aplicaciones[0].monto_aplicado).toBe('100.00');
    expect(resultado.aplicaciones[0].saldo_pendiente).toBe('0.00');
    expect(resultado.aplicaciones[0].estado).toBe('PAGADA');
    expect(resultado.aplicaciones[0].mora_aplicada).toBe('10.00');

    // Cuota 2: saldo reducido EXACTAMENTE en el remanente (150.00 - 100.00).
    expect(resultado.aplicaciones[1].numero_cuota).toBe(2);
    expect(resultado.aplicaciones[1].monto_aplicado).toBe('50.00');
    expect(resultado.aplicaciones[1].saldo_pendiente).toBe('50.00');
    expect(resultado.aplicaciones[1].estado).toBe('PENDIENTE');
    expect(resultado.aplicaciones[1].mora_aplicada).toBe('10.00');

    const cuotas = await cuotasDe(escena.planId);
    expect(cuotas).toHaveLength(3);
    // Cuota 3 intacta: el remanente se agoto antes de llegar a ella.
    expect(cuotas[2].numero_cuota).toBe(3);
    expect(cuotas[2].monto_pagado).toBe('0.00');
    expect(cuotas[2].saldo_pendiente).toBe('100.00');
    expect(cuotas[2].mora_aplicada).toBe('0.00');
    expect(cuotas[2].estado).toBe('PENDIENTE');

    await exigirIgualdadExacta(resultado.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 3 - VARIAS OBLIGACIONES PENDIENTES
 * ======================================================================== */

describe('PM 3 varias obligaciones pendientes', () => {
  it('un abono que cubre varias cuotas las aplica en orden y deja el resto intacto', async () => {
    const escena = await crearEscena({
      sufijo: 'PM3',
      cuotas: [
        { numero: 1, monto: '80.00', fecha: '2026-03-10' },
        { numero: 2, monto: '90.00', fecha: '2026-04-10' },
        { numero: 3, monto: '120.00', fecha: '2026-05-10' },
        { numero: 4, monto: '70.00', fecha: '2026-06-10' },
      ],
      montoCuota: '90.00',
    });

    // 170.00 por dos medios: cubre exactamente las cuotas 1 (80.00) y 2
    // (90.00). Las cuotas 3 y 4 quedan intactas.
    const resultado = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [
        { tipo: 'EFECTIVO', monto: '100.00' },
        { tipo: 'TARJETA', monto: '70.00', referencia: 'PM3-REF' },
      ],
      fecha_efectiva: '2026-03-09',
    });

    expect(resultado.monto_total).toBe('170.00');
    expect(resultado.aplicaciones.map((a) => a.numero_cuota)).toEqual([1, 2]);
    expect(resultado.aplicaciones.map((a) => a.monto_aplicado)).toEqual(['80.00', '90.00']);
    expect(resultado.aplicaciones.map((a) => a.estado)).toEqual(['PAGADA', 'PAGADA']);
    expect(resultado.aplicaciones.map((a) => a.mora_aplicada)).toEqual(['0.00', '0.00']);
    expect(resultado.cuotas_saldadas).toHaveLength(2);

    const cuotas = await cuotasDe(escena.planId);
    // Las dos primeras saldadas, las dos ultimas intactas.
    expect(cuotas[0].saldo_pendiente).toBe('0.00');
    expect(cuotas[1].saldo_pendiente).toBe('0.00');
    expect(cuotas[2].saldo_pendiente).toBe('120.00');
    expect(cuotas[2].monto_pagado).toBe('0.00');
    expect(cuotas[2].estado).toBe('PENDIENTE');
    expect(cuotas[3].saldo_pendiente).toBe('70.00');
    expect(cuotas[3].monto_pagado).toBe('0.00');
    expect(cuotas[3].estado).toBe('PENDIENTE');

    await exigirIgualdadExacta(resultado.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 4 - APLICACION FIFO (orden independiente de la insercion)
 * ======================================================================== */

describe('PM 4 aplicacion FIFO', () => {
  it('dos cuotas con la misma fecha de vencimiento se ordenan por numero_cuota y luego por id, y el resultado es identico al insertarlas en orden inverso', async () => {
    // Escenario A: insercion en orden natural (numero_cuota ascendente).
    const natural = await crearEscena({
      sufijo: 'PM4NAT',
      cuotas: [
        { numero: 1, monto: '150.00', fecha: '2026-07-10' },
        { numero: 2, monto: '150.00', fecha: '2026-07-10' },
      ],
      montoCuota: '150.00',
    });
    // Escenario B: insercion INVERSA (el id de la cuota 2 queda MENOR que el de la 1).
    const inverso = await crearEscena({
      sufijo: 'PM4INV',
      cuotas: [
        { numero: 2, monto: '150.00', fecha: '2026-07-10' },
        { numero: 1, monto: '150.00', fecha: '2026-07-10' },
      ],
      montoCuota: '150.00',
    });

    // Comprobacion independiente del orden devuelto por el repositorio:
    // fecha_vencimiento ASC, desempate numero_cuota ASC, id ASC.
    const repo = new AplicacionPagosRepository();
    const cliente = await pool.connect();
    let fifoNatural: CuotaPendienteFifoRow[];
    let fifoInverso: CuotaPendienteFifoRow[];
    try {
      fifoNatural = await repo.obtenerCuotasFifo(natural.planId, '150.00', cliente);
      fifoInverso = await repo.obtenerCuotasFifo(inverso.planId, '150.00', cliente);
    } finally {
      cliente.release();
    }

    // En el escenario inverso el id de la cuota 2 es realmente menor: el
    // resultado no puede ser el orden de insercion/fisico ni el orden por id.
    expect(fifoInverso[0].id).toBeGreaterThan(fifoInverso[1].id);
    // Y aun asi el FIFO devuelve numero_cuota 1 antes que 2.
    expect(fifoNatural.map((c) => c.numero_cuota)).toEqual([1, 2]);
    expect(fifoInverso.map((c) => c.numero_cuota)).toEqual([1, 2]);
    // El desempate por `id` es el ultimo criterio del ORDER BY: solo actua
    // cuando `numero_cuota` tampoco distingue, caso que el esquema prohibe
    // dentro de un plan (UNIQUE(plan_pago_id, numero_cuota)). Queda anotado
    // como hueco de cobertura en el informe; aqui se verifica que el orden
    // devuelto NO depende del id (el id de la primera cuota es MAYOR).
    const idsInverso = fifoInverso.map((c) => c.id);
    expect(idsInverso[0]).toBeGreaterThan(idsInverso[1]);

    // Abono que solo cubre la primera cuota: el destino revela el orden.
    const abonoNatural = await aplicar({
      matricula_id: natural.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
      fecha_efectiva: '2026-07-10',
    });
    const abonoInverso = await aplicar({
      matricula_id: inverso.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
      fecha_efectiva: '2026-07-10',
    });

    const resumen = (r: AplicarAbonoResultado) =>
      r.aplicaciones.map((a) => ({
        numero_cuota: a.numero_cuota,
        monto_aplicado: a.monto_aplicado,
        saldo_pendiente: a.saldo_pendiente,
        estado: a.estado,
        mora_aplicada: a.mora_aplicada,
      }));

    // El resultado es IDENTICO: misma cuota destino, mismo importe, mismo saldo.
    expect(resumen(abonoNatural)).toEqual(resumen(abonoInverso));
    expect(abonoNatural.aplicaciones[0].numero_cuota).toBe(1);
    expect(abonoInverso.aplicaciones[0].numero_cuota).toBe(1);
    expect(abonoNatural.monto_total).toBe(abonoInverso.monto_total);

    // Estado almacenado identico tambien (no solo la respuesta del servicio).
    const cuotaNatural = (await cuotasDe(natural.planId)).find((c) => c.numero_cuota === 1);
    const cuotaInversa = (await cuotasDe(inverso.planId)).find((c) => c.numero_cuota === 1);
    expect(cuotaNatural?.saldo_pendiente).toBe('0.00');
    expect(cuotaInversa?.saldo_pendiente).toBe('0.00');
    const otraNatural = (await cuotasDe(natural.planId)).find((c) => c.numero_cuota === 2);
    const otraInversa = (await cuotasDe(inverso.planId)).find((c) => c.numero_cuota === 2);
    expect(otraNatural?.saldo_pendiente).toBe('150.00');
    expect(otraInversa?.saldo_pendiente).toBe('150.00');
    expect(otraNatural?.estado).toBe('PENDIENTE');
    expect(otraInversa?.estado).toBe('PENDIENTE');

    await exigirIgualdadExacta(abonoNatural.pago_id);
    await exigirIgualdadExacta(abonoInverso.pago_id);
    await exigirSinSaldoNegativo(natural.planId);
    await exigirSinSaldoNegativo(inverso.planId);
  });
});

/* ==========================================================================
 * PM 5 - DESCUENTO AUTORIZADO
 * ======================================================================== */

describe('PM 5 descuento autorizado', () => {
  it('un porcentaje explicito se aplica antes de generar el plan y afecta al monto_cuota almacenado sin contabilizarse como efectivo', async () => {
    const tarifa = await crearTarifa('PM5', '1000.00');
    const creada = await crearMatriculaPorServicio(
      'PM5',
      tarifa,
      ['2026-03-10', '2026-04-10', '2026-05-10'],
      { porcentaje: '10', autorizado_por: 'Direccion' }
    );

    // El descuento afecta al importe ALMACENADO de cada cuota y del plan.
    expect(creada.totalCuotas).toBe(3);
    const plan = await uno<{ monto_cuota: string; tarifa_id: number }>(
      `SELECT monto_cuota::text AS monto_cuota, tarifa_id FROM planes_pago WHERE id = $1`,
      [creada.planPagoId]
    );
    expect(plan.monto_cuota).toBe('900.00');
    expect(plan.tarifa_id).toBe(tarifa);

    const cuotas = await cuotasDe(creada.planPagoId);
    expect(cuotas).toHaveLength(3);
    for (const cuota of cuotas) {
      expect(cuota.monto_original).toBe('900.00');
      expect(cuota.saldo_pendiente).toBe('900.00');
      expect(cuota.mora_aplicada).toBe('0.00');
    }

    // La fila de tarifa NO se modifica.
    const tarifaFila = await uno<{ monto: string }>(
      `SELECT monto::text AS monto FROM tarifas WHERE id = $1`,
      [tarifa]
    );
    expect(tarifaFila.monto).toBe('1000.00');

    // NO se contabiliza como efectivo recibido: ningun pago, ningun importe.
    const pagos = await contar(
      `SELECT COUNT(*)::text AS c FROM pagos WHERE matricula_id = $1`,
      [creada.matriculaId]
    );
    expect(pagos).toBe(0);
    const sumaPagos = await uno<{ total: string }>(
      `SELECT COALESCE(SUM(monto_total), '0.00'::numeric)::text AS total
         FROM pagos WHERE matricula_id = $1`,
      [creada.matriculaId]
    );
    expect(sumaPagos.total).toBe('0.00');
    expect(await contar(`SELECT COUNT(*)::text AS c FROM pago_medios`)).toBe(0);
    expect(await contar(`SELECT COUNT(*)::text AS c FROM pago_aplicaciones`)).toBe(0);

    // Trazabilidad en auditoria: NO hay columna ni tabla nueva (no hay
    // migracion): el descuento queda registrado con sus importes exactos.
    const aud = await q<{ accion: string; detalle: unknown }>(
      `SELECT accion, detalle FROM auditoria
        WHERE entidad = 'matriculas' AND entidad_id = $1 ORDER BY id ASC`,
      [creada.matriculaId]
    );
    expect(aud.length).toBeGreaterThan(0);
    const detalle = aud[aud.length - 1].detalle as {
      descuento: {
        porcentaje: string;
        autorizado_por: string;
        monto_tarifa: string;
        monto_cuota: string;
        descuento_por_cuota: string;
        contabilizado_como_efectivo: boolean;
      };
    };
    expect(detalle.descuento.porcentaje).toBe('10');
    expect(detalle.descuento.autorizado_por).toBe('Direccion');
    expect(detalle.descuento.monto_tarifa).toBe('1000.00');
    expect(detalle.descuento.monto_cuota).toBe('900.00');
    expect(detalle.descuento.descuento_por_cuota).toBe('100.00');
    expect(detalle.descuento.contabilizado_como_efectivo).toBe(false);

    // Sin descuento explicito NO se aplica ningun porcentaje en silencio.
    const otraTarifa = await crearTarifa('PM5SINDESC', '1000.00');
    const sinDescuento = await crearMatriculaPorServicio('PM5SINDESC', otraTarifa, [
      '2026-03-10',
    ]);
    const planSin = await uno<{ monto_cuota: string }>(
      `SELECT monto_cuota::text AS monto_cuota FROM planes_pago WHERE id = $1`,
      [sinDescuento.planPagoId]
    );
    expect(planSin.monto_cuota).toBe('1000.00');
  });

  it("el redondeo half-up de '33.335' sobre '100.00' es '66.67' y NO '66.66': lo resuelve PostgreSQL, no JavaScript", async () => {
    const tarifa = await crearTarifa('PM5RED', '100.00');
    const creada = await crearMatriculaPorServicio(
      'PM5RED',
      tarifa,
      ['2026-03-10', '2026-04-10'],
      { porcentaje: '33.335', autorizado_por: 'Direccion' }
    );

    const plan = await uno<{ monto_cuota: string }>(
      `SELECT monto_cuota::text AS monto_cuota FROM planes_pago WHERE id = $1`,
      [creada.planPagoId]
    );
    // ROUND(100 * (100 - 33.335) / 100, 2) = ROUND(66.665, 2) = 66.67 (half-up).
    expect(plan.monto_cuota).toBe('66.67');
    expect(plan.monto_cuota).not.toBe('66.66');

    const cuotas = await cuotasDe(creada.planPagoId);
    for (const cuota of cuotas) {
      expect(cuota.monto_original).toBe('66.67');
      expect(cuota.saldo_pendiente).toBe('66.67');
    }
    // La tarifa sigue intacta: el descuento no reescribe la tarifa.
    const tarifaFila = await uno<{ monto: string }>(
      `SELECT monto::text AS monto FROM tarifas WHERE id = $1`,
      [tarifa]
    );
    expect(tarifaFila.monto).toBe('100.00');
    // Y sigue sin ser efectivo recibido.
    expect(
      await contar(`SELECT COUNT(*)::text AS c FROM pagos WHERE matricula_id = $1`, [
        creada.matriculaId,
      ])
    ).toBe(0);

    await exigirSinSaldoNegativo(creada.planPagoId);
  });
});

/* ==========================================================================
 * PM 6 - MORA
 * ======================================================================== */

describe('PM 6 mora', () => {
  it('la mora se genera una sola vez sobre el monto base y un abono meses despues no la recalcula ni la capitaliza', async () => {
    const escena = await crearEscena({
      sufijo: 'PM6',
      cuotas: [{ numero: 1, monto: '1000.00', fecha: '2026-03-10' }],
      montoCuota: '1000.00',
    });

    // Primer abono con la cuota vencida: mora 10% sobre 1000.00 base = 100.00.
    const primero = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '400.00' }],
      fecha_efectiva: '2026-04-15',
    });
    expect(primero.aplicaciones[0].mora_aplicada).toBe('100.00');
    expect(primero.aplicaciones[0].monto_aplicado).toBe('400.00');
    expect(primero.aplicaciones[0].saldo_pendiente).toBe('600.00');
    expect(primero.aplicaciones[0].estado).toBe('PENDIENTE');

    const cuota = await cuotasDe(escena.planId);
    expect(cuota[0].mora_aplicada).toBe('100.00');
    expect(cuota[0].monto_pagado).toBe('400.00');
    expect(cuota[0].saldo_pendiente).toBe('600.00');

    // La mora es sobre el monto base y NO capitaliza: saldo + pagado = original.
    const suma = await uno<{ total: string }>(
      `SELECT (monto_pagado + saldo_pendiente)::text AS total FROM mensualidades WHERE id = $1`,
      [cuota[0].id]
    );
    expect(suma.total).toBe('1000.00');

    // Segundo abono meses despues: la mora NO se recalcula.
    const segundo = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '200.00' }],
      fecha_efectiva: '2026-08-20',
    });
    expect(segundo.aplicaciones[0].monto_aplicado).toBe('200.00');
    expect(segundo.aplicaciones[0].saldo_pendiente).toBe('400.00');
    // Sigue siendo 100.00 (ni 10% de 600, ni acumulada, ni borrada).
    expect(segundo.aplicaciones[0].mora_aplicada).toBe('100.00');

    const despues = await cuotasDe(escena.planId);
    expect(despues[0].mora_aplicada).toBe('100.00');
    expect(despues[0].monto_pagado).toBe('600.00');
    expect(despues[0].saldo_pendiente).toBe('400.00');
    expect(despues[0].estado).toBe('PENDIENTE');

    // Cero mora antes del dia de inicio: el dia 10 del mes de vencimiento no genera mora.
    const puntual = await crearEscena({
      sufijo: 'PM6PUNTUAL',
      cuotas: [{ numero: 1, monto: '500.00', fecha: '2026-03-10' }],
      montoCuota: '500.00',
    });
    const abonoPuntual = await aplicar({
      matricula_id: puntual.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '100.00' }],
      fecha_efectiva: '2026-03-10',
    });
    expect(abonoPuntual.aplicaciones[0].mora_aplicada).toBe('0.00');
    const cuotaPuntual = await cuotasDe(puntual.planId);
    expect(cuotaPuntual[0].mora_aplicada).toBe('0.00');

    // Y el dia 11 del mismo mes si la genera (umbral real de la politica).
    const umbral = await crearEscena({
      sufijo: 'PM6UMBRAL',
      cuotas: [{ numero: 1, monto: '500.00', fecha: '2026-03-10' }],
      montoCuota: '500.00',
    });
    const abonoUmbral = await aplicar({
      matricula_id: umbral.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '100.00' }],
      fecha_efectiva: '2026-03-11',
    });
    expect(abonoUmbral.aplicaciones[0].mora_aplicada).toBe('50.00');

    await exigirIgualdadExacta(primero.pago_id);
    await exigirIgualdadExacta(segundo.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 7 - SALDO CERO
 * ======================================================================== */

describe('PM 7 saldo cero', () => {
  it('con todas las cuotas saldadas el saldo_total es 0.00 y ninguna queda pendiente', async () => {
    const escena = await crearEscena({
      sufijo: 'PM7',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
        { numero: 3, monto: '100.00', fecha: '2026-05-10' },
      ],
      montoCuota: '100.00',
    });

    const primero = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
      fecha_efectiva: '2026-06-01',
    });
    const segundo = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
      fecha_efectiva: '2026-06-02',
    });

    const cuotas = await cuotasDe(escena.planId);
    for (const cuota of cuotas) {
      expect(cuota.saldo_pendiente).toBe('0.00');
      expect(cuota.monto_pagado).toBe('100.00');
      expect(cuota.estado).toBe('PAGADA');
    }

    // Saldo total real del plan, sumado por PostgreSQL.
    const saldo = await uno<{ total: string }>(
      `SELECT COALESCE(SUM(saldo_pendiente), '0.00'::numeric)::text AS total
         FROM mensualidades WHERE plan_pago_id = $1`,
      [escena.planId]
    );
    expect(saldo.total).toBe('0.00');

    // Verificacion cruzada con la proyeccion de obligaciones (6.A).
    const obligaciones = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await obligaciones.proyectarObligaciones(escena.matriculaId);
    if (proyeccion.estado !== 'CON_OBLIGACIONES') throw new Error('estado inesperado');
    expect(proyeccion.resumen.saldo_total).toBe('0.00');
    expect(proyeccion.resumen.tiene_saldo_positivo).toBe(false);
    expect(proyeccion.resumen.cuotas_contadas).toBe(3);

    const pendientes = await obligaciones.proyectarPendientes(escena.matriculaId);
    if (pendientes.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    expect(pendientes.pendientes).toEqual([]);
    expect(pendientes.cuotas_pendientes).toBe(0);

    // Total cobrado = total de cuotas (sin perdida ni duplicacion).
    const cobrado = await uno<{ total: string }>(
      `SELECT COALESCE(SUM(monto_aplicado), '0.00'::numeric)::text AS total
         FROM pago_aplicaciones a
         JOIN mensualidades m ON m.id = a.mensualidad_id
        WHERE m.plan_pago_id = $1`,
      [escena.planId]
    );
    expect(cobrado.total).toBe('300.00');

    await exigirIgualdadExacta(primero.pago_id);
    await exigirIgualdadExacta(segundo.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 8 - PAGO DUPLICADO (idempotencia)
 * ======================================================================== */

describe('PM 8 pago duplicado', () => {
  it('la misma idempotencia_key repetida no duplica pagos, aplicaciones ni movimientos de saldo, y con otra matricula devuelve 409', async () => {
    const escena = await crearEscena({
      sufijo: 'PM8',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
      ],
      montoCuota: '100.00',
    });

    const peticion = {
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '100.00' }],
      fecha_efectiva: '2026-04-15',
      idempotencia_key: 'MOT6B-PM8-CLAVE',
    };

    const primero = await aplicar(peticion);
    expect(primero.idempotent_replay).toBe(false);

    // Misma clave, MISMA matricula: replay idempotente (sin reaplicar).
    const replay = await aplicar(peticion);
    expect(replay.idempotent_replay).toBe(true);
    expect(replay.pago_id).toBe(primero.pago_id);
    expect(replay.monto_total).toBe(primero.monto_total);
    expect(replay.estado).toBe(primero.estado);

    // Misma clave con OTRA matricula: 409 (la clave no se reutiliza entre abonos).
    const otra = await crearEscena({
      sufijo: 'PM8B',
      cuotas: [{ numero: 1, monto: '100.00', fecha: '2026-03-10' }],
      montoCuota: '100.00',
    });
    const conflicto = await esperarAppError(
      aplicar({ ...peticion, matricula_id: otra.matriculaId }),
      409
    );
    expect(conflicto.code).toBe('CONFLICT');

    // Sin duplicacion: una sola cabecera, un solo medio y las aplicaciones del primero.
    const pagos = await q<{ id: number; monto_total: string }>(
      `SELECT id, monto_total::text AS monto_total FROM pagos WHERE matricula_id = $1 ORDER BY id`,
      [escena.matriculaId]
    );
    expect(pagos).toHaveLength(1);
    expect(pagos[0].monto_total).toBe('100.00');
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_medios WHERE pago_id = $1`,
        [primero.pago_id]
      )
    ).toBe(1);
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_aplicaciones WHERE pago_id = $1`,
        [primero.pago_id]
      )
    ).toBe(1);
    // Y ningun pago para la otra matricula.
    expect(
      await contar(`SELECT COUNT(*)::text AS c FROM pagos WHERE matricula_id = $1`, [
        otra.matriculaId,
      ])
    ).toBe(0);

    // El movimiento de saldo quedo EXACTAMENTE una vez.
    const cuotas = await cuotasDe(escena.planId);
    expect(cuotas[0].monto_pagado).toBe('100.00');
    expect(cuotas[0].saldo_pendiente).toBe('0.00');
    expect(cuotas[0].estado).toBe('PAGADA');
    expect(cuotas[1].monto_pagado).toBe('0.00');
    expect(cuotas[1].saldo_pendiente).toBe('100.00');
    expect(cuotas[1].estado).toBe('PENDIENTE');

    await exigirIgualdadExacta(primero.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 9 - PAGO CONCURRENTE
 * ======================================================================== */

describe('PM 9 pago concurrente', () => {
  it('dos abonos simultaneos a la misma matricula producen saldos coherentes, sin perdida ni duplicacion, y monto_total = medios = aplicaciones', async () => {
    const escena = await crearEscena({
      sufijo: 'PM9',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
        { numero: 3, monto: '100.00', fecha: '2026-05-10' },
      ],
      montoCuota: '100.00',
    });

    // DOS conexiones reales del pool, dos transacciones reales, sin mock de FIFO.
    const [a, b] = await Promise.all([
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
        fecha_efectiva: '2026-06-01',
        idempotencia_key: 'MOT6B-PM9-A',
      }),
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'TARJETA', monto: '150.00' }],
        fecha_efectiva: '2026-06-01',
        idempotencia_key: 'MOT6B-PM9-B',
      }),
    ]);

    expect(a.pago_id).not.toBe(b.pago_id);
    expect(a.monto_total).toBe('150.00');
    expect(b.monto_total).toBe('150.00');

    // Igualdad exacta por pago (cada uno con su medio y sus aplicaciones).
    await exigirIgualdadExacta(a.pago_id);
    await exigirIgualdadExacta(b.pago_id);

    // La suma aplicada coincide con la suma cobrada: ni perdida ni duplicacion.
    // 150.00 + 150.00 sobre tres cuotas de 100.00 dejan, sea cual sea el orden
    // de aplicacion, cuatro aplicaciones (100+50 y 50+100).
    const totales = await uno<{ aplicado: string; cobrado: string; filas: string }>(
      `SELECT (SELECT COALESCE(SUM(monto_aplicado), '0.00'::numeric)::text
                 FROM pago_aplicaciones a
                 JOIN mensualidades m ON m.id = a.mensualidad_id
                WHERE m.plan_pago_id = $1) AS aplicado,
              (SELECT COALESCE(SUM(monto_pagado), '0.00'::numeric)::text
                 FROM mensualidades WHERE plan_pago_id = $1) AS cobrado,
              (SELECT COUNT(*)::text
                 FROM pago_aplicaciones a
                 JOIN mensualidades m ON m.id = a.mensualidad_id
                WHERE m.plan_pago_id = $1) AS filas`,
      [escena.planId]
    );
    expect(totales.aplicado).toBe('300.00');
    expect(totales.cobrado).toBe('300.00');
    expect(totales.filas).toBe('4');

    // Cada pago aplico sobre dos cuotas (FIFO con remanente), no mas.
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_aplicaciones WHERE pago_id = $1`,
        [a.pago_id]
      )
    ).toBe(2);
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_aplicaciones WHERE pago_id = $1`,
        [b.pago_id]
      )
    ).toBe(2);

    // Coherencia por cuota: lo aplicado a cada cuota = lo pagado en ella.
    const porCuota = await q<{ numero_cuota: number; aplicado: string; pagado: string }>(
      `SELECT m.numero_cuota,
              (SELECT COALESCE(SUM(a.monto_aplicado), '0.00'::numeric)::text
                 FROM pago_aplicaciones a WHERE a.mensualidad_id = m.id) AS aplicado,
              m.monto_pagado::text AS pagado
         FROM mensualidades m WHERE m.plan_pago_id = $1 ORDER BY m.numero_cuota ASC`,
      [escena.planId]
    );
    expect(porCuota).toHaveLength(3);
    for (const cuota of porCuota) {
      expect(cuota.aplicado, `cuota ${cuota.numero_cuota}`).toBe(cuota.pagado);
      expect(cuota.pagado).toBe('100.00');
    }

    // Las tres cuotas saldadas exactamente una vez.
    const cuotas = await cuotasDe(escena.planId);
    expect(cuotas).toHaveLength(3);
    for (const cuota of cuotas) {
      expect(cuota.saldo_pendiente).toBe('0.00');
      expect(cuota.monto_pagado).toBe('100.00');
      expect(cuota.estado).toBe('PAGADA');
    }

    // Dos cabeceras, dos medios, tres aplicaciones: nada duplicado.
    expect(
      await contar(`SELECT COUNT(*)::text AS c FROM pagos WHERE matricula_id = $1`, [
        escena.matriculaId,
      ])
    ).toBe(2);
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_medios m
           JOIN pagos p ON p.id = m.pago_id WHERE p.matricula_id = $1`,
        [escena.matriculaId]
      )
    ).toBe(2);
    expect(
      await contar(
        `SELECT COUNT(*)::text AS c FROM pago_aplicaciones ap
           JOIN pagos p ON p.id = ap.pago_id WHERE p.matricula_id = $1`,
        [escena.matriculaId]
      )
    ).toBe(4);

    await exigirSinSaldoNegativo(escena.planId);
  });
});

/* ==========================================================================
 * PM 10 - FALLO TRANSACCIONAL
 * ======================================================================== */

describe('PM 10 fallo transaccional', () => {
  it('un error forzado a mitad de la transaccion deja CERO filas en pagos, pago_medios y pago_aplicaciones, y mensualidades identicas', async () => {
    const escena = await crearEscena({
      sufijo: 'PM10',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
      ],
      montoCuota: '100.00',
    });

    const antes = await hashLogico();
    const recuentoAntes = await recuentos();
    const cuotaAntes = await cuotasDe(escena.planId);

    // Error forzado en PostgreSQL a mitad de la transaccion del motor: un
    // trigger que aborta el INSERT de aplicaciones REAL (sin mock de FIFO).
    const cliente = await pool.connect();
    try {
      await cliente.query(
        `CREATE OR REPLACE FUNCTION fn_mot6b_fallar() RETURNS trigger LANGUAGE plpgsql AS $$
           BEGIN RAISE EXCEPTION 'fallo forzado en la transaccion del motor'; END;
         $$;`
      );
      await cliente.query(
        'CREATE TRIGGER trg_mot6b_fallar BEFORE INSERT ON pago_aplicaciones FOR EACH ROW EXECUTE FUNCTION fn_mot6b_fallar()'
      );
    } finally {
      cliente.release();
    }

    let error: unknown = null;
    try {
      await aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '150.00' }],
        fecha_efectiva: '2026-04-15',
      });
    } catch (e) {
      error = e;
    } finally {
      const limpieza = await pool.connect();
      try {
        await limpieza.query('DROP TRIGGER IF EXISTS trg_mot6b_fallar ON pago_aplicaciones');
        await limpieza.query('DROP FUNCTION IF EXISTS fn_mot6b_fallar()');
      } finally {
        limpieza.release();
      }
    }

    // El error se propaga: el motor NO lo convierte en exito ni en 200.
    expect(error).toBeInstanceOf(Error);

    const despues = await hashLogico();
    const recuentoDespues = await recuentos();

    // CERO filas nuevas en las tres tablas del motor.
    expect(recuentoDespues.pagos).toBe(recuentoAntes.pagos);
    expect(recuentoDespues.pago_medios).toBe(recuentoAntes.pago_medios);
    expect(recuentoDespues.pago_aplicaciones).toBe(recuentoAntes.pago_aplicaciones);
    expect(recuentoDespues.pagos).toBe(0);
    expect(recuentoDespues.pago_medios).toBe(0);
    expect(recuentoDespues.pago_aplicaciones).toBe(0);

    // mensualidades byte-identicas (hash de todas las columnas de cada fila).
    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla], `hash logico de ${tabla}`).toBe(antes[tabla]);
      expect(despues[tabla].split('|')[0], `recuento de ${tabla}`).toBe(
        antes[tabla].split('|')[0]
      );
    }

    // Y el contenido de las cuotas sigue siendo exactamente el anterior.
    expect(await cuotasDe(escena.planId)).toEqual(cuotaAntes);
  });
});

/* ==========================================================================
 * EXCEDENTE, IGUALDAD EXACTA Y ESCRITURAS DE RECHAZOS
 * ======================================================================== */

describe('excedente y ausencia de escrituras', () => {
  it('un abono que excede la deuda total pendiente se rechaza con 400 y no escribe nada', async () => {
    const escena = await crearEscena({
      sufijo: 'EXC',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
        { numero: 3, monto: '100.00', fecha: '2026-05-10' },
      ],
      montoCuota: '100.00',
    });

    // El total pendiente es exactamente 300.00: 300.01 excede.
    const deuda = await uno<{ total: string }>(
      `SELECT COALESCE(SUM(saldo_pendiente), '0.00'::numeric)::text AS total
         FROM mensualidades WHERE plan_pago_id = $1`,
      [escena.planId]
    );
    expect(deuda.total).toBe('300.00');

    const antes = await hashLogico();
    const recuentoAntes = await recuentos();

    const error = await esperarAppError(
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '300.01' }],
        fecha_efectiva: '2026-06-01',
      }),
      400
    );
    expect(error.code).toBe('BAD_REQUEST');

    const despues = await hashLogico();
    const recuentoDespues = await recuentos();

    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla], `hash logico de ${tabla}`).toBe(antes[tabla]);
    }
    expect(recuentoDespues).toEqual(recuentoAntes);

    // Un abono por el total exacto NO excede: se acepta (frontera medida).
    const exacto = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'EFECTIVO', monto: '300.00' }],
      fecha_efectiva: '2026-06-01',
    });
    expect(exacto.monto_total).toBe('300.00');
    await exigirIgualdadExacta(exacto.pago_id);
    await exigirSinSaldoNegativo(escena.planId);
  });

  it('los rechazos de validacion (fecha efectiva ausente, medios invalidos, matricula inexistente) no escriben nada', async () => {
    const escena = await crearEscena({
      sufijo: 'REJ',
      cuotas: [{ numero: 1, monto: '100.00', fecha: '2026-03-10' }],
      montoCuota: '100.00',
    });

    const antes = await hashLogico();
    const recuentoAntes = await recuentos();

    // Sin fecha efectiva: el motor NUNCA usa el reloj del servidor para mora.
    const sinFecha = await esperarAppError(
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '50.00' }],
        fecha_efectiva: '',
      }),
      400
    );
    expect(sinFecha.code).toBe('BAD_REQUEST');

    await esperarAppError(
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [],
        fecha_efectiva: '2026-04-15',
      }),
      400
    );

    await esperarAppError(
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '0.00' }],
        fecha_efectiva: '2026-04-15',
      }),
      400
    );

    await esperarAppError(
      aplicar({
        matricula_id: escena.matriculaId,
        medios: [{ tipo: 'EFECTIVO', monto: '-10.00' }],
        fecha_efectiva: '2026-04-15',
      }),
      400
    );

    const inexistente = await esperarAppError(
      aplicar({
        matricula_id: 2147483646,
        medios: [{ tipo: 'EFECTIVO', monto: '10.00' }],
        fecha_efectiva: '2026-04-15',
      }),
      404
    );
    expect(inexistente.code).toBe('NOT_FOUND');

    const despues = await hashLogico();
    const recuentoDespues = await recuentos();
    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla], `hash logico de ${tabla}`).toBe(antes[tabla]);
    }
    expect(recuentoDespues).toEqual(recuentoAntes);

    await exigirSinSaldoNegativo(escena.planId);
  });

  it('la igualdad exacta RN-SGPM-07 se verifica en cada pago registrado', async () => {
    const escena = await crearEscena({
      sufijo: 'RN',
      cuotas: [
        { numero: 1, monto: '100.00', fecha: '2026-03-10' },
        { numero: 2, monto: '100.00', fecha: '2026-04-10' },
        { numero: 3, monto: '100.00', fecha: '2026-05-10' },
      ],
      montoCuota: '100.00',
    });

    const p1 = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [
        { tipo: 'EFECTIVO', monto: '30.00' },
        { tipo: 'TARJETA', monto: '70.00' },
      ],
      fecha_efectiva: '2026-06-01',
    });
    const p2 = await aplicar({
      matricula_id: escena.matriculaId,
      medios: [{ tipo: 'TRANSFERENCIA', monto: '100.00', referencia: 'RN-2' }],
      fecha_efectiva: '2026-06-02',
    });

    await exigirIgualdadExacta(p1.pago_id);
    await exigirIgualdadExacta(p2.pago_id);

    // Barrido sobre TODOS los pagos de la suite: para cada uno, las tres
    // cantidades coinciden exactamente (texto contra texto).
    const filas = await q<{
      id: number;
      total: string;
      medios: string;
      aplicaciones: string;
    }>(
      `SELECT p.id,
              p.monto_total::text AS total,
              (SELECT COALESCE(SUM(mdis.monto), '0.00'::numeric)::text
                 FROM pago_medios mdis WHERE mdis.pago_id = p.id) AS medios,
              (SELECT COALESCE(SUM(apli.monto_aplicado), '0.00'::numeric)::text
                 FROM pago_aplicaciones apli WHERE apli.pago_id = p.id) AS aplicaciones
         FROM pagos p
         JOIN matriculas m ON m.id = p.matricula_id
         JOIN estudiantes e ON e.id = m.estudiante_id
        WHERE e.documento_identidad LIKE $1
        ORDER BY p.id ASC`,
      [MARCA_LIKE]
    );
    expect(filas.length).toBeGreaterThanOrEqual(2);
    for (const fila of filas) {
      expect(fila.total, `pago ${fila.id}: monto_total`).not.toBe('');
      expect(fila.total).toBe(fila.medios);
      expect(fila.total).toBe(fila.aplicaciones);
    }

    await exigirSinSaldoNegativo(escena.planId);
  });
});
