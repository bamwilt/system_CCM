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
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { createTestPool, closeTestPool, getTestDatabaseUrl } from './testDb';
import { closePool } from '../../src/config/database';

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
const MIG_001_006 = MIG_FILES.slice(0, 6);
const MIG_007 = path.resolve(MIG_DIR, '007_fase5_integridad.sql');

let dbPool: Pool;

async function resetCoreTables(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
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

async function applyFiles(client: PoolClient, files: string[]): Promise<void> {
  for (const file of files) {
    await client.query<QueryResultRow>(readFileSync(file, 'utf8'));
  }
}

async function clientQuery<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  const client = await dbPool.connect();
  try {
    return await client.query<T>(sql, params);
  } finally {
    client.release();
  }
}

// Datos mínimos propios para probar 007 sin depender de ids seriales ni de filas de otras suites.
async function ensureBaseData(): Promise<{ anioId: number; estId: number; gradoId: number }> {
  await clientQuery("INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES (2026, '2026-02-01', '2026-11-30', TRUE) ON CONFLICT (anio) DO NOTHING");
  const anio = await clientQuery<{ id: number }>("SELECT id FROM anio_lectivo WHERE anio = 2026 LIMIT 1");
  await clientQuery("INSERT INTO estudiantes (nombres, apellidos, documento_identidad) VALUES ('Legacy', 'Estudiante', 'MIG01') ON CONFLICT DO NOTHING");
  const est = await clientQuery<{ id: number }>("SELECT id FROM estudiantes WHERE documento_identidad = 'MIG01' LIMIT 1");
  await clientQuery("INSERT INTO grados (nombre, nivel, anio_lectivo_id) VALUES ('Grado Mig', 'Primaria', $1) ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING", [anio.rows[0].id]);
  const grado = await clientQuery<{ id: number }>("SELECT id FROM grados WHERE nombre = 'Grado Mig' LIMIT 1");
  return { anioId: anio.rows[0].id, estId: est.rows[0].id, gradoId: grado.rows[0].id };
}

beforeAll(async () => {
  if (!getTestDatabaseUrl()) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  dbPool = await createTestPool();
});

afterAll(async () => {
  await resetCoreTables().catch(() => undefined);
  await closeTestPool(dbPool);
  await closePool().catch(() => undefined);
});

beforeEach(async () => {
  await resetCoreTables();
});

