import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { ReportesRepository } from '../repositories/reportes.repository';
import {
  AUTH_PERMISSIONS,
} from '../authorization/permissions';

/**
 * ============================================================================
 * REPORTES Y CONSULTAS (FASE 8) — SERVICIO DE SOLO LECTURA
 * ============================================================================
 *
 * Todas las cifras salen de registros almacenados (PM: "Los reportes deben
 * obtener sus cifras de los registros financieros oficiales"). No se recalcula
 * ningun importe: lo que se suma es lo que `pagos`, `pago_aplicaciones` y
 * `mensualidades` tienen guardado.
 *
 * Sin reloj implicito: la morosidad exige `fecha_corte` (como la mora del motor
 * exige `fecha_efectiva`), para que el reporte sea reproducible.
 *
 * Las operaciones anuladas y revertidas NUNCA se borran ni se ocultan: se
 * informan aparte para que el reporte refleje la operacion y su reversion
 * (RN-SGPM-07).
 */

/** ID entero seguro serial32 (misma forma que el resto del proyecto). */
const idSeguro = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/, 'ID invalido')])
  .transform((val) => (typeof val === 'string' ? Number(val) : val))
  .refine((n) => Number.isSafeInteger(n) && n > 0, { message: 'ID invalido' });

/** Fecha ISO estricta: sin rollover ni normalizacion de JavaScript Date. */
const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha invalida' })
  .refine((valor) => {
    const [y, m, d] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    return (
      fecha.getUTCFullYear() === y &&
      fecha.getUTCMonth() === m - 1 &&
      fecha.getUTCDate() === d
    );
  }, { message: 'Fecha invalida' });

/** Moneda: codigo de 3 letras o null (las filas legacy quedan null). */
const moneda = z.string().regex(/^[A-Za-z]{3}$/, 'Moneda invalida').optional();

const limiteConsulta = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/, 'Limite invalido')])
  .transform((val) => (typeof val === 'string' ? Number(val) : val))
  .pipe(z.number().int().positive().max(200));

const compensarConsulta = z
  .union([z.number().int().min(0), z.string().regex(/^(0|[1-9][0-9]*)$/, 'Compensar invalido')])
  .transform((val) => (typeof val === 'string' ? Number(val) : val))
  .pipe(z.number().int().min(0));

export interface FiltrosPeriodo {
  desde: string | null;
  hasta: string | null;
}

export class ReportesService {
  constructor(
    private readonly repo: ReportesRepository = new ReportesRepository()
  ) {}

  /** Valida y normaliza el rango de fechas de un reporte. */
  private rango(desde: unknown, hasta: unknown): FiltrosPeriodo {
    const parseado = z
      .object({ desde: fechaIso.optional().nullable(), hasta: fechaIso.optional().nullable() })
      .refine(
        (datos) =>
          !datos.desde || !datos.hasta || datos.desde <= datos.hasta,
        { message: 'El rango de fechas es invalido: desde debe ser <= hasta' }
      )
      .safeParse({ desde, hasta });

    if (!parseado.success) {
      throw new AppError('Rango de fechas invalido', 400, 'BAD_REQUEST');
    }
    return {
      desde: parseado.data.desde ?? null,
      hasta: parseado.data.hasta ?? null,
    };
  }

  private paginacion(limite: unknown, compensar: unknown): { limite: number; compensar: number } {
    const parseado = z
      .object({ limite: limiteConsulta.default(50), compensar: compensarConsulta.default(0) })
      .safeParse({ limite, compensar });
    if (!parseado.success) {
      throw new AppError('Paginacion invalida', 400, 'BAD_REQUEST');
    }
    return parseado.data;
  }

