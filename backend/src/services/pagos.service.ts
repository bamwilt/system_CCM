/**
 * ============================================================================
 * SERVICIO DE PAGOS Y COMPROBANTES (FASE 7.A)
 * ============================================================================
 *
 * Orquesta el proceso de cobro HTTP consumiendo el motor de la FASE 6.B
 * (`aplicacion-pagos.service`) SIN reescribir ni duplicar su logica financiera.
 *
 * ESTRUCTURA TRANSACCIONAL (decision documentada, no accidental)
 * --------------------------------------------------------------
 * El motor de 6.B gestiona SU PROPIA transaccion (`BEGIN` -> advisory lock
 * 4315003 -> ... -> `COMMIT`, con su propio `PoolClient`) y su firma publica
 * no acepta un cliente externo. Anidar una transaccion de ruta alrededor de
 * esa llamada con EL MISMO advisory key muere: el motor esperaria el lock que
 * la transaccion externa retiene mientras la ruta espera su respuesta
 * (bloqueo mutuo, sin deteccion por PostgreSQL). La alternativa —volver a
 * escribir la FIFO/mora/aplicacion en este archivo— esta prohibida por el
 * plan. Por tanto:
 *
 *   1. La RUTA revalida sesion y permisos en su propia transaccion con el
 *      advisory lock de casa (`pg_advisory_xact_lock(4315003)` ->
 *      `getCurrentAuthContext` -> comprobacion de `pagos:manage` ->
 *      `assertActiveSession`) y la CIERRA antes de invocar el motor.
 *   2. EL MOTOR ejecuta el registro del pago en UNA unica transaccion atomica
 *      (cabecera, medios, aplicaciones, cuotas, verificacion RN-SGPM-07 y
 *      auditoria entran juntos o no entra nada) bajo el mismo advisory lock.
 *   3. La EMISION DEL COMPROBANTE ocurre en una transaccion propia,
 *      posterior, tambien bajo el advisory lock y con revalidacion. No es
 *      parte de la mutacion financiera: provocaria reescribir el motor. Su
 *      fracasso deja el pago registrado y se responde 500 con un mensaje que
 *      lo dice; un reintento con la MISMA clave de idempotencia reproduce el
 *      pago (no lo duplica) y reintenta la emision.
 *
 * El comprobante como DATO
 * ------------------------
 * `GET /api/pagos/:id/comprobante` es ESTRICTAMENTE de lectura: solo `SELECT`.
 * No asigna numero (el numero unico lo asigna el trigger
 * `fn_comprobantes_asignar_numero()` al EMITIR), no escribe y no altera saldo.
 * Si el pago aun no tiene comprobante emitido se devuelve una vista previa
 * marcada `emitido: false` con `numero_comprobante: null`: inventar un
 * identificador exigiria una escritura, y una lectura nunca escribe.
 */

import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';
import { esIdSeguro32 } from '../repositories/obligaciones.repository';
import {
  ComprobantesRepository,
  ComprobanteRow,
  FiltrosBusquedaPagos,
  PagoDetalleRow,
} from '../repositories/comprobantes.repository';

/** Reexport para que la ruta no dependa del repositorio directamente. */
export type { FiltrosBusquedaPagos } from '../repositories/comprobantes.repository';
import { aplicacionPagosService } from './aplicacion-pagos.service';
import {
  AUTH_PERMISSIONS,
  assertActiveSession,
  getCurrentAuthContext,
} from '../authorization/permissions';

/** Advisory lock global del proyecto (mismo valor que el resto de servicios). */
const ADVISORY_LOCK_KEY = 4315003;

/** Unico estado de pago que admite reversion (el motor solo crea COMPLETADO). */
const ESTADO_PAGO_REVERTIBLE = 'COMPLETADO';

/**
 * ID positivo seguro (numero o string decimal estricto). Misma forma que
 * `positiveId` de `matricula.schema.ts`: no usa `parseInt` (evita que '1abc'
 * se convierta en 1) y exige entero seguro positivo.
 */
const positiveId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/, 'ID invalido')])
  .transform((val) => (typeof val === 'string' ? Number(val) : val))
  .refine((n) => Number.isSafeInteger(n) && n > 0, { message: 'ID invalido' });

