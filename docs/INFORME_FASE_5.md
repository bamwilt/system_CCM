# Informe de control — FASE 5

Fecha: 2026-11-10. Versión: 1.0. Lote de cierre: `sgpm-fase5-cierre-v3` (ronda 1).
Plantilla: sección 4 del `Prompt_Maestro_Desarrollo_SGPM_v2.md`. Todas las cifras provienen de
`.tmp/test-artifacts/sgpm-fase5-cierre-v3/` (`REPORTE_TESTER.md`, `REVISION.md`, `SECURITY.md`,
`results.json`, `vitest-full.log`).

**FASE:** 5 — Gestión de matrículas (SGPM).

**OBJETIVO:** Cerrar técnicamente la FASE 5 del Prompt Maestro y los ocho huecos reales medidos
sobre el código de FASE 4, sin fijar políticas institucionales y sin iniciar la FASE 6.

---

## REQUISITOS IMPLEMENTADOS

Funcionalidades de la FASE 5 del PM, con el estado de implementación medido:

1. **Registro de matrícula** — `POST /api/matriculas` (`matriculas:manage`, CSRF). Transacción
   única: `BEGIN` → `pg_advisory_xact_lock(4315003)` → revalidación de actor/sesión → servicio →
   `COMMIT`, con el **mismo `PoolClient`** en todo el flujo (verificado statement por statement
   por el revisor). Matrícula + plan + N cuotas + auditoría se escriben en un único bloque.
2. **Asignación del año académico** — `anio_lectivo_id` validado contra un año activo y su rango
   de fechas; el año inactivo o fuera de rango devuelve 400.
3. **Asignación de grado** — `grado_id` validado para pertenecer al año lectivo indicado; grado
   de otro año devuelve 400.
4. **Aplicación de tarifa** — tarifa activa del mismo año lectivo; *snapshot* `tarifa_id` +
   `moneda` persistido en `planes_pago`; `GET /:id/plan-pago` ahora expone `tarifa_id`.
5. **Generación de obligaciones** — plan y N cuotas en la misma transacción. Los importes
   `NUMERIC` se transportan como cadenas exactas (`monto::text` al leer, sin `Number()` para
   calcular, sin división ni redondeo); no se usa `FLOAT`/`DOUBLE`.
6. **Consulta de historial** — **nuevo** `GET /api/matriculas/:id/historial` (solo lectura,
   `matriculas:read`): estado actual, plan, cuotas y entradas de auditoría de **esa** matrícula,
   con filtro estricto `entidad = 'matriculas' AND entidad_id = $1` (parametrizado) y orden
   ascendente `fecha ASC, id ASC`.
7. **Control de estados** — `ACTIVA` / `DESACTIVADA` / `COMPLETADA` en alta y actualización;
   `PATCH /:id/desactivar` conserva plan y cuotas.
8. **Validación de matrículas duplicadas** — 409 con `UNIQUE (estudiante_id, anio_lectivo_id)`;
   duplicado concurrente medido: 2 `POST` → 1×201 + 1×409 y un solo plan.

**Regla crítica del PM («No generar obligaciones duplicadas cuando una operación se repite por
accidente»)** — implementada por dos vías, ambas medidas:

- **Idempotencia de aplicación** con `idempotency_key` opcional enviada por el cliente (string,
  1..255 tras recorte; inválidos → 400 sin crear filas). La comprobación ocurre **dentro** de la
  transacción, después del advisory lock y con el mismo `PoolClient`. Repetición con la misma
  clave y la misma identidad académica devuelve **200** con la matrícula y el plan existentes
  (`idempotent_replay: true`), sin filas nuevas; con otra identidad académica devuelve **409** sin
  crear nada.
- **Última línea de defensa en el esquema:** índice único parcial `uq_matriculas_idempotencia_actor`
  sobre `(idempotency_key, creado_por_usuario_id)`; una violación `23505` se traduce a 409 sin
  filtrar el mensaje del driver.
- **Sin clave,** el duplicado estudiante/año sigue devolviendo 409.

Huecos cerrados en el lote (los ocho del plan):

