/**
 * ============================================================================
 * REPOSITORIO DEL MOTOR DE APLICACION DE ABONOS (FASE 6.B)
 * ============================================================================
 *
 * Persistencia atomica de un abono sobre el plan de pago de UNA matricula.
 * No contiene reglas de negocio: ejecuta SQL parametrizado y devuelve
 * resultados. Las reglas (FIFO, mora, excedente) viven en el servicio y se
 * alimentan SIEMPRE de `politicas-financieras` (DEC-20).
 *
 * Reglas duras de este archivo:
 * - Todos los importes viajan como STRING exacto (`::text` sobre NUMERIC) y
 *   se reciben como parametro de texto. Aqui NO se usa Number() ni
 *   parseFloat() sobre ningun importe: la aritmetica y el redondeo ocurren
 *   dentro de PostgreSQL (NUMERIC), nunca en JavaScript.
 * - Ambito: el plan de la matricula (`plan_pago_id`). Ninguna consulta cruza
 *   a otra matricula ni a otro anio lectivo.
 * - Toda operacion de escritura se ejecuta DENTRO de la transaccion que abre
 *   el servicio, con el MISMO PoolClient (se pasa como argumento).
 *
 * Esquema verificado contra la base viva (2026-11-10, PostgreSQL 16,
 * `.tmp/test-artifacts/sgpm-fase3-db`, tabla public.pago_aplicaciones):
 *   pago_aplicaciones(id, pago_id, mensualidad_id, monto_aplicado NUMERIC(12,2),
 *                     creado_en TIMESTAMPTZ)
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

/** Identificador basico de la matricula: solo se necesita su estudiante. */
export interface MatriculaBaseRow {
  id: number;
  estudiante_id: number;
}

/** Plan de pago de la matricula (ambito FIFO unico). */
export interface PlanPagoDeMatriculaRow {
  id: number;
  matricula_id: number;
  total_cuotas: number;
  monto_cuota: string;
  moneda: string | null;
  tarifa_id: number | null;
}

/**
 * Cuota pendiente en orden FIFO con la deuda total del plan y el flag de
 * excedente calculados en PostgreSQL (exactos, sin aritmetica en JS).
 *
 * `fecha_vencimiento` es DATE y se devuelve como texto 'YYYY-MM-DD' (sin
 * conversion de zona horaria). `deuda_total` se repite en cada fila (suma
 * sobre la ventana completa) y se usa para el rechazo de excedente.
 * `excede_deuda` es TRUE solo si el abono es ESTRICTAMENTE mayor que la deuda
 * pendiente total del plan.
 */
export interface CuotaPendienteFifoRow {
  id: number;
  plan_pago_id: number;
  numero_cuota: number;
  concepto: string;
  monto_original: string;
  monto_pagado: string;
  saldo_pendiente: string;
  fecha_vencimiento: string;
  estado: string;
  mora_aplicada: string;
  deuda_total: string;
  excede_deuda: boolean;
}

/** Cabecera de pago tal como queda almacenada. */
export interface PagoRow {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: Date;
  idempotencia_key: string | null;
  estado: string;
  usuario_id: number | null;
  observaciones: string | null;
}

/** Medio de pago a insertar (monto como string exacto). */
export interface MedioPagoRow {
  tipo: string;
  monto: string;
  referencia: string | null;
}

/**
 * Resultado de aplicar un abono a UNA cuota, calculado integramente en
 * PostgreSQL: monto aplicado (LEAST), nuevo saldo (nunca negativo), mora
 * (una sola vez, sobre el monto base, no capitalizable) y estado.
 */
export interface ResultadoAplicacionCuotaRow {
  id: number;
  numero_cuota: number;
  monto_aplicado: string;
  monto_pagado: string;
  saldo_pendiente: string;
  mora_aplicada: string;
  estado: string;
  /** Remanente tras esta cuota, como string exacto. */
  remanente: string;
  /** TRUE si aun queda remanente que aplicar a la cuota siguiente. */
  queda_remanente: boolean;
}

/** Entrada de auditoria del pago (misma forma que matricula.repository). */
export interface EntradaAuditoriaPago {
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown>;
}

