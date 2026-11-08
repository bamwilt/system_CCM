# Requisitos consolidados del SGPM — FASE 0

Fecha: 2026-11-06. Versión de trabajo: 0.1. **Consolidación preliminar; no línea base institucional aprobada.**

**Actualización documental posterior (sesión de documentación):** 2026-11-06 (fecha de corte documental heredada; las confirmaciones posteriores se registran en esta conversación sin timestamp independiente). En esta sesión se actualizaron los siete entregables previos y se crearon dos propuestas propias: [DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md) y [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md).

## 1. Autoridad, clasificación y estado

Las fuentes D01–D13 y PM se identifican en [INVENTARIO_DOCUMENTAL.md](INVENTARIO_DOCUMENTAL.md). Los V2 independientes prevalecen sobre antecedentes; dentro de la descripción técnica se toman SRS D02 y arquitectura D03 como referencia principal, sin ocultar sus discrepancias con PM. Toda resolución pendiente está en [DECISIONES_Y_CONTRADICCIONES.md](DECISIONES_Y_CONTRADICCIONES.md).

Las dos propuestas elaboradas como faltantes en esta sesión — diseño técnico y criterios de evaluación — se registran en [DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md) y [CRITERIOS_EVALUACION_PROPUESTOS.md](CRITERIOS_EVALUACION_PROPUESTOS.md); son derivadas de PM, D02, D03, D05, D07, D08, D09, D10 e [INVENTARIO_DOCUMENTAL.md](INVENTARIO_DOCUMENTAL.md), y no sustituyen fuentes oficiales ni aprobaciones institucionales.

Se conservan los IDs originales FR, NFR, STK-REQ y SYS-REQ de D02. No se reasignan los IDs SRS-FN de otros documentos porque significan cosas distintas según la fuente. Los IDs `RN-SGPM`, `TEC`, `SEG`, `CAL`, `GOB` y `CAND` son identificadores locales de consolidación, no requisitos institucionales nuevos ni aprobaciones. La [matriz](MATRIZ_TRAZABILIDAD.md) contiene el catálogo individual, prioridad documental, módulo, aceptación prevista y prueba propuesta.

Tipos: funcional (FR), calidad (NFR/CAL), necesidad de interesado (STK), sistema/restricción (SYS/TEC), regla de negocio (RN), seguridad (SEG), proceso (GOB), candidato condicional (CAND). Nivel software salvo STK (interesados), SYS e infraestructura (sistema) y GOB (proceso). Una tecnología mencionada en un ejemplo no se transforma por ello en obligación de negocio.

Estados independientes:

- **Documental:** especificado, conflicto, incompleto o candidato.
- **Aprobación:** pendiente, salvo instrucciones de trabajo explícitas del usuario. No hay acta institucional acreditada.
- **Implementación local:** no iniciada.
- **Verificación del producto:** no ejecutada. Un caso formulado no acredita funcionamiento.

«Alta/Alto» y «Media/Medio» se normalizan a Alta y Media sin cambiar su significado. Cuando una prioridad no está indicada se escribe «No indicada»; el orden técnico propuesto no reemplaza la prioridad institucional.

## 2. Objetivo y frontera

SGPM administra expedientes, responsables, matrícula, diez mensualidades, cobros presenciales FIFO, mora, comprobantes y consultas de caja. Busca sustituir duplicación de tarjetas y registros genéricos sin perder historial. Fuente: D02 §§1.3, 3 y anexos; D05 §§1, 3–4.

No incluye por defecto calificaciones, asistencia, nómina, inventario de uniformes/libros, contabilidad general ni pasarelas bancarias. La presencia declarada de docentes/notas en system_CCM no amplía el SGPM. No se infiere una migración automática de Eleventa ni un portal público de tutores.

## 3. Actores y permisos aún por ratificar

