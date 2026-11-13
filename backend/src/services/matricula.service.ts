import { PoolClient } from 'pg';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { hashToken } from '../utils/authCrypto';
import { politicasFinancieras } from '../dominio/politicas-financieras';
import {
  MatriculaRepository,
  Matricula,
  MatriculaSafe,
  CreateMatriculaInput,
  UpdateMatriculaInput,
} from '../repositories/matricula.repository';

export interface PlanPagoConfig {
  tarifa_id: number;
  fechas_vencimiento: string[];
}

/**
 * Descuento autorizado recibido en la peticion (D05 CU-01 / DEC-07 / DEC-20).
 * El porcentaje es CADENA DECIMAL EXACTA y `autorizado_por` es obligatorio:
 * el sistema registra quien autorizo, no decide si el descuento es legitimo.
 */
export interface DescuentoAutorizadoInput {
  porcentaje: string;
  autorizado_por: string;
}

/**
 * Descuento tal como queda aplicado y registrado. Los importes son cadenas
 * exactas calculadas por PostgreSQL (NUNCA aritmetica de JavaScript).
 */
export interface DescuentoAplicado {
  porcentaje: string;
  autorizado_por: string;
  /** Parametro de politica que permitio aplicarlo en este momento. */
  politica: string;
  monto_tarifa: string;
  monto_cuota: string;
  descuento_por_cuota: string;
  /** false con la politica vigente: el descuento NO es dinero cobrado. */
  contabilizado_como_efectivo: boolean;
}

export interface CrearMatriculaDatos extends CreateMatriculaInput {
  plan_pago: PlanPagoConfig;
  /**
   * Descuento autorizado ANTES de generar el plan (opcional). Ausente = sin
   * descuento: `porcentajeDescuentoPorDefecto` es 'ninguno' y ningun
   * porcentaje se aplica en silencio.
   */
  descuento?: DescuentoAutorizadoInput;
}

export interface CrearMatriculaResultado {
  matricula: MatriculaSafe;
  plan_pago_id: number;
  total_cuotas: number;
  /**
   * false en una creacion normal (201) y true cuando la peticion es un replay
   * idempotente de una peticion previa con la misma clave (200).
   */
  idempotent_replay: boolean;
}

export interface MensualidadHistorial {
  id: number;
  numero_cuota: number;
  concepto: string;
  monto_original: string;
  monto_pagado: string;
  saldo_pendiente: string;
  fecha_vencimiento: Date;
  estado: string;
  mora_aplicada: string;
}

export interface PlanPagoHistorial {
  plan_pago_id: number;
  matricula_id: number;
  total_cuotas: number;
  monto_cuota: string;
  moneda: string | null;
  tarifa_id: number | null;
}

export interface AuditoriaHistorial {
  accion: string;
  usuario_id: number | null;
  fecha: Date;
  detalle: unknown;
}

/**
 * Historial completo de una matricula. Es de SOLO LECTURA: no escribe,
 * actualiza ni borra matriculas, planes ni cuotas.
 */
export interface HistorialMatricula {
  matricula_id: number;
  matricula: MatriculaSafe;
  plan_pago_id: number | null;
  plan_pago: PlanPagoHistorial | null;
  mensualidades: MensualidadHistorial[];
  cuotas: MensualidadHistorial[];
  auditoria: AuditoriaHistorial[];
}

const MIN_CUOTAS = 1;
const MAX_CUOTAS = 120;
const ESTADOS_PERMITIDOS = ['ACTIVA', 'DESACTIVADA', 'COMPLETADA'];

/**
 * Forma exacta del porcentaje de descuento, identica a la del validador de
 * entrada (`matricula.schema.ts`) y a la de `politicas-financieras`: sin
 * signo, sin ceros a la izquierda, sin notacion cientifica, 0..100. La
 * comprueba tambien el servicio porque no depende de que el llamador sea HTTP.
 */
const PORCENTAJE_DESCUENTO = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;

export class MatriculaService {
  constructor(
    private readonly matriculaRepo: MatriculaRepository = new MatriculaRepository()
  ) {}

