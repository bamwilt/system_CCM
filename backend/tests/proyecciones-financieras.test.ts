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
import {
  ESTADOS_CUOTA_RECONOCIDOS,
  ESTADOS_NO_TERMINALES_RECONOCIDOS,
  ESTADOS_TERMINALES_CUOTA,
  ObligacionesService,
} from '../src/services/obligaciones.service';
import type {
  ProyeccionHistorial,
  ProyeccionPendientes,
} from '../src/services/obligaciones.service';
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

/** Marca de todas las filas creadas por esta suite (limpieza acotada). */
const MARCA = 'PROY6B';
const MARCA_LIKE = `${MARCA}-%`;
/** Anio lectivo propio de la suite. */
const ANIO = 2201;
const GRADO = `${MARCA} Grado`;
/** Email del actor de la suite (`pagos.usuario_id` referencia `usuarios(id)`). */
const ACTOR_EMAIL = `${MARCA}-actor@test.local`;
/** Identificador de matricula que no existe (nunca asignado por el serial). */
const MATRICULA_INEXISTENTE = 2147483646;

/** Tablas cuyo contenido logico se compara antes/despues de las lecturas. */
const TABLAS_HASH = [
  'pagos',
  'pago_medios',
  'pago_aplicaciones',
  'mensualidades',
] as const;

/** Secuencias de esas tablas: se miden aparte, NUNCA forman parte del hash. */
const SECUENCIAS_HASH = [
  'pagos_id_seq',
  'pago_medios_id_seq',
  'pago_aplicaciones_id_seq',
  'mensualidades_id_seq',
] as const;

interface Escena {
  matMixta: number;
  idsMatMixta: number[];
  matSinPlan: number;
  matLegacy: number;
  tarifaUsd: number;
  matArchivada: number;
  matNegativa: number;
  matNaN: number;
  planNaN: number;
  matPagadaConSaldo: number;
  matPagos: number;
  idsCuotasPagos: number[];
  pagoAntiguoId: number;
  idsMediosAntiguo: number[];
  idsAplicacionesAntiguo: number[];
  pagoNuevoId: number;
  idsMediosNuevo: number[];
  idsAplicacionesNuevo: number[];
  matOtraConPago: number;
  pagoOtraId: number;
  matSinPagos: number;
  actor: number;
  estudiantePagos: number;
}

let pool: Pool;
let hashPool: Pool;
let esc: Escena;

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

async function idsDe(sql: string, params: unknown[] = []): Promise<number[]> {
  const filas = await q<{ id: number }>(sql, params);
  return filas.map((f) => f.id);
}

