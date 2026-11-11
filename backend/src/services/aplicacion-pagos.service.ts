/**
 * ============================================================================
 * SERVICIO DEL MOTOR DE APLICACION DE ABONOS (FASE 6.B)
 * ============================================================================
 *
 * Aplica un abono al plan de pago de UNA matricula: FIFO por vencimiento con
 * desempate numero_cuota + id, mora de politica (una sola vez, no
 * capitalizable), abonos parciales con remanente, rechazo de excedente,
 * saldado conservando mora e idempotencia por `pagos.idempotencia_key`.
 *
 * Decisiones documentadas de este motor (DEC-20,
 * docs/DECISIONES_Y_CONTRADICCIONES.md; propuesta tecnica PENDIENTE DE
 * RATIFICACION INSTITUCIONAL, no politica institucional):
 *
 * - AMBITO: el plan de la matricula indicada (`planes_pago.matricula_id`).
 *   Ninguna cuota de otra matricula ni de otro anio lectivo se toca: cruzar
 *   anios no tiene regla aprobada.
 * - MONEDA: la del plan (`planes_pago.moneda`); el motor no convierte.
 * - MORA: porcentaje decimal exacto de `politicas-financieras`
 *   (`politicasFinancieras.porcentajeMora`), sobre el monto base de la cuota
 *   vencida no saldada, UNA SOLA VEZ y NO capitalizable. El momento del
 *   redondeo es `en_base_de_datos`: toda la aritmetica y el ROUND ocurren en
 *   PostgreSQL. En este archivo no se usa Number() ni parseFloat() sobre
 *   importes: los importes son strings exactos de punta a punta.
 * - FECHA EFECTIVA: la comparacion de mora usa `fecha_vencimiento` (DATE
 *   almacenada) frente a `fecha_efectiva`, una fecha EXPLICITA de la peticion
 *   ('YYYY-MM-DD'). El motor NUNCA usa el reloj del servidor (NOW()/
 *   CURRENT_DATE) para decidir mora; `pagos.fecha_pago` conserva el DEFAULT
 *   NOW() de columna como mero sello de registro y no participa en el calculo
 *   de mora. Por eso `fecha_efectiva` es obligatoria: sin ella el abono se
 *   rechaza (400) en lugar de asumir una fecha implicita.
 * - TRANSACCION: una unica transaccion con un unico PoolClient bajo el
 *   advisory lock del proyecto 4315003 (patron de casa, igual que
 *   estudiante/tutor/matricula). Cabecera, medios, aplicaciones, cuotas y
 *   auditoria entran juntos o no entra nada.
 * - AUTORIA: la validacion de sesion y permisos (getCurrentAuthContext /
 *   assertActiveSession) es de ruta y llegara con el endpoint de pagos; este
 *   servicio recibe `usuarioId` ya resuelto por el llamador y lo persiste en
 *   `pagos.usuario_id` y en la auditoria (null si el actor no es un id
 *   positivo y seguro; nunca se inventa autor, igual que matricula.service).
 * - EXCEDENTE: con `tratamientoExcedente='rechazar'` (DEC-20) un abono
 *   estrictamente mayor que la deuda pendiente total se rechaza con 400
 *   ANTES de escribir nada.
 */

import { PoolClient } from 'pg';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { hashToken } from '../utils/authCrypto';
import {
  politicasFinancieras,
  ErrorPoliticaFinancieraInvalida,
} from '../dominio/politicas-financieras';
import {
  AplicacionPagosRepository,
  MedioPagoRow,
} from '../repositories/aplicacion-pagos.repository';

/** Advisory lock global del proyecto (mismo valor que el resto de servicios). */
const ADVISORY_LOCK_KEY = 4315003;

/** Importe exacto en texto: digitos con punto y como maximo 2 decimales. */
const PATRON_MONTO = /^\d{1,12}(?:\.\d{1,2})?$/;
/** Cero en texto (para rechazar importes no positivos sin Number()). */
const PATRON_CERO = /^0+(?:\.0+)?$/;
/** Fecha ISO 'YYYY-MM-DD'. */
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface MedioPagoInput {
  tipo: string;
  /** Importe exacto como string (nunca number). */
  monto: string;
  referencia?: string | null;
}

