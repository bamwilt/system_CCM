# Informe de control — FASE 6.B (motor financiero: aplicación de abonos)

Fecha: 2026-11-10. Versión: 1.0. Lote: `sgpm-fase6-base-v1` (incremento 6.B del motor financiero).
Plantilla: sección 4 del `Prompt_Maestro_Desarrollo_SGPM_v2.md`. Todas las cifras provienen de
`.tmp/test-artifacts/sgpm-fase6-6B/REPORTE_TESTER.md`, informe cuyo contenido fue **verificado de
forma independiente por el orquestador** tras la ejecución del agente `minion-tester`, y de lectura
directa del código y de las pruebas realizada durante esta subtarea de documentación. No se atribuye
a esta ejecución evidencia heredada de lotes anteriores: donde una funcionalidad se midió en otro
lote se dice expresamente.

**FASE:** 6.B — Motor financiero de mensualidades, incremento B: aplicación de abonos (FIFO, mora,
abono parcial, liquidación), descuentos autorizados y las dos proyecciones de lectura pendientes.
Es un subconjunto de la FASE 6 del Prompt Maestro y **no** equivale a la FASE 6 completa.

**OBJETIVO:** implementar el motor que aplica un abono al plan de pago de UNA matrícula y las
proyecciones de lectura que lo acompañan, sin fijar ni inventar políticas institucionales, sobre la
línea base técnica registrada en **DEC-20**. Sin endpoint, sin UI y sin consumidores HTTP: la
integración de ruta llega con la FASE 7.

---

## RÉGIMEN DE DECISIÓN DE LAS REGLAS (DEC-20) — ESTADO DOCUMENTAL

Los parámetros que usa el motor (vencimiento día 10, mora 10 % desde el día 11, una sola vez sobre
el monto base y no capitalizable, orden FIFO, `PAGADA` al saldar conservando la mora, excedente
rechazado, descuento antes de generar el plan y no contabilizado como efectivo, redondeo
`half-up` resuelto por PostgreSQL) son la **propuesta técnica del desarrollador, delegada
explícitamente por el solicitante el 2026-11-10** («lo de reglas mora fifo investígalas tú, yo no
tengo nada de reglas institucionales, te lo dejo a tu criterio»). Estado registrado en DEC-20:
**PROPUESTA TÉCNICA; RATIFICACIÓN INSTITUCIONAL PENDIENTE**. **No es política institucional, no
sustituye la ratificación de Dirección/cobros y no constituye acta del colegio.** Aquí se registra
una sola vez, como trazabilidad; no se repite como condición de cada sección y **no** bloquea la
implementación ni las pruebas de este lote (DEC-20, «Bloquea»: nada para implementación y pruebas;
la aceptación institucional de importes finales queda pendiente de ratificación). Este informe no
acredita aceptación institucional.

---

## REQUISITOS IMPLEMENTADOS

### Las nueve funcionalidades del PM para la FASE 6 y su estado real

