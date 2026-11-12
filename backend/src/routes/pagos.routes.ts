import { Router, Request, Response, NextFunction } from 'express';
import { PoolClient } from 'pg';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest, AuthSession } from '../middleware/auth';
import { validateCsrf } from '../middleware/csrf';
import {
  requirePermission,
  getCurrentAuthContext,
  AUTH_PERMISSIONS,
  assertActiveSession,
} from '../authorization/permissions';
import {
  registrarPagoSchema,
  reversarPagoSchema,
  pagosService,
  FiltrosBusquedaPagos,
} from '../services/pagos.service';
import { hashToken } from '../utils/authCrypto';
import { redactError } from '../utils/redact';
import { generarComprobantePdf } from '../servicios/comprobante-pdf';

/**
 * ============================================================================
 * RUTAS DEL PROCESO DE COBRO (FASE 7.A)
 * ============================================================================
 *
 * Cinco endpoints, con el patron de casa de `matriculas.routes.ts`
 * (`getParamString`, `parsePositiveId`, `toHttpError`, 404 generico,
 * `Cache-Control: no-store`).
 *
 *   POST /api/pagos                  pagos:manage + CSRF  registrar pago
 *   GET  /api/pagos                  pagos:read           buscar con filtros
 *   GET  /api/pagos/:id              pagos:read           detalle
 *   GET  /api/pagos/:id/comprobante     pagos:read        comprobante como DATO
 *   GET  /api/pagos/:id/comprobante.pdf   pagos:read        comprobante en PDF
 *   POST /api/pagos/:id/reversar     pagos:manage + CSRF  reversion compensatoria
 *
 * ESTRUCTURA TRANSACCIONAL DE `POST /api/pagos` (ver la cabecera de
 * `pagos.service.ts` para la justificacion completa):
 *
 *   1. Esta ruta abre su transaccion, toma el advisory lock 4315003, revalida
 *      contexto de autorizacion y sesion (`getCurrentAuthContext` +
 *      `assertActiveSession`) y la CIERRA.
 *   2. El motor de 6.B (`aplicacion-pagos.service`) registra el pago en UNA
 *      unica transaccion atomica con su propio `PoolClient` y el mismo
 *      advisory lock: anidar la transaccion de la ruta alrededor de la
 *      llamada con el mismo key produciria un bloqueo mutuo, y reescribir la
 *      logica financiera del motor esta prohibido por el plan.
 *   3. La emision del comprobante (transaccion propia, advisory lock y
 *      revalidacion incluidos) vive en el servicio y NUNCA altera saldos.
 *
 * La reversion SI ocurre dentro de UNA transaccion de esta ruta (mismo
 * `PoolClient` que el servicio), igual que `POST /api/matriculas`.
 */

const router = Router();
const ADVISORY_LOCK_KEY = 4315003;

/** Estados almacenados de `pagos.estado` aceptados como filtro. */
const ESTADOS_PAGO = ['COMPLETADO', 'REVERTIDO'];

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function getParamString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveId(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseQueryPositiveId(query: unknown): number | null {
  if (query === undefined) return null;
  const value = getParamString(query as string | string[]);
  return parsePositiveId(value);
}

/**
 * Fecha de filtro `YYYY-MM-DD` con calendario real (sin rollover de
 * JavaScript): `2026-02-31` se rechaza en lugar de convertirse en marzo.
 */
function parseQueryFecha(query: unknown): string | null | 'invalid' {
  if (query === undefined) return null;
  const value = getParamString(query as string | string[]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid';
  const [anio, mes, dia] = value.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return 'invalid';
  }
  return value;
}

/**
 * Traduccion de errores de base de datos a respuestas HTTP, sin filtrar
 * detalle del driver: 23505 (unique) -> 409, 23514 (check) -> 400,
 * 23503 (fk) -> 400. Cualquier otro error se propaga tal cual.
 */
function toHttpError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  if (code === '23505') {
    return new AppError('Conflict', 409, 'CONFLICT');
  }
  if (code === '23514') {
    return new AppError('Solicitud invalida', 400, 'BAD_REQUEST');
  }
  if (code === '23503') {
    return new AppError('Bad request', 400, 'BAD_REQUEST');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function responderInvalido(res: Response): void {
  res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
}

function responderNoEncontrado(res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
}

/**
 * Revalida el actor DENTRO de una transaccion abierta: contexto de
 * autorizacion actual (permiso vigente), comprobacion del permiso concreto y
 * sesion activa. Es el mismo bloque que `matriculas.routes.ts`, extraido
 * porque `POST /api/pagos` y `POST /api/pagos/:id/reversar` lo necesitan.
 */
async function revalidarActorEnTransaccion(
  client: PoolClient,
  auth: AuthSession,
  permiso: string
): Promise<void> {
  const actor = await getCurrentAuthContext(auth.userId, client);
  if (!actor) {
    throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
  }
  if (!actor.grants.includes(permiso)) {
    throw new AppError('Prohibido', 403, 'FORBIDDEN');
  }
  await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);
}

async function revertirTransaccion(client: PoolClient, contexto: string): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    const sanitized = redactError(rollbackError);
    console.error(
      `Rollback de ${contexto} fallido (${sanitized.name}); la transaccion pudo quedar abierta.`
    );
  }
}

