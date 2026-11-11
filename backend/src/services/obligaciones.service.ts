import { AppError } from '../middleware/errorHandler';
import {
  ObligacionesRepository,
  CuotaProyeccion,
  ObligacionesRow,
  PlanProyeccion,
  esIdSeguro32,
  proyectarDetalleCuotas,
  proyectarPlan,
} from '../repositories/obligaciones.repository';

/**
 * Servicio de OBLIGACIONES (Fase 6.A): consulta interna, estricta y
 * exclusivamente lectora de obligaciones y saldos YA ALMACENADOS.
 *
 * Alcance aprobado (plan `sgpm-fase6-base-v1`): proyectar lo que existe. NO hay
 * pagos, abonos, liquidacion, FIFO, mora, descuentos, excedentes ni reversos
 * (eso requiere DEC-04/DEC-06, abiertas). NO hay endpoint, ruta, permiso ni
 * consumidor: la revision de seguridad dejo como condicion explicita que una
 * futura integracion exige autorizacion independiente.
 *
 * Los cinco estados se modelan como union discriminada para que un consumidor
 * no pueda confundirlos:
 *   - MATRICULA_INEXISTENTE: no es deuda cero y NO lleva resumen.
 *   - SIN_PLAN / SIN_CUOTAS: detalle vacio y `saldo_total` "0.00" proyectado.
 *   - CON_OBLIGACIONES: detalle real y agregado real del mismo snapshot.
 *   - INTEGRIDAD_INVALIDA: importes o fechas no confiables (NaN/infinito incluidos),
 *     sin resumen y sin normalizar nada a cero.
 */

/** Saldo total proyectado cuando no hay nada que sumar (no es dato inventado). */
export const SALDO_CERO_PROYECTADO = '0.00';

/**
 * Forma exacta de un NUMERICO valido devuelto por PostgreSQL como texto.
 * Excluye a proposito `NaN`, `Infinity` y notacion cientifica.
 */
const NUMERICO_EXACTO = /^-?\d+(?:\.\d+)?$/;

/** Fecha plana ISO: `YYYY-MM-DD`. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Motivos tecnicos por los que una proyeccion no es confiable. */
export type MotivoIntegridadInvalida =
  | 'IMPORTE_NO_NUMERICO'
  | 'FECHA_NO_ISO'
  | 'DETALLE_NO_PROYECTABLE';

/**
 * Resumen del saldo proyectado. `saldo_total` es texto NUMERICO exacto y
 * `tiene_saldo_positivo` compara el saldo TOTAL exacto contra cero (no "alguna
 * cuota positiva", no vencimiento, no mora).
 */
export interface ResumenObligaciones {
  saldo_total: string;
  tiene_saldo_positivo: boolean;
  cuotas_contadas: number;
  moneda: string | null;
}

/** La matricula no existe: no equivale a deuda cero y no incluye resumen. */
export interface ProyeccionMatriculaInexistente {
  estado: 'MATRICULA_INEXISTENTE';
  matricula_id: number;
}

/** La matricula existe pero no tiene plan de pago almacenado. */
export interface ProyeccionSinPlan {
  estado: 'SIN_PLAN';
  matricula_id: number;
  plan: null;
  detalle: CuotaProyeccion[];
  resumen: ResumenObligaciones;
}

/** La matricula tiene plan pero el plan no tiene cuotas almacenadas. */
export interface ProyeccionSinCuotas {
  estado: 'SIN_CUOTAS';
  matricula_id: number;
  plan: PlanProyeccion;
  detalle: CuotaProyeccion[];
  resumen: ResumenObligaciones;
}

/** Hay cuotas almacenadas: detalle real y agregado real. */
export interface ProyeccionConObligaciones {
  estado: 'CON_OBLIGACIONES';
  matricula_id: number;
  plan: PlanProyeccion;
  detalle: CuotaProyeccion[];
  resumen: ResumenObligaciones;
}

/**
 * Los datos almacenados no son confiables (importe no numerico —NaN, infinito—
 * o fecha no ISO). Se conserva el detalle tal cual, con el valor almacenado
 * intacto, y `resumen` es `null`: nunca se normaliza a cero.
 */
export interface ProyeccionIntegridadInvalida {
  estado: 'INTEGRIDAD_INVALIDA';
  matricula_id: number;
  plan: PlanProyeccion | null;
  detalle: CuotaProyeccion[];
  resumen: null;
  motivo: MotivoIntegridadInvalida;
}

/** Union discriminada: los cinco estados del plan aprobado. */
export type ProyeccionObligaciones =
  | ProyeccionMatriculaInexistente
  | ProyeccionSinPlan
  | ProyeccionSinCuotas
  | ProyeccionConObligaciones
  | ProyeccionIntegridadInvalida;

