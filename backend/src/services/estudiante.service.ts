import { PoolClient } from 'pg';
import { env } from '../config/env';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  EstudianteRepository,
  Estudiante,
  EstudianteSafe,
  CreateEstudianteInput,
  UpdateEstudianteInput,
} from '../repositories/estudiante.repository';

export interface CrearEstudianteResultado {
  estudiante: EstudianteSafe;
}

export class EstudianteService {
  constructor(
    private readonly estudianteRepo: EstudianteRepository = new EstudianteRepository()
  ) {}

  async crear(datos: CreateEstudianteInput, actorId: number): Promise<CrearEstudianteResultado> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const existe = await this.estudianteRepo.existeDocumento(datos.documento_identidad, undefined, client);
      if (existe) {
        await client.query('ROLLBACK');
        throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
      }

      const estudiante = await this.estudianteRepo.crear(datos, client);

      await this.estudianteRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'estudiante_crear',
          entidad: 'estudiantes',
          entidadId: estudiante.id,
          detalle: { resultado: 'exito', documento_identidad: datos.documento_identidad },
        },
        client
      );

      await client.query('COMMIT');

      return { estudiante: this.estudianteRepo.aPerfilSeguro(estudiante) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerPorId(id: number, actorId: number): Promise<{ estudiante: EstudianteSafe }> {
    const client = await getPool().connect();
    try {
      const estudiante = await this.estudianteRepo.obtenerPorId(id, client);
      if (!estudiante) {
        throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
      }

      await this.estudianteRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'estudiante_obtener',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      return { estudiante: this.estudianteRepo.aPerfilSeguro(estudiante) };
    } finally {
      client.release();
    }
  }

  async listar(actorId: number, opciones: { activo?: boolean; limite?: number; compensar?: number } = {}): Promise<{ estudiantes: EstudianteSafe[] }> {
    const client = await getPool().connect();
    try {
      const estudiantes = await this.estudianteRepo.listar(opciones, client);

      await this.estudianteRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'estudiante_listar',
          entidad: 'estudiantes',
          entidadId: null,
          detalle: { resultado: 'exito', cantidad: estudiantes.length },
        },
        client
      );

      return { estudiantes: estudiantes.map((e) => this.estudianteRepo.aPerfilSeguro(e)) };
    } finally {
      client.release();
    }
  }

  async actualizar(
    id: number,
    datos: UpdateEstudianteInput,
    actorId: number,
  ): Promise<{ estudiante: EstudianteSafe }> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const existente = await this.estudianteRepo.obtenerPorId(id, client);
      if (!existente) {
        await client.query('ROLLBACK');
        throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
      }

      if (datos.documento_identidad !== undefined && datos.documento_identidad !== existente.documento_identidad) {
        const existe = await this.estudianteRepo.existeDocumento(datos.documento_identidad, id, client);
        if (existe) {
          await client.query('ROLLBACK');
          throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
        }
      }

      const actualizado = await this.estudianteRepo.actualizar(id, datos, client);

      await this.estudianteRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'estudiante_actualizar',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito', campos: Object.keys(datos) },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('Estudiante no encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      return { estudiante: this.estudianteRepo.aPerfilSeguro(actualizado) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async desactivar(id: number, actorId: number): Promise<{ estudiante: EstudianteSafe }> {
    return this.actualizar(id, { activo: false }, actorId);
  }
}

export const estudianteService = new EstudianteService();
