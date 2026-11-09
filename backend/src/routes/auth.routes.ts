import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf, normalizeOrigin } from '../middleware/csrf';
import { loginRateLimit } from '../middleware/rateLimit';
import { authService } from '../services/auth.service';
import { loginSchema } from '../validators/auth.validator';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';

const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

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
    res.status(200).json({ user: result.user, csrfToken: result.csrfToken });
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
    res.status(200).json({ user: auth.user, csrfToken: auth.csrfToken });
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