| # | Hueco | Cierre |
|---|---|---|
| a | `catch` vacío en el *rollback* del runner de migraciones (`backend/src/scripts/migrate.ts`) | `try/catch` explícito con `redactError`, salida 1 en fallo |
| b | `plan-pago` no exponía `tarifa_id` | expuesto; prueba con el valor real leído de la BD |
| c | contrato engañoso en `POST /api/tutores/:id/estudiantes` (el campo `tutorId` llevaba el id del **estudiante**) | schema estricto sobre `estudiante_id`; `tutorId` devuelve 400 |
| d | sin endpoint de historial de matrícula | `GET /api/matriculas/:id/historial` |
| e | sin idempotencia de aplicación en matrículas | `idempotency_key` + índice parcial acotado al actor |
| f | códigos de permiso del *seed* divergentes de `AUTH_PERMISSIONS` | alineados para los dominios implementados |
| g | defaults financieros de producción en el esquema (`planes_pago.total_cuotas DEFAULT 10`, `tarifas.moneda DEFAULT 'NIO'`) | eliminados; `NOT NULL` sin default |
| h | `npm test` no reproducible (102 falsos FAIL por paralelismo contra BD compartida) | `npm test` serial por defecto; `test:parallel` conservado; sin rutas absolutas de máquina |

---

## ARCHIVOS CREADOS

Código, migraciones y pruebas del corpus de FASE 5 (todos sin seguimiento en Git al cierre de este
lote; no se hizo commit). Las migraciones 005–007 se crearon durante la FASE 5 en sesiones
anteriores; `008_fase5_cierre.sql` es la migración nueva de este lote de cierre:

- `backend/src/validators/matricula.schema.ts`
- `backend/src/services/matricula.service.ts`
- `backend/src/repositories/matricula.repository.ts`
- `backend/src/routes/matriculas.routes.ts`
- `database/migrations/005_matriculas_permisos.sql`
- `database/migrations/006_auth_role_permissions_matriculas.sql`
- `database/migrations/007_fase5_integridad.sql`
- `database/migrations/008_fase5_cierre.sql` (nueva de este lote: aditiva, *forward-only*,
  idempotente, sin `BEGIN`/`COMMIT` propios, sin `DELETE`/`UPDATE` masivo)
- `backend/tests/auth/matriculas.test.ts`
- `backend/tests/auth/matriculas-migrations.test.ts`
- `backend/tests/auth/testEnv.ts`
- `docs/INFORME_FASE_5.md`

## ARCHIVOS MODIFICADOS

- `backend/src/routes/matriculas.routes.ts`*, `backend/src/services/matricula.service.ts`*,
  `backend/src/repositories/matricula.repository.ts`*, `backend/src/validators/matricula.schema.ts`*
  (* creados en FASE 5 y ampliados en este lote)
- `backend/src/routes/tutores.routes.ts`, `backend/src/validators/tutor.schema.ts`,
  `backend/src/repositories/tutor.repository.ts`
- `backend/src/routes/estudiantes.routes.ts`, `backend/src/validators/estudiante.schema.ts`
- `backend/src/scripts/migrate.ts`
- `backend/src/authorization/permissions.ts`, `backend/src/app.ts`, `backend/package.json`
- `database/migrations/001_create_base_tables.sql` (coherencia con el estado final),
  `database/migrations/003_estudiantes_tutores_permisos.sql`,
  `database/migrations/004_auth_role_permissions_check.sql`
- `database/seeds/001_seed_base.sql`
- `backend/tests/auth/estudiantes.test.ts`, `backend/tests/auth/auth-api.test.ts`,
  `backend/tests/auth/concurrency.test.ts`, `backend/tests/auth/permissions.test.ts`,
  `backend/tests/auth/session.test.ts`, `backend/tests/auth/testDb.ts`
- `docs/ESTADO_DESARROLLO.md`, `docs/MATRIZ_TRAZABILIDAD.md`,
  `docs/DECISIONES_Y_CONTRADICCIONES.md`

---

## PRUEBAS EJECUTADAS

Instancia de medición (nunca TCP): **PostgreSQL 16.15 sobre socket Unix**
(`<proyecto>/.tmp/test-artifacts/sgpm-fase3-db`), base `sgpm_auth_test`, usuario `sgpm_test`,
puerto registrado `55433`.

