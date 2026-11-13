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

/**
 * Fecha y hora en reloj de 24 horas: "12 nov 2026, 22:31".
 *
 * El ciclo de 24 horas se pide de forma explicita porque es-NI, sin el, escribe
 * "10:31 p. m.": la caja de un colegio trabaja con reloj de 24 horas y esa
 * era justo la queja con la fecha de la pantalla de estado.
 *
 * Acepta una fecha DATE ("2026-11-12") o un timestamp completo. Si el valor no
 * es una fecha se devuelve tal cual: nunca se muestra "Invalid Date".
 */
export function fechaHora(iso: string): string {
  if (!iso) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleString('es-NI', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * Segundos a texto de personas: "45 s", "12 min", "1 h 15 min".
 *
 * El backend devuelve process.uptime() en segundos (con decimales). La version
 * anterior escribia Math.floor(uptime / 60) + " min", que a los 75 minutos
 * segua diciendo "75 min" en lugar de "1 h 15 min".
 */
export function tiempoActivo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return '—';
  }
  const total = Math.floor(segundos);
  if (total < 60) {
    return `${total} s`;
  }
  const minutos = Math.floor(total / 60);
  if (minutos < 60) {
    return `${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${String(resto).padStart(2, '0')} min`;
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