export interface AplicarAbonoInput {
  matricula_id: number;
  medios: MedioPagoInput[];
  /** Fecha efectiva 'YYYY-MM-DD' para la comparacion de mora (obligatoria). */
  fecha_efectiva: string;
  observaciones?: string | null;
  /** Clave de idempotencia opcional (UNIQUE en `pagos`). */
  idempotencia_key?: string | null;
}

/** Aplicacion registrada (o reobservada en un replay) sobre una cuota. */
export interface AplicacionAbonoCuota {
  mensualidad_id: number;
  numero_cuota: number;
  monto_aplicado: string;
  saldo_pendiente: string;
  mora_aplicada: string;
  estado: string;
}

export interface AplicarAbonoResultado {
  pago_id: number;
  estudiante_id: number;
  matricula_id: number;
  monto_total: string;
  estado: string;
  fecha_efectiva: string;
  /** true cuando la peticion es un replay idempotente (no se reaplico nada). */
  idempotent_replay: boolean;
  aplicaciones: AplicacionAbonoCuota[];
  cuotas_saldadas: number[];
}

export class AplicacionPagosService {
  constructor(
    private readonly repo: AplicacionPagosRepository = new AplicacionPagosRepository()
  ) {}

  /**
   * Aplica el abono al plan de la matricula en UNA transaccion atomica.
   *
   * Flujo (todo con el mismo PoolClient, bajo el advisory lock del proyecto):
   *   1. matricula existe (404) -> clave de idempotencia: replay (sin
   *      reaplicar) o 409 si la clave ya se uso con otra identidad;
   *   2. plan de pago de la matricula (404);
   *   3. total del abono = suma exacta de medios en PostgreSQL;
   *   4. cuotas pendientes FIFO + deuda total + excedente (rechazo 400 antes
   *      de escribir nada);
   *   5. INSERT `pagos` (23505 -> 409 sin filtrar el driver), `pago_medios`;
   *   6. aplicacion secuencial con remanente: UPDATE por cuota con
   *      LEAST(saldo, remanente), mora una sola vez sobre el monto base,
   *      INSERT `pago_aplicaciones` por cuota aplicada;
   *   7. verificacion RN-SGPM-07 dentro de la transaccion (si falla: aborta);
   *   8. auditoria en la misma transaccion;
   *   9. COMMIT. Cualquier error intermedio: ROLLBACK total y propagacion.
   */
  async aplicarAbono(
    datos: AplicarAbonoInput,
    actorId: number
  ): Promise<AplicarAbonoResultado> {
    this.verificarPoliticasImplementadas();

    const matriculaId = this.validarMatriculaId(datos.matricula_id);
    const medios = this.validarMedios(datos.medios);
    const fechaEfectiva = this.validarFechaEfectiva(datos.fecha_efectiva);
    const observaciones = this.normalizarObservaciones(datos.observaciones);
    const idempotenciaKey = this.normalizarIdempotenciaKey(datos.idempotencia_key);
    const usuarioId = this.actorDePago(actorId);

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      // 1. Matricula (y su estudiante, columna NOT NULL de `pagos`).
      const matricula = await this.repo.obtenerMatriculaBase(matriculaId, client);
      if (!matricula) {
        throw new AppError('Matricula no encontrada', 404, 'NOT_FOUND');
      }

      // 2. Idempotencia: la clave se resuelve DENTRO de la transaccion y con
      //    el mismo PoolClient, antes de escribir nada (patron Fase 5).
      if (idempotenciaKey !== null) {
        const previo = await this.repo.obtenerPagoPorIdempotenciaKey(
          idempotenciaKey,
          client
        );
        if (previo) {
          if (previo.matricula_id !== matriculaId) {
            throw new AppError(
              'La clave de idempotencia ya fue utilizada con otro abono',
              409,
              'CONFLICT'
            );
          }
          // Replay: se devuelve el pago original tal como quedo (estado
          // actual de sus cuotas), sin reaplicar importes ni tocar cuotas.
          const aplicacionesPrevias = await this.repo.obtenerAplicacionesDePago(
            previo.id,
            client
          );
          await this.repo.registrarAuditoria(
            {
              usuarioId,
              accion: 'pago_aplicar_replay',
              entidad: 'pagos',
              entidadId: previo.id,
              detalle: {
                resultado: 'replay',
                pago_id: previo.id,
                matricula_id: matriculaId,
                monto_total: previo.monto_total,
                fecha_efectiva: fechaEfectiva,
                ...(idempotenciaKey.length > 0
                  ? { idempotency_key_hash: this.hashIdempotencyKey(idempotenciaKey) }
                  : {}),
              },
            },
            client
          );
          await client.query('COMMIT');
          return {
            pago_id: previo.id,
            estudiante_id: previo.estudiante_id,
            matricula_id: matriculaId,
            monto_total: previo.monto_total,
            estado: previo.estado,
            fecha_efectiva: fechaEfectiva,
            idempotent_replay: true,
            aplicaciones: aplicacionesPrevias,
            cuotas_saldadas: [],
          };
        }
      }

      // 3. Plan de pago de la matricula: ambito FIFO unico.
      const plan = await this.repo.obtenerPlanPagoDeMatricula(matriculaId, client);
      if (!plan) {
        throw new AppError('La matricula no tiene plan de pago', 404, 'NOT_FOUND');
      }

      // 4. Total del abono: suma exacta de los medios en PostgreSQL.
      const montoTotal = await this.repo.sumarMontos(
        medios.map((medio) => medio.monto),
        client
      );

      // 5. FIFO + deuda total + excedente, en una consulta exacta.
      const cuotasFifo = await this.repo.obtenerCuotasFifo(plan.id, montoTotal, client);
      if (cuotasFifo.length === 0) {
        throw new AppError(
          'La matricula no tiene cuotas con saldo pendiente',
          400,
          'BAD_REQUEST'
        );
      }
      if (cuotasFifo[0].excede_deuda) {
        // DEC-20 / DEC-06: excedente rechazado antes de escribir nada.
        throw new AppError(
          'El abono excede la deuda total pendiente de la matricula',
          400,
          'BAD_REQUEST'
        );
      }

      // 6. Cabecera del pago. 23505 (clave repetida) -> 409 sin filtrar el
      //    detalle del driver; cualquier otro error de BD se propaga.
      let pago;
      try {
        pago = await this.repo.crearPago(
          {
            estudianteId: matricula.estudiante_id,
            matriculaId,
            montoTotal,
            idempotenciaKey,
            usuarioId,
            observaciones,
          },
          client
        );
      } catch (error) {
        const codigo = (error as { code?: string } | null)?.code;
        if (codigo === '23505') {
          throw new AppError(
            'La clave de idempotencia ya fue utilizada',
            409,
            'CONFLICT'
          );
        }
        throw error;
      }

      for (const medio of medios) {
        await this.repo.crearMedioPago(pago.id, medio, client);
      }

      // 7. Aplicacion secuencial FIFO con remanente. `aplicado` lo calcula
      //    PostgreSQL con LEAST(saldo, remanente): ninguna cuota queda con
      //    saldo negativo y el remanente se agota antes de pasar a la
      //    siguiente cuota.
      const aplicaciones: AplicacionAbonoCuota[] = [];
      const cuotasSaldadas: number[] = [];
      let remanente = montoTotal;
      for (const cuota of cuotasFifo) {
        if (this.esCero(remanente)) {
          break;
        }
        const resultado = await this.repo.aplicarAbonoACuota(
          {
            mensualidadId: cuota.id,
            montoDisponible: remanente,
            fechaEfectiva,
            diaInicioMora: politicasFinancieras.diaInicioMora,
            porcentajeMora: politicasFinancieras.porcentajeMora,
            precisionDecimales: politicasFinancieras.precisionDecimales,
            estadoSaldada: politicasFinancieras.estadoCuotaSaldada,
          },
          client
        );
        if (!resultado) {
          // Inconsistencia tecnica real (la cuota cambio bajo la transaccion):
          // error tecnico, nunca estado de negocio.
          throw new Error(
            'Inconsistencia al aplicar el abono: la cuota del plan no estaba disponible en la transaccion'
          );
        }
        await this.repo.crearAplicacionPago(
          pago.id,
          resultado.id,
          resultado.monto_aplicado,
          client
        );
        aplicaciones.push({
          mensualidad_id: resultado.id,
          numero_cuota: resultado.numero_cuota,
          monto_aplicado: resultado.monto_aplicado,
          saldo_pendiente: resultado.saldo_pendiente,
          mora_aplicada: resultado.mora_aplicada,
          estado: resultado.estado,
        });
        if (resultado.estado === politicasFinancieras.estadoCuotaSaldada) {
          cuotasSaldadas.push(resultado.id);
        }
        remanente = resultado.remanente;
      }

      // 8. RN-SGPM-07 verificada dentro de la transaccion (exacta en PG).
      const igualdadExacta = await this.repo.verificarIgualdadExacta(
        pago.id,
        pago.monto_total,
        client
      );
      if (!igualdadExacta) {
        throw new AppError(
          'No se cumple la igualdad exacta entre el total del pago, sus medios y sus aplicaciones',
          500,
          'INTEGRITY_ERROR'
        );
      }

      // 9. Auditoria en la misma transaccion (el pago nunca queda sin ella).
      await this.repo.registrarAuditoria(
        {
          usuarioId,
          accion: 'pago_aplicar',
          entidad: 'pagos',
          entidadId: pago.id,
          detalle: {
            resultado: 'exito',
            pago_id: pago.id,
            matricula_id: matriculaId,
            monto_total: pago.monto_total,
            fecha_efectiva: fechaEfectiva,
            moneda: plan.moneda,
            medios: medios.map((medio) => ({
              tipo: medio.tipo,
              monto: medio.monto,
            })),
            aplicaciones: aplicaciones.map((aplicacion) => ({
              mensualidad_id: aplicacion.mensualidad_id,
              numero_cuota: aplicacion.numero_cuota,
              monto_aplicado: aplicacion.monto_aplicado,
              mora_aplicada: aplicacion.mora_aplicada,
              estado: aplicacion.estado,
            })),
            cuotas_saldadas: cuotasSaldadas,
            politicas_aplicadas: {
              porcentaje_mora: politicasFinancieras.porcentajeMora,
              dia_inicio_mora: politicasFinancieras.diaInicioMora,
              estado_cuota_saldada: politicasFinancieras.estadoCuotaSaldada,
            },
            ...(idempotenciaKey !== null
              ? { idempotency_key_hash: this.hashIdempotencyKey(idempotenciaKey) }
              : {}),
          },
        },
        client
      );

      await client.query('COMMIT');

      return {
        pago_id: pago.id,
        estudiante_id: pago.estudiante_id,
        matricula_id: matriculaId,
        monto_total: pago.monto_total,
        estado: pago.estado,
        fecha_efectiva: fechaEfectiva,
        idempotent_replay: false,
        aplicaciones,
        cuotas_saldadas: cuotasSaldadas,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * El motor implementa EXACTAMENTE la linea base DEC-20. Si la configuracion
   * resuelta se aparta de lo implementado aqui, se falla ruidoso (nunca se
   * aplica en silencio una politica distinta). La precision queda fija en 2
   * decimales porque el esquema vivo es NUMERIC(12,2): subirla exige migracion.
   */
  private verificarPoliticasImplementadas(): void {
    const politicas = politicasFinancieras;
    const desviaciones: string[] = [];
    if (politicas.ambitoFifo !== 'plan_de_la_matricula') {
      desviaciones.push(`ambitoFifo='${politicas.ambitoFifo}' (cruzar anios no tiene regla aprobada)`);
    }
    if (politicas.tratamientoExcedente !== 'rechazar') {
      desviaciones.push(`tratamientoExcedente='${politicas.tratamientoExcedente}'`);
    }
    if (politicas.modoAbonoParcial !== 'secuencial_con_remanente') {
      desviaciones.push(`modoAbonoParcial='${politicas.modoAbonoParcial}'`);
    }
    if (politicas.permitirSaldoNegativoEnCuota) {
      desviaciones.push('permitirSaldoNegativoEnCuota=true');
    }
    if (politicas.moraCapitalizable) {
      desviaciones.push('moraCapitalizable=true');
    }
    if (politicas.conversionMoneda) {
      desviaciones.push('conversionMoneda=true');
    }
    if (politicas.momentoRedondeo !== 'en_base_de_datos') {
      desviaciones.push(`momentoRedondeo='${politicas.momentoRedondeo}'`);
    }
    if (politicas.precisionDecimales !== 2) {
      desviaciones.push(
        `precisionDecimales=${politicas.precisionDecimales} (el esquema vigente es NUMERIC(12,2))`
      );
    }
    if (desviaciones.length > 0) {
      throw new ErrorPoliticaFinancieraInvalida(
        `El motor de aplicacion de abonos solo implementa la linea base DEC-20 y la configuracion se aparta: ${desviaciones.join('; ')}`
      );
    }
  }

  private validarMatriculaId(valor: number): number {
    if (!Number.isSafeInteger(valor) || valor <= 0) {
      throw new AppError('Matricula invalida', 400, 'BAD_REQUEST');
    }
    return valor;
  }

  /**
   * Medios validados como texto: tipo obligatorio (<=50 como la columna) e
   * importe > 0 en formato decimal exacto. Nunca se convierte a number.
   */
  private validarMedios(medios: MedioPagoInput[]): MedioPagoRow[] {
    if (!Array.isArray(medios) || medios.length === 0) {
      throw new AppError('El abono requiere al menos un medio de pago', 400, 'BAD_REQUEST');
    }
    return medios.map((medio) => {
      const tipo = typeof medio?.tipo === 'string' ? medio.tipo.trim() : '';
      if (tipo.length === 0) {
        throw new AppError('Tipo de medio de pago invalido', 400, 'BAD_REQUEST');
      }
      if (tipo.length > 50) {
        throw new AppError('Tipo de medio de pago demasiado largo', 400, 'BAD_REQUEST');
      }
      const monto = typeof medio?.monto === 'string' ? medio.monto.trim() : '';
      if (!PATRON_MONTO.test(monto) || PATRON_CERO.test(monto)) {
        throw new AppError('Monto del medio de pago invalido', 400, 'BAD_REQUEST');
      }
      const referencia =
        typeof medio?.referencia === 'string' && medio.referencia.length > 0
          ? medio.referencia
          : null;
      if (referencia !== null && referencia.length > 255) {
        throw new AppError('Referencia del medio de pago demasiado larga', 400, 'BAD_REQUEST');
      }
      return { tipo, monto, referencia };
    });
  }

  /**
   * Fecha efectiva obligatoria: la comparacion de mora NUNCA usa el reloj
   * del servidor. Se valida sobre texto + calendario real (sin zonas
   * horarias), igual que la validacion de fechas de matricula.service.
   */
  private validarFechaEfectiva(valor: string): string {
    const fecha = typeof valor === 'string' ? valor.trim() : '';
    if (!PATRON_FECHA.test(fecha)) {
      throw new AppError('Fecha efectiva invalida', 400, 'BAD_REQUEST');
    }
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));
    if (
      fechaUtc.getUTCFullYear() !== anio ||
      fechaUtc.getUTCMonth() !== mes - 1 ||
      fechaUtc.getUTCDate() !== dia
    ) {
      throw new AppError('Fecha efectiva invalida', 400, 'BAD_REQUEST');
    }
    return fecha;
  }

