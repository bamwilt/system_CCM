# Diseño técnico propuesto — SGPM

Fecha: 2026-11-06. Versión: 0.1. **PROPUESTO — no aprobación institucional ni adopción.**

## 1. Objeto y fuente

El presente documento es una propuesta de diseño elaborada durante la sesión `sgpm-fase0-documentacion-01 — intento 1` del proyecto SGPM. Fue elaborada por el redactor a partir de lo solicitado por el planner y validado por el contexto de ejecución: se creó como PROPUESTA NUEVA, sin sustituir fuentes oficiales ni aprobaciones institucionales.

Deriva de las fuentes identificadas en [INVENTARIO_DOCUMENTAL.md](INVENTARIO_DOCUMENTAL.md): PM (fases 0–14), D02, D03, D05, D07, D08, D09 y D10. Se toma como base la consolidación de requisitos y decisiones de [REQUISITOS_CONSOLIDADOS.md](REQUISITOS_CONSOLIDADOS.md) y [DECISIONES_Y_CONTRADICCIONES.md](DECISIONES_Y_CONTRADICCIONES.md).

No se implementó código, no se instalaron dependencias y no se inició fase 1.

## 2. Capas propuestas

| Capa | Componentes conceptuales | Responsabilidades | Referencia |
|---|---|---|---|
| Frontend | Pantallas, componentes, servicios HTTP, formularios, navegación | Presentación, captura de datos, feedback de usuario; sin SQL ni reglas financieras | D02 P0113/P0052; PM fase 9 |
| API | Rutas y controladores delgados, middleware transversal, validación, manejo de errores | Orquestación HTTP, autenticación/autorización, consistencia transaccional | D08 §IV–IX; PM fase 3 |
| Aplicación | Servicios de orquestación, unidad de trabajo y autorización de casos de uso; la transacción y la revalidación de saldo se concentran en el caso | Flujos financieros, casos de uso, consistencia transaccional | D02 FR; PM fase 6 |
| Dominio | Reglas financieras puras: decimales exactos, orden FIFO, estados de obligación | Entidades y reglas sin depender de framework, HTTP ni SQL | D09 §IV/VII; PM fase 2/4 |
| Repositorios | Acceso a datos / repositorios transaccionales conceptuales | Integridad referencial, ACID, concurrencia, trazabilidad | D02 P0112; DEC-01 |

La arquitectura documental vigente contempla tres capas compatibles con aplicación/dominio separados internamente; no se asume cuatro servidores obligatorios. El desglose frontend/API/controladores/aplicación/dominio/repositorios es una propuesta de componentes, no rutas fijadas.

**Separación propuesta Aplicación/Dominio.** La capa de **Aplicación** se define como orquestación, unidad de trabajo y autorización de los casos de uso, sin contener reglas financieras puras. La capa de **Dominio** agrupa las reglas financieras puras — decimales exactos, orden FIFO, estados de obligación — sin depender de HTTP ni de acceso a SQL. Los **repositorios** se limitan al acceso a datos; la transacción y la revalidación de saldo se concentran en el servicio de aplicación, no en el middleware HTTP.

## 3. Módulos y relaciones conceptuales

- Estudiantes/tutores/contactos/vínculos.
- Catálogos académicos: año, grado/nivel, curso.
- Matrícula/inscripción y generación de planes de diez mensualidades.
- Cuotas, vencimientos, mora, abonos y aplicación FIFO.
- Pagos, medios/desglose, aplicaciones, recibos y reportes/caja.
- Acceso, auditoría y recuperación.

**Modelo conceptual (propuesto).** Entidades contempladas: estudiante; tutor/contacto/vínculo; año académico; grado/nivel; inscripción; matrícula; plan de cuotas; cuota/mensualidad con vencimiento; pago; medios y desglose; aplicación; recibo; auditoría; reversión y tarifa.

| Entidad | Relación | Estado / decisión |
|---|---|---|
| Estudiante | — | Persona titular. |
| Tutor/vínculo | Tutor → estudiante | Mínimo 1 tutor para matrícula; máximo/vínculo/usuario pendiente (DEC-11). |
| Año académico | Año → grado/nivel → inscripción → matrícula | Catálogo y estados propuestos. |
| Inscripción | Inscripción → matrícula | Etapa/distinción pendiente (DEC-11). |
| Matrícula | Matrícula → plan → cuotas | Requiere tutor; estados propuestos. |
| Plan/cuota | Plan → cuotas (diez como regla general) → vencimiento/mora | Pendiente DEC-04/05/06. |
| Pago/medios/aplicaciones | Pago → medios → aplicaciones → recibo/auditoría | Idempotencia y reversión propuestas (DEC-08). |
| Recibo | Pago → recibo | Correlativo/firma pendientes (DEC-10). |
| Auditoría/reversión | Evento sobre entidad | Actor, motivo, tiempo, resultado; inmutabilidad. |
| Tarifa | Catálogo → cuotas | Pendiente DEC-05. |

Sin imponer DDL con cardinalidades dudosas en esta fase: las restricciones se deciden con DEC-11 y políticas ratificadas.

