import { Pool, PoolClient } from 'pg';
import { env } from './env';
import { redactError } from '../utils/redact';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
      user: env.db.user,
      password: env.db.password,
      min: env.db.poolMin,
      max: env.db.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', () => {
      // Do not log raw error details
      const sanitized = redactError(new Error('idle client error'));
      void sanitized;
    });
  }
  return pool;
}

export async function testConnection(): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await getPool().connect();
    const result = await client.query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { PoolClient };
