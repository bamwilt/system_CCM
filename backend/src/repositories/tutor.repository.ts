import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

export interface Tutor {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  parentesco: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

export interface TutorSafe {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono: string | null;
  email: string | null;
  activo: boolean;
}

export interface TutorRow {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  parentesco: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

export interface CreateTutorInput {
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  parentesco?: string | null;
  activo?: boolean;
}

export interface UpdateTutorInput {
  nombres?: string;
  apellidos?: string;
  documento_identidad?: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  parentesco?: string | null;
  activo?: boolean;
}

export class TutorRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  async crear(datos: CreateTutorInput, client?: PoolClient): Promise<Tutor> {
    const result = await this.executor(client).query<TutorRow>(
      `INSERT INTO tutores (
        nombres, apellidos, documento_identidad, telefono, email,
        direccion, parentesco, activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, nombres, apellidos, documento_identidad, telefono,
        email, direccion, parentesco, activo, creado_en, actualizado_en`,
      [
        datos.nombres,
        datos.apellidos,
        datos.documento_identidad,
        datos.telefono ?? null,
        datos.email ?? null,
        datos.direccion ?? null,
        datos.parentesco ?? null,
        datos.activo ?? true,
      ]
    );
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorId(id: number, client?: PoolClient): Promise<Tutor | null> {
    const result = await this.executor(client).query<TutorRow>(
      `SELECT id, nombres, apellidos, documento_identidad, telefono, email,
        direccion, parentesco, activo, creado_en, actualizado_en
       FROM tutores WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorDocumento(documento: string, client?: PoolClient): Promise<Tutor | null> {
    const result = await this.executor(client).query<TutorRow>(
      `SELECT id, nombres, apellidos, documento_identidad, telefono, email,
        direccion, parentesco, activo, creado_en, actualizado_en
       FROM tutores WHERE documento_identidad = $1`,
      [documento]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async listar(
    opciones: { activo?: boolean; limite?: number; compensar?: number } = {},
    client?: PoolClient
  ): Promise<Tutor[]> {
    const { activo, limite = 50, compensar = 0 } = opciones;
    let consulta = `SELECT id, nombres, apellidos, documento_identidad, telefono,
      email, direccion, parentesco, activo, creado_en, actualizado_en
     FROM tutores`;
    const params: unknown[] = [];
    let idx = 1;

    if (activo !== undefined) {
      consulta += ` WHERE activo = $${idx++}`;
      params.push(activo);
    }

    consulta += ` ORDER BY apellidos, nombres LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limite, compensar);

    const result = await this.executor(client).query<TutorRow>(consulta, params);
    return result.rows.map((fila) => this.mapearFila(fila));
  }

  async actualizar(id: number, datos: UpdateTutorInput, client?: PoolClient): Promise<Tutor | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (datos.nombres !== undefined) {
      sets.push(`nombres = $${idx++}`);
      params.push(datos.nombres);
    }
    if (datos.apellidos !== undefined) {
      sets.push(`apellidos = $${idx++}`);
      params.push(datos.apellidos);
    }
    if (datos.documento_identidad !== undefined) {
      sets.push(`documento_identidad = $${idx++}`);
      params.push(datos.documento_identidad);
    }
    if (datos.telefono !== undefined) {
      sets.push(`telefono = $${idx++}`);
      params.push(datos.telefono);
    }
    if (datos.email !== undefined) {
      sets.push(`email = $${idx++}`);
      params.push(datos.email);
    }
    if (datos.direccion !== undefined) {
      sets.push(`direccion = $${idx++}`);
      params.push(datos.direccion);
    }
    if (datos.parentesco !== undefined) {
      sets.push(`parentesco = $${idx++}`);
      params.push(datos.parentesco);
    }
    if (datos.activo !== undefined) {
      sets.push(`activo = $${idx++}`);
      params.push(datos.activo);
    }

