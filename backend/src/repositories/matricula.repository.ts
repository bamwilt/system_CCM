import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

export interface Matricula {
  id: number;
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  tutor_id: number | null;
  fecha_matricula: Date;
  estado: string;
  observaciones: string | null;
  creado_en: Date;
  actualizado_en: Date;
}

export interface MatriculaSafe {
  id: number;
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  tutor_id: number | null;
  fecha_matricula: Date;
  estado: string;
  observaciones: string | null;
  activo: boolean;
}

export interface MatriculaRow {
  id: number;
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  tutor_id: number | null;
  fecha_matricula: Date;
  estado: string;
  observaciones: string | null;
  creado_en: Date;
  actualizado_en: Date;
}

export interface PlanPagoRow {
  id: number;
  matricula_id: number;
  total_cuotas: number;
  monto_cuota: string;
  moneda: string | null;
  tarifa_id: number | null;
  creado_en: Date;
}

export interface MensualidadRow {
  id: number;
  plan_pago_id: number;
  numero_cuota: number;
  concepto: string;
  monto_original: string;
  monto_pagado: string;
  saldo_pendiente: string;
  fecha_vencimiento: Date;
  estado: string;
  mora_aplicada: string;
  creado_en: Date;
  actualizado_en: Date;
}

/**
 * Entrada de auditoria expuesta por el historial de una matricula.
 * `detalle` es el jsonb almacenado; se devuelve tal cual (sin transformaciones).
 */
export interface AuditoriaMatriculaRow {
  accion: string;
  usuario_id: number | null;
  fecha: Date;
  detalle: unknown;
}

export interface CreateMatriculaInput {
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  tutor_id?: number | null;
  fecha_matricula?: string | null;
  estado?: string;
  observaciones?: string | null;
  /**
   * Clave de idempotencia de aplicacion (opcional). Se persiste tal cual
   * (ya recortada y validada por el schema); null significa "sin clave".
   */
  idempotency_key?: string | null;
  /**
   * Actor creador de la matricula. Acota la unicidad de la clave de
   * idempotencia al autor (evita el oraculo entre actores) y se persiste
   * como NULL cuando no se conoce el autor (filas legacy / fixtures).
   */
  creado_por_usuario_id?: number | null;
}

export interface UpdateMatriculaInput {
  estudiante_id?: number;
  anio_lectivo_id?: number;
  grado_id?: number;
  tutor_id?: number | null;
  fecha_matricula?: string | undefined;
  estado?: string;
  observaciones?: string | null;
}

export class MatriculaRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  async crear(datos: CreateMatriculaInput, client?: PoolClient): Promise<Matricula> {
    // fecha_matricula omitida => COALESCE(NULL, NOW()) aplica el DEFAULT NOW() de la columna NOT NULL.
    const result = await this.executor(client).query<MatriculaRow>(
      `INSERT INTO matriculas (
        estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, idempotency_key, creado_por_usuario_id
      ) VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8, $9)
      RETURNING id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, creado_en, actualizado_en`,
      [
        datos.estudiante_id,
        datos.anio_lectivo_id,
        datos.grado_id,
        datos.tutor_id ?? null,
        datos.fecha_matricula ?? null,
        datos.estado ?? 'ACTIVA',
        datos.observaciones ?? null,
        datos.idempotency_key ?? null,
        datos.creado_por_usuario_id ?? null,
      ]
    );
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorId(id: number, client?: PoolClient): Promise<Matricula | null> {
    const result = await this.executor(client).query<MatriculaRow>(
      `SELECT id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, creado_en, actualizado_en
       FROM matriculas WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorEstudianteYAnio(
    estudiante_id: number,
    anio_lectivo_id: number,
    client?: PoolClient
  ): Promise<Matricula | null> {
    const result = await this.executor(client).query<MatriculaRow>(
      `SELECT id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, creado_en, actualizado_en
       FROM matriculas
       WHERE estudiante_id = $1 AND anio_lectivo_id = $2`,
      [estudiante_id, anio_lectivo_id]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  /**
   * Busca la matricula creada con una clave de idempotencia concreta por un
   * actor concreto. Consulta parametrizada (`WHERE idempotency_key = $1 AND
   * creado_por_usuario_id = $2`): el indice unico parcial
   * `uq_matriculas_idempotency_key` la resuelve como indice.
   * Devuelve null si la clave no existe para ese actor.
   * El acote por actor evita el oraculo entre actores: una clave global
   * permitia a otro actor con `matriculas:manage` descubrir y reinyectar la
   * matricula ajena reutilizando su clave.
   */
  async obtenerPorIdempotencyKey(
    idempotency_key: string,
    creado_por_usuario_id: number,
    client?: PoolClient
  ): Promise<Matricula | null> {
    const result = await this.executor(client).query<MatriculaRow>(
      `SELECT id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, creado_en, actualizado_en
       FROM matriculas
       WHERE idempotency_key = $1 AND creado_por_usuario_id = $2`,
      [idempotency_key, creado_por_usuario_id]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async listar(
    opciones: {
      estudiante_id?: number;
      anio_lectivo_id?: number;
      estado?: string;
      activo?: boolean;
      limite?: number;
      compensar?: number;
    } = {},
    client?: PoolClient
  ): Promise<Matricula[]> {
    const {
      estudiante_id,
      anio_lectivo_id,
      estado,
      activo,
      limite = 50,
      compensar = 0,
    } = opciones;
    let consulta = `SELECT id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
      fecha_matricula, estado, observaciones, creado_en, actualizado_en
     FROM matriculas`;
    const params: unknown[] = [];
    let idx = 1;
    const condiciones: string[] = [];

    if (estudiante_id !== undefined) {
      condiciones.push(`estudiante_id = $${idx++}`);
      params.push(estudiante_id);
    }
    if (anio_lectivo_id !== undefined) {
      condiciones.push(`anio_lectivo_id = $${idx++}`);
      params.push(anio_lectivo_id);
    }
    if (estado !== undefined) {
      condiciones.push(`estado = $${idx++}`);
      params.push(estado);
    }
    if (activo !== undefined) {
      if (activo) {
        // activo = true significa NO DESACTIVADA (ACTIVA o COMPLETADA)
        condiciones.push(`estado <> $${idx++}`);
        params.push('DESACTIVADA');
      } else {
        // activo = false significa exactamente DESACTIVADA
        condiciones.push(`estado = $${idx++}`);
        params.push('DESACTIVADA');
      }
    }

    if (condiciones.length > 0) {
      consulta += ` WHERE ${condiciones.join(' AND ')}`;
    }

    consulta += ` ORDER BY creado_en DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limite, compensar);

    const result = await this.executor(client).query<MatriculaRow>(consulta, params);
    return result.rows.map((fila) => this.mapearFila(fila));
  }