/**
 * Filtros de `GET /api/pagos`: estudiante, matricula, rango de fechas sobre la
 * fecha de la operacion, estado y paginacion. Devuelve `null` (con la
 * respuesta 400 ya enviada) si algun parametro es invalido: nunca se consulta
 * con un filtro a medias.
 */
function leerFiltrosBusqueda(req: Request, res: Response): FiltrosBusquedaPagos | null {
  const estudianteId = parseQueryPositiveId(req.query.estudiante_id);
  if (req.query.estudiante_id !== undefined && estudianteId === null) {
    responderInvalido(res);
    return null;
  }

  const matriculaId = parseQueryPositiveId(req.query.matricula_id);
  if (req.query.matricula_id !== undefined && matriculaId === null) {
    responderInvalido(res);
    return null;
  }

  const estado = req.query.estado === undefined
    ? null
    : getParamString(req.query.estado as string | string[]);
  if (estado !== null && !ESTADOS_PAGO.includes(estado)) {
    responderInvalido(res);
    return null;
  }

  const fechaDesde = parseQueryFecha(req.query.fecha_desde);
  if (fechaDesde === 'invalid') {
    responderInvalido(res);
    return null;
  }
  const fechaHasta = parseQueryFecha(req.query.fecha_hasta);
  if (fechaHasta === 'invalid') {
    responderInvalido(res);
    return null;
  }
  if (fechaDesde !== null && fechaHasta !== null && fechaDesde > fechaHasta) {
    responderInvalido(res);
    return null;
  }

  const limiteRaw = parseQueryPositiveId(req.query.limite);
  if (req.query.limite !== undefined && limiteRaw === null) {
    responderInvalido(res);
    return null;
  }
  const limite = Math.min(limiteRaw ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);

  const compensarRaw = parseQueryPositiveId(req.query.compensar);
  if (req.query.compensar !== undefined && compensarRaw === null) {
    responderInvalido(res);
    return null;
  }

  return {
    estudianteId,
    matriculaId,
    estado,
    fechaDesde,
    fechaHasta,
    limite,
    compensar: compensarRaw ?? 0,
  };
}

