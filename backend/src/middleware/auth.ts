import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { hashToken, constantTimeCompare } from '../utils/authCrypto';
import { AuthRepository, SafeUser } from '../repositories/auth.repository';
import { SessionRepository } from '../repositories/session.repository';
import { getSessionTokenFromRequest, clearSessionCookie } from '../utils/cookies';

export interface AuthSession {
  sessionId: string;
  userId: number;
  csrfHash: string;
  csrfToken: string;
  expiresAt: Date;
  user: SafeUser;
  sessionToken: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthSession;
}

export function createAuthMiddleware(
  sessionRepository: SessionRepository = new SessionRepository(),
  authRepository: AuthRepository = new AuthRepository()
) {
  async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = getSessionTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    let session;
    try {
      session = await sessionRepository.findByTokenHash(hashToken(token));
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      return;
    }
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      clearSessionCookie(res);
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    const user = await authRepository.findUserById(session.userId);
    if (!user || !user.activo) {
      await sessionRepository.revoke(session.tokenHash);
      clearSessionCookie(res);
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    const csrfToken = crypto
      .createHmac('sha256', env.auth.rateKey)
      .update('csrf:' + token, 'utf8')
      .digest('hex');
    const authSession: AuthSession = {
      sessionId: session.tokenHash,
      userId: user.id,
      csrfHash: session.csrfHash,
      csrfToken,
      expiresAt: session.expiresAt,
      user: authRepository.toSafeProfile(user),
      sessionToken: token,
    };
    (req as AuthenticatedRequest).auth = authSession;
    (res.locals as { authSession?: AuthSession }).authSession = authSession;
    next();
  }

  return { requireAuth };
}

const defaultMiddleware = createAuthMiddleware();
export const requireAuth = defaultMiddleware.requireAuth;
export const authMiddleware = requireAuth;
export const authenticate = requireAuth;
export default requireAuth;
