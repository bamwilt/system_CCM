import { Pool } from 'pg';
import path from 'node:path';

import { PROJECT_ROOT, APPROVED_SOCKET_DIR } from './testEnv.js';

const APPROVED_DB_NAME = 'sgpm_auth_test';
const APPROVED_PORT = '55433';
const APPROVED_USER = 'sgpm_test';

/**
 * Returns an isolated test database URL only when it is explicitly provided and
 * points at the approved local Unix-socket instance. Rejects TCP hosts and any
 * socket directory outside the approved project path. Never falls back to
 * sgpm_dev or to any host database. Returns null when no approved isolated
 * instance is available (caller must skip, not claim coverage).
 */
export function getTestDatabaseUrl(): string | null {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Unix-socket only: no TCP hostname, no embedded credentials in authority.
  if (url.hostname !== '') {
    return null;
  }
  if (url.username !== '' || url.password !== '') {
    return null;
  }

  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (dbName !== APPROVED_DB_NAME) {
    return null;
  }

  const socketHost = url.searchParams.get('host');
  if (!socketHost || socketHost.trim() === '') {
    return null;
  }
  if (path.resolve(socketHost) !== APPROVED_SOCKET_DIR) {
    return null;
  }

  const port = url.searchParams.get('port');
  if (port !== APPROVED_PORT) {
    return null;
  }

  const user = url.searchParams.get('user');
  if (user !== null && user !== APPROVED_USER) {
    return null;
  }

  if (url.searchParams.has('password')) {
    return null;
  }

  return trimmed;
}

export async function createTestPool(): Promise<Pool> {
  const url = getTestDatabaseUrl();
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set to the approved isolated instance');
  }
  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 5000,
  });
  try {
    const client = await pool.connect();
    client.release();
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error instanceof Error ? error : new Error(String(error));
  }
  return pool;
}

export async function closeTestPool(pool: Pool | null): Promise<void> {
  if (pool) {
    await pool.end().catch(() => undefined);
  }
}