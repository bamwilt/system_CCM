# Alcance y orden propuesto de implementación

Fecha: 2026-11-06. Versión 0.1. **Propuesta; no acta de aprobación del colegio.**

## 1. Qué está autorizado ahora

La instrucción del usuario autoriza iniciar exclusivamente la FASE 0: leer las fuentes disponibles, identificar requisitos/contradicciones/dependencias y generar sus entregables. No autoriza saltar a funcionalidades, escoger políticas institucionales, desplegar ni usar datos reales. Se creó documentación, no aplicación ni esquema SQL. Tampoco se inicializó Git: esa tarea pertenece a fase 1, una vez decidida la relación con el repositorio existente.

La sesión de documentación `sgpm-fase0-documentacion-01 — intento 1` actualizó estos entregables y elaboró dos propuestas propias ([DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md) y [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md)); no autoriza iniciar implementación.

No se ha acreditado un alcance institucional firmado. Los FR/NFR de D02 son la **referencia técnica documental**, no prueba de aceptación. La autorización del solicitante para una etapa futura se registrará separada de la aprobación institucional de reglas.

## 2. Núcleo sustentado para proponer a aprobación

| Área | Contenido | Referencias |
|---|---|---|
| Acceso y gobierno | Autenticación, autorización por operación, usuarios/sesión, validación, auditoría y seguridad transversal. | D02 NFR-001/002/009/012; PM fase 3; SEG de matriz. |
| Personas | Alta, edición, búsqueda de estudiantes y tutores; contactos; vínculo obligatorio; historial protegido. | FR-001–010; RN-SGPM-01/10. |
| Catálogos y matrícula | Año, grado/nivel, inscripción/matrícula, fecha y estado; diez mensualidades febrero–noviembre sin duplicados. | FR-011–024; STK-REQ-002. |
| Cobranza | Importe/fecha/estudiante/medio, varios medios, pago parcial/multicuota FIFO, saldos exactos y operación atómica. | FR-025–033; RN-SGPM-03/04/07/08. |
| Mora | 10% desde día 11 como referencia principal pendiente de ratificación frente a día 5. | FR-038; DEC-04. |
| Recibos y consultas | PDF imprimible, ID/folio único y meses; historial/estado de cuenta; morosidad y resumen diario de caja conciliados. | FR-034–040; D05 CU-04/05. |
| Corrección financiera | Reverso autorizado y trazable sin borrado del original, sujeto a política. | PM fase 7; D12 PN-1; DEC-08. |
| Calidad y operación | Pruebas, instalación reproducible, respaldo/restauración, controles, despliegue compatible, manuales y auditoría con evidencia. | PM fases 1–14; D03/D07–D12. |

## 3. Alcance condicional

Decidir antes de implementar: portal de tutores; becas/descuentos/exoneraciones; cargos extraordinarios; catálogo y versiones de tarifas; formatos de exportación adicionales; caja con apertura/cierre formal; migración de Eleventa; firmas digitales. Véanse CAND-01–10 y DEC-03–16. La recuperación de acceso y gestión de usuarios exigidas por PM sí deben planificarse, pero su canal y autoridad no están definidos.

No se autoriza por inferencia: notificaciones SMS/WhatsApp/correo, predicción de mora, aplicación móvil, sincronización financiera offline, soporte multimoneda o dos motores de BD. Una capacidad mencionada como ejemplo SOLID no integra automáticamente la versión inicial.

Exclusiones documentales: pasarela bancaria en línea, notas, asistencia, nómina, inventario de bienes/uniformes y contabilidad general. Una exportación o comprobante no equivale a facturación fiscal certificada. No se descarta ni elimina código preexistente de system_CCM: no se ha descargado y su adopción está por decidir.

## 4. Dependencias técnicas y decisiones esenciales

| Decisión/entrada | Antes de | Trabajo independiente que puede continuar |
|---|---|---|
| Motor (DEC-01, resuelto por solicitante: PostgreSQL), origen del código (DEC-16, desarrollo nuevo) y autorización de fase | Fase 1 ejecutable | Revisión de fuentes, contratos conceptuales y criterios. |
| Diseño correcto/equivalencia y rúbrica (DEC-02) | Cierre exhaustivo de fase 0; modelo físico/auditoría final | Matriz SRS, registro de riesgos, preguntas institucionales. |
| Roles y matriz de operaciones (DEC-03), sesión (DEC-14) | Fase 3 y rutas administrativas definitivas | Inventario de operaciones y casos de abuso. |
| Tutor, grado/curso, inscripción/matrícula y duplicados (DEC-11) | Modelo de personas/matrícula y restricciones fase 2 | Catálogo conceptual y revisión de formularios. |
| Tarifas/moneda/fechas/redondeo, mora/FIFO, becas y reversión (DEC-04–08) | Obligaciones y motor financiero fases 5–7 | Datos personales sintéticos y pruebas especificadas sin importes productivos. |
| Correlativos, firma y caja/reportes (DEC-10/13) | Recibo definitivo/cierre/reportes | Contratos generales y controles de acceso. |
| Despliegue, inventario, RPO/RTO, conservación y aceptación (DEC-09/12/16) | Producción y pruebas de aceptación del entorno | Plan de pruebas local, instalación de desarrollo tras aprobar fase 1. |