  /**
   * Crea matricula + plan de pago + todas las cuotas + auditoria en una
   * transaccion unica gestionada por la ruta. Recibe el mismo PoolClient
   * (no abre otra conexion ni transaccion).
   *
   * Idempotencia de aplicacion: si la peticion trae `idempotency_key`, la
   * clave se resuelve PRIMERO (dentro de la misma transaccion y con el mismo
   * PoolClient) para que un reintento no genere una segunda matricula, un
   * segundo plan de pago ni nuevas mensualidades.
   *
   * Descuento autorizado (D05 CU-01 / DEC-07 / DEC-20): si la peticion trae
   * `descuento` y la politica lo permite en este momento
   * (`politicaDescuento = 'antes_de_generar_el_plan'`), el importe de cada
   * cuota se calcula con el descuento aplicado ANTES de generar el plan y se
   * almacena en `planes_pago.monto_cuota` y en `mensualidades.monto_original`.
   * La fila de `tarifas` NO se modifica. El descuento NO se contabiliza como
   * efectivo recibido (`descuentoComoEfectivo = false`) y queda trazado en la
   * auditoria de la matricula. Sin `descuento` en la peticion no se aplica
   * ningun porcentaje: `porcentajeDescuentoPorDefecto` es 'ninguno'.
   */
  async crear(
    datos: CrearMatriculaDatos,
    client: PoolClient,
    actorId: number
  ): Promise<CrearMatriculaResultado> {
    // 0. Idempotencia: la clave se normaliza una sola vez y se usa igual para
    //    la busqueda y para la persistencia. Si no hay clave, el flujo sigue
    //    exactamente igual que antes (duplicado estudiante/anio -> 409).
    const idempotencyKey =
      typeof datos.idempotency_key === 'string' ? datos.idempotency_key.trim() : '';

    if (idempotencyKey.length > 0) {
      // La clave se resuelve acotada al actor que la creo (hallazgo de seguridad
      // #2): si otro actor reutiliza una clave ajena no recibe datos de esa
      // matricula ni escribe auditoria en su historial; recibe el mismo conflicto
      // que al reutilizarla con otra identidad, sin filtrar que la clave existe.
      const existente = await this.matriculaRepo.obtenerPorIdempotencyKey(
        idempotencyKey,
        actorId,
        client
      );
      if (existente) {
        // La clave ya fue usada: solo es un replay si la identidad academica
        // coincide; con otra identidad es un conflicto y no se crea nada.
        const mismaIdentidad =
          existente.estudiante_id === datos.estudiante_id &&
          existente.anio_lectivo_id === datos.anio_lectivo_id &&
          existente.grado_id === datos.grado_id;
        if (!mismaIdentidad) {
          throw new AppError(
            'La clave de idempotencia ya fue utilizada con otra identidad academica',
            409,
            'CONFLICT'
          );
        }

        // El replay resuelve al plan de pago existente: no se inventa data.
        const plan = await this.matriculaRepo.obtenerPlanPago(existente.id, client);
        if (!plan) {
          throw new AppError(
            'La matricula asociada a la clave de idempotencia no tiene plan de pago',
            409,
            'CONFLICT'
          );
        }

        // Auditoria del replay: solo matricula y marcadores, nunca la clave cruda.
        await this.matriculaRepo.registrarAuditoria(
          {
            usuarioId: actorId,
            accion: 'matricula_crear_replay',
            entidad: 'matriculas',
            entidadId: existente.id,
            detalle: {
              resultado: 'replay',
              matricula_id: existente.id,
              total_cuotas: plan.total_cuotas,
              idempotency_key_hash: this.hashIdempotencyKey(idempotencyKey),
            },
          },
          client
        );

        return {
          matricula: this.matriculaRepo.aPerfilSeguro(existente),
          plan_pago_id: plan.id,
          total_cuotas: plan.total_cuotas,
          idempotent_replay: true,
        };
      }
    }

    // 1. No exista ya una matricula para este estudiante y ano lectivo (mismo cliente)
    const existe = await this.matriculaRepo.existeMatriculaEstudianteAnio(
      datos.estudiante_id,
      datos.anio_lectivo_id,
      undefined,
      client
    );
    if (existe) {
      throw new AppError('Ya existe una matricula para este estudiante y ano lectivo', 409, 'CONFLICT');
    }

    // 2. Estudiante activo
    const estudiante = await client.query<{ id: number; activo: boolean }>(
      'SELECT id, activo FROM estudiantes WHERE id = $1 FOR SHARE',
      [datos.estudiante_id]
    );
    if (estudiante.rows.length === 0) {
      throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
    }
    if (!estudiante.rows[0].activo) {
      throw new AppError('Estudiante no activo', 400, 'BAD_REQUEST');
    }

    // 3. Año lectivo activo y su rango de fechas (texto para validación independiente de TZ)
    const anio = await client.query<{
      id: number;
      fecha_inicio: string;
      fecha_fin: string;
      activo: boolean;
    }>(
      'SELECT id, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, activo FROM anio_lectivo WHERE id = $1 FOR SHARE',
      [datos.anio_lectivo_id],
    );
    if (anio.rows.length === 0) {
      throw new AppError('Ano lectivo no encontrado', 404, 'NOT_FOUND');
    }
    if (!anio.rows[0].activo) {
      throw new AppError('Ano lectivo no activo', 400, 'BAD_REQUEST');
    }
    const fechaInicio = anio.rows[0].fecha_inicio; // 'YYYY-MM-DD'
    const fechaFin = anio.rows[0].fecha_fin; // 'YYYY-MM-DD'

    // 4. Grado pertenece al ano lectivo
    const grado = await client.query<{ id: number; anio_lectivo_id: number }>(
      'SELECT id, anio_lectivo_id FROM grados WHERE id = $1 FOR SHARE',
      [datos.grado_id]
    );
    if (grado.rows.length === 0) {
      throw new AppError('Grado no encontrado', 404, 'NOT_FOUND');
    }
    if (grado.rows[0].anio_lectivo_id !== datos.anio_lectivo_id) {
      throw new AppError('Grado no pertenece al ano lectivo', 400, 'BAD_REQUEST');
    }

    // 5. Tutor asociado al estudiante cuando se especifica (opcional omitido)
    if (datos.tutor_id !== null && datos.tutor_id !== undefined) {
      const tutor = await client.query<{ id: number; activo: boolean }>(
        'SELECT id, activo FROM tutores WHERE id = $1 FOR SHARE',
        [datos.tutor_id]
      );
      if (tutor.rows.length === 0) {
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }
      if (!tutor.rows[0].activo) {
        throw new AppError('Tutor no activo', 400, 'BAD_REQUEST');
      }
      const asociado = await client.query<{ estudiante_id: number }>(
        'SELECT 1 FROM estudiante_tutor WHERE estudiante_id = $1 AND tutor_id = $2 FOR SHARE',
        [datos.estudiante_id, datos.tutor_id]
      );
      if (asociado.rows.length === 0) {
        throw new AppError('Tutor no asociado al estudiante', 400, 'BAD_REQUEST');
      }
    }

    // 6. Tarifa activa del ano lectivo (explicita)
    const tarifa = await client.query<{
      id: number;
      concepto: string;
      monto: string;
      moneda: string;
      anio_lectivo_id: number;
      activo: boolean;
    }>(
      'SELECT id, concepto, monto::text AS monto, moneda, anio_lectivo_id, activo FROM tarifas WHERE id = $1 AND activo = TRUE FOR SHARE',
      [datos.plan_pago.tarifa_id]
    );
    if (tarifa.rows.length === 0) {
      throw new AppError('Tarifa no encontrada o inactiva', 400, 'BAD_REQUEST');
    }
    // La tarifa decide la NATURALEZA del cobro, no el numero de fechas:
    //   - "Mensualidad": se cobra varias veces -> una cuota por fecha.
    //   - "Matricula" / "Uniforme": se cobra UNA sola vez -> una unica cuota.
    // Antes todas se trataban como mensualidad y las cuotas se llamaban
    // "Mensualidad N" incluso cuando la tarifa era la matricula o el uniforme:
    // de ahi que en la pantalla de cobro se vieran revueltos los conceptos.
    const conceptoTarifa = tarifa.rows[0].concepto;
    const esRecurrente = /mensual/i.test(conceptoTarifa);
    if (tarifa.rows[0].anio_lectivo_id !== datos.anio_lectivo_id) {
      throw new AppError('Tarifa no pertenece al ano lectivo', 400, 'BAD_REQUEST');
    }
    const montoTarifa = tarifa.rows[0].monto; // NUMERIC exacto como string
    const montoNum = Number(montoTarifa);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      throw new AppError('Monto de tarifa invalido', 400, 'BAD_REQUEST');
    }
    // Sin descuento, el importe de la cuota es EXACTAMENTE el de la tarifa
    // (comportamiento previo intacto). Con descuento autorizado se sustituye
    // por el calculado en PostgreSQL (paso 6b).
    let montoCuota = montoTarifa;

