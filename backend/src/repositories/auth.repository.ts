import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

export interface SafeUser {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  rolId: number;
}

export interface UserRecord extends SafeUser {
  passwordHash: string;
  activo: boolean;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  nombre: string;
  apellido: string;
  rol_id: number;
  activo: boolean;
}

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  detail: Record<string, unknown>;
}

export class AuthRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  async findUserByEmail(email: string, client?: PoolClient): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    const result = await this.executor(client).query<UserRow>(
      'SELECT id, email, password_hash, nombre, apellido, rol_id, activo FROM usuarios WHERE email = $1',
      [normalized]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      nombre: row.nombre,
      apellido: row.apellido,
      rolId: row.rol_id,
      activo: row.activo,
    };
  }

  async findUserById(id: number, client?: PoolClient): Promise<UserRecord | null> {
    const result = await this.executor(client).query<UserRow>(
      'SELECT id, email, password_hash, nombre, apellido, rol_id, activo FROM usuarios WHERE id = $1',
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      nombre: row.nombre,
      apellido: row.apellido,
      rolId: row.rol_id,
      activo: row.activo,
    };
  }

  toSafeProfile(user: UserRecord): SafeUser {
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rolId: user.rolId,
    };
  }

  async recordAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
    try {
      await this.executor(client).query(
        'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip_address, fecha) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())',
        [entry.userId, entry.action, entry.entity, entry.entityId, JSON.stringify(entry.detail), null]
      );
    } catch (error) {
      // Avoid leaking; rethrow sanitized
      throw redactError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