| # | Funcionalidad (PM) | Estado real | Dónde y con qué prueba |
|---|---|---|---|
| 1 | Generación de mensualidades | **Implementada y medida en el lote de FASE 5**, no en este | Plan + N cuotas en la transacción de matrícula. En 6.B solo se usa como *fixture* de los escenarios; su evidencia es de `docs/INFORME_FASE_5.md` |
| 2 | Consulta de obligaciones | **Implementada y medida en el lote 6.A**, no en este | `ObligacionesService.proyectarObligaciones`; evidencia en `docs/INFORME_FASE_6A.md`. En 6.B se reejecuta dentro de la regresión (275 PASS) y como verificación cruzada de PM 7 |
| 3 | Cálculo de saldos | **Implementada y medida en el lote 6.A**, no en este | `saldo_total` exacto de la misma proyección; misma salvedad |
| 4 | Identificación de pagos pendientes | **Implementada en 6.B**; verificación **PARCIAL** | `ObligacionesService.proyectarPendientes`: condición derivada de datos **almacenados** (`estado <> ESTADOS_TERMINALES_CUOTA AND saldo_pendiente > 0`); `plan: null` distingue «matrícula sin plan»; `estados_presentes` y `estados_no_reconocidos` superficían los estados desconocidos sin adivinarlos. Se ejerce de forma cruzada en **PM 7** únicamente en el caso de deuda cero (`pendientes` `[]`, `cuotas_pendientes` 0). **Sin prueba para:** lista no vacía, `MATRICULA_INEXISTENTE`, `INTEGRIDAD_INVALIDA` y `estados_no_reconocidos` → **NO VERIFICADO** |
| 5 | Aplicación de descuentos | **Implementada y medida en 6.B** | Antes de generar el plan; afecta al `monto_cuota` almacenado; exige autorizador explícito; nunca se contabiliza como efectivo. Prueba **PM 5** |
| 6 | Cálculo de recargos por mora | **Implementado y medido en 6.B** | 10 % desde el día 11, una sola vez sobre el monto base, no capitalizable, no recalculado al reducir el saldo. Prueba **PM 6** |
| 7 | Abonos parciales | **Implementado y medido en 6.B** | Secuencial con remanente, nunca negativo. Pruebas **PM 2, PM 3, PM 4** |
| 8 | Liquidación de obligaciones | **Implementada y medida en 6.B** | Cuota que llega a `0.00` → `PAGADA` conservando la mora; excedente sobre la deuda total rechazado. Pruebas **PM 1, PM 7** y el test de excedente |
| 9 | Historial financiero | **Implementada en 6.B**; verificación **NO REALIZADA** | `ObligacionesService.proyectarHistorial`: pagos con `matricula_id` de la matrícula, con sus medios y aplicaciones tal como están guardados, importes como cadenas exactas y `fecha_pago` proyectada en UTC explícito. **No existe ninguna prueba que lo ejecute en la suite** (verificado por búsqueda en `backend/tests/`): **NO VERIFICADO** |

**Consecuencia explícita:** dos de las nueve funcionalidades del PM (la número 4 en su proyección
completa y la número 9) **no tienen prueba que las mida** en este lote. La FASE 6 no está completa y
no se declara como tal.

### Regla FIFO definida explícitamente (exigencia «Define expresamente» del PM)

| Punto exigido por el PM | Resolución implementada | Medido en |
|---|---|---|
| Orden de obligaciones | `fecha_vencimiento` ascendente (`MOTOR_ORDEN_FIFO`, propuesta DEC-20) | PM 4, PM 3 |
| Criterio de desempate | `numero_cuota` ascendente y después `id` ascendente (`MOTOR_DESEMPATE_FIFO`) | PM 4 (parcial; ver LIMITACIONES: el `id ASC` es inalcanzable dentro de un plan) |
| Distribución de pagos parciales | Secuencial con remanente: `LEAST(saldo, remanente)` en PostgreSQL; el remanente se agota antes de pasar a la siguiente cuota | PM 2, PM 3, PM 4 |
| Tratamiento de mora | 10 % desde el día 11, una sola vez sobre `monto_original`, no capitalizable, conservada al saldar | PM 6, PM 1 |
| Tratamiento de descuentos | Antes de generar el plan; afecta a `monto_cuota`; explícito y autorizado; no es efectivo | PM 5 |
| Obligaciones ya canceladas | Fuera de la ventana FIFO: `obtenerCuotasFifo` solo devuelve `saldo_pendiente > 0`; una cuota `PAGADA` no recibe aplicaciones | PM 1, PM 7 |
| Pagos superiores al saldo | Rechazados con 400 antes de escribir nada (`excede_deuda`, propuesta DEC-06); el importe exacto igual a la deuda sí se acepta | test de excedente |
| **Reversiones y anulaciones** | **NO IMPLEMENTADAS** en 6.B; corresponden a la FASE 7 y a DEC-08 | **NO VERIFICADO / fuera de alcance** |

### Reglas monetarias definidas explícitamente (exigencia del PM)

