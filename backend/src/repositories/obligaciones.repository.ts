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
 *
 * Extension 6.B (mismo archivo, mismas disciplinas, SOLO LECTURA):
 *
 * 6. Proyeccion de PENDIENTES: las cuotas del plan cuyo estado ALMACENADO no
 *    es terminal y cuyo `saldo_pendiente` almacenado es mayor que cero. La
 *    lista de estados terminales la suministra el servicio (politica de
 *    dominio, parametro `$2::text[]`): el repositorio no la inventa. Los
 *    estados presentes en el plan se agregan TAL CUAL (con su conteo) para
 *    que un estado no reconocido se haga visible en lugar de clasificarse en
 *    silencio. No se calcula mora ni se inventa vencimiento: `mora_aplicada`
 *    y `fecha_vencimiento` se leen como estan guardados.
 *
 * 7. Proyeccion de HISTORIAL FINANCIERO: los `pagos` registrados contra la
 *    matricula con sus `pago_medios` y sus `pago_aplicaciones`. `fecha_pago`
 *    es TIMESTAMPTZ y se proyecta en UTC explicito
 *    (`to_char(fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`):
 *    no hay zona horaria institucional configurada (DEC-04/DEC-06 abiertas) y
 *    `AT TIME ZONE 'UTC'` hace el resultado independiente del `TimeZone` del
 *    servidor. No se filtra por estado de pago: el estado almacenado se
 *    proyecta tal cual, sin politica de negocio.
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
 * Cuota proyectada como PENDIENTE. Es exactamente la misma forma almacenada
 * que `CuotaProyeccion` (la condicion de pendiente es estado + saldo, no
 * cambia la forma del dato): por eso el detalle pendiente se valida con el
 * mismo `proyectarDetalleCuotas`.
 */
export type CuotaPendienteProyeccion = CuotaProyeccion;

/**
 * Estado almacenado de cuota tal cual aparece en el plan, con cuantas cuotas
 * lo tienen. Es el mecanismo de superficie: un estado que la proyeccion no
 * reconoce se ve AQUI, con su conteo, sin adivinarlo.
 */
export interface EstadosPresentesProyeccion {
  estado: string;
  cuotas: number;
}

/**
 * Fila unica de la proyeccion de pendientes: matricula + plan opcional +
 * detalle de cuotas pendientes (JSON) + estados presentes del plan (JSON) +
 * conteo de pendientes del MISMO snapshot.
 */
export interface PendientesRow {
  matricula_id: number;
  matricula_estado: string;
  plan_pago_id: number | null;
  total_cuotas: number | null;
  monto_cuota: string | null;
  moneda: string | null;
  tarifa_id: number | null;
  cuotas_pendientes: number;
  pendientes: unknown;
  estados_presentes: unknown;
}

/** Medio de pago proyectado (snapshot almacenado, importe como `::text`). */
export interface MedioPagoProyeccion {
  id: number;
  tipo: string;
  monto: string;
  referencia: string | null;
}

/**
 * Aplicacion de un pago sobre una cuota. `numero_cuota` se lee de la
 * mensualidad referenciada (puede ser null solo si la fila referenciada no
 * existe, pese a la FK: se proyecta el hueco en lugar de descartar la
 * aplicacion).
 */
export interface AplicacionPagoProyeccion {
  id: number;
  pago_id: number;
  mensualidad_id: number;
  numero_cuota: number | null;
  monto_aplicado: string;
}

/**
 * Pago proyectado con sus medios y sus aplicaciones. `fecha_pago` es texto
 * `YYYY-MM-DD HH24:MI:SS` en UTC (ver decision 7 de la cabecera). El estado
 * del pago se proyecta tal cual: no se filtra ni se reinterpreta.
 */
export interface PagoProyeccion {
  id: number;
  estudiante_id: number;
  matricula_id: number | null;
  monto_total: string;
  fecha_pago: string;
  estado: string;
  idempotencia_key: string | null;
  usuario_id: number | null;
  observaciones: string | null;
  medios: MedioPagoProyeccion[];
  aplicaciones: AplicacionPagoProyeccion[];
}

/**
 * Fila unica del historial: matricula + pagos (JSON, reciente primero).
 * `pagos` es `[]` explicito cuando la matricula no tiene pagos registrados.
 */
export interface HistorialRow {
  matricula_id: number;
  matricula_estado: string;
  pagos: unknown;
}

