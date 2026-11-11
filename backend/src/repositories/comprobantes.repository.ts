/**
 * ============================================================================
 * REPOSITORIO DE COMPROBANTES Y PERSISTENCIA DE PAGOS (FASE 7.A)
 * ============================================================================
 *
 * Nota de nombrado: el plan (`subtask_02_api.json`) autoriza UN archivo de
 * repositorio nuevo, `comprobantes.repository.ts`. Todo el SQL de la FASE 7.A
 * vive aqui, con la emision/lectura del comprobante como pieza central. No se
 * crea `pagos.repository.ts` porque no esta en el plan.
 *
 * Reglas duras de este archivo (mismas disciplinas que
 * `aplicacion-pagos.repository` y `obligaciones.repository`):
 *
 * - Todas las consultas son PARAMETRIZADAS. Ningun valor se interpola en el
 *   SQL: los filtros de la busqueda se construyen con placeholders `$n` y sus
 *   valores viajan en el array de parametros.
 * - Los importes viajan como STRING exacto (`::text` sobre NUMERIC) o como
 *   NUMERIC de PostgreSQL a PostgreSQL. Aqui NO se usa `Number()` ni
 *   `parseFloat()` sobre ningun importe.
 * - El `Pool` es inyectable por constructor (patron de casa); el `PoolClient`
 *   se recibe como argumento para que las escrituras de la reversion ocurran
 *   DENTRO de la transaccion que abre la ruta.
 * - Los TIMESTAMPTZ se proyectan en UTC explicito
 *   (`AT TIME ZONE 'UTC'`), igual que `obligaciones.repository`: no hay zona
 *   horaria institucional configurada (DEC-05 abierta).
 *
 * Decisiones de modelado que este repositorio hace cumplir:
 *
 * 1. COMPROBANTE = DATO, NO ESCRITURA EN LA LECTURA. `GET /comprobante` solo
 *    ejecuta `SELECT`: nunca INSERT, nunca UPDATE, nunca `NOW()`. El numero del
 *    comprobante (identificador unico) lo asigna el trigger
 *    `fn_comprobantes_asignar_numero()` de la migracion 009 en el momento de
 *    EMITIR (escritura), por lo que un GET que no encuentra comprobante
 *    devuelve una vista previa SIN inventar numero ni persistir nada.
 * 2. EMITIR NO ALTERA SALDOS. La emision escribe unicamente `comprobantes`
 *    (copia fiel) y la fila del correlativo del ano (contador atomicos del
 *    trigger). No toca `mensualidades.saldo_pendiente`, `pagos.monto_total`
 *    ni `pago_aplicaciones`: PM FASE 7, "la generacion de un comprobante no
 *    debe alterar independientemente el saldo".
 * 3. REVERSION COMPENSATORIA (DEC-08). Se crea una operacion inversa NUEVA
 *    (`pagos`, estado 'ANULADO: nunca contada como recaudacion) y se marca el
 *    pago ORIGINAL con su estado final 'REVERTIDO' + referencia de la operacion
 *    que lo reversa + motivo + actor + fecha. La actualizacion del original
 *    toca EXCLUSIVAMENTE las columnas de reversion: `monto_total`,
 *    `fecha_pago`, `estudiante_id`, `idempotencia_key` y `creado_en` nunca se
 *    reescriben. No hay DELETE en ninguna de las dos tablas.
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

/** Fila almacenada de `comprobantes` (proyeccion en UTC explicito). */
export interface ComprobanteRow {
  /**
   * `comprobantes.id` es BIGSERIAL: pg devuelve int8 como texto y aqui NO se
   * convierte a numero. El identificador funcional del comprobante es
   * `numero_comprobante` (unico, asignado por el trigger de 009).
   */
  id: string;
  numero_comprobante: string;
  pago_id: number;
  anio: number;
  estado: string;
  fecha_emision: string;
  monto_total: string;
  moneda: string | null;
  pago_fecha: string;
  estudiante_nombre: string;
  grado_nombre: string | null;
  anio_lectivo: number | null;
  estudiante_id: number;
  matricula_id: number | null;
  usuario_id: number | null;
  observaciones: string | null;
  /**
   * Estado VIVO del pago (`pagos.estado`: COMPLETADO / REVERTIDO). El estado
   * almacenado del comprobante es `estado` (EMITIDO / ANULADO): son dos
   * ciclos distintos y no se confunden.
   */
  pago_estado: string;
}

/** Datos necesarios para emitir el comprobante de un pago (copia fiel). */
export interface DatosEmisionComprobante {
  pagoId: number;
  usuarioId: number | null;
}

