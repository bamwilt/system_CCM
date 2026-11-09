import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';

export interface SessionRecord {
  tokenHash: string;
  userId: number;
  csrfHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface SessionRow {
  token_hash: string;
  usuario_id: number;
  csrf_hash: string;
  creado_en: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export class SessionRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  async create(session: {
    tokenHash: string;
    userId: number;
    csrfHash: string;
    expiresAt: Date;
  }, client?: PoolClient): Promise<void> {
    await this.executor(client).query(
      'INSERT INTO auth_sessions (token_hash, usuario_id, csrf_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [session.tokenHash, session.userId, session.csrfHash, session.expiresAt]
    );
  }

  async findByTokenHash(tokenHash: string, client?: PoolClient): Promise<SessionRecord | null> {
    const result = await this.executor(client).query<SessionRow>(
      'SELECT token_hash, usuario_id, csrf_hash, creado_en, expires_at, revoked_at FROM auth_sessions WHERE token_hash = $1',
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      tokenHash: row.token_hash,
      userId: row.usuario_id,
      csrfHash: row.csrf_hash,
      createdAt: row.creado_en,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async revoke(tokenHash: string, client?: PoolClient): Promise<void> {
    await this.executor(client).query(
      'UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash]
    );
  }

  async revokeAllForUser(userId: number, client?: PoolClient): Promise<void> {
    await this.executor(client).query(
      'UPDATE auth_sessions SET revoked_at = NOW() WHERE usuario_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }
}
