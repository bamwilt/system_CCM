import { Router, Request, Response, NextFunction } from 'express';
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
import { hashPassword, hashToken } from '../utils/authCrypto';
import { env } from '../config/env';
import { createUserSchema, updateUserSchema } from '../validators/auth.validator';

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

function safeProfile(user: { id: number; email: string; nombre: string; apellido: string; rolId: number; activo: boolean }) {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    rolId: user.rolId,
    activo: user.activo,
  };
}

// GET /api/users
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.USERS_MANAGE),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getPool().query<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        rol_id: number;
        activo: boolean;
      }>('SELECT id, email, nombre, apellido, rol_id, activo FROM usuarios ORDER BY id');
      const users = result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        nombre: row.nombre,
        apellido: row.apellido,
        rolId: row.rol_id,
        activo: row.activo,
      }));
      res.status(200).json({ users });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/users/:id
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.USERS_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
    try {
      const authRepo = new AuthRepository();
      const user = await authRepo.findUserById(id);
      if (!user) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
        return;
      }
      res.status(200).json({ user: safeProfile(user) });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/users
router.post(
  '/',
  requireAuth,
  requirePermission([AUTH_PERMISSIONS.USERS_MANAGE, AUTH_PERMISSIONS.ROLES_MANAGE]),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
      return;
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(parsed.data.password, env.auth.bcryptCost);
    } catch {
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
      if (!actor.grants.includes(AUTH_PERMISSIONS.USERS_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ROLES_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const roleResult = await client.query<{ id: number }>(
        'SELECT id FROM roles WHERE id = $1 FOR UPDATE',
        [parsed.data.rolId]
      );
      if (roleResult.rows.length === 0) {
        throw new AppError('Not found', 404, 'NOT_FOUND');
      }

      const grantResult = await client.query<{ permiso_codigo: string }>(
        'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1',
        [parsed.data.rolId]
      );
      const targetGrants = grantResult.rows.map((row) => row.permiso_codigo);
      if (!canGrant(actor.grants, targetGrants)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }

      const authRepo = new AuthRepository();
      const existing = await authRepo.findUserByEmail(parsed.data.email, client);
      if (existing) {
        throw new AppError('Conflict', 409, 'CONFLICT');
      }

      const insertResult = await client.query<{ id: number }>(
        'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id',
        [parsed.data.email, passwordHash, parsed.data.nombre, parsed.data.apellido, parsed.data.rolId]
      );
      const newId = insertResult.rows[0].id;

      await authRepo.recordAudit(
        {
          userId: auth.userId,
          action: 'user_create',
          entity: 'usuarios',
          entityId: newId,
          detail: { result: 'success' },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({
        user: {
          id: newId,
          email: parsed.data.email,
          nombre: parsed.data.nombre,
          apellido: parsed.data.apellido,
          rolId: parsed.data.rolId,
          activo: true,
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

// PATCH /api/users/:id
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.USERS_MANAGE),
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

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
      return;
    }

    const wantsRoleChange = parsed.data.rolId !== undefined;

    let passwordHash: string | undefined;
    if (parsed.data.password !== undefined) {
      try {
        passwordHash = await hashPassword(parsed.data.password, env.auth.bcryptCost);
      } catch {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
        return;
      }
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.USERS_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      if (wantsRoleChange && !actor.grants.includes(AUTH_PERMISSIONS.ROLES_MANAGE)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }
      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const authRepo = new AuthRepository();
      const sessionRepo = new SessionRepository();

      const userResult = await client.query<{
        id: number;
        email: string;
        nombre: string;
        apellido: string;
        rol_id: number;
        activo: boolean;
      }>('SELECT id, email, nombre, apellido, rol_id, activo FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
      if (userResult.rows.length === 0) {
        throw new AppError('Not found', 404, 'NOT_FOUND');
      }
      const targetUser = userResult.rows[0];

      const currentGrantResult = await client.query<{ permiso_codigo: string }>(
        'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1',
        [targetUser.rol_id]
      );
      const currentGrants = currentGrantResult.rows.map((row) => row.permiso_codigo);
      if (!canGrant(actor.grants, currentGrants)) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }

      if (wantsRoleChange) {
        const newRoleResult = await client.query<{ id: number }>(
          'SELECT id FROM roles WHERE id = $1 FOR UPDATE',
          [parsed.data.rolId]
        );
        if (newRoleResult.rows.length === 0) {
          throw new AppError('Not found', 404, 'NOT_FOUND');
        }
        const newGrantResult = await client.query<{ permiso_codigo: string }>(
          'SELECT permiso_codigo FROM auth_role_permissions WHERE rol_id = $1',
          [parsed.data.rolId]
        );
        const newGrants = newGrantResult.rows.map((row) => row.permiso_codigo);
        if (!canGrant(actor.grants, newGrants)) {
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
      if (parsed.data.apellido !== undefined) {
        sets.push(`apellido = $${idx++}`);
        params.push(parsed.data.apellido);
      }
      if (parsed.data.activo !== undefined) {
        sets.push(`activo = $${idx++}`);
        params.push(parsed.data.activo);
      }
      if (passwordHash !== undefined) {
        sets.push(`password_hash = $${idx++}`);
        params.push(passwordHash);
      }
      if (parsed.data.rolId !== undefined) {
        sets.push(`rol_id = $${idx++}`);
        params.push(parsed.data.rolId);
      }

      if (sets.length === 0) {
        throw new AppError('Bad request', 400, 'BAD_REQUEST');
      }

      params.push(id);
      await client.query(
        `UPDATE usuarios SET ${sets.join(', ')}, actualizado_en = NOW() WHERE id = $${idx}`,
        params
      );

      const revokeSessions =
        passwordHash !== undefined ||
        parsed.data.activo === false ||
        parsed.data.rolId !== undefined;
      if (revokeSessions) {
        await sessionRepo.revokeAllForUser(id, client);
      }

      await authRepo.recordAudit(
        {
          userId: auth.userId,
          action: 'user_update',
          entity: 'usuarios',
          entityId: id,
          detail: { result: 'success' },
        },
        client
      );

      await client.query('COMMIT');

      const updated = await authRepo.findUserById(id, client);
      if (!updated) {
        throw new AppError('Not found', 404, 'NOT_FOUND');
      }
      res.status(200).json({ user: safeProfile(updated) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
