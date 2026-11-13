# Estado de desarrollo del SGPM

Actualización: 2026-11-10. Instrucción activa: `Prompt_Maestro_Desarrollo_SGPM_v2.md`. La última fase cerrada es la **FASE 5 (Gestión de matrículas)**, cerrada técnicamente a nivel local con reservas en el lote `sgpm-fase5-cierre-v3` por autorización explícita del usuario; esa autorización sustituyó el congelamiento previo de alcance y **no** autoriza commit ni push ni el inicio de la FASE 6. El texto «exclusivamente FASE 0» de versiones anteriores quedó históricamente superado: las fases 1 a 5 se implementaron por autorizaciones sucesivas. Ese mismo día, y **por una autorización nueva, explícita y distinta** (`usuario_si_ejecutar_fase6A`), se ejecutó el **incremento 6.A** del motor financiero (lote `sgpm-fase6-base-v1`, rama `minion/sgpm-fase6-base-v1`): proyección interna y exclusivamente lectora de obligaciones y saldos ya almacenados. Esa autorización cubre únicamente el incremento 6.A. Con posterioridad, y **por otra autorización explícita y distinta** (`usuario_delega_reglas_financieras_20261110`), se ejecutó el **incremento 6.B** del mismo motor (lote `sgpm-fase6-motor-v1`, misma rama): módulo único de políticas financieras, motor de aplicación de abonos (FIFO, mora, abono parcial, excedente, liquidación), descuentos autorizados y las proyecciones de lectura de pendientes e historial. Ni 6.A ni 6.B cierran la FASE 6, **no** autorizan endpoint ni UI y **no** autorizan commit ni push.

## Resultado actual

**FASE 0 CERRADA CON RESERVAS; FASES 1, 2 Y 3 COMPLETADAS; FASE 4 COMPLETADA CON RESERVAS; FASE 5 CERRADA TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS; INCREMENTO 6.A MEDIDO Y CERRADO TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS; INCREMENTO 6.B MEDIDO Y CERRADO TÉCNICAMENTE A NIVEL LOCAL, CON RESERVAS; FASE 6 NO COMPLETA (FASE 7 PENDIENTE).** Actualización documental verificada (ronda 2); fase 0 cerrada con reservas por decisiones y fuentes institucionales pendientes. Existe aplicación SGPM implementada con backend Express/TypeScript, frontend React/Vite/TypeScript, PostgreSQL 16, migraciones versionadas (001..008) y suite de pruebas medida en **275 pruebas PASS / 0 FAIL / 0 SKIP en 14 archivos, exit 0** tras el incremento 6.B (línea base previa: 259 pruebas en 13 archivos tras 6.A; +16 pruebas en 1 archivo nuevo). No se asumió aceptación institucional ni aprobación de criterios oficiales.

## Cierre de fase 0 (documental, con reservas)

- Resultado documental verificado: 9 Markdown, 119 IDs únicos, 16 DEC, 13 SHA originales sin cambios, guard de alcance PASS, reviewer PASS WITH NOTES, security CON NOTAS.
- Reservas explícitas: roles/permisos (DEC-03/04), tarifas y montos (DEC-05), mora/excedente (DEC-07/08), reversión parcial/total (DEC-08), menores/consentimiento (DEC-11), retención de auditoría (DEC-14), fuentes institucionales faltantes (DEC-02/06/09/10/16).
- FASE 1 NO INICIADA en el momento del cierre.
- No se asumió aceptación institucional ni aprobación de criterios oficiales.

## Actualización documental posterior — FASE 0 (sgpm-fase0-documentacion-01 — intento 1)

- Se actualizaron los siete entregables previos y se crearon dos propuestas propias: [DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md) y [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md).
- Motor: solicitante resolvió DEC-01 (señal «psql»): PostgreSQL; fuentes originales MySQL contradictorias; estado documental C conservado.
- Origen: solicitante confirmó desarrollo NUEVO; no se importa `system_CCM`; DEC-16 mantiene abiertos contrato/licencia/privacidad/actas y autorización futura.
- Pendiente (histórico; sesión `sgpm-fase0-documentacion-01` — intento 1): verificación documental en curso (comprobador actualizado para exigir nueve documentos), ratificación institucional y políticas financieras.
- No se inició fase 1, prototipo, fase productiva ni aceptación institucional; nada se instaló.

## Actualización documental — SGPM fase 0 — `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2)

- Resultados reales recibidos por master desde la ronda 1: tester `ses_e4c4c94fbffet8g8OrJKjJI1dF` — ronda mecánica **PASS**, exit 0, con 9 documentos exigidos, 119 IDs, 40 FR, 13 NFR, 5 STK-REQ, 4 SYS-REQ, 16 DEC, enlaces válidos y 13 hashes; integración **FAIL** en transacción del ciclo completo.
- Reviewer `ses_e4c4c3e18ffepzHRT5pbBpkFto` — **FAIL** por lo mismo y por falta de contratos/mapeo; security `ses_e4c4a5c2bffe4ZQCeOo8DV6pE5` — **CON NOTAS**, sin bloqueadores.
- Corrección documental: separación Aplicación/Dominio, modelo conceptual, mapeo módulo→IDs, contratos HTTP ilustrativos, transacciones por operación y criterios con artefactos mínimos; notas históricas DEC-01/DEC-16 y estado de fase actualizados.
- No se ejecutaron pruebas del producto; no se afirmó que la corrección ya está validada. La ronda documental 2/2 permaneció con la verificación pendiente correspondiente al master (estado histórico); la tarea `sgpm-fase0-registro-evidencia-01` registró la evidencia de la ronda 2: mecánica **PASS** (exit 0) e integración documental **PASS** (exit 0).

## Actualización de evidencia — SGPM fase 0 — `sgpm-fase0-registro-evidencia-01` (registro de evidencia; verificación ronda 2/2)

