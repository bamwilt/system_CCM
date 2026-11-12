import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf, normalizeOrigin } from '../middleware/csrf';
import { loginRateLimit } from '../middleware/rateLimit';
import { authService } from '../services/auth.service';
import { getPool } from '../config/database';
import { loginSchema } from '../validators/auth.validator';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';

const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/**
 * Permisos efectivos del usuario, desde `auth_role_permissions` (la misma fuente
 * que consulta `requirePermission`). Si el usuario no existe o esta inactivo,
 * devuelve una lista vacia: la interfaz no debe inventar permisos.
 */
async function resolverGrantsDeUsuario(userId: number): Promise<string[]> {
  const resultado = await getPool().query<{ permiso_codigo: string }>(
    `SELECT arp.permiso_codigo
       FROM usuarios u
       JOIN auth_role_permissions arp ON arp.rol_id = u.rol_id
      WHERE u.id = $1 AND u.activo = TRUE
      ORDER BY arp.permiso_codigo`,
    [userId]
  );
  return Array.from(
    new Set(resultado.rows.map((fila) => fila.permiso_codigo))
  );
}

function validateLoginRequest(req: Request, res: Response, next: NextFunction): void {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin === null || origin !== env.cors.origin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return;
  }
  if (!req.is('application/json')) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
    return;
  }
  next();
}

router.post('/login', validateLoginRequest, loginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Bad request', 400, 'BAD_REQUEST');
    }
    const result = await authService.login({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setSessionCookie(res, result.sessionToken, result.expiresAt);
    // Los permisos se resuelven desde la base (misma fuente que usa
    // requirePermission) y se entregan a la interfaz para que construya la
    // navegacion. No es control de acceso: el backend sigue validando cada
    // peticion; es para no ofrecer lo que sera rechazado.
    const grants = await resolverGrantsDeUsuario(result.user.id);
    res.status(200).json({ user: result.user, grants, csrfToken: result.csrfToken });
  } catch (error) {
    if (error instanceof Error && 'retryAfter' in error) {
      const retryAfter = (error as { retryAfter?: number }).retryAfter;
      if (typeof retryAfter === 'number') {
        res.set('Retry-After', String(retryAfter));
      }
    }
    next(error);
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const grants = await resolverGrantsDeUsuario(auth.userId);
    res.status(200).json({ user: auth.user, grants, csrfToken: auth.csrfToken });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, validateCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    await authService.logout(auth.sessionToken, auth.userId);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/recovery', (_req: Request, res: Response) => {
  res.status(503).json({
    error: { code: 'RECOVERY_UNAVAILABLE', message: 'Password recovery is not available' },
  });
});

export default router;
