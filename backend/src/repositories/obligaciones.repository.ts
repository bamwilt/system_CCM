import { Pool } from 'pg';
import { getPool } from '../config/database';

/**
 * Repositorio de OBLIGACIONES (Fase 6.A).
 *
 * Proyeccion interna, estricta y exclusivamente LECTORA de lo que YA esta
 * almacenado en `matriculas`, `planes_pago` y `mensualidades`. No escribe, no
 * audita, no genera cuotas, no calcula mora, no aplica pagos ni liquidaciones.
 *
 * Decisiones de diseno que no se pueden relajar:
 *
 * 1. UNA sola consulta parametrizada por lectura.valida. El detalle (cuotas) y
 *    el agregado (`SUM(saldo_pendiente)`) se obtienen en la MISMA fila y del
 *    MISMO snapshot: no hay un segundo round-trip que pueda hibridar detalle y
 *    agregado bajo concurrencia. El agregado se calcula sobre las cuotas del
 *    UNICO plan de la matricula (indice unico `uq_planes_pago_matricula_id`),
 *    nunca sobre planes ajenos ni sobre varias monedas.
 *
 * 2. El `Pool` es inyectable por constructor. El fallback a `getPool()` es el
 *    patron de casa (mismo que `MatriculaRepository`), pero el pool inyectado
 *    siempre gana: el metodo de lectura no recibe pool ni lo reemplaza por uno
 *    propio.
 *
 * 3. Los importes viajan como `::text` NUMERICO exacto: nunca se convierten a
 *    `number`, `parseFloat` ni coma flotante, y el agregado NO se limita a
 *    `NUMERIC(12,2)`.
 *
 * 4. `moneda` se lee tal cual de `planes_pago` (NULL legacy se conserva). Jamas
 *    se reconstruye desde la tarifa vigente: la tarifa pudo cambiar despues de
 *    crear la matricula.
 *
 * 5. `fecha_vencimiento` se proyecta con `to_char(..., 'YYYY-MM-DD')`, que no
 *    depende del `DateStyle` del servidor ni de la zona horaria del cliente.
 */

/** Limite inferior del dominio de identificadores serial32 de las tablas base. */
export const ID_MINIMO_SEGURO = 1;

/** Limite superior del dominio de identificadores serial32 (2^31 - 1). */
export const ID_MAXIMO_SEGURO = 2147483647;

/**
 * Un identificador es utilizable solo si es un entero seguro de JavaScript
 * dentro del rango serial32 de PostgreSQL. Cualquier otra cosa (0, negativo,
 * decimal, inseguro, no numerico, `NaN`, `Infinity`, string) se rechaza AQUI,
 * antes de tocar la base de datos.
 */
export function esIdSeguro32(valor: unknown): valor is number {
  if (typeof valor !== 'number') return false;
  if (!Number.isSafeInteger(valor)) return false;
  return valor >= ID_MINIMO_SEGURO && valor <= ID_MAXIMO_SEGURO;
}

/**
 * Cuota proyectada tal y como esta almacenada. Los importes son texto NUMERICO
 * exacto (sin conversion a punto flotante) y `fecha_vencimiento` es una fecha
 * plana `YYYY-MM-DD` (no un `Date` con zona horaria).
 */
export interface CuotaProyeccion {
  id: number;
  numero_cuota: number;
  concepto: string;
  monto_original: string;
  monto_pagado: string;
  saldo_pendiente: string;
  fecha_vencimiento: string;
  estado: string;
  mora_aplicada: string;
}

/**
 * Plan de pago proyectado (snapshot almacenado). `moneda` conserva NULL en las
 * filas legacy: no se inventa divisa ni se toma de la tarifa actual.
 */
export interface PlanProyeccion {
  plan_pago_id: number;
  matricula_id: number;
  total_cuotas: number | null;
  monto_cuota: string | null;
  moneda: string | null;
  tarifa_id: number | null;
}

/**
 * Fila unica devuelta por la consulta: matricula + plan opcional + detalle de
 * cuotas (JSON agregado) + agregado de saldo del MISMO snapshot.
 */
export interface ObligacionesRow {
  matricula_id: number;
  matricula_estado: string;
  plan_pago_id: number | null;
  total_cuotas: number | null;
  monto_cuota: string | null;
  moneda: string | null;
  tarifa_id: number | null;
  cuotas_contadas: number;
  saldo_total: string;
  cuotas: unknown;
}

function esEntero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor);
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string';
}

/**
 * Mapea el detalle de cuotas devuelto por la consulta. Devuelve `null` si la
 * forma no es la esperada (no se inventan filas ni se descartan en silencio:
 * el servicio clasifica eso como integridad invalida).
 */
export function proyectarDetalleCuotas(cuotas: unknown): CuotaProyeccion[] | null {
  if (!Array.isArray(cuotas)) return null;

  const detalle: CuotaProyeccion[] = [];
  for (const entrada of cuotas) {
    if (typeof entrada !== 'object' || entrada === null) return null;
    const fila = entrada as Record<string, unknown>;

    const id = fila.id;
    const numero_cuota = fila.numero_cuota;
    const concepto = fila.concepto;
    const monto_original = fila.monto_original;
    const monto_pagado = fila.monto_pagado;
    const saldo_pendiente = fila.saldo_pendiente;
    const fecha_vencimiento = fila.fecha_vencimiento;
    const estado = fila.estado;
    const mora_aplicada = fila.mora_aplicada;

    if (!esEntero(id)) return null;
    if (!esEntero(numero_cuota)) return null;
    if (!esTexto(concepto)) return null;
    if (!esTexto(monto_original)) return null;
    if (!esTexto(monto_pagado)) return null;
    if (!esTexto(saldo_pendiente)) return null;
    if (!esTexto(fecha_vencimiento)) return null;
    if (!esTexto(estado)) return null;
    if (!esTexto(mora_aplicada)) return null;

    detalle.push({
      id,
      numero_cuota,
      concepto,
      monto_original,
      monto_pagado,
      saldo_pendiente,
      fecha_vencimiento,
      estado,
      mora_aplicada,
    });
  }
  return detalle;
}