| Punto | Resolución | Dónde |
|---|---|---|
| Moneda | La ya almacenada en `planes_pago.moneda`; sin conversión y sin valor por defecto (las filas *legacy* quedan `null`) | `politicas-financieras`; el motor lee el plan y no compara monedas |
| Precisión | `NUMERIC(12,2)` en base de datos; importes como cadenas exactas en TypeScript | todo el motor; `MOTOR_PRECISION_DECIMALES = 2` fijo por el esquema vigente |
| Redondeo | `half-up` resuelto por PostgreSQL, **nunca** en JavaScript | prueba de redondeo: `'33.335'` sobre `'100.00'` → `'66.67'` (JavaScript `toFixed` habría dado `'66.66'`) |
| Fecha de vencimiento | Día 10 del mes de la cuota (propuesta; D12 día 5 registrada y no adoptada) | `MOTOR_DIA_VENCIMIENTO` |
| Fecha efectiva del pago | Obligatoria y explícita en la petición (`YYYY-MM-DD`); el motor **nunca** usa el reloj del servidor; sin ella, 400 | motor + test de rechazos de validación |
| Orden de descuentos y recargos | El descuento se aplica **antes** de generar el plan (afecta a `monto_cuota`); la mora se calcula después sobre `monto_original` al aplicar el abono, una sola vez | PM 5 y PM 6 |

### Módulo de políticas: una sola fuente de parámetros

`backend/src/dominio/politicas-financieras.ts` centraliza los 21 parámetros del motor. Propiedades
verificadas sobre el código:

- **Importable sin efectos secundarios:** no lee la base de datos, no abre conexiones, no escribe
  archivos, no usa `console`. Única lectura permitida: el entorno recibido por parámetro.
- **Parámetro ausente o cadena vacía** → valor propuesto por DEC-20. **Parámetro presente e inválido**
  → `ErrorPoliticaFinancieraInvalida` (fallo ruidoso); nunca una sustitución silenciosa, nunca 0,
  `null` ni `NaN`.
- **Cobertura campo ↔ variable de entorno verificada en cada resolución:** ni un parámetro sin
  *override* externo ni una clave huérfana.
- **Coherencia documentación ↔ código:** `VALORES_PROPUESTA_EN_ENTORNO` debe resolver exactamente a
  los *defaults* del esquema; si divergen, el módulo falla.
- **El motor rechaza la deriva de configuración:** `verificarPoliticasImplementadas()` aborta sin
  escribir nada si la política resuelta se aparta de la línea base implementada (ámbito FIFO,
  excedente, modo de abono, saldo negativo, capitalización, conversión de moneda, momento del
  redondeo, precisión). Cubierto por test.

---

## ARCHIVOS CREADOS

- `backend/src/dominio/politicas-financieras.ts` — módulo único de parámetros del motor.
- `backend/src/repositories/aplicacion-pagos.repository.ts` — persistencia atómica del abono (sin
  reglas de negocio; todo el cálculo de importes y el `ROUND` ocurren en PostgreSQL).
- `backend/src/services/aplicacion-pagos.service.ts` — motor: validación, idempotencia, excedente,
  aplicación secuencial, verificación RN-SGPM-07 y auditoría dentro de la misma transacción.
- `backend/tests/motor-aplicacion.test.ts` — 16 pruebas, 208 aserciones, sin `.only` ni `.skip`.

## ARCHIVOS MODIFICADOS

- `backend/src/validators/matricula.schema.ts` — descuento autorizado explícito: `porcentaje` como
  cadena decimal exacta y `autorizado_por` obligatorio (sin autorizador → 400; nunca en silencio).
- `backend/src/repositories/matricula.repository.ts` — `calcularMontoCuotaConDescuento` en
  PostgreSQL (importe de cuota con descuento y `descuento_por_cuota` exactos) y exposición de
  `descuento_por_cuota` en la proyección del plan de pago.
- `backend/src/services/matricula.service.ts` — aplicación del descuento **antes** de generar el
  plan y trazabilidad en la auditoría de la matrícula (porcentaje, autorizador, política, importes).
- `backend/src/repositories/obligaciones.repository.ts` y `backend/src/services/obligaciones.service.ts`
  — proyecciones de **pendientes** e **historial financiero**, ambas de solo lectura.

Sin migración, sin semilla, sin `package.json`, sin ruta, sin permiso, sin dependencia y sin cambio
de configuración.