  private normalizarObservaciones(valor: string | null | undefined): string | null {
    if (typeof valor !== 'string' || valor.length === 0) {
      return null;
    }
    return valor;
  }

  private normalizarIdempotenciaKey(valor: string | null | undefined): string | null {
    if (typeof valor !== 'string') {
      return null;
    }
    const clave = valor.trim();
    if (clave.length === 0) {
      return null;
    }
    if (clave.length > 255) {
      throw new AppError('Clave de idempotencia demasiado larga', 400, 'BAD_REQUEST');
    }
    return clave;
  }

  /** Cero en texto: corta el bucle FIFO sin aritmetica en JavaScript. */
  private esCero(monto: string): boolean {
    return PATRON_CERO.test(monto);
  }

  /**
   * Actor que queda registrado en el pago y en la auditoria. Solo se
   * persiste cuando es un id de usuario positivo y seguro; ante un valor
   * fuera de rango se guarda NULL (nunca se inventa autor, patron de
   * matricula.service).
   */
  private actorDePago(actorId: number): number | null {
    return Number.isSafeInteger(actorId) && actorId > 0 ? actorId : null;
  }

  /**
   * Huella SHA-256 truncada de la clave de idempotencia. Nunca se guarda la
   * clave cruda en auditoria (patron Fase 5).
   */
  private hashIdempotencyKey(key: string): string {
    return hashToken(key).slice(0, 16);
  }
}

export const aplicacionPagosService = new AplicacionPagosService();
