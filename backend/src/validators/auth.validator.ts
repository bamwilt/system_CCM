import { z } from 'zod';
import { isPasswordValid } from '../utils/authCrypto';

export const loginSchema = z
  .object({
    email: z.string().min(1).max(255),
    password: z.string().min(1).max(512),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const recoverySchema = z.object({}).passthrough();

const AUTH_PERMISSION_CODES = ['auth:users:manage', 'auth:roles:manage'] as const;

const passwordSchema = z.string().refine(isPasswordValid, {
  message: 'Invalid password',
});

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: passwordSchema,
    nombre: z.string().trim().min(1).max(100),
    apellido: z.string().trim().min(1).max(100),
    rolId: z.number().int().positive(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100).optional(),
    apellido: z.string().trim().min(1).max(100).optional(),
    activo: z.boolean().optional(),
    password: passwordSchema.optional(),
    rolId: z.number().int().positive().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Empty update',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createRoleSchema = z
  .object({
    nombre: z.string().trim().min(1).max(50),
    descripcion: z.string().trim().max(500).optional().nullable(),
    permisos: z
      .array(z.enum(AUTH_PERMISSION_CODES))
      .refine((value) => new Set(value).size === value.length, {
        message: 'Duplicate permissions',
      }),
  })
  .strict();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    nombre: z.string().trim().min(1).max(50).optional(),
    descripcion: z.string().trim().max(500).optional().nullable(),
    permisos: z
      .array(z.enum(AUTH_PERMISSION_CODES))
      .refine((value) => new Set(value).size === value.length, {
        message: 'Duplicate permissions',
      })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Empty update',
  });

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