    // 6b. Descuento autorizado ANTES de generar el plan (D05 CU-01 / DEC-20).
    //     Se resuelve dentro de la misma transaccion, antes de escribir nada:
    const descuentoAplicado = await this.aplicarDescuentoSiCorresponde(
      datos.descuento,
      tarifa.rows[0].id,
      client
    );
    if (descuentoAplicado !== null) {
      montoCuota = descuentoAplicado.monto_cuota;
    }

    // 7. Fechas: reales, unicas, ordenadas y dentro del rango del ano lectivo
    const fechasRaw = datos.plan_pago.fechas_vencimiento;
    const fechas: Date[] = [];
    const visto = new Set<string>();
    for (const f of fechasRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        throw new AppError('Fecha de vencimiento invalida', 400, 'BAD_REQUEST');
      }
      const [y, m, d] = f.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        throw new AppError('Fecha de vencimiento invalida', 400, 'BAD_REQUEST');
      }
      if (visto.has(f)) {
        throw new AppError('Fechas de vencimiento duplicadas', 409, 'CONFLICT');
      }
      visto.add(f);
      fechas.push(date);
    }
    for (let i = 1; i < fechas.length; i++) {
      if (fechas[i].getTime() <= fechas[i - 1].getTime()) {
        throw new AppError('Fechas de vencimiento deben estar ordenadas de forma ascendente', 400, 'BAD_REQUEST');
      }
    }
    for (const date of fechas) {
      const f = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      if (f < fechaInicio || f > fechaFin) {
        throw new AppError('Fecha de vencimiento fuera del rango del ano lectivo', 400, 'BAD_REQUEST');
      }
    }

    const totalCuotas = fechas.length;
    if (totalCuotas < MIN_CUOTAS || totalCuotas > MAX_CUOTAS) {
      throw new AppError('Numero de cuotas fuera del rango permitido', 400, 'BAD_REQUEST');
    }
    // Pago unico (matricula, uniforme): UNA fecha, no varias. Se rechaza aqui
    // y NO despues de crear la matricula: la validacion es de origen.
    if (!esRecurrente && totalCuotas !== 1) {
      throw new AppError(
        `La tarifa "${conceptoTarifa}" se cobra una sola vez: indique una unica fecha de vencimiento`,
        400,
        'BAD_REQUEST'
      );
    }

    // 8. Crear matricula. fecha_matricula omitida => el repositorio aplica COALESCE(NULL, NOW())
    // (columna NOT NULL). Se pasa la cadena validada; PostgreSQL la castea a timestamptz
    // sin normalizacion/rollover de JavaScript Date.
    // La violacion del indice unico parcial (23505) se traduce a 409 CONFLICT sin
    // filtrar el mensaje interno del driver.
    let matricula: Matricula;
    try {
      matricula = await this.matriculaRepo.crear(
        {
          ...datos,
          tutor_id: datos.tutor_id ?? null,
          fecha_matricula: datos.fecha_matricula,
          idempotency_key: idempotencyKey.length > 0 ? idempotencyKey : null,
          creado_por_usuario_id: this.actorDeMatricula(actorId),
        },
        client
      );
    } catch (error) {
      const codigo = (error as { code?: string } | null)?.code;
      if (codigo === '23505') {
        throw new AppError('La matricula ya existe', 409, 'CONFLICT');
      }
      throw error;
    }

    // 9. Plan de pago con snapshot de tarifa (tarifa_id, moneda) y el importe
    //    de la cuota ya calculado: el de la tarifa, o el de la tarifa menos el
    //    descuento autorizado (paso 6b). Lo calculo PostgreSQL, no JavaScript.
    const planResult = await client.query<{ id: number }>(
      `INSERT INTO planes_pago (matricula_id, tarifa_id, moneda, total_cuotas, monto_cuota)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [matricula.id, tarifa.rows[0].id, tarifa.rows[0].moneda, totalCuotas, montoCuota]
    );
    const planPagoId = planResult.rows[0].id;

    // 10. Todas las cuotas con el mismo importe exacto de la cuota (sin
    //     division JS ni redondeo): el de la tarifa, o con el descuento
    //     autorizado ya aplicado. Ninguna cuota se divide ni se prorratea.
    for (let i = 0; i < totalCuotas; i++) {
      // El concepto de la cuota sale de la tarifa, no de un texto fijo: una
      // mensualidad se numera ("Mensualidad 1"), un pago unico no ("Matricula").
      const conceptoCuota = esRecurrente ? `${conceptoTarifa} ${i + 1}` : conceptoTarifa;
      await client.query(
        `INSERT INTO mensualidades (
          plan_pago_id, numero_cuota, concepto, monto_original,
          monto_pagado, saldo_pendiente, fecha_vencimiento, estado, mora_aplicada
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [planPagoId, i + 1, conceptoCuota, montoCuota, 0, montoCuota, fechas[i], 'PENDIENTE', 0]
      );
    }

    // 11. Auditoria dentro de la misma transaccion. Nunca se guarda la clave
    //     cruda: solo un hash SHA-256 truncado cuando la peticion trae clave.
    const detalleAuditoria: Record<string, unknown> = {
      resultado: 'exito',
      total_cuotas: totalCuotas,
      ...(idempotencyKey.length > 0
        ? { idempotency_key_hash: this.hashIdempotencyKey(idempotencyKey) }
        : {}),
    };
    if (descuentoAplicado !== null) {
      // Trazabilidad del descuento: NO hay tabla ni columna nueva (no hay
      // migracion). Queda en la auditoria de la matricula, visible en
      // GET /api/matriculas/:id/historial, con el porcentaje, quien autorizo
      // y los importes exactos (tarifa, cuota con descuento y descuento por
      // cuota). El importe descontado es auditable contra `tarifas.monto`
      // mediante el snapshot `planes_pago.tarifa_id`.
      detalleAuditoria.descuento = {
        porcentaje: descuentoAplicado.porcentaje,
        autorizado_por: descuentoAplicado.autorizado_por,
        politica: descuentoAplicado.politica,
        monto_tarifa: descuentoAplicado.monto_tarifa,
        monto_cuota: descuentoAplicado.monto_cuota,
        descuento_por_cuota: descuentoAplicado.descuento_por_cuota,
        contabilizado_como_efectivo: descuentoAplicado.contabilizado_como_efectivo,
      };
    }
    await this.matriculaRepo.registrarAuditoria(
      {
        usuarioId: actorId,
        accion: 'matricula_crear',
        entidad: 'matriculas',
        entidadId: matricula.id,
        detalle: detalleAuditoria,
      },
      client
    );

    return {
      matricula: this.matriculaRepo.aPerfilSeguro(matricula),
      plan_pago_id: planPagoId,
      total_cuotas: totalCuotas,
      idempotent_replay: false,
    };
  }

  /**
   * Huella SHA-256 truncada de la clave de idempotencia. Permite correlacionar
   * auditoria con una peticion sin exponer la clave cruda.
   */
  private hashIdempotencyKey(key: string): string {
    return hashToken(key).slice(0, 16);
  }

  /**
   * Descuento autorizado aplicado ANTES de generar el plan (D05 CU-01
   * alternativo / DEC-07 / DEC-20). Devuelve `null` cuando la peticion no
   * trae descuento: la politica `porcentajeDescuentoPorDefecto` es 'ninguno',
   * de modo que NINGUN porcentaje se aplica sin que venga explicito en la
   * peticion (nunca en silencio).
   *
   * Reglas comprobadas aqui (todas antes de escribir nada, dentro de la misma
   * transaccion):
   * - La politica vigente debe permitir este momento del descuento
   *   (`politicaDescuento = 'antes_de_generar_el_plan'`). Otra politica se
   *   rechaza con 400: no se ignora un descuento recibido en silencio.
   * - `autorizado_por` es obligatorio: el sistema registra QUIEN autorizo,
   *   no decide si el descuento es legitimo (DEC-07).
   * - El porcentaje es una cadena decimal exacta (sin signo, sin notacion
   *   cientifica, 0..100). No se convierte a numero.
   * - El importe y el redondeo los resuelve PostgreSQL
   *   (`calcularMontoCuotaConDescuento`): la tarifa no se modifica.
   * - Un descuento que deja la cuota en 0.00 se RECHAZA (400): no existe regla
   *   aprobada para un plan sin importe (propuesta tecnica pendiente de
   *   ratificacion, igual que el resto de DEC-20).
   */
  private async aplicarDescuentoSiCorresponde(
    descuento: DescuentoAutorizadoInput | null | undefined,
    tarifaId: number,
    client: PoolClient
  ): Promise<DescuentoAplicado | null> {
    if (descuento === undefined || descuento === null) {
      return null; // 'ninguno': sin objeto explicito no hay descuento
    }

    if (politicasFinancieras.politicaDescuento !== 'antes_de_generar_el_plan') {
      throw new AppError(
        `La politica financiera vigente (politicaDescuento='${politicasFinancieras.politicaDescuento}') no permite aplicar un descuento al generar el plan de pago`,
        400,
        'BAD_REQUEST'
      );
    }

    // Validacion defensiva: el schema ya rechaza estos casos en la ruta (400),
    // pero el servicio no depende de que el llamador sea HTTP.
    const porcentaje =
      typeof descuento.porcentaje === 'string' ? descuento.porcentaje.trim() : '';
    if (!PORCENTAJE_DESCUENTO.test(porcentaje)) {
      throw new AppError('Porcentaje de descuento invalido', 400, 'BAD_REQUEST');
    }
    const [entero, fraccion] = porcentaje.split('.');
    if (Number(entero) > 100 || (entero === '100' && fraccion !== undefined)) {
      throw new AppError(
        'Porcentaje de descuento fuera del rango 0..100',
        400,
        'BAD_REQUEST'
      );
    }
    const autorizadoPor =
      typeof descuento.autorizado_por === 'string' ? descuento.autorizado_por.trim() : '';
    if (autorizadoPor.length === 0) {
      throw new AppError(
        'El descuento requiere autorizado_por: se registra quien lo autorizo',
        400,
        'BAD_REQUEST'
      );
    }
    if (autorizadoPor.length > 255) {
      throw new AppError(
        'autorizado_por admite maximo 255 caracteres',
        400,
        'BAD_REQUEST'
      );
    }

    // Importe y redondeo: PostgreSQL (NUMERIC exacto), nunca JavaScript.
    const calculado = await this.matriculaRepo.calcularMontoCuotaConDescuento(
      {
        tarifaId,
        porcentajeDescuento: porcentaje,
        precisionDecimales: politicasFinancieras.precisionDecimales,
      },
      client
    );
    if (calculado === null) {
      throw new AppError(
        'Tarifa no encontrada para aplicar el descuento',
        400,
        'BAD_REQUEST'
      );
    }
    if (!calculado.deja_monto_positivo) {
      throw new AppError(
        'El descuento deja el importe de la cuota en 0.00: se rechaza el descuento (no hay regla aprobada para un plan sin importe)',
        400,
        'BAD_REQUEST'
      );
    }

    return {
      porcentaje,
      autorizado_por: autorizadoPor,
      politica: politicasFinancieras.politicaDescuento,
      monto_tarifa: calculado.monto_tarifa,
      monto_cuota: calculado.monto_cuota,
      descuento_por_cuota: calculado.descuento_por_cuota,
      contabilizado_como_efectivo: politicasFinancieras.descuentoComoEfectivo,
    };
  }

  /**
   * Actor que queda registrado como creador de la matricula. Se persiste solo
   * cuando el actor es un id de usuario positivo y seguro; ante un valor fuera
   * de rango se guarda NULL (nunca se inventa un autor ni se asigna 0).
   */
  private actorDeMatricula(actorId: number): number | null {
    return Number.isSafeInteger(actorId) && actorId > 0 ? actorId : null;
  }

  async obtenerPorId(id: number, actorId: number): Promise<{ matricula: MatriculaSafe }> {
    const client = await getPool().connect();
    try {
      const matricula = await this.matriculaRepo.obtenerPorId(id, client);
      if (!matricula) {
        throw new AppError('Matricula no encontrada', 404, 'NOT_FOUND');
      }

      await this.matriculaRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'matricula_obtener',
          entidad: 'matriculas',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      return { matricula: this.matriculaRepo.aPerfilSeguro(matricula) };
    } finally {
      client.release();
    }
  }

  async listar(
    actorId: number,
    opciones: {
      estudiante_id?: number;
      anio_lectivo_id?: number;
      estado?: string;
      activo?: boolean;
      limite?: number;
      compensar?: number;
    } = {}
  ): Promise<{ matriculas: MatriculaSafe[] }> {
    const client = await getPool().connect();
    try {
      const matriculas = await this.matriculaRepo.listar(opciones, client);

      await this.matriculaRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'matricula_listar',
          entidad: 'matriculas',
          entidadId: null,
          detalle: { resultado: 'exito', cantidad: matriculas.length },
        },
        client
      );

      return { matriculas: matriculas.map((m) => this.matriculaRepo.aPerfilSeguro(m)) };
    } finally {
      client.release();
    }
  }

  /**
   * Actualizacion parcial: solo los campos proporcionados se escriben.
   * Bloquea cambio de estudiante/ano/grado si ya existe plan con cuotas (409).
   * Desactivar conserva las cuotas.
   */
  async actualizar(
    id: number,
    datos: UpdateMatriculaInput,
    client: PoolClient,
    actorId: number
  ): Promise<{ matricula: MatriculaSafe }> {
    const existente = await this.matriculaRepo.obtenerPorId(id, client);
    if (!existente) {
      throw new AppError('Matricula no encontrada', 404, 'NOT_FOUND');
    }

    const cambiaClave =
      (datos.estudiante_id !== undefined && datos.estudiante_id !== existente.estudiante_id) ||
      (datos.anio_lectivo_id !== undefined && datos.anio_lectivo_id !== existente.anio_lectivo_id) ||
      (datos.grado_id !== undefined && datos.grado_id !== existente.grado_id);
    if (cambiaClave) {
      const plan = await this.matriculaRepo.obtenerPlanPago(id, client);
      if (plan) {
        throw new AppError(
          'No se puede cambiar estudiante, ano o grado mientras exista un plan de pago con cuotas',
          409,
          'CONFLICT'
        );
      }
    }

    // Validar tutor asociado al estudiante cuando se proporciona
    if (datos.tutor_id !== null && datos.tutor_id !== undefined) {
      const estudianteId = datos.estudiante_id !== undefined ? datos.estudiante_id : existente.estudiante_id;
      const tutor = await client.query<{ id: number; activo: boolean }>(
        'SELECT id, activo FROM tutores WHERE id = $1',
        [datos.tutor_id]
      );
      if (tutor.rows.length === 0) {
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }
      if (!tutor.rows[0].activo) {
        throw new AppError('Tutor no activo', 400, 'BAD_REQUEST');
      }
      const asociado = await client.query<{ estudiante_id: number }>(
        'SELECT 1 FROM estudiante_tutor WHERE estudiante_id = $1 AND tutor_id = $2',
        [estudianteId, datos.tutor_id]
      );
      if (asociado.rows.length === 0) {
        throw new AppError('Tutor no asociado al estudiante', 400, 'BAD_REQUEST');
      }
    }

    const actualizado = await this.matriculaRepo.actualizar(id, datos, client);

    await this.matriculaRepo.registrarAuditoria(
      {
        usuarioId: actorId,
        accion: 'matricula_actualizar',
        entidad: 'matriculas',
        entidadId: id,
        detalle: { resultado: 'exito', campos: Object.keys(datos) },
      },
      client
    );

    if (!actualizado) {
      throw new AppError('Matricula no encontrada tras actualizar', 404, 'NOT_FOUND');
    }

    return { matricula: this.matriculaRepo.aPerfilSeguro(actualizado) };
  }

  async desactivar(id: number, client: PoolClient, actorId: number): Promise<{ matricula: MatriculaSafe }> {
    return this.actualizar(id, { estado: 'DESACTIVADA' }, client, actorId);
  }

  async obtenerPlanPago(
    matriculaId: number,
    client: PoolClient,
    actorId: number
  ): Promise<{
    plan_pago_id: number;
    matricula_id: number;
    total_cuotas: number;
    monto_cuota: string;
    moneda: string | null;
    tarifa_id: number | null;
    mensualidades: Array<{
      id: number;
      numero_cuota: number;
      concepto: string;
      monto_original: string;
      monto_pagado: string;
      saldo_pendiente: string;
      fecha_vencimiento: Date;
      estado: string;
      mora_aplicada: string;
    }>;
  }> {
    const matricula = await this.matriculaRepo.obtenerPorId(matriculaId, client);
    if (!matricula) {
      throw new AppError('Matricula no encontrada', 404, 'NOT_FOUND');
    }

    const planPago = await this.matriculaRepo.obtenerPlanPago(matriculaId, client);
    if (!planPago) {
      throw new AppError('Plan de pago no encontrado', 404, 'NOT_FOUND');
    }

    const mensualidades = await this.matriculaRepo.obtenerMensualidades(planPago.id, client);

    return {
      plan_pago_id: planPago.id,
      matricula_id: planPago.matricula_id,
      total_cuotas: planPago.total_cuotas,
      monto_cuota: planPago.monto_cuota,
      moneda: planPago.moneda,
      // Snapshot de la tarifa vigente al crear el plan (null en filas legacy).
      tarifa_id: planPago.tarifa_id,
      mensualidades: mensualidades.map((m) => ({
        id: m.id,
        numero_cuota: m.numero_cuota,
        concepto: m.concepto,
        monto_original: m.monto_original,
        monto_pagado: m.monto_pagado,
        saldo_pendiente: m.saldo_pendiente,
        fecha_vencimiento: m.fecha_vencimiento,
        estado: m.estado,
        mora_aplicada: m.mora_aplicada,
      })),
    };
  }

  /**
   * Historial completo de una matricula (solo lectura).
   *
   * NO escribe, actualiza ni borra nada: no registra auditoria de la consulta
   * ni toca matriculas, planes de pago ni cuotas. Solo SELECT.
   *
   * Devuelve:
   * - `matricula`: estado actual (perfil seguro).
   * - `plan_pago`: plan vigente o null si la matricula no tiene plan.
   * - `mensualidades` / `cuotas`: cuotas del plan (array vacio si no hay plan).
   * - `auditoria`: entradas de auditoria de ESA matricula, ordenadas de forma
   *   ascendente por `fecha` (con `id` como desempate).
   */
  async obtenerHistorial(
    matriculaId: number,
    client: PoolClient
  ): Promise<HistorialMatricula> {
    const matricula = await this.matriculaRepo.obtenerPorId(matriculaId, client);
    if (!matricula) {
      throw new AppError('Matricula no encontrada', 404, 'NOT_FOUND');
    }

    const planPago = await this.matriculaRepo.obtenerPlanPago(matriculaId, client);
    const mensualidades = planPago
      ? await this.matriculaRepo.obtenerMensualidades(planPago.id, client)
      : [];

    // Auditoria estricta de esta matricula: entidad = 'matriculas' y entidad_id = id.
    const auditoria = await this.matriculaRepo.obtenerAuditoriaMatricula(matriculaId, client);

    const mensualidadesMapeadas: MensualidadHistorial[] = mensualidades.map((m) => ({
      id: m.id,
      numero_cuota: m.numero_cuota,
      concepto: m.concepto,
      monto_original: m.monto_original,
      monto_pagado: m.monto_pagado,
      saldo_pendiente: m.saldo_pendiente,
      fecha_vencimiento: m.fecha_vencimiento,
      estado: m.estado,
      mora_aplicada: m.mora_aplicada,
    }));

    return {
      matricula_id: matricula.id,
      matricula: this.matriculaRepo.aPerfilSeguro(matricula),
      plan_pago_id: planPago ? planPago.id : null,
      plan_pago: planPago
        ? {
            plan_pago_id: planPago.id,
            matricula_id: planPago.matricula_id,
            total_cuotas: planPago.total_cuotas,
            monto_cuota: planPago.monto_cuota,
            moneda: planPago.moneda,
            tarifa_id: planPago.tarifa_id,
          }
        : null,
      mensualidades: mensualidadesMapeadas,
      // Alias explicito de las cuotas (mismos datos, sin duplicar estado).
      cuotas: mensualidadesMapeadas,
      auditoria: auditoria.map((a) => ({
        accion: a.accion,
        usuario_id: a.usuario_id,
        fecha: a.fecha,
        detalle: a.detalle,
      })),
    };
  }
}

export const matriculaService = new MatriculaService();
