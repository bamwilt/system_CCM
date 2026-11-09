import crypto from 'node:crypto';
import { PoolClient } from 'pg';
import { env } from '../config/env';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthRepository, SafeUser, UserRecord } from '../repositories/auth.repository';
import { SessionRepository } from '../repositories/session.repository';
import {
  generateSessionToken,
  hashToken,
  isPasswordValid,
  isValidPasswordHash,
  verifyPassword,
  getDummyPasswordHash,
} from '../utils/authCrypto';
import { rateBucketKey } from '../utils/authCrypto';
import { setSessionCookie } from '../utils/cookies';

export class RateLimitedError extends AppError {
  retryAfter: number;
  constructor(retryAfterSeconds: number) {
    super('Too many requests', 429, 'RATE_LIMITED');
    this.retryAfter = retryAfterSeconds > 0 ? retryAfterSeconds : 1;
  }
}

export interface LoginResult {
  user: SafeUser;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

interface ConsumeResult {
  allowed: boolean;
  retryAfterMs: number;
}

async function consumeWindow(
  client: PoolClient,
  key: string,
  max: number,
  windowMs: number,
  now: Date
): Promise<ConsumeResult> {
  await client.query(
    'INSERT INTO auth_login_limits (bucket_key) VALUES ($1) ON CONFLICT (bucket_key) DO NOTHING',
    [key]
  );
  const result = await client.query<{
    window_start: Date;
    attempts: number;
    blocked_until: Date | null;
  }>(
    'SELECT window_start, attempts, blocked_until FROM auth_login_limits WHERE bucket_key = $1 FOR UPDATE',
    [key]
  );
  const row = result.rows[0];
  let windowStart = new Date(row.window_start);
  let attempts = Number(row.attempts);
  let blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;

  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    return { allowed: false, retryAfterMs: blockedUntil.getTime() - now.getTime() };
  }

  if (now.getTime() - windowStart.getTime() >= windowMs) {
    windowStart = now;
    attempts = 0;
    blockedUntil = null;
  }

  attempts += 1;
  const allowed = attempts <= max;
  const newBlockedUntil = allowed ? null : new Date(windowStart.getTime() + windowMs);
  await client.query(
    'UPDATE auth_login_limits SET window_start = $2, attempts = $3, blocked_until = $4, actualizado_en = NOW() WHERE bucket_key = $1',
    [key, windowStart, attempts, newBlockedUntil]
  );
  const retryAfterMs = allowed ? 0 : newBlockedUntil!.getTime() - now.getTime();
  return { allowed, retryAfterMs };
}

