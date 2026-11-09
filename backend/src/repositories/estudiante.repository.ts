import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { redactError } from '../utils/redact';

export interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: Date | null;
  genero: string | null;
  documento_identidad: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

export interface EstudianteSafe {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}

export interface EstudianteRow {
  id: number;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: Date | null;
  genero: string | null;
  documento_identidad: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

export interface CreateEstudianteInput {
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  genero?: string | null;
  documento_identidad: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo?: boolean;
}

export interface UpdateEstudianteInput {
  nombres?: string;
  apellidos?: string;
  fecha_nacimiento?: string | null;
  genero?: string | null;
  documento_identidad?: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo?: boolean;
}

export class EstudianteRepository {
  constructor(private readonly pool?: Pool) {}

  private executor(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool ?? getPool();
  }

  async crear(datos: CreateEstudianteInput, client?: PoolClient): Promise<Estudiante> {
    const result = await this.executor(client).query<EstudianteRow>(
      `INSERT INTO estudiantes (
        nombres, apellidos, fecha_nacimiento, genero, documento_identidad,
        direccion, telefono, email, activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, nombres, apellidos, fecha_nacimiento, genero,
        documento_identidad, direccion, telefono, email, activo,
        creado_en, actualizado_en`,
      [
        datos.nombres,
        datos.apellidos,
        datos.fecha_nacimiento ?? null,
        datos.genero ?? null,
        datos.documento_identidad,
        datos.direccion ?? null,
        datos.telefono ?? null,
        datos.email ?? null,
        datos.activo ?? true,
      ]
    );
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorId(id: number, client?: PoolClient): Promise<Estudiante | null> {
    const result = await this.executor(client).query<EstudianteRow>(
      `SELECT id, nombres, apellidos, fecha_nacimiento, genero,
        documento_identidad, direccion, telefono, email, activo,
        creado_en, actualizado_en
       FROM estudiantes WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async obtenerPorDocumento(documento: string, client?: PoolClient): Promise<Estudiante | null> {
    const result = await this.executor(client).query<EstudianteRow>(
      `SELECT id, nombres, apellidos, fecha_nacimiento, genero,
        documento_identidad, direccion, telefono, email, activo,
        creado_en, actualizado_en
       FROM estudiantes WHERE documento_identidad = $1`,
      [documento]
    );
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async listar(
    opciones: { activo?: boolean; limite?: number; compensar?: number } = {},
    client?: PoolClient
  ): Promise<Estudiante[]> {
    const { activo, limite = 50, compensar = 0 } = opciones;
    let consulta = `SELECT id, nombres, apellidos, fecha_nacimiento, genero,
      documento_identidad, direccion, telefono, email, activo,
      creado_en, actualizado_en
     FROM estudiantes`;
    const params: unknown[] = [];
    let idx = 1;

    if (activo !== undefined) {
      consulta += ` WHERE activo = $${idx++}`;
      params.push(activo);
    }

    consulta += ` ORDER BY apellidos, nombres LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limite, compensar);

    const result = await this.executor(client).query<EstudianteRow>(consulta, params);
    return result.rows.map((fila) => this.mapearFila(fila));
  }

  async actualizar(id: number, datos: UpdateEstudianteInput, client?: PoolClient): Promise<Estudiante | null> {
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
    if (datos.fecha_nacimiento !== undefined) {
      sets.push(`fecha_nacimiento = $${idx++}`);
      params.push(datos.fecha_nacimiento);
    }
    if (datos.genero !== undefined) {
      sets.push(`genero = $${idx++}`);
      params.push(datos.genero);
    }
    if (datos.documento_identidad !== undefined) {
      sets.push(`documento_identidad = $${idx++}`);
      params.push(datos.documento_identidad);
    }
    if (datos.direccion !== undefined) {
      sets.push(`direccion = $${idx++}`);
      params.push(datos.direccion);
    }
    if (datos.telefono !== undefined) {
      sets.push(`telefono = $${idx++}`);
      params.push(datos.telefono);
    }
    if (datos.email !== undefined) {
      sets.push(`email = $${idx++}`);
      params.push(datos.email);
    }
    if (datos.activo !== undefined) {
      sets.push(`activo = $${idx++}`);
      params.push(datos.activo);
    }

    if (sets.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    params.push(id);
    const consulta = `UPDATE estudiantes SET ${sets.join(', ')}, actualizado_en = NOW()
      WHERE id = $${idx} RETURNING id, nombres, apellidos, fecha_nacimiento, genero,
        documento_identidad, direccion, telefono, email, activo,
        creado_en, actualizado_en`;

    const result = await this.executor(client).query<EstudianteRow>(consulta, params);
    if (result.rows.length === 0) return null;
    return this.mapearFila(result.rows[0]);
  }

  async desactivar(id: number, client?: PoolClient): Promise<Estudiante | null> {
    return this.actualizar(id, { activo: false }, client);
  }

  async existeDocumento(documento: string, excluirId?: number, client?: PoolClient): Promise<boolean> {
    let consulta = 'SELECT 1 FROM estudiantes WHERE documento_identidad = $1';
    const params: unknown[] = [documento];
    let idx = 2;

    if (excluirId !== undefined) {
      consulta += ` AND id <> $${idx++}`;
      params.push(excluirId);
    }

    const result = await this.executor(client).query<{ existe: boolean }>(consulta, params);
    return result.rows.length > 0;
  }

  private mapearFila(fila: EstudianteRow): Estudiante {
    return {
      id: fila.id,
      nombres: fila.nombres,
      apellidos: fila.apellidos,
      fecha_nacimiento: fila.fecha_nacimiento,
      genero: fila.genero,
      documento_identidad: fila.documento_identidad,
      direccion: fila.direccion,
      telefono: fila.telefono,
      email: fila.email,
      activo: fila.activo,
      creado_en: fila.creado_en,
      actualizado_en: fila.actualizado_en,
    };
  }

  aPerfilSeguro(estudiante: Estudiante): EstudianteSafe {
    return {
      id: estudiante.id,
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      documento_identidad: estudiante.documento_identidad,
      email: estudiante.email,
      telefono: estudiante.telefono,
      activo: estudiante.activo,
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