---

## PRUEBAS EJECUTADAS

Medio: PostgreSQL **16.15** sobre socket Unix aislado (nunca TCP), puerto `55433`, base
`sgpm_auth_test`, usuario `sgpm_test`. Suite de `backend` en modo **serial**
(`vitest.config.ts` con `fileParallelism: false`, `singleFork: true`; configuración intacta).

| Batería | Comando real | Exit | Resultado | Duración |
|---|---|---:|---|---|
| Suite completa (final) | `cd backend && npm test` (serial) | **0** | **14 archivos, 275 tests: 275 PASS / 0 FAIL / 0 SKIP** | 160.36 s (23:56:54 → 23:59:35); ~156 s en reposo |
| Archivo nuevo aislado | `npx vitest run tests/motor-aplicacion.test.ts` | **0** | 1 archivo, **16 tests, 16 PASS**, 208 aserciones | 1.85–2.5 s |
| Línea base previa (contexto, **no** ejecutada en este lote) | — | 0 | 13 archivos, 259 tests, 259 PASS | 160.13 s |
| Typecheck de `src` | `cd backend && npm run typecheck` | **0** | 0 errores | ~6 s |
| Typecheck estricto `src` + tests | `npx tsc -p ../.tmp/test-artifacts/tsconfig.test.json --noEmit` | **0** | 0 errores (salida de 0 bytes) | ~9 s |

Crecimiento de la suite: **259 → 275 tests (+16)**, 13 → 14 archivos (+1). Los dos typechecks fueron
**reverificados por el orquestador** después de que el tester los reportara (exit 0 en ambos).

### Latencia del motor (contexto, no criterio de aceptación)

Medida con `performance.now()` alrededor de cada `aplicarAbono` real, acumulada durante la suite:
**26 abonos, mediana 8.3 ms, máximo 30.6 ms**. Sin *timeouts* (límite de 30 s por prueba).

### Sensibilidad de las aserciones (prueba de mutación sobre el propio archivo de prueba, revertida)

| Mutación (solo en el archivo de prueba) | Exit | Resultado |
|---|---:|---|
| `MOTOR_PORCENTAJE_MORA: '10'` → `'5'` | 1 | 4 FAIL (políticas, PM 1, PM 2, PM 6) |
| `MOTOR_ESTADO_CUOTA_SALDADA: 'PAGADA'` → `'SALDADA'` | 1 | 7 FAIL (PM 1, 2, 3, 7, 8, 9 + políticas) |
| Estado original restaurado | 0 | 16/16 PASS |

Demuestra que las aserciones no son vacuas. Ningún código de producción fue mutado.

---

## RESULTADOS

- Suite completa: **14 archivos, 275 tests, 275 PASS / 0 FAIL / 0 SKIP, exit 0** (línea base previa
  13 archivos / 259 tests; el incremento son los 16 tests del archivo nuevo).
- Typecheck de `src`: exit 0. Typecheck de `src` + tests: exit 0. Ambos reverificados.
- **Exactitud monetaria demostrada:** todos los importes se comparan como cadenas exactas
  (`::text` de PostgreSQL contra literales: `'900.00'`, `'0.00'`, `'100.00'`, `'66.67'`). El único
  `Number()` del archivo de prueba convierte un recuento de filas, nunca un importe.
- **Redondeo no realizado en JavaScript:** `'33.335'` sobre `'100.00'` produce `'66.67'`
  (*half-up* de PostgreSQL); `toFixed` en JavaScript habría dado `'66.66'`.
- **Mora:** se aplica una sola vez sobre `monto_original`, no se recalcula al reducir el saldo
  (`monto_pagado + saldo_pendiente = monto_original` medido en SQL) y no se capitaliza.
- **Concurrencia real:** dos llamadas en paralelo con dos conexiones reales del *pool* y dos
  transacciones reales; el `pg_advisory_xact_lock(4315003)` del proyecto las serializa.
- **Atomicidad real:** *trigger* real en PostgreSQL (`BEFORE INSERT ON pago_aplicaciones`) que
  aborta la transacción a mitad de camino; rollback medido por **hash lógico**
  (`COUNT(*)` + `MD5(STRING_AGG(MD5(t::text)))`, con `DateStyle` y `TimeZone` fijados).