export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository = new AuthRepository(),
    private readonly sessionRepo: SessionRepository = new SessionRepository()
  ) {}

  async preLoginRateLimit(ip: string): Promise<void> {
    const now = new Date();
    const ipKey = rateBucketKey({ prefix: 'ip', value: ip, secret: env.auth.rateKey });
    const globalKey = rateBucketKey({ prefix: 'global', value: 'global', secret: env.auth.rateKey });
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const ipResult = await consumeWindow(client, ipKey, env.auth.ipRateLimit.max, env.auth.ipRateLimit.windowMs, now);
      if (!ipResult.allowed) {
        await client.query('COMMIT');
        throw new RateLimitedError(Math.ceil(ipResult.retryAfterMs / 1000));
      }
      const globalResult = await consumeWindow(client, globalKey, env.auth.globalRateLimit.max, env.auth.globalRateLimit.windowMs, now);
      await client.query('COMMIT');
      if (!globalResult.allowed) {
        throw new RateLimitedError(Math.ceil(globalResult.retryAfterMs / 1000));
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeGlobalRateLimit(now: Date): Promise<void> {
    const globalKey = rateBucketKey({ prefix: 'global', value: 'global', secret: env.auth.rateKey });
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const globalResult = await consumeWindow(client, globalKey, env.auth.globalRateLimit.max, env.auth.globalRateLimit.windowMs, now);
      await client.query('COMMIT');
      if (!globalResult.allowed) {
        throw new RateLimitedError(Math.ceil(globalResult.retryAfterMs / 1000));
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const identityKey = rateBucketKey({ prefix: 'identity', value: normalizedEmail, secret: env.auth.rateKey });
    const now = new Date();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO auth_login_limits (bucket_key) VALUES ($1) ON CONFLICT (bucket_key) DO NOTHING',
        [identityKey]
      );
      const limitResult = await client.query<{
        window_start: Date;
        attempts: number;
        blocked_until: Date | null;
      }>(
        'SELECT window_start, attempts, blocked_until FROM auth_login_limits WHERE bucket_key = $1 FOR UPDATE',
        [identityKey]
      );
      const row = limitResult.rows[0];
      let windowStart = new Date(row.window_start);
      let attempts = Number(row.attempts);
      let blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;

      if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
        await client.query('COMMIT');
        throw new RateLimitedError(Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
      }

      if (now.getTime() - windowStart.getTime() >= env.auth.loginWindowMs) {
        windowStart = now;
        attempts = 0;
        blockedUntil = null;
      }

      const userSnapshot = await this.authRepo.findUserByEmail(normalizedEmail, client);

      let passwordValid = false;
      if (userSnapshot !== null && userSnapshot.activo && isValidPasswordHash(userSnapshot.passwordHash) && isPasswordValid(input.password)) {
        passwordValid = await verifyPassword(input.password, userSnapshot.passwordHash);
      } else {
        const dummyInput = isPasswordValid(input.password) ? input.password : 'a'.repeat(12);
        await verifyPassword(dummyInput, getDummyPasswordHash());
        passwordValid = false;
      }

      if (!passwordValid) {
        attempts += 1;
        const newBlockedUntil =
          attempts >= env.auth.loginMaxFailures
            ? new Date(now.getTime() + env.auth.loginWindowMs)
            : null;
        await client.query(
          'UPDATE auth_login_limits SET window_start = $2, attempts = $3, blocked_until = $4, actualizado_en = NOW() WHERE bucket_key = $1',
          [identityKey, windowStart, attempts, newBlockedUntil]
        );
        await this.authRepo.recordAudit(
          {
            userId: userSnapshot ? userSnapshot.id : null,
            action: 'login_failure',
            entity: 'auth',
            entityId: null,
            detail: { result: 'invalid_credentials' },
          },
          client
        );
        await client.query('COMMIT');
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // success: reset identity counter
      await client.query(
        'UPDATE auth_login_limits SET window_start = $2, attempts = 0, blocked_until = NULL, actualizado_en = NOW() WHERE bucket_key = $1',
        [identityKey, now]
      );

      // Advisory lock to serialize login with password changes/revocations
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      // Re-read user under lock: reject if credentials changed or account inactive
      if (!userSnapshot) {
        await client.query('COMMIT');
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }
      const user = await this.authRepo.findUserById(userSnapshot.id, client);
      if (
        !user ||
        !user.activo ||
        user.passwordHash !== userSnapshot.passwordHash ||
        user.rolId !== userSnapshot.rolId
      ) {
        await client.query('COMMIT');
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const sessionToken = generateSessionToken();
      const csrfToken = crypto
        .createHmac('sha256', env.auth.rateKey)
        .update('csrf:' + sessionToken, 'utf8')
        .digest('hex');
      const tokenHash = hashToken(sessionToken);
      const csrfHash = hashToken(csrfToken);
      const expiresAt = new Date(Date.now() + env.auth.sessionTtlMs);

      await this.sessionRepo.create(
        { tokenHash, userId: user.id, csrfHash, expiresAt },
        client
      );

      await this.authRepo.recordAudit(
        {
          userId: user!.id,
          action: 'login_success',
          entity: 'auth',
          entityId: user!.id,
          detail: { result: 'success' },
        },
        client
      );

      await client.query('COMMIT');

      return {
        user: this.authRepo.toSafeProfile(user as UserRecord),
        sessionToken,
        csrfToken,
        expiresAt,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      try {
        client.release();
      } catch {
        // ignore
      }
    }
  }

  async logout(sessionToken: string, userId: number): Promise<void> {
    const tokenHash = hashToken(sessionToken);
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const session = await this.sessionRepo.findByTokenHash(tokenHash, client);
      if (
        !session ||
        session.userId !== userId ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        await client.query('COMMIT');
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      await this.sessionRepo.revoke(tokenHash, client);
      await this.authRepo.recordAudit(
        {
          userId,
          action: 'logout',
          entity: 'auth',
          entityId: userId,
          detail: { result: 'success' },
        },
        client
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMe(sessionToken: string): Promise<{ user: SafeUser; csrfToken: string }> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.sessionRepo.findByTokenHash(tokenHash);
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const user = await this.authRepo.findUserById(session.userId);
    if (!user || !user.activo) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const csrfToken = crypto
      .createHmac('sha256', env.auth.rateKey)
      .update('csrf:' + sessionToken, 'utf8')
      .digest('hex');
    return { user: this.authRepo.toSafeProfile(user), csrfToken };
  }
}

export const authService = new AuthService();
