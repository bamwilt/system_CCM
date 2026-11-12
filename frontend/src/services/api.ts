import axios from 'axios';

/**
 * ============================================================================
 * CLIENTE API DEL SGPM (FASE 9)
 * ============================================================================
 *
 * Regla del PM: "No duplicar calculos monetarios de manera inconsistente entre
 * backend y frontend". Por eso este cliente NUNCA convierte importes a Number ni
 * recalcula totales: los recibe como texto exacto y los muestra tal cual.
 *
 * Con las cookies de sesion viaja el token CSRF: el backend exige
 * `X-CSRF-Token` en toda mutacion.
 */

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Necesario para que el navegador envie y reciba las cookies de sesion.
  withCredentials: true,
});

/** Lee el token CSRF que el backend entrega al iniciar sesion. */
export function getCsrfToken(): string | null {
  return window.sessionStorage.getItem(CSRF_KEY);
}

const CSRF_KEY = 'sgpm.csrfToken';

export function setCsrfToken(token: string | null): void {
  if (token) {
    window.sessionStorage.setItem(CSRF_KEY, token);
  } else {
    window.sessionStorage.removeItem(CSRF_KEY);
  }
}

/** Cabeceras para una mutacion: credenciales + CSRF. */
export function mutationHeaders(): Record<string, string> {
  const csrf = getCsrfToken();
  return csrf ? { 'X-CSRF-Token': csrf } : {};
}

/**
 * Normaliza un error de axios a un mensaje util para la persona.
 * Nunca expone el detalle interno del servidor.
 */
/**
 * Normaliza un error a un mensaje util para la persona. Nunca expone el detalle
 * interno del servidor.
 *
 * No depende de `axios.isAxiosError` para decidir: reconoce la FORMA del error
 * (objeto con `response`). Asi funciona igual con un error real de axios que con
 * uno rechazado por otra capa, y las pruebas no necesitan falsear el detector
 * de axios.
 */
export function mensajeDeError(error: unknown): string {
  const candidato = error as {
    response?: { status?: number; data?: { error?: { message?: string } } };
    code?: string;
    message?: string;
  } | null;

  if (candidato && typeof candidato === 'object' && 'response' in candidato) {
    const mensaje = candidato.response?.data?.error?.message;
    if (typeof mensaje === 'string' && mensaje.trim() !== '') {
      return mensaje;
    }
    if (candidato.code === 'ECONNABORTED') {
      return 'La operacion tardo demasiado. Revise su conexion e intente de nuevo.';
    }
    return `El servidor respondio con ${candidato.response?.status}.`;
  }
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return 'Ocurrio un error inesperado.';
}

// ---------------------------------------------------------------------------
// SESION
// ---------------------------------------------------------------------------

export interface SesionInfo {
  userId: number;
  email: string;
  nombre: string;
  grants: string[];
}

/**
 * Respuesta real del backend en `/auth/login` y `/auth/me`:
 *   { user: { id, email, nombre, apellido }, grants, csrfToken }
 * Acepta tambien la forma plana por compatibilidad con pruebas antiguas.
 */
function sesionDe(data: Record<string, unknown>): SesionInfo {
  const origen = (data.user ?? data) as Record<string, unknown>;
  const nombre = [String(origen.nombre ?? ''), String(origen.apellido ?? '')].filter(Boolean).join(' ');
  return {
    userId: Number(origen.id ?? 0),
    email: String(origen.email ?? ''),
    nombre: nombre.trim(),
    grants: Array.isArray(data.grants) ? (data.grants as string[]) : [],
  };
}

export async function iniciarSesion(
  email: string,
  password: string
): Promise<SesionInfo> {
  const { data } = await api.post<{ csrfToken?: string } & Record<string, unknown>>(
    '/auth/login',
    { email, password }
  );
  setCsrfToken(typeof data.csrfToken === 'string' ? data.csrfToken : null);
  return sesionDe(data);
}

/**
 * Sesion activa: consulta `/auth/me`. Devuelve null si no hay sesion valida.
 * Se usa al montar la aplicacion para que un refresco de pagina no pierda la
 * sesion ni los permisos: la cookie de sesion sigue siendo valida.
 */
export async function obtenerSesionActiva(): Promise<SesionInfo | null> {
  try {
    const { data } = await api.get<Record<string, unknown>>('/auth/me');
    setCsrfToken(typeof data.csrfToken === 'string' ? data.csrfToken : null);
    return sesionDe(data);
  } catch {
    return null;
  }
}

export async function cerrarSesion(): Promise<void> {
  await api.post('/auth/logout', {}, { headers: mutationHeaders() });
  setCsrfToken(null);
}

// ---------------------------------------------------------------------------
// CATALOGOS Y MODULOS
// ---------------------------------------------------------------------------

export interface Paginado<T> {
  [clave: string]: T[] | number | undefined;
}

export async function listar<T>(
  ruta: string,
  segundo?: Record<string, unknown> | string
): Promise<{ filas: T[]; total: number } & Record<string, unknown>> {
  const esClave = typeof segundo === 'string';
  const { data } = await api.get(ruta, esClave ? undefined : { params: segundo ?? {} });
  // Cada lista del backend devuelve su coleccion con un nombre propio; se toma
  // el primer arreglo encontrado para no acoplar el cliente a ese nombre.
  const filas = Object.values(data as Record<string, unknown>).find(Array.isArray);
  const total = Object.values(data as Record<string, unknown>).find(
    (valor) => typeof valor === 'number'
  );
  const extra =
    esClave && segundo ? { [segundo]: (data as Record<string, unknown>)[segundo] } : {};
  return {
    filas: (filas as T[] | undefined) ?? [],
    total: typeof total === 'number' ? total : 0,
    ...extra,
  };
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  database: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export default api;