/**
 * `true` solo si el saldo total EXACTO es mayor que cero.
 *
 * Comparacion decimal pura sobre cadenas: sin `Number()`, sin `parseFloat`, sin
 * aritmetica de punto flotante. La cadena debe venir en forma NUMERICA valida
 * (lo garantiza `esImporteExacto`); si no, no se afirma positividad.
 */
export function esPositivoExacto(monto: string): boolean {
  if (!NUMERICO_EXACTO.test(monto)) return false;
  const negativo = monto.startsWith('-');
  const magnitud = monto.replace('-', '').replace('.', '').replace(/^0+/, '');
  return magnitud.length > 0 && !negativo;
}

function esImporteExacto(monto: unknown): monto is string {
  return typeof monto === 'string' && NUMERICO_EXACTO.test(monto);
}

function esFechaIso(fecha: unknown): fecha is string {
  return typeof fecha === 'string' && FECHA_ISO.test(fecha);
}

export class ObligacionesService {
  constructor(
    private readonly repo: ObligacionesRepository = new ObligacionesRepository()
  ) {}

  /**
   * Proyeccion interna de obligaciones y saldos de UNA matricula.
   *
   * - El id se valida como entero seguro serial32 ANTES de cualquier consulta.
   * - Se ejecuta UNA consulta parametrizada (detalle + agregado coherentes).
   * - Los errores tecnicos de base de datos se propagan sin convertirse en
   *   estado de negocio ni en saldo cero, y no se registran datos sensibles.
   */
  async proyectarObligaciones(matriculaId: number): Promise<ProyeccionObligaciones> {
    if (!esIdSeguro32(matriculaId)) {
      throw new AppError('Identificador de matricula invalido', 400, 'BAD_REQUEST');
    }

    const fila = await this.repo.proyectarObligaciones(matriculaId);
    return this.clasificar(fila, matriculaId);
  }

  private clasificar(fila: ObligacionesRow | null, matriculaId: number): ProyeccionObligaciones {
    if (fila === null) {
      // No existe: explícitamente distinto de una deuda de cero y sin resumen.
      return { estado: 'MATRICULA_INEXISTENTE', matricula_id: matriculaId };
    }

    const plan = proyectarPlan(fila);
    const detalle = proyectarDetalleCuotas(fila.cuotas);

    // Integridad: se detecta el problema sin destruir el valor almacenado.
    if (detalle === null) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        plan,
        detalle: [],
        resumen: null,
        motivo: 'DETALLE_NO_PROYECTABLE',
      };
    }

    if (!esImporteExacto(fila.saldo_total)) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        plan,
        detalle,
        resumen: null,
        motivo: 'IMPORTE_NO_NUMERICO',
      };
    }

    if (plan !== null && !esImporteExacto(plan.monto_cuota)) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        plan,
        detalle,
        resumen: null,
        motivo: 'IMPORTE_NO_NUMERICO',
      };
    }

    for (const cuota of detalle) {
      if (
        !esImporteExacto(cuota.monto_original) ||
        !esImporteExacto(cuota.monto_pagado) ||
        !esImporteExacto(cuota.saldo_pendiente) ||
        !esImporteExacto(cuota.mora_aplicada)
      ) {
        return {
          estado: 'INTEGRIDAD_INVALIDA',
          matricula_id: matriculaId,
          plan,
          detalle,
          resumen: null,
          motivo: 'IMPORTE_NO_NUMERICO',
        };
      }
      if (!esFechaIso(cuota.fecha_vencimiento)) {
        return {
          estado: 'INTEGRIDAD_INVALIDA',
          matricula_id: matriculaId,
          plan,
          detalle,
          resumen: null,
          motivo: 'FECHA_NO_ISO',
        };
      }
    }

    if (plan === null) {
      return {
        estado: 'SIN_PLAN',
        matricula_id: matriculaId,
        plan: null,
        detalle: [],
        resumen: this.resumenVacio(null),
      };
    }

    if (detalle.length === 0) {
      return {
        estado: 'SIN_CUOTAS',
        matricula_id: matriculaId,
        plan,
        detalle: [],
        resumen: this.resumenVacio(plan.moneda),
      };
    }

    return {
      estado: 'CON_OBLIGACIONES',
      matricula_id: matriculaId,
      plan,
      detalle,
      resumen: {
        saldo_total: fila.saldo_total,
        tiene_saldo_positivo: esPositivoExacto(fila.saldo_total),
        cuotas_contadas: fila.cuotas_contadas,
        moneda: plan.moneda,
      },
    };
  }

  /**
   * Resumen de los estados sin cuotas: saldo total "0.00" proyectado
   * explicitamente (no es deuda conciliada ni liquidada) y sin positividad.
   */
  private resumenVacio(moneda: string | null): ResumenObligaciones {
    return {
      saldo_total: SALDO_CERO_PROYECTADO,
      tiene_saldo_positivo: false,
      cuotas_contadas: 0,
      moneda,
    };
  }
}