async function limpiarFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Hijos antes que padres: pago_aplicaciones/pago_medios/pagos referencian
    // mensualidades y matriculas, y no se puede borrar el padre primero.
    await client.query(
      `DELETE FROM pago_aplicaciones
        WHERE pago_id IN (
          SELECT p.id FROM pagos p
            LEFT JOIN estudiantes e ON e.id = p.estudiante_id
           WHERE e.documento_identidad LIKE $1
              OR p.idempotencia_key LIKE $2)`,
      [MARCA_LIKE, `${MARCA}-KEY-%`]
    );
    await client.query(
      `DELETE FROM pago_medios
        WHERE pago_id IN (
          SELECT p.id FROM pagos p
            LEFT JOIN estudiantes e ON e.id = p.estudiante_id
           WHERE e.documento_identidad LIKE $1
              OR p.idempotencia_key LIKE $2)`,
      [MARCA_LIKE, `${MARCA}-KEY-%`]
    );
    await client.query(
      `DELETE FROM pagos
        WHERE estudiante_id IN (SELECT id FROM estudiantes WHERE documento_identidad LIKE $1)
           OR idempotencia_key LIKE $2`,
      [MARCA_LIKE, `${MARCA}-KEY-%`]
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
    await client.query(
      `DELETE FROM auditoria
        WHERE entidad_id IN (
          SELECT m.id FROM matriculas m
            JOIN estudiantes e ON e.id = m.estudiante_id
           WHERE e.documento_identidad LIKE $1)`,
      [MARCA_LIKE]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function asegurarReferencia(): Promise<number> {
  await q(
    `INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo)
     VALUES ($1, '2201-01-01', '2201-12-31', TRUE)
     ON CONFLICT (anio) DO NOTHING`,
    [ANIO]
  );
  await q(
    `INSERT INTO grados (nombre, nivel, anio_lectivo_id)
     SELECT $1, 'Primaria', id FROM anio_lectivo WHERE anio = $2
     ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING`,
    [GRADO, ANIO]
  );
  const [anio] = await q<{ id: number }>(
    `SELECT a.id FROM anio_lectivo a
       JOIN grados g ON g.anio_lectivo_id = a.id
      WHERE a.anio = $1 AND g.nombre = $2 LIMIT 1`,
    [ANIO, GRADO]
  );
  return anio.id;
}

/**
 * Actor real de la suite: `pagos.usuario_id` referencia `usuarios(id)`, asi que
 * un pago solo puede registrar un autor que exista. Se crea (o se reusa) un
 * usuario propio con la marca de la suite.
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
    [ACTOR_EMAIL, 'proy6b-hash-no-usado', rolId]
  );
  const fila = await uno<{ id: number }>(`SELECT id FROM usuarios WHERE email = $1`, [ACTOR_EMAIL]);
  return fila.id;
}

async function crearMatricula(documento: string, anioId: number): Promise<number> {
  await q(`INSERT INTO estudiantes (nombres, apellidos, documento_identidad) VALUES ($1, $2, $3)`, [
    'Fixture',
    '6B',
    documento,
  ]);
  const fila = await uno<{ id: number }>(
    `INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado)
     SELECT e.id, $1, g.id, 'ACTIVA'
       FROM estudiantes e
       JOIN grados g ON g.anio_lectivo_id = $1 AND g.nombre = $3
      WHERE e.documento_identidad = $2
      RETURNING id`,
    [anioId, documento, GRADO]
  );
  return fila.id;
}

async function idPlanDe(matriculaId: number): Promise<number> {
  const fila = await uno<{ id: number }>(`SELECT id FROM planes_pago WHERE matricula_id = $1`, [
    matriculaId,
  ]);
  return fila.id;
}

interface CuotaDatos {
  n: number;
  saldo: string;
  estado: string;
  fecha: string;
  original?: string;
  pagado?: string;
  mora?: string;
}

async function crearCuota(planId: number, c: CuotaDatos): Promise<void> {
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                 saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
    [
      planId,
      c.n,
      `C${c.n}`,
      c.original ?? c.saldo,
      c.pagado ?? '0.00',
      c.saldo,
      c.fecha,
      c.estado,
      c.mora ?? '0.00',
    ]
  );
}

async function crearPlan(
  matriculaId: number,
  total: number,
  monto: string,
  moneda: string | null,
  tarifaId: number | null = null
): Promise<number> {
  await q(
    `INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota, moneda, tarifa_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [matriculaId, total, monto, moneda, tarifaId]
  );
  return idPlanDe(matriculaId);
}

interface MedioDatos {
  tipo: string;
  monto: string;
  referencia?: string | null;
}

interface AplicacionDatos {
  mensualidadId: number;
  monto: string;
}

interface PagoDatos {
  monto: string;
  /** Timestamptz con offset explicito (instante UTC determinado). */
  fecha: string;
  estado?: string;
  idempotencia: string;
  observaciones?: string | null;
  usuarioId?: number | null;
}

async function crearPago(
  estudianteId: number,
  matriculaId: number | null,
  p: PagoDatos,
  medios: MedioDatos[],
  aplicaciones: AplicacionDatos[]
): Promise<number> {
  const fila = await uno<{ id: number }>(
    `INSERT INTO pagos (estudiante_id, matricula_id, monto_total, fecha_pago, estado,
                        idempotencia_key, usuario_id, observaciones)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8)
     RETURNING id`,
    [
      estudianteId,
      matriculaId,
      p.monto,
      p.fecha,
      p.estado ?? 'COMPLETADO',
      p.idempotencia,
      p.usuarioId ?? null,
      p.observaciones ?? null,
    ]
  );
  const pagoId = fila.id;
  for (const medio of medios) {
    await q(
      `INSERT INTO pago_medios (pago_id, tipo, monto, referencia) VALUES ($1, $2, $3, $4)`,
      [pagoId, medio.tipo, medio.monto, medio.referencia ?? null]
    );
  }
  for (const aplicacion of aplicaciones) {
    await q(
      `INSERT INTO pago_aplicaciones (pago_id, mensualidad_id, monto_aplicado) VALUES ($1, $2, $3)`,
      [pagoId, aplicacion.mensualidadId, aplicacion.monto]
    );
  }
  return pagoId;
}

async function crearFixtures(): Promise<Escena> {
  const anioId = await asegurarReferencia();
  const actor = await asegurarActor();

  /* --- proyeccion de PENDIENTES ------------------------------------- */

  const matMixta = await crearMatricula(`${MARCA}-MIX`, anioId);
  await crearPlan(matMixta, 4, '100.00', 'NIO');
  const planMixta = await idPlanDe(matMixta);
  await crearCuota(planMixta, {
    n: 1,
    saldo: '1000.00',
    estado: 'PENDIENTE',
    fecha: '2026-03-15',
  });
  await crearCuota(planMixta, {
    n: 2,
    saldo: '250.50',
    estado: 'PARCIAL',
    fecha: '2026-06-30',
    original: '1000.00',
    pagado: '749.50',
  });
  await crearCuota(planMixta, {
    n: 3,
    saldo: '0.00',
    estado: 'PAGADA',
    fecha: '2026-02-28',
    original: '100.00',
    pagado: '100.00',
  });
  await crearCuota(planMixta, {
    n: 4,
    saldo: '0.00',
    estado: 'PENDIENTE',
    fecha: '2026-07-31',
    original: '100.00',
    pagado: '100.00',
  });
  const idsMatMixta = await idsDe(
    `SELECT id FROM mensualidades WHERE plan_pago_id = $1 ORDER BY numero_cuota ASC`,
    [planMixta]
  );

  const matSinPlan = await crearMatricula(`${MARCA}-NOPLAN`, anioId);

  const tarifaUsd = (
    await q<{ id: number }>(
      `INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
       VALUES ($1, '123.45', 'USD', $2, TRUE) RETURNING id`,
      [`${MARCA} Tarifa vigente`, anioId]
    )
  )[0].id;
  const matLegacy = await crearMatricula(`${MARCA}-LEGACY`, anioId);
  await crearPlan(matLegacy, 2, '123.45', null, tarifaUsd);
  await crearCuota(await idPlanDe(matLegacy), {
    n: 1,
    saldo: '123.45',
    estado: 'PENDIENTE',
    fecha: '2026-01-15',
  });
  await crearCuota(await idPlanDe(matLegacy), {
    n: 2,
    saldo: '0.01',
    estado: 'PENDIENTE',
    fecha: '2026-02-15',
  });

  const matArchivada = await crearMatricula(`${MARCA}-ARCH`, anioId);
  await crearPlan(matArchivada, 2, '480.00', 'NIO');
  const planArch = await idPlanDe(matArchivada);
  await crearCuota(planArch, {
    n: 1,
    saldo: '480.00',
    estado: 'ARCHIVADA_ZZZ',
    fecha: '2026-03-10',
  });
  await crearCuota(planArch, {
    n: 2,
    saldo: '60.00',
    estado: 'PENDIENTE',
    fecha: '2026-04-10',
  });

  const matNegativa = await crearMatricula(`${MARCA}-NEG`, anioId);
  await crearPlan(matNegativa, 3, '100.00', 'NIO');
  const planNeg = await idPlanDe(matNegativa);
  await crearCuota(planNeg, {
    n: 1,
    saldo: '-500.00',
    estado: 'PENDIENTE',
    fecha: '2026-05-10',
    original: '400.00',
    pagado: '900.00',
  });
  await crearCuota(planNeg, {
    n: 2,
    saldo: '0.00',
    estado: 'PARCIAL',
    fecha: '2026-06-10',
    original: '100.00',
    pagado: '100.00',
  });
  await crearCuota(planNeg, {
    n: 3,
    saldo: '250.00',
    estado: 'PARCIAL',
    fecha: '2026-07-10',
    original: '1000.00',
    pagado: '750.00',
  });

  const matNaN = await crearMatricula(`${MARCA}-NAN`, anioId);
  const planNaN = await crearPlan(matNaN, 1, '100.00', 'NIO');
  await q(
    `INSERT INTO mensualidades (plan_pago_id, numero_cuota, concepto, monto_original, monto_pagado,
                                 saldo_pendiente, fecha_vencimiento, estado, mora_aplicada)
     VALUES ($1, 1, 'C1', '100.00', '0.00', 'NaN', '2026-10-31', 'PENDIENTE', '0.00')`,
    [planNaN]
  );

  const matPagadaConSaldo = await crearMatricula(`${MARCA}-PAGCONSALDO`, anioId);
  await crearPlan(matPagadaConSaldo, 2, '500.00', 'NIO');
  const planPagada = await idPlanDe(matPagadaConSaldo);
  await crearCuota(planPagada, {
    n: 1,
    saldo: '50.00',
    estado: 'PAGADA',
    fecha: '2026-01-10',
    original: '500.00',
    pagado: '450.00',
  });
  await crearCuota(planPagada, {
    n: 2,
    saldo: '450.00',
    estado: 'PENDIENTE',
    fecha: '2026-02-10',
  });

  /* --- proyeccion de HISTORIAL -------------------------------------- */

  const matPagos = await crearMatricula(`${MARCA}-PAGOS`, anioId);
  const estudiantePagos = await uno<{ id: number }>(
    `SELECT id FROM estudiantes WHERE documento_identidad = $1`,
    [`${MARCA}-PAGOS`]
  );
  await crearPlan(matPagos, 3, '750.00', 'NIO');
  const planPagos = await idPlanDe(matPagos);
  await crearCuota(planPagos, {
    n: 1,
    saldo: '900.00',
    estado: 'PENDIENTE',
    fecha: '2026-03-31',
    original: '1000.00',
    pagado: '100.00',
  });
  await crearCuota(planPagos, {
    n: 2,
    saldo: '950.00',
    estado: 'PARCIAL',
    fecha: '2026-04-30',
    original: '1000.00',
    pagado: '50.00',
  });
  await crearCuota(planPagos, {
    n: 3,
    saldo: '0.00',
    estado: 'PAGADA',
    fecha: '2026-05-31',
    original: '250.00',
    pagado: '250.00',
  });
  const idsCuotasPagos = await idsDe(
    `SELECT id FROM mensualidades WHERE plan_pago_id = $1 ORDER BY numero_cuota ASC`,
    [planPagos]
  );

  const pagoAntiguoId = await crearPago(
    estudiantePagos.id,
    matPagos,
    {
      monto: '150.00',
      fecha: '2026-03-10 15:30:00+00',
      idempotencia: `${MARCA}-KEY-A`,
      observaciones: null,
      usuarioId: null,
    },
    [
      { tipo: 'EFECTIVO', monto: '100.00', referencia: null },
      { tipo: 'TRANSFERENCIA', monto: '50.00', referencia: 'REF-PROY6B-001' },
    ],
    [
      { mensualidadId: idsCuotasPagos[0], monto: '100.00' },
      { mensualidadId: idsCuotasPagos[1], monto: '50.00' },
    ]
  );
  const idsMediosAntiguo = await idsDe(
    `SELECT id FROM pago_medios WHERE pago_id = $1 ORDER BY id ASC`,
    [pagoAntiguoId]
  );
  const idsAplicacionesAntiguo = await idsDe(
    `SELECT id FROM pago_aplicaciones WHERE pago_id = $1 ORDER BY id ASC`,
    [pagoAntiguoId]
  );

  const pagoNuevoId = await crearPago(
    estudiantePagos.id,
    matPagos,
    {
      monto: '75.00',
      fecha: '2026-05-20 09:15:45+00',
      idempotencia: `${MARCA}-KEY-B`,
      observaciones: 'Segundo abono',
      usuarioId: actor,
    },
    [{ tipo: 'TARJETA', monto: '75.00', referencia: null }],
    [{ mensualidadId: idsCuotasPagos[2], monto: '75.00' }]
  );
  const idsMediosNuevo = await idsDe(
    `SELECT id FROM pago_medios WHERE pago_id = $1 ORDER BY id ASC`,
    [pagoNuevoId]
  );
  const idsAplicacionesNuevo = await idsDe(
    `SELECT id FROM pago_aplicaciones WHERE pago_id = $1 ORDER BY id ASC`,
    [pagoNuevoId]
  );

  const matOtraConPago = await crearMatricula(`${MARCA}-OTRAMAT`, anioId);
  const estudianteOtra = await uno<{ id: number }>(
    `SELECT id FROM estudiantes WHERE documento_identidad = $1`,
    [`${MARCA}-OTRAMAT`]
  );
  await crearPlan(matOtraConPago, 1, '300.00', 'USD');
  const planOtra = await idPlanDe(matOtraConPago);
  await crearCuota(planOtra, {
    n: 1,
    saldo: '300.00',
    estado: 'PENDIENTE',
    fecha: '2026-06-15',
  });
  const pagoOtraId = await crearPago(
    estudianteOtra.id,
    matOtraConPago,
    {
      monto: '300.00',
      fecha: '2026-06-16 12:00:00+00',
      idempotencia: `${MARCA}-KEY-C`,
      observaciones: 'Pago de otra matricula',
      usuarioId: actor,
    },
    [{ tipo: 'EFECTIVO', monto: '300.00', referencia: 'REF-PROY6B-OTRA' }],
    [
      {
        mensualidadId: (
          await idsDe(
            `SELECT id FROM mensualidades WHERE plan_pago_id = $1 ORDER BY numero_cuota ASC`,
            [planOtra]
          )
        )[0],
        monto: '300.00',
      },
    ]
  );

  // Pago del MISMO estudiante pero sin matricula asociada (matricula_id NULL).
  await crearPago(
    estudiantePagos.id,
    null,
    {
      monto: '999.99',
      fecha: '2026-04-01 08:00:00+00',
      idempotencia: `${MARCA}-KEY-NULLMAT`,
      observaciones: 'Pago sin matricula',
      usuarioId: null,
    },
    [{ tipo: 'EFECTIVO', monto: '999.99', referencia: null }],
    []
  );

  const matSinPagos = await crearMatricula(`${MARCA}-SINPAGOS`, anioId);

  return {
    matMixta,
    idsMatMixta,
    matSinPlan,
    matLegacy,
    tarifaUsd,
    matArchivada,
    matNegativa,
    matNaN,
    planNaN,
    matPagadaConSaldo,
    matPagos,
    idsCuotasPagos,
    pagoAntiguoId,
    idsMediosAntiguo,
    idsAplicacionesAntiguo,
    pagoNuevoId,
    idsMediosNuevo,
    idsAplicacionesNuevo,
    matOtraConPago,
    pagoOtraId,
    matSinPagos,
    actor,
    estudiantePagos: estudiantePagos.id,
  };
}

/**
 * Hash logico por tabla: recuento + md5 concatenado de cada fila (orden
 * determinista). Se calcula en tiempo de ejecucion: nunca se codifica un
 * recuento esperado.
 *
 * Conexion dedicada con DateStyle/TimeZone fijados: `t::text` de columnas
 * timestamptz/date depende de ambos parametros de sesion, asi que fijarlos
 * evita que el hash mida el entorno en lugar del contenido.
 *
 * Los valores de secuencia NO se leen aqui: viven en `pg_sequences`, no en las
 * filas, y se miden aparte (ver `leerSecuencias`).
 */
async function hashLogico(): Promise<Record<string, string>> {
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
    await cliente.query(`RESET ALL`).catch(() => undefined);
    cliente.release();
  }
}

