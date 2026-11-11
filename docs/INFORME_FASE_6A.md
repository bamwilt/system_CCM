# Informe de control — FASE 6.A (incremento del motor financiero)

Fecha: 2026-11-10. Versión: 1.0. Lote: `sgpm-fase6-base-v1` (incremento 6.A, ronda 1).
Plantilla: sección 4 del `Prompt_Maestro_Desarrollo_SGPM_v2.md`. Todas las cifras provienen de
`.tmp/test-artifacts/sgpm-fase6-6A/REPORTE_TESTER.md` (informe cuyo contenido fue verificado de
forma independiente por el orquestador tras la ejecución del agente `minion-tester`) y de
lectura directa del código y de las pruebas realizada durante esta subtarea de documentación.

**FASE:** 6.A — Motor financiero de mensualidades, incremento A: consulta interna de obligaciones
y saldos almacenados. Es un subconjunto de la FASE 6 del Prompt Maestro y **no** equivale a la
FASE 6 completa.

**OBJETIVO:** Implementar una proyección interna, estricta y exclusivamente lectora de las
obligaciones y saldos ya almacenados (`mensualidades.saldo_pendiente`, `planes_pago`) de una
matrícula, sin mutaciones financieras y sin fijar ni inventar políticas institucionales, según el
plan aprobado `sgpm-fase6-base-v1` (aprobación: `usuario_si_ejecutar_fase6A`).

**Qué es 6.A y qué no es (distinción central de este informe):**

- **Es** una proyección de lo que ya está almacenado para una matrícula: detalle de cuotas,
  plan, `saldo_total` y bandera `tiene_saldo_positivo`, del mismo *snapshot*.
- **No es** deuda conciliada, **no es** liquidación, **no es** motor de pagos: no crea pagos,
  cuotas ni obligaciones duplicadas; no aplica FIFO, mora, descuentos, excedentes ni reversos
  (todo ello requiere DEC-04/DEC-05/DEC-06/DEC-07, abiertas); no identifica «pagos pendientes»
  en sentido de motor (los pagos son FASE 7).

---

## REQUISITOS IMPLEMENTADOS

Del plan `sgpm-fase6-base-v1`, subtarea `read-model` (los diez criterios de aceptación), medidos
sobre el código y las pruebas:

1. **Validación previa de identificadores.** `esIdSeguro32` acepta solo enteros seguros de
   JavaScript dentro del rango serial32 `1..2147483647` (`ID_MINIMO_SEGURO`, `ID_MAXIMO_SEGURO`);
   el rechazo ocurre en el servicio antes de tocar la base de datos.
2. **Una sola consulta por lectura válida.** `ObligacionesRepository.proyectarObligaciones`
   ejecuta un único `SELECT` parametrizado (`$1 = matricula_id`); el detalle (`json_agg`) y el
   agregado (`COUNT` + `SUM(saldo_pendiente)`) se obtienen en la misma fila y del mismo
   *snapshot*, sobre el único plan de la matrícula (índice único `uq_planes_pago_matricula_id`).
   El `Pool` es inyectable por constructor con *fallback* a `getPool()`.
3. **Unión discriminada de cinco estados.** `MATRICULA_INEXISTENTE`, `SIN_PLAN`, `SIN_CUOTAS`,
   `CON_OBLIGACIONES`, `INTEGRIDAD_INVALIDA`.
4. **Inexistente ≠ deuda cero.** `MATRICULA_INEXISTENTE` no incluye resumen. `SIN_PLAN` y
   `SIN_CUOTAS` devuelven detalle vacío (`[]`) y `saldo_total` `"0.00"` proyectado
   explícitamente (`SALDO_CERO_PROYECTADO`), sin positividad.
5. **SUM NUMÉRICO exacto como texto.** Los importes viajan como `::text` sin conversión a
   `Number`/`parseFloat` ni aritmética de punto flotante; el agregado no se limita al rango de
   `NUMERIC(12,2)`; se calcula sobre las cuotas del único plan, sin mezclar planes ni monedas.