| Actor/necesidad | Evidencia | Alcance observado / límite |
|---|---|---|
| Dirección | D02 P0077–0080, P0108; D05 CU-04 | Supervisión, morosidad, caja y aprobación de políticas. No equivale automáticamente al permiso técnico de superusuario. |
| Administradora de cobros/ventanilla | D02 P0081–0084; D05 CU-01/02/03 | Matrícula, responsables, pagos y recibos. Separación de funciones pendiente. |
| Tutor/acudiente | D02 P0085–0088; D05 CU-05 | Responsable financiero y receptor de información. En D02 es cliente indirecto; D05/D08/D11 sugieren acceso propio. Portal pendiente de alcance. |
| Equipo técnico | D02 P0089–0092; D04 | Desarrollo, pruebas y soporte. No obtiene acceso irrestricto a datos reales por este rol. |
| Secretaría, Tesorería, Administrador, Auditor | D08 P0588–0593 | Propuesta de cinco perfiles, con administrador sin operación de cobros. No compatible sin decisión con otros modelos. |
| Administrador, Secretaría, Docente, Consulta | D01 P3264–3266; D03 P0783–0786 | Declaración documental del repositorio, no inspección actual ni matriz SGPM aprobada. |

**No existe una matriz definitiva autorizada por operación.** Antes de implementar RBAC se requiere decidir quién registra/edita estudiantes, matricula, cobra, concede descuentos, cambia tarifas, anula, consulta/exporta datos, administra usuarios y revisa auditoría. La pertenencia tutor–estudiante debe comprobarse en backend si se habilita ese acceso. Ninguna ocultación de botones sustituye autorización.

## 4. Procesos y dependencias

1. Abrir año y mantener catálogos de grado/nivel y tarifas autorizadas.
2. Registrar/buscar estudiante y tutor; validar identidad, duplicados y relación.
3. Confirmar matrícula con año, grado y tutor; generar diez cuotas febrero–noviembre en una operación consistente y sin duplicados.
4. Consultar cuenta; identificar obligaciones, mora y saldo oficial.
5. Confirmar estudiante/tutor, monto y medios; autorizar cobro, distribuir FIFO y registrar cabecera, detalle y auditoría en una transacción.
6. Emitir comprobante desde pago confirmado; reimpresión no vuelve a cobrar.
7. Conciliar por día/operador/medio; obtener morosidad e historial desde los mismos registros.
8. Corregir mediante reversión autorizada y trazable, nunca borrado silencioso; política pendiente.
9. Respaldar/restaurar y operar contingencia conforme al despliegue seleccionado.

Dependencia central: catálogos/tarifas → estudiantes/tutores → matrícula/plan → cuotas/mora → pago/aplicaciones/recibo → reportes/reversión. Autenticación, validación, autorización y auditoría atraviesan todas las escrituras. Las reglas de tarifas, excedentes y anulaciones bloquean sus servicios afectados; no justifican inventar una solución ni detener el análisis de módulos independientes.

## 5. Reglas financieras y administrativas

