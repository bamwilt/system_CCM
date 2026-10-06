import type { DetalleError } from './tipos';

/**
 * Cliente HTTP de la aplicación.
 *
 * Un único punto de entrada a la API. Centraliza el token, normaliza los
 * errores y traduce un 401 (token vencido o usuario desactivado) en un evento
 * que el contexto de autenticación escucha para cerrar la sesión.
 */

const BASE = '/api';
const CLAVE_TOKEN = 'ccm.token';

/** Callback invocado cuando la API responde 401. Lo registra AuthContext. */
let alExpirar: (() => void) | null = null;

export function registrarManejoDeSesion(fn: () => void): void {
  alExpirar = fn;
}

export function leerToken(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

export function guardarToken(token: string): void {
  localStorage.setItem(CLAVE_TOKEN, token);
}

export function borrarToken(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

/** Error de la API con el detalle ya normalizado. */
export class ErrorApi extends Error {
  readonly status: number;
  readonly codigo?: string;
  readonly detalles?: Record<string, string>;
  readonly dependientes?: Record<string, number>;

  constructor(status: number, cuerpo: DetalleError) {
    super(cuerpo.message || 'Ocurrió un error inesperado');
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = cuerpo.code;
    this.detalles = cuerpo.details;
    this.dependientes = cuerpo.dependientes;
  }
}

/** Error de red (API apagada, sin conexión). No viene de la API. */
export class ErrorRed extends Error {
  constructor() {
    super('No se pudo conectar con el servidor. Revisá que esté ejecutándose.');
    this.name = 'ErrorRed';
  }
}

interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Senal de aborto, para cancelar peticiones al cambiar de módulo. */
  senal?: AbortSignal;
}

/**
 * Arma la URL completa de una petición.
 *
 * La query se adjunta a la ruta (`/api/estudiantes?page=2`) y no se antepone:
 * anteponerla rompía la URL en cuanto había parámetros.
 */
function construirUrl(ruta: string, params?: OpcionesPeticion['params']): string {
  if (!params) return `${BASE}${ruta}`;

  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    // Los filtros sin valor no viajan: mandarlos como `''` haría que la API
    // los interpretara como un filtro aplicado.
    if (valor === null || valor === undefined || valor === '') continue;
    q.set(clave, String(valor));
  }

  const query = q.toString();
  return query ? `${BASE}${ruta}?${query}` : `${BASE}${ruta}`;
}

async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, params, senal } = opciones;
  const cabeceras: Record<string, string> = {};

  const token = leerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(construirUrl(ruta, params), {
      method: metodo,
      headers: cabeceras,
      signal: senal,
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
  } catch (e) {
    // Un aborto explícito no es un fallo de red: se propaga tal cual para que
    // el llamador lo distinga y no muestre un error por un simple cambio de filtro.
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErrorRed();
  }

  // 204: borrado exitoso, sin cuerpo que parsear.
  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  let json: unknown = null;
  if (texto) {
    try {
      json = JSON.parse(texto);
    } catch {
      // La API debería responder siempre JSON. Si no, se reporta como 500.
      throw new ErrorApi(res.status, {
        message: 'El servidor devolvió una respuesta no válida.',
      });
    }
  }

  if (!res.ok) {
    const envoltura = json as { error?: DetalleError } | null;
    const cuerpoError = envoltura?.error ?? { message: `Error ${res.status}` };
    // 401 con token presente = sesión vencida: se cierra y se avisa al
    // contexto en lugar de propagar un error a cada pantalla.
    if (res.status === 401 && token) {
      borrarToken();
      alExpirar?.();
    }
    throw new ErrorApi(res.status, cuerpoError);
  }

  return (json ?? {}) as T;
}

export const api = {
  get: <T>(ruta: string, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'GET' }),

  post: <T>(ruta: string, cuerpo: unknown, opciones?: Omit<OpcionesPeticion, 'metodo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'POST', cuerpo }),

  patch: <T>(ruta: string, cuerpo: unknown, opciones?: Omit<OpcionesPeticion, 'metodo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'PATCH', cuerpo }),

  delete: <T>(ruta: string, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'DELETE' }),
};
