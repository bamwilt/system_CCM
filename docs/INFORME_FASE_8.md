# Informe de control — FASE 8

Fecha: 2026-11-11. Versión: 1.0.

**FASE:** 8 — Reportes y consultas.

**OBJETIVO:** Permitir consultar la información administrativa y financiera del sistema, con filtros y paginación, obteniendo todas las cifras de los registros financieros oficiales.

## REQUISITOS IMPLEMENTADOS

Los ocho reportes candidatos del PM, verificados contra los requisitos antes de desarrollar cada uno:

| # | Reporte PM | Estado | Fundamento en requisitos |
|---|---|---|---|
| 1 | Pagos por período | Implementado | cadena de valor → reportes |
| 2 | Matrículas registradas | Implementado | D02 FR-002 |
| 3 | Estudiantes con saldos pendientes | Implementado | consulta de cuenta / morosidad |
| 4 | Morosidad | Implementado | D02 FR-039 y STK-REQ-004 (listas de alumnos en mora) |
| 5 | Recaudación | Implementado | D02 FR-040 y P0058 (resumen diario) |
| 6 | Historial individual | Implementado como estado de cuenta | línea 53 de REQUISITOS_CONSOLIDADOS |
| 7 | Operaciones anuladas | Implementado | RN-SGPM-07 (el reporte refleja la operación y sus reversiones) |
| 8 | Movimientos por cajero | Implementado | línea 53 (conciliar por día/operador/medio) |

Requisitos del PM sobre la fase:

- **"Los reportes deben obtener sus cifras de los registros financieros oficiales":** ninguna consulta recalcula un importe. Lo que se suma es lo que `pagos`, `pago_aplicaciones`, `mensualidades` y `pago_medios` tienen almacenado; las sumas las hace PostgreSQL sobre `NUMERIC` y se devuelven como texto exacto. No hay multiplicaciones, divisiones ni redondeos inventados.
- **"No duplicar cálculos monetarios de manera inconsistente entre backend y frontend":** los importes cruzan la frontera como strings exactos, de modo que el frontend no necesita (ni puede) recalcularlos.
- **Filtros y paginación:** rango de fechas, moneda, agrupación, `limite` (máx. 200) y `compensar`, con validación estricta en backend.
- **Validación:** "Comparar los totales de los reportes con los registros almacenados" y "verificar especialmente que anulaciones y abonos parciales se reflejen correctamente" → son pruebas, no afirmaciones (ver más abajo).

**Exportación: NO IMPLEMENTADA.** El PM la condiciona a "cuando los requisitos lo contemplen" y DEC-13 (formato, campos personales, paginación, corte horario, apertura/cierre) sigue **PENDIENTE DE DETALLE**.

## ARCHIVOS CREADOS

- `backend/src/repositories/reportes.repository.ts` — diez consultas de solo lectura.
- `backend/src/services/reportes.service.ts` — validación de filtros y proyección de resultados.
- `backend/src/routes/reportes.routes.ts` — diez endpoints GET.
- `backend/tests/reportes.test.ts` — 19 pruebas.
- `database/migrations/010_reportes_permisos.sql` — permiso `reportes:read`.

## ARCHIVOS MODIFICADOS

- `backend/src/authorization/permissions.ts` — `REPORTES_READ`.
- `backend/src/app.ts` — registro del router en `/api/reportes`.

## PRUEBAS EJECUTADAS

- **Nuevas:** 19 pruebas en `backend/tests/reportes.test.ts`, todas en verde.
- **Regresión completa:** `cd backend && npm test` → **17 archivos, 343 pruebas, 343 PASS / 0 FAIL / 0 SKIP, exit 0** (192 s). Línea base previa: 16 archivos y 324 pruebas.
- **Typecheck de fuente:** exit 0. **Typecheck de fuente + tests:** exit 0.

Lo que las pruebas verifican, que es lo que el PM pide comprobar:

1. **Totales contra registros almacenados:** cada total del reporte se contrasta con una consulta directa a la tabla (`SUM(monto_total)` filtrado por estado), nunca contra un valor escrito a mano.
2. **Anulaciones:** una operación revertida **no** suma a la recaudación, pero **sí** se informa aparte (`anuladas` y `total_anulado`). El reporte no oculta la reversión (RN-SGPM-07).
3. **Abonos parciales:** después de un abono, el saldo del estudiante baja exactamente ese importe; un estudiante sin deuda desaparece del reporte.
4. **Morosidad sin reloj implícito:** `fecha_corte` es obligatoria; sin ella el endpoint devuelve 400 en lugar de usar el reloj del servidor. Esto mantiene el reporte reproducible.
5. **Estado de cuenta:** cuotas totales, pagadas y pendientes, saldo total, pagos registrados y anulados, del mismo estudiante.
6. **Permisos:** 401 sin sesión, 403 sin `reportes:read`, 200 con el permiso.
7. **Comprobantes de exactitud:** importes comparados como strings, sin conversión a número.

## RESULTADOS

- Los diez endpoints responden con filtros validados y paginación, contra PostgreSQL 16 real por socket Unix aislado.
- Cada reporte se derivó de una sola consulta parametrizada: sin N+1 y sin cálculo intermedio.
- `pagos.fecha_pago` es el sello de registro (`NOW()`), distinto de la `fecha_efectiva` que usa el motor para la mora. Los reportes filtran por el sello de registro, que es el registro oficial.

## ERRORES DETECTADOS

1. **`ORDER BY fecha_pago::date` con `GROUP BY fecha_pago::date`** rechazado por PostgreSQL: la columna `fecha_pago` debe aparecer en el `GROUP BY` o en un agregado. Corregido agrupando por el alias `dia`, que PostgreSQL admite.
2. **`($n::date + 1) * interval '1 day'`** no existe: `date + integer` no es un operador de PostgreSQL. Corregido a `$n::date + interval '1 day'` en los cinco sitios.
3. **`CAST($1 AS date)`** era necesario: `$1::date` dentro de una expresión posicional daba error de sintaxis en la morosidad.
4. **Conteo de estudiantes pendientes por plan** en lugar de por estudiante: el total no cuadraba con las filas devueltas.
5. **El arnés de prueba contaminaba entre pruebas**: el `beforeEach` solo limpiaba roles, no matrículas ni pagos, de modo que los totales de una prueba incluían datos de la anterior. Corregido con limpieza completa por matrícula.
6. **Doble evaluación de `Date.now()`** al construir el email del actor de prueba: si cambiaba el milisegundo entre ambas, el login usaba un email distinto del insertado y todas las pruebas daban 401.
7. **Los filtros por año del fixture no encontraban pagos**: `pagos.fecha_pago` es el sello de registro real, no la fecha efectiva. Las pruebas pasaron a usar un rango que siempre cubre.

## ERRORES CORREGIDOS

Los siete anteriores, cada uno con su verificación.

## LIMITACIONES

1. **Sin exportación.** DEC-13 sigue pendiente: formato, campos personales, paginación, corte horario y cierre de caja no están definidos, y el PM la condiciona a que los requisitos lo contemplen.
2. **Sin cierre de caja formal** (arqueo, efectivo contado, diferencias, reapertura): también DEC-13.
3. **La morosidad no aplica la mora**: la reporta desde `mora_aplicada` almacenada. El cálculo de mora es del motor (Fase 6) con la línea base DEC-20, no de esta fase.
4. **Filtro `≥2 cuotas`** de D10 CP-FN-12 no implementado: DEC-13 lo descartó expresamente como filtro ilustrativo.
5. **Sin interfaz**: los reportes se consultan por API. Su presentación es Fase 9.

## REQUISITOS PENDIENTES

- DEC-13: formato de exportación, campos personales, paginación, corte horario, apertura y cierre de caja.
- DEC-03: matriz de permisos institucionales (`reportes:read` es permiso técnico).
- Fase 9: interfaz de los reportes.

## ESTADO DE LA FASE

**FASE 8 COMPLETADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.** Los ocho reportes candidatos están implementados y probados, con sus cifras derivadas de registros almacenados y las anulaciones y abonos parciales reflejados correctamente. Reserva principal: sin exportación ni cierre de caja por DEC-13 pendiente.
