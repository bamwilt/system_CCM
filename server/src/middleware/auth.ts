import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * Autenticación por token JWT.
 *
 * El login entrega un token firmado con el `JWT_SECRET`. Cada request a una
 * ruta protegida lo manda en `Authorization: Bearer <token>`.
 *
 * El payload lleva solo lo necesario para autorizar: id, nombre, rol y email.
 * Nunca la contraseña ni su hash.
 */

export type Rol = 'admin' | 'secretaria' | 'docente' | 'consulta';

export interface Claims {
  sub: number;
  nombre: string;
  email: string;
  rol: Rol;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Claims;
    }
  }
}

export function firmarToken(claims: Claims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verificarToken(token: string): Claims {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as Claims;
    // Defensa: un token bien firmado pero sin los campos esperados no sirve.
    if (typeof payload?.sub !== 'number' || typeof payload?.rol !== 'string') {
      throw ApiError.unauthorized('Token incompleto');
    }
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const e = err as jwt.JsonWebTokenError & { name?: string };
    if (e.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Tu sesión expiró. Volvé a iniciar sesión.');
    }
    throw ApiError.unauthorized('Token inválido');
  }
}

/** Exige un token válido. Rechaza con 401 si falta o no es válido. */
export function requiereAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Falta el token de autenticación');
  }
  req.usuario = verificarToken(header.slice('Bearer '.length).trim());
  next();
}

/**
 * Exige uno de los roles indicados.
 *
 * Jerarquía: admin ve todo; secretaria gestiona lo operativo; docente y
 * consulta solo leen. Se usa así:
 *   router.post('/', requiereAuth, requiereRol('admin', 'secretaria'), handler)
 */
export function requiereRol(...permitidos: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const u = req.usuario;
    if (!u) throw ApiError.unauthorized();

    const rango: Record<Rol, number> = { admin: 3, secretaria: 2, docente: 1, consulta: 1 };
    // La ruta acepta CUALQUIERA de los roles indicados, así que la barra es la
    // del rol menos privilegiado de la lista. Con `Math.max` bastaría con
    // escribir 'admin' y la secretaría se quedaría sin acceso, que es
    // justamente lo que fija `requiereEscritura`.
    const necesario = Math.min(...permitidos.map((r) => rango[r]));

    if ((rango[u.rol] ?? 0) < necesario) {
      throw ApiError.forbidden(`Tu rol (${u.rol}) no tiene permiso para esta acción`);
    }
    next();
  };
}

/** Corto: exige escritura (admin o secretaria). */
export const requiereEscritura = requiereRol('admin', 'secretaria');
/** Corto: exige ser admin. */
export const requiereAdmin = requiereRol('admin');
