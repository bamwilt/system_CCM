import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

import { Pool, PoolClient } from 'pg';
import { getPool, closePool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthRepository } from '../repositories/auth.repository';
import { hashPassword, isPasswordValid } from '../utils/authCrypto';
import { redactError } from '../utils/redact';

const ROLE_NAME = 'SGPM_AUTH_DEVELOPMENT';
const ADVISORY_LOCK_KEY = 4315003;
const AUTH_CODES = ['auth:users:manage', 'auth:roles:manage'] as const;

export interface BootstrapAuthOptions {
  env?: Record<string, string | undefined>;
  nodeEnv?: string;
  confirm?: string;
}

const emailSchema = z.string().trim().toLowerCase().email().max(255);

export async function bootstrapAuth(
  options: BootstrapAuthOptions = {},
  pool?: Pool
): Promise<{ userId: number; roleId: number }> {
  const envSource = (options.env ?? process.env) as Record<string, string | undefined>;
  const nodeEnv = options.nodeEnv ?? envSource.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv !== 'development') {
    throw new AppError('Bootstrap is only available in development', 403, 'FORBIDDEN');
  }

  const confirm = options.confirm ?? envSource.BOOTSTRAP_AUTH_CONFIRM;
  if (confirm !== 'create-development-admin') {
    throw new AppError('Bootstrap confirmation required', 403, 'FORBIDDEN');
  }

  const emailRaw = envSource.BOOTSTRAP_AUTH_EMAIL;
  const password = envSource.BOOTSTRAP_AUTH_PASSWORD;
  if (typeof emailRaw !== 'string' || emailRaw.trim() === '') {
    throw new AppError('Bootstrap email is required', 400, 'BAD_REQUEST');
  }
  if (typeof password !== 'string' || password.trim() === '') {
    throw new AppError('Bootstrap password is required', 400, 'BAD_REQUEST');
  }

  const emailParsed = emailSchema.safeParse(emailRaw);
  if (!emailParsed.success) {
    throw new AppError('Bootstrap email is invalid', 400, 'BAD_REQUEST');
  }
  const email = emailParsed.data;

  if (!isPasswordValid(password)) {
    throw new AppError('Bootstrap password is invalid', 400, 'BAD_REQUEST');
  }

  const passwordHash = await hashPassword(password, 12);

  const ownedPool = !pool;
  const dbPool: Pool = pool ?? getPool();
  const client: PoolClient = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

    const authRepo = new AuthRepository();
    const existingUser = await authRepo.findUserByEmail(email, client);
    if (existingUser) {
      throw new AppError('Bootstrap target already exists', 409, 'CONFLICT');
    }

    const existingRole = await client.query<{ id: number }>(
      'SELECT id FROM roles WHERE nombre = $1',
      [ROLE_NAME]
    );
    if (existingRole.rows.length > 0) {
      throw new AppError('Bootstrap role already exists', 409, 'CONFLICT');
    }

    const roleResult = await client.query<{ id: number }>(
      'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
      [ROLE_NAME, 'Development-only authorization role']
    );
    const roleId = roleResult.rows[0].id;

    for (const code of AUTH_CODES) {
      await client.query(
        'INSERT INTO auth_role_permissions (rol_id, permiso_codigo) VALUES ($1, $2)',
        [roleId, code]
      );
    }

    const userResult = await client.query<{ id: number }>(
      'INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id, activo) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id',
      [email, passwordHash, 'Development', 'Admin', roleId]
    );
    const userId = userResult.rows[0].id;

    await authRepo.recordAudit(
      {
        userId: null,
        action: 'bootstrap_auth',
        entity: 'usuarios',
        entityId: userId,
        detail: { result: 'success' },
      },
      client
    );

    await client.query('COMMIT');

    return { userId, roleId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    if (ownedPool) {
      await closePool().catch(() => undefined);
    }
  }
}

if (require.main === module) {
  (async () => {
    let exitCode = 0;
    try {
      const result = await bootstrapAuth({
        env: process.env,
        nodeEnv: process.env.NODE_ENV,
        confirm: process.env.BOOTSTRAP_AUTH_CONFIRM,
      });
      console.log('Bootstrap development auth completed.');
      void result;
    } catch (error) {
      exitCode = 1;
      const sanitized = redactError(error instanceof Error ? error : new Error(String(error)));
      console.error('Bootstrap failed:', sanitized.name);
    } finally {
      await closePool().catch(() => undefined);
      process.exit(exitCode);
    }
  })();
}