Las relaciones entre módulos deben respetar las dependencias: catálogos/tarifas → personas → matrícula/plan → cuotas/mora → pago/aplicaciones/recibo → reportes/reversión. Deben considerarse las incertidumbres registradas en [DECISIONES_Y_CONTRADICCIONES.md](DECISIONES_Y_CONTRADICCIONES.md) (DEC-01…DEC-16) sin imponer soluciones fuera de las aprobaciones.

## 4. Requisitos → componentes PROPUESTOS

La siguiente correspondencia es una propuesta derivada, no una implementación:

| Requisito origen | Componente propuesto | Observación |
|---|---|---|
| FR-025–033 (pagos y aplicaciones) | Servicio de cobro con transacción de pago (ver §6.1) | Con consideraciones de idempotencia (PM fase 7). |
| FR-034–037 (recibos) | Módulo de recibos | Generación separada del efecto monetario. |
| RN-SGPM-* | Reglas de dominio | Con incertidumbres DEC registradas. |
| NFR-003/004/005 | Servicios de dominio y persistencia | Concurrencia, precisión decimal, rendimiento. |

Los componentes propuestos se identifican como PROPUESTOS; los IDs de requisitos originales (FR, NFR, STK-REQ, SYS-REQ y RN-SGPM) se conservan sin reasignación.

### 4.1 Mapeo módulo → IDs originales agrupados

| Módulo | IDs originales agrupados | Controles asociados | Decisiones pendientes |
|---|---|---|---|
| Personas, tutores y vínculos | FR-001–010 | Validación, duplicados, historial protegido | DEC-11. |
| Catálogos académicos e inscripción/matrícula | FR-011–020 | Transacción de matrícula sin duplicados | DEC-04, DEC-05, DEC-06, DEC-11. |
| Planes y cuotas | FR-021–024 | Generación idempotente de plan, FIFO, mora | DEC-04, DEC-06, DEC-11, DEC-05. |
| Pagos, medios y aplicaciones | FR-025–033 | Inmutabilidad, idempotencia, reversión | DEC-05, DEC-07, DEC-08. |
| Recibos, mora y caja/reportes | FR-034–040 | Conciliación, inmutabilidad | DEC-10, DEC-13. |
| Interés general del SRS | STK-REQ-001–005, SYS-REQ-001–004, NFR-001–013 | Controles transversales TEC/SEG/CAL | DEC-01, DEC-02, DEC-03, DEC-09, DEC-12, DEC-14, DEC-16. |

Los 62 IDs originales quedan agrupados en FR-001–024, FR-025–033 y FR-034–040, más los catálogos STK/SYS/NFR; no se asignaron IDs de requisitos nuevos.

## 5. Contratos HTTP ilustrativos (sin implementar)

Los siguientes contratos son ilustrativos y no ejecutables.

| Operación | Método + ruta | Entrada / tipos | Salida / tipos | Errores | Permiso (propuesto) |
|---|---|---|---|---|---|
| Sesión: login | POST /api/auth/login | `{email: string, password: string}` | `200 {sesión}`; `400/401` | 400 validación, 401 credenciales | Pública con control de intentos (DEC-14); sin idempotencia especial requerida |
| Sesión: logout | POST /api/auth/logout | cabecera de sesión | `204`; `401/403` | 401/403 | Sesión activa |
| Estudiantes/tutores: matrícula | POST /api/matriculas | `{estudianteId: string, tutorId?: string, año: number, grado: string}` | `201 {matrícula, plan, cuotas[]}` | 400/401/403/404/409/422 | Propuesto según matriz DEC-03; denegación por defecto |
| Cuenta: consulta | GET /api/cuentas/{estudianteId} | path `string` | `200 {saldo, cuotas[], pagos[], mora}` | 401/403/404 | Por operación y pertenencia (RBAC + IDOR) |
| Pago: registro | POST /api/pagos | `{estudianteId: string, importe: string decimal, medios: [{tipo: string, valor: string}], idempotenciaKey: string}` | `201 {pago, medios, aplicaciones, recibo}` | 400/401/403/404/409/422 | Propuesto autorización de cobro |
| PDF: comprobante | GET /api/pagos/{pagoId}/recibo | path `string` | binario PDF; `404/401/403` | — | Propuesto consulta de comprobante |
| Reversión | POST /api/reversiones | `{pagoId: string, motivo: string, política: string}` | `201 {reversión}`; `409` | 401/403/404/409 | Propuesto autorización propia |
| Morosidad/caja | GET /api/morosidad; GET /api/caja/resumen | query params | `200` listas/totales | 401/403/404 | Lectura consistente |