- Contexto: la tarea de documentación `sgpm-fase0-registro-evidencia-01` registró la evidencia de la verificación documental correspondiente a la sesión de corrección `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2).
- Resultado actual verificado: tester `sgpm-fase0-test-02` — sesión `ses_e4c259a45ffe19WKa29Bd3AQxJ` — **ronda mecánica PASS**, exit 0, con 9 documentos exigidos, 119 IDs, 40 FR, 13 NFR, 5 STK-REQ, 4 SYS-REQ, 16 DEC, enlaces válidos y 13 SHA originales; integración documental **PASS**, exit 0, con transacciones por operación separadas (A/B/C/D/E) y contratos HTTP ilustrativos con idempotencia y errores.
- Reviewer `sgpm-fase0-revision-final-02` — sesión `ses_e4c255241ffeW3tmtebcl3Z104` — **PASS WITH NOTES**; bloqueadores previos corregidos; cuatro notas menores pendientes (privacidad específica remitida a tutor/retención; criterio sin código vs área documental requiere conciliar frase; tipado de salida y ubicación de errores PDF; permiso de reversión ambiguo). No se corrigieron en este encargo; se registran como limitaciones.
- Security (primera revisión, sesión `ses_e4c4a5c2bffe4ZQCeOo8DV6pE5`) — **CON NOTAS**, sin bloqueadores; correcciones de seguridad en propuesta reconocidas por el reviewer; no se ejecutó nueva auditoría de seguridad en este registro.
- UI/a11y: **NO VERIFICADO** sin aplicación; no se ejecutaron pruebas del producto.
- Actualización administrativa: los resultados marcados **PENDIENTE** se conservaron como históricos y esta tarea añadió el resultado **ACTUAL** verificado documentalmente; fase 0 no se marcó **COMPLETA**.
- El usuario ya ratificó el origen nuevo; no se trató de acta/prototipo.
- FASE 0 permanece **EN CURSO** por decisiones y fuentes institucionales pendientes; FASE 1 **NO INICIADA**.
- Guard/sello de alcance final: pendiente de verificación por parte del master; no se marcó en este registro.
- No se condicionó el trabajo independiente siguiente a actas; no se autorizó fase 1 automáticamente.

## Roles y resultados

| Rol | Resultado | Evidencia / sesión |
|---|---|---|
| Context | DONE | `sgpm-fase0-contexto-01`. |
| Planner | DONE | `sgpm-fase0-plan-01`. |
| Documenter | 7 docs modificados; 2 propuestas creadas | `sgpm-fase0-documentacion-01`; `sgpm-fase0-correccion-01`. |
| Tester | PASS (ronda 2) | `sgpm-fase0-test-02` — sesión `ses_e4c259a45ffe19WKa29Bd3AQxJ`. |
| Integración | PASS | Transacciones por operación separadas (A/B/C/D/E) y contratos HTTP ilustrativos con idempotencia y errores. |
| Reviewer | PASS WITH NOTES | `sgpm-fase0-revision-final-02` — sesión `ses_e4c255241ffeW3tmtebcl3Z104`. |
| Security | CON NOTAS | Sesión `ses_e4c4a5c2bffe4ZQCeOo8DV6pE5`; sin bloqueadores. |
| VCS | N/A | No repo. |
| Coder | N/A | Sin implementación. |

## Archivos para retomar

1. [INVENTARIO_DOCUMENTAL.md](INVENTARIO_DOCUMENTAL.md): fuentes originales, SHA-256, método de cita y límites de lectura.
2. [REQUISITOS_CONSOLIDADOS.md](REQUISITOS_CONSOLIDADOS.md): dominio, actores, reglas, entidades, calidad y dependencias.
3. [MATRIZ_TRAZABILIDAD.md](MATRIZ_TRAZABILIDAD.md): 40 FR, 13 NFR, 5 STK y 4 SYS originales; reglas/controles/candidatos adicionales separados.
4. [DECISIONES_Y_CONTRADICCIONES.md](DECISIONES_Y_CONTRADICCIONES.md): 16 decisiones/hallazgos; ninguna aprobada institucionalmente, con DEC-01 y DEC-16 respondidas por el solicitante en esta sesión.
5. [ALCANCE_IMPLEMENTACION.md](ALCANCE_IMPLEMENTACION.md): autorización actual, núcleo propuesto, exclusiones, compuertas y orden de fases.
6. [INFORME_FASE_0.md](INFORME_FASE_0.md): informe de control de fase y verificaciones documentales.
7. [DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md): diseño técnico propuesto — capas, módulos, contratos ilustrativos y fases (propuesta).
8. [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md): criterios de evaluación propuestos con categorías del PM fase 14 (propuesta).

## Hallazgos esenciales

- PM y metodología V2 indican MySQL/InnoDB; SRS/arquitectura y otros V2 indican PostgreSQL 18. El solicitante resolvió DEC-01 con la señal «psql»: PostgreSQL como línea base técnica; las fuentes originales MySQL siguen contradictorias y el estado documental C se conservó.
- D06, titulado diseño V2, es copia idéntica del escenario de red D11. D01 sección 5/P2782–3393 contiene un diseño que internamente se declara v2; referencia provisional hasta confirmar equivalencia. La rúbrica genérica no está en el árbol local (DEC-02).
- Roles: propuestas de 3, 4 y 5 perfiles con permisos incompatibles. No adoptar los perfiles del repositorio por similitud (DEC-03).
- Referencia principal: 10 cuotas febrero–noviembre; FIFO por vencimiento; mora 10% desde día 11 una sola vez sobre base. D12 conserva día 5. Faltan políticas de excedente, becas, redondeo, tarifas, tiempo y anulación (DEC-04–08/11).
- Referencia SRS: saldo/historial p95 ≤2 s, ≥100 solicitudes, hasta 20 concurrentes; 300 estudiantes; RPO ≤1 h y RTO ≤30 min. Otras métricas no sustituyen esta línea base (DEC-09).
- system_CCM solo está referenciado por URL/documentos; no se descargó, inspeccionó ni ejecutó. Los 135 tests declarados son afirmación histórica documental, no resultado actual. El solicitante confirmó desarrollo NUEVO; no se importa system_CCM (DEC-16).
- No editar los DOCX/XLSX originales para resolver discrepancias. Obtener aprobación y registrar cambios primero.

## Verificación

Se extrajo texto de los 12 DOCX y XML de las 18 hojas del XLSX; el texto de los V2 independientes se revisó, D01 se consultó solo en la sección de diseño. Se revisaron visualmente las cuatro imágenes de D05. El resto de imágenes, notas/campos y revisión visual de Office siguen pendientes; no se afirma lectura exhaustiva de D01 ni de todo el expediente.

La evidencia de controles mecánicos de los Markdown y su resultado se registra en `INFORME_FASE_0.md`. La verificación de la ronda 2 (`sgpm-fase0-registro-evidencia-01`) concluyó con mecánica **PASS** (exit 0) e integración documental **PASS** (exit 0); el resto de imágenes, notas/campos y revisión visual de Office sigue pendiente. Ninguno acredita funcionamiento del SGPM. El índice de código no contiene este proyecto; se usaron herramientas locales para documentos. Esta carpeta no era un repositorio Git al inicio y no se inicializó en fase 0.



## Fase 3 — Autenticación, autorización y seguridad (completada con reservas)

**Resultado:** implementación técnica provisional entregada y verificada contra PostgreSQL 16 real (socket Unix, sin TCP).

**Entregables verificados:**
- Configuración estricta de entorno (sin secretos por defecto en producción).
- Migración 002 aditiva: sesiones opacas (hash SHA-256), límites de intento persistentes, concesiones auth separadas del seed.
- Login/logout/me/recovery(503): sesión revocable, cookie HttpOnly/SameSite/Secure, CSRF, bcrypt coste 12+, límite 5 fallos/15 min.
- Gestión protegida de usuarios y roles con permisos técnicos denegación-por-defecto, advisory lock global, revocación de sesiones, auditoría sin PII.
- Bootstrap de desarrollo opt-in (credenciales por variable de entorno, nunca argv).

**Pruebas:** 154 pruebas pasando (configuración, criptografía, migración, sesiones, API auth, autorización, concurrencia). Typecheck de src y tests: 0 errores.

**Reservas:** matriz de roles institucional pendiente (DEC-03), contrato de sesión definitivo pendiente (DEC-14), recuperación de correo sin entrega configurada, interfaz de usuario pendiente (fase 9), sin aceptación institucional.

## Registro de sesión (actualizado)

| Fecha | Acción | Evidencia / estado |
|---|---|---|
| 2026-11-08 | Fase 3 implementada y verificada | 154 pruebas PASS, typecheck 0 errores, migración 002 aplicada dos veces, restricciones SQL verificadas |
| 2026-11-08 | Corrección de concurrencia y presupuesto global | Advisory lock 4315003, re-lectura de credenciales bajo lock, IP antes de global, validación Origin/Content-Type previa |
| 2026-11-08 | Documentación de fase 3 | docs/INFORME_FASE_3.md, docs/ESTADO_DESARROLLO.md actualizados |



## Fase 4 — Gestión de estudiantes y responsables (completada con reservas)

**Resultado:** implementación técnica provisional entregada y verificada contra PostgreSQL 16 real.

**Endpoints implementados:**
- GET/POST /api/estudiantes, GET/PATCH /api/estudiantes/:id, PATCH /api/estudiantes/:id/desactivar
- GET/POST /api/tutores, GET/PATCH /api/tutores/:id, PATCH /api/tutores/:id/desactivar
- POST /api/tutores/:id/estudiantes (asociar estudiante a tutor)

**Pruebas:** 14 pruebas de API contra PostgreSQL 16 real. Typecheck 0 errores. Regresión fase 3: 154 pruebas pasando.

**Reservas:** matriz de roles institucional pendiente (DEC-03), interfaz de usuario pendiente (fase 9), sin aceptación institucional.

## Registro de sesión (actualizado)

| Fecha | Acción | Evidencia / estado |
|---|---|---|
| 2026-11-08 | Fase 4 implementada | 14 pruebas API, typecheck 0, migraciones 003/004 aplicadas |
| 2026-11-08 | Documentación de fase 4 | docs/INFORME_FASE_4.md, docs/ESTADO_DESARROLLO.md actualizados |

## Fase 5 — Gestión de matrículas (cerrada técnicamente a nivel local, con reservas)

**Resultado:** implementación técnica provisional entregada y verificada contra PostgreSQL 16 real (socket Unix, sin TCP) en el lote `sgpm-fase5-cierre-v3`. Cierre técnico local; **no** se acredita aceptación institucional.

**Funcionalidades del Prompt Maestro implementadas:**
- Registro de matrícula (`POST /api/matriculas`) en transacción única: `BEGIN` → advisory lock `4315003` → revalidación de actor/sesión → servicio → `COMMIT`, con el mismo `PoolClient`.
- Asignación de año académico (año activo y rango de fechas) y de grado (pertenencia al año).
- Aplicación de tarifa activa del mismo año; *snapshot* `tarifa_id` + `moneda` en `planes_pago`; `GET /:id/plan-pago` expone `tarifa_id`.
- Generación de obligaciones: plan + N cuotas en la misma transacción, importes `NUMERIC` como cadenas exactas (sin aritmética flotante, sin división ni redondeo).
- Consulta de historial: `GET /api/matriculas/:id/historial` (nuevo; solo lectura, `matriculas:read`, filtro `entidad='matriculas' AND entidad_id=$1`, orden ascendente).
- Control de estados ACTIVA/DESACTIVADA/COMPLETADA; `PATCH /:id/desactivar` conserva las cuotas.
- Validación de duplicados: 409 con `UNIQUE(estudiante_id, anio_lectivo_id)`.
- Regla crítica del PM «no generar obligaciones duplicadas»: `idempotency_key` opcional de aplicación (replay 200 con la matrícula y plan existentes; otra identidad 409) más índice único parcial `uq_matriculas_idempotencia_actor` sobre (clave, actor).

**Huecos cerrados en el lote:** `catch` vacío en el *rollback* de `matriculas.routes.ts`; `plan-pago` sin `tarifa_id`; contrato engañoso `tutorId` en `POST /api/tutores/:id/estudiantes` (ahora estricto sobre `estudiante_id`, cambio deliberadamente rompedor en un endpoint nunca liberado); ausencia de endpoint de historial; ausencia de idempotencia de aplicación; códigos de permiso del *seed* divergentes; defaults financieros de producción eliminados (`planes_pago.total_cuotas` y `tarifas.moneda` quedan `NOT NULL` sin default); `npm test` no reproducible (ahora serial por defecto, `test:parallel` conservado, sin rutas absolutas de máquina).

**Frontera de autorización cerrada con evidencia:** el código de FASE 4 exigía `estudiantes:manage` **y** `auth:roles:manage` en `POST /api/estudiantes` y `POST /api/tutores`; restaurar la versión de `HEAD` hizo fallar **11 pruebas con 403**, lo que acredita que era un defecto de FASE 4 que dejaba los endpoints inutilizables. Contrato vigente fijado con las pruebas RC-01/RC-01b. La clave de idempotencia queda acotada al actor creador (migración 008, sin `FOREIGN KEY` por diseño) y la prueba SEC-02 verifica el aislamiento entre actores.

**Pruebas:** suite completa serial **218 tests, 218 PASS / 0 FAIL / 0 SKIP, 11 archivos, exit 0** (línea base previa: 204). Typecheck de `src` exit 0; typecheck estricto de `src` + tests exit 0. Migraciones por CLI: instalación limpia 001..008, reaplicación, *upgrade* desde 001..007 preservando filas legacy y restauración, los **cuatro con exit 0**.

**Reservas:** matriz de roles institucional pendiente (DEC-03; `auth_role_permissions` con 0 filas, nada concedido automáticamente); moneda/tarifas/redondeo y mora/vencimiento pendientes (DEC-04/DEC-05); FIFO (DEC-06); glosario tutor/matrícula (DEC-11); decisiones técnicas nuevas registradas como DEC-17 (idempotencia de aplicación), DEC-18 (alcance del historial) y DEC-19 (convención de códigos de permiso en el *seed*). Deuda técnica no cerrada: `zod@3.25.76` requiere salto mayor a v4; `npm run lint` roto por falta de configuración *flat* de ESLint; `bootstrap-auth.ts` con dos `.catch(() => undefined)` y `seed.ts` imprime el error crudo; el *seed* duplica sus 3 filas de ejemplo de `tarifas` en cada reejecución. Interfaz de usuario pendiente (fase 9). Sin aceptación institucional.

## Incremento 6.A — Motor financiero: consulta interna de obligaciones y saldos almacenados (medido y cerrado)

**Resultado:** ejecutado el 2026-11-10 en el lote `sgpm-fase6-base-v1` (rama `minion/sgpm-fase6-base-v1`) por autorización explícita del usuario (`usuario_si_ejecutar_fase6A`), conservando el WIP autorizado de FASE 5. Informe de control: [INFORME_FASE_6A.md](INFORME_FASE_6A.md). Cierre técnico local; **no** se acredita aceptación institucional.

**Qué es:** una proyección interna, estricta y exclusivamente lectora de las obligaciones y saldos **ya almacenados** (`mensualidades.saldo_pendiente`, `planes_pago`) de una matrícula: detalle de cuotas y `saldo_total` proyectados del mismo *snapshot*. Cinco estados discriminados: `MATRICULA_INEXISTENTE`, `SIN_PLAN`, `SIN_CUOTAS`, `CON_OBLIGACIONES`, `INTEGRIDAD_INVALIDA`. Importes `NUMERIC` transportados como texto exacto (sin `Number`/`parseFloat`, sin límite artificial de `NUMERIC(12,2)`, negativos preservados, NaN → `INTEGRIDAD_INVALIDA` sin normalizar a cero); `moneda` *legacy* `null` preservada (nunca reconstruida desde `tarifas`); fechas `YYYY-MM-DD` independientes de `DateStyle` y zona horaria.

**Qué no es:** **no es deuda conciliada ni liquidación** y no es motor de pagos: no crea pagos, cuotas ni obligaciones duplicadas, no aplica FIFO, mora, descuentos, excedentes ni reversos (requiere DEC-04/DEC-05/DEC-06/DEC-07, abiertas) y no identifica «pagos pendientes» ni historial financiero.

**Lectura estricta demostrada:** hash lógico (MD5 por tabla sobre todas las filas) idéntico antes y después de un lote de 14 lecturas, con fixtures creados y limpiados fuera de la ventana medida y valores de secuencia excluidos a propósito, más recuento de filas por tabla sin cambios.

**Archivos:** los cuatro del `may_create` del plan, todos nuevos (`backend/src/repositories/obligaciones.repository.ts`, `backend/src/services/obligaciones.service.ts`, `backend/tests/obligaciones.repository.test.ts`, `backend/tests/obligaciones.service.test.ts`). Ningún fichero preexistente modificado, salvo el tipo del helper `inyectarPool` en los dos ficheros de prueba por el defecto D-1 (sin alterar aserciones). Sin migración, semilla, dependencia, permiso ni cambio de configuración.

**Pruebas:** suite completa serial **259 tests, 259 PASS / 0 FAIL / 0 SKIP, 13 archivos, exit 0** (línea base previa 218 en 11 archivos; las 41 pruebas nuevas son 19 de repositorio y 22 de servicio). Typecheck de `src` exit 0; typecheck de `src` + tests exit 2 en la entrega del tester y **exit 0 tras corregir D-1**. Duración ~162 s en reposo y ~380–470 s con carga sostenida, sin fallos por *timeout*.

**Sin endpoint ni interfaz:** 6.A no expone HTTP ni pantallas. La revisión de seguridad que aprobó el plan dejó como condición explícita que una futura integración HTTP exige **autorización independiente**; hasta entonces no hay consumidores. No se concedió permiso nuevo (`auth_role_permissions` sigue con 0 filas) y no se creó ruta, validador ni dependencia.

**Reservas registradas:** `Infinity` garantizado solo a nivel de código (no almacenable en las columnas `NUMERIC(12,2)` vigentes); NFR-005/SYS-REQ-003 (p95 ≤ 2.0 s para saldo/historial) **no verificado formalmente** por falta de consumidor HTTP y de perfil de carga; `npm audit` no es ejecutable en este entorno (registro npm inalcanzable, error TLS 426), por lo que el *advisory* de `zod@3.25.76` reportado en FASE 5 permanece **sin verificación independiente**; los dobles de prueba se inyectan con `as unknown as Pool` (mejora futura: tipar el constructor con el contrato mínimo); deuda SOLID de FASE 5 no cerrada (sin suite de pruebas de sustitución dedicada, SQL de listado duplicado, dos clases en `auth.service.ts`).

**6.B ejecutado y medido (actualización):** lo que este párrafo registraba como pendiente pasó a estar **implementado y medido** en el lote `sgpm-fase6-motor-v1` — identificación de pagos pendientes, aplicación de descuentos, cálculo de recargos por mora, abonos parciales, liquidación de obligaciones e historial financiero, con las diez pruebas obligatorias del PM en PASS. Las políticas siguen siendo la propuesta técnica de DEC-20 (ratificación institucional pendiente; delegación explícita del solicitante 2026-11-10; no es acta del colegio). Ver el apartado siguiente y [INFORME_FASE_6B.md](INFORME_FASE_6B.md). **La FASE 6 sigue sin estar completa**: la funcionalidad «historial financiero» no tiene prueba que la mida y la de «identificación de pagos pendientes» está verificada solo parcialmente.

## Incremento 6.B — Motor financiero: aplicación de abonos, descuentos y proyecciones de lectura (medido)

**Resultado:** ejecutado el 2026-11-10 en el lote `sgpm-fase6-motor-v1` (rama `minion/sgpm-fase6-base-v1`), con autorización explícita del usuario (`usuario_delega_reglas_financieras_20261110`). Informe de control: [INFORME_FASE_6B.md](INFORME_FASE_6B.md). Cierre técnico local; **no** se acredita aceptación institucional.

**Qué se construyó:**

- `backend/src/dominio/politicas-financieras.ts` (nuevo): módulo único y sin efectos secundarios con los 21 parámetros del motor. Parámetro ausente → valor propuesto por DEC-20; parámetro presente e inválido → fallo ruidoso (`ErrorPoliticaFinancieraInvalida`), nunca sustitución silenciosa. Cobertura campo ↔ variable de entorno y coherencia documentación ↔ código verificadas en cada resolución.
- `backend/src/services/aplicacion-pagos.service.ts` y `backend/src/repositories/aplicacion-pagos.repository.ts` (nuevos): motor de aplicación de abonos al plan de UNA matrícula, en una única transacción bajo el advisory lock del proyecto (`4315003`): FIFO por `fecha_vencimiento` con desempate `numero_cuota` + `id`; mora 10 % desde el día 11, una sola vez sobre el monto base, no capitalizable y no recalculada; abono parcial secuencial con remanente y sin saldo negativo; excedente sobre la deuda total rechazado con 400 **antes** de escribir; cuota que llega a `0.00` → `PAGADA` conservando la mora; idempotencia por `pagos.idempotencia_key`; RN-SGPM-07 verificada dentro de la transacción; auditoría en la misma transacción. Todos los importes son cadenas exactas y la aritmética y el redondeo ocurren en PostgreSQL (nunca en JavaScript).
- Descuento autorizado explícito (`validators/matricula.schema.ts`, `matricula.service.ts`, `matricula.repository.ts`): se aplica **antes** de generar el plan, afecta al `monto_cuota` almacenado, exige autorizador (sin él, 400) y **no** se contabiliza como efectivo.
- Proyecciones de lectura (`obligaciones.service.ts`, `obligaciones.repository.ts`): `proyectarPendientes` (condición derivada de datos almacenados; `estados_no_reconocidos` superficía estados desconocidos sin adivinarlos) y `proyectarHistorial` (pagos con sus medios y aplicaciones, importes como cadenas exactas, `fecha_pago` en UTC explícito).

**Lo que prueban las 16 pruebas nuevas** (`backend/tests/motor-aplicacion.test.ts`, 16 tests, 208 aserciones, sin `.only`/`.skip`): las **diez pruebas obligatorias del PM** para el motor financiero —pago completo (saldo `0.00` y `PAGADA` conservando la mora), pago parcial (reduce el saldo exactamente, sin negativo ni `PAGADA` prematura, remanente agotado antes de la siguiente), varias obligaciones pendientes (aplica en orden y deja el resto intacto), aplicación FIFO (misma fecha → orden por `numero_cuota`, resultado idéntico con inserción inversa, independiente del `id`), descuento autorizado (10 % sobre `1000.00` → `monto_cuota` `900.00`, tarifa intacta, no es efectivo), mora (10 % una sola vez, `monto_pagado + saldo = monto_original`, umbral día 10 → `0.00` y día 11 → `50.00`), saldo cero (`saldo_total` `0.00`, ninguna pendiente), pago duplicado (*replay* idempotente sin duplicar y 409 con otra matrícula), pago concurrente (dos abonos reales en paralelo, `monto_total` = medios = aplicaciones) y fallo transaccional (*trigger* real en PostgreSQL, cero filas en `pagos`/`pago_medios`/`pago_aplicaciones` y `mensualidades` idéntica)— más la política = línea base DEC-20, el rechazo ante deriva de configuración, el redondeo `'66.67'` resuelto por PostgreSQL, el rechazo con 400 del excedente (`300.01` sobre una deuda de `300.00`; el exacto sí se acepta), la ausencia de escrituras en los rechazos de validación y la igualdad exacta RN-SGPM-07 verificada en cada pago. Pruebas de mutación sobre el propio archivo (4 y 7 FAIL al alterar mora y estado, revertidas) acreditan que las aserciones no son vacuas.

**Pruebas:** suite completa serial **275 tests, 275 PASS / 0 FAIL / 0 SKIP, 14 archivos, exit 0** (línea base previa: 259 en 13 archivos tras 6.A; +16 tests en 1 archivo nuevo), ~156 s en reposo y 160.36 s en la corrida de aceptación. Typecheck de `src` exit 0; typecheck de `src` + tests exit 0 (ambos reverificados por el orquestador). Latencia del motor medida durante la suite: 26 abonos, mediana 8.3 ms, máximo 30.6 ms (contexto, no verificación de NFR-005).

**Sin endpoint ni interfaz:** 6.B no expone HTTP ni pantallas; la validación de sesión/permisos y `assertActiveSession` llegan con la ruta de pagos (FASE 7), que requiere autorización independiente. No se concedió permiso nuevo (`auth_role_permissions` sigue con 0 filas) y no hay ruta, validador de pago, migración, semilla ni dependencia nuevos.

**Reservas registradas (documentadas, no ocultadas):**

- **Funcionalidades del PM sin prueba que las mida:** «historial financiero» (funcionalidad 9) **no tiene ninguna prueba en la suite** —NO VERIFICADO— y «identificación de pagos pendientes» (funcionalidad 4) está verificada solo parcialmente, en el caso de deuda cero dentro de PM 7. Las funcionalidades 1, 2 y 3 se midieron en los lotes de FASE 5 y 6.A (aquí solo se reejecutan en la regresión). Por ello la **FASE 6 no está completa**.
- **Matiz de idempotencia (documentado, no defecto):** la misma `idempotencia_key` con la **misma** matrícula devuelve un *replay* idempotente sin duplicar nada; el **409** aparece cuando la clave se reutiliza con **otra** matrícula. Es el patrón de casa de la Fase 5 extendido.
- **Hallazgo conocido y NO cerrado** (extiende DEC-17): con `idempotency_key`, un *replay* con **otro porcentaje de descuento** devuelve el plan original (medido: 50 % sobre una matrícula creada con 10 % devolvió `900.00`); la comparación de identidad sigue siendo `(estudiante, año, grado)` y no incluye el plan ni el descuento.
- **Hueco de cobertura del desempate FIFO:** el criterio `id ASC` es inalcanzable dentro de un plan porque `UNIQUE(plan_pago_id, numero_cuota)` hace único a `numero_cuota`; no se afirma como probado.
- **La mora no se suma a `saldo_pendiente`:** queda en `mora_aplicada` y la deuda pendiente es Σ `saldo_pendiente`. Decisión de diseño documentada (no capitalización, D05 P0227) cuya presentación del «importe adeudado» no ha sido ratificada institucionalmente.
- **Discrepancias registradas y NO adoptadas:** D12 día 5 de mora, D07 P0350 (descuento como efectivo), porcentajes didácticos de D07 (15/10/50/25 %), el ejemplo sin mora de D05 y las alternativas de excedente de DEC-06.
- **Redondeo:** `'33.335'` sobre `'100.00'` da `'66.67'` (*half-up* de PostgreSQL), donde `toFixed` en JavaScript habría dado `'66.66'`.
- Otros no verificados: contenido de las filas de `auditoria` del motor, tablas `recibos`/`anulaciones`, multi-moneda, actor `null`, mora con porcentaje decimal, superficie HTTP y NFR-005/SYS-REQ-003 (p95 ≤ 2.0 s, ≥100 solicitudes, 20 concurrentes). Deuda técnica heredada de FASE 5 y 6.A sin cerrar.

## Próxima acción

Con las preguntas 1 y 2 de cierre respondidas por el solicitante (motor PostgreSQL; desarrollo NUEVO), completar fuentes/revisión documental, ratificar políticas financieras y permisos, registrar aprobación con alcance real. La sesión de corrección documental `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2) dejó corregidos los defectos de diseño detectados en la ronda 1; la tarea `sgpm-fase0-registro-evidencia-01` registró la evidencia de la verificación ronda 2 con resultado **PASS** (mecánica e integración documental). Solo después del cierre pertinente y de autorización explícita se prepara fase 1. Si se permite trabajo independiente con pendientes, registrar cuáles y no implementar la parte bloqueada.