/**
 * Detalle de UN pago con medios y aplicaciones en la MISMA consulta
 * (json_agg): no hay N+1 y detalle/agregado salen del mismo snapshot.
 */
export interface PagoDetalleRow {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: string;
  estado: string;
  usuario_id: number | null;
  observaciones: string | null;
  reversion_pago_id: number | null;
  revertido_motivo: string | null;
  revertido_en: string | null;
  creado_en: string;
  medios: Array<{
    id: number;
    tipo: string;
    monto: string;
    referencia: string | null;
  }>;
  aplicaciones: Array<{
    id: number;
    mensualidad_id: number;
    numero_cuota: number | null;
    monto_aplicado: string;
  }>;
}

/** Fila del listado paginado de operaciones. */
export interface PagoListaRow {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: string;
  estado: string;
  reversion_pago_id: number | null;
  creado_en: string;
  /** Conteo total de la busqueda (COUNT(*) OVER (), independiente de LIMIT). */
  total: number;
}

/** Filtros de busqueda de operaciones (todos validados antes de llegar aqui). */
export interface FiltrosBusquedaPagos {
  estudianteId: number | null;
  matriculaId: number | null;
  estado: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  limite: number;
  compensar: number;
}

/** Pago leido para reversar: solo lo que la reversion necesita. */
export interface PagoParaReversionRow {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  estado: string;
  reversion_pago_id: number | null;
}

/** Operacion inversa creada por la reversion compensatoria. */
export interface OperacionReversaRow {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: string;
}

/** Resultado de marcar el pago original con su estado final de reversion. */
export interface PagoRevertidoRow {
  id: number;
  estado: string;
  reversion_pago_id: number | null;
  monto_total: string;
  fecha_pago: string;
  revertido_motivo: string | null;
  revertido_en: string | null;
}

/**
 * Vista previa del comprobante cuando TODAVIA no se ha emitido ninguna fila.
 * Se construye con datos almacenados del pago y NO expone numero: asignar uno
 * es una escritura, y la lectura de comprobante nunca escribe.
 */
export interface VistaPreviaComprobanteRow {
  pago_id: number;
  pago_fecha: string;
  pago_estado: string;
  monto_total: string;
  moneda: string | null;
  estudiante_id: number;
  estudiante_nombre: string;
  matricula_id: number | null;
  grado_nombre: string | null;
  anio_lectivo: number | null;
}

/** Entrada de auditoria (misma forma que los repositorios de casa). */
export interface EntradaAuditoriaPagos {
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown>;
}

const SQL_COMPROBANTE_DE_PAGO = `
  SELECT c.id::text AS id,
         c.numero_comprobante,
         c.pago_id,
         c.anio,
         c.estado,
         to_char(c.fecha_emision AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_emision,
         c.monto_total::text AS monto_total,
         c.moneda,
         to_char(c.pago_fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS pago_fecha,
         pg.estado AS pago_estado,
         c.estudiante_nombre,
         c.grado_nombre,
         c.anio_lectivo,
         c.estudiante_id,
         c.matricula_id,
         c.usuario_id,
         c.observaciones
    FROM comprobantes c
    JOIN pagos pg ON pg.id = c.pago_id
   WHERE c.pago_id = $1
`;

/**
 * Copia fiel del comprobante. El numero (`numero_comprobante`) y el `anio` NO
 * se envian: los asigna el trigger `fn_comprobantes_asignar_numero()` en el
 * BEFORE INSERT, ignorando cualquier valor del cliente. Se insertan solo los
 * datos que el comprobante debe mostrar.
 */
const SQL_INSERTAR_COMPROBANTE = `
  INSERT INTO comprobantes (
    pago_id, estado, monto_total, moneda, pago_fecha,
    estudiante_nombre, grado_nombre, anio_lectivo,
    estudiante_id, matricula_id, usuario_id, observaciones
  )
  SELECT p.id,
         'EMITIDO',
         p.monto_total,
         pl.moneda,
         p.fecha_pago,
         btrim(e.nombres || ' ' || e.apellidos),
         g.nombre,
         al.anio,
         p.estudiante_id,
         p.matricula_id,
         $2,
         p.observaciones
    FROM pagos p
    JOIN estudiantes e ON e.id = p.estudiante_id
    LEFT JOIN matriculas m ON m.id = p.matricula_id
    LEFT JOIN grados g ON g.id = m.grado_id
    LEFT JOIN anio_lectivo al ON al.id = m.anio_lectivo_id
    LEFT JOIN planes_pago pl ON pl.matricula_id = p.matricula_id
   WHERE p.id = $1
  RETURNING id::text AS id,
            numero_comprobante,
            pago_id,
            anio,
            estado,
            to_char(fecha_emision AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_emision,
            monto_total::text AS monto_total,
            moneda,
            to_char(pago_fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS pago_fecha,
            (SELECT estado FROM pagos WHERE id = pago_id) AS pago_estado,
            estudiante_nombre,
            grado_nombre,
            anio_lectivo,
            estudiante_id,
            matricula_id,
            usuario_id,
            observaciones
`;

