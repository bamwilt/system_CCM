import { api, borrarToken, guardarToken } from './cliente';
import type {
  Catalogos,
  Dashboard,
  MetaPaginacion,
  Respuesta,
  RespuestaLogin,
  Usuario,
} from './tipos';
import type { Fila } from './tipos';

/**
 * Endpoints de la aplicación, agrupados por recurso.
 *
 * Las funciones tipan la forma de la respuesta, de modo que las pantallas no
 * necesitan conocer la envoltura `{ data, meta }`.
 */

export interface OpcionesListado {
  q?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  sort?: 'asc' | 'desc';
  [filtro: string]: string | number | boolean | undefined;
}

export interface ResultadoListado {
  filas: Fila[];
  meta: MetaPaginacion;
}

// --- Sesión ----------------------------------------------------------------

export const auth = {
  async entrar(email: string, password: string): Promise<RespuestaLogin> {
    const r = await api.post<{ data: RespuestaLogin }>('/auth/login', { email, password });
    guardarToken(r.data.token);
    return r.data;
  },

  salir(): Promise<void> {
    // El token es de estado del lado del cliente; el backend es stateless, así
    // que basta con descartarlo localmente.
    borrarToken();
    return Promise.resolve();
  },

  yo(): Promise<Usuario> {
    return api.get<{ data: Usuario }>('/auth/yo').then((r) => r.data);
  },

  async usuarios(): Promise<Usuario[]> {
    const r = await api.get<{ data: Usuario[] }>('/auth/usuarios');
    return r.data;
  },

  crearUsuario(cuerpo: Partial<Usuario> & { password: string }): Promise<Usuario> {
    return api.post<{ data: Usuario }>('/auth/usuarios', cuerpo).then((r) => r.data);
  },

  editarUsuario(id: number, cuerpo: Partial<Usuario>): Promise<Usuario> {
    return api.patch<{ data: Usuario }>(`/auth/usuarios/${id}`, cuerpo).then((r) => r.data);
  },
};

// --- Dashboard y catálogos -------------------------------------------------

export function dashboard(senal?: AbortSignal): Promise<Dashboard> {
  return api.get<{ data: Dashboard }>('/dashboard', { senal }).then((r) => r.data);
}

export function catalogos(senal?: AbortSignal): Promise<Catalogos> {
  return api.get<{ data: Catalogos }>('/catalogos', { senal }).then((r) => r.data);
}

// --- CRUD genérico ---------------------------------------------------------

export async function listar(
  modulo: string,
  opciones: OpcionesListado = {},
  senal?: AbortSignal,
): Promise<ResultadoListado> {
  const r = await api.get<Respuesta<Fila[]>>(`/${modulo}`, {
    params: opciones,
    senal,
  });
  return { filas: r.data, meta: r.meta as MetaPaginacion };
}

export function obtener(modulo: string, id: number, senal?: AbortSignal): Promise<Fila> {
  return api.get<{ data: Fila }>(`/${modulo}/${id}`, { senal }).then((r) => r.data);
}

export function crear(modulo: string, cuerpo: Record<string, unknown>): Promise<Fila> {
  return api.post<{ data: Fila }>(`/${modulo}`, cuerpo).then((r) => r.data);
}

export function editar(modulo: string, id: number, cuerpo: Record<string, unknown>): Promise<Fila> {
  return api.patch<{ data: Fila }>(`/${modulo}/${id}`, cuerpo).then((r) => r.data);
}

/**
 * Borrado. La API bloquea (409) si el registro tiene dependientes; ese error
 * lo maneja la pantalla para ofrecer la cascada explícita.
 */
export function eliminar(modulo: string, id: number, cascade = false): Promise<void> {
  return api.delete<void>(`/${modulo}/${id}`, {
    ...(cascade ? { params: { cascade: 1 } } : {}),
  });
}