export class AplicacionPagosRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  /**
   * Matricula base: id + estudiante (la cabecera de pago exige estudiante_id).
   * Devuelve null si la matricula no existe.
   */
  async obtenerMatriculaBase(
    matriculaId: number,
    client?: PoolClient
  ): Promise<MatriculaBaseRow | null> {
    const result = await this.executor(client).query<MatriculaBaseRow>(
      'SELECT id, estudiante_id FROM matriculas WHERE id = $1',
      [matriculaId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Plan de pago de la matricula (UNIQUE(matricula_id)): es el ambito FIFO.
   * Nunca se listan cuotas de otros planes.
   */
  async obtenerPlanPagoDeMatricula(
    matriculaId: number,
    client?: PoolClient
  ): Promise<PlanPagoDeMatriculaRow | null> {
    const result = await this.executor(client).query<PlanPagoDeMatriculaRow>(
      `SELECT id, matricula_id, total_cuotas, monto_cuota::text AS monto_cuota,
              moneda, tarifa_id
         FROM planes_pago
        WHERE matricula_id = $1`,
      [matriculaId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Cuotas pendientes del plan en ORDEN FIFO determinista:
   * fecha_vencimiento ASC, desempate numero_cuota ASC y despues id ASC.
   * El resultado no depende del orden de insercion ni de fisico de filas.
   *
   * En la misma consulta se calcula, en PostgreSQL y como NUMERIC exacto:
   * - `deuda_total`: suma de saldo_pendiente de TODAS las cuotas pendientes
   *   del plan (ventana completa), repetida en cada fila.
   * - `excede_deuda`: abono estrictamente mayor que la deuda pendiente total.
   *
   * Devuelve array vacio si el plan no tiene deuda pendiente.
   */
  async obtenerCuotasFifo(
    planPagoId: number,
    montoAbono: string,
    client?: PoolClient
  ): Promise<CuotaPendienteFifoRow[]> {
    const result = await this.executor(client).query<CuotaPendienteFifoRow>(
      `SELECT m.id, m.plan_pago_id, m.numero_cuota, m.concepto,
              m.monto_original::text AS monto_original,
              m.monto_pagado::text AS monto_pagado,
              m.saldo_pendiente::text AS saldo_pendiente,
              m.fecha_vencimiento::text AS fecha_vencimiento,
              m.estado,
              m.mora_aplicada::text AS mora_aplicada,
              (SUM(m.saldo_pendiente) OVER ())::text AS deuda_total,
              ($2::numeric > SUM(m.saldo_pendiente) OVER ()) AS excede_deuda
         FROM mensualidades m
        WHERE m.plan_pago_id = $1 AND m.saldo_pendiente > 0
        ORDER BY m.fecha_vencimiento ASC, m.numero_cuota ASC, m.id ASC`,
      [planPagoId, montoAbono]
    );
    return result.rows;
  }

  /**
   * Suma exacta de importes en PostgreSQL (NUMERIC, sin coma flotante).
   * Devuelve el total como string exacto. Se usa para derivar
   * `pagos.monto_total` a partir de los medios.
   */
  async sumarMontos(montos: readonly string[], client?: PoolClient): Promise<string> {
    if (montos.length === 0) {
      throw new Error('sumarMontos: se requiere al menos un importe');
    }
    // Cada importe en su propia fila VALUES: `(VALUES ($1::numeric), ($2::numeric))`.
    // La lista lleva UN parentesis por fila y NINGUNO envolvente extra: un
    // parentesis alrededor de toda la lista crearia una unica fila de N
    // columnas y SUM solo veria la primera.
    const valores = montos
      .map((_, indice) => `($${indice + 1}::numeric)`)
      .join(', ');
    const result = await this.executor(client).query<{ total: string }>(
      `SELECT COALESCE(SUM(v.monto), 0)::text AS total
         FROM (VALUES ${valores}) AS v(monto)`,
      montos as string[]
    );
    return result.rows[0].total;
  }

  /**
   * Busca un pago por su clave de idempotencia (columna UNIQUE). Solo lectura
   * dentro de la transaccion del abono: permite detectar el replay antes de
   * escribir una segunda vez.
   */
  async obtenerPagoPorIdempotenciaKey(
    idempotenciaKey: string,
    client?: PoolClient
  ): Promise<PagoRow | null> {
    const result = await this.executor(client).query<PagoRow>(
      `SELECT id, estudiante_id, matricula_id, monto_total::text AS monto_total,
              fecha_pago, idempotencia_key, estado, usuario_id, observaciones
         FROM pagos
        WHERE idempotencia_key = $1`,
      [idempotenciaKey]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Inserta la cabecera del pago. `monto_total` llega como string exacto ya
   * sumado en PostgreSQL. `fecha_pago` y `estado` los aplica el DEFAULT de
   * columna (NOW()/ 'COMPLETADO'): NO se decide aqui el momento del registro.
   * La violacion de UNIQUE (`pagos_idempotencia_key_key`, 23505) se propaga
   * para que el servicio la traduzca a 409 sin filtrar el driver.
   */
  async crearPago(
    entrada: {
      estudianteId: number;
      matriculaId: number;
      montoTotal: string;
      idempotenciaKey: string | null;
      usuarioId: number | null;
      observaciones: string | null;
    },
    client?: PoolClient
  ): Promise<PagoRow> {
    const result = await this.executor(client).query<PagoRow>(
      `INSERT INTO pagos (estudiante_id, matricula_id, monto_total, idempotencia_key,
                          usuario_id, observaciones)
       VALUES ($1, $2, $3::numeric, $4, $5, $6)
       RETURNING id, estudiante_id, matricula_id, monto_total::text AS monto_total,
                 fecha_pago, idempotencia_key, estado, usuario_id, observaciones`,
      [
        entrada.estudianteId,
        entrada.matriculaId,
        entrada.montoTotal,
        entrada.idempotenciaKey,
        entrada.usuarioId,
        entrada.observaciones,
      ]
    );
    return result.rows[0];
  }

  /** Inserta un medio de pago de la cabecera ya creada. */
  async crearMedioPago(
    pagoId: number,
    medio: MedioPagoRow,
    client?: PoolClient
  ): Promise<void> {
    await this.executor(client).query(
      `INSERT INTO pago_medios (pago_id, tipo, monto, referencia)
       VALUES ($1, $2, $3::numeric, $4)`,
      [pagoId, medio.tipo, medio.monto, medio.referencia]
    );
  }

  /**
   * Registra la aplicacion de un importe a una cuota (FIFO). El importe llega
   * como string exacto devuelto por PostgreSQL (nunca calculado en JS).
   */
  async crearAplicacionPago(
    pagoId: number,
    mensualidadId: number,
    montoAplicado: string,
    client?: PoolClient
  ): Promise<void> {
    await this.executor(client).query(
      `INSERT INTO pago_aplicaciones (pago_id, mensualidad_id, monto_aplicado)
       VALUES ($1, $2, $3::numeric)`,
      [pagoId, mensualidadId, montoAplicado]
    );
  }

  /**
   * Aplica el abono a UNA cuota en una unica sentencia UPDATE, con todo
   * resuelto en PostgreSQL:
   * - `aplicado = LEAST(saldo_pendiente, disponible)`: nunca deja saldo
   *   negativo y el remanente se agota antes de pasar a la siguiente cuota
   *   (el bucle lo decide el servicio con `queda_remanente`).
   * - Mora: `ROUND(monto_original * porcentaje / 100, precision)` solo si la
   *   cuota NO la tiene aplicada (`mora_aplicada = 0`) y la fecha efectiva
   *   alcanza el dia de inicio de mora del mes de vencimiento. Es sobre el
   *   MONTO BASE (monto_original), una sola vez y no capitalizable: una mora
   *   ya aplicada jamas se recalcula al reducir el saldo.
   * - Estado: si el saldo queda en 0 pasa a `estado_saldada` (politica)
   *   CONSERVANDO `mora_aplicada`.
   *
   * Devuelve null solo si la cuota desaparecio o ya no tiene saldo dentro de
   * la transaccion (inconsistencia tecnica: el servicio aborta).
   */
  async aplicarAbonoACuota(
    parametros: {
      mensualidadId: number;
      montoDisponible: string;
      fechaEfectiva: string;
      diaInicioMora: number;
      porcentajeMora: string;
      precisionDecimales: number;
      estadoSaldada: string;
    },
    client?: PoolClient
  ): Promise<ResultadoAplicacionCuotaRow | null> {
    const result = await this.executor(client).query<ResultadoAplicacionCuotaRow>(
      `UPDATE mensualidades m
          SET monto_pagado = m.monto_pagado + lo.aplicado,
              saldo_pendiente = m.saldo_pendiente - lo.aplicado,
              mora_aplicada = CASE
                WHEN m.mora_aplicada = 0 AND lo.en_mora
                  THEN ROUND(m.monto_original * $5::numeric / 100, $6::int)
                ELSE m.mora_aplicada
              END,
              estado = CASE
                WHEN m.saldo_pendiente - lo.aplicado = 0 THEN $7
                ELSE m.estado
              END,
              actualizado_en = NOW()
         FROM (
           SELECT LEAST(m2.saldo_pendiente, $2::numeric) AS aplicado,
                  ($3::date >= (date_trunc('month', m2.fecha_vencimiento)
                      + make_interval(days => $4::int - 1))::date) AS en_mora
             FROM mensualidades m2
            WHERE m2.id = $1 AND m2.saldo_pendiente > 0
         ) AS lo
        WHERE m.id = $1
        RETURNING m.id, m.numero_cuota,
                  lo.aplicado::text AS monto_aplicado,
                  m.monto_pagado::text AS monto_pagado,
                  m.saldo_pendiente::text AS saldo_pendiente,
                  m.mora_aplicada::text AS mora_aplicada,
                  m.estado,
                  ($2::numeric - lo.aplicado)::text AS remanente,
                  (($2::numeric - lo.aplicado) > 0) AS queda_remanente`,
      [
        parametros.mensualidadId,
        parametros.montoDisponible,
        parametros.fechaEfectiva,
        parametros.diaInicioMora,
        parametros.porcentajeMora,
        parametros.precisionDecimales,
        parametros.estadoSaldada,
      ]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * RN-SGPM-07 verificada DENTRO de la transaccion: monto_total de la
   * cabecera = suma de `pago_medios.monto` = suma de
   * `pago_aplicaciones.monto_aplicado`. La comparacion es aritmetica exacta
   * de PostgreSQL (NUMERIC), nunca de JavaScript.
   */
  async verificarIgualdadExacta(
    pagoId: number,
    montoTotal: string,
    client?: PoolClient
  ): Promise<boolean> {
    const result = await this.executor(client).query<{ iguales: boolean }>(
      `SELECT (p.monto_total = $2::numeric
               AND (SELECT COALESCE(SUM(mdis.monto), 0) FROM pago_medios mdis
                     WHERE mdis.pago_id = p.id) = $2::numeric
               AND (SELECT COALESCE(SUM(apli.monto_aplicado), 0) FROM pago_aplicaciones apli
                     WHERE apli.pago_id = p.id) = $2::numeric) AS iguales
         FROM pagos p
        WHERE p.id = $1`,
      [pagoId, montoTotal]
    );
    if (result.rows.length === 0) {
      return false;
    }
    return result.rows[0].iguales;
  }

  /**
   * Aplicaciones registradas de un pago (con el estado ACTUAL de cada cuota).
   * Se usa para devolver el replay idempotente tal como quedo: nunca vuelve a
   * aplicar nada.
   */
  async obtenerAplicacionesDePago(
    pagoId: number,
    client?: PoolClient
  ): Promise<
    Array<{
      mensualidad_id: number;
      numero_cuota: number;
      monto_aplicado: string;
      saldo_pendiente: string;
      mora_aplicada: string;
      estado: string;
    }>
  > {
    const result = await this.executor(client).query<{
      mensualidad_id: number;
      numero_cuota: number;
      monto_aplicado: string;
      saldo_pendiente: string;
      mora_aplicada: string;
      estado: string;
    }>(
      `SELECT a.mensualidad_id,
              m.numero_cuota,
              a.monto_aplicado::text AS monto_aplicado,
              m.saldo_pendiente::text AS saldo_pendiente,
              m.mora_aplicada::text AS mora_aplicada,
              m.estado
         FROM pago_aplicaciones a
         JOIN mensualidades m ON m.id = a.mensualidad_id
        WHERE a.pago_id = $1
        ORDER BY a.id ASC`,
      [pagoId]
    );
    return result.rows;
  }

  /**
   * Auditoria del abono dentro de la MISMA transaccion. Mismo patron que
   * `MatriculaRepository.registrarAuditoria`: el error tecnico se propaga
   * redactado (sin detalle del driver) y aborta la transaccion.
   */
  async registrarAuditoria(
    entrada: EntradaAuditoriaPago,
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