describe('Matrículas migraciones 001-008', () => {
  it('aplica 001 y 002 y crea tablas base y auth', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, [MIG_FILES[0], MIG_FILES[1]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const tablas = await clientQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    const nombres = tablas.rows.map((r) => r.table_name);
    for (const t of ['roles', 'usuarios', 'estudiantes', 'tutores', 'matriculas', 'planes_pago', 'mensualidades', 'auth_sessions', 'auth_role_permissions', 'auditoria']) {
      expect(nombres).toContain(t);
    }
  });

  it('003 amplía permisos y CHECK de auth_role_permissions antes de insertar en ella', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, [MIG_FILES[0], MIG_FILES[1], MIG_FILES[2]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const codigos = await clientQuery<{ codigo: string }>("SELECT codigo FROM permisos WHERE codigo LIKE 'estudiantes:%' OR codigo LIKE 'tutores:%' ORDER BY codigo");
    expect(codigos.rows.map((r) => r.codigo).sort()).toContain('estudiantes:manage');
    expect(codigos.rows.map((r) => r.codigo).sort()).toContain('estudiantes:read');
    expect(codigos.rows.map((r) => r.codigo).sort()).toContain('tutores:manage');

    const check = await clientQuery("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'auth_role_permissions_codigo_check'");
    expect(check.rows.length).toBe(1);
    const def = check.rows[0].pg_get_constraintdef;
    for (const c of ['estudiantes:manage', 'estudiantes:read', 'tutores:manage', 'matriculas:manage', 'matriculas:read']) {
      expect(def).toContain(c);
    }
  });

  it('004 y 006 no reducen el catálogo de permisos (re-aplicación idempotente)', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, [MIG_FILES[0], MIG_FILES[1], MIG_FILES[2], MIG_FILES[3], MIG_FILES[4], MIG_FILES[5]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const client2 = await dbPool.connect();
    try {
      await client2.query('BEGIN');
      await applyFiles(client2, [MIG_FILES[3], MIG_FILES[5]]);
      await client2.query('COMMIT');
    } finally {
      client2.release();
    }

    const check = await clientQuery("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'auth_role_permissions_codigo_check'");
    expect(check.rows.length).toBe(1);
    const def = check.rows[0].pg_get_constraintdef;
    for (const c of ['auth:users:manage', 'auth:roles:manage', 'estudiantes:manage', 'estudiantes:read', 'tutores:manage', 'matriculas:manage', 'matriculas:read']) {
      expect(def).toContain(c);
    }
  });

  it('007 agrega tarifa_id/moneda nulos a planes_pago, índice único y preserva legacy null', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, MIG_FILES);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const cols = await clientQuery(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'planes_pago' AND column_name IN ('tarifa_id', 'moneda') ORDER BY column_name`
    );
    expect(cols.rows.length).toBe(2);
    for (const col of cols.rows) {
      expect(col.is_nullable).toBe('YES');
    }

    const indexes = await clientQuery("SELECT indexname FROM pg_indexes WHERE tablename = 'planes_pago' AND indexname = 'uq_planes_pago_matricula_id'");
    expect(indexes.rows.length).toBe(1);

    const { anioId, estId, gradoId } = await ensureBaseData();
    const mat = await clientQuery<{ id: number }>('INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado) VALUES ($1, $2, $3, $4) RETURNING id', [
      estId, anioId, gradoId, 'ACTIVA',
    ]);
    await clientQuery('INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota) VALUES ($1, 1, $2)', [mat.rows[0].id, '100.00']);

    const plan = await clientQuery('SELECT tarifa_id, moneda FROM planes_pago WHERE matricula_id = $1', [mat.rows[0].id]);
    expect(plan.rows[0].tarifa_id).toBeNull();
    expect(plan.rows[0].moneda).toBeNull();
  });

  it('008 deja catalogo sin defaults financieros, idempotency_key nullable e indice unico por actor', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, MIG_FILES);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const columns = await clientQuery<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('planes_pago', 'total_cuotas'),
          ('tarifas', 'moneda'),
          ('matriculas', 'idempotency_key')
        )
      ORDER BY table_name, column_name
    `);
    expect(columns.rows).toHaveLength(3);

    const totalCuotas = columns.rows.find(
      (column) => column.table_name === 'planes_pago' && column.column_name === 'total_cuotas'
    );
    expect(totalCuotas).toBeDefined();
    expect(totalCuotas?.column_default).toBeNull();
    expect(totalCuotas?.is_nullable).toBe('NO');

    const moneda = columns.rows.find(
      (column) => column.table_name === 'tarifas' && column.column_name === 'moneda'
    );
    expect(moneda).toBeDefined();
    expect(moneda?.column_default).toBeNull();
    expect(moneda?.is_nullable).toBe('NO');

    const idempotencyKey = columns.rows.find(
      (column) => column.table_name === 'matriculas' && column.column_name === 'idempotency_key'
    );
    expect(idempotencyKey).toBeDefined();
    expect(idempotencyKey?.is_nullable).toBe('YES');
    expect(idempotencyKey?.column_default).toBeNull();

    const indexes = await clientQuery<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'matriculas'
        AND indexname = 'uq_matriculas_idempotencia_actor'
    `);
    expect(indexes.rows).toHaveLength(1);
    expect(indexes.rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX/i);
    expect(indexes.rows[0].indexdef).toMatch(/WHERE/i);
    expect(indexes.rows[0].indexdef).toMatch(/idempotency_key IS NOT NULL/i);
    expect(indexes.rows[0].indexdef).toMatch(/creado_por_usuario_id IS NOT NULL/i);

    const creador = await clientQuery<{ is_nullable: string }>(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'matriculas'
        AND column_name = 'creado_por_usuario_id'
    `);
    expect(creador.rows).toHaveLength(1);
    expect(creador.rows[0].is_nullable).toBe('YES');
  });

  it('008 acota la unicidad de idempotency_key al actor creador (23505 solo repite el autor)', async () => {
    const { anioId, gradoId } = await ensureBaseData();
    for (const suffix of ['E', 'F', 'G', 'H']) {
      await clientQuery(
        `INSERT INTO estudiantes (nombres, apellidos, documento_identidad)
         VALUES ('Idem', 'Actor', $1)`,
        [`MIG-ACT-${suffix}`]
      );
    }
    const students = await clientQuery<{ id: number }>(
      `SELECT id FROM estudiantes WHERE documento_identidad LIKE 'MIG-ACT-%' ORDER BY documento_identidad`
    );
    expect(students.rows).toHaveLength(4);

    const claves = await clientQuery<{ id: number }>(
      `INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id)
       VALUES ($1, 'fixture-hash', 'Actor', 'Idem', (SELECT id FROM roles ORDER BY id LIMIT 1))
       RETURNING id`,
      [`actor-idem-${Date.now()}@example.com`]
    );
    const usuario = claves.rows[0]?.id;
    expect(typeof usuario).toBe('number');

    // Mismo autor repite su clave => choque real (23505).
    const duplicada = `ACT-DUP-${Date.now()}`;
    await clientQuery(
      'INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, idempotency_key, creado_por_usuario_id) VALUES ($1, $2, $3, $4, $5)',
      [students.rows[0].id, anioId, gradoId, duplicada, usuario]
    );
    let duplicateError: unknown = null;
    try {
      await clientQuery(
        'INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, idempotency_key, creado_por_usuario_id) VALUES ($1, $2, $3, $4, $5)',
        [students.rows[1].id, anioId, gradoId, duplicada, usuario]
      );
    } catch (error) {
      duplicateError = error;
    }
    expect(duplicateError).not.toBeNull();
    expect((duplicateError as { code?: string }).code).toBe('23505');

    // Actores DISTINTOS (o sin actor) con la misma clave NO colisionan:
    // la clave es un identificador por autor, no global.
    await clientQuery(
      'INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, idempotency_key, creado_por_usuario_id) VALUES ($1, $2, $3, $4, NULL)',
      [students.rows[2].id, anioId, gradoId, duplicada]
    );
    await clientQuery(
      'INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, idempotency_key, creado_por_usuario_id) VALUES ($1, $2, $3, $4, NULL)',
      [students.rows[3].id, anioId, gradoId, duplicada]
    );
    const conClave = await clientQuery<{ c: number }>(
      'SELECT count(*)::int AS c FROM matriculas WHERE idempotency_key = $1',
      [duplicada]
    );
    expect(Number(conClave.rows[0].c)).toBe(3);
  });

  it('re-aplicar todo 001-008 es idempotente (no falla)', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, MIG_FILES);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const client2 = await dbPool.connect();
    try {
      await client2.query('BEGIN');
      await applyFiles(client2, MIG_FILES);
      await client2.query('COMMIT');
    } finally {
      client2.release();
    }
    expect(true).toBe(true);
  });

  it('007 rechaza duplicados de plan por matricula sin borrar filas (precheck)', async () => {
    // Estado previo a 007: sin el índice único para poder insertar duplicados.
    await clientQuery('DROP INDEX IF EXISTS uq_planes_pago_matricula_id');
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await applyFiles(client, MIG_001_006);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const { anioId, estId, gradoId } = await ensureBaseData();
    const mat = await clientQuery<{ id: number }>('INSERT INTO matriculas (estudiante_id, anio_lectivo_id, grado_id, estado) VALUES ($1, $2, $3, $4) RETURNING id', [
      estId, anioId, gradoId, 'ACTIVA',
    ]);
    await clientQuery('INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota) VALUES ($1, 1, $2)', [mat.rows[0].id, '100.00']);
    await clientQuery('INSERT INTO planes_pago (matricula_id, total_cuotas, monto_cuota) VALUES ($1, 1, $2)', [mat.rows[0].id, '100.00']);

    const sql007 = readFileSync(MIG_007, 'utf8');
    let error: unknown = null;
    try {
      await clientQuery(sql007);
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();

    // Las filas duplicadas no se borran al fallar el precheck.
    const count = await clientQuery<{ c: number }>('SELECT count(*)::int AS c FROM planes_pago WHERE matricula_id = $1', [mat.rows[0].id]);
    expect(Number(count.rows[0].c)).toBe(2);

    // Tras eliminar duplicados, 007 aplica sin error y crea el índice.
    await clientQuery('DELETE FROM planes_pago WHERE matricula_id = $1 AND ctid NOT IN (SELECT min(ctid) FROM planes_pago WHERE matricula_id = $1 GROUP BY matricula_id)', [mat.rows[0].id]);
    await clientQuery(sql007);
    const idx = await clientQuery("SELECT indexname FROM pg_indexes WHERE tablename = 'planes_pago' AND indexname = 'uq_planes_pago_matricula_id'");
    expect(idx.rows.length).toBe(1);
  });
});
