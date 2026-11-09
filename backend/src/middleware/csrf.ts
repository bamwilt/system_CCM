import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { hashToken, constantTimeCompare } from '../utils/authCrypto';
import { getSessionTokenFromRequest } from '../utils/cookies';

export function normalizeOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requireMatchingOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin === null || origin !== env.cors.origin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return;
  }
  next();
}

export function validateCsrf(req: Request, res: Response, next: NextFunction): void {
  const auth = (res.locals as { authSession?: { csrfHash: string } }).authSession;
  if (!auth) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }
  const origin = normalizeOrigin(req.headers.origin);
  if (origin === null || origin !== env.cors.origin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return;
  }
  const headerValue = req.headers['x-csrf-token'];
  if (typeof headerValue !== 'string' || !/^[0-9a-f]{64}$/.test(headerValue)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return;
  }
  const headerHash = hashToken(headerValue);
  if (!constantTimeCompare(headerHash, auth.csrfHash)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return;
  }
  next();
}

export { getSessionTokenFromRequest };

export const csrfProtection = validateCsrf;
export const csrfMiddleware = validateCsrf;
export default validateCsrf;
