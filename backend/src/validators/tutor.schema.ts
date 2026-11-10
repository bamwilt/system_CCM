import { z } from 'zod';

export const createTutorSchema = z.object({
  nombres: z.string().trim().min(2, 'El nombre es requerido').max(100),
  apellidos: z.string().trim().min(2, 'El apellido es requerido').max(100),
  documento_identidad: z.string().trim().min(1, 'El documento es requerido').max(50),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  direccion: z.string().trim().max(500).optional().nullable(),
  parentesco: z.string().trim().max(50).optional().nullable(),
  activo: z.boolean().default(true),
});

export const updateTutorSchema = z.object({
  nombres: z.string().trim().min(2).max(100).optional(),
  apellidos: z.string().trim().min(2).max(100).optional(),
  documento_identidad: z.string().trim().min(1).max(50).optional(),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  direccion: z.string().trim().max(500).optional().nullable(),
  parentesco: z.string().trim().max(50).optional().nullable(),
  activo: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Al menos un campo debe proporcionarse para actualizar',
});

export const tutorIdParamSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/, 'ID inválido').transform((val) => parseInt(val, 10)),
});

/**
 * Cuerpo de POST /api/tutores/:id/estudiantes.
 * El id del tutor SIEMPRE proviene del parametro de ruta :id.
 * `estudiante_id` es el id del ESTUDIANTE que se asocia (positivo seguro).
 * El schema es estricto: el campo legacy `tutorId` se rechaza con HTTP 400.
 */
export const asociarTutorSchema = z
  .object({
    estudiante_id: z
      .union([
        z.number().int().positive(),
        z.string().regex(/^[1-9][0-9]*$/, 'ID de estudiante inválido'),
      ])
      .transform((val) => (typeof val === 'string' ? Number(val) : val))
      .refine((n) => Number.isSafeInteger(n) && n > 0, { message: 'ID de estudiante inválido' }),
    es_principal: z.boolean().default(false),
  })
  .strict();
