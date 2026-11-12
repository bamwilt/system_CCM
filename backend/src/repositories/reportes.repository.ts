import { Pool, PoolClient, QueryResultRow } from 'pg';
import { getPool } from '../config/database';

/**
 * ============================================================================
 * REPORTES Y CONSULTAS (FASE 8) — REPOSITORIO DE SOLO LECTURA
 * ============================================================================
 *
 * REGLA RECTORA (PM FASE 8): "Los reportes deben obtener sus cifras de los
 * registros financieros oficiales" y "No duplicar calculos monetarios de manera
 * inconsistente entre backend y frontend".
 *
 * Por eso NINGUNA consulta de este repositorio recalcula importes: lee lo que
 * `pagos`, `pago_aplicaciones`, `mensualidades` y `comprobantes` tienen
 * almacenado, y lo proyecta como texto exacto. No hay multiplicaciones, ni
 * divisiones, ni redondeos inventados: las sumas las hace PostgreSQL sobre
 * NUMERIC y se devuelven como string.
 *
 * SEGUNDA REGLA (RN-SGPM-07): el reporte debe reflejar "la operacion y sus
 * reversiones". Una pago REVERTIDO o ANULADO no es recaudacion, aunque sus
 * aplicaciones sigan guardadas como historial. Cada total filtra por estado.
 *
 * TERCERA REGLA: no hay reloj implicito. La morosidad recibe `fecha_corte`
 * explicita (como la mora del motor recibe `fecha_efectiva`), para que el mismo
 * reporte dé el mismo resultado en cualquier momento y zona horaria.
 */

/** Fila de pago proyectada (importes como texto exacto). */
export interface PagoReporteRow {
  id: number;
  fecha_pago: string;
  monto_total: string;
  estado: string;
  estudiante_id: number;
  matricula_id: number | null;
  usuario_id: number | null;
  observaciones: string | null;
  reversion_pago_id: number | null;
}

/** Total de un grupo: cantidad + suma exacta. */
export interface TotalGrupoRow {
  clave: string;
  cantidad: number;
  total: string;
}

/** Estudiante con deuda pendiente. */
export interface EstudiantePendienteRow {
  estudiante_id: number;
  nombre: string;
  documento_identidad: string;
  cuotas_pendientes: number;
  saldo_total: string;
  moneda: string | null;
}

/** Cuota en morosidad a una fecha de corte dada. */
export interface CuotaMorosaRow {
  mensualidad_id: number;
  matricula_id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  saldo_pendiente: string;
  mora_aplicada: string;
  moneda: string | null;
  dias_vencida: number;
}

/** Resumen diario de recaudacion. */
export interface RecaudacionDiaRow {
  dia: string;
  operaciones: number;
  total: string;
  anuladas: number;
  total_anulado: string;
}

/** Movimientos por cajero (usuario). */
export interface MovimientoCajeroRow {
  usuario_id: number | null;
  operaciones: number;
  total: string;
  anuladas: number;
  total_anulado: string;
}

/** Desglose por medio de pago. */
export interface MedioRow {
  tipo: string;
  operaciones: number;
  total: string;
}

/** Operacion anulada o revertida. */
export interface OperacionAnuladaRow {
  id: number;
  fecha_pago: string;
  monto_total: string;
  estado: string;
  revertido_motivo: string | null;
  revertido_en: string | null;
  reversion_pago_id: number | null;
  estudiante_id: number;
  usuario_id: number | null;
}

/** Estado de cuenta de un estudiante. */
export interface EstadoCuentaRow {
  estudiante_id: number;
  nombre: string;
  documento_identidad: string;
  matriculas: number;
  cuotas_total: number;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  saldo_total: string;
  pagado_total: string;
  mora_total: string;
  pagos_registrados: number;
  pagos_anulados: number;
  moneda: string | null;
}

/** Matriculas registradas agrupadas. */
export interface MatriculasResumenRow {
  clave: string;
  cantidad: number;
}

/**
 * Estados de pago que NO son recaudacion. `ANULADO` es la operacion inversa que
 * crea la reversion; `REVERTIDO` es el estado final del pago original. Ambos
 * quedan en el historial (no se borran) pero no suman a la recaudacion.
 */
const SQL_ESTADOS_NO_RECAUDACION = `('REVERTIDO', 'ANULADO')`;

