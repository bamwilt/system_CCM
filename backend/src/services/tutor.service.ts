import { PoolClient } from 'pg';
import { env } from '../config/env';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  TutorRepository,
  Tutor,
  TutorSafe,
  CreateTutorInput,
  UpdateTutorInput,
} from '../repositories/tutor.repository';

export interface CrearTutorResultado {
  tutor: TutorSafe;
}

export class TutorService {
  constructor(
    private readonly tutorRepo: TutorRepository = new TutorRepository()
  ) {}

  async crear(datos: CreateTutorInput, actorId: number): Promise<CrearTutorResultado> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const existe = await this.tutorRepo.existeDocumento(datos.documento_identidad, undefined, client);
      if (existe) {
        await client.query('ROLLBACK');
        throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
      }

      const tutor = await this.tutorRepo.crear(datos, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_crear',
          entidad: 'tutores',
          entidadId: tutor.id,
          detalle: { resultado: 'exito', documento_identidad: datos.documento_identidad },
        },
        client
      );

      await client.query('COMMIT');

      return { tutor: this.tutorRepo.aPerfilSeguro(tutor) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerPorId(id: number, actorId: number): Promise<{ tutor: TutorSafe }> {
    const client = await getPool().connect();
    try {
      const tutor = await this.tutorRepo.obtenerPorId(id, client);
      if (!tutor) {
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_obtener',
          entidad: 'tutores',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      return { tutor: this.tutorRepo.aPerfilSeguro(tutor) };
    } finally {
      client.release();
    }
  }

  async listar(actorId: number, opciones: { activo?: boolean; limite?: number; compensar?: number } = {}): Promise<{ tutores: TutorSafe[] }> {
    const client = await getPool().connect();
    try {
      const tutores = await this.tutorRepo.listar(opciones, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_listar',
          entidad: 'tutores',
          entidadId: null,
          detalle: { resultado: 'exito', cantidad: tutores.length },
        },
        client
      );

      return { tutores: tutores.map((t) => this.tutorRepo.aPerfilSeguro(t)) };
    } finally {
      client.release();
    }
  }

  async actualizar(
    id: number,
    datos: UpdateTutorInput,
    actorId: number,
  ): Promise<{ tutor: TutorSafe }> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const existente = await this.tutorRepo.obtenerPorId(id, client);
      if (!existente) {
        await client.query('ROLLBACK');
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      if (datos.documento_identidad !== undefined && datos.documento_identidad !== existente.documento_identidad) {
        const existe = await this.tutorRepo.existeDocumento(datos.documento_identidad, id, client);
        if (existe) {
          await client.query('ROLLBACK');
          throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
        }
      }

      const actualizado = await this.tutorRepo.actualizar(id, datos, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_actualizar',
          entidad: 'tutores',
          entidadId: id,
          detalle: { resultado: 'exito', campos: Object.keys(datos) },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('Tutor no encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      return { tutor: this.tutorRepo.aPerfilSeguro(actualizado) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async desactivar(id: number, actorId: number): Promise<{ tutor: TutorSafe }> {
    return this.actualizar(id, { activo: false }, actorId);
  }

  async listarEstudiantes(tutorId: number, actorId: number): Promise<{ estudiantes: Array<{ id: number; nombres: string; apellidos: string; es_principal: boolean }> }> {
    const client = await getPool().connect();
    try {
      const tutor = await this.tutorRepo.obtenerPorId(tutorId, client);
      if (!tutor) {
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      const estudiantes = await this.tutorRepo.listarEstudiantesAsociados(tutorId, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_estudiantes_listar',
          entidad: 'tutores',
          entidadId: tutorId,
          detalle: { resultado: 'exito', cantidad: estudiantes.length },
        },
        client
      );

      return { estudiantes };
    } finally {
      client.release();
    }
  }

  async asociarEstudiante(
    tutorId: number,
    estudianteId: number,
    esPrincipal: boolean,
    actorId: number,
  ): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const tutor = await this.tutorRepo.obtenerPorId(tutorId, client);
      if (!tutor) {
        await client.query('ROLLBACK');
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      const estudianteResult = await client.query<{ id: number }>('SELECT id FROM estudiantes WHERE id = $1', [estudianteId]);
      if (estudianteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new AppError('Estudiante no encontrado', 404, 'NOT_FOUND');
      }

      if (esPrincipal) {
        await client.query(
          `UPDATE estudiante_tutor SET es_principal = FALSE WHERE estudiante_id = $1 AND es_principal = TRUE`,
          [estudianteId]
        );
      }

      await this.tutorRepo.asociarEstudiante(tutorId, estudianteId, esPrincipal, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_estudiante_asociar',
          entidad: 'estudiante_tutor',
          entidadId: estudianteId,
          detalle: { resultado: 'exito', tutor_id: tutorId, es_principal: esPrincipal },
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

  async desasociarEstudiante(
    tutorId: number,
    estudianteId: number,
    actorId: number,
  ): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [4315003]);

      const tutor = await this.tutorRepo.obtenerPorId(tutorId, client);
      if (!tutor) {
        await client.query('ROLLBACK');
        throw new AppError('Tutor no encontrado', 404, 'NOT_FOUND');
      }

      await this.tutorRepo.desasociarEstudiante(tutorId, estudianteId, client);

      await this.tutorRepo.registrarAuditoria(
        {
          usuarioId: actorId,
          accion: 'tutor_estudiante_desasociar',
          entidad: 'estudiante_tutor',
          entidadId: estudianteId,
          detalle: { resultado: 'exito', tutor_id: tutorId },
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
}

export const tutorService = new TutorService();