6. **Moneda preservada.** `moneda` se lee tal cual de `planes_pago` (el `NULL` *legacy* se
   conserva); la proyección nunca consulta `tarifas`, por lo que la divisa no se reconstruye
   desde la tarifa vigente.
7. **Fechas ISO independientes del entorno.** `to_char(fecha_vencimiento,
   'YYYY-MM-DD')` (en el código: `to_char(men.fecha_vencimiento, 'YYYY-MM-DD')`), verificado con
   `DateStyle='Postgres, DMY'` y `TimeZone='Asia/Tokyo'`. **Nota de corrección del criterio:**
   el plan sugería como opción `fecha_vencimiento::text`; ese cast **se midió** dependiente del
   `DateStyle` (devuelve `05-03-2026` bajo `Postgres, DMY`), por lo que el criterio estaba
   equivocado y fue corregido por medición, no por preferencia de formato.
8. **Negativos preservados; NaN invalida.** Los importes negativos se proyectan tal cual; `NaN`
   o infinito en los datos producen `INTEGRIDAD_INVALIDA` con el valor almacenado intacto,
   `resumen: null` y motivo (`IMPORTE_NO_NUMERICO`, `FECHA_NO_ISO`,
   `DETALLE_NO_PROYECTABLE`), sin normalizar nada a cero.
9. **`tiene_saldo_positivo` = saldo TOTAL > 0.** `esPositivoExacto` compara el saldo total
   exacto contra cero por comparación decimal sobre cadenas; no es «alguna cuota positiva», ni
   vencimiento ni mora. Cuotas saldadas dan `false`.
10. **Errores técnicos propagados.** Los errores de base de datos (medido con transacción
    abortada real `25P02`) se propagan tal cual; no se convierten en estado de negocio ni en
    saldo cero, y no se registran datos sensibles.

Del plan, subtarea `verification` (los siete criterios), medidos por el informe del tester con
verificación independiente:

- Cinco estados y límites de ID medidos contra la base aislada real.
- Una consulta parametrizada por lectura válida; **cero** consultas con ID inválido; error de BD
  no silenciado.
- Precisión en centavos y sumas superiores al rango de una cuota; cero y negativos mezclados.
- Moneda *legacy* `null`; aislamiento entre matrículas, años, planes y monedas; fechas sin
  dependencia de zona horaria ni `DateStyle`.
- NaN/infinito invalidan el resultado sin normalizarse.
- Detalle y agregado no se hibridan ante concurrencia (una consulta por lectura).
- **Hashes lógicos de todas las tablas idénticos antes y después** de las lecturas, excluyendo
  la creación/limpieza de fixtures. Suite de regresión completa y typechecks en exit 0 sin
  modificar aserciones existentes (el único cambio en pruebas fue de tipos, ver D-1).

**Lo que 6.A no implementa de la FASE 6 del PM:** generación de mensualidades, cálculo de saldos
como motor, identificación de pagos pendientes, aplicación de descuentos, cálculo de recargos por
mora, abonos parciales, liquidación de obligaciones e historial financiero. Corresponde a 6.B.

---

## ARCHIVOS CREADOS

Los cuatro ficheros del `may_create` del plan; todos son nuevos y ninguno modifica fichero
preexistente:

- `backend/src/repositories/obligaciones.repository.ts` (276 líneas)
- `backend/src/services/obligaciones.service.ts` (277 líneas)
- `backend/tests/obligaciones.repository.test.ts` (884 líneas en la entrega del tester; 898 tras
  la corrección D-1)
- `backend/tests/obligaciones.service.test.ts` (1040 líneas en la entrega del tester; 1055 tras
  la corrección D-1)

## ARCHIVOS MODIFICADOS

- `backend/tests/obligaciones.repository.test.ts` y `backend/tests/obligaciones.service.test.ts`:
  modificados **después** de la entrega del tester únicamente para corregir el defecto D-1 (tipo
  del helper `inyectarPool`, de `{ query: Pool['query'] }` al contrato mínimo `ConsultaMinima`).
  Ninguna aserción fue alterada ni debilitada.
