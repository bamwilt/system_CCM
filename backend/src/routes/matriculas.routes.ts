import { Router, Request, Response, NextFunction } from 'express';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf } from '../middleware/csrf';
import {
  requirePermission,
  getCurrentAuthContext,
  AUTH_PERMISSIONS,
  assertActiveSession,
} from '../authorization/permissions';
import {
  createMatriculaSchema,
  updateMatriculaSchema,
} from '../validators/matricula.schema';
import { MatriculaRepository } from '../repositories/matricula.repository';
import { hashToken } from '../utils/authCrypto';
import { redactError } from '../utils/redact';
import { matriculaService } from '../services/matricula.service';

const router = Router();
const ADVISORY_LOCK_KEY = 4315003;

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

function toHttpError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  if (code === '23505') {
    return new AppError('Conflict', 409, 'CONFLICT');
  }
  if (code === '23503') {
    return new AppError('Bad request', 400, 'BAD_REQUEST');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function parseQueryPositiveId(query: unknown): number | null {
  if (query === undefined) return null;
  const value = getParamString(query as string | string[]);
  return parsePositiveId(value);
}

function perfilSeguro(matricula: {
  id: number;
  estudiante_id: number;
  anio_lectivo_id: number;
  grado_id: number;
  tutor_id: number | null;
  fecha_matricula: Date;
  estado: string;
  observaciones: string | null;
  activo: boolean;
}) {
  return {
    id: matricula.id,
    estudiante_id: matricula.estudiante_id,
    anio_lectivo_id: matricula.anio_lectivo_id,
    grado_id: matricula.grado_id,
    tutor_id: matricula.tutor_id,
    fecha_matricula: matricula.fecha_matricula,
    estado: matricula.estado,
    observaciones: matricula.observaciones,
    activo: matricula.activo,
  };
}

// GET /api/matriculas — listado con filtros
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const estudiante_id = parseQueryPositiveId(_req.query.estudiante_id);
      if (_req.query.estudiante_id !== undefined && estudiante_id === null) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
        return;
      }
      const anio_lectivo_id = parseQueryPositiveId(_req.query.anio_lectivo_id);
      if (_req.query.anio_lectivo_id !== undefined && anio_lectivo_id === null) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
        return;
      }
      const estado = _req.query.estado as string | undefined;
      if (estado !== undefined && !['ACTIVA', 'DESACTIVADA', 'COMPLETADA'].includes(estado)) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
        return;
      }
      const activo = _req.query.activo === 'true' ? true : _req.query.activo === 'false' ? false : undefined;
      const limiteRaw = parseQueryPositiveId(_req.query.limite);
      const limite = Math.min(limiteRaw ?? 50, 100);
      const compensarRaw = _req.query.compensar;
      let compensar: number;
      if (compensarRaw === undefined) {
        compensar = 0;
      } else {
        const v = parsePositiveId(getParamString(compensarRaw as string | string[]));
        if (v === null) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
          return;
        }
        compensar = v;
      }

      let consulta = `SELECT id, estudiante_id, anio_lectivo_id, grado_id, tutor_id,
        fecha_matricula, estado, observaciones,
        (estado <> 'DESACTIVADA') as activo,
        creado_en, actualizado_en
       FROM matriculas`;
      const params: unknown[] = [];
      const condiciones: string[] = [];
      let idx = 1;

      if (estudiante_id !== null) {
        condiciones.push(`estudiante_id = $${idx++}`);
        params.push(estudiante_id);
      }
      if (anio_lectivo_id !== null) {
        condiciones.push(`anio_lectivo_id = $${idx++}`);
        params.push(anio_lectivo_id);
      }
      if (estado !== undefined) {
        condiciones.push(`estado = $${idx++}`);
        params.push(estado);
      }
      if (activo !== undefined) {
        if (activo) {
          // activo = true significa NO DESACTIVADA (ACTIVA o COMPLETADA), no igual a true
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

      const result = await getPool().query<{
        id: number;
        estudiante_id: number;
        anio_lectivo_id: number;
        grado_id: number;
        tutor_id: number | null;
        fecha_matricula: Date;
        estado: string;
        observaciones: string | null;
        activo: boolean;
      }>(consulta, params);

      const matriculas = result.rows.map((row) => ({
        id: row.id,
        estudiante_id: row.estudiante_id,
        anio_lectivo_id: row.anio_lectivo_id,
        grado_id: row.grado_id,
        tutor_id: row.tutor_id,
        fecha_matricula: row.fecha_matricula,
        estado: row.estado,
        observaciones: row.observaciones,
        activo: row.activo,
      }));

      res.status(200).json({ matriculas });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/matriculas/:id — detalle
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }
    try {
      const repo = new MatriculaRepository();
      const matricula = await repo.obtenerPorId(id);
      if (!matricula) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
        return;
      }
      res.status(200).json({ matricula: repo.aPerfilSeguro(matricula) });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/matriculas/:id/plan-pago — lectura real con matriculas:read
router.get(
  '/:id/plan-pago',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    try {
      const client = await getPool().connect();
      try {
        const resultado = await matriculaService.obtenerPlanPago(id, client, auth.userId);
        res.status(200).json(resultado);
      } finally {
        client.release();
      }
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/matriculas/:id/historial — estado actual, plan, cuotas y auditoria (solo lectura)
router.get(
  '/:id/historial',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    try {
      const client = await getPool().connect();
      try {
        const resultado = await matriculaService.obtenerHistorial(id, client);
        res.status(200).json(resultado);
      } finally {
        client.release();
      }
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/matriculas — crear (transaccion unica, mismo cliente al servicio)
router.post(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const parsed = createMatriculaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.MATRICULAS_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const resultado = await matriculaService.crear(parsed.data, client, auth.userId);

      await client.query('COMMIT');

      // 201 en una creacion normal; 200 cuando la peticion es un replay
      // idempotente (misma idempotency_key) y no se creo nada nuevo.
      res.status(resultado.idempotent_replay ? 200 : 201).json({
        matricula: resultado.matricula,
        plan_pago_id: resultado.plan_pago_id,
        total_cuotas: resultado.total_cuotas,
        idempotent_replay: resultado.idempotent_replay,
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const sanitized = redactError(rollbackError);
        console.error(
          `Rollback de matricula fallido (${sanitized.name}); la transaccion pudo quedar abierta.`
        );
      }
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/matriculas/:id — actualizacion parcial (solo campos enviados)
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    const parsed = updateMatriculaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud invalida' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.MATRICULAS_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const resultado = await matriculaService.actualizar(id, parsed.data, client, auth.userId);

      await client.query('COMMIT');

      if (!resultado) {
        throw new AppError('No encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      res.status(200).json({ matricula: resultado.matricula });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const sanitized = redactError(rollbackError);
        console.error(
          `Rollback de matricula fallido (${sanitized.name}); la transaccion pudo quedar abierta.`
        );
      }
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/matriculas/:id/desactivar — conserva cuotas (no borra historial)
router.patch(
  '/:id/desactivar',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.MATRICULAS_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const resultado = await matriculaService.desactivar(id, client, auth.userId);

      await client.query('COMMIT');

      if (!resultado) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      res.status(200).json({ matricula: resultado.matricula });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const sanitized = redactError(rollbackError);
        console.error(
          `Rollback de matricula fallido (${sanitized.name}); la transaccion pudo quedar abierta.`
        );
      }
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