| Batería | Comando real | Exit | Resultado | Duración |
|---|---|---:|---|---|
| Suite completa (final) | `cd backend && npm test` (serial) | 0 | **11 archivos, 218 tests, 218 PASS / 0 FAIL / 0 SKIP** | 275.99 s (Vitest) / 277.111 s (`results.json`) |
| Typecheck de `src` | `cd backend && npm run typecheck` | 0 | 0 errores | 9.145 s (`results.json`) |
| Typecheck estricto `src` + tests | `npx tsc -p ../.tmp/test-artifacts/tsconfig.test.json --noEmit` | 0 | 0 errores | 12.104 s (`results.json`) |
| Instalación limpia 001..008 por CLI | `cli-clean` | 0 | catálogo 001..008; sin defaults financieros; índice parcial creado | 826 ms |
| Reaplicación idempotente | `cli-idempotent` | 0 | 001..008 reaplicados | 511 ms |
| Upgrade desde estado 001..007 | `cli-upgrade` | 0 | filas legacy preservadas (snapshots *DeepEqual*); catálogo final 001..008 | 393 ms |
| Restauración 001..008 | `cli-restore` | 0 | 001..008 | 771 ms |
| Rutas absolutas | `grep -rn "/home/bryan" backend/tests/` | 1 (sin coincidencias) | 0 líneas, salida vacía | — |

*Nota de trazabilidad:* el reporte del tester registra como corrida aceptada **215 PASS**
(`npm-test-final-pass.log`, 301.13 s). Tras la ronda de revisión/seguridad se añadieron las
pruebas RC-01/RC-01b y el registro final de la suite (`vitest-full.log`, reproducido en
`results.json`) es **218 PASS**. La cifra vigente es la de `vitest-full.log`.

---

## RESULTADOS

- Suite completa: **218 tests, 218 PASS / 0 FAIL / 0 SKIP, 11 archivos, exit 0**. Línea base
  previa: 204 pruebas; el incremento proviene de la cobertura nueva de FASE 5.
- Typechecks: `src` exit 0; `src` + tests en modo estricto exit 0.
- Migraciones 001..008: instalación limpia, reaplicación, *upgrade* desde 001..007 y restauración,
  los cuatro con exit 0; paridad de catálogo 25/25 entre limpio y *upgrade*.
- Catálogo medido: `planes_pago.total_cuotas` y `tarifas.moneda` en `NOT NULL` **sin default**;
  `matriculas.idempotency_key` nullable con índice único parcial; `matriculas.creado_por_usuario_id`
  nullable.
- Idempotencia medida: *replay* 200 con la misma matrícula y plan, conteos de `matriculas`,
  `planes_pago` y `mensualidades` idénticos antes/después; clave reutilizada con otro estudiante y
  con otro grado → 409 sin filas nuevas; clave inválida → 400 sin filas.
- Historial medido: 200 con plan/cuotas/auditoría no vacía (`matricula_crear`), 404 para id
  desconocido, 403 para actor sin `matriculas:read`, y conservación de cuotas y auditoría tras
  desactivar.
- *Rollback* medido: fallo inducido por *trigger* deja 0 filas en `matriculas`, `planes_pago` y
  `mensualidades` y 0 auditorías de `matricula_crear`.
- Atomicidad e integridad financiera: `NUMERIC` de punta a punta como cadena exacta; sin
  aritmética flotante ni redondeo.
- **Cierre institucional: NO acreditado.** Este informe es evidencia técnica de ejecución local.

---

## ERRORES DETECTADOS

Hallazgos de la revisión y de la auditoría de seguridad de este lote (veredictos iniciales:
revisor **FAIL**, seguridad **BLOCKER — FAIL**; ambos cerrados en ronda 1 salvo los expresamente
documentados como pendientes):

1. **BLOCKER (revisor)** — `catch` vacío `.catch(() => undefined)` en el camino de `ROLLBACK` en
   `backend/src/routes/matriculas.routes.ts` (tres puntos). Además del fallo invisible, un
   `ROLLBACK` fallido devolvía el `PoolClient` al *pool* con la transacción abortada, heredando
   `25P02` al siguiente prestatario. Es el mismo patrón que este lote cerró en `migrate.ts`.
2. **BLOCKER (seguridad)** — el diff eliminó `auth:roles:manage` de `POST /api/estudiantes` y
   `POST /api/tutores`, que en `HEAD` exigían **ambos** permisos.
3. **HIGH (seguridad)** — la `idempotency_key` era global: funcionaba como oráculo entre actores
   (200 con el perfil de la matrícula ajena, 409 distinguible con otra identidad) y contaminaba la
   auditoría de la matrícula ajena.
4. **HIGH (seguridad)** — `zod@3.25.76` con advisory de agotamiento de memoria
   (`npm audit --omit=dev`: 1 vulnerabilidad *high*, 0 *critical*).