    if (sets.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    params.push(id);
    const consulta = `UPDATE tutores SET ${sets.join(', ')}, actualizado_en = NOW()
      WHERE id = $${idx} RETURNING id, nombres, apellidos, documento_identidad, telefono,
        email, direccion, parentesco, activo, creado_en, actualizado_en`;

    const result = await this.executor(client).query<TutorRow>(consulta, params);
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async desactivar(id: number, client?: PoolClient): Promise<Tutor | null> {
    return this.actualizar(id, { activo: false }, client);
  }

  async existeDocumento(documento: string, excluirId?: number, client?: PoolClient): Promise<boolean> {
    let consulta = 'SELECT 1 FROM tutores WHERE documento_identidad = $1';
    const params: unknown[] = [documento];
    let idx = 2;

    if (excluirId !== undefined) {
      consulta += ` AND id <> $${idx++}`;
      params.push(excluirId);
    }

    const result = await this.executor(client).query<{ existe: boolean }>(consulta, params);
    return result.rows.length > 0;
  }

  async listarEstudiantesAsociados(tutorId: number, client?: PoolClient): Promise<Array<{ id: number; nombres: string; apellidos: string; es_principal: boolean }>> {
    const result = await this.executor(client).query<{ id: number; nombres: string; apellidos: string; es_principal: boolean }>(
      `SELECT e.id, e.nombres, e.apellidos, et.es_principal
       FROM estudiante_tutor et
       JOIN estudiantes e ON e.id = et.estudiante_id
       WHERE et.tutor_id = $1
       ORDER BY e.apellidos, e.nombres`,
      [tutorId]
    );
    return result.rows;
  }

  async asociarEstudiante(
    tutorId: number,
    estudianteId: number,
    esPrincipal: boolean,
    client?: PoolClient
  ): Promise<void> {
    await this.executor(client).query(
      `INSERT INTO estudiante_tutor (tutor_id, estudiante_id, es_principal) VALUES ($1, $2, $3)
       ON CONFLICT (tutor_id, estudiante_id) DO UPDATE SET es_principal = EXCLUDED.es_principal`,
      [tutorId, estudianteId, esPrincipal]
    );
  }

  async desasociarEstudiante(tutorId: number, estudianteId: number, client?: PoolClient): Promise<void> {
    await this.executor(client).query(
      'DELETE FROM estudiante_tutor WHERE tutor_id = $1 AND estudiante_id = $2',
      [tutorId, estudianteId]
    );
  }

  async estudianteTieneTutorPrincipal(estudianteId: number, client?: PoolClient): Promise<boolean> {
    const result = await this.executor(client).query<{ existe: boolean }>(
      `SELECT 1 FROM estudiante_tutor WHERE estudiante_id = $1 AND es_principal = TRUE LIMIT 1`,
      [estudianteId]
    );
    return result.rows.length > 0;
  }

  private mapearFila(fila: TutorRow): Tutor {
    return {
      id: fila.id,
      nombres: fila.nombres,
      apellidos: fila.apellidos,
      documento_identidad: fila.documento_identidad,
      telefono: fila.telefono,
      email: fila.email,
      direccion: fila.direccion,
      parentesco: fila.parentesco,
      activo: fila.activo,
      creado_en: fila.creado_en,
      actualizado_en: fila.actualizado_en,
    };
  }

  aPerfilSeguro(tutor: Tutor): TutorSafe {
    return {
      id: tutor.id,
      nombres: tutor.nombres,
      apellidos: tutor.apellidos,
      documento_identidad: tutor.documento_identidad,
      telefono: tutor.telefono,
      email: tutor.email,
      activo: tutor.activo,
    };
  }

  async registrarAuditoria(
    entrada: {
      usuarioId: number | null;
      accion: string;
      entidad: string;
      entidadId: number | null;
      detalle: Record<string, unknown>;
    },
    client?: PoolClient
  ): Promise<void> {
    try {
      await this.executor(client).query(
        'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip_address, fecha) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())',
        [entrada.usuarioId, entrada.accion, entrada.entidad, entrada.entidadId, JSON.stringify(entrada.detalle), null]
      );
    } catch (error) {
      throw redactError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
