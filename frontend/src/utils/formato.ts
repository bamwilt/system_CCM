/**
 * ============================================================================
 * FORMATO DE PRESENTACION (FASE 9.B)
 * ============================================================================
 *
 * Regla que no se negocia: los importes que llegan del backend son TEXTO
 * exacto de un NUMERIC de PostgreSQL. Aqui NO se convierten a numero de punto
 * flotante ni se recalcula nada: solo se agrupan miles y se escribe el simbolo
 * de la moneda para que la caja lea "C$ 4,500.00" en lugar de "4500.00".
 *
 * Si el backend manana decide otro redondeo, esta funcion no puede cambiar la
 * cifra: no sabe sumar.
 */

/** Simbolo de presentacion. La moneda ALMACENADA manda; NULL legacy no inventa. */
export function simboloMoneda(moneda: string | null | undefined): string {
  if (moneda === 'NIO') {
    return 'C$';
  }
  if (moneda === 'USD') {
    return 'US$';
  }
  return moneda ?? '';
}

/**
 * Separador de miles sobre el texto del importe: parte entera y decimal se
 * tratan por separado, asi que no existe numero de punto flotante en ningun
 * momento.
 *
 * Acepta `undefined`/`null`: si un reporte no trae el campo, se muestra "—" en
 * lugar de romper la pantalla entera.
 */
export function formatearImporte(valor: string | null | undefined): string {
  const limpio = (valor ?? '').trim();
  if (limpio === '' || !/^-?\d+(\.\d+)?$/.test(limpio)) {
    return '—';
  }
  const negativo = limpio.startsWith('-');
  const sinSigno = negativo ? limpio.slice(1) : limpio;
  const [entero, decimal] = sinSigno.split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const conDecimal = decimal ? `${conMiles}.${decimal}` : conMiles;
  return negativo ? `-${conDecimal}` : conDecimal;
}

/** "C$ 4,500.00". Sin moneda almacenada, el numero sin simbolo. */
export function conMoneda(valor: string | null | undefined, moneda: string | null | undefined): string {
  const numero = formatearImporte(valor);
  const simbolo = simboloMoneda(moneda);
  return simbolo && numero !== '—' ? `${simbolo} ${numero}` : numero;
}

/** "12 nov 2026" en lugar de 12/11/2026, que se lee de dos formas distintas. */
export function fechaCorta(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    return iso;
  }
  const fecha = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Iniciales para el avatar de la lista de busqueda. */
export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}