  /** Estudiantes con saldos pendientes (desde `saldo_pendiente` almacenado). */
  async estudiantesConSaldosPendientes(
    entrada: { moneda?: unknown; limite?: unknown; compensar?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const parseado = z
      .object({ moneda })
      .safeParse({ moneda: entrada.moneda });
    if (!parseado.success) {
      throw new AppError('Moneda invalida', 400, 'BAD_REQUEST');
    }
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.estudiantesConSaldosPendientes(
      { ...paginacion, moneda: parseado.data.moneda ?? null },
      cliente
    );
  }

  /**
   * Morosidad. `fechaCorte` es OBLIGATORIA: el reporte no usa el reloj del
   * servidor, de modo que la misma consulta da el mismo resultado siempre.
   */
  async cuotasMorosas(
    entrada: {
      fechaCorte: unknown;
      moneda?: unknown;
      limite?: unknown;
      compensar?: unknown;
    },
    cliente?: import('pg').PoolClient
  ) {
    const parseado = z
      .object({ fechaCorte: fechaIso, moneda })
      .safeParse({ fechaCorte: entrada.fechaCorte, moneda: entrada.moneda });
    if (!parseado.success) {
      throw new AppError(
        parseado.success === false && 'fechaCorte' in parseado.error.flatten().fieldErrors
          ? 'fecha_corte es obligatoria con formato YYYY-MM-DD'
          : 'Parametros de morosidad invalidos',
        400,
        'BAD_REQUEST'
      );
    }
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.cuotasMorosas({ ...paginacion, ...parseado.data }, cliente);
  }

  /** Recaudacion por dia, con las anuladas informadas aparte. */
  async recaudacionPorPeriodo(
    entrada: { desde?: unknown; hasta?: unknown; limite?: unknown; compensar?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const rango = this.rango(entrada.desde, entrada.hasta);
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.recaudacionPorPeriodo({ ...rango, ...paginacion }, cliente);
  }

  /** Movimientos por cajero. */
  async movimientosPorCajero(
    entrada: { desde?: unknown; hasta?: unknown; limite?: unknown; compensar?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const rango = this.rango(entrada.desde, entrada.hasta);
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.movimientosPorCajero({ ...rango, ...paginacion }, cliente);
  }

  /** Desglose por medio de pago. */
  async desglosePorMedio(
    entrada: { desde?: unknown; hasta?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const rango = this.rango(entrada.desde, entrada.hasta);
    return this.repo.desglosePorMedio(rango, cliente);
  }

  /** Operaciones anuladas o revertidas. */
  async operacionesAnuladas(
    entrada: { desde?: unknown; hasta?: unknown; limite?: unknown; compensar?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const rango = this.rango(entrada.desde, entrada.hasta);
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.operacionesAnuladas({ ...rango, ...paginacion }, cliente);
  }

  /** Pagos de un periodo. */
  async pagosPorPeriodo(
    entrada: { desde?: unknown; hasta?: unknown; limite?: unknown; compensar?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const rango = this.rango(entrada.desde, entrada.hasta);
    const paginacion = this.paginacion(entrada.limite, entrada.compensar);
    return this.repo.pagosPorPeriodo({ ...rango, ...paginacion }, cliente);
  }

  /** Estado de cuenta de un estudiante. */
  async estadoDeCuenta(
    entrada: { estudianteId: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const parseado = z.object({ estudianteId: idSeguro }).safeParse(entrada);
    if (!parseado.success) {
      throw new AppError('Identificador de estudiante invalido', 400, 'BAD_REQUEST');
    }
    const fila = await this.repo.estadoDeCuenta(parseado.data.estudianteId, cliente);
    if (!fila) {
      throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
    }
    return fila;
  }

  /** Matriculas registradas agrupadas por ano o por grado. */
  async matriculasRegistradas(
    entrada: { agrupacion?: unknown },
    cliente?: import('pg').PoolClient
  ) {
    const parseado = z
      .object({ agrupacion: z.enum(['anio', 'grado']).default('anio') })
      .safeParse(entrada);
    if (!parseado.success) {
      throw new AppError('Agrupacion invalida: use anio o grado', 400, 'BAD_REQUEST');
    }
    return this.repo.matriculasRegistradas(parseado.data.agrupacion, cliente);
  }
}

export const reportesService = new ReportesService();
export { AUTH_PERMISSIONS };
