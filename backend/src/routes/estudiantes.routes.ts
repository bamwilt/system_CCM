import { Router, Request, Response, NextFunction } from 'express';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf } from '../middleware/csrf';
import {
  requirePermission,
  getCurrentAuthContext,
  canGrant,
  AUTH_PERMISSIONS,
  assertActiveSession,
} from '../authorization/permissions';
import {
  createEstudianteSchema,
  updateEstudianteSchema,
  estudianteIdParamSchema,
} from '../validators/estudiante.schema';
import { EstudianteRepository } from '../repositories/estudiante.repository';
import { hashToken } from '../utils/authCrypto';

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

function perfilSeguro(estudiante: {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}) {
  return {
    id: estudiante.id,
    nombres: estudiante.nombres,
    apellidos: estudiante.apellidos,
    documento_identidad: estudiante.documento_identidad,
    email: estudiante.email,
    telefono: estudiante.telefono,
    activo: estudiante.activo,
  };
}

// GET /api/estudiantes
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_READ),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const activo = _req.query.activo === 'true' ? true : _req.query.activo === 'false' ? false : undefined;
      const limite = Math.min(parseInt(_req.query.limite as string, 10) || 50, 100);
      const compensar = parseInt(_req.query.compensar as string, 10) || 0;

      const result = await getPool().query<{
        id: number;
        nombres: string;
        apellidos: string;
        documento_identidad: string;
        email: string | null;
        telefono: string | null;
        activo: boolean;
      }>('SELECT id, nombres, apellidos, documento_identidad, email, telefono, activo FROM estudiantes ORDER BY apellidos, nombres LIMIT $1 OFFSET $2', [limite, compensar]);

      const estudiantes = result.rows.map((row) => ({
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        documento_identidad: row.documento_identidad,
        email: row.email,
        telefono: row.telefono,
        activo: row.activo,
      }));

      res.status(200).json({ estudiantes });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/estudiantes/:id
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }
    try {
      const repo = new EstudianteRepository();
      const estudiante = await repo.obtenerPorId(id);
      if (!estudiante) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
        return;
      }
      res.status(200).json({ estudiante: perfilSeguro(estudiante) });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/estudiantes
router.post(
  '/',
  requireAuth,
  requirePermission([AUTH_PERMISSIONS.ESTUDIANTES_MANAGE, AUTH_PERMISSIONS.ROLES_MANAGE]),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const parsed = createEstudianteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } });
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const existe = await repo.existeDocumento(parsed.data.documento_identidad, undefined, client);
      if (existe) {
        throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
      }

      const estudiante = await repo.crear(parsed.data, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_crear',
          entidad: 'estudiantes',
          entidadId: estudiante.id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({ estudiante: repo.aPerfilSeguro(estudiante) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/estudiantes/:id
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE),
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

    const parsed = updateEstudianteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } });
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const existente = await repo.obtenerPorId(id, client);
      if (!existente) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      if (parsed.data.documento_identidad !== undefined && parsed.data.documento_identidad !== existente.documento_identidad) {
        const existe = await repo.existeDocumento(parsed.data.documento_identidad, id, client);
        if (existe) {
          throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
        }
      }

      const actualizado = await repo.actualizar(id, parsed.data, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_actualizar',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      res.status(200).json({ estudiante: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/estudiantes/:id/desactivar
router.patch(
  '/:id/desactivar',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE),
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const actualizado = await repo.desactivar(id, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_desactivar',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      res.status(200).json({ estudiante: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