/** Valores actuales de las secuencias medidas (excluidos del hash de filas). */
async function leerSecuencias(): Promise<Record<string, string>> {
  const filas = await q<{ sequencename: string; last_value: string | null }>(
    `SELECT sequencename, last_value FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = ANY($1::name[])
      ORDER BY sequencename ASC`,
    [[...SECUENCIAS_HASH]]
  );
  const salida: Record<string, string> = {};
  for (const fila of filas) {
    salida[fila.sequencename] = String(fila.last_value);
  }
  return salida;
}

/* ------------------------------------------------------------------ *
 * Pool real instrumentado (contador de consultas), pool delegado y    *
 * pool que rechaza. Delegan en PostgreSQL real: no son mocks del      *
 * codigo bajo prueba.                                                 *
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
    return this.cliente.query(texto, valores ?? []) as Promise<QueryResult<QueryResultRow>>;
  }
}

/**
 * Pool doblado que rechaza TODA consulta con un error tecnico identificable.
 * Sirve para medir que un fallo de base de datos se propaga tal cual, sin
 * convertirse en estado de negocio.
 */
class PoolRechazado {
  readonly llamadas: ConsultaRegistrada[] = [];

  async query(
    texto: string | { text: string; values?: unknown[] },
    valores?: unknown[]
  ): Promise<QueryResult<QueryResultRow>> {
    const sql = typeof texto === 'string' ? texto : texto.text;
    const params = typeof texto === 'string' ? valores ?? [] : texto.values ?? [];
    this.llamadas.push({ texto: sql, valores: params });
    throw new Error('FALLO_BD_FORZADO_PROY6B: conexion perdida');
  }
}