const SQL_DETALLE_PAGO = `
  WITH objetivo AS (
    SELECT p.id, p.estudiante_id, p.matricula_id,
           p.monto_total::text AS monto_total,
           to_char(p.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago,
           p.estado, p.usuario_id, p.observaciones,
           p.reversion_pago_id, p.revertido_motivo,
           to_char(p.revertido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS revertido_en,
           to_char(p.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS creado_en
      FROM pagos p
     WHERE p.id = $1
  ),
  medios AS (
    SELECT pm.pago_id,
           json_agg(json_build_object(
             'id', pm.id,
             'tipo', pm.tipo,
             'monto', pm.monto::text,
             'referencia', pm.referencia
           ) ORDER BY pm.id ASC) AS medios
      FROM pago_medios pm
      JOIN objetivo o ON o.id = pm.pago_id
     GROUP BY pm.pago_id
  ),
  aplicaciones AS (
    SELECT pa.pago_id,
           json_agg(json_build_object(
             'id', pa.id,
             'mensualidad_id', pa.mensualidad_id,
             'numero_cuota', men.numero_cuota,
             'monto_aplicado', pa.monto_aplicado::text
           ) ORDER BY pa.id ASC) AS aplicaciones
      FROM pago_aplicaciones pa
      JOIN objetivo o ON o.id = pa.pago_id
      LEFT JOIN mensualidades men ON men.id = pa.mensualidad_id
     GROUP BY pa.pago_id
  )
  SELECT o.id,
         o.estudiante_id,
         o.matricula_id,
         o.monto_total,
         o.fecha_pago,
         o.estado,
         o.usuario_id,
         o.observaciones,
         o.reversion_pago_id,
         o.revertido_motivo,
         o.revertido_en,
         o.creado_en,
         COALESCE(m.medios, '[]'::json) AS medios,
         COALESCE(a.aplicaciones, '[]'::json) AS aplicaciones
    FROM objetivo o
    LEFT JOIN medios m ON m.pago_id = o.id
    LEFT JOIN aplicaciones a ON a.pago_id = o.id
`;

/**
 * Listado. `COUNT(*) OVER ()` devuelve el total de la busqueda completa en la
 * MISMA consulta (sin segundo round-trip) y se proyecta a int4 para no
 * transportar un int8 como texto. El orden es determinista
 * (`creado_en DESC, id DESC`) para que la paginacion no se solape.
 */
const SQL_LISTA_PAGOS_BASE = `
  SELECT p.id,
         p.estudiante_id,
         p.matricula_id,
         p.monto_total::text AS monto_total,
         to_char(p.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago,
         p.estado,
         p.reversion_pago_id,
         to_char(p.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS creado_en,
         COUNT(*) OVER ()::int AS total
    FROM pagos p
`;

const SQL_PAGO_PARA_REVERSION = `
  SELECT p.id, p.estudiante_id, p.matricula_id,
         p.monto_total::text AS monto_total,
         p.estado, p.reversion_pago_id
    FROM pagos p
   WHERE p.id = $1
`;

/**
 * OPERACION INVERSA (reversion compensatoria, DEC-08).
 *
 * Por que esta fila NO lleva columnas de reversion: el trigger
 * `trg_pagos_reversion_unica` (BEFORE INSERT de 009) ABORTA con 23514
 * cualquier pago que NAZCA con `estado='REVERTIDO'` o con
 * `reversion_pago_id IS NOT NULL` ("un pago nuevo no puede registrarse
 * revertido: la reversion es un evento posterior"). La direccion de la
 * referencia la fija entonces el esquema: el ORIGINAL guarda
 * `reversion_pago_id` = esta operacion (esa es la semantica documentada de la
 * columna: "operacion que reversa este pago"), junto con motivo, actor y fecha.
 *
 * - `estado='ANULADO'`: `pagos.estado` no tiene CHECK de vocabulario (001) y
 *   cualquier consumidor que filtre operaciones cobradas
 *   (`estado='COMPLETADO'`) EXCLUYE esta fila: la operacion inversa nunca se
 *   cuenta como recaudacion. `estado='REVERTIDO'` en ella es imposible
 *   (trigger de INSERT + `pagos_reversion_estado_check`).
 * - `monto_total` es el importe del pago original, leido como `::text` y
 *   reinsertado como `::numeric`: copia exacta, sin aritmetica en JavaScript.
 * - `observaciones` guarda el motivo exigido por DEC-08 (el motivo canónico
 *   vive en `pagos.revertido_motivo` del pago original).
 * - Sin `pago_medios` ni `pago_aplicaciones`: la operacion inversa no mueve
 *   dinero ni reescribe cuotas (no hay regla aprobada de devolucion; DEC-08
 *   sigue pendiente de ratificacion institucional).
 */