export class ReportesRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  /** Parsea una fecha ISO estricta (YYYY-MM-DD) o devuelve null. */
  private fecha(valor: string | undefined): string | null {
    if (valor === undefined || valor.trim() === '') {
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return null;
    }
    const [y, m, d] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    if (
      fecha.getUTCFullYear() !== y ||
      fecha.getUTCMonth() !== m - 1 ||
      fecha.getUTCDate() !== d
    ) {
      return null;
    }
    return valor;
  }

  /**
   * Total de deuda pendiente y numero de cuotas, por estudiante.
   * Lee `saldo_pendiente` almacenado: no recalcula nada.
   */
  async estudiantesConSaldosPendientes(
    filtros: { moneda?: string | null; limite: number; compensar: number },
    client?: PoolClient
  ): Promise<{ filas: EstudiantePendienteRow[]; total: number }> {
    const params: unknown[] = [];
    const condiciones: string[] = ['m.saldo_pendiente > 0'];
    if (filtros.moneda) {
      condiciones.push(`pl.moneda = $${params.length + 1}`);
      params.push(filtros.moneda);
    }
    const where = `WHERE ${condiciones.join(' AND ')}`;

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(DISTINCT ma.estudiante_id)::int AS c
         FROM mensualidades m
         JOIN planes_pago pl ON pl.id = m.plan_pago_id
         JOIN matriculas ma ON ma.id = pl.matricula_id
         ${where}`,
      params
    );

    const filas = await this.executor(client).query<EstudiantePendienteRow>(
      `SELECT
         e.id AS estudiante_id,
         e.nombres || ' ' || e.apellidos AS nombre,
         e.documento_identidad,
         COUNT(m.id)::int AS cuotas_pendientes,
         SUM(m.saldo_pendiente)::text AS saldo_total,
         MAX(pl.moneda) AS moneda
       FROM mensualidades m
       JOIN planes_pago pl ON pl.id = m.plan_pago_id
       JOIN matriculas ma ON ma.id = pl.matricula_id
       JOIN estudiantes e ON e.id = ma.estudiante_id
       ${where}
       GROUP BY e.id, e.nombres, e.apellidos, e.documento_identidad
       ORDER BY SUM(m.saldo_pendiente) DESC, e.apellidos, e.nombres
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /**
   * Morosidad a una fecha de corte explicita. `dias_vencida` lo calcula
   * PostgreSQL sobre DATE, no sobre el reloj del servidor de la aplicacion.
   */
  async cuotasMorosas(
    filtros: {
      fechaCorte: string;
      moneda?: string | null;
      limite: number;
      compensar: number;
    },
    client?: PoolClient
  ): Promise<{ filas: CuotaMorosaRow[]; total: number }> {
    const params: unknown[] = [filtros.fechaCorte];
    const condiciones: string[] = [
      'm.saldo_pendiente > 0',
      'm.fecha_vencimiento < $1',
    ];
    if (filtros.moneda) {
      condiciones.push(`pl.moneda = $${params.length + 1}`);
      params.push(filtros.moneda);
    }
    const where = `WHERE ${condiciones.join(' AND ')}`;

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM mensualidades m
         JOIN planes_pago pl ON pl.id = m.plan_pago_id ${where}`,
      params
    );

    const filas = await this.executor(client).query<CuotaMorosaRow>(
      `SELECT
         m.id AS mensualidad_id,
         ma.id AS matricula_id,
         e.id AS estudiante_id,
         e.nombres || ' ' || e.apellidos AS estudiante_nombre,
         m.numero_cuota,
         to_char(m.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
         m.saldo_pendiente::text AS saldo_pendiente,
         m.mora_aplicada::text AS mora_aplicada,
         pl.moneda,
         (CAST($1 AS date) - m.fecha_vencimiento)::int AS dias_vencida
       FROM mensualidades m
       JOIN planes_pago pl ON pl.id = m.plan_pago_id
       JOIN matriculas ma ON ma.id = pl.matricula_id
       JOIN estudiantes e ON e.id = ma.estudiante_id
       ${where}
       ORDER BY m.fecha_vencimiento ASC, m.numero_cuota ASC, m.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /**
   * Recaudacion por dia. Solo estados que NO estan en
   * `SQL_ESTADOS_NO_RECAUDACION` cuentan como recaudacion; las anuladas se
   * informan aparte para que el reporte refleje la operacion y su reversion
   * (RN-SGPM-07), nunca en silencio.
   */
  async recaudacionPorPeriodo(
    filtros: { desde: string | null; hasta: string | null; limite: number; compensar: number },
    client?: PoolClient
  ): Promise<{ filas: RecaudacionDiaRow[]; total: number }> {
    const params: unknown[] = [];
    const condiciones: string[] = [];
    if (filtros.desde) {
      condiciones.push(`fecha_pago >= $${params.length + 1}::timestamptz`);
      params.push(`${filtros.desde}T00:00:00Z`);
    }
    if (filtros.hasta) {
      condiciones.push(`fecha_pago < ($${params.length + 1}::date + interval '1 day')`);
      params.push(filtros.hasta);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(DISTINCT fecha_pago::date)::int AS c FROM pagos ${where}`,
      params
    );

    const filas = await this.executor(client).query<RecaudacionDiaRow>(
      `SELECT
         to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia,
         COUNT(*) FILTER (WHERE estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION})::int AS operaciones,
         COALESCE(SUM(monto_total) FILTER (WHERE estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION}), 0)::text AS total,
         COUNT(*) FILTER (WHERE estado IN ${SQL_ESTADOS_NO_RECAUDACION})::int AS anuladas,
         COALESCE(SUM(monto_total) FILTER (WHERE estado IN ${SQL_ESTADOS_NO_RECAUDACION}), 0)::text AS total_anulado
       FROM pagos
       ${where}
       GROUP BY dia
       ORDER BY dia DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /** Movimientos por cajero (usuario que registro el pago). */
  async movimientosPorCajero(
    filtros: { desde: string | null; hasta: string | null; limite: number; compensar: number },
    client?: PoolClient
  ): Promise<{ filas: MovimientoCajeroRow[]; total: number }> {
    const params: unknown[] = [];
    const condiciones: string[] = [];
    if (filtros.desde) {
      condiciones.push(`fecha_pago >= $${params.length + 1}::timestamptz`);
      params.push(`${filtros.desde}T00:00:00Z`);
    }
    if (filtros.hasta) {
      condiciones.push(`fecha_pago < ($${params.length + 1}::date + interval '1 day')`);
      params.push(filtros.hasta);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(DISTINCT usuario_id)::int AS c FROM pagos ${where}`,
      params
    );

    const filas = await this.executor(client).query<MovimientoCajeroRow>(
      `SELECT
         usuario_id,
         COUNT(*) FILTER (WHERE estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION})::int AS operaciones,
         COALESCE(SUM(monto_total) FILTER (WHERE estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION}), 0)::text AS total,
         COUNT(*) FILTER (WHERE estado IN ${SQL_ESTADOS_NO_RECAUDACION})::int AS anuladas,
         COALESCE(SUM(monto_total) FILTER (WHERE estado IN ${SQL_ESTADOS_NO_RECAUDACION}), 0)::text AS total_anulado
       FROM pagos
       ${where}
       GROUP BY usuario_id
       ORDER BY total DESC, usuario_id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /** Desglose por medio de pago (pago_medios), solo de pagos no anulados. */
  async desglosePorMedio(
    filtros: { desde: string | null; hasta: string | null },
    client?: PoolClient
  ): Promise<MedioRow[]> {
    const params: unknown[] = [];
    const condiciones: string[] = [`p.estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION}`];
    if (filtros.desde) {
      condiciones.push(`p.fecha_pago >= $${params.length + 1}::timestamptz`);
      params.push(`${filtros.desde}T00:00:00Z`);
    }
    if (filtros.hasta) {
      condiciones.push(`p.fecha_pago < ($${params.length + 1}::date + interval '1 day')`);
      params.push(filtros.hasta);
    }
    const filas = await this.executor(client).query<MedioRow>(
      `SELECT
         pm.tipo,
         COUNT(DISTINCT pm.pago_id)::int AS operaciones,
         COALESCE(SUM(pm.monto), 0)::text AS total
       FROM pago_medios pm
       JOIN pagos p ON p.id = pm.pago_id
       WHERE ${condiciones.join(' AND ')}
       GROUP BY pm.tipo
       ORDER BY total DESC, pm.tipo ASC`,
      params
    );
    return filas.rows;
  }

  /** Operaciones anuladas o revertidas (nunca borradas, solo informadas). */
  async operacionesAnuladas(
    filtros: { desde: string | null; hasta: string | null; limite: number; compensar: number },
    client?: PoolClient
  ): Promise<{ filas: OperacionAnuladaRow[]; total: number }> {
    const params: unknown[] = [];
    const condiciones: string[] = [`estado IN ${SQL_ESTADOS_NO_RECAUDACION}`];
    if (filtros.desde) {
      condiciones.push(`fecha_pago >= $${params.length + 1}::timestamptz`);
      params.push(`${filtros.desde}T00:00:00Z`);
    }
    if (filtros.hasta) {
      condiciones.push(`fecha_pago < ($${params.length + 1}::date + interval '1 day')`);
      params.push(filtros.hasta);
    }
    const where = `WHERE ${condiciones.join(' AND ')}`;

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM pagos ${where}`,
      params
    );

    const filas = await this.executor(client).query<OperacionAnuladaRow>(
      `SELECT
         id,
         to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago,
         monto_total::text AS monto_total,
         estado,
         revertido_motivo,
         to_char(revertido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS revertido_en,
         reversion_pago_id,
         estudiante_id,
         usuario_id
       FROM pagos
       ${where}
       ORDER BY fecha_pago DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /** Estado de cuenta de UN estudiante, todo desde registros almacenados. */
  async estadoDeCuenta(
    estudianteId: number,
    client?: PoolClient
  ): Promise<EstadoCuentaRow | null> {
    const filas = await this.executor(client).query<EstadoCuentaRow>(
      `WITH cuotas AS (
         SELECT m.id, m.saldo_pendiente, m.monto_pagado, pl.moneda
           FROM mensualidades m
           JOIN planes_pago pl ON pl.id = m.plan_pago_id
           JOIN matriculas ma ON ma.id = pl.matricula_id
          WHERE ma.estudiante_id = $1
       ),
       pagos_est AS (
         SELECT id, estado FROM pagos WHERE estudiante_id = $1
       )
       SELECT
         e.id AS estudiante_id,
         e.nombres || ' ' || e.apellidos AS nombre,
         e.documento_identidad,
         (SELECT COUNT(*)::int FROM matriculas WHERE estudiante_id = $1) AS matriculas,
         (SELECT COUNT(*)::int FROM cuotas) AS cuotas_total,
         (SELECT COUNT(*)::int FROM cuotas WHERE saldo_pendiente <= 0) AS cuotas_pagadas,
         (SELECT COUNT(*)::int FROM cuotas WHERE saldo_pendiente > 0) AS cuotas_pendientes,
         (SELECT COALESCE(SUM(saldo_pendiente), 0)::text FROM cuotas) AS saldo_total,
         (SELECT COALESCE(SUM(m.saldo_pendiente), 0)::text FROM mensualidades m
            JOIN planes_pago pl ON pl.id = m.plan_pago_id
            JOIN matriculas ma ON ma.id = pl.matricula_id
           WHERE ma.estudiante_id = $1 AND m.mora_aplicada > 0) AS mora_total,
         (SELECT COALESCE(SUM(monto_pagado), 0)::text FROM cuotas) AS pagado_total,
         (SELECT COUNT(*)::int FROM pagos_est WHERE estado NOT IN ${SQL_ESTADOS_NO_RECAUDACION}) AS pagos_registrados,
         (SELECT COUNT(*)::int FROM pagos_est WHERE estado IN ${SQL_ESTADOS_NO_RECAUDACION}) AS pagos_anulados,
         (SELECT MAX(moneda) FROM cuotas) AS moneda
       FROM estudiantes e
       WHERE e.id = $1`,
      [estudianteId]
    );
    return filas.rows[0] ?? null;
  }

  /** Matriculas registradas, agrupadas por ano lectivo o por grado. */
  async matriculasRegistradas(
    agrupacion: 'anio' | 'grado',
    client?: PoolClient
  ): Promise<MatriculasResumenRow[]> {
    const columna =
      agrupacion === 'anio'
        ? `a.anio::text`
        : `g.nombre || ' (' || a.anio::text || ')'`;
    const filas = await this.executor(client).query<MatriculasResumenRow>(
      `SELECT ${columna} AS clave, COUNT(*)::int AS cantidad
         FROM matriculas ma
         JOIN anio_lectivo a ON a.id = ma.anio_lectivo_id
         JOIN grados g ON g.id = ma.grado_id
        GROUP BY ${columna}
        ORDER BY cantidad DESC, clave ASC`
    );
    return filas.rows;
  }

  /** Pagos de un periodo (listado, para el reporte "pagos por periodo"). */
  async pagosPorPeriodo(
    filtros: { desde: string | null; hasta: string | null; limite: number; compensar: number },
    client?: PoolClient
  ): Promise<{ filas: PagoReporteRow[]; total: number }> {
    const params: unknown[] = [];
    const condiciones: string[] = [];
    if (filtros.desde) {
      condiciones.push(`fecha_pago >= $${params.length + 1}::timestamptz`);
      params.push(`${filtros.desde}T00:00:00Z`);
    }
    if (filtros.hasta) {
      condiciones.push(`fecha_pago < ($${params.length + 1}::date + interval '1 day')`);
      params.push(filtros.hasta);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.executor(client).query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM pagos ${where}`,
      params
    );

    const filas = await this.executor(client).query<PagoReporteRow>(
      `SELECT
         id,
         to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago,
         monto_total::text AS monto_total,
         estado,
         estudiante_id,
         matricula_id,
         usuario_id,
         observaciones,
         reversion_pago_id
       FROM pagos
       ${where}
       ORDER BY fecha_pago DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limite, filtros.compensar]
    );
    return { filas: filas.rows, total: Number(total.rows[0]?.c ?? 0) };
  }

  /** Valida y normaliza una fecha de filtro (null si no viene o es invalida). */
  validarFecha(valor: string | undefined): string | null {
    return this.fecha(valor);
  }
}