**Estado vigente (2026-11-10):** cuatro cosas separadas. (a) Las **fases 0 a 5 quedaron cerradas técnicamente a nivel local, con reservas** (la suite de FASE 5 quedó en 218 pruebas PASS, exit 0, en su lote) y **no** se cierran formalmente: pendiente para el cierre institucional DEC-03 (matriz de roles), DEC-04/DEC-05 (vencimiento, mora, moneda, tarifas, redondeo), DEC-06 (FIFO), DEC-11 (glosario), DEC-17/18/19 y la deuda técnica registrada. (b) El **incremento 6.A está medido y cerrado técnicamente a nivel local, con reservas** ([INFORME_FASE_6A.md](INFORME_FASE_6A.md)): proyección de lo **almacenado**, no deuda conciliada ni liquidación, sin pagos ni obligaciones duplicadas, sin endpoint ni UI y sin consumidores. (c) El **incremento 6.B está medido y cerrado técnicamente a nivel local, con reservas** ([INFORME_FASE_6B.md](INFORME_FASE_6B.md)): motor de aplicación de abonos con las diez pruebas obligatorias del PM en PASS (275/275, exit 0), sin endpoint ni UI, con dos funcionalidades del PM sin prueba que las mida (historial financiero, y pagos pendientes solo parcialmente). (d) **La FASE 6 no está completa** y la **FASE 7 está pendiente**: reversiones y anulaciones, recibos, endpoint de pagos y validación de sesión/permisos no están implementados, y las reglas monetarias y FIFO siguen siendo la propuesta técnica DEC-20 sin ratificar. Sin aceptación institucional; sin commit ni push.