const SQL_CREAR_OPERACION_REVERSA = `
  INSERT INTO pagos (
    estudiante_id, matricula_id, monto_total, usuario_id, observaciones, estado
  )
  VALUES ($1, $2, $3::numeric, $4, $5, 'ANULADO')
  RETURNING id,
            estudiante_id,
            matricula_id,
            monto_total::text AS monto_total,
            to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago
`;

/**
 * Estado final del pago ORIGINAL. Solo se tocan columnas de reversion. El
 * `WHERE` exige que el pago siga siendo una operacion cobrada COMPLETADA sin
 * reversion registrada: una segunda reversion no encuentra filas (-> 409 en el
 * servicio) y el trigger `trg_pagos_reversion_unica` abortaria igualmente con
 * 23505 sin borrar ni reescribir la fila.
 */
const SQL_MARCAR_PAGO_REVERTIDO = `
  UPDATE pagos p
     SET estado = 'REVERTIDO',
         reversion_pago_id = $2,
         revertido_motivo = $3,
         revertido_por_usuario_id = $4,
         revertido_en = NOW()
   WHERE p.id = $1
     AND p.estado = 'COMPLETADO'
     AND p.reversion_pago_id IS NULL
  RETURNING id,
            estado,
            reversion_pago_id,
            monto_total::text AS monto_total,
            to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS fecha_pago,
            revertido_motivo,
            to_char(revertido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS revertido_en
`;

/**
 * Vista previa del comprobante (SOLO LECTURA). Une el pago con los datos
 * impresos almacenados; nunca escribe ni asigna numero.
 */
const SQL_VISTA_PREVIA_COMPROBANTE = `
  SELECT p.id AS pago_id,
         to_char(p.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"') AS pago_fecha,
         p.estado AS pago_estado,
         p.monto_total::text AS monto_total,
         pl.moneda,
         p.estudiante_id,
         btrim(e.nombres || ' ' || e.apellidos) AS estudiante_nombre,
         p.matricula_id,
         g.nombre AS grado_nombre,
         al.anio AS anio_lectivo
    FROM pagos p
    JOIN estudiantes e ON e.id = p.estudiante_id
    LEFT JOIN matriculas m ON m.id = p.matricula_id
    LEFT JOIN grados g ON g.id = m.grado_id
    LEFT JOIN anio_lectivo al ON al.id = m.anio_lectivo_id
    LEFT JOIN planes_pago pl ON pl.matricula_id = p.matricula_id
   WHERE p.id = $1
`;