- **Ningún otro fichero fue modificado.** No se tocó código de producción previo, rutas,
  validadores, permisos, migraciones, semillas, `package.json` ni gobernanza. No hay endpoint,
  UI, permiso, dependencia, migración ni cambio de semilla en este lote.

---

## PRUEBAS EJECUTADAS

Medio de medición: PostgreSQL 16.15 sobre socket Unix (nunca TCP), base `sgpm_auth_test`,
usuario `sgpm_test`, puerto registrado `55433`. Suite de `backend` en modo serial.

| Batería | Comando real | Exit | Resultado | Duración |
|---|---|---:|---|---|
| Suite completa (final) | `cd backend && npm test` (serial) | 0 | **13 archivos, 259 tests: 259 PASS / 0 FAIL / 0 SKIP** | 147.45 s (`regresion-completa.log`); 144.94 s y 162.30 s en las dos reejecuciones del orquestador |
| Suites nuevas 6.A | incluidas en la suite completa | — | `obligaciones.repository.test.ts` 19 pruebas; `obligaciones.service.test.ts` 22 pruebas | 1.509 s y 2.057 s (segmentos del log) |
| Typecheck de `src` | `cd backend && npm run typecheck` (`npx tsc --noEmit`) | 0 | 0 errores | reverificado por el documentador en esta subtarea (exit 0) |
| Typecheck estricto `src` + tests | `npx tsc -p ../.tmp/test-artifacts/tsconfig.test.json --noEmit` | **2 en la entrega; 0 tras la corrección D-1** | 0 errores tras la corrección | reverificado por el documentador en esta subtarea (exit 0) |
| Línea base previa (contexto, no ejecutada en este lote) | — | — | 11 archivos, 218 tests, 218 PASS | registrada en `docs/INFORME_FASE_5.md` |

La regresión completa fue ejecutada tres veces con resultado idéntico (259/259, exit 0). La
duración de la suite depende de la carga de la máquina: ~162 s en reposo y ~380–470 s con carga
sostenida, sin fallos por *timeout* tras el ajuste de *timeouts* de Vitest heredado de la FASE 5.

**Discrepancias detectadas por el documentador contra el informe del tester (no corregidas en
silencio; ver ERRORES DETECTADOS D-3 y D-4):**

- El registro de ejecución (`regresion-completa.log`) y el recuento directo de `it()` en los dos
  ficheros nuevos dan **41** pruebas de 6.A (19 + 22), que reconcilia con 218 + 41 = 259. El
  informe del tester registra «21 pruebas en total de 6.A» en su criterio 16; la cifra del
  registro de ejecución es 41.
- El caso de identificadores inválidos del servicio declara **15** valores (0, −1, 1.5,
  2147483648, 2⁵³, 9007199254740993, NaN, ±Infinity, `'5'`, `'abc'`, `null`, `undefined`, `{}`,
  `[]`), todos con `AppError 400` y cero consultas. El informe del tester registra «12 valores
  inválidos».

---

## RESULTADOS

- Suite completa: **13 archivos, 259 tests, 259 PASS / 0 FAIL / 0 SKIP, exit 0**. Línea base
  previa: 11 archivos y 218 tests; el incremento son las 41 pruebas de los dos ficheros nuevos
  de 6.A (19 + 22 según el registro de ejecución).
- Typechecks: `src` exit 0; `src` + tests en modo estricto exit 2 en la entrega y **exit 0 tras
  la corrección D-1**.
- **Lectura estricta demostrada por hash lógico:** MD5 por tabla sobre todas las filas, tomado
  antes y después de un lote de 14 lecturas (13 secuenciales y 2 concurrentes de la misma
  matrícula), con fixtures creados y limpiados fuera de la ventana medida y valores de secuencia
  excluidos a propósito: `expect(despues).toEqual(antes)` más recuento de filas por tabla
  idéntico.
- **Precisión exacta medida:** `"1204.50"` (mezcla con −30.00), `"599999999999.40"` (60 cuotas de
  9,999,999,999.99, suma que supera el rango de `NUMERIC(12,2)`), `"0.02"`
  (`0.01 + 0.01 − 0.01 + 0.01`).