| ID | Obligación consolidada | Fuente y situación |
|---|---|---|
| RN-SGPM-01 | Matrícula requiere al menos un tutor legal registrado; el análisis exige tutor activo. Un tutor puede representar a varios estudiantes. | D02 P0055; D05 P0145, P0220–0222, P0051. Cardinalidad máxima y tutor principal pendientes (DEC-11). |
| RN-SGPM-02 | Confirmar matrícula genera diez cuotas febrero–noviembre para el ciclo, sin duplicarlas al reintentar. | D02 P0056, STK-REQ-002, Anexo I; PM fases 5–6. Matrícula tardía y traslado pendientes. |
| RN-SGPM-03 | Aplicar abonos por antigüedad de vencimiento, sin saldar una cuota posterior dejando saldo en una anterior. | D02 P0101, CA-03; D05 RN-02; D07 P0347. Desempate y alcance interanual pendientes. |
| RN-SGPM-04 | Abono parcial reduce exactamente el saldo de la cuota; remanente pasa a la siguiente hasta agotarse. No generar saldos negativos. | D02 FR-030/031/032, CA-03; D05 CU-02. Excedente sobre toda la deuda pendiente. |
| RN-SGPM-05 | Referencia técnica: vencimiento día 10; mora 10% desde el 11, una sola vez sobre monto base de cuota vencida no saldada; evento trazable. | D02 FR-038; D05 RN-03 P0227. D12 dice después del día 5: conflicto DEC-04. Precisar beca/base y abonos previos. |
| RN-SGPM-06 | Conservar pago y recibo confirmados; correcciones por reverso vinculado con actor, motivo y fecha, sin borrar el original. | D02 NFR-004; D05 RN-04; D12 P0428–0431; PM fase 7. Política de anulación pendiente. |
| RN-SGPM-07 | Igualdad exacta entre importe del pago, suma de medios y suma de aplicaciones; recibo y reporte deben reflejar la operación y sus reversiones. | D02 FR-033 Anexo F; D07 P0128; D09 P0238–0242; PM reglas 3–4. No contabilizar becas como efectivo recibido. |
| RN-SGPM-08 | Importes con representación decimal exacta; no FLOAT/DOUBLE ni aritmética binaria monetaria no controlada. | PM fase 2/6; D09 P0092–0098, P0115–0119. DECIMAL(10,2) aparece en plan BD; confirmar límites y redondeo. |
| RN-SGPM-09 | Identificadores de estudiante/recibo únicos; comprobante PDF con meses y desglose; emitirlo no altera por separado el saldo. | D02 FR-002/034–037, P0058; PM fase 7. Correlativo, reinicio anual y firma pendientes. |
| RN-SGPM-10 | Preservar relaciones e historial financiero; impedir borrado de personas con registros dependientes. | D09 §V; PM fase 4. Estado inactivo no debe eliminar evidencia. |
| RN-SGPM-11 | Solo políticas y tarifas institucionales aprobadas determinan obligaciones. Presupuesto de desarrollo, salario, TMAR, VAN y supuestos del Excel no son aranceles operativos. | PM regla 11; D12 §3.6/Anexo N; D13 Supuestos B11/B12. C$500/C$600 no autorizados. |
| RN-SGPM-12 | Datos inválidos, cero o negativos se rechazan tanto en cliente como en backend; confirmar estudiante y tutor antes del cobro. | D02 Anexo B; D05 P0301–0303; PM regla 5. Catálogo de medios y campos obligatorios pendientes. |

### Casos que todavía no deben codificarse como política definitiva

- Moneda operativa única o multimoneda: D02 usa C$, D05/D10 usan `$`; el USD de D12 es moneda de evaluación, no de cobro. Zona horaria, fecha efectiva y redondeo pendientes.
- Tarifa por grado/año, importe de matrícula, becas, exoneraciones, hermanos y pronto pago: existencia parcial en análisis, sin porcentajes aprobados. El 15/10/50% de ejemplos SOLID no es reglamento.
- FIFO: empates, deuda de años previos, cargos extraordinarios, cuotas futuras y preferencia capital/mora. Los ejemplos que ordenan por ID son propuestas técnicas, no decisiones institucionales.
- Reversión: reabrir cuotas, pagos posteriores, períodos cerrados, devolución de efectivo y autorización. No basta con cambiar un estado.
- Cierre de caja: horario, zona temporal, apertura/cierre formal, efectivo contado, diferencias y reapertura. FR-040 exige resumen, no acredita todas esas capacidades.

**Políticas pendientes de ratificación institucional (sin fijar en esta sesión):** roles/tarifas, mora y excedentes/FIFO, becas y reversión. La resolución del solicitante sobre motor y origen de desarrollo no constituye aprobación institucional de dichas políticas.

## 6. Entidades y límites del modelo

