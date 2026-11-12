import { PoolClient } from 'pg';
import { Request, Response, NextFunction } from 'express';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const AUTH_PERMISSIONS = {
  USERS_MANAGE: 'auth:users:manage',
  ROLES_MANAGE: 'auth:roles:manage',
  ESTUDIANTES_MANAGE: 'estudiantes:manage',
  ESTUDIANTES_READ: 'estudiantes:read',
  TUTORES_MANAGE: 'tutores:manage',
  MATRICULAS_MANAGE: 'matriculas:manage',
  MATRICULAS_READ: 'matriculas:read',
  // Fase 7 (registro de pagos y comprobantes). Amplian el catalogo de codigos
  // soportados; no conceden nada a ningun rol institucional (DEC-03 abierta).
  PAGOS_MANAGE: 'pagos:manage',
  PAGOS_READ: 'pagos:read',
  REPORTES_READ: 'reportes:read',
} as const;

export type AuthPermission = (typeof AUTH_PERMISSIONS)[keyof typeof AUTH_PERMISSIONS];

export const AUTH_PERMISSION_CODES: readonly AuthPermission[] = [
  AUTH_PERMISSIONS.USERS_MANAGE,
  AUTH_PERMISSIONS.ROLES_MANAGE,
  AUTH_PERMISSIONS.ESTUDIANTES_MANAGE,
  AUTH_PERMISSIONS.ESTUDIANTES_READ,
  AUTH_PERMISSIONS.TUTORES_MANAGE,
  AUTH_PERMISSIONS.MATRICULAS_MANAGE,
  AUTH_PERMISSIONS.MATRICULAS_READ,
  AUTH_PERMISSIONS.PAGOS_MANAGE,
  AUTH_PERMISSIONS.PAGOS_READ,
  AUTH_PERMISSIONS.REPORTES_READ,
];

export const AUTH_MANAGE_PERMISSIONS = AUTH_PERMISSION_CODES;

export interface AuthContext {
  userId: number;
  roleId: number;
  grants: string[];
  permissions: string[];
  has: (permission: string) => boolean;
}

interface PermissionRequest extends Request {
  auth?: { userId?: number };
  authContext?: AuthContext;
}

function normalizeGrants(value: unknown): string[] {
  if (value instanceof Set) {
    return Array.from(value).map((item) => String(item));
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

export async function getCurrentAuthContext(
  userId: number,
  client?: PoolClient
): Promise<AuthContext | null> {
  const executor = client ?? getPool();
  const result = await executor.query<{ id: number; rol_id: number; permiso_codigo: string | null }>(
    `SELECT u.id, u.rol_id, arp.permiso_codigo
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     LEFT JOIN auth_role_permissions arp ON arp.rol_id = u.rol_id
     WHERE u.id = $1 AND u.activo = TRUE`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const grants = Array.from(
    new Set(
      result.rows
        .map((row) => row.permiso_codigo)
        .filter((code): code is string => typeof code === 'string' && code.length > 0)
    )
  ).sort();

  return {
    userId: result.rows[0].id,
    roleId: result.rows[0].rol_id,
    grants,
    permissions: grants,
    has: (permission: string) => grants.includes(permission),
  };
}

export function getAuthContext(userId: number, client?: PoolClient): Promise<AuthContext | null> {
  return getCurrentAuthContext(userId, client);
}

export function canGrant(actorGrants: unknown, targetGrants: unknown): boolean {
  const actor = new Set(normalizeGrants(actorGrants));
  const target = normalizeGrants(targetGrants);
  return target.every((grant) => actor.has(grant));
}

export function canGrantPermissions(actorGrants: unknown, targetGrants: unknown): boolean {
  return canGrant(actorGrants, targetGrants);
}

export function isSubset(actorGrants: unknown, targetGrants: unknown): boolean {
  return canGrant(actorGrants, targetGrants);
}

export async function assertActiveSession(
  client: PoolClient,
  sessionHash: string,
  userId: number
): Promise<void> {
  const result = await client.query<{
    token_hash: string;
    usuario_id: number;
    revoked_at: Date | null;
    expires_at: Date;
  }>(
    'SELECT token_hash, usuario_id, revoked_at, expires_at FROM auth_sessions WHERE token_hash = $1 FOR UPDATE',
    [sessionHash]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  if (row.usuario_id !== userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  if (row.revoked_at !== null) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  if (row.expires_at.getTime() <= Date.now()) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
}

export function requirePermission(permission: string | readonly string[] | string[]) {
  const required: readonly string[] = typeof permission === 'string' ? [permission] : permission;

  return async function permissionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const typedReq = req as PermissionRequest;
    const locals = res.locals as { authSession?: { userId?: number }; authContext?: AuthContext } | undefined;
    const auth = (typedReq.auth ?? locals?.authSession) as { userId?: number } | undefined;
    if (!auth || typeof auth.userId !== 'number') {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    let context: AuthContext | null = null;
    try {
      context = await getCurrentAuthContext(auth.userId);
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      return;
    }

    if (!context) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }

    const allowed = required.every((code) => context!.grants.includes(code));
    if (!allowed) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }

    typedReq.authContext = context;
    if (res.locals) {
      (res.locals as { authContext?: AuthContext }).authContext = context;
    }
    next();
  };
}

export default {
  AUTH_PERMISSIONS,
  AUTH_PERMISSION_CODES,
  getCurrentAuthContext,
  getAuthContext,
  canGrant,
  canGrantPermissions,
  isSubset,
  requirePermission,
  assertActiveSession,
};