export class ComprobantesRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  /** Comprobante almacenado de un pago, o `null` si aun no se emitio. */
  async obtenerComprobanteDePago(
    pagoId: number,
    client?: PoolClient
  ): Promise<ComprobanteRow | null> {
    const result = await this.executor(client).query<ComprobanteRow>(
      SQL_COMPROBANTE_DE_PAGO,
      [pagoId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Emite (inserta) el comprobante de un pago y devuelve la fila almacenada,
   * incluido el numero asignado por el trigger. Devuelve `null` si el pago no
   * existe (el INSERT ... SELECT no encuentra fila): la emision nunca inventa
   * un comprobante para un pago inexistente.
   */
  async insertarComprobante(
    datos: DatosEmisionComprobante,
    client?: PoolClient
  ): Promise<ComprobanteRow | null> {
    const result = await this.executor(client).query<ComprobanteRow>(
      SQL_INSERTAR_COMPROBANTE,
      [datos.pagoId, datos.usuarioId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** Detalle de un pago con medios y aplicaciones (importes como texto). */
  async obtenerDetallePago(
    pagoId: number,
    client?: PoolClient
  ): Promise<PagoDetalleRow | null> {
    const result = await this.executor(client).query<PagoDetalleRow>(
      SQL_DETALLE_PAGO,
      [pagoId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Busqueda paginada. El WHERE se arma SOLO con placeholders y los valores
   * entran por el array de parametros; ningun filtro se interpola en el SQL.
   */
  async buscarPagos(
    filtros: FiltrosBusquedaPagos,
    client?: PoolClient
  ): Promise<{ filas: PagoListaRow[]; total: number }> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filtros.estudianteId !== null) {
      condiciones.push(`p.estudiante_id = $${idx++}`);
      params.push(filtros.estudianteId);
    }
    if (filtros.matriculaId !== null) {
      condiciones.push(`p.matricula_id = $${idx++}`);
      params.push(filtros.matriculaId);
    }
    if (filtros.estado !== null) {
      condiciones.push(`p.estado = $${idx++}`);
      params.push(filtros.estado);
    }
    if (filtros.fechaDesde !== null) {
      condiciones.push(`(p.fecha_pago AT TIME ZONE 'UTC')::date >= $${idx++}::date`);
      params.push(filtros.fechaDesde);
    }
    if (filtros.fechaHasta !== null) {
      condiciones.push(`(p.fecha_pago AT TIME ZONE 'UTC')::date <= $${idx++}::date`);
      params.push(filtros.fechaHasta);
    }

    const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
    const consulta = `${SQL_LISTA_PAGOS_BASE}${where}
       ORDER BY p.creado_en DESC, p.id DESC
       LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(filtros.limite, filtros.compensar);

    const result = await this.executor(client).query<PagoListaRow>(consulta, params);
    const filas = result.rows;
    return { filas, total: filas.length > 0 ? filas[0].total : 0 };
  }

  /** Pago leido dentro de la transaccion de reversion. */
  async obtenerPagoParaReversion(
    pagoId: number,
    client?: PoolClient
  ): Promise<PagoParaReversionRow | null> {
    const result = await this.executor(client).query<PagoParaReversionRow>(
      SQL_PAGO_PARA_REVERSION,
      [pagoId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Crea la operacion inversa (reversion compensatoria, DEC-08): una fila NUEVA
   * que conserva el importe, el estudiante y la matricula del pago original y
   * queda referenciada DESDE el original (`pagos.reversion_pago_id`). No borra
   * ni reescribe nada del pago original. El motivo y el actor viajan tambien
   * para que la fila sea legible por si sola.
   */
  async crearOperacionReversa(
    entrada: {
      estudianteId: number;
      matriculaId: number | null;
      montoTotal: string;
      usuarioId: number | null;
      motivo: string;
    },
    client?: PoolClient
  ): Promise<OperacionReversaRow> {
    const result = await this.executor(client).query<OperacionReversaRow>(
      SQL_CREAR_OPERACION_REVERSA,
      [entrada.estudianteId, entrada.matriculaId, entrada.montoTotal, entrada.usuarioId, entrada.motivo]
    );
    return result.rows[0];
  }

  /**
   * Marca el pago original con su estado final 'REVERTIDO' y la referencia de
   * la operacion que lo reversa. Solo se tocan columnas de reversion: el
   * `WHERE` exige que el pago este todavia en estado reversible COMPLETADO (una
   * segunda reversion no encuentra filas -> 409 en el servicio, y el trigger
   * `trg_pagos_reversion_unica` abortaria igualmente con 23505 sin borrar ni
   * reescribir la fila).
   */
  async marcarPagoRevertido(
    entrada: {
      pagoId: number;
      reversionPagoId: number;
      motivo: string;
      usuarioId: number | null;
    },
    client?: PoolClient
  ): Promise<PagoRevertidoRow | null> {
    const result = await this.executor(client).query<PagoRevertidoRow>(
      SQL_MARCAR_PAGO_REVERTIDO,
      [entrada.pagoId, entrada.reversionPagoId, entrada.motivo, entrada.usuarioId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** Vista previa del comprobante de un pago sin fila emitida (solo lectura). */
  async obtenerVistaPreviaComprobante(
    pagoId: number,
    client?: PoolClient
  ): Promise<VistaPreviaComprobanteRow | null> {
    const result = await this.executor(client).query<VistaPreviaComprobanteRow>(
      SQL_VISTA_PREVIA_COMPROBANTE,
      [pagoId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Auditoria dentro de la MISMA transaccion. Mismo INSERT que
   * `matricula.repository` y `aplicacion-pagos.repository`: el error tecnico
   * se propaga redactado (sin detalle del driver) y aborta la transaccion.
   */
  async registrarAuditoria(
    entrada: EntradaAuditoriaPagos,
    client?: PoolClient
  ): Promise<void> {
    try {
      await this.executor(client).query(
        'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip_address, fecha) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())',
        [
          entrada.usuarioId,
          entrada.accion,
          entrada.entidad,
          entrada.entidadId,
          JSON.stringify(entrada.detalle),
          null,
        ]
      );
    } catch (error) {
      throw redactError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