function esTextoONulo(valor: unknown): valor is string | null {
  return valor === null || esTexto(valor);
}

function esEnteroONulo(valor: unknown): valor is number | null {
  return valor === null || esEntero(valor);
}

/**
 * Mapea el agregado de estados presentes (`{estado, cuotas}`). Devuelve
 * `null` si la forma no es la esperada: el servicio lo clasifica como
 * integridad invalida en lugar de descartar el aviso en silencio.
 */
export function proyectarEstadosPresentes(estados: unknown): EstadosPresentesProyeccion[] | null {
  if (!Array.isArray(estados)) return null;

  const presentes: EstadosPresentesProyeccion[] = [];
  for (const entrada of estados) {
    if (typeof entrada !== 'object' || entrada === null) return null;
    const fila = entrada as Record<string, unknown>;

    if (!esTexto(fila.estado)) return null;
    if (!esEntero(fila.cuotas)) return null;

    presentes.push({ estado: fila.estado, cuotas: fila.cuotas });
  }
  return presentes;
}

/**
 * Mapea los pagos del historial con sus medios y aplicaciones. Devuelve
 * `null` si cualquier forma no es la esperada (no se inventan pagos ni se
 * descartan medios en silencio).
 */
export function proyectarPagos(pagos: unknown): PagoProyeccion[] | null {
  if (!Array.isArray(pagos)) return null;

  const proyectados: PagoProyeccion[] = [];
  for (const entrada of pagos) {
    if (typeof entrada !== 'object' || entrada === null) return null;
    const pago = entrada as Record<string, unknown>;

    if (!esEntero(pago.id)) return null;
    if (!esEntero(pago.estudiante_id)) return null;
    if (!esEnteroONulo(pago.matricula_id)) return null;
    if (!esTexto(pago.monto_total)) return null;
    if (!esTexto(pago.fecha_pago)) return null;
    if (!esTexto(pago.estado)) return null;
    if (!esTextoONulo(pago.idempotencia_key)) return null;
    if (!esEnteroONulo(pago.usuario_id)) return null;
    if (!esTextoONulo(pago.observaciones)) return null;

    if (!Array.isArray(pago.medios)) return null;
    if (!Array.isArray(pago.aplicaciones)) return null;

    const medios: MedioPagoProyeccion[] = [];
    for (const entradaMedio of pago.medios) {
      if (typeof entradaMedio !== 'object' || entradaMedio === null) return null;
      const medio = entradaMedio as Record<string, unknown>;
      if (!esEntero(medio.id)) return null;
      if (!esTexto(medio.tipo)) return null;
      if (!esTexto(medio.monto)) return null;
      if (!esTextoONulo(medio.referencia)) return null;
      medios.push({
        id: medio.id,
        tipo: medio.tipo,
        monto: medio.monto,
        referencia: medio.referencia,
      });
    }

    const aplicaciones: AplicacionPagoProyeccion[] = [];
    for (const entradaAplicacion of pago.aplicaciones) {
      if (typeof entradaAplicacion !== 'object' || entradaAplicacion === null) return null;
      const aplicacion = entradaAplicacion as Record<string, unknown>;
      if (!esEntero(aplicacion.id)) return null;
      if (!esEntero(aplicacion.pago_id)) return null;
      if (!esEntero(aplicacion.mensualidad_id)) return null;
      if (!esEnteroONulo(aplicacion.numero_cuota)) return null;
      if (!esTexto(aplicacion.monto_aplicado)) return null;
      aplicaciones.push({
        id: aplicacion.id,
        pago_id: aplicacion.pago_id,
        mensualidad_id: aplicacion.mensualidad_id,
        numero_cuota: aplicacion.numero_cuota,
        monto_aplicado: aplicacion.monto_aplicado,
      });
    }

    proyectados.push({
      id: pago.id,
      estudiante_id: pago.estudiante_id,
      matricula_id: pago.matricula_id,
      monto_total: pago.monto_total,
      fecha_pago: pago.fecha_pago,
      estado: pago.estado,
      idempotencia_key: pago.idempotencia_key,
      usuario_id: pago.usuario_id,
      observaciones: pago.observaciones,
      medios,
      aplicaciones,
    });
  }
  return proyectados;
}

/**
 * Proyecta el plan desde la fila de PENDIENTES (mismos campos de snapshot que
 * `proyectarPlan`, fila distinta: la firma de 6.A no se toca). Devuelve
 * `null` cuando la matricula no tiene plan o el identificador no es entero.
 */
