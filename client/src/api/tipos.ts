/**
 * Tipos compartidos con la API.
 *
 * La API responde siempre con la misma envoltura:
 *
 *   { "data": T, "meta": { ... } }
 *   { "error": { "message": string, "code": string, "details": unknown } }
 *
 * y los errores de validación traen el detalle por campo, que el formulario
 * muestra debajo del input correspondiente.
 */

export interface MetaPaginacion {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Respuesta<T> {
  data: T;
  meta?: Partial<MetaPaginacion> & { id?: number; columnas?: string[] };
}

export interface DetalleError {
  message: string;
  code?: string;
  /** Mapa campo -> mensaje, presente en los 422 de validación. */
  details?: Record<string, string>;
  /** Dependientes que bloquean un borrado, presente en los 409. */
  dependientes?: Record<string, number>;
  sugerencia?: string;
}

// --- Autenticación ---------------------------------------------------------

export type Rol = 'admin' | 'secretaria' | 'docente' | 'consulta';

export const ROLES: readonly Rol[] = ['admin', 'secretaria', 'docente', 'consulta'];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  secretaria: 'Secretaría',
  docente: 'Docente',
  consulta: 'Consulta',
};

/** Ranks de escritura: `admin` y `secretaria` pueden crear/editar/borrar. */
export function puedeEscribir(rol: Rol | undefined): boolean {
  return rol === 'admin' || rol === 'secretaria';
}

export interface Usuario {
  usuario_id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creado_en?: string;
}

export interface RespuestaLogin {
  token: string;
  usuario: Usuario;
}

// --- Dashboard -------------------------------------------------------------

export interface TarjetasDashboard {
  estudiantes: number;
  empleados: number;
  docentes: number;
  asignaturas: number;
  matriculas: number;
  notas: number;
  alumnosMatriculados: number;
  promedioGeneral: number;
}

export interface FilaNivel {
  nivel: string;
  total: number;
}

export interface FilaPromedio {
  asignatura: string;
  promedio: number;
}

export interface FilaEstudiante {
  nombre: string;
  promedio: number;
}

export interface FilaIngreso {
  mes: string;
  monto: number;
  ordenes: number;
}

export interface Dashboard {
  tarjetas: TarjetasDashboard;
  porNivel: FilaNivel[];
  porAsignatura: FilaPromedio[];
  topEstudiantes: FilaEstudiante[];
  ingresos: FilaIngreso[];
  estadoPagos: { total: number; pagadas: number; pendientes: number };
}

// --- Catálogos -------------------------------------------------------------

export interface ItemCatalogo {
  id: number;
  etiqueta: string;
  extra?: string | number | null;
}

export interface ItemEvaluacion extends ItemCatalogo {
  nota_total: number;
  asignatura: string;
}

export interface Catalogos {
  niveles: ItemCatalogo[];
  grupos: ItemCatalogo[];
  programas: ItemCatalogo[];
  asignaturas: ItemCatalogo[];
  estudiantes: ItemCatalogo[];
  clientes: ItemCatalogo[];
  docentes: ItemCatalogo[];
  evaluaciones: ItemEvaluacion[];
  usuarios: ItemCatalogo[];
  metodosPago: ItemCatalogo[];
}

/** Filas CRUD: los campos concretos se describen en `config/modulos.ts`. */
export type Fila = Record<string, unknown> & { [k: string]: unknown };