- **RN-SGPM-07** (`monto_total` = Σ `pago_medios` = Σ `pago_aplicaciones`) verificada dentro de la
  transacción en cada pago y en barrido SQL global.
- UI y accesibilidad: **N/A** (`ui: false`; el motor es interno, no hay endpoint ni pantalla). No se
  ejecutó navegador ni axe.

### Las diez pruebas obligatorias del PM (FASE 6, «Pruebas obligatorias»)

Todas reales, independientes y en PASS, cada una con su escenario creado desde cero (sin estado
compartido salvo la marca de *fixtures*, limpiada en `beforeEach`/`afterEach`/`afterAll`):

| # | Prueba del PM | Comportamiento observado |
|---|---|---|
| 1 | **Pago completo** | Cuota de `1000.00`: un abono por el total deja `saldo_pendiente` `0.00`, estado `PAGADA` y **conserva la mora** (`mora_aplicada` `100.00` = 10 % del monto base) |
| 2 | **Pago parcial** | `150.00` sobre 3 × `100.00`: cuota 1 `PAGADA` con `0.00`; cuota 2 `50.00` `PENDIENTE`; cuota 3 intacta (`100.00`, mora `0.00`). Sin saldo negativo, sin `PAGADA` prematura y el remanente se agota antes de pasar a la siguiente |
| 3 | **Varias obligaciones pendientes** | `170.00` por dos medios: cuotas 1 (`80.00`) y 2 (`90.00`) `PAGADA`; cuotas 3 y 4 intactas. Aplica en orden y deja el resto sin tocar |
| 4 | **Aplicación FIFO** | Dos cuotas con la misma `fecha_vencimiento`: orden por `numero_cuota`; resultado **idéntico** al insertarlas en orden inverso (en el escenario inverso el `id` de la cuota 2 es menor y aun así el FIFO devuelve `[1,2]`). El orden **no depende** del `id` ni del orden de inserción |
| 5 | **Descuento autorizado** | 10 % sobre `1000.00` → `monto_cuota` `900.00` en las 3 cuotas; `tarifas.monto` sigue `1000.00`; 0 `pagos`, 0 `pago_medios`/`pago_aplicaciones`; auditoría con `descuento_por_cuota` `100.00` y `contabilizado_como_efectivo: false`. Incluye la prueba de redondeo medio-arriba |
| 6 | **Mora** | 1.er abono: mora `100.00`. 2.º abono meses después: mora sigue `100.00`, saldo `400.00`, `monto_pagado + saldo = 1000.00`. Umbral: día 10 → `0.00`, día 11 → `50.00` |
| 7 | **Saldo cero** | Todas las cuotas saldadas: suma SQL `0.00`; proyección de 6.A con `saldo_total` `0.00`, `tiene_saldo_positivo` `false`, `pendientes` `[]`, `cuotas_pendientes` 0, aplicado `300.00` |
| 8 | **Pago duplicado** | Misma clave + misma matrícula → *replay* `idempotent_replay: true`, mismo `pago_id`. Misma clave + **otra** matrícula → `AppError` 409 `CONFLICT`. En ambos casos 1 `pagos`, 1 `pago_medios`, 1 `pago_aplicaciones` y la cuota 2 intacta |
| 9 | **Pago concurrente** | Dos abonos simultáneos vía `Promise.all` con dos conexiones reales: aplicado `300.00` = cobrado `300.00`; 4 aplicaciones (2 por pago); por cuota aplicado = pagado = `100.00`; igualdad exacta verificada por pago |
| 10 | **Fallo transaccional** | *Trigger* real que aborta la transacción del motor: hash lógico de las 4 tablas idéntico, recuentos 0/0/0 y `mensualidades` idéntica |

Las seis pruebas restantes del archivo: resolución de políticas = línea base DEC-20; rechazo sin
escrituras ante deriva de configuración; redondeo `'66.67'`; rechazo con 400 del excedente
(`300.01` sobre una deuda medida de `300.00`, y la frontera `300.00` exacto sí se acepta);
ausencia de escrituras en los rechazos de validación (fecha efectiva ausente, medios inválidos,
matrícula inexistente → 404, monto `0.00`, monto negativo); y verificación de RN-SGPM-07 en cada pago.

