import { z } from 'zod';

/**
 * Mensajes de validación en español.
 *
 * Zod usa mensajes en inglés por defecto ("Too small: expected string to
 * have >=2 characters"). Como los mensajes de la API llegan directamente al
 * formulario del cliente, se sobreescriben para que sean entendibles por
 * quien los lee.
 *
 * Se aplica globalmente con `z.config(z.locales.es())` al importar este
 * módulo, de modo que no hay que repetir `.min(2, '...')` en cada esquema.
 */

const ETIQUETAS: Record<string, string> = {
  primer_nombre: 'Primer nombre',
  primer_apellido: 'Primer apellido',
  nombre: 'Nombre',
  email: 'Email',
  telefono: 'Teléfono',
  password: 'Contraseña',
  nacimiento: 'Fecha de nacimiento',
  fecha_registro: 'Fecha de registro',
  matricula_fecha: 'Fecha de matrícula',
  fecha_ingreso: 'Fecha de ingreso',
  fecha_finalizacion: 'Fecha de finalización',
  direccion: 'Dirección',
  descripcion: 'Descripción',
  cedula: 'Cédula',
  turno: 'Turno',
  nivel_nombre: 'Nivel',
  nombre_asignatura: 'Asignatura',
  nombre_servicio: 'Servicio',
  nombre_metodo: 'Método de pago',
  cliente_tipo: 'Tipo de cliente',
  rol: 'Rol',
  estado: 'Estado',
  observaciones: 'Observaciones',
  code: 'Código',
};

export function etiqueta(campo: string): string {
  if (campo in ETIQUETAS) return ETIQUETAS[campo] ?? campo;
  // Convierte snake_case a una frase legible: 'nota_total' -> 'Nota total'.
  const frase = campo.replace(/_/g, ' ').trim();
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

function tipoDe(expected: string): string {
  return TIPOS[expected] ?? `un valor de tipo ${expected}`;
}

const TIPOS: Record<string, string> = {
  string: 'un texto',
  number: 'un número',
  boolean: 'un valor verdadero o falso',
  date: 'una fecha',
  array: 'una lista',
  object: 'un objeto',
};

/** Mensaje legible a partir de un issue de Zod. */
export function mensajeDe(issue: z.core.$ZodIssue): string {
  const campo = etiqueta(issue.path.map(String).join('.') || 'el campo');

  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') {
        return `${campo} debe tener al menos ${issue.minimum} caracteres`;
      }
      if (issue.origin === 'array') {
        // Una lista vacía sí es «no enviaste nada».
        if (issue.minimum === 1) return `${campo} es obligatorio`;
        return `${campo} debe tener al menos ${issue.minimum} elementos`;
      }
      // Para números y fechas el valor SÍ vino: decir «es obligatorio»
      // confundiría (`int().positive()` con 0 no es un campo faltante).
      if (issue.inclusive) return `${campo} debe ser mayor o igual a ${issue.minimum}`;
      return `${campo} debe ser mayor que ${issue.minimum}`;
    case 'too_big': {
      if (issue.origin === 'string') return `${campo} no puede superar ${issue.maximum} caracteres`;
      if (issue.origin === 'array')
        return `${campo} no puede tener más de ${issue.maximum} elementos`;
      return `${campo} es demasiado grande`;
    }
    case 'invalid_type':
      if (issue.input === undefined || issue.input === null || issue.input === '') {
        return `${campo} es obligatorio`;
      }
      return `${campo} debe ser ${tipoDe(issue.expected)}`;
    case 'invalid_format':
      if (issue.format === 'email') return `${campo} no es un email válido`;
      if (issue.format === 'date') return `${campo} debe tener el formato AAAA-MM-DD`;
      if (issue.format === 'uuid') return `${campo} no tiene el formato esperado`;
      return `${campo} tiene un formato inválido`;
    case 'invalid_value':
      return `${campo} debe ser uno de: ${issue.values.join(', ')}`;
    case 'unrecognized_keys':
      return `Campos no reconocidos: ${issue.keys.join(', ')}`;
    case 'not_multiple_of':
      return `${campo} debe ser múltiplo de ${issue.divisor}`;
    case 'custom':
      return issue.message;
    default:
      return `${campo}: ${issue.message}`;
  }
}

/** Instala los mensajes en español en TODOS los esquemas de Zod. */
export function activarMensajesEnEspanol(): void {
  z.config({
    customError: (issue) => {
      // `customError` reemplaza TODOS los mensajes, incluso los que el
      // esquema ya define a mano. Se respeta el mensaje explícito cuando
      // existe (los que empiezan con un arroba no son defaults de Zod).
      const explicito = (issue as { message?: string }).message;
      // Los mensajes que vienen de la API no son los de Zod por defecto.
      if (explicito && explicito.length > 0) return explicito;
      // En el callback `path` es opcional; `mensajeDe` lo toma siempre presente.
      return mensajeDe({ ...issue, path: issue.path ?? [] } as z.core.$ZodIssue);
    },
  });
}