5. **MEDIUM (seguridad)** — `migrate.ts` imprimía el error original de la migración sin redactar.
6. **LOW (seguridad)** — las lecturas `GET` no revalidan sesión dentro de la transacción.
7. Los ocho huecos funcionales del lote (tabla de REQUISITOS IMPLEMENTADOS, a–h), detectados
   sobre el código de FASE 4 y en la línea base.

Hallazgos del revisor **no cerrados** en esta fase y registrados como limitaciones/deuda técnica
(numeración original de `REVISION.md`: #2 asimetría create/update, #3 la comparación de identidad
ignora el `plan_pago`, #5 historial sin *snapshot* `REPEATABLE READ`, #6 `actorId` sin uso en
`obtenerPlanPago`, #7/#8/#9 código muerto y listado duplicado, #10 `mensualidades` y `cuotas` son
el mismo array, #11 semántica del monto de tarifa, #12 `MAX_CUOTAS = 120` sin registro de decisión,
#13 selección sin `ORDER BY` en pruebas, #14 patrón `.catch(() => undefined)` preexistente en 20+
sitios, #15 aserción vacua `expect(true).toBe(true)`, #16 dos criterios sin prueba que los mida,
#17 advisory lock global del proyecto, #18/#19 semilla con `rol_permiso` legacy y datos de
demostración con moneda/montos/calendario).

## ERRORES CORREGIDOS

1. **`catch` vacío en `matriculas.routes.ts`** — sustituido por `try/catch` con `redactError`, el
   mismo patrón que `migrate.ts`; el cliente envenenado se destruye en lugar de devolverse limpio.
2. **Regresión de autorización** — **medida antes de decidir:** restaurar el código de `HEAD`
   hacía fallar **11 pruebas con 403** a cualquier actor de dominio, lo que prueba que exigir
   `[estudiantes:manage, auth:roles:manage]` (y la pareja de tutores) era un defecto de FASE 4 que
   dejaba los endpoints inutilizables. Contrato vigente: el permiso de dominio es necesario y
   suficiente; **fijado por pruebas RC-01/RC-01b** (403 con solo lectura, 403 con solo roles, 201
   con solo `manage`).
3. **Clave de idempotencia global** — la migración 008 añade `matriculas.creado_por_usuario_id` y
   sustituye el índice global por `uq_matriculas_idempotencia_actor` sobre `(clave, actor)`,
   parcial; el repositorio acota la búsqueda al creador. Decisión de diseño: **sin `FOREIGN KEY`**
   en esa columna (registro histórico del actor creador; evita bloqueos y *deadlock* contra el
   flujo de matrícula, dado que los usuarios no se borran físicamente). Prueba HTTP SEC-02: otro
   actor no recibe la matrícula ajena.
4. **`zod@3.25.76`** — **no corregido:** el salto a v4 rompe la API de validación y queda fuera
   del alcance de la FASE 5; se documenta como deuda con aceptación de riesgo (mitigación parcial:
   límite de cuerpo de 1 MB, autenticación y CSRF).
5. **Error crudo de migración** — `redactError` sobre el error principal, conservando el código de
   salida 1.
6. **Revalidación en lecturas** — se mantiene como **riesgo residual aceptado**: ventana de
   milisegundos entre `requireAuth` y el `SELECT`; las mutaciones sí revalidan.

---

## LIMITACIONES

1. **Cierre técnico local, no institucional.** No hay aceptación, aprobación ni firma institucional
   de la FASE 5. `auth_role_permissions` tiene **0 filas**: no se concedió ningún permiso a ningún
   rol institucional y el código no concede nada automáticamente (DEC-03 abierta).
2. **Los números institucionales no se fijaron:** el número de cuotas y la moneda llegan de la
   petición y del catálogo; el esquema no tiene defaults. Los valores usados en las pruebas
   (incluido el caso de 10 cuotas) son datos de prueba, no política. Los defaults eliminados
   respondían a DEC-04/DEC-05.
3. **Semántica del monto de tarifa no decidida:** el código aplica el monto de la tarifa a cada
   cuota sin prorrateo ni redondeo; la decisión institucional es DEC-05.
4. **Hallazgos #2–#19 del revisor abiertos** (lista en ERRORES DETECTADOS). Dos criterios del plan
   están implementados pero **sin prueba que los mida**: la traducción HTTP de `23505` → 409 y la
   ausencia de la clave cruda en `auditoria.detalle`.
