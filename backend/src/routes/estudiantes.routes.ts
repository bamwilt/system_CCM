import { Router, Request, Response, NextFunction } from 'express';
import { getPool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateCsrf } from '../middleware/csrf';
import {
  requirePermission,
  getCurrentAuthContext,
  canGrant,
  AUTH_PERMISSIONS,
  assertActiveSession,
} from '../authorization/permissions';
import {
  createEstudianteSchema,
  updateEstudianteSchema,
  estudianteIdParamSchema,
} from '../validators/estudiante.schema';
import { EstudianteRepository } from '../repositories/estudiante.repository';
import { hashToken } from '../utils/authCrypto';

const router = Router();
const ADVISORY_LOCK_KEY = 4315003;

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function getParamString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveId(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toHttpError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  if (code === '23505') {
    return new AppError('Conflict', 409, 'CONFLICT');
  }
  if (code === '23503') {
    return new AppError('Bad request', 400, 'BAD_REQUEST');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function perfilSeguro(estudiante: {
  id: number;
  nombres: string;
  apellidos: string;
  documento_identidad: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}) {
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

// GET /api/estudiantes
router.get(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_READ),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const activo = _req.query.activo === 'true' ? true : _req.query.activo === 'false' ? false : undefined;
      const nombre = typeof _req.query.nombre === 'string' ? _req.query.nombre.trim().slice(0, 80) : '';
      const documento = typeof _req.query.documento === 'string' ? _req.query.documento.trim().slice(0, 80) : '';
      const grado = typeof _req.query.grado === 'string' ? _req.query.grado.trim().slice(0, 100) : '';
      const sinMatricula = _req.query.sin_matricula === 'true';
      const q = typeof _req.query.q === 'string' ? _req.query.q.trim().slice(0, 80) : '';
      const busqueda = q.replace(/[%_\\]/g, '');
      const patron = busqueda.length >= 2 ? `%${busqueda}%` : null;
      const limite = Math.min(parseInt(_req.query.limite as string, 10) || 50, 100);
      const compensar = parseInt(_req.query.compensar as string, 10) || 0;

      const condiciones: string[] = [];
      const params: unknown[] = [];
      if (activo !== undefined) {
        condiciones.push(`e.activo = $${params.length + 1}`);
        params.push(activo);
      }
      if (nombre.trim().length >= 2) {
        condiciones.push(`(
          translate(lower(e.nombres), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
          OR translate(lower(e.apellidos), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
        )`);
        params.push(`%${nombre.trim().replace(/[%_\\]/g, '')}%`);
      }
      if (documento.trim().length >= 2) {
        condiciones.push(`translate(lower(e.documento_identidad), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`);
        params.push(`%${documento.trim().replace(/[%_\\]/g, '')}%`);
      }
      if (patron) {
        condiciones.push(`(
          translate(lower(e.nombres || ' ' || e.apellidos), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
          OR translate(lower(e.nombres), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
          OR translate(lower(e.apellidos), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
          OR translate(lower(e.documento_identidad), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ILIKE translate(lower($${params.length + 1}), 'áéíóúüÑ', 'aeiouunaeiouun')
        )`);
        params.push(patron);
      }
      if (grado !== '') {
        condiciones.push(`EXISTS (
          SELECT 1 FROM matriculas m
          JOIN grados g ON g.id = m.grado_id
          WHERE m.estudiante_id = e.id AND g.nombre = $${params.length + 1}
        )`);
        params.push(grado);
      }
      if (sinMatricula) {
        condiciones.push(`NOT EXISTS (SELECT 1 FROM matriculas m2 WHERE m2.estudiante_id = e.id)`);
      }
      const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
      params.push(limite, compensar);

      const result = await getPool().query<{
        id: number;
        nombres: string;
        apellidos: string;
        documento_identidad: string;
        email: string | null;
        telefono: string | null;
        activo: boolean;
        grado: string | null;
        ultimo_anio: number | null;
        /** Años lectivos en los que YA tiene matrícula (puede ser más de uno). */
        anios_matriculados: number[] | null;
        tiene_matricula: boolean;
      }>(
        `SELECT e.id, e.nombres, e.apellidos, e.documento_identidad, e.email, e.telefono, e.activo,
                ult.grado, ult.ultimo_anio,
                ARRAY(
                  SELECT al.anio
                    FROM matriculas mm
                    JOIN anio_lectivo al ON al.id = mm.anio_lectivo_id
                   WHERE mm.estudiante_id = e.id
                   ORDER BY al.anio DESC
                ) AS anios_matriculados,
                EXISTS (SELECT 1 FROM matriculas mx WHERE mx.estudiante_id = e.id) AS tiene_matricula
           FROM estudiantes e
           LEFT JOIN LATERAL (
             SELECT g.nombre AS grado, al.anio AS ultimo_anio
               FROM matriculas m
               JOIN grados g ON g.id = m.grado_id
               JOIN anio_lectivo al ON al.id = m.anio_lectivo_id
              WHERE m.estudiante_id = e.id
              ORDER BY m.fecha_matricula DESC
              LIMIT 1
           ) ult ON true
           ${where}
          ORDER BY e.apellidos, e.nombres
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const estudiantes = result.rows.map((row) => ({
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        documento_identidad: row.documento_identidad,
        email: row.email,
        telefono: row.telefono,
        activo: row.activo,
        grado: row.grado,
        ultimo_anio: row.ultimo_anio,
        anios_matriculados: row.anios_matriculados ?? [],
        tiene_matricula: row.tiene_matricula,
      }));

      res.status(200).json({ estudiantes });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/estudiantes/anios-lectivos — catalogo para el alta de matriculas
// (la pantalla NO puede pedir el id a mano: nadie se sabe los identificadores).
router.get(
  '/anios-lectivos',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getPool().query<{
        id: number;
        anio: number;
        fecha_inicio: string;
        fecha_fin: string;
        activo: boolean;
      }>(
        `SELECT id, anio, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, activo
           FROM anio_lectivo
          ORDER BY anio DESC
          LIMIT 50`
      );
      res.status(200).json({ anios: result.rows });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/estudiantes/grados?anio_lectivo_id= — grados del catalogo
router.get(
  '/grados',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const anio = req.query.anio_lectivo_id;
      let anioId: number | null = null;
      if (anio !== undefined) {
        anioId = typeof anio === 'string' ? parsePositiveId(anio) : null;
        if (anioId === null) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'anio_lectivo_id invalido' } });
          return;
        }
      }
      const params: unknown[] = [];
      let where = '';
      if (anioId !== null) {
        where = 'WHERE anio_lectivo_id = $1';
        params.push(anioId);
      }
      const result = await getPool().query<{ id: number; nombre: string; nivel: string | null; anio_lectivo_id: number }>(
        `SELECT id, nombre, nivel, anio_lectivo_id
           FROM grados
           ${where}
          ORDER BY nombre
          LIMIT 200`,
        params
      );
      res.status(200).json({ grados: result.rows });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/estudiantes/tarifas?anio_lectivo_id= — tarifas vigentes.
// El monto viaja como texto exacto (NUMERIC de PostgreSQL), nunca como numero.
router.get(
  '/tarifas',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.MATRICULAS_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const anio = req.query.anio_lectivo_id;
      let anioId: number | null = null;
      if (anio !== undefined) {
        anioId = typeof anio === 'string' ? parsePositiveId(anio) : null;
        if (anioId === null) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'anio_lectivo_id invalido' } });
          return;
        }
      }
      const params: unknown[] = [];
      let where = '';
      if (anioId !== null) {
        where = 'WHERE anio_lectivo_id = $1';
        params.push(anioId);
      }
      const result = await getPool().query<{
        id: number;
        concepto: string;
        monto: string;
        moneda: string | null;
        anio_lectivo_id: number;
      }>(
        `SELECT id, concepto, monto::text AS monto, moneda, anio_lectivo_id
           FROM tarifas
           ${where}
          ORDER BY concepto
          LIMIT 200`,
        params
      );
      res.status(200).json({ tarifas: result.rows });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// GET /api/estudiantes/:id
router.get(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_READ),
  async (req: Request, res: Response, next: NextFunction) => {
    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }
    try {
      const repo = new EstudianteRepository();
      const estudiante = await repo.obtenerPorId(id);
      if (!estudiante) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
        return;
      }
      res.status(200).json({ estudiante: perfilSeguro(estudiante) });
    } catch (error) {
      next(toHttpError(error));
    }
  }
);

// POST /api/estudiantes
router.post(
  '/',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const parsed = createEstudianteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const existe = await repo.existeDocumento(parsed.data.documento_identidad, undefined, client);
      if (existe) {
        throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
      }

      const estudiante = await repo.crear(parsed.data, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_crear',
          entidad: 'estudiantes',
          entidadId: estudiante.id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      res.status(201).json({ estudiante: repo.aPerfilSeguro(estudiante) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/estudiantes/:id
router.patch(
  '/:id',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    const parsed = updateEstudianteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Solicitud inválida' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const existente = await repo.obtenerPorId(id, client);
      if (!existente) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      if (parsed.data.documento_identidad !== undefined && parsed.data.documento_identidad !== existente.documento_identidad) {
        const existe = await repo.existeDocumento(parsed.data.documento_identidad, id, client);
        if (existe) {
          throw new AppError('El documento de identidad ya está registrado', 409, 'CONFLICT');
        }
      }

      const actualizado = await repo.actualizar(id, parsed.data, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_actualizar',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado tras actualizar', 404, 'NOT_FOUND');
      }

      res.status(200).json({ estudiante: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

// PATCH /api/estudiantes/:id/desactivar
router.patch(
  '/:id/desactivar',
  requireAuth,
  requirePermission(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE),
  validateCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No autorizado' } });
      return;
    }

    const id = parsePositiveId(getParamString(req.params.id));
    if (id === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
      return;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const actor = await getCurrentAuthContext(auth.userId, client);
      if (!actor) {
        throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
      }
      if (!actor.grants.includes(AUTH_PERMISSIONS.ESTUDIANTES_MANAGE)) {
        throw new AppError('Prohibido', 403, 'FORBIDDEN');
      }

      await assertActiveSession(client, hashToken(auth.sessionToken), auth.userId);

      const repo = new EstudianteRepository();
      const actualizado = await repo.desactivar(id, client);

      await repo.registrarAuditoria(
        {
          usuarioId: auth.userId,
          accion: 'estudiante_desactivar',
          entidad: 'estudiantes',
          entidadId: id,
          detalle: { resultado: 'exito' },
        },
        client
      );

      await client.query('COMMIT');

      if (!actualizado) {
        throw new AppError('No encontrado', 404, 'NOT_FOUND');
      }

      res.status(200).json({ estudiante: repo.aPerfilSeguro(actualizado) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      next(toHttpError(error));
    } finally {
      client.release();
    }
  }
);

export default router;
