import { Router, Request, Response, NextFunction } from 'express';
import { hashToken } from '../utils/authCrypto';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf } from '../middleware/csrf';
import { SessionRepository } from '../repositories/session.repository';
import { AuthRepository } from '../repositories/auth.repository';
import {
  requirePermission,
  getCurrentAuthContext,
  canGrant,
  assertActiveSession,
  AUTH_PERMISSIONS,
} from '../authorization/permissions';
import { createRoleSchema, updateRoleSchema } from '../validators/auth.validator';

const router = Router();
const ADVISORY_LOCK_KEY = 4315003;

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function parsePositiveId(value: string | string[]): number | null {
  if (typeof value !== 'string') {
    return null;
  }
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

// GET /api/roles
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ROLES_MANAGE),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rolesResult = await getPool().query<{ id: number; nombre: string; descripcion: string | null }>(
        'SELECT id, nombre, descripcion FROM roles ORDER BY id'
      );
      const grantsResult = await getPool().query<{ rol_id: number; permiso_codigo: string }>(
        'SELECT rol_id, permiso_codigo FROM auth_role_permissions'
      );
      const grantsByRole = new Map<number, string[]>();
      for (const row of grantsResult.rows) {
        const list = grantsByRole.get(row.rol_id) ?? [];
        list.push(row.permiso_codigo);
        grantsByRole.set(row.rol_id, list);
      }
      const roles = rolesResult.rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        descripcion: row.descripcion,
        permisos: (grantsByRole.get(row.id) ?? []).slice().sort(),
      }));
      res.status(200).json({ roles });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/roles
router.post(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ROLES_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
      return;
    }

    const requested = parsed.data.permisos;

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ROLES_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      if (!canGrant(actor.grants, requested)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const existing = await client.query<{ id: number }>(
        'SELECT id FROM roles WHERE nombre = $1',
        [parsed.data.nombre]
      );
      if (existing.rows.length > 0) {
        throw new AppError('Conflict', 409, 'CONFLICT');
      }

      const insertResult = await client.query<{ id: number }>(
        'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
        [parsed.data.nombre, parsed.data.descripcion ?? null]
      );
      const roleId = insertResult.rows[0].id;

      for (const code of requested) {
        await client.query(
          'INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)',
          [roleId, code]
        );
      }

      const authRepo = new AuthRepository();
      await authRepo.recordAudit(
        {
          userId: auth.userId,
          action: 'role_create',
          entity: 'roles',
          entityId: roleId,
          detail: { result: 'success' },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({
        role: {
          id: roleId,
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion ?? null,
          permisos: requested.slice().sort(),
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/roles/:id
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ROLES_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    const id = parsePositiveId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }

    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ROLES_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const roleResult = await client.query<{ id: number; nombre: string; descripcion: string | null }>(
        'SELECT id, nombre, descripcion FROM roles WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (roleResult.rows.length === 0) {
        throw new AppError('Not found', 404, 'NOT_FOUND');
      }

      const currentGrantResult = await client.query<{ permiso_codigo: string }>(
        'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1',
        [id]
      );
      const currentGrants = currentGrantResult.rows.map((row) => row.permiso_codigo);
      if (!canGrant(actor.grants, currentGrants)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }

      if (parsed.data.nombre !== undefined) {
        const conflict = await client.query<{ id: number }>(
          'SELECT id FROM roles WHERE nombre = $1 AND id <> $2',
          [parsed.data.nombre, id]
        );
        if (conflict.rows.length > 0) {
          throw new AppError('Conflict', 409, 'CONFLICT');
        }
      }

      if (parsed.data.permisos !== undefined) {
        if (!canGrant(actor.grants, parsed.data.permisos)) {
          throw new AppError('Forbidden', 403, 'FORBIDDEN');
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (parsed.data.nombre !== undefined) {
        sets.push(`nombre = $${idx++}`);
        params.push(parsed.data.nombre);
      }
      if (parsed.data.descripcion !== undefined) {
        sets.push(`descripcion = $${idx++}`);
        params.push(parsed.data.descripcion);
      }
      if (sets.length > 0) {
        params.push(id);
        await client.query(
          `UPDATE roles SET ${sets.join(', ')} WHERE id = $${idx}`,
          params
        );
      }

      let permissionsChanged = false;
      if (parsed.data.permisos !== undefined) {
        permissionsChanged = true;
        await client.query('DELETE FROM auth_role_permissions WHERE rol_id = $1', [id]);
        for (const code of parsed.data.permisos) {
          await client.query(
            'INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)',
            [id, code]
          );
        }
      }

      if (permissionsChanged) {
        const sessionRepo = new SessionRepository();
        const usersResult = await client.query<{ id: number }>(
          'SELECT id FROM usuarios WHERE rol_id = $1',
          [id]
        );
        for (const row of usersResult.rows) {
          await sessionRepo.revokeAllForUser(row.id, client);
        }
      }

      const authRepo = new AuthRepository();
      await authRepo.recordAudit(
        {
          userId: auth.userId,
          action: 'role_update',
          entity: 'roles',
          entityId: id,
          detail: { result: 'success' },
        },
        client
      );

      await client.query('COMMIT');

      const finalRoleResult = await getPool().query<{ id: number; nombre: string; descripcion: string | null }>(
        'SELECT id, nombre, descripcion FROM roles WHERE id = $1',
        [id]
      );
      const finalGrantsResult = await getPool().query<{ permiso_codigo: string }>(
        'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1',
        [id]
      );
      const role = finalRoleResult.rows[0];
      res.status(200).json({
        role: {
          id: role.id,
          nombre: role.nombre,
          descripcion: role.descripcion,
          permisos: finalGrantsResult.rows.map((r) => r.permiso_codigo).sort(),
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