---

## ERRORES DETECTADOS

Registrados sin corregirse en silencio. **Ninguno es un defecto de producción que impida la
aceptación** (veredicto del tester: *Blocker for the coder*: NO).

1. **Matiz de contrato de PM 8 (documentado, no es un fallo).** El PM describe «la misma
   `idempotencia_key` repetida devuelve 409». La implementación devuelve **replay idempotente**
   (`idempotent_replay: true`, mismo `pago_id`, sin reaplicar importes ni tocar cuotas) cuando la
   clave se reutiliza con la **misma** matrícula, y **409 únicamente cuando la clave se reutiliza con
   otra matrícula**. Es el patrón de casa de la Fase 5 (`matricula.service`) extendido y es
   comportamiento documentado, no un defecto. La prueba cubre los dos caminos.
2. **Hallazgo conocido y NO cerrado (extiende DEC-17).** Con `idempotency_key`, un *replay* que
   lleva **otro porcentaje de descuento** devuelve el **plan original**: medido, un *replay* con
   50 % sobre una matrícula creada con 10 % devolvió `900.00`. La comparación de identidad sigue
   siendo `(estudiante, año, grado)` y **no** incluye el plan de pago ni el descuento. Este hallazgo
   queda abierto y se registra asimismo en `docs/DECISIONES_Y_CONTRADICCIONES.md`.
3. **Hueco de cobertura del desempate FIFO.** El criterio `id ASC` del `ORDER BY`
   (`fecha_vencimiento, numero_cuota, id`) es **inalcanzable dentro de un plan** porque
   `UNIQUE(plan_pago_id, numero_cuota)` hace único a `numero_cuota` dentro del plan: el orden por
   `(fecha_vencimiento, numero_cuota)` ya es total. Se declara como **hueco de cobertura**, no se
   afirma como probado. Lo medido es que el resultado **no depende** del `id` ni del orden de
   inserción.
4. **Cobertura de las proyecciones de lectura de 6.B (ver LIMITACIONES).**
   `proyectarHistorial` no tiene ninguna prueba en la suite; `proyectarPendientes` se ejerce solo en
   el caso de deuda cero dentro de PM 7. Los estados `MATRICULA_INEXISTENTE` /
   `INTEGRIDAD_INVALIDA` y `estados_no_reconocidos` **no** están cubiertos.
5. **Presentación del «importe adeudado» no ratificada institucionalmente.** La mora **no** se suma
   a `saldo_pendiente`: queda registrada en `mora_aplicada` y la deuda pendiente es
   Σ `saldo_pendiente`. Es una decisión de diseño documentada (no capitalización, D05 P0227) cuya
   forma de presentar «cuánto se debe» (concitar la mora o no en el total) no ha sido ratificada
   institucionalmente.

## ERRORES CORREGIDOS

Ninguno en este lote. Esta subtarea de documentación no modificó código, pruebas, migraciones,
semillas ni configuración; las mutaciones de sensibilidad se realizaron sobre el propio archivo de
prueba y fueron revertidas (estado original restaurado, 16/16 PASS).

---

## LIMITACIONES

1. **Funcionalidad 9 (historial financiero) sin prueba.** `proyectarHistorial` no se ejecuta en
   ningún test de la suite: **NO VERIFICADO**.
2. **Funcionalidad 4 (pagos pendientes) con verificación parcial.** Solo el caso de deuda cero está
   cubierto, y como verificación cruzada de PM 7; listas no vacías, matrícula inexistente,
   integridad inválida y `estados_no_reconocidos` no tienen prueba: **NO VERIFICADO**.
3. **`id ASC` del desempate FIFO: hueco de cobertura**, no alcanzable dentro de un plan
   (`UNIQUE(plan_pago_id, numero_cuota)`). No se afirma como probado.