- **Un único SELECT por lectura válida** con *pool* real instrumentado (relación 1:1) y **cero**
  consultas para los 15 identificadores inválidos.
- **Fechas planas** `YYYY-MM-DD` verificadas bajo `DateStyle='Postgres, DMY'` y
  `TimeZone='Asia/Tokyo'`.
- **`moneda` NULL preservada** y ninguna consulta de la proyección toca `tarifas`.
- **Errores de BD propagados** (transacción abortada real `25P02`); no convertidos en estado de
  negicio ni en saldo cero.
- **Latencia:** 14 lecturas por lote dentro de una prueba de ~1 s, muy por debajo del umbral de
  referencia. **No es criterio de aceptación de este lote** y no constituye verificación de
  NFR-005/SYS-REQ-003.
- UI y accesibilidad: N/A (subtarea `ui: false`; 6.A es interno, sin HTTP ni pantallas).
- **Cierre institucional: NO acreditado.** Este informe es evidencia técnica de ejecución local.

---

## ERRORES DETECTADOS

1. **D-1 (MAYOR, corregido) — typecheck de `src` + tests en exit 2 en la entrega del tester.**
   Los dos ficheros de prueba declaraban `inyectarPool(objeto: { query: Pool['query'] })`.
   `Pool['query']` es una firma sobrecargada de 12 formas y los dobles de prueba
   (`PoolContador`, `PoolDelegado` y el doble que devuelve `{ rows }`) no son asignables a ella:
   6 errores TS2345 (`obligaciones.repository.test.ts:704,721,775,800`;
   `obligaciones.service.test.ts:596,617`). Las pruebas **ejecutaban** correctamente porque
   Vitest no typechequea; el fallo solo era visible con `tsc`.
2. **D-2 (MENOR, no corregido) — entregable ausente.** El agente `minion-tester` finalizó sin
   emitir `REPORTE_TESTER.md` ni respuesta de texto; se sustituyó por verificación independiente
   del orquestador (reejecución completa de la suite, typechecks y lectura directa de las
   pruebas), documentada en el informe de referencia.
3. **D-3 (documental, detectada por el documentador, no corregida) — cifra de pruebas nuevas.**
   El informe del tester registra «21 pruebas en total de 6.A» (criterio 16); el recuento de
   `it()` en los dos ficheros y el registro de ejecución dan **41** (19 + 22), coherente con
   218 + 41 = 259. Se deja constancia en lugar de reescribir el informe del tester.
4. **D-4 (documental, detectada por el documentador, no corregida) — cifra de casos inválidos.**
   El informe del tester registra «12 valores inválidos»; el caso de prueba declara **15**
   valores. La propiedad medida (400 + cero consultas para cada valor) se mantiene.

## ERRORES CORREGIDOS

1. **D-1 corregido por el orquestador tras la entrega:** el helper pasó a aceptar un contrato
   mínimo propio (`ConsultaMinima`: `query` de texto y parámetros, y en el servicio también
   respuesta parcial `{ rows }`). Es segregación de interfaces: un doble solo necesita
   implementar `query`, no los 12 métodos de `Pool`. Verificado: typecheck de `src` exit 0,
   typecheck de `src` + tests exit 0 y suite completa reejecutada con 259/259 PASS, exit 0 (las
   tres comprobaciones reverificadas por el documentador en esta subtarea).
2. **Criterio de formato de fecha corregido por medición:** el cast `fecha_vencimiento::text`
   sugerido por el plan se midió dependiente de `DateStyle`; se sustituyó por
   `to_char(..., 'YYYY-MM-DD')` y la prueba fija el `DateStyle` servidor para demostrarlo.

---

## LIMITACIONES

1. **Infinito: garantía solo a nivel de código.** `Infinity` no es almacenable en las columnas
   `NUMERIC(12,2)` vigentes (desbordamiento), por lo que la rama `INTEGRIDAD_INVALIDA` por
   infinito se prueba inyectando una fila en el repositorio; la garantía frente a datos de BD
   reales para ese caso concreto no está demostrada.
