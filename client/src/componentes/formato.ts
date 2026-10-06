import type { Columna, TipoColumna } from '../config/modulos';

/**
 * Presentación de valores.
 *
 * La API devuelve fechas como ISO con zona horaria (`2026-01-15T00:00:00Z`)
 * y booleanos como `true`/`false`. Este módulo las convierte a algo legible, y
 * decide qué se muestra cuando el dato falta.
 */

/** `—` para valores ausentes: en una tabla, una celda vacía parece un error. */
export const VACIO = '—';

const opcionesFecha: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

/**
 * Convierte a fecha local y formatea.
 *
 * Se construye la fecha con componentes en vez de pasar la cadena a `Date`:
 * `'2026-01-15'` en UTC se ve como 14/01/2026 en el hemisferio oeste, que es
 * exactamente el tipo de error que hace que una fecha de cumpleaños o de
 * matrícula parezca equivocada.
 */
export /** Texto plano de un valor, sin producir `[object Object]`. */
function aTexto(valor: unknown): string {
  if (typeof valor === 'object' && valor !== null) {
    return JSON.stringify(valor);
  }
  return String(valor);
}

export function formatearFecha(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return VACIO;
  const texto = aTexto(valor);
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, a, m, d] = iso;
    return `${d}/${m}/${a}`;
  }
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return texto;
  return new Intl.DateTimeFormat('es-DO', opcionesFecha).format(fecha);
}

export function formatearNumero(valor: unknown, decimales = 0): string {
  if (valor === null || valor === undefined || valor === '') return VACIO;
  const n = Number(valor);
  if (Number.isNaN(n)) return aTexto(valor);
  return new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Moneda dominicana (RD$). */
export function formatearMoneda(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return VACIO;
  const n = Number(valor);
  if (Number.isNaN(n)) return aTexto(valor);
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatearBooleano(valor: unknown): string {
  if (valor === true) return 'Sí';
  if (valor === false) return 'No';
  return VACIO;
}

/** Muestra una celda del listado según el tipo de su columna. */
export function formatearCelda(valor: unknown, columna: Columna): string {
  if (valor === null || valor === undefined || valor === '') return VACIO;

  switch (columna.tipo) {
    case 'fecha':
      return formatearFecha(valor);
    // `moneda` manda sobre el tipo: un salario es un integer en la base pero se
    // muestra como monto. Sin esto se vería «35000» en vez de «RD$35,000.00».
    case 'decimal':
    case 'numero':
      if (columna.moneda) return formatearMoneda(valor);
      return formatearNumero(valor, columna.decimales ?? 0);
    case 'booleano':
      return formatearBooleano(valor);
    default:
      return aTexto(valor);
  }
}

/** `true` si el valor es un número finito, para heurísticas de color. */
export function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Convierte el valor de un input a lo que espera la API según su tipo.
 *
 * Los `select` de FK devuelven texto y hay que mandarlo como entero, y los
 * campos vacíos deben viajar como `null` (para poner en NULL) y no como `""`.
 */
export function valorParaApi(valor: string | boolean, tipo: TipoColumna): unknown {
  if (tipo === 'booleano') return valor === true || valor === 'true';

  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto === '') return null;

  switch (tipo) {
    case 'numero':
    case 'autoincremento': {
      const n = Number(texto);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      const n = Number(texto);
      return Number.isFinite(n) ? n : null;
    }
    default:
      return texto;
  }
}

/** Texto inicial de un input a partir del valor de la fila. */
export function valorDesdeFila(valor: unknown, columna: Columna): string | boolean {
  if (columna.tipo === 'booleano') return valor === true;
  if (valor === null || valor === undefined) return '';
  return aTexto(valor);
}

/** Fecha ISO (`AAAA-MM-DD`) para `<input type="date">`. */
export function aInputFecha(valor: unknown): string {
  if (!valor) return '';
  const m = aTexto(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