/**
 * Proyecta el plan de la fila. Devuelve `null` cuando la matricula no tiene
 * plan ( LEFT JOIN sin match) o cuando el identificador del plan no es entero.
 */
export function proyectarPlan(fila: ObligacionesRow): PlanProyeccion | null {
  if (!esEntero(fila.plan_pago_id)) return null;
  return {
    plan_pago_id: fila.plan_pago_id,
    matricula_id: fila.matricula_id,
    total_cuotas: fila.total_cuotas,
    monto_cuota: fila.monto_cuota,
    moneda: fila.moneda,
    tarifa_id: fila.tarifa_id,
  };
}

/**
 * Consulta unica y parametrizada ($1 = matricula_id).
 *
 * - `plan_objetivo`: como maximo un plan por matricula (indice unico).
 * - `detalle`: `json_agg` de las cuotas de ESE plan (importes como `::text`
 *   exacto, fecha via `to_char` independiente de DateStyle).
 * - `agregado`: `COUNT` + `SUM(saldo_pendiente)` sobre las cuotas de ESE plan,
 *   en la misma fila: detalle y agregado no pueden divergir.
 *
 * Devuelve 0 filas solo si la matricula no existe (el LEFT JOIN sobre
 * `matriculas` es el que decide la existencia); en cualquier otro caso devuelve
 * exactamente 1 fila.
 */
const SQL_PROYECCION_OBLIGACIONES = `
  WITH plan_objetivo AS (
    SELECT id, matricula_id, total_cuotas,
           monto_cuota::text AS monto_cuota, moneda, tarifa_id
      FROM planes_pago
     WHERE matricula_id = $1
  ),
  cuotas AS (
    SELECT men.id,
           men.plan_pago_id,
           men.numero_cuota,
           men.concepto,
           men.monto_original::text AS monto_original,
           men.monto_pagado::text AS monto_pagado,
           men.saldo_pendiente::text AS saldo_pendiente,
           to_char(men.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
           men.estado,
           men.mora_aplicada::text AS mora_aplicada
      FROM mensualidades men
      JOIN plan_objetivo p ON p.id = men.plan_pago_id
  ),
  detalle AS (
    SELECT c.plan_pago_id,
           json_agg(json_build_object(
             'id', c.id,
             'numero_cuota', c.numero_cuota,
             'concepto', c.concepto,
             'monto_original', c.monto_original,
             'monto_pagado', c.monto_pagado,
             'saldo_pendiente', c.saldo_pendiente,
             'fecha_vencimiento', c.fecha_vencimiento,
             'estado', c.estado,
             'mora_aplicada', c.mora_aplicada
           ) ORDER BY c.numero_cuota ASC, c.id ASC) AS cuotas
      FROM cuotas c
     GROUP BY c.plan_pago_id
  ),
  agregado AS (
    SELECT COUNT(*)::int AS cuotas_contadas,
           COALESCE(SUM(men.saldo_pendiente), 0.00) AS saldo_total
      FROM mensualidades men
      JOIN plan_objetivo p ON p.id = men.plan_pago_id
  )
  SELECT ma.id AS matricula_id,
         ma.estado AS matricula_estado,
         p.id AS plan_pago_id,
         p.total_cuotas AS total_cuotas,
         p.monto_cuota AS monto_cuota,
         p.moneda AS moneda,
         p.tarifa_id AS tarifa_id,
         a.cuotas_contadas AS cuotas_contadas,
         a.saldo_total::text AS saldo_total,
         COALESCE(d.cuotas, '[]'::json) AS cuotas
    FROM matriculas ma
    LEFT JOIN plan_objetivo p ON TRUE
    LEFT JOIN detalle d ON d.plan_pago_id = p.id
    LEFT JOIN agregado a ON TRUE
   WHERE ma.id = $1
`;

export class ObligacionesRepository {
  /**
   * El pool es inyectable: las pruebas y cualquier consumidor futuro pasan su
   * propio `Pool` (o `PoolClient`-equivalente) sin tocar el pool de aplicacion.
   */
  constructor(private readonly pool?: Pool) {}

  private executor(): Pool {
    return this.pool ?? getPool();
  }

  /**
   * Proyeccion lectora de una matricula.
   *
   * El id DEBE llegar ya validado por `esIdSeguro32` (lo hace el servicio):
   * este metodo no revalida el rango y ejecuta exactamente UNA consulta
   * parametrizada.
   *
   * Devuelve `null` solo cuando la matricula no existe. Los errores tecnicos de
   * base de datos se propagan tal cual: no se convierten en estado de negocio
   * ni en saldo cero, y no se registran datos sensibles.
   */
  async proyectarObligaciones(matriculaId: number): Promise<ObligacionesRow | null> {
    const result = await this.executor().query<ObligacionesRow>(SQL_PROYECCION_OBLIGACIONES, [
      matriculaId,
    ]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }
}
