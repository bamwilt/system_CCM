import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { ApiError } from '../lib/ApiError.js';
import { parseBody } from '../lib/validate.js';
import { firmarToken, requiereAuth, type Claims, type Rol } from '../middleware/auth.js';
import { env } from '../config/env.js';

/**
 * Autenticación.
 *
 * `usuarios` en el esquema original sólo tenía (usuario_id, nombre): no había
 * forma de iniciar sesión. La migración 001 agrega email + password_hash + rol.
 */

export const authRouter = Router();

const loginSchema = z.object({
  email: z.email('Ingresá un email válido').trim().toLowerCase(),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

interface FilaUsuario {
  usuario_id: number;
  nombre: string;
  email: string;
  password_hash: string | null;
  rol: Rol;
  activo: boolean;
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body) as {
    email: string;
    password: string;
  };

  const usuario = await queryOne<FilaUsuario>(
    `SELECT usuario_id, nombre, email, password_hash, rol, activo
       FROM usuarios
      WHERE lower(email) = $1`,
    [email],
  );

  // Mismo mensaje en ambos casos: no revela si el email existe o cuál es la clave.
  const credenciales = new ApiError(401, 'Email o contraseña incorrectos', 'BAD_CREDENTIALS');

  if (!usuario) {
    // Se compara igual contra un hash falso para que el tiempo de respuesta no
    // delate la diferencia entre "usuario inexistente" y "contraseña errónea".
    await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw credenciales;
  }

  if (!usuario.activo) {
    throw ApiError.forbidden('Tu cuenta está desactivada. Contactá al administrador.');
  }

  const ok = await bcrypt.compare(password, usuario.password_hash ?? '');
  if (!ok) throw credenciales;

  const claims: Claims = {
    sub: usuario.usuario_id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
  };

  res.json({
    data: {
      token: firmarToken(claims),
      usuario: claims,
    },
  });
});

/** Devuelve el usuario del token vigente. Se usa para rehidratar la sesión. */
authRouter.get('/yo', requiereAuth, async (req, res) => {
  const u = req.usuario!;
  const fila = await queryOne<{ nombre: string; email: string; rol: Rol; activo: boolean }>(
    'SELECT nombre, email, rol, activo FROM usuarios WHERE usuario_id = $1',
    [u.sub],
  );
  if (!fila || !fila.activo) {
    throw ApiError.unauthorized('La cuenta ya no está activa');
  }
  res.json({ data: { ...u, ...fila } });
});

/**
 * Alta de usuario (solo admin). El hash se genera acá, nunca se recibe del
 * cliente: aceptar un password_hash por la API sería una vía libre para que
 * alguien se asigne el rol que quiera.
 */
authRouter.post('/usuarios', requiereAuth, async (req, res) => {
  const u = req.usuario!;
  if (u.rol !== 'admin') {
    throw ApiError.forbidden('Solo un administrador puede crear usuarios');
  }

  const body = parseBody(
    z.object({
      nombre: z.string().trim().min(3, 'El nombre es obligatorio').max(40),
      email: z.email('Email inválido').trim().toLowerCase(),
      password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
      rol: z.enum(['admin', 'secretaria', 'docente', 'consulta']).default('consulta'),
    }),
    req.body,
  ) as { nombre: string; email: string; password: string; rol: Rol };

  const hash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);

  const fila = await queryOne(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING usuario_id, nombre, email, rol, activo, creado_en`,
    [body.nombre, body.email, hash, body.rol],
  );

  res.status(201).json({ data: fila });
});

/** Lista de usuarios, sin exponer hashes. */
authRouter.get('/usuarios', requiereAuth, async (_req, res) => {
  const filas = await query(
    `SELECT usuario_id, nombre, email, rol, activo, creado_en
       FROM usuarios ORDER BY nombre`,
  );
  res.json({ data: filas, meta: { total: filas.length } });
});