2. **Rendimiento no verificado formalmente.** NFR-005 / SYS-REQ-003 (p95 ≤ 2.0 s, ≥100
   solicitudes, hasta 20 concurrentes para saldo/historial) queda **sin verificación formal**:
   no existe consumidor HTTP y la latencia se midió de forma incidental, no como *benchmark* con
   perfil de carga.
3. **`npm audit` no es ejecutable en este entorno** (registro npm inalcanzable, error TLS 426).
   El *advisory* de `zod@3.25.76` reportado por la auditoría de seguridad de la FASE 5 permanece
   **sin verificación independiente**; no se afirma aquí como confirmado ni como descartado.
4. **Dobles de prueba con cast explícito.** Se inyectan con `as unknown as Pool`, acotado al
   helper `inyectarPool`. Mejora futura: tipar el constructor del repositorio con el contrato
   mínimo y eliminar el cast.
5. **Deuda SOLID heredada de la FASE 5, no cerrada aquí:** ausencia de una suite de pruebas de
   sustitución dedicada (regla 1 de calidad del PM §5 y CAL-01 «pruebas de sustitución» en la
   matriz de trazabilidad); SQL de listado duplicado entre el repositorio y la capa de rutas
   (hallazgo del revisor de FASE 5); `backend/src/services/auth.service.ts` contiene dos clases
   en un mismo archivo (`AuthService` y `RateLimitedError`).
6. **Sin endpoint ni interfaz.** 6.A no expone HTTP ni UI; cualquier integración futura exige
   autorización independiente (condición explícita de la revisión de seguridad que aprobó el
   plan). No se concedió ningún permiso nuevo (`auth_role_permissions` sigue con 0 filas).
7. **Sin aceptación institucional.** Ninguna cifra de este informe acredita aprobación
   institucional de la fase ni de sus políticas.

---

## REQUISITOS PENDIENTES

### Trazabilidad verificada contra la documentación antes de afirmarse

| Requisito | Evidencia de este lote | Estado |
|---|---|---|
| Paso 4 de la cadena de valor: «Consultar cuenta; identificar obligaciones, mora y saldo oficial» (`docs/REQUISITOS_CONSOLIDADOS.md` §4, proceso 4; **sin ID formal** en la matriz) | proyección de obligaciones y saldo almacenado medida (`CON_OBLIGACIONES`, cinco estados, `saldo_total` exacto) | **PARCIAL:** se proyectan obligaciones y saldo almacenado; la identificación de mora **no** está implementada (requiere DEC-04) |
| RN-SGPM-11 — solo políticas y tarifas institucionales aprobadas determinan obligaciones (`REQUISITOS_CONSOLIDADOS.md` §5; matriz §4) | la proyección no consulta `tarifas` (prueba «ninguna consulta de la proyeccion toca tarifas»), conserva `moneda` NULL, no genera mora, descuentos ni aranceles | **CONSISTENTE** con evidencia medida en el camino lector; no constituye ratificación institucional |
| RN-SGPM-08 — importes con representación decimal exacta; no `FLOAT`/`DOUBLE` (matriz §4) | sumas como texto exacto (`"1204.50"`, `"599999999999.40"`, `"0.02"`), sin `Number`/`parseFloat`, negativos preservados | **VERIFICADO** para el camino lector y de agregación de 6.A |
| SEG-02 — SQL parametrizado (matriz §5) | un único `SELECT` parametrizado (`$1`) por lectura válida; cero consultas con ID inválido | **VERIFICADO** para la proyección; la cuenta de mínimo privilegio no se evaluó en este lote |
| NFR-005 / SYS-REQ-003 — saldo/historial p95 ≤ 2.0 s, ≥100 solicitudes, hasta 20 concurrentes (matriz §1 y §3) | latencia incidental: 14 lecturas por lote en una prueba de ~1 s | **NO VERIFICADO** formalmente: sin consumidor HTTP ni perfil de carga |

