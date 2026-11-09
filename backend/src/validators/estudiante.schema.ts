import { z } from 'zod';

export const createEstudianteSchema = z.object({
  nombres: z.string().trim().min(2, 'El nombre es requerido').max(100),
  apellidos: z.string().trim().min(2, 'El apellido es requerido').max(100),
  fecha_nacimiento: z.string().datetime({ offset: true }).optional().nullable(),
  genero: z.enum(['M', 'F', 'O']).optional(),
  documento_identidad: z.string().trim().min(1, 'El documento es requerido').max(50),
  direccion: z.string().trim().max(500).optional().nullable(),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  activo: z.boolean().default(true),
});

export const updateEstudianteSchema = z.object({
  nombres: z.string().trim().min(2).max(100).optional(),
  apellidos: z.string().trim().min(2).max(100).optional(),
  fecha_nacimiento: z.string().datetime({ offset: true }).optional().nullable(),
  genero: z.enum(['M', 'F', 'O']).optional(),
  documento_identidad: z.string().trim().min(1).max(50).optional(),
  direccion: z.string().trim().max(500).optional().nullable(),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  activo: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Al menos un campo debe proporcionarse para actualizar',
});

export const estudianteIdParamSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/, 'ID inválido').transform((val) => parseInt(val, 10)),
});