Arquitectura lógica propuesta compatible con V2: presentación React/TypeScript; API REST Node/Express; controladores delgados; servicios/dominio financiero único; repositorios transaccionales. Aplicación y dominio pueden ser capas internas de la capa de negocio. PostgreSQL es la línea base técnica vigente según la resolución del solicitante (DEC-01); MySQL requeriría cambio controlado. No se fijan paquetes, versiones o infraestructura sin comprobación actual en fase 1. Las versiones React 19, Node 22, Express 5 y PostgreSQL 18 son solo referencia documental candidata a verificar en fase 1, no dependencias comprobadas. No se adoptó diseño, motor ni código en esta fase.

## 5. Orden incremental propuesto (sin iniciar ejecución)

| Fase del PM | Incremento | Dependencias y criterio de salida |
|---|---|---|
| 0 | Consolidación y ratificación | Fuentes correctas, registros trazados, esenciales decididas y alcance autorizado; hoy pendiente. |
| 1 | Base reproducible | Decidir origen del código/motor, Git sin sobrescribir trabajo, frontend/backend diagnóstico y conexión; ejecutar arranque/build/tests. |
| 2 | Modelo/migraciones | Glosario y relaciones; pruebas de esquema, restricciones, transacción, concurrencia y respaldo aislado. |
| 3 | Acceso seguro | Roles/permisos y sesión aprobados; pruebas positivas/negativas, IDOR y recuperación. |
| 4 | Estudiantes y tutores | Base/acceso; CRUD autorizado, validación, duplicados e historial protegido. |
| 5 | Matrícula y generación de planes | Catálogos/tarifas y calendario aprobados; diez cuotas, idempotencia y rollback comprobados. |
| 6 | Motor financiero | Moneda, redondeo, FIFO/mora/becas definidos; unitarias e integración de saldos y concurrencia. |
| 7 | Cobro, recibo y reversión | Motor y políticas; doble clic/reintento/red, pago mixto y anulación conciliados. |
| 8 | Reportes/cuenta/caja | Registros financieros oficiales; totales cotejados incluyendo pagos parciales/reversiones. |
| 9 | Revisión integral UX/accesibilidad | Las pantallas se construyen con sus módulos; esta fase integra y valida sin postergar toda la UI hasta el final. |
| 10 | Consolidación de auditoría/seguridad | Instrumentar controles desde fases anteriores; matriz riesgo–control–responsable–evidencia sin certificación ficticia. |
| 11 | Ensayos integrales/UAT | Regresión por incremento más carga/seguridad/recuperación global; evidencias y defectos documentados. |
| 12 | Despliegue objetivo | Perfil aprobado y compatible; HTTPS/BD privada, instalación y restauración comprobados en entorno real. |
| 13 | Manuales y transferencia | Documentación actualizada durante el desarrollo; cierre con versión ejecutada y entrega institucional. |
| 14 | Auditoría final | Rúbrica disponible; evaluar evidencias con categorías exactas del PM y riesgos pendientes. |

No se impone duración contractual. El plan de cuatro meses y los presupuestos de D12/D13 son estimaciones, no compromiso de esta sesión ni garantía de entrega. No se presupuestan compras o servicios nuevos.

## 6. Política de avance

- Kanban según D04: preparado 3, desarrollo 2, verificación 2; fuente/criterio/dependencias antes de desarrollar, pruebas y evidencia antes de cerrar. Tablero aún no creado.
- Ninguna fase principal comienza automáticamente: entregar informe y solicitar continuación al usuario.
- No marcar «verificado» por tener código o caso escrito. Registrar resultado real y limitaciones.
- Cualquier cambio aprobado actualiza requisitos, matriz, decisión, API/esquema, pruebas y documentación afectados.
- Antes de producción: formalización institucional, políticas financieras/permisos, restauración real, aceptación y ausencia de defectos críticos. No introducir datos reales mientras no haya autorización y controles.

## 7. Compuerta actual

**Fase 0 parcialmente elaborada; revisión/ratificación pendiente.** La matriz cubre los 62 registros originales de la SRS más reglas y controles identificados. La completitud frente a todas las fuentes aún no puede afirmarse. Resolver DEC-01/02/03/16 y precisar políticas financieras antes de autorizar implementación afectada; los pendientes no se cierran con una aprobación genérica de «continuar».