5. **Deuda técnica no cerrada en esta fase:** `zod@3.25.76` → v4 (salto mayor, fuera de alcance);
   `npm run lint` roto por falta de configuración *flat* de ESLint (preexistente);
   `backend/src/scripts/bootstrap-auth.ts` con dos `.catch(() => undefined)` y `seed.ts` imprimiendo
   el error crudo; el *seed* duplica sus 3 filas de ejemplo de `tarifas` en cada reejecución porque
   `tarifas` no tiene clave natural única (decisión de modelo de datos pendiente, FASE 6).
6. **Sin interfaz de usuario:** la UI de la FASE 5 corresponde a la FASE 9; no se ejecutaron
   pruebas visuales ni de accesibilidad.
7. **Contradicción de motor sin reconciliar:** el Prompt Maestro sigue indicando MySQL; el motor
   vigente del proyecto es PostgreSQL 16 (DEC-01 resuelta por el solicitante). La contradicción
   permanece registrada, no conciliada en silencio.
8. **Discrepancia documental en `INFORME_FASE_4.md`, corregida en este lote:** indicaba que
   `POST /api/tutores/:id/estudiantes` requiere `estudiantes:manage`; verificado contra el código
   en `HEAD` y en el estado actual, el permiso exigido siempre fue `tutores:manage`. Se corrigió
   la línea y se añadió una nota de rectificación fechada al inicio del informe de FASE 4.
9. **Umbral de tiempo de la suite, corregido en este lote:** la suite usaba el *timeout* por
   defecto de Vitest (5000 ms). Medido: con la máquina libre da 218/218 PASS (~283 s), pero con
   carga sostenida (*load average* > 3) abortaba hasta 17 pruebas por *timeout* sin que fallara
   ninguna asercion, porque cada prueba de autenticacion ejecuta logines bcrypt de coste 12
   (decision de seguridad deliberada, no defecto). Se añadió `backend/vitest.config.ts` con
   `testTimeout`/`hookTimeout` de 30 s y ejecucion serial explicitada. **No relaja ninguna
   asercion**: solo da tiempo de reloj a trabajo de CPU legitimo. Resultado: tres corridas
   consecutivas de 218/218 PASS (~158 s cada una) con la maquina cargada. Se elimino el script
   `test:parallel` porque medido produce 102 fallos falsos contra la base de datos compartida.

## REQUISITOS PENDIENTES

Decisiones institucionales abiertas que bloquean el cierre institucional de la FASE 5 (no se
resuelven ni se cierran en este informe):

- **DEC-03** — matriz de roles institucionales (sin permisos concedidos a roles institucionales).
- **DEC-04** — vencimiento y mora. **DEC-05** — moneda, tarifas y redondeo.
- **DEC-06** — FIFO (desempate, años, excedentes).
- **DEC-11** — glosario tutor/inscripción/matrícula y catálogo escolar.
- **DEC-17 (nueva)** — idempotencia de aplicación en matrículas.
- **DEC-18 (nueva)** — alcance del historial de matrícula.
- **DEC-19 (nueva)** — convención de códigos de permiso en el *seed*.
- Deuda técnica: `zod` v4; `npm run lint`; `.catch(() => undefined)` residuales; duplicación de
  `tarifas` en el *seed*.
- Ratificación institucional de la fase y autorización explícita para continuar (PM §4).

## ESTADO DE LA FASE

**FASE 5 CERRADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS.**

- Los ocho funcionalidades del PM y los ocho huecos medidos están implementados y verificados
  contra PostgreSQL 16 real: **218 pruebas PASS / 0 FAIL / 0 SKIP, 11 archivos, exit 0**;
  typechecks de `src` y de `src` + tests en **exit 0**; cuatro pruebas CLI de migración en
  **exit 0**.
- **No se declara la fase completada a nivel institucional:** los criterios de aceptación
  obligatorios de naturaleza institucional (DEC-03, DEC-04, DEC-05, DEC-06, DEC-11 y las nuevas
  DEC-17/18/19) siguen pendientes, y la regla del PM §4 («No declares una fase completada si sus
  criterios de aceptación obligatorios no se han satisfecho») se respeta en ese sentido.
- No se inició la FASE 6 ni se describió como ejecutada. No se hizo commit ni push.