  async actualizar(id: number, datos: UpdateMatriculaInput, client?: PoolClient): Promise<Matricula | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (datos.estudiante_id !== undefined) {
      sets.push(`estudiante_id = $${idx++}`);
      params.push(datos.estudiante_id);
    }
    if (datos.anio_lectivo_id !== undefined) {
      sets.push(`anio_lectivo_id = $${idx++}`);
      params.push(datos.anio_lectivo_id);
    }
    if (datos.grado_id !== undefined) {
      sets.push(`grado_id = $${idx++}`);
      params.push(datos.grado_id);
    }
    if (datos.tutor_id !== undefined) {
      sets.push(`tutor_id = $${idx++}`);
      params.push(datos.tutor_id);
    }
    if (datos.fecha_matricula !== undefined) {
      sets.push(`fecha_matricula = $${idx++}`);
      params.push(datos.fecha_matricula);
    }
    if (datos.estado !== undefined) {
      sets.push(`estado = $${idx++}`);
      params.push(datos.estado);
    }
    if (datos.observaciones !== undefined) {
      sets.push(`observaciones = $${idx++}`);
      params.push(datos.observaciones);
    }

    if (sets.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    params.push(id);
    const consulta = `UPDATE matriculas SET ${sets.join(', ')}, actualizado_en = NOW()
      WHERE id = $${idx} RETURNING id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones, creado_en, actualizado_en`;

    const result = await this.executor(client).query<MatriculaRow>(consulta, params);
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async desactivar(id: number, client?: PoolClient): Promise<Matricula | null> {
    return this.actualizar(id, { estado: 'DESACTIVADA' }, client);
  }

  async existeMatriculaEstudianteAnio(
    estudiante_id: number,
    anio_lectivo_id: number,
    excluirId?: number,
    client?: PoolClient
  ): Promise<boolean> {
    let consulta = 'SELECT 1 FROM matriculas WHERE estudiante_id = $1 AND anio_lectivo_id = $2';
    const params: unknown[] = [estudiante_id, anio_lectivo_id];
    let idx = 3;

    if (excluirId !== undefined) {
      consulta += ` AND id <> $${idx++}`;
      params.push(excluirId);
    }

    const result = await this.executor(client).query<{ existe: boolean }>(consulta, params);
    return result.rows.length > 0;
  }

  async obtenerPlanPago(matricula_id: number, client?: PoolClient): Promise<PlanPagoRow | null> {
    const result = await this.executor(client).query<PlanPagoRow>(
      `SELECT id, matricula_id, total_cuotas, monto_cuota::text AS monto_cuota,
        moneda, tarifa_id, creado_en
       FROM planes_pago WHERE matricula_id = $1`,
      [matricula_id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async obtenerMensualidades(plan_pago_id: number, client?: PoolClient): Promise<MensualidadRow[]> {
    const result = await this.executor(client).query<MensualidadRow>(
      `SELECT id, plan_pago_id, numero_cuota, concepto, monto_original::text AS monto_original,
        monto_pagado::text AS monto_pagado, saldo_pendiente::text AS saldo_pendiente,
        fecha_vencimiento, estado, mora_aplicada::text AS mora_aplicada, creado_en, actualizado_en
       FROM mensualidades WHERE plan_pago_id = $1 ORDER BY numero_cuota`,
      [plan_pago_id]
    );
    return result.rows;
  }

  /**
   * Importe de la cuota con el descuento AUTORIZADO aplicado, calculado y
   * redondeado por PostgreSQL (NUMERIC exacto; `ROUND` half-up de DEC-20).
   * Ninguna aritmetica ocurre en JavaScript: el porcentaje viaja como cadena
   * exacta ($2::numeric) y se devuelve como texto exacto.
   *
   *   monto_cuota         = ROUND(tarifa * (100 - porcentaje) / 100, precision)
   *   descuento_por_cuota = tarifa - monto_cuota           (exacto, tambien en PG)
   *   deja_monto_positivo = monto_cuota > 0
   *
   * `precision` es un parametro de `politicas-financieras`
   * (`precisionDecimales`); el almacenamiento final sigue siendo la columna
   * NUMERIC(12,2) del esquema vivo.
   *
   * La fila de `tarifas` NO se modifica: la consulta es de solo lectura y la
   * tarifa queda con su monto original intacto. Devuelve null solo si la
   * tarifa dejo de existir dentro de la transaccion (el servicio la bloquea
   * con FOR SHARE antes de llamar).
   */
  async calcularMontoCuotaConDescuento(
    parametros: {
      tarifaId: number;
      porcentajeDescuento: string;
      precisionDecimales: number;
    },
    client?: PoolClient
  ): Promise<{
    monto_tarifa: string;
    monto_cuota: string;
    descuento_por_cuota: string;
    deja_monto_positivo: boolean;
  } | null> {
    const result = await this.executor(client).query<{
      monto_tarifa: string;
      monto_cuota: string;
      descuento_por_cuota: string;
      deja_monto_positivo: boolean;
    }>(
      `SELECT t.monto::text AS monto_tarifa,
              d.monto_cuota::text AS monto_cuota,
              (t.monto - d.monto_cuota)::text AS descuento_por_cuota,
              (d.monto_cuota > 0) AS deja_monto_positivo
         FROM tarifas t
         CROSS JOIN LATERAL (
           SELECT ROUND(t.monto * (100 - $2::numeric) / 100, $3::int) AS monto_cuota
         ) AS d
        WHERE t.id = $1`,
      [
        parametros.tarifaId,
        parametros.porcentajeDescuento,
        parametros.precisionDecimales,
      ]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Historial de auditoria de UNA matricula: filtra estrictamente por
   * entidad = 'matriculas' y entidad_id = $1 (ambos parametros ligados).
   * Orden cronologico ascendente por fecha, con id como desempate.
   * Solo lectura: no escribe ni muta filas.
   */
  async obtenerAuditoriaMatricula(
    matricula_id: number,
    client?: PoolClient
  ): Promise<AuditoriaMatriculaRow[]> {
    const result = await this.executor(client).query<AuditoriaMatriculaRow>(
      `SELECT accion, usuario_id, fecha, detalle
         FROM auditoria
        WHERE entidad = $1 AND entidad_id = $2
        ORDER BY fecha ASC, id ASC`,
      ['matriculas', matricula_id]
    );
    return result.rows;
  }

  private mapearFila(fila: MatriculaRow): Matricula {
    return {
      id: fila.id,
      estudiante_id: fila.estudiante_id,
      anio_lectivo_id: fila.anio_lectivo_id,
      grado_id: fila.grado_id,
      tutor_id: fila.tutor_id,
      fecha_matricula: fila.fecha_matricula,
      estado: fila.estado,
      observaciones: fila.observaciones,
      creado_en: fila.creado_en,
      actualizado_en: fila.actualizado_en,
    };
  }

  aPerfilSeguro(matricula: Matricula): MatriculaSafe {
    return {
      id: matricula.id,
      estudiante_id: matricula.estudiante_id,
      anio_lectivo_id: matricula.anio_lectivo_id,
      grado_id: matricula.grado_id,
      tutor_id: matricula.tutor_id,
      fecha_matricula: matricula.fecha_matricula,
      estado: matricula.estado,
      observaciones: matricula.observaciones,
      activo: matricula.estado !== 'DESACTIVADA',
    };
  }

  async registrarAuditoria(
    entrada: {
      usuarioId: number | null;
      accion: string;
      entidad: string;
      entidadId: number | null;
      detalle: Record<string, unknown>;
    },
    client?: PoolClient
  ): Promise<void> {
    try {
      await this.executor(client).query(
        'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip_address, fecha) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())',
        [entrada.usuarioId, entrada.accion, entrada.entidad, entrada.entidadId, JSON.stringify(entrada.detalle), null]
      );
    } catch (error) {
      throw redactError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