4. **Contenido de las filas de `auditoria` del motor** (`pago_aplicar`, `pago_aplicar_replay`): el
   motor las escribe dentro de la transacción, pero la suite no afirma su contenido. La auditoría de
   matrícula del descuento sí está verificada.
5. **Tablas `recibos` y `anulaciones`:** el motor no las usa y no hay prueba que las cubra.
6. **Multi-moneda:** el motor lee `planes_pago.moneda`, no convierte (`conversionMoneda: false`) y no
   compara monedas entre medios y plan. No hay prueba con monedas distintas.
7. **Actor `null`:** `actorDePago` devuelve `null` para ids no positivos; no está ejercitado (los
   pagos de prueba usan un usuario real porque `pagos.usuario_id` referencia `usuarios(id)`).
8. **Mora con porcentaje decimal** (p. ej. `7.25`): no ejercitada; se usó `10` entero y el umbral
   del día.
9. **Sin superficie HTTP.** No se creó ni probó ningún endpoint: la validación de sesión/permisos y
   `assertActiveSession` llegan con la ruta de pagos (FASE 7). Cualquier integración HTTP exige
   autorización independiente (condición de la revisión de seguridad que aprobó el plan 6.A), que
   **no** se ha solicitado ni otorgado. No se concedió permiso nuevo (`auth_role_permissions` sigue
   con 0 filas).
10. **Rendimiento no verificado formalmente.** La latencia del motor (26 abonos, mediana 8.3 ms,
    máximo 30.6 ms) es contexto de la suite, **no** una verificación de NFR-005/SYS-REQ-003
    (p95 ≤ 2.0 s, ≥100 solicitudes, 20 concurrentes), que requiere consumidor HTTP y perfil de carga.
11. **Sin aceptación institucional.** Ninguna cifra de este informe acredita aprobación
    institucional de la fase ni de sus políticas.

---

## REQUISITOS PENDIENTES

### Trazabilidad contra la documentación consolidada

| Requisito | Evidencia de este lote | Estado |
|---|---|---|
| RN-SGPM-07 — igualdad exacta entre total, medios y aplicaciones | verificada en SQL dentro de la transacción, por pago y en barrido global | **VERIFICADO** |
| RN-SGPM-08 — importes con representación decimal exacta; nunca `FLOAT`/`DOUBLE` | importes como cadenas exactas de punta a punta; redondeo en PostgreSQL | **VERIFICADO** para el motor de abonos |
| SEG-02 — SQL parametrizado | todo el repositorio usa parámetros `$n` | **VERIFICADO**; la cuenta de mínimo privilegio no se evaluó en este lote |
| Paso 5 de la cadena de valor: aplicar abonos, calcular saldos y liquidar (`docs/REQUISITOS_CONSOLIDADOS.md` §4) | motor de abonos medido (PM 1–PM 10) | **IMPLEMENTADO Y MEDIDO**; sin ratificación institucional de los parámetros (DEC-20) |
| Historial financiero como requisito del PM FASE 6 | proyección implementada | **NO VERIFICADO**: sin prueba (ver LIMITACIONES 1) |
| Identificación de pagos pendientes del PM FASE 6 | proyección implementada | **PARCIAL** (ver LIMITACIONES 2) |
| NFR-005 / SYS-REQ-003 — saldo/historial p95 ≤ 2.0 s, ≥100 solicitudes, 20 concurrentes | latencia incidental del motor | **NO VERIFICADO** formalmente |
| Reversiones y anulaciones (FASE 7, DEC-08) | no implementadas en 6.B | **PENDIENTE** |

### Discrepancias entre fuentes registradas y NO adoptadas

Las cinco discrepancias registradas en `politicas-financieras.ts`
(`DISCREPANCIAS_REGISTRADAS_NO_ADOPTADAS`) quedan **registradas, no adoptadas**:

| ID | Fuentes | Contenido | Tratamiento |
|---|---|---|---|
| `D12-DIA-5-MORA` | D12 P0227 y Anexo D FUN-04 | mora a partir del día 5 | No adoptada; se mantiene vencimiento día 10 y mora desde el día 11 |
| `D07-P0350-DESCUENTO-COMO-EFECTIVO` | D07 P0350 | sumar el descuento al efectivo recibido | No adoptada; el descuento no se contabiliza como dinero cobrado |
| `D07-PORCENTAJES-DIDACTICOS` | D07 ejemplos (15 % hermanos, 10 % pronto pago, 50 % beca, 25 % convenio) | porcentajes de ejemplo | Ejemplos didácticos; **no existe porcentaje de descuento por defecto** (`'ninguno'`) |
| `D05-EJEMPLO-SIN-MORA` | D05 P0336–0342 | pagos en abril de deudas de febrero/marzo sin mora | No se trata como política ni como exención tácita de mora |
| `DEC-06-EXCEDENTE-ALTERNATIVAS` | DEC-06 / D10 §III | recibir solo la deuda y devolver cambio, o generar saldo a favor | Descartadas mientras no haya ratificación; se rechaza el excedente por ser la opción conservadora |

Cambiar cualquiera de estas líneas exige ratificación institucional, no una opinión técnica.

### Pendientes de cierre

- Ratificación institucional de la línea base DEC-20 (y de DEC-04/05/06/07/08 vinculadas) y del
  hallazgo no cerrado de idempotencia con descuento (extensión de DEC-17).
- Endpoint/ruta de pagos, validación de sesión y permisos: FASE 7, con autorización independiente.
- Cierre institucional de la FASE 5, ratificación de DEC-17/DEC-18/DEC-19, reversiones y anulaciones
  (DEC-08), `recibos`, multi-moneda.
- Deuda técnica heredada, no cerrada: `zod@3.25.76` (advisory sin verificación independiente en este
  entorno), `npm run lint` roto por falta de configuración *flat*, `.catch(() => undefined)`
  residuales, duplicación de `tarifas` en la semilla y hallazgos del revisor de la FASE 5.

---

## ESTADO DE LA FASE

**INCREMENTO 6.B MEDIDO Y CERRADO TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.**

- Los tres ficheros de producción y el fichero de prueba previstos están implementados y medidos
  contra PostgreSQL 16 real: **suite completa 14 archivos, 275 tests, 275 PASS / 0 FAIL / 0 SKIP,
  exit 0** (259 previos + 16 nuevos); typecheck de `src` exit 0; typecheck de `src` + tests exit 0.
- Las **diez pruebas obligatorias del PM** para el motor financiero están registradas una por una en
  este informe, todas reales, independientes y en PASS.
- **La FASE 6 en su conjunto NO está completa y no se declara como tal:** la funcionalidad 9
  (historial financiero) **no tiene prueba que la mida** y la funcionalidad 4 (identificación de
  pagos pendientes) está verificada solo de forma parcial; las funcionalidades 1, 2 y 3 se midieron
  en lotes anteriores (FASE 5 y 6.A) y aquí solo se reejecutan en la regresión. Las diez pruebas
  obligatorias del PM pasan, lo que **no** equivale a cubrir las nueve funcionalidades del PM.
- **Las fases 0–5 y el incremento 6.A no se cierran formalmente en este informe:** permanecen
  cerradas técnicamente a nivel local con reservas según `docs/INFORME_FASE_5.md` y
  `docs/INFORME_FASE_6A.md`.
- **Revisiones registradas antes del cierre:** (a) *guard de alcance* ejecutado por el documentador
  sobre `git status --porcelain` en la rama `minion/sgpm-fase6-base-v1`: exactamente los cuatro
  ficheros nuevos y los cinco modificados de este lote, más la documentación; sin migraciones,
  semillas, `package.json`, rutas, permisos, dependencias ni gobernanza alterados; (b) *revisión
  final del diff* efectuada por el documentador mediante lectura completa de
  `politicas-financieras.ts`, `aplicacion-pagos.service.ts` y `aplicacion-pagos.repository.ts` y
  comprobación de los nombres de los 16 `it` contra el informe del tester, sin observaciones
  bloqueantes; los matices y huecos arriba registrados se remiten al máster en lugar de corregirse
  en silencio. No se ejecutó una revisión formal por agente revisor dedicado a este incremento; si
  el máster la requiere, queda pendiente.
- No se acreditó aceptación institucional. No se hizo commit ni push.