/**
 * Contrato minimo que consume el repositorio: una consulta con texto y
 * parametros. Mas angosto que `Pool` a proposito (segregacion de interfaces).
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

/** Error capturado tal cual, sin convertir nada. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
    return null;
  } catch (e) {
    return e;
  }
}

/** Conversion exacta a centavos con BigInt (verificacion independiente). */
function aCentavos(texto: string): bigint {
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(texto);
  if (!m) throw new Error(`importe no numerico de 2 decimales: ${texto}`);
  const signo = m[1] === '-' ? -1n : 1n;
  return signo * (BigInt(m[2]) * 100n + BigInt(m[3]));
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

/* ================================================================== *
 * PROYECCION DE PENDIENTES (6.B)                                      *
 * ================================================================== */

describe('ObligacionesService.proyectarPendientes — cuotas pendientes (BD real)', () => {
  it('PENDIENTES: solo saldo > 0 y estado no terminal, con estados presentes y no reconocidos', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(esc.matMixta);

    expect(proyeccion.estado).toBe('PENDIENTES');
    expect(proyeccion.matricula_id).toBe(esc.matMixta);
    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');

    // La lista exacta: las dos cuotas con saldo positivo y estado no terminal.
    expect(proyeccion.pendientes.map((c) => c.numero_cuota)).toEqual([1, 2]);
    expect(proyeccion.pendientes.map((c) => c.saldo_pendiente)).toEqual(['1000.00', '250.50']);
    expect(proyeccion.cuotas_pendientes).toBe(2);
    expect(proyeccion.pendientes).toHaveLength(proyeccion.cuotas_pendientes);

    // Forma completa de cada pendiente, tal cual esta almacenada.
    expect(proyeccion.pendientes[0]).toEqual({
      id: esc.idsMatMixta[0],
      numero_cuota: 1,
      concepto: 'C1',
      monto_original: '1000.00',
      monto_pagado: '0.00',
      saldo_pendiente: '1000.00',
      fecha_vencimiento: '2026-03-15',
      estado: 'PENDIENTE',
      mora_aplicada: '0.00',
    });
    expect(proyeccion.pendientes[1]).toEqual({
      id: esc.idsMatMixta[1],
      numero_cuota: 2,
      concepto: 'C2',
      monto_original: '1000.00',
      monto_pagado: '749.50',
      saldo_pendiente: '250.50',
      fecha_vencimiento: '2026-06-30',
      estado: 'PARCIAL',
      mora_aplicada: '0.00',
    });

    // Las cuotas con saldo 0.00 NO aparecen, ni siquiera como hueco.
    expect(proyeccion.pendientes.some((c) => c.numero_cuota === 3)).toBe(false);
    expect(proyeccion.pendientes.some((c) => c.numero_cuota === 4)).toBe(false);

    // Plan del mismo snapshot.
    expect(proyeccion.plan).not.toBeNull();
    expect(proyeccion.plan?.plan_pago_id).toBeGreaterThan(0);
    expect(proyeccion.plan?.matricula_id).toBe(esc.matMixta);
    expect(proyeccion.plan?.total_cuotas).toBe(4);
    expect(proyeccion.plan?.monto_cuota).toBe('100.00');
    expect(proyeccion.plan?.moneda).toBe('NIO');

    // Superficie de TODOS los estados del plan (terminales incluidos).
    expect(proyeccion.estados_presentes).toEqual([
      { estado: 'PAGADA', cuotas: 1 },
      { estado: 'PARCIAL', cuotas: 1 },
      { estado: 'PENDIENTE', cuotas: 2 },
    ]);
    // El vocabulario no reconocido se avisa, no se descarta ni se clasifica.
    expect(proyeccion.estados_no_reconocidos).toEqual(['PARCIAL']);
    // El total de estados presentes cubre las 4 cuotas del plan.
    expect(
      proyeccion.estados_presentes.reduce((acc, e) => acc + e.cuotas, 0)
    ).toBe(4);

    // Esta proyeccion no inventa resumen: no lleva campos de 6.A.
    expect(proyeccion).not.toHaveProperty('resumen');
    expect(proyeccion).not.toHaveProperty('saldo_total');
    expect(proyeccion).not.toHaveProperty('detalle');
  });

  it('MATRICULA_INEXISTENTE: sin lista, sin plan y sin conteos', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(MATRICULA_INEXISTENTE);

    expect(proyeccion.estado).toBe('MATRICULA_INEXISTENTE');
    expect(proyeccion.matricula_id).toBe(MATRICULA_INEXISTENTE);
    // No es "nada pendiente": no hay lista ni conteo que lo parezca.
    expect(proyeccion).not.toHaveProperty('pendientes');
    expect(proyeccion).not.toHaveProperty('plan');
    expect(proyeccion).not.toHaveProperty('cuotas_pendientes');
    expect(proyeccion).not.toHaveProperty('estados_presentes');
    expect(proyeccion).not.toHaveProperty('estados_no_reconocidos');
    expect(JSON.stringify(proyeccion)).toBe(
      `{"estado":"MATRICULA_INEXISTENTE","matricula_id":${MATRICULA_INEXISTENTE}}`
    );
  });

  it('SIN_PLAN: lista vacia, plan null y conteos en cero', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(esc.matSinPlan);

    expect(proyeccion.estado).toBe('PENDIENTES');
    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    expect(proyeccion.plan).toBeNull();
    expect(proyeccion.pendientes).toEqual([]);
    expect(proyeccion.cuotas_pendientes).toBe(0);
    expect(proyeccion.estados_presentes).toEqual([]);
    expect(proyeccion.estados_no_reconocidos).toEqual([]);
    // Forma exacta: "sin plan" es distinto de "plan sin pendientes".
    expect(JSON.stringify(proyeccion)).toBe(
      `{"estado":"PENDIENTES","matricula_id":${esc.matSinPlan},"plan":null,` +
        `"pendientes":[],"cuotas_pendientes":0,"estados_presentes":[],` +
        `"estados_no_reconocidos":[]}`
    );
  });

  it('moneda legacy null se preserva: nunca se reconstruye desde tarifas', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(
      new ObligacionesRepository(inyectarPool(contador))
    );
    const proyeccion = await servicio.proyectarPendientes(esc.matLegacy);

    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    expect(proyeccion.plan?.moneda).toBeNull();
    expect(proyeccion.plan?.tarifa_id).toBe(esc.tarifaUsd);
    expect(proyeccion.pendientes.map((c) => c.saldo_pendiente)).toEqual(['123.45', '0.01']);

    // La tarifa vigente es USD: no se toma como moneda del plan.
    const tarifa = await q<{ moneda: string }>(`SELECT moneda FROM tarifas WHERE id = $1`, [
      esc.tarifaUsd,
    ]);
    expect(tarifa[0].moneda).toBe('USD');
    expect(proyeccion.plan?.moneda).not.toBe(tarifa[0].moneda);

    // Medido sobre el pool: ninguna consulta lee tarifas.
    expect(contador.consultas.length).toBeGreaterThan(0);
    for (const consulta of contador.consultas) {
      expect(consulta.texto.toLowerCase()).not.toContain('tarifas');
    }
  });

  it('estado almacenado no reconocido con saldo positivo: ES pendiente y queda en estados_no_reconocidos', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(esc.matArchivada);

    expect(proyeccion.estado).toBe('PENDIENTES');
    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    // No se descarta la cuota con estado desconocido: sigue pendiente.
    expect(proyeccion.pendientes.map((c) => c.numero_cuota)).toEqual([1, 2]);
    expect(proyeccion.pendientes.map((c) => c.saldo_pendiente)).toEqual(['480.00', '60.00']);
    expect(proyeccion.pendientes[0].estado).toBe('ARCHIVADA_ZZZ');
    expect(proyeccion.cuotas_pendientes).toBe(2);
    // Y se superficializa con su conteo, no se clasifica en silencio.
    expect(proyeccion.estados_presentes).toEqual([
      { estado: 'ARCHIVADA_ZZZ', cuotas: 1 },
      { estado: 'PENDIENTE', cuotas: 1 },
    ]);
    expect(proyeccion.estados_no_reconocidos).toEqual(['ARCHIVADA_ZZZ']);
    expect(ESTADOS_CUOTA_RECONOCIDOS).not.toContain('ARCHIVADA_ZZZ');
  });

  it('saldo_pendiente negativo o cero no es pendiente aunque el estado no sea terminal', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(esc.matNegativa);

    expect(proyeccion.estado).toBe('PENDIENTES');
    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    // El plan TIENE 3 cuotas (no es SIN_PLAN ni plan vacio).
    expect(proyeccion.estados_presentes).toEqual([
      { estado: 'PARCIAL', cuotas: 2 },
      { estado: 'PENDIENTE', cuotas: 1 },
    ]);
    // Pero solo la de saldo positivo entra: negativo y cero quedan fuera.
    expect(proyeccion.pendientes.map((c) => c.numero_cuota)).toEqual([3]);
    expect(proyeccion.pendientes.map((c) => c.saldo_pendiente)).toEqual(['250.00']);
    expect(proyeccion.cuotas_pendientes).toBe(1);
    expect(proyeccion.pendientes.some((c) => c.saldo_pendiente === '-500.00')).toBe(false);
    expect(proyeccion.pendientes.some((c) => c.saldo_pendiente === '0.00')).toBe(false);
    // El negativo sigue almacenado y visible por estados presentes.
    expect(proyeccion.estados_presentes.reduce((acc, e) => acc + e.cuotas, 0)).toBe(3);
  });

  it('politica terminal explicita: PAGADA con saldo conservado NO es pendiente', async () => {
    // La lista terminal es ESTRECHA y explicita: solo PAGADA.
    expect([...ESTADOS_TERMINALES_CUOTA]).toEqual(['PAGADA']);
    expect([...ESTADOS_NO_TERMINALES_RECONOCIDOS]).toEqual(['PENDIENTE']);
    expect([...ESTADOS_CUOTA_RECONOCIDOS]).toEqual(['PAGADA', 'PENDIENTE']);

    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarPendientes(esc.matPagadaConSaldo);

    expect(proyeccion.estado).toBe('PENDIENTES');
    if (proyeccion.estado !== 'PENDIENTES') throw new Error('estado inesperado');
    // PAGADA con saldo 50.00 (> 0) sigue fuera: decide el ESTADO, no el saldo.
    expect(proyeccion.pendientes.map((c) => c.numero_cuota)).toEqual([2]);
    expect(proyeccion.pendientes.map((c) => c.saldo_pendiente)).toEqual(['450.00']);
    expect(proyeccion.cuotas_pendientes).toBe(1);
    expect(proyeccion.estados_presentes).toEqual([
      { estado: 'PAGADA', cuotas: 1 },
      { estado: 'PENDIENTE', cuotas: 1 },
    ]);
    // PAGADA es terminal:NUNCA se avisa como no reconocido.
    expect(proyeccion.estados_no_reconocidos).toEqual([]);
  });

  it('identificador invalido: AppError 400 con CERO consultas (pool real instrumentado)', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    const invalidos: Array<{ valor: unknown; nota: string }> = [
      { valor: 0, nota: 'cero' },
      { valor: -1, nota: 'negativo' },
      { valor: 1.5, nota: 'decimal' },
      { valor: 2147483648, nota: 'fuera de serial32 (2^31)' },
      { valor: 2 ** 53, nota: 'no entero seguro' },
      { valor: 9007199254740993, nota: 'no representable exactamente' },
      { valor: Number.NaN, nota: 'NaN' },
      { valor: Number.POSITIVE_INFINITY, nota: 'infinito positivo' },
      { valor: Number.NEGATIVE_INFINITY, nota: 'infinito negativo' },
      { valor: '7', nota: 'string numerica' },
      { valor: 'abc', nota: 'string no numerica' },
      { valor: null, nota: 'null' },
      { valor: undefined, nota: 'undefined' },
      { valor: {}, nota: 'objeto' },
      { valor: [], nota: 'array' },
    ];
    for (const caso of invalidos) {
      const error = await capturarError(servicio.proyectarPendientes(caso.valor as number));
      expect(error, caso.nota).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode, caso.nota).toBe(400);
      expect(appError.code, caso.nota).toBe('BAD_REQUEST');
      // CERO consultas reales: la medicion es del pool, no del error.
      expect(contador.consultas, caso.nota).toHaveLength(0);
    }
    // Ademas: el total sigue en cero tras los 15 casos.
    expect(contador.consultas).toHaveLength(0);
  });

  it('INTEGRIDAD_INVALIDA: NaN almacenado en NUMERIC, valor intacto y sin resumen confiable', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));

    // Control: el valor almacenado es exactamente 'NaN' (no se normalizo).
    const almacenado = await q<{ saldo: string }>(
      `SELECT saldo_pendiente::text AS saldo FROM mensualidades WHERE plan_pago_id = $1`,
      [esc.planNaN]
    );
    expect(almacenado[0].saldo).toBe('NaN');

    const proyeccion = await servicio.proyectarPendientes(esc.matNaN);

    expect(proyeccion.estado).toBe('INTEGRIDAD_INVALIDA');
    if (proyeccion.estado !== 'INTEGRIDAD_INVALIDA') throw new Error('estado inesperado');
    expect(proyeccion.motivo).toBe('IMPORTE_NO_NUMERICO');
    // El plan se conserva y la cuota problematica NO se descarta.
    expect(proyeccion.plan?.matricula_id).toBe(esc.matNaN);
    expect(proyeccion.pendientes).toHaveLength(1);
    expect(proyeccion.pendientes[0].saldo_pendiente).toBe('NaN');
    expect(proyeccion.pendientes[0].numero_cuota).toBe(1);
    // Y no se ofrece ningun resumen ni conteo que parezca confiable.
    expect(proyeccion).not.toHaveProperty('cuotas_pendientes');
    expect(proyeccion).not.toHaveProperty('estados_presentes');
    expect(proyeccion).not.toHaveProperty('estados_no_reconocidos');
    expect(proyeccion).not.toHaveProperty('resumen');
    expect(JSON.stringify(proyeccion)).not.toContain('"saldo_total"');
  });
});

