import { z } from 'zod';

/**
 * ID positivo seguro. Acepta numero o string decimal estricto.
 * No usa parseInt (evita parsing permisivo de '1abc' -> 1).
 */
const positiveId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/, 'ID invalido')])
  .transform((val) => (typeof val === 'string' ? Number(val) : val))
  .refine((n) => Number.isSafeInteger(n) && n > 0, { message: 'ID invalido' });

/**
 * Fecha estricta en formato YYYY-MM-DD. Evita la normalizacion/rollover de
 * JavaScript Date (p. ej. '2026-02-31' no se convierte en marzo).
 */
const fechaEstricta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha invalida' })
  .refine((val) => {
    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, { message: 'Fecha invalida' });

/**
 * Clave de idempotencia de aplicacion (opcional).
 *
 * - Debe ser string: numeros, booleanos, null y objetos se rechazan (400).
 * - Se recorta ANTES de medir longitud, por lo que la cadena vacia o una
 *   cadena formada solo por espacios quedan con longitud 0 y se rechazan (400).
 * - Longitud valida: 1..255 caracteres despues del recorte.
 * - Ausente (undefined) = peticion sin idempotencia: el comportamiento previo
 *   del duplicado estudiante/anio se mantiene sin cambios.
 */
const idempotencyKey = z
  .string()
  .trim()
  .min(1, 'idempotency_key no puede estar vacia')
  .max(255, 'idempotency_key admite maximo 255 caracteres');

/**
 * Porcentaje de descuento como CADENA DECIMAL EXACTA. Nunca number: un numero
 * en JSON pierde la representacion exacta y la politica exige texto exacto
 * (DEC-05/DEC-20).
 *
 * Misma forma que el validador de `politicas-financieras`
 * (`esquemaDecimalExacto`): se rechazan signo (`+10`, `-10`), ceros a la
 * izquierda (`010`), notacion cientifica (`1e1`, `1E+1`) y separadores de
 * miles. El rango es 0..100: `100.x` tambien es mayor que 100.
 *
 * La cadena NO se convierte a numero aqui: la aritmetica y el redondeo los
 * resuelve PostgreSQL (NUMERIC exacto), nunca JavaScript.
 */
const PORCENTAJE_DESCUENTO = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;

const porcentajeDescuento = z
  .string()
  .regex(PORCENTAJE_DESCUENTO, {
    message:
      "porcentaje: se esperaba un decimal exacto en texto (p. ej. '10' o '7.25'), sin signo, sin ceros a la izquierda y sin notacion cientifica",
  })
  .refine((valor) => {
    const [entero, fraccion] = valor.split('.');
    if (Number(entero) > 100) {
      return false;
    }
    if (entero === '100' && fraccion !== undefined) {
      return false; // 100.x es mayor que 100
    }
    return true;
  }, { message: 'porcentaje: el valor debe estar entre 0 y 100' });

/**
 * Descuento AUTORIZADO sobre el plan de pago (D05 CU-01 alternativo /
 * DEC-07 / DEC-20).
 *
 * - `porcentaje`: decimal exacto en TEXTO (ver `porcentajeDescuento`).
 * - `autorizado_por`: quien autoriza el descuento. OBLIGATORIO: el sistema
 *   registra quien lo autorizo, no decide si es legitimo (DEC-07). Un
 *   descuento sin autorizador se rechaza (400): nunca se aplica en silencio.
 *
 * Objeto ESTRICTO: cualquier campo desconocido se rechaza (400). Ausente
 * (`undefined`) = peticion sin descuento, que es el comportamiento previo
 * intacto. `null` NO es una ausencia valida: se rechaza (400) porque la
 * politica exige que el descuento venga como objeto explicito y autorizado.
 */
const descuentoAutorizado = z
  .object({
    porcentaje: porcentajeDescuento,
    autorizado_por: z
      .string()
      .trim()
      .min(1, 'autorizado_por es obligatorio cuando se envia un descuento')
      .max(255, 'autorizado_por admite maximo 255 caracteres'),
  })
  .strict();

export const createMatriculaSchema = z
  .object({
    estudiante_id: positiveId,
    anio_lectivo_id: positiveId,
    grado_id: positiveId,
    tutor_id: positiveId.optional().nullable(),
    fecha_matricula: fechaEstricta.optional(),
    estado: z.enum(['ACTIVA', 'DESACTIVADA', 'COMPLETADA']).default('ACTIVA'),
    observaciones: z.string().trim().max(1000).optional().nullable(),
    idempotency_key: idempotencyKey.optional(),
    plan_pago: z
      .object({
        tarifa_id: positiveId,
        fechas_vencimiento: z
          .array(fechaEstricta)
          .min(1, 'Se requiere al menos una fecha de vencimiento')
          .max(120, 'Maximo 120 cuotas'),
      })
      .strict(),
    descuento: descuentoAutorizado.optional(),
  })
  .strict();

export const updateMatriculaSchema = z
  .object({
    estudiante_id: positiveId.optional(),
    anio_lectivo_id: positiveId.optional(),
    grado_id: positiveId.optional(),
    tutor_id: positiveId.optional().nullable(),
    fecha_matricula: fechaEstricta.optional(),
    estado: z.enum(['ACTIVA', 'DESACTIVADA', 'COMPLETADA']).optional(),
    observaciones: z.string().trim().max(1000).optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Al menos un campo debe proporcionarse para actualizar',
  });

export const matriculaIdParamSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/, 'ID invalido').transform((val) => Number(val)),
});