export function proyectarPlanPendiente(fila: PendientesRow): PlanProyeccion | null {
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

/**
 * Consulta unica y parametrizada de PENDIENTES
 * ($1 = matricula_id, $2 = lista de estados terminales a excluir).
 *
 * - `plan_objetivo`: como maximo un plan por matricula (indice unico).
 * - `pendientes`: cuotas de ESE plan cuyo `estado` almacenado NO esta en la
 *   lista terminal (`estado <> ALL ($2::text[])`) Y cuyo `saldo_pendiente`
 *   almacenado es mayor que cero. La comparacion es exacta sobre NUMERICO en
 *   el motor: no se recalcula nada, no se compara contra fechas ni mora.
 * - `detalle`: JSON de esas cuotas (importes `::text`, fecha `to_char`) en la
 *   MISMA fila que el conteo: no pueden divergir.
 * - `estados`: JSON con TODOS los estados almacenados del plan y su conteo,
 *   terminales o no: un estado no reconocido queda visible aqui.
 *
 * Devuelve 0 filas solo si la matricula no existe. La lista terminal vacia
 * (`[]`) dejaria pasar todos los estados: la politica la fija el servicio.
 */
const SQL_PROYECCION_PENDIENTES = `
  WITH plan_objetivo AS (
    SELECT id, matricula_id, total_cuotas,
           monto_cuota::text AS monto_cuota, moneda, tarifa_id
      FROM planes_pago
     WHERE matricula_id = $1
  ),
  pendientes AS (
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
     WHERE men.estado <> ALL ($2::text[])
       AND men.saldo_pendiente > 0
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
           ) ORDER BY c.numero_cuota ASC, c.id ASC) AS pendientes
      FROM pendientes c
     GROUP BY c.plan_pago_id
  ),
  estados AS (
    SELECT e.plan_pago_id,
           json_agg(json_build_object(
             'estado', e.estado,
             'cuotas', e.cuotas
           ) ORDER BY e.estado ASC) AS estados_presentes
      FROM (
        SELECT p.id AS plan_pago_id,
               m2.estado AS estado,
               COUNT(*)::int AS cuotas
          FROM mensualidades m2
          JOIN plan_objetivo p ON p.id = m2.plan_pago_id
         GROUP BY p.id, m2.estado
      ) e
     GROUP BY e.plan_pago_id
  ),
  agregado AS (
    SELECT COUNT(*)::int AS cuotas_pendientes
      FROM pendientes
  )
  SELECT ma.id AS matricula_id,
         ma.estado AS matricula_estado,
         p.id AS plan_pago_id,
         p.total_cuotas AS total_cuotas,
         p.monto_cuota AS monto_cuota,
         p.moneda AS moneda,
         p.tarifa_id AS tarifa_id,
         a.cuotas_pendientes AS cuotas_pendientes,
         COALESCE(d.pendientes, '[]'::json) AS pendientes,
         COALESCE(es.estados_presentes, '[]'::json) AS estados_presentes
    FROM matriculas ma
    LEFT JOIN plan_objetivo p ON TRUE
    LEFT JOIN detalle d ON d.plan_pago_id = p.id
    LEFT JOIN estados es ON es.plan_pago_id = p.id
    LEFT JOIN agregado a ON TRUE
   WHERE ma.id = $1
`;

/**
 * Consulta unica y parametrizada del HISTORIAL ($1 = matricula_id).
 *
 * - `pagos_objetivo`: pagos cuya columna `matricula_id` es exactamente $1
 *   (los pagos sin matricula asociada no son "contra esta matricula"). El
 *   estado del pago NO se filtra: se proyecta tal cual.
 * - `medios` / `aplicaciones`: JSON por pago en la MISMA fila (un solo
 *   round-trip; no hay N+1). Las aplicaciones se LEFT JOINean a su
 *   mensualidad solo para proyectar `numero_cuota`.
 * - `fecha_pago` (TIMESTAMPTZ) via `to_char(..., AT TIME ZONE 'UTC', ...)`:
 *   instante UTC explicito, independiente del `TimeZone` del servidor.
 * - Orden: `fecha_pago` DESC, `id` DESC (lo registrado mas reciente
 *   primero). Con cero pagos, `pagos` es `[]` explicito.
 *
 * Devuelve 0 filas SOLO si la matricula no existe: el LEFT JOIN sobre
 * `matriculas` es el que decide la existencia.
 */
const SQL_PROYECCION_HISTORIAL = `
  WITH pagos_objetivo AS (
    SELECT pg.id,
           pg.estudiante_id,
           pg.matricula_id,
           pg.monto_total::text AS monto_total,
           to_char(pg.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS fecha_pago,
           pg.estado,
           pg.idempotencia_key,
           pg.usuario_id,
           pg.observaciones
      FROM pagos pg
     WHERE pg.matricula_id = $1
  ),
  medios AS (
    SELECT pm.pago_id,
           json_agg(json_build_object(
             'id', pm.id,
             'tipo', pm.tipo,
             'monto', pm.monto::text,
             'referencia', pm.referencia
           ) ORDER BY pm.id ASC) AS medios
      FROM pago_medios pm
      JOIN pagos_objetivo p ON p.id = pm.pago_id
     GROUP BY pm.pago_id
  ),
  aplicaciones AS (
    SELECT pa.pago_id,
           json_agg(json_build_object(
             'id', pa.id,
             'pago_id', pa.pago_id,
             'mensualidad_id', pa.mensualidad_id,
             'numero_cuota', men.numero_cuota,
             'monto_aplicado', pa.monto_aplicado::text
           ) ORDER BY pa.id ASC) AS aplicaciones
      FROM pago_aplicaciones pa
      JOIN pagos_objetivo p ON p.id = pa.pago_id
      LEFT JOIN mensualidades men ON men.id = pa.mensualidad_id
     GROUP BY pa.pago_id
  ),
  detalle AS (
    SELECT p.id,
           p.fecha_pago,
           json_build_object(
             'id', p.id,
             'estudiante_id', p.estudiante_id,
             'matricula_id', p.matricula_id,
             'monto_total', p.monto_total,
             'fecha_pago', p.fecha_pago,
             'estado', p.estado,
             'idempotencia_key', p.idempotencia_key,
             'usuario_id', p.usuario_id,
             'observaciones', p.observaciones,
             'medios', COALESCE(m.medios, '[]'::json),
             'aplicaciones', COALESCE(a.aplicaciones, '[]'::json)
           ) AS pago
      FROM pagos_objetivo p
      LEFT JOIN medios m ON m.pago_id = p.id
      LEFT JOIN aplicaciones a ON a.pago_id = p.id
  ),
  agregado AS (
    SELECT json_agg(d.pago ORDER BY d.fecha_pago DESC, d.id DESC) AS pagos
      FROM detalle d
  )
  SELECT ma.id AS matricula_id,
         ma.estado AS matricula_estado,
         COALESCE(ag.pagos, '[]'::json) AS pagos
    FROM matriculas ma
    LEFT JOIN agregado ag ON TRUE
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

  /**
   * Proyeccion lectora de cuotas PENDIENTES de una matricula.
   *
   * El id DEBE llegar ya validado por `esIdSeguro32` (lo hace el servicio) y
   * `estadosTerminales` es la politica explicita del dominio (el repositorio
   * no la inventa): se ejecuta UNA sola consulta parametrizada con ambos.
   *
   * Devuelve `null` solo cuando la matricula no existe. Sin plan o sin
   * pendientes devuelve la fila con `pendientes` = `[]`. Los errores tecnicos
   * de base de datos se propagan tal cual.
   */
  async proyectarPendientes(
    matriculaId: number,
    estadosTerminales: readonly string[]
  ): Promise<PendientesRow | null> {
    const result = await this.executor().query<PendientesRow>(SQL_PROYECCION_PENDIENTES, [
      matriculaId,
      [...estadosTerminales],
    ]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Proyeccion lectora del HISTORIAL FINANCIERO de una matricula: pagos
   * registrados contra ella con medios y aplicaciones.
   *
   * El id DEBE llegar ya validado por `esIdSeguro32` (lo hace el servicio):
   * UNA sola consulta parametrizada. La lista de pagos puede volver vacia
   * (matricula sin pagos): eso es dato, no error. Los errores tecnicos de
   * base de datos se propagan tal cual.
   */
  async proyectarHistorial(matriculaId: number): Promise<HistorialRow | null> {
    const result = await this.executor().query<HistorialRow>(SQL_PROYECCION_HISTORIAL, [
      matriculaId,
    ]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }
}
