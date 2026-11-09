# Estado de desarrollo del SGPM

Actualización: 2026-11-06. Instrucción activa: `Prompt_Maestro_Desarrollo_SGPM_v2.md`, exclusivamente FASE 0.

## Resultado actual

**FASE 0 CERRADA CON RESERVAS (cierre documental, 2026-11-07); FASES 1 Y 2 COMPLETADAS; FASE 3 COMPLETADA CON RESERVAS.** Actualización documental verificada (ronda 2); fase 0 cerrada con reservas por decisiones y fuentes institucionales pendientes. Existe aplicación SGPM implementada con backend Express/TypeScript, frontend React/Vite/TypeScript, PostgreSQL 16, migraciones versionadas y 154 pruebas de autenticación/autorización pasando. No se asumió aceptación institucional ni aprobación de criterios oficiales.

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

## Próxima acción

Con las preguntas 1 y 2 de cierre respondidas por el solicitante (motor PostgreSQL; desarrollo NUEVO), completar fuentes/revisión documental, ratificar políticas financieras y permisos, registrar aprobación con alcance real. La sesión de corrección documental `sgpm-fase0-correccion-01` (intento runtime1, ronda documental 2/2) dejó corregidos los defectos de diseño detectados en la ronda 1; la tarea `sgpm-fase0-registro-evidencia-01` registró la evidencia de la verificación ronda 2 con resultado **PASS** (mecánica e integración documental). Solo después del cierre pertinente y de autorización explícita se prepara fase 1. Si se permite trabajo independiente con pendientes, registrar cuáles y no implementar la parte bloqueada.

## Registro de sesión

| Fecha | Acción | Evidencia / estado |
|---|---|---|
| 2026-11-06 | Inventario, consolidación y trazabilidad inicial. | Markdown de fase 0; originales preservados. |
| 2026-11-06 | Detección de duplicado y contradicciones. | SHA-256 D06=D11; DEC-01–16. |
| 2026-11-06 | Implementación, pruebas de producto y despliegue. | NO INICIADOS / NO EJECUTADOS. |