/* ================================================================== *
 * PROYECCION DE HISTORIAL FINANCIERO (6.B)                            *
 * ================================================================== */

const FORMATO_FECHA_HORA_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe('ObligacionesService.proyectarHistorial — historial financiero (BD real)', () => {
  it('HISTORIAL: el pago mas reciente primero, con medios y aplicaciones anidados e importes exactos', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarHistorial(esc.matPagos);

    expect(proyeccion.estado).toBe('HISTORIAL');
    expect(proyeccion.matricula_id).toBe(esc.matPagos);
    if (proyeccion.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    expect(proyeccion.matricula_estado).toBe('ACTIVA');

    //Orden: fecha_pago DESC, id DESC → el mas reciente primero.
    expect(proyeccion.pagos.map((p) => p.id)).toEqual([esc.pagoNuevoId, esc.pagoAntiguoId]);

    // --- pago mas reciente: un solo medio, una aplicacion ---
    const nuevo = proyeccion.pagos[0];
    expect(nuevo.monto_total).toBe('75.00');
    expect(typeof nuevo.monto_total).toBe('string');
    expect(nuevo.fecha_pago).toBe('2026-05-20 09:15:45');
    expect(nuevo.fecha_pago).toMatch(FORMATO_FECHA_HORA_UTC);
    expect(nuevo.estado).toBe('COMPLETADO');
    expect(nuevo.estudiante_id).toBe(esc.estudiantePagos);
    expect(nuevo.matricula_id).toBe(esc.matPagos);
    expect(nuevo.idempotencia_key).toBe('PROY6B-KEY-B');
    expect(nuevo.usuario_id).toBe(esc.actor);
    expect(nuevo.observaciones).toBe('Segundo abono');
    expect(nuevo.medios).toEqual([
      { id: esc.idsMediosNuevo[0], tipo: 'TARJETA', monto: '75.00', referencia: null },
    ]);
    expect(nuevo.aplicaciones).toEqual([
      {
        id: esc.idsAplicacionesNuevo[0],
        pago_id: esc.pagoNuevoId,
        mensualidad_id: esc.idsCuotasPagos[2],
        numero_cuota: 3,
        monto_aplicado: '75.00',
      },
    ]);

    // --- pago mas antiguo: dos medios (uno con referencia NULL) y dos aplicaciones ---
    const antiguo = proyeccion.pagos[1];
    expect(antiguo.monto_total).toBe('150.00');
    expect(antiguo.fecha_pago).toBe('2026-03-10 15:30:00');
    expect(antiguo.fecha_pago).toMatch(FORMATO_FECHA_HORA_UTC);
    expect(antiguo.estado).toBe('COMPLETADO');
    expect(antiguo.estudiante_id).toBe(esc.estudiantePagos);
    expect(antiguo.matricula_id).toBe(esc.matPagos);
    expect(antiguo.idempotencia_key).toBe('PROY6B-KEY-A');
    expect(antiguo.usuario_id).toBeNull();
    expect(antiguo.observaciones).toBeNull();
    // Dos medios, con `referencia` NULL preservada (no inventada ni borrada).
    expect(antiguo.medios).toEqual([
      { id: esc.idsMediosAntiguo[0], tipo: 'EFECTIVO', monto: '100.00', referencia: null },
      {
        id: esc.idsMediosAntiguo[1],
        tipo: 'TRANSFERENCIA',
        monto: '50.00',
        referencia: 'REF-PROY6B-001',
      },
    ]);
    // Aplicaciones anidadas con el `numero_cuota` de la mensualidad referenciada.
    expect(antiguo.aplicaciones).toEqual([
      {
        id: esc.idsAplicacionesAntiguo[0],
        pago_id: esc.pagoAntiguoId,
        mensualidad_id: esc.idsCuotasPagos[0],
        numero_cuota: 1,
        monto_aplicado: '100.00',
      },
      {
        id: esc.idsAplicacionesAntiguo[1],
        pago_id: esc.pagoAntiguoId,
        mensualidad_id: esc.idsCuotasPagos[1],
        numero_cuota: 2,
        monto_aplicado: '50.00',
      },
    ]);

    // Verificacion independiente: los importes cuadran exactamente (BigInt).
    for (const pago of proyeccion.pagos) {
      const sumaMedios = pago.medios.reduce((acc, m) => acc + aCentavos(m.monto), 0n);
      const sumaAplicaciones = pago.aplicaciones.reduce(
        (acc, a) => acc + aCentavos(a.monto_aplicado),
        0n
      );
      expect(sumaMedios).toBe(aCentavos(pago.monto_total));
      expect(sumaAplicaciones).toBe(sumaMedios);
    }

    // Control independiente de la fecha UTC contra la base de datos.
    for (const pago of proyeccion.pagos) {
      const fila = await uno<{ fp: string }>(
        `SELECT to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS fp
           FROM pagos WHERE id = $1`,
        [pago.id]
      );
      expect(fila.fp).toBe(pago.fecha_pago);
    }
  });

  it('desempate por id DESC cuando fecha_pago es identica', async () => {
    // Tercer pago con la MISCHA fecha que el mas antiguo: entra despues (id mayor).
    const pagoEmpatado = await crearPago(
      esc.estudiantePagos,
      esc.matPagos,
      {
        monto: '25.00',
        fecha: '2026-03-10 15:30:00+00',
        idempotencia: `${MARCA}-KEY-D`,
        observaciones: 'Mismo instante, id mayor',
        usuarioId: esc.actor,
      },
      [{ tipo: 'EFECTIVO', monto: '25.00', referencia: null }],
      [{ mensualidadId: esc.idsCuotasPagos[0], monto: '25.00' }]
    );

    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarHistorial(esc.matPagos);

    expect(proyeccion.estado).toBe('HISTORIAL');
    if (proyeccion.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    expect(proyeccion.pagos.map((p) => p.id)).toEqual([
      esc.pagoNuevoId,
      pagoEmpatado,
      esc.pagoAntiguoId,
    ]);
    // Los dos empatados comparten instante exacto y el de id mayor va primero.
    expect(proyeccion.pagos[1].fecha_pago).toBe(proyeccion.pagos[2].fecha_pago);
    expect(proyeccion.pagos[1].fecha_pago).toBe('2026-03-10 15:30:00');
    expect(pagoEmpatado).toBeGreaterThan(esc.pagoAntiguoId);
    expect(proyeccion.pagos[1].id).toBeGreaterThan(proyeccion.pagos[2].id);
  });

  it('fecha_pago en UTC explicito: identica bajo otro TimeZone y otro DateStyle de sesion', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const base = await servicio.proyectarHistorial(esc.matPagos);
    if (base.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    const fechasBase = base.pagos.map((p) => p.fecha_pago);
    expect(fechasBase).toEqual(['2026-05-20 09:15:45', '2026-03-10 15:30:00']);

    const cliente = await pool.connect();
    try {
      await cliente.query(`SET TimeZone = 'Pacific/Kiritimati'`);
      await cliente.query(`SET DateStyle = 'Postgres, DMY'`);
      const config = await cliente.query<{ datestyle: string; zone: string }>(
        `SELECT current_setting('DateStyle') AS datestyle, current_setting('TimeZone') AS zone`
      );
      expect(config.rows[0].datestyle).toContain('DMY');
      expect(config.rows[0].zone).toBe('Pacific/Kiritimati');
      const alterado = await new ObligacionesService(
        new ObligacionesRepository(inyectarPool(new PoolDelegado(cliente)))
      ).proyectarHistorial(esc.matPagos);
      if (alterado.estado !== 'HISTORIAL') throw new Error('estado inesperado');
      expect(alterado.pagos.map((p) => p.fecha_pago)).toEqual(fechasBase);
      expect(alterado).toEqual(base);
    } finally {
      await cliente.query(`RESET ALL`).catch(() => undefined);
      cliente.release();
    }
  });

  it('aislamiento: un pago con matricula_id NULL y un pago de otra matricula NO aparecen', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));

    // Control de existencia: los tres pagos SI estan almacenados.
    expect(await q<{ id: number }>(`SELECT id FROM pagos ORDER BY id ASC`)).toHaveLength(4);

    const historial = await servicio.proyectarHistorial(esc.matPagos);
    if (historial.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    // Solo los dos pagos de ESTA matricula.
    expect(historial.pagos.map((p) => p.id)).toEqual([esc.pagoNuevoId, esc.pagoAntiguoId]);
    expect(historial.pagos.every((p) => p.matricula_id === esc.matPagos)).toBe(true);
    // El pago sin matricula (mismo estudiante) no se cuela.
    expect(historial.pagos.some((p) => p.matricula_id === null)).toBe(false);
    expect(historial.pagos.some((p) => p.monto_total === '999.99')).toBe(false);
    // El pago de la otra matricula tampoco.
    expect(historial.pagos.some((p) => p.id === esc.pagoOtraId)).toBe(false);
    expect(historial.pagos.some((p) => p.monto_total === '300.00')).toBe(false);

    // Y en el otro sentido: la otra matricula ve SOLO su pago.
    const otra = await servicio.proyectarHistorial(esc.matOtraConPago);
    if (otra.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    expect(otra.pagos.map((p) => p.id)).toEqual([esc.pagoOtraId]);
    expect(otra.pagos[0].matricula_id).toBe(esc.matOtraConPago);
    expect(otra.pagos[0].monto_total).toBe('300.00');
    expect(otra.pagos[0].fecha_pago).toBe('2026-06-16 12:00:00');
    expect(otra.pagos.some((p) => p.id === esc.pagoAntiguoId)).toBe(false);
    expect(otra.pagos.some((p) => p.id === esc.pagoNuevoId)).toBe(false);
  });

  it('matricula sin pagos: pagos [] explicitamente vacio, sin error ni resumen inventado', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarHistorial(esc.matSinPagos);

    expect(proyeccion.estado).toBe('HISTORIAL');
    expect(proyeccion.matricula_id).toBe(esc.matSinPagos);
    if (proyeccion.estado !== 'HISTORIAL') throw new Error('estado inesperado');
    expect(proyeccion.matricula_estado).toBe('ACTIVA');
    expect(proyeccion.pagos).toEqual([]);
    expect(Array.isArray(proyeccion.pagos)).toBe(true);
    expect(proyeccion.pagos).toHaveLength(0);
    // Forma exacta: no hay resumen ni conteo inventado.
    expect(JSON.stringify(proyeccion)).toBe(
      `{"estado":"HISTORIAL","matricula_id":${esc.matSinPagos},` +
        `"matricula_estado":"ACTIVA","pagos":[]}`
    );
    expect(proyeccion).not.toHaveProperty('resumen');
    expect(proyeccion).not.toHaveProperty('monto_total');
    expect(proyeccion).not.toHaveProperty('motivo');
  });

  it('MATRICULA_INEXISTENTE: no equivale a "sin pagos" y no lleva lista', async () => {
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const proyeccion = await servicio.proyectarHistorial(MATRICULA_INEXISTENTE);

    expect(proyeccion.estado).toBe('MATRICULA_INEXISTENTE');
    expect(proyeccion.matricula_id).toBe(MATRICULA_INEXISTENTE);
    expect(proyeccion).not.toHaveProperty('pagos');
    expect(proyeccion).not.toHaveProperty('matricula_estado');
    expect(JSON.stringify(proyeccion)).toBe(
      `{"estado":"MATRICULA_INEXISTENTE","matricula_id":${MATRICULA_INEXISTENTE}}`
    );
  });

  it('identificador invalido: AppError 400 con CERO consultas (pool real instrumentado)', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    const invalidos: Array<{ valor: unknown; nota: string }> = [
      { valor: 0, nota: 'cero' },
      { valor: 2147483648, nota: 'fuera de serial32 (2^31)' },
      { valor: '12', nota: 'string numerica' },
      { valor: 'no-es-id', nota: 'string no numerica' },
      { valor: Number.NaN, nota: 'NaN' },
      { valor: Number.POSITIVE_INFINITY, nota: 'infinito' },
      { valor: null, nota: 'null' },
      { valor: undefined, nota: 'undefined' },
      { valor: {}, nota: 'objeto' },
    ];
    for (const caso of invalidos) {
      const error = await capturarError(servicio.proyectarHistorial(caso.valor as number));
      expect(error, caso.nota).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode, caso.nota).toBe(400);
      expect(appError.code, caso.nota).toBe('BAD_REQUEST');
      // CERO consultas reales: la medicion es del pool, no del error.
      expect(contador.consultas, caso.nota).toHaveLength(0);
    }
    expect(contador.consultas).toHaveLength(0);
  });
});

