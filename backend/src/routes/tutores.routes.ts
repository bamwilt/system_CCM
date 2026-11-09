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
  createTutorSchema,
  updateTutorSchema,
  tutorIdParamSchema,
  asociarTutorSchema,
} from '../validators/tutor.schema';
import { TutorRepository } from '../repositories/tutor.repository';
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

function perfilSeguro(tutor: {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono: string | null;
  email: string | null;
  activo: boolean;
}) {
  return {
    id: tutor.id,
    nombres: tutor.nombres,
    apellidos: tutor.apellidos,
    documento_identidad: tutor.documento_identidad,
    telefono: tutor.telefono,
    email: tutor.email,
    activo: tutor.activo,
  };
}

// GET /api/tutores
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.TUTORES_MANAGE),
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
        telefono: string | null;
        email: string | null;
        activo: boolean;
      }>('SELECT id, nombres, apellidos, documento_identidad, telefono, email, activo FROM tutores ORDER BY apellidos, nombres LIMIT $1 OFFSET $2', [limite, compensar]);

      const tutores = result.rows.map((row) => ({
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        documento_identidad: row.documento_identidad,
        telefono: row.telefono,
        email: row.email,
        activo: row.activo,
      }));

      res.status(200).json({ tutores });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/tutores/:id
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.TUTORES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }
    try {
      const repo = new TutorRepository();
      const tutor = await repo.obtenerPorId(id);
      if (!tutor) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
        return;
      }
      res.status(200).json({ tutor: perfilSeguro(tutor) });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/tutores
router.post(
  '/',
  requireAuth,
  requirePermission([AUTH_PERMISSIONS.TUTORES_MANAGE, AUTH_PERMISSIONS.ROLES_MANAGE]),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const parsed = createTutorSchema.safeParse(req.body);
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.TUTORES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new TutorRepository();
      const existe = await repo.existeDocumento(parsed.data.documento_identidad, undefined, client);
      if (existe) {
        throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
      }

      const tutor = await repo.crear(parsed.data, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'tutor_crear',
          entidad: 'tutores',
          entidadId: tutor.id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({ tutor: repo.aPerfilSeguro(tutor) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/tutores/:id
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.TUTORES_MANAGE),
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

    const parsed = updateTutorSchema.safeParse(req.body);
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.TUTORES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new TutorRepository();
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
          accion: 'tutor_actualizar',
          entidad: 'tutores',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      res.status(200).json({ tutor: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/tutores/:id/desactivar
router.patch(
  '/:id/desactivar',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.TUTORES_MANAGE),
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.TUTORES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new TutorRepository();
      const actualizado = await repo.desactivar(id, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'tutor_desactivar',
          entidad: 'tutores',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      res.status(200).json({ tutor: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// POST /api/tutores/:id/estudiantes — asociar un estudiante al tutor
router.post(
  '/:id/estudiantes',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.TUTORES_MANAGE),
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

    const parsed = asociarTutorSchema.safeParse(req.body);
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.TUTORES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const tutorRepo = new TutorRepository();
      const tutor = await tutorRepo.obtenerPorId(id, client);
      if (!tutor) {
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      const estudianteResult = await client.query<{ id: number }>('SELECT id FROM estudiantes WHERE id = $1', [parsed.data.tutorId]);
      if (estudianteResult.rows.length === 0) {
        throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
      }

      // Si es principal, desactivar cualquier otro principal para este estudiante
      if (parsed.data.es_principal) {
        await client.query(
          'UPDATE estudiante_tutor SET es_principal = FALSE WHERE estudiante_id = $1 AND es_principal = TRUE',
          [parsed.data.tutorId]
        );
      }

      await tutorRepo.asociarEstudiante(id, parsed.data.tutorId, parsed.data.es_principal, client);

      await tutorRepo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'tutor_estudiante_asociar',
          entidad: 'estudiante_tutor',
          entidadId: parsed.data.tutorId,
          detalle: { resultado: 'exito', tutor_id: id, es_principal: parsed.data.es_principal },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({ mensaje: 'Estudiante asociado al tutor' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