## Registro de sesión

| Fecha | Acción | Evidencia / estado |
|---|---|---|
| 2026-11-06 | Inventario, consolidación y trazabilidad inicial. | Markdown de fase 0; originales preservados. |
| 2026-11-06 | Detección de duplicado y contradicciones. | SHA-256 D06=D11; DEC-01–16. |
| 2026-11-06 | Implementación, pruebas de producto y despliegue. | NO INICIADOS / NO EJECUTADOS (histórico de fase 0; superado por las fases 1–5). |
| 2026-11-08 | Fases 3 y 4 implementadas y verificadas. | 154 pruebas fase 3; 14 pruebas API fase 4; typecheck 0 errores. |
| 2026-11-10 | Fase 5 cerrada técnicamente (`sgpm-fase5-cierre-v3`). | 218 pruebas PASS / 0 FAIL / 0 SKIP, 11 archivos, exit 0; typechecks src y src+tests exit 0; 4 pruebas CLI de migración exit 0; docs/INFORME_FASE_5.md creado. Sin commit ni push. |
| 2026-11-10 | Incremento 6.A ejecutado, verificado y documentado (`sgpm-fase6-base-v1`). | 259 pruebas, 259 PASS / 0 FAIL / 0 SKIP, 13 archivos, exit 0 (218 previos + 41 nuevos de 6.A); typecheck src exit 0 y src+tests exit 0 tras corregir D-1; hash lógico idéntico antes/después de 14 lecturas (sin escrituras); revisiones de plan reviewer/security PASS_PLAN y guard de alcance verificado (4 ficheros nuevos, resto sin cambios); docs/INFORME_FASE_6A.md creado. Sin commit ni push. |
| 2026-11-10 | Incremento 6.B ejecutado, medido y documentado (`sgpm-fase6-motor-v1`), autorización `usuario_delega_reglas_financieras_20261110`. | Suite completa 275 pruebas, 275 PASS / 0 FAIL / 0 SKIP, 14 archivos, exit 0 (259 previos + 16 nuevos en `backend/tests/motor-aplicacion.test.ts`, 208 aserciones, sin `.only`/`.skip`); typecheck src exit 0 y src+tests exit 0 (ambos reverificados); latencia del motor 26 abonos, mediana 8.3 ms, máx 30.6 ms; las diez pruebas obligatorias del PM en PASS; mutaciones sobre el archivo de prueba revertidas (4 y 7 FAIL, luego 16/16); guard de alcance y revisión final del diff registrados (4 ficheros nuevos, 5 modificados, sin migraciones/semillas/rutas/gobernanza); docs/INFORME_FASE_6B.md creado. Reservas: historial financiero sin prueba y pagos pendientes solo parciales; hallazgo de idempotencia con descuento no cerrado. Sin commit ni push. |

