import { AppError } from '../middleware/errorHandler';
import {
  ObligacionesRepository,
  CuotaPendienteProyeccion,
  CuotaProyeccion,
  EstadosPresentesProyeccion,
  ObligacionesRow,
  PagoProyeccion,
  PendientesRow,
  PlanProyeccion,
  HistorialRow,
  esIdSeguro32,
  proyectarDetalleCuotas,
  proyectarEstadosPresentes,
  proyectarPagos,
  proyectarPlan,
  proyectarPlanPendiente,
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
 *
 * Extension 6.B (mismo servicio, mismas disciplinas, SOLO LECTURA):
 *
 *   6. `proyectarPendientes`: cuotas cuyo estado ALMACENADO no es terminal y
 *      cuyo `saldo_pendiente` almacenado es mayor que cero. La condicion se
 *      deriva de lo guardado: no se recalcula mora, no se inventa vencimiento,
 *      no se normaliza nada. Los estados terminales son una lista EXPLICITA,
 *      ESTRECHA y documentada (`ESTADOS_TERMINALES_CUOTA`): solo `PAGADA`.
 *      Cualquier otro estado almacenado —incluido uno que esta proyeccion no
 *      reconoce— NO se trata como terminal (desconocido no equivale a cerrado)
 *      y se superficializa con su conteo en `estados_presentes` /
 *      `estados_no_reconocidos` en lugar de clasificarse en silencio.
 *
 *   7. `proyectarHistorial`: pagos registrados contra la matricula con sus
 *      medios y aplicaciones, importes como texto exacto y `fecha_pago`
 *      (TIMESTAMPTZ) proyectado en UTC explicito. Sin pagos, la lista es
 *      vacia explicita: no es error ni resumen inventado.
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

/**
 * Fecha-hora plana en UTC: `YYYY-MM-DD HH24:MI:SS`. La proyecta el
 * repositorio con `AT TIME ZONE 'UTC'` (ver decision 7 de la cabecera del
 * repositorio): esta forma es fija, sin zona embebida, y comparable
 * lexicograficamente en orden cronologico.
 */
const FECHA_HORA_ISO_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Estados almacenados de `mensualidades.estado` tratados como TERMINALES:
 * la cuota deja de contarse como pendiente aunque conserve saldo.
 *
 * Lista EXPLICITA y ESTRECHA a proposito. Solo `PAGADA`:
 * - es el estado terminal canonico de una cuota liquidada (el motor de pagos
 *   aun no existe: no se inventa mas vocabulario del que el proyecto tiene);
 * - dar de alta aqui un estado no reconocido haria desaparecer cuotas con
 *   saldo sin dejar rastro, que es exactamente lo que esta proyeccion debe
 *   evitar. Un estado desconocido NUNCA se promueve a terminal: se expone
 *   con su conteo en `estados_presentes`.
 *
 * La lista vacia (`[]`) dejaria pending cualquier cuota con saldo: la politica
 * la fija el dominio, no el repositorio.
 */
export const ESTADOS_TERMINALES_CUOTA: readonly string[] = ['PAGADA'];

/**
 * Estados almacenados NO terminales que esta proyeccion reconoce. Hoy el
 * unico que el proyecto escribe es `PENDIENTE` (default del esquema y alta de
 * cuotas en `matricula.service`). Reconocer un estado NO cambia la condicion
 * de pendiente (todo lo no terminal ya es candidato): solo afecta a
 * `estados_no_reconocidos`, la lista de aviso.
 */
export const ESTADOS_NO_TERMINALES_RECONOCIDOS: readonly string[] = ['PENDIENTE'];

/** Vocabulario almacenado que la proyeccion sabe nombrar. */
export const ESTADOS_CUOTA_RECONOCIDOS: readonly string[] = [
  ...ESTADOS_TERMINALES_CUOTA,
  ...ESTADOS_NO_TERMINALES_RECONOCIDOS,
];

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

/*
 * -------------------------------------------------------------------------
 * Proyeccion de PENDIENTES (6.B, solo lectura)
 * -------------------------------------------------------------------------
 *
 * La condicion de pendiente se deriva de datos ALMACENADOS:
 * `estado <> ALL(ESTADOS_TERMINALES_CUOTA)` AND `saldo_pendiente > 0`. No se
 * recalcula mora, no se compara contra `fecha_vencimiento`, no se normaliza
 * ningun importe. `plan: null` distingue "matricula sin plan" de "plan sin
 * cuotas pendientes" (lista vacia en ese caso); los dos son explicitos.
 */

/** La matricula no existe: no equivale a "nada pendiente" y no lleva detalle. */
export interface ProyeccionPendientesMatriculaInexistente {
  estado: 'MATRICULA_INEXISTENTE';
  matricula_id: number;
}

/** Pendientes proyectados: lista almacenada, puede estar vacia. */
export interface ProyeccionPendientesProyectadas {
  estado: 'PENDIENTES';
  matricula_id: number;
  plan: PlanProyeccion | null;
  pendientes: CuotaPendienteProyeccion[];
  cuotas_pendientes: number;
  /** Todos los estados almacenados del plan con su conteo (superficie). */
  estados_presentes: EstadosPresentesProyeccion[];
  /** Estados almacenados fuera del vocabulario reconocido (aviso, no error). */
  estados_no_reconocidos: string[];
}

/**
 * Los datos de las cuotas pendientes no son confiables (importe no numerico
 * —NaN, infinito— o fecha no ISO). Se conserva el detalle tal cual y no se
 * normaliza nada a cero ni se descarta la cuota problematica.
 */
export interface ProyeccionPendientesIntegridadInvalida {
  estado: 'INTEGRIDAD_INVALIDA';
  matricula_id: number;
  plan: PlanProyeccion | null;
  pendientes: CuotaPendienteProyeccion[];
  motivo: MotivoIntegridadInvalida;
}

/** Union discriminada: tres estados, sin negocio inventado. */
export type ProyeccionPendientes =
  | ProyeccionPendientesMatriculaInexistente
  | ProyeccionPendientesProyectadas
  | ProyeccionPendientesIntegridadInvalida;

/*
 * -------------------------------------------------------------------------
 * Proyeccion de HISTORIAL FINANCIERO (6.B, solo lectura)
 * -------------------------------------------------------------------------
 *
 * Pagos con `matricula_id` = la matricula consultada, con sus medios y
 * aplicaciones tal como estan guardados. `fecha_pago` (TIMESTAMPTZ) se
 * proyecta en UTC explicito: no hay zona horaria institucional configurada y
 * el resultado no depende del servidor ni del cliente. Sin pagos: lista vacia
 * explicita, no error ni resumen inventado.
 */

/** La matricula no existe: no equivale a "sin pagos" y no lleva lista. */
export interface ProyeccionHistorialMatriculaInexistente {
  estado: 'MATRICULA_INEXISTENTE';
  matricula_id: number;
}

/** Historial proyectado: lista de pagos (posiblemente vacia). */
export interface ProyeccionHistorialProyectado {
  estado: 'HISTORIAL';
  matricula_id: number;
  matricula_estado: string;
  pagos: PagoProyeccion[];
}

/**
 * Algun pago proyectado no es confiable (importe no numerico o fecha no
 * ISO). Se conservan los pagos tal cual, con el valor almacenado intacto.
 */
export interface ProyeccionHistorialIntegridadInvalida {
  estado: 'INTEGRIDAD_INVALIDA';
  matricula_id: number;
  pagos: PagoProyeccion[];
  motivo: MotivoIntegridadInvalida;
}

/** Union discriminada: tres estados, sin negocio inventado. */
export type ProyeccionHistorial =
  | ProyeccionHistorialMatriculaInexistente
  | ProyeccionHistorialProyectado
  | ProyeccionHistorialIntegridadInvalida;

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

function esFechaHoraIsoUtc(fecha: unknown): fecha is string {
  return typeof fecha === 'string' && FECHA_HORA_ISO_UTC.test(fecha);
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

  /**
   * Proyeccion interna de cuotas PENDIENTES de UNA matricula.
   *
   * - El id se valida como entero seguro serial32 ANTES de cualquier consulta.
   * - Se ejecuta UNA consulta parametrizada; la lista de estados terminales
   *   viaja como parametro ($2), nunca interpolada en el SQL.
   * - La condicion usa el estado y el saldo ALMACENADOS: no se recalcula
   *   mora ni se inventa vencimiento.
   * - Los errores tecnicos de base de datos se propagan sin convertirse en
   *   estado de negocio ni en lista vacia.
   */
  async proyectarPendientes(matriculaId: number): Promise<ProyeccionPendientes> {
    if (!esIdSeguro32(matriculaId)) {
      throw new AppError('Identificador de matricula invalido', 400, 'BAD_REQUEST');
    }

    const fila = await this.repo.proyectarPendientes(matriculaId, ESTADOS_TERMINALES_CUOTA);
    return this.clasificarPendientes(fila, matriculaId);
  }

  /**
   * Proyeccion interna del HISTORIAL FINANCIERO de UNA matricula.
   *
   * - El id se valida como entero seguro serial32 ANTES de cualquier consulta.
   * - Se ejecuta UNA consulta parametrizada (pagos + medios + aplicaciones en
   *   la misma fila: no hay N+1).
   * - Sin pagos la lista es vacia explicita; los errores tecnicos de base de
   *   datos se propagan tal cual.
   */
  async proyectarHistorial(matriculaId: number): Promise<ProyeccionHistorial> {
    if (!esIdSeguro32(matriculaId)) {
      throw new AppError('Identificador de matricula invalido', 400, 'BAD_REQUEST');
    }

    const fila = await this.repo.proyectarHistorial(matriculaId);
    return this.clasificarHistorial(fila, matriculaId);
  }

  private clasificarPendientes(
    fila: PendientesRow | null,
    matriculaId: number
  ): ProyeccionPendientes {
    if (fila === null) {
      // No existe: explicitamente distinto de "nada pendiente" y sin detalle.
      return { estado: 'MATRICULA_INEXISTENTE', matricula_id: matriculaId };
    }

    const plan = proyectarPlanPendiente(fila);

    const detalle = proyectarDetalleCuotas(fila.pendientes);
    if (detalle === null) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        plan,
        pendientes: [],
        motivo: 'DETALLE_NO_PROYECTABLE',
      };
    }

    const estadosPresentes = proyectarEstadosPresentes(fila.estados_presentes);
    if (estadosPresentes === null) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        plan,
        pendientes: detalle,
        motivo: 'DETALLE_NO_PROYECTABLE',
      };
    }

    // Integridad: se detecta el problema sin destruir el valor almacenado.
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
          pendientes: detalle,
          motivo: 'IMPORTE_NO_NUMERICO',
        };
      }
      if (!esFechaIso(cuota.fecha_vencimiento)) {
        return {
          estado: 'INTEGRIDAD_INVALIDA',
          matricula_id: matriculaId,
          plan,
          pendientes: detalle,
          motivo: 'FECHA_NO_ISO',
        };
      }
    }

    return {
      estado: 'PENDIENTES',
      matricula_id: matriculaId,
      plan,
      pendientes: detalle,
      cuotas_pendientes: fila.cuotas_pendientes,
      estados_presentes: estadosPresentes,
      estados_no_reconocidos: estadosPresentes
        .map((presente) => presente.estado)
        .filter(
          (estado, indice, todos) =>
            todos.indexOf(estado) === indice && !ESTADOS_CUOTA_RECONOCIDOS.includes(estado)
        ),
    };
  }

  private clasificarHistorial(
    fila: HistorialRow | null,
    matriculaId: number
  ): ProyeccionHistorial {
    if (fila === null) {
      // No existe: explicitamente distinto de "sin pagos" y sin lista.
      return { estado: 'MATRICULA_INEXISTENTE', matricula_id: matriculaId };
    }

    const pagos = proyectarPagos(fila.pagos);
    if (pagos === null) {
      return {
        estado: 'INTEGRIDAD_INVALIDA',
        matricula_id: matriculaId,
        pagos: [],
        motivo: 'DETALLE_NO_PROYECTABLE',
      };
    }

    // Integridad: se detecta el problema sin destruir el valor almacenado.
    for (const pago of pagos) {
      if (!esImporteExacto(pago.monto_total)) {
        return {
          estado: 'INTEGRIDAD_INVALIDA',
          matricula_id: matriculaId,
          pagos,
          motivo: 'IMPORTE_NO_NUMERICO',
        };
      }
      if (!esFechaHoraIsoUtc(pago.fecha_pago)) {
        return {
          estado: 'INTEGRIDAD_INVALIDA',
          matricula_id: matriculaId,
          pagos,
          motivo: 'FECHA_NO_ISO',
        };
      }
      for (const medio of pago.medios) {
        if (!esImporteExacto(medio.monto)) {
          return {
            estado: 'INTEGRIDAD_INVALIDA',
            matricula_id: matriculaId,
            pagos,
            motivo: 'IMPORTE_NO_NUMERICO',
          };
        }
      }
      for (const aplicacion of pago.aplicaciones) {
        if (!esImporteExacto(aplicacion.monto_aplicado)) {
          return {
            estado: 'INTEGRIDAD_INVALIDA',
            matricula_id: matriculaId,
            pagos,
            motivo: 'IMPORTE_NO_NUMERICO',
          };
        }
      }
    }

    return {
      estado: 'HISTORIAL',
      matricula_id: matriculaId,
      matricula_estado: fila.matricula_estado,
      pagos,
    };
  }
}