// GET /api/pagos — busqueda de operaciones con filtros y paginacion
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filtros = leerFiltrosBusqueda(req, res);
      if (filtros === null) {
        return;
      }
      const resultado = await pagosService.buscarPagos(filtros);
      res.status(200).json(resultado);
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/pagos/:id — detalle con medios y aplicaciones (importes como texto)
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      responderNoEncontrado(res);
      return;
    }
    try {
      const pago = await pagosService.obtenerDetalle(id);
      if (!pago) {
        responderNoEncontrado(res);
        return;
      }
      res.status(200).json({ pago });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/pagos/:id/comprobante — comprobante como DATO (solo lectura)
router.get(
  '/:id/comprobante',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      responderNoEncontrado(res);
      return;
    }
    try {
      // Estrictamente de lectura: el servicio solo ejecuta SELECT. No asigna
      // numero de comprobante, no escribe y no altera ningun saldo.
      const comprobante = await pagosService.obtenerComprobante(id);
      if (!comprobante) {
        responderNoEncontrado(res);
        return;
      }
      res.status(200).json({ comprobante });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/pagos/:id/comprobante.pdf — comprobante en PDF (solo lectura, generador propio)
// Mismo contrato que la version JSON: exige pagos:read y NO escribe nada. El PDF
// se genera en memoria a partir del comprobante almacenado (funcion pura, sin
// base de datos), de modo que emitirlo no altera ningun saldo (lo exige el PM).
router.get(
  '/:id/comprobante.pdf',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      responderNoEncontrado(res);
      return;
    }
    try {
      const comprobante = await pagosService.obtenerComprobante(id);
      if (!comprobante) {
        responderNoEncontrado(res);
        return;
      }
      // El PDF necesita que el comprobante este EMITIDO (tenga numero). La vista
      // previa sin fila almacenada no tiene identificador que imprimir.
      if (!comprobante.emitido || comprobante.numero_comprobante === null) {
        responderNoEncontrado(res);
        return;
      }
      const pdf = generarComprobantePdf({
        numero_comprobante: comprobante.numero_comprobante,
        fecha_emision: comprobante.fecha_emision ?? 'no registrada',
        estado: comprobante.estado,
        estudiante_nombre: comprobante.estudiante.nombre,
        grado_nombre: comprobante.matricula.grado,
        anio_lectivo: comprobante.matricula.anio_lectivo,
        monto_total: comprobante.monto_total,
        moneda: comprobante.moneda,
        pago_fecha: comprobante.pago.fecha,
        matricula_id: comprobante.matricula.id,
        pago_id: comprobante.pago.id,
        usuario_id: comprobante.usuario_id,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${comprobante.numero_comprobante}.pdf"`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(pdf);
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/pagos — registrar pago consumiendo el motor de 6.B
router.post(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const parsed = registrarPagoSchema.safeParse(req.body);
    if (!parsed.success) {
      responderInvalido(res);
      return;
    }

    const client = await getPool().connect();
    try {
      // Una UNICA transaccion atomica para todo el proceso de cobro, como exige
      // el PM ("una operacion de pago debe ejecutarse de forma atomica"):
      // revalidacion del actor -> registro del pago y sus aplicaciones
      // (motor de 6.B integrado en esta transaccion) -> emision del
      // comprobante -> auditoria. Si algo falla, ROLLBACK total: no puede
      // quedar un pago registrado sin comprobante ni al reves.
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);
      await revalidarActorEnTransaccion(client, auth, AUTH_PERMISSIONS.PAGOS_MANAGE);

      // El motor de 6.B se integra en esta transaccion (mismo PoolClient);
      // la emision del comprobante ocurre dentro, tambien con este cliente.
      const resultado = await pagosService.registrarPago(
        parsed.data,
        auth.userId,
        hashToken(auth.sessionToken),
        client
      );

      await client.query('COMMIT');

      // 201 en un registro nuevo; 200 cuando la peticion es un replay
      // idempotente (misma idempotency_key) y no se creo nada nuevo.
      res.status(resultado.idempotent_replay ? 200 : 201).json(resultado);
    } catch (error) {
      await revertirTransaccion(client, 'registro de pago');
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// POST /api/pagos/:id/reversar — reversion compensatoria (DEC-08)
router.post(
  '/:id/reversar',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.PAGOS_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      responderNoEncontrado(res);
      return;
    }

    const parsed = reversarPagoSchema.safeParse(req.body);
    if (!parsed.success) {
      responderInvalido(res);
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      await revalidarActorEnTransaccion(client, auth, AUTH_PERMISSIONS.PAGOS_MANAGE);

      // Misma transaccion y mismo PoolClient: la operacion inversa, el estado
      // final del pago original y la auditoria entran juntos o no entra nada.
      const resultado = await pagosService.reversarPago(
        id,
        parsed.data.motivo,
        client,
        auth.userId
      );

      await client.query('COMMIT');

      res.status(200).json(resultado);
    } catch (error) {
      await revertirTransaccion(client, 'reversion de pago');
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