## Fase 7.A — Registro de pagos y comprobantes (implementado, sin cobertura commiteada)

Ejecutado el 2026-11-11 (lote `sgpm-fase7-cobro-v1`). Consume el motor de 6.B sin añadir lógica financiera.

- **Endpoints:** `POST /api/pagos`, `GET /api/pagos` (filtros y paginación), `GET /api/pagos/:id`, `GET /api/pagos/:id/comprobante` (solo lectura), `POST /api/pagos/:id/reversar`.
- **Permisos nuevos:** `pagos:manage`, `pagos:read` (técnicos; la matriz institucional sigue pendiente, DEC-03).
- **Comprobante:** identificador único secuencial por año asignado por secuencia de PostgreSQL; generar el comprobante no altera el saldo (probado con hash lógico de cinco tablas antes y después).
- **Anulación:** compensatoria, con referencia, motivo, actor y fecha; la operación original se conserva con su estado final y nunca se borra.
- **Sin PDF:** no hay librería instalada y `npm audit` no es ejecutable en este entorno (registro npm inalcanzable), por lo que la regla 13 del PM impedía añadir la dependencia sin poder auditarla. El comprobante se entrega como dato.

### Defectos encontrados y corregidos en este lote

1. **Atomicidad:** `POST /api/pagos` ejecutaba cobro y comprobante en transacciones separadas. El motor no aceptaba un `PoolClient` externo; ahora lo acepta y la ruta integra todo en una única transacción.
2. **Fuga de conexiones:** al reescribir el bloque transaccional se perdió `finally { client.release() }`; cada petición filtraba una conexión y el pool agotado hacía esperar 5 s por petición. Restituido.
3. **Carrera en el limitador de inicio de sesión** (código de Fase 3, `src/services/auth.service.ts`): `INSERT ... ON CONFLICT DO NOTHING` seguido de `SELECT ... FOR UPDATE` dejaba `row` en `undefined` si una transacción concurrente insertaba y revertía, produciendo 500. Sustituido por `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atómico en los dos sitios.

### Pruebas

Las nueve pruebas obligatorias del PM están en `backend/tests/pagos-api.test.ts` (23 pruebas, todas en verde): doble clic, repetición de solicitudes, fallos de red con hash lógico, concurrencia con conexiones reales, pago parcial, pago completo, reversión, permisos e integridad de comprobantes. La regresión completa queda en **343 pruebas PASS / 0 FAIL / 0 SKIP en 17 archivos, exit 0** (backend) y **19 pruebas PASS en 1 archivo, exit 0** (frontend).

Tres versiones previas del arnés fallaron por defectos del arnés, no del producto: el `beforeEach` borraba `auth_login_limits`, cuyo lock de fila retiene el limitador en cada petición HTTP y bloqueaba el hook hasta su timeout; varias pruebas montaban su matrícula con un actor sin `matriculas:manage` o con CSRF inválido; y dos conteos filtraban por `observaciones`, campo que la fila inversa de la reversión no lleva. El `afterAll` añade una guardia que falla ruidoso si la suite deja concesiones `pagos:*` en la base compartida, para no envenenar otra suite en silencio.

### Comprobante en PDF

`backend/src/servicios/comprobante-pdf.ts` genera el PDF **sin ninguna dependencia**: la regla 13 del PM exige verificar lo que se instala y `npm audit` no es ejecutable en este entorno (registro npm inalcanzable), así que instalar `pdfkit` habría sido incorporar código de terceros sin poder verificarlo. No hay dependencia que auditar porque no se añade ninguna.

Alcance declarado: una página de texto con las 14 fuentes estándar del PDF. Probado estructuralmente (`%PDF-`, `xref`, `%%EOF`, objetos) y con los datos del comprobante dentro; incluye una prueba de que el escape de paréntesis y barras funciona, porque sin él un nombre con paréntesis rompería el content stream.

### Reserva principal

PDF de una página y solo texto: no es una suite de maquetación. Queda también «seleccionar estudiante», que es de interfaz y corresponde a la Fase 9 (el backend ya expone `GET /api/estudiantes` para seleccionar).


## Fase 8 — Reportes y consultas (completada técnicamente a nivel local, con reservas)

Ejecutada el 2026-11-11. Diez endpoints GET bajo `/api/reportes`, todos de solo lectura y con el permiso técnico `reportes:read`.

Los ocho reportes candidatos del PM: pagos por período, matrículas registradas, estudiantes con saldos pendientes, morosidad, recaudación, estado de cuenta (historial individual), operaciones anuladas y movimientos por cajero, más el desglose por medio de pago.

**Regla rectora:** ninguna consulta recalcula un importe. Lo que se suma es lo que `pagos`, `pago_aplicaciones`, `mensualidades` y `pago_medios` tienen almacenado; las sumas las hace PostgreSQL sobre NUMERIC y se devuelven como texto exacto, de modo que el frontend no puede duplicar el cálculo con otro resultado (PM: "No duplicar calculos monetarios de manera inconsistente").

**Sin reloj implícito:** la morosidad exige `fecha_corte`; sin ella devuelve 400 en lugar de usar el reloj del servidor, igual que la mora del motor exige `fecha_efectiva`.

**Anulaciones reflejadas:** una operación revertida no suma a la recaudación pero sí se informa aparte (`anuladas`, `total_anulado`), nunca se oculta (RN-SGPM-07).

**Reservas:** sin exportación ni cierre de caja formal porque DEC-13 (formato, campos personales, paginación, corte horario, apertura/cierre) sigue pendiente de detalle; la interfaz de los reportes es Fase 9.


## Fase 9.A — Interfaz web (completada técnicamente a nivel local, con reservas)

Ejecutada el 2026-11-11. Siete pantallas: inicio de sesion, panel administrativo, registrar cobro, estudiantes, matriculas, reportes y estado del sistema.

Los diez elementos de diseño general que pide el PM están implementados: navegacion principal, panel administrativo, formularios, tablas, busquedas, filtros, confirmaciones, mensajes de error, indicadores de carga y notificaciones.

**Permisos respetados en la interfaz:** cada pantalla y cada enlace de navegacion solo aparece si el usuario activo tiene el permiso tecnico correspondiente. La comprobacion visual NO sustituye la autorizacion del backend (`requirePermission` valida cada peticion): lo que se evita es ofrecer operaciones que seran rechazadas, que es prevencion de errores.

**Sin calculos duplicados:** el cliente API recibe los importes como texto exacto y los muestra tal cual; no los convierte a numero ni recalcula totales (PM: "no duplicar calculos monetarios de manera inconsistente entre backend y frontend").

**Sin animaciones que retrasen el cobro:** solo indicador de carga.

**Sin dependencias nuevas:** React, React DOM, React Router y Axias ya estaban; no se instalo nada porque `npm audit` no es ejecutable en este entorno y la regla 13 del PM exige poder verificar lo que se instala. Por la misma razon las pruebas usan `fireEvent` en lugar de `@testing-library/user-event`.

**Completado:** la sesion sobrevive a la recarga (`/auth/me` devuelve los permisos efectivos y el CSRF), hay pantalla de tutores, alta de matricula con plan de pago (el numero de cuotas lo decide la cantidad de fechas cargadas, sin valor por defecto) y hoja de estilos con foco visible y `prefers-reduced-motion`.

**Reservas:** diseño visual sin validar con personal administrativo y sin pantalla de edicion de matricula. Los catalogos del formulario se cargan solo si existen endpoints; si no, la persona introduce los identificadores a mano.

## Estado vigente (2026-11-13) — correcciones de interfaz y de cobro

Ejecutado el 2026-11-13 sobre el entorno local (PostgreSQL 16 en el puerto 5432, backend en el 3000, frontend en el 5173). Sin commit ni push hasta esta entrada.

**Correcciones medidas, no estéticas:**

1. **Pantalla "Estado del sistema":** renderizaba los estilos por defecto del navegador porque usaba dos clases CSS (`estado__resumen`, `estado__datos`) que no existían en ningún archivo del repositorio —verificado por búsqueda en todo el árbol—. Reescrita con los componentes de la biblioteca propia (panel, resumen, etiquetas), fecha en reloj de 24 horas (`hourCycle: h23`, porque `es-NI` sin más devuelve "10:31 p. m."), tiempo activo en horas y minutos, y botón para volver a comprobar (la versión anterior consultaba una sola vez y la cifra quedaba vieja). Verificado en navegador en tema oscuro y claro.

2. **Icono inexistente en la barra lateral:** el glifo `dashboard` no está en el subconjunto autohospedado de Material Symbols (90 glifos, verificado leyendo el `woff2`), así que se renderizaba como el texto "DASHBOAR". Sustituido por `trending_up`, que sí está en el subconjunto.

3. **Alta de matrícula reescrita** con la misma composición que "Registrar cobro": tres filtros arriba (nombre, documento, grado) más un cuarto de "sin matrícula", tabla ordenable por columna y botón **Elegir** que completa los datos; la ficha del elegido tiene **Quitar** para deseleccionar. El formulario siempre está visible y sus campos siempre son editables (antes solo aparecía tras elegir persona).

4. **Naturaleza de la tarifa, la corrección de fondo:** el concepto de cada cuota estaba fijo en `"Mensualidad N"` en `matricula.service.ts`, de modo que una matrícula o un uniforme generaban cuotas llamadas "Mensualidad 1", "Mensualidad 2"... y en la pantalla de cobro se veían revueltos los conceptos. Ahora el concepto sale de la tarifa y se distingue la naturaleza del cobro: **mensualidad** = varias fechas, una cuota por fecha (regla del PM intacta); **matrícula y uniforme** = pago único, **una sola fecha**, rechazado en el origen con 400. La interfaz es la misma; la validación no.

5. **Pantalla de cobro:** formulario pasado a disposición lineal (un campo debajo del otro, como en matrícula) y cada fila de la tabla declara **qué** se cobra (`Mensualidad` / `Uniforme` / `Matricula`), tomado del concepto de la tarifa del plan. Una familia con matrícula en dos años aparece con una fila por año y se distinguen por concepto y grado, no solo por el nombre.

6. **`GET /api/estudiantes` ampliado** con filtros separados (`nombre`, `documento`, `grado`, `sin_matricula`), insensibles a acentos, y con `grado`, `ultimo_anio` y `tiene_matricula` en la respuesta. La búsqueda combinada `q` se mantiene por compatibilidad.

7. **Deuda técnica cerrada:** `npm run lint` funcionaba en frontend y backend (no había fichero de configuración y ESLint 9 exige *flat config*). Añadidos `frontend/eslint.config.js` y `backend/eslint.config.js`.

**Matriz de permisos de prueba (relacionada con DEC-03, sigue PENDIENTE de aprobación institucional):** para poder probar las cuatro pantallas con usuarios reales se asignaron permisos en `auth_role_permissions` a los roles institucionales (ADMIN los diez códigos; COBRADOR cobros, matrículas y reportes; DIRECTOR y CONSULTA solo lectura). **No es una ratificación de DEC-03**: es una matriz de ejercicio local, reversible, asociada a los usuarios de prueba.

**Datos de demostración cargados:** años lectivos 2026 y 2027 (12 grados y 3 tarifas cada uno), 6 tutores, 8 estudiantes, 8 matrículas, 9 planes de pago, 55 cuotas y 3 pagos con aplicación FIFO. Usuarios de prueba con permisos diferenciados.

**Reservas:** las capturas de `docs/capturas/` se retomaron sobre la aplicación real (se añadió `10-estado-sistema.png`) pero siguen sin validación del personal administrativo; la ausencia de tests de backend en esta sesión es de infraestructura (la suite usa una base de test dedicada en el puerto 55433 que no está levantada), no de la lógica.