/* ================================================================== *
 * PROPAGACION DE ERRORES TECNICOS (6.B)                               *
 * ================================================================== */

describe('Proyecciones 6.B — propagacion de errores tecnicos de base de datos', () => {
  it('un pool que rechaza propaga el error crudo en pendientes: no es estado de negocio', async () => {
    const rechazado = new PoolRechazado();
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(rechazado)));

    const error = await capturarError(servicio.proyectarPendientes(esc.matMixta));

    expect(error).not.toBeNull();
    expect(error).toBeInstanceOf(Error);
    // NO se convierte en AppError ni en estado de negocio.
    expect(error).not.toBeInstanceOf(AppError);
    expect((error as Error).message).toBe('FALLO_BD_FORZADO_PROY6B: conexion perdida');
    // La consulta si se intento (no se corto antes ni se swalloweo).
    expect(rechazado.llamadas).toHaveLength(1);
    expect(rechazado.llamadas[0].valores).toEqual([esc.matMixta, ['PAGADA']]);

    const texto = `${String((error as Error).message)} ${String((error as { code?: unknown }).code)}`;
    for (const prohibido of [
      'MATRICULA_INEXISTENTE',
      'INTEGRIDAD_INVALIDA',
      'PENDIENTES',
      'SIN_PLAN',
    ]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });

  it('un pool que rechaza propaga el error crudo en historial: no es lista vacia', async () => {
    const rechazado = new PoolRechazado();
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(rechazado)));

    const error = await capturarError(servicio.proyectarHistorial(esc.matPagos));

    expect(error).not.toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
    expect((error as Error).message).toBe('FALLO_BD_FORZADO_PROY6B: conexion perdida');
    expect(rechazado.llamadas).toHaveLength(1);
    expect(rechazado.llamadas[0].valores).toEqual([esc.matPagos]);

    const texto = `${String((error as Error).message)} ${String((error as { code?: unknown }).code)}`;
    for (const prohibido of ['MATRICULA_INEXISTENTE', 'INTEGRIDAD_INVALIDA', 'HISTORIAL']) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });

  it('el error de BD real (transaccion abortada) se propaga tal cual en ambas proyecciones', async () => {
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
      for (const llamada of [
        () => servicio.proyectarPendientes(esc.matMixta),
        () => servicio.proyectarHistorial(esc.matPagos),
      ]) {
        const error = await capturarError(llamada());
        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AppError);
        const crudo = error as {
          code?: string;
          severity?: string;
          message?: string;
          estado?: unknown;
          pagos?: unknown;
          pendientes?: unknown;
        };
        // Es el error tecnico de PostgreSQL, tal cual.
        expect(crudo.code).toBe('25P02');
        expect(crudo.severity).toBe('ERROR');
        expect(String(crudo.message)).toMatch(/current transaction is aborted/i);
        // Sin ninguna forma de estado de negocio ni lista vacia.
        expect(crudo.estado).toBeUndefined();
        expect(crudo.pagos).toBeUndefined();
        expect(crudo.pendientes).toBeUndefined();
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

/* ================================================================== *
 * FORMA DE LAS CONSULTAS: una sola y parametrizada (6.B)              *
 * ================================================================== */

describe('Proyecciones 6.B — una sola consulta parametrizada por lectura valida', () => {
  it('pendientes e historial: 1 consulta por lectura, con los parametros correctos', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));

    const ids = [
      esc.matMixta,
      esc.matSinPlan,
      esc.matLegacy,
      esc.matArchivada,
      esc.matNegativa,
      esc.matNaN,
      esc.matPagadaConSaldo,
    ];
    for (const id of ids) {
      contador.consultas.length = 0;
      await servicio.proyectarPendientes(id);
      expect(contador.consultas, `pendientes id ${id}`).toHaveLength(1);
      expect(contador.consultas[0].valores).toEqual([id, ['PAGADA']]);
      expect(contador.consultas[0].texto).toContain('$1');
      expect(contador.consultas[0].texto).not.toContain(String(id));

      contador.consultas.length = 0;
      await servicio.proyectarHistorial(id);
      expect(contador.consultas, `historial id ${id}`).toHaveLength(1);
      expect(contador.consultas[0].valores).toEqual([id]);
      expect(contador.consultas[0].texto).toContain('$1');
      expect(contador.consultas[0].texto).not.toContain(String(id));
    }
    expect(contador.consultas).toHaveLength(1);
  });

  it('la lista de estados terminales viaja como parametro ($2), nunca interpolada en el SQL', async () => {
    const contador = new PoolContador(pool);
    const servicio = new ObligacionesService(new ObligacionesRepository(inyectarPool(contador)));
    await servicio.proyectarPendientes(esc.matMixta);

    expect(contador.consultas).toHaveLength(1);
    const sql = contador.consultas[0].texto;
    expect(sql).toContain('$2::text[]');
    expect(sql).toContain('estado <> ALL ($2::text[])');
    // La politica NO esta escrita en el texto de la consulta.
    expect(sql).not.toContain('PAGADA');
    expect(contador.consultas[0].valores[1]).toEqual(['PAGADA']);
  });
});