/** Fecha estricta YYYY-MM-DD con calendario real (sin rollover de JS `Date`). */
const fechaEstricta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha invalida' })
  .refine((val) => {
    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, { message: 'Fecha invalida' });

/**
 * Importe exacto en TEXTO (nunca number: un numero en JSON pierde la
 * representacion exacta y la politica exige texto exacto, DEC-20).
 * Sin signo, maximo 12 digitos enteros y 2 decimales (NUMERIC(12,2)).
 * El CERO se rechaza por refinado sobre la propia cadena, sin convertir a
 * numero: un abono de importe cero no es una operacion de cobro.
 */
const PATRON_MONTO = /^\d{1,12}(?:\.\d{1,2})?$/;
const PATRON_CERO = /^0+(?:\.0+)?$/;

const montoExacto = z
  .string()
  .regex(PATRON_MONTO, {
    message:
      "monto: se esperaba un decimal exacto en texto (p. ej. '150' o '150.50'), sin signo y sin notacion cientifica",
  })
  .refine((valor) => !PATRON_CERO.test(valor), {
    message: 'monto: el importe debe ser mayor que cero',
  });

/** Clave de idempotencia opcional (misma forma que `matricula.schema.ts`). */
const idempotencyKey = z
  .string()
  .trim()
  .min(1, 'idempotency_key no puede estar vacia')
  .max(255, 'idempotency_key admite maximo 255 caracteres');

/**
 * Cuerpo de `POST /api/pagos` (objeto ESTRICTO: campo desconocido -> 400).
 *
 * NO existe selector de cuotas a proposito. El motor de 6.B define su ambito
 * como el plan completo de la matricula con aplicacion FIFO por vencimiento
 * (DEC-20); elegir cuotas concretas exigiria reescribir esa logica financiera,
 * que el plan prohibe. La seleccion aprobada es `matricula_id`.
 *
 * Tampoco se acepta un `monto_total` del cliente: el total lo deriva el motor
 * sumando los medios en PostgreSQL (aritmetica NUMERIC exacta) y lo verifica
 * con RN-SGPM-07; un total declarado por el cliente podria discrepar de sus
 * medios y no anadiria informacion.
 */
export const registrarPagoSchema = z
  .object({
    matricula_id: positiveId,
    /** Fecha efectiva obligatoria: la mora NUNCA usa el reloj del servidor. */
    fecha_efectiva: fechaEstricta,
    medios: z
      .array(
        z
          .object({
            tipo: z.string().trim().min(1, 'tipo de medio de pago invalido').max(50),
            monto: montoExacto,
            referencia: z.string().trim().min(1).max(255).optional().nullable(),
          })
          .strict()
      )
      .min(1, 'El abono requiere al menos un medio de pago')
      .max(20, 'Maximo 20 medios de pago por operacion'),
    observaciones: z.string().trim().max(1000).optional().nullable(),
    idempotency_key: idempotencyKey.optional(),
  })
  .strict();

/** Cuerpo de `POST /api/pagos/:id/reversar` (objeto ESTRICTO). */
export const reversarPagoSchema = z
  .object({
    /** Obligatorio y con contenido: DEC-08 exige motivo registrado. */
    motivo: z
      .string()
      .trim()
      .min(1, 'motivo es obligatorio para reversar una operacion')
      .max(1000, 'motivo admite maximo 1000 caracteres'),
  })
  .strict();

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
export type ReversarPagoInput = z.infer<typeof reversarPagoSchema>;

/** Aplicacion registrada sobre una cuota (importes como texto exacto). */
export interface AplicacionPagoDto {
  mensualidad_id: number;
  numero_cuota: number;
  monto_aplicado: string;
  saldo_pendiente: string;
  mora_aplicada: string;
  estado: string;
}

/** El comprobante como DATO (identificador unico, importes exactos, estado). */
export interface ComprobanteDato {
  /** true solo si hay una fila almacenada en `comprobantes`. */
  emitido: boolean;
  /**
   * Identificador unico del comprobante (`CMP-AAAA-NNNNNN`), asignado por el
   * trigger de 009 al emitir. `null` en la vista previa: una lectura nunca
   * asigna numeros.
   */
  numero_comprobante: string | null;
  estado: string;
  anio: number | null;
  fecha_emision: string | null;
  pago: {
    id: number;
    fecha: string;
    estado: string;
  };
  monto_total: string;
  moneda: string | null;
  estudiante: {
    id: number;
    nombre: string;
  };
  matricula: {
    id: number | null;
    grado: string | null;
    anio_lectivo: number | null;
  };
  usuario_id: number | null;
  observaciones: string | null;
}

/** Detalle de un pago con medios y aplicaciones (texto exacto). */
export interface PagoDetalleDto {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: string;
  estado: string;
  usuario_id: number | null;
  observaciones: string | null;
  creado_en: string;
  /** Referencia de la operacion que reversa este pago (null si no fue revertido). */
  reversion_pago_id: number | null;
  revertido_motivo: string | null;
  revertido_en: string | null;
  medios: PagoDetalleRow['medios'];
  aplicaciones: PagoDetalleRow['aplicaciones'];
}

/** Resultado del registro de un pago. */
export interface RegistrarPagoResultado {
  pago: {
    id: number;
    estudiante_id: number;
    matricula_id: number;
    monto_total: string;
    estado: string;
    fecha_pago: string;
    fecha_efectiva: string;
    observaciones: string | null;
  };
  medios: Array<{ tipo: string; monto: string; referencia: string | null }>;
  aplicaciones: AplicacionPagoDto[];
  cuotas_saldadas: number[];
  comprobante: ComprobanteDato;
  idempotent_replay: boolean;
}

/** Resultado de la reversion compensatoria. */
export interface ReversionResultado {
  pago_original: {
    id: number;
    estado: string;
    monto_total: string;
    fecha_pago: string;
    reversion_pago_id: number | null;
    revertido_motivo: string | null;
    revertido_en: string | null;
  };
  operacion_inversa: {
    id: number;
    estudiante_id: number;
    matricula_id: number | null;
    monto_total: string;
    fecha_pago: string;
    observaciones: string | null;
  };
}

export class PagosService {
  constructor(
    private readonly repo: ComprobantesRepository = new ComprobantesRepository()
  ) {}

  /**
   * Registra un pago consumiendo el motor de 6.B (una unica transaccion
   * atomica gestionada por el motor) y emite su comprobante.
   *
   * El actor llega YA revalidado por la ruta (sesion activa + `pagos:manage`);
   * el motor lo persiste como autor del pago y de su auditoria.
   */
  async registrarPago(
    datos: RegistrarPagoInput,
    actorId: number,
    sessionTokenHash: string,
    clienteExterno?: PoolClient
  ): Promise<RegistrarPagoResultado> {
    const aplicacion = await aplicacionPagosService.aplicarAbono(
      {
        matricula_id: datos.matricula_id,
        medios: datos.medios.map((medio) => ({
          tipo: medio.tipo,
          monto: medio.monto,
          referencia: medio.referencia ?? null,
        })),
        fecha_efectiva: datos.fecha_efectiva,
        observaciones: datos.observaciones ?? null,
        idempotencia_key: datos.idempotency_key ?? null,
      },
      actorId,
      clienteExterno
    );

    const comprobante = await this.emitirComprobante(
      aplicacion.pago_id,
      actorId,
      sessionTokenHash,
      clienteExterno
    );

    return {
      pago: {
        id: aplicacion.pago_id,
        estudiante_id: aplicacion.estudiante_id,
        matricula_id: aplicacion.matricula_id,
        monto_total: aplicacion.monto_total,
        estado: aplicacion.estado,
        // Copia fiel de `pagos.fecha_pago` guardada en el comprobante emitido.
        fecha_pago: comprobante.pago.fecha,
        fecha_efectiva: aplicacion.fecha_efectiva,
        observaciones: datos.observaciones ?? null,
      },
      medios: datos.medios.map((medio) => ({
        tipo: medio.tipo,
        monto: medio.monto,
        referencia: medio.referencia ?? null,
      })),
      aplicaciones: aplicacion.aplicaciones,
      cuotas_saldadas: aplicacion.cuotas_saldadas,
      comprobante,
      idempotent_replay: aplicacion.idempotent_replay,
    };
  }

  /**
   * EMISION DEL COMPROBANTE (transaccion propia, bajo el advisory lock).
   *
   * - Si el pago ya tiene comprobante `comprobantes.pago_id` es UNIQUE, se
   *   devuelve el almacenado: el contador correlativo NO se incrementa y no se
   *   emite nada nuevo (caso del replay idempotente).
   * - La escritura toca unicamente `comprobantes`, la fila del correlativo del
   *   ano (trigger) y `auditoria`: NUNCA `mensualidades`, `pagos` ni
   *   `pago_aplicaciones`. Emitir un comprobante no altera ningun saldo.
   */
  private async emitirComprobante(
    pagoId: number,
    actorId: number,
    sessionTokenHash: string,
    clienteExterno?: PoolClient
  ): Promise<ComprobanteDato> {
    const usuarioId = this.actorDePago(actorId);
    // Transaccion prestada desde la ruta: el comprobante se emite DENTRO de la
    // misma transaccion atomica que registra el pago (PM: "una operacion de
    // pago debe ejecutarse de forma atomica"). Si no se presta ninguna, el
    // metodo abre la suya como antes.
    const transaccionPrestada =
      clienteExterno !== undefined && clienteExterno !== null;
    const client: PoolClient = transaccionPrestada
      ? (clienteExterno as PoolClient)
      : await getPool().connect();
    try {
      if (!transaccionPrestada) {
        await client.query('BEGIN');
      }
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(actorId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.PAGOS_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }
      await assertActiveSession(client, sessionTokenHash, actorId);

      const previo = await this.repo.obtenerComprobanteDePago(pagoId, client);
      if (previo) {
        await this.repo.registrarAuditoria(
          {
            usuarioId,
            accion: 'pago_comprobante_emitir',
            entidad: 'pagos',
            entidadId: pagoId,
            detalle: {
              resultado: 'ya_emitido',
              pago_id: pagoId,
              numero_comprobante: previo.numero_comprobante,
              monto_total: previo.monto_total,
            },
          },
          client
        );
        if (!transaccionPrestada) { await client.query('COMMIT'); }
        return this.proyectarComprobante(previo);
      }

      const emitido = await this.repo.insertarComprobante({ pagoId, usuarioId }, client);
      if (!emitido) {
        // El INSERT ... SELECT no encontro el pago: incoherencia real (el pago
        // se acaba de crear en otra transaccion del motor). Error tecnico.
        throw new AppError(
          'El pago registrado no existe para emitir su comprobante',
          500,
          'INTEGRITY_ERROR'
        );
      }

      await this.repo.registrarAuditoria(
        {
          usuarioId,
          accion: 'pago_comprobante_emitir',
          entidad: 'pagos',
          entidadId: pagoId,
          detalle: {
            resultado: 'exito',
            pago_id: pagoId,
            numero_comprobante: emitido.numero_comprobante,
            monto_total: emitido.monto_total,
            moneda: emitido.moneda,
          },
        },
        client
      );

      if (!transaccionPrestada) { await client.query('COMMIT'); }
      return this.proyectarComprobante(emitido);
    } catch (error) {
      // Con transaccion prestada el ROLLBACK es de la ruta: aqui solo se
      // propagqa el error para que ella revierta TODO (pago incluido).
      if (!transaccionPrestada) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          const sanitizado = redactError(rollbackError);
          console.error(
            `Rollback de emision de comprobante fallido (${sanitizado.name}); la transaccion pudo quedar abierta.`
          );
        }
      }
      throw error;
    } finally {
      if (!transaccionPrestada) {
        client.release();
      }
    }
  }

  /** Busqueda paginada de operaciones (solo lectura). */
  async buscarPagos(
    filtros: FiltrosBusquedaPagos
  ): Promise<{
    pagos: Array<{
      id: number;
      estudiante_id: number;
      matricula_id: number | null;
      monto_total: string;
      fecha_pago: string;
      estado: string;
      reversion_pago_id: number | null;
      creado_en: string;
    }>;
    total: number;
    limite: number;
    compensar: number;
  }> {
    const { filas, total } = await this.repo.buscarPagos(filtros);
    return {
      pagos: filas.map((fila) => ({
        id: fila.id,
        estudiante_id: fila.estudiante_id,
        matricula_id: fila.matricula_id,
        monto_total: fila.monto_total,
        fecha_pago: fila.fecha_pago,
        estado: fila.estado,
        reversion_pago_id: fila.reversion_pago_id,
        creado_en: fila.creado_en,
      })),
      total,
      limite: filtros.limite,
      compensar: filtros.compensar,
    };
  }

  /**
   * Detalle de un pago con medios y aplicaciones. Todo importe cruza la
   * frontera como TEXTO exacto (`::text` de NUMERIC en PostgreSQL).
   */
  async obtenerDetalle(pagoId: number): Promise<PagoDetalleDto | null> {
    if (!esIdSeguro32(pagoId)) {
      throw new AppError('Identificador de pago invalido', 400, 'BAD_REQUEST');
    }
    const fila = await this.repo.obtenerDetallePago(pagoId);
    return fila === null ? null : this.proyectarDetalle(fila);
  }

  /**
   * COMPROBANTE COMO DATO, ESTRICTAMENTE DE LECTURA.
   *
   * Solo ejecuta `SELECT`. No asigna numero, no escribe, no audita y no toca
   * ningun saldo: si el pago no tiene comprobante emitido devuelve la vista
   * previa (`emitido: false`) en lugar de emitir uno.
   */
  async obtenerComprobante(pagoId: number): Promise<ComprobanteDato | null> {
    if (!esIdSeguro32(pagoId)) {
      throw new AppError('Identificador de pago invalido', 400, 'BAD_REQUEST');
    }
    const fila = await this.repo.obtenerComprobanteDePago(pagoId);
    if (fila) {
      return this.proyectarComprobante(fila);
    }
    const previa = await this.repo.obtenerVistaPreviaComprobante(pagoId);
    if (!previa) {
      return null;
    }
    return {
      emitido: false,
      numero_comprobante: null,
      estado: 'SIN_EMITIR',
      anio: null,
      fecha_emision: null,
      pago: {
        id: previa.pago_id,
        fecha: previa.pago_fecha,
        estado: previa.pago_estado,
      },
      monto_total: previa.monto_total,
      moneda: previa.moneda,
      estudiante: {
        id: previa.estudiante_id,
        nombre: previa.estudiante_nombre,
      },
      matricula: {
        id: previa.matricula_id,
        grado: previa.grado_nombre,
        anio_lectivo: previa.anio_lectivo,
      },
      usuario_id: null,
      observaciones: null,
    };
  }

  /**
   * REVERSION COMPENSATORIA (DEC-08) dentro de la transaccion que abre la
   * ruta (mismo `PoolClient`, bajo el advisory lock del proyecto).
   *
   * 1. Rechaza (404) un pago inexistente.
   * 2. Rechaza (409) una operacion que no sea `COMPLETADO` o que ya tenga
   *    reversion registrada: nunca se reabre un estado final.
   * 3. Crea la operacion inversa (fila nueva, `estado='ANULADO'`, mismo
   *    importe copiado como texto exacto, motivo y actor).
   * 4. Marca el pago original con su estado final `REVERTIDO`, la referencia
   *    de la operacion que lo reversa, el motivo, el actor y la fecha.
   *    SOLO se tocan columnas de reversion: importe, fecha de pago,
   *    estudiante y clave de idempotencia no se reescriben. Nada se borra.
   * 5. Audita en la misma transaccion.
   */
  async reversarPago(
    pagoId: number,
    motivo: string,
    client: PoolClient,
    actorId: number
  ): Promise<ReversionResultado> {
    if (!esIdSeguro32(pagoId)) {
      throw new AppError('Identificador de pago invalido', 400, 'BAD_REQUEST');
    }
    const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
    if (motivoLimpio.length === 0) {
      throw new AppError('motivo es obligatorio para reversar una operacion', 400, 'BAD_REQUEST');
    }

    const pago = await this.repo.obtenerPagoParaReversion(pagoId, client);
    if (!pago) {
      throw new AppError('Pago no encontrado', 404, 'NOT_FOUND');
    }
    if (pago.estado !== ESTADO_PAGO_REVERTIBLE || pago.reversion_pago_id !== null) {
      throw new AppError(
        'El pago no admite una nueva reversion',
        409,
        'CONFLICT'
      );
    }

    const usuarioId = this.actorDePago(actorId);

    const reversa = await this.repo.crearOperacionReversa(
      {
        estudianteId: pago.estudiante_id,
        matriculaId: pago.matricula_id,
        montoTotal: pago.monto_total,
        usuarioId,
        motivo: motivoLimpio,
      },
      client
    );

    const marcado = await this.repo.marcarPagoRevertido(
      {
        pagoId,
        reversionPagoId: reversa.id,
        motivo: motivoLimpio,
        usuarioId,
      },
      client
    );
    if (!marcado) {
      // Bajo el advisory lock no deberia ocurrir: otra escritura cerro el
      // estado final entre medias. Se rechaza sin filtrar detalle.
      throw new AppError('El pago no admite una nueva reversion', 409, 'CONFLICT');
    }

    await this.repo.registrarAuditoria(
      {
        usuarioId,
        accion: 'pago_reversar',
        entidad: 'pagos',
        entidadId: pagoId,
        detalle: {
          resultado: 'exito',
          pago_id: pagoId,
          reversion_pago_id: reversa.id,
          monto_total: pago.monto_total,
          motivo: motivoLimpio,
        },
      },
      client
    );

    return {
      pago_original: {
        id: marcado.id,
        estado: marcado.estado,
        monto_total: marcado.monto_total,
        fecha_pago: marcado.fecha_pago,
        reversion_pago_id: marcado.reversion_pago_id,
        revertido_motivo: marcado.revertido_motivo,
        revertido_en: marcado.revertido_en,
      },
      operacion_inversa: {
        id: reversa.id,
        estudiante_id: reversa.estudiante_id,
        matricula_id: reversa.matricula_id,
        monto_total: reversa.monto_total,
        fecha_pago: reversa.fecha_pago,
        observaciones: motivoLimpio,
      },
    };
  }

  /** Proyeccion del comprobante almacenado (identificador unico incluido). */
  private proyectarComprobante(fila: ComprobanteRow): ComprobanteDato {
    return {
      emitido: true,
      numero_comprobante: fila.numero_comprobante,
      estado: fila.estado,
      anio: fila.anio,
      fecha_emision: fila.fecha_emision,
      pago: {
        id: fila.pago_id,
        fecha: fila.pago_fecha,
        estado: fila.pago_estado,
      },
      monto_total: fila.monto_total,
      moneda: fila.moneda,
      estudiante: {
        id: fila.estudiante_id,
        nombre: fila.estudiante_nombre,
      },
      matricula: {
        id: fila.matricula_id,
        grado: fila.grado_nombre,
        anio_lectivo: fila.anio_lectivo,
      },
      usuario_id: fila.usuario_id,
      observaciones: fila.observaciones,
    };
  }

  private proyectarDetalle(fila: PagoDetalleRow): PagoDetalleDto {
    return {
      id: fila.id,
      estudiante_id: fila.estudiante_id,
      matricula_id: fila.matricula_id,
      monto_total: fila.monto_total,
      fecha_pago: fila.fecha_pago,
      estado: fila.estado,
      usuario_id: fila.usuario_id,
      observaciones: fila.observaciones,
      creado_en: fila.creado_en,
      reversion_pago_id: fila.reversion_pago_id,
      revertido_motivo: fila.revertido_motivo,
      revertido_en: fila.revertido_en,
      medios: fila.medios,
      aplicaciones: fila.aplicaciones,
    };
  }

  /**
   * Actor registrado. Solo se persiste cuando es un id de usuario positivo y
   * seguro; ante un valor fuera de rango se guarda NULL (nunca se inventa
   * autor, patron de `matricula.service` y del motor de 6.B).
   */
  private actorDePago(actorId: number): number | null {
    return esIdSeguro32(actorId) ? actorId : null;
  }
}

export const pagosService = new PagosService();