- **Autenticación:** credenciales validadas en backend; sesión/JWT con propiedades del D08 (bcrypt ≥12, límites de fallos, flags de cookie); expiración y revocación por ratificar (DEC-14).
- **Actor:** siempre sesión del servidor; jamás `cashierId` confiable proveniente del cliente.
- **Dinero:** representación decimal exacta como **string** (propuesta; no se adopta valor numérico; no se adopta el valor de la cuota como importe).
- **Idempotencia:** claves de idempotencia para escrituras financieras y de matrícula; misma clave + mismo payload → mismo resultado; misma clave con distinto payload → `409`.
- **Errores:** `400` validación, `401` autenticación, `403` autorización, `404` recurso, `409` conflicto/idempotencia, `422` semántico, según propuesta.
- **Flujo matrícula → pago → recibo → reversión:** operaciones separadas con transacciones propias (ver §6.1); no se afirma una transacción que cubra el ciclo completo.
- **Reversión:** transacción compensatoria propia, vinculada al evento, sin borrar el original; deduplicación atómica.
- **PDF:** comprobante generado a partir del pago confirmado tras commit; reintentar el PDF no recobra.

## 6. Invariantes, pagos mixtos, abonos, deuda, concurrencia y precisión

### 6.1 Transacciones por operación (propuesta)

- **A. Matrícula + plan + 10 cuotas + auditoría:** transacción atómica sin incluir pago. Bloqueo de cuenta/cuotas con orden estable y revalidación; idempotencia de matrícula (misma clave+mismo payload → mismo resultado; distinto → `409`); rollback completo.
- **B. Pago + medios + aplicaciones + recibo único + auditoría:** misma transacción BD (mismo cliente) con lock de cuenta/cuotas en orden estable y revalidación de saldo dentro del lock; idempotencia (misma clave+mismo payload → resultado previo; distinto → `409`); rollback de escritura completa; retry de conflicto acotado y seguro. El PDF binario se genera **después** del commit, de modo que reintentar el PDF no recobre.
- **C. Reversión:** transacción compensatoria propia, bloqueando pago/cuenta; autorización con motivo en el enlace al evento, sin borrar original; deduplicación atómica para impedir doble reversión; política parcial/total/reabrir y años sin decidir; contradicción de idempotencia en el payload → `409`. No se afirma una transacción que cubra el ciclo completo matrícula → pago → reversión.
- **D. Reportes:** lectura consistente, sin mutar saldos; descuentos en ledger, no en caja.
- **E. Estrategia decimales:** API con string decimal (propuesta) frente a alternativa de centavos; persistencia NUMERIC; precisión, límites, redondeo y moneda pendientes (DEC-05); ninguna representación FLOAT para dinero.

Concurrencia/isolation: mecanismo propuesto sujeto a diseño y validación; **REPEATABLE READ propuesto sin aprobación previa** y no adoptado a ciegas.

- Igualdad exacta entre importe del pago, suma de medios y suma de aplicaciones.
- Abonos por antigüedad/FIFO sin saldos negativos; excedentes pendientes según DEC-06.
- Pagos mixtos: suma de medios = importe; beca no contabilizada como efectivo recibido.
- Concurrencia: control de concurrencia en escrituras financieras (TEC-04).
- Precisión: DECIMAL/NUMERIC con acumulaciones exactas (RN-SGPM-08).
- Financiero pendiente: moneda, tarifas, redondeo, zona horaria, mora, becas, excedentes y anulaciones con casos esperados.

## 7. Seguridad y privacidad de datos personales y de menores

RBAC por operación con pertenencia de objeto (IDOR) y denegación por defecto en cada endpoint; sesiones revocables en logout/desactivación/cambio de credenciales con mecanismos mínimos propuestos (DEC-14) y tiempos de expiración/mecanismos pendientes. En endpoints que cambian estado se propone control CSRF vía cookie con TLS/origin/cabeceras/validación; decisiones de librerías nuevas quedan pendientes. Logs diagnóstico sin PII ni secretos; auditoría con actor, tiempo, acción, resultado y motivo en reversión; acceso/inmutabilidad/retención según DEC. Copias (respaldos) cifradas con acceso mínimo independiente; RPO ≤1 h y RTO ≤30 min como referencia no garantida (DEC-09). Las protecciones descritas no constituyen certificación.

## 8. Fases de implementación — NO INICIADAS — y gates

No se inició fase 1, prototipo ni fase productiva; no se adoptó el diseño propuesto y no se fijó acta institucional. Gates: motor (DEC-01) y origen (DEC-16) resueltos en sesión; diseño correcto (DEC-02), roles (DEC-03) y políticas financieras pendientes de ratificación institucional antes de implementar.

## 9. Límites y prohibiciones de la propuesta

- No se fijan roles, moneda/tarifas/fechas/redondeo/excedentes/mora como política aprobada.
- No se usan nombres reales, cédulas/tokens ni constantes monetarias productivas; ejemplos genéricos sin datos personales.
- No se producen DDL/migraciones ejecutables.
- Versiones React 19, Node 22, Express 5 y PostgreSQL 18: solo referencia documental candidata a verificar en fase 1; no son dependencias comprobadas.

## 10. Estado

**PROPUESTO.** Pendiente de evaluación con [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md). Actualización de la sesión de corrección documental `sgpm-fase0-correccion-01 — intento runtime1, ronda documental 2/2`: se registraron los cambios obligatorios de diseño (separación Aplicación/Dominio, modelo conceptual, mapeo, contratos, transacciones y seguridad); la verificación correspondiente está **PENDIENTE**. No se afirmó validación de la corrección.