/* ================================================================== *
 * SOLO LECTURA: hash logico real antes y despues (6.B)                *
 * ================================================================== */

describe('Proyecciones 6.B — ausencia de escrituras (hash logico real)', () => {
  it('hash logico identico antes y despues de un lote de pendientes e historial', async () => {
    // Los fixtures se crean en beforeEach y se limpian en afterEach, es decir
    // FUERA de la ventana medida: los dos hashes solo ven el efecto de las
    // lecturas. Los valores de secuencia quedan EXCLUIDOS del hash de filas
    // (viven en `pg_sequences`, no en las tablas medidas) y se miden aparte.
    const servicio = new ObligacionesService(new ObligacionesRepository(pool));
    const antes = await hashLogico();
    const secuenciasAntes = await leerSecuencias();

    // Lote de lecturas: todos los escenarios, validos y no existentes.
    const ids = [
      esc.matMixta,
      esc.matSinPlan,
      esc.matLegacy,
      esc.matArchivada,
      esc.matNegativa,
      esc.matNaN,
      esc.matPagadaConSaldo,
      esc.matPagos,
      esc.matOtraConPago,
      esc.matSinPagos,
      MATRICULA_INEXISTENTE,
    ];
    for (const id of ids) {
      await servicio.proyectarPendientes(id);
      await servicio.proyectarHistorial(id);
    }
    // Simultaneas y con ids invalidos (que ni siquiera llegan a la base).
    await Promise.all(
      ids.map((id) => Promise.all([servicio.proyectarPendientes(id), servicio.proyectarHistorial(id)]))
    );
    await servicio.proyectarPendientes(0).catch(() => undefined);
    await servicio.proyectarHistorial(-3).catch(() => undefined);

    const despues = await hashLogico();
    const secuenciasDespues = await leerSecuencias();

    // Hash identico: ninguna escritura, ninguna fila tocada.
    expect(despues).toEqual(antes);
    for (const tabla of TABLAS_HASH) {
      expect(despues[tabla].split('|')[0], tabla).toBe(antes[tabla].split('|')[0]);
    }
    // Control de no vacuidad: las tablas medidas SI tienen filas, y exactamente
    // las que esta suite creo (ni una mas: si otro proceso escribiera, el hash
    // ya no podria afirmar "no hay escrituras" sin mas).
    const recuentos: Record<string, number> = {
      pagos: 4,
      pago_medios: 5,
      pago_aplicaciones: 4,
    };
    for (const tabla of TABLAS_HASH) {
      expect(Number(antes[tabla].split('|')[0]), tabla).toBeGreaterThan(0);
      if (tabla in recuentos) {
        expect(Number(antes[tabla].split('|')[0]), tabla).toBe(recuentos[tabla]);
      }
    }

    // Medido aparte (excluido a proposito del hash de filas): leer no avanza
    // ninguna secuencia.
    expect(secuenciasDespues).toEqual(secuenciasAntes);
  });
});