No se trazó ningún otro identificador a este lote y no se inventaron IDs de requisito.

### Bloqueos institucionales que impiden 6.B

- **DEC-04** — vencimiento y mora. **DEC-05** — moneda, tarifas y redondeo.
- **DEC-06** — FIFO (desempate, años, excedentes). **DEC-07** — descuentos, becas y exoneraciones.
- **DEC-03** — matriz de roles institucionales (pendiente asimismo para el cierre institucional de
  la FASE 5; `auth_role_permissions` con 0 filas).

### Las diez pruebas obligatorias del PM para el motor financiero (pendientes de 6.B)

El PM (FASE 6, «Pruebas obligatorias») exige pruebas unitarias de:

1. Pago completo.
2. Pago parcial.
3. Varias obligaciones pendientes.
4. Aplicación FIFO.
5. Descuento autorizado.
6. Mora.
7. Saldo cero.
8. Pago duplicado.
9. Pago concurrente.
10. Fallo transaccional.

**Ninguna está ejecutada en este lote.** Solo la número 7 («saldo cero») tiene un equivalente
directo en 6.A, y es parcial: 6.A proyecta un saldo almacenado en cero (`saldo_total` `"0.00"`,
cuotas saldadas con `tiene_saldo_positivo: false`, cuotas a cero que no equivalen a `SIN_CUOTAS`);
no produce ni concilia ese saldo. Las otras nueve corresponden al motor de 6.B.

### Otros pendientes

- Cierre institucional de la FASE 5 y ratificación de DEC-17/DEC-18/DEC-19.
- Deuda técnica registrada: `zod` v4 (advisory sin verificación independiente en este entorno),
  `npm run lint` roto, `.catch(() => undefined)` residuales, duplicación de `tarifas` en la
  semilla, hallazgos del revisor de FASE 5 no cerrados.

---

## ESTADO DE LA FASE

**INCREMENTO 6.A CERRADO TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.**

- Los cuatro ficheros previstos están implementados y verificados contra PostgreSQL 16 real:
  **259 tests, 259 PASS / 0 FAIL / 0 SKIP, 13 archivos, exit 0** (218 previos + 41 nuevas de
  6.A); typecheck de `src` exit 0; typecheck de `src` + tests exit 0 tras la corrección D-1.
- **La FASE 6 en su conjunto NO está completa:** 6.A cubre únicamente la consulta interna de lo
  almacenado. Generación de mensualidades, motor de saldos, pagos pendientes, descuentos, mora,
  abonos parciales, liquidación e historial financiero corresponden a **6.B, pendiente** y
  bloqueado por DEC-04/DEC-05/DEC-06/DEC-07.
- **La FASE 5 no se cierra formalmente en este informe:** permanece cerrada técnicamente a nivel
  local con reservas según `docs/INFORME_FASE_5.md`.
- **Revisiones registradas antes del cierre del incremento:** (a) *plan* aprobado por el revisor
  (`PASS_PLAN`, con tres aclaraciones incorporadas: indicador sobre saldo total positivo, errores
  de BD propagados sin convertir en saldo cero, fechas ISO independientes de `DateStyle`) y por
  seguridad (`PASS_PLAN`, con la condición explícita de consulta interna sin consumidores ni
  HTTP y de que una futura integración exige autorización independiente); (b) *guard de alcance*
  ejecutado por el documentador contra `git status --porcelain` y el `may_create` del plan:
  existen exactamente los cuatro ficheros previstos, sin cambios en código preexistente,
  migraciones, semillas, `package.json`, pruebas previas, documentación ni gobernanza; (c)
  *revisión final del diff* efectuada por el documentador mediante lectura completa de los dos
  ficheros de producción y comprobación de las aserciones citadas, sin observaciones bloqueantes;
  las dos discrepancias documentales D-3/D-4 se remiten al máster en lugar de corregirse en
  silencio. No se ejecutó una revisión formal por agente revisor dedicado a este incremento; si
  el máster la requiere, queda pendiente.
- No se acreditó aceptación institucional. No se hizo commit ni push.