Entidades sustentadas: estudiante, tutor/contacto/vínculo, año académico, grado/nivel, inscripción/matrícula, plan, mensualidad/vencimiento, pago, medio/desglose de pago, aplicación de pago, recibo, recargo y auditoría. Fuentes: D02 FR-001–040; D05 CRC; D07 P0128; D09.

Candidatas sujetas a definición: tarifa versionada, beca/descuento/exoneración, obligación extraordinaria, reversión, cierre de caja y sesión/recuperación de cuenta. Usuarios/roles/permisos requieren modelo de acceso, no adopción automática de los perfiles del repositorio.

No se ha diseñado ni creado esquema físico. Los nombres `tbl_*`, `PagoCabecera` y el supuesto de 28 tablas son referencias, no migraciones aprobadas. Resolver si inscripción y matrícula son etapas/entidades distintas y la relación grado/nivel/curso antes de fijar restricciones.

## 7. Calidad, seguridad y restricciones

- D02: autenticación, RBAC, integridad e inmutabilidad; interfaz responsiva y WCAG 2.1 AA; validación y consistencia; credenciales protegidas; auditoría.
- NFR-005/SYS-REQ-003: p95 ≤ 2.0 s para saldo/historial, ≥100 solicitudes y hasta 20 concurrentes. Se propone probar expresamente a 20 para evitar una validación de carga trivial; aprobación del entorno pendiente. No extender automáticamente este límite a cobro/PDF.
- NFR-010/011: RPO ≤1 h, RTO ≤30 min. Respaldo nocturno por sí solo no demuestra RPO. Procedimiento y soporte reales por verificar.
- NFR-013: hasta 300 estudiantes y horizonte de crecimiento de cinco años, no 300 usuarios simultáneos. Escenarios 160/220/300 son conjuntos de prueba; 500 aparece como ensayo alternativo, no capacidad aceptada.
- D08: bcrypt costo ≥12 (14 objetivo), JWT/cookies seguras propuestos, límite de 5 fallos/15 min, parámetros SQL, protección IDOR/XSS/CSRF, secretos externos, TLS, registros mínimos, dependencias controladas y separación de entornos. Sus tiempos de sesión y mecanismo de revocación aún requieren conciliación.
- PM/D03/D07: capas y dominio financiero centralizado, transacciones, control de concurrencia, instalación reproducible, migraciones y pruebas. Tres capas de sistema compatibles con aplicación/dominio separados internamente; no son cuatro servidores obligatorios.
- Referencia documental: React/TypeScript, Node/Express y PostgreSQL. PM pide MySQL/InnoDB: DEC-01 quedó resuelto por el solicitante (señal «psql»); las fuentes originales MySQL siguen contradictorias y el estado documental C no se reclasificó sin criterio. Versiones y librerías concretas se comprobarán en fase 1; no se instalaron en esta fase.

## 8. Verificación y aceptación

La matriz contiene aceptación **prevista**, no ejecutada. Conservar prueba, requisito, datos sintéticos, commit o huella, fecha, entorno, responsable, esperado, observado, código de salida e incidencias. FR-001–040 tienen casos CP-FR-001–040 definidos en D02 Anexo F; complementar por cada invariante y cada permiso. Para NFR-004 una prueba de rollback no basta: probar rechazo de modificación y reversión autorizada.

No se importan los 135 tests declarados en los documentos como resultados actuales. No se certifica ISO ni cumplimiento legal por citar normas. Dirección debe ratificar requisitos/reglas, el responsable técnico las decisiones de diseño y el responsable jurídico los instrumentos y políticas aplicables.

## 9. Condición de cierre

Catálogo SRS identificado: 5 necesidades + 4 requisitos de sistema + 40 FR + 13 NFR = **62 registros originales**, con niveles distintos y solapamientos, no 62 funcionalidades independientes. Las reglas/controles adicionales se trazan por separado. El análisis sigue abierto por fuentes faltantes, imágenes, roles y decisiones financieras. No se afirma identificación exhaustiva de todos los requisitos del expediente ni aprobación del alcance.
