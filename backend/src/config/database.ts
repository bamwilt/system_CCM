import { Pool, PoolClient } from 'pg';
import { env } from './env';

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

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    const result = await client.query('SELECT 1 as ok');
    client.release();
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { PoolClient };
