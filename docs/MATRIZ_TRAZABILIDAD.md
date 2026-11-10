# Matriz de trazabilidad — FASE 0

Fecha: 2026-11-06; actualización 2026-11-10. Versión 0.1; pendiente de ratificación. Fuentes y localizadores: [inventario](INVENTARIO_DOCUMENTAL.md). Reglas: [consolidación](REQUISITOS_CONSOLIDADOS.md). Discrepancias: [decisiones](DECISIONES_Y_CONTRADICCIONES.md).

## Convenciones

Cada fila identifica una obligación o registro de nivel superior; no se suman necesidades, restricciones y reglas como funcionalidades distintas. Se preservan IDs de D02; los demás prefijos son locales. Prioridad es la de la fuente indicada, no una prioridad inventada. «No indicada» significa pendiente de priorización institucional.

Estados documentales: **E** especificado; **C** conflicto; **I** incompleto; **P** propuesta/candidato. Para las filas **sin implementación local** sigue aplicando: aprobación institucional pendiente, implementación local no iniciada, prueba no ejecutada, resultado real **NO EJECUTADO**, evidencia de ejecución **no disponible**. La fuente acredita únicamente el origen documental. Los nombres de componentes son asignaciones lógicas futuras, no rutas existentes.

**Corrección del enunciado global (2026-11-10, lote `sgpm-fase5-cierre-v3`).** La frase «Para todas las filas: implementación local no iniciada, prueba no ejecutada, resultado real NO EJECUTADO» dejó de ser cierta para el subconjunto de filas trazables a la FASE 5: esas filas tienen implementación local y prueba ejecutada con resultado real medido (ver sección 9). La corrección **no** reclasifica los estados documentales **E/C/I/P** de ninguna fila, no altera los IDs originales ni afirma resultado para fases no ejecutadas. Las filas de la sección 9 son las únicas con evidencia local; el resto del documento conserva el estado anterior y las filas no verificadas se marcan como tales en lugar de asumirse.

Actualización documental registrada: la resolución del solicitante sobre motor (DEC-01) y origen de desarrollo (DEC-16) se reflejó en los documentos de decisiones sin reclasificar los estados documentales de las filas. Los estados **C/I/E/P** siguen expresando la situación documental hasta ratificación institucional. No se añadieron identificadores de requisitos nuevos; los componentes propuestos del diseño técnico se distinguen en [DISENO_TECNICO_PROPUESTO.md](DISENO_TECNICO_PROPUESTO.md) como PROPUESTOS.

Métodos: T = prueba; I = inspección; A = análisis; D = demostración. Los criterios se adoptan de la fuente o se proponen como operacionalización; detalles aún no acordados no se consideran cerrados. Una fila puede necesitar más de una prueba. No se equiparan automáticamente los IDs CP-FN/CP-DB de distintas tablas.

## 1. Necesidades y requisitos de sistema originales

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| STK-REQ-001 | Registrar/inscribir estudiante en máximo dos minutos en ventanilla. | D02 P0105, CA-01 | No indicada | Matrícula/UI | T-UAT-01: flujo nominal cronometrado ≤120 s con operador; protocolo pendiente. | I |
| STK-REQ-002 | Confirmar matrícula asigna automáticamente diez mensualidades del ciclo. | D02 P0106, P0056 | No indicada | Matrícula/planes | T-PLAN-01: diez cuotas febrero–noviembre, año correcto y sin duplicados por reintento. | E |
| STK-REQ-003 | Registrar cobro y reflejar inmediatamente nuevo saldo. | D02 P0107 | No indicada | Cobranza/cuenta | T-FIN-01: tras confirmar, cuenta y pago concilian; «inmediato» temporal pendiente. | I |
| STK-REQ-004 | Reportes financieros diarios con recaudación y morosidad. | D02 P0108 | No indicada | Reportes/caja | CP-FN-09/12: totales y deudores cotejados con registros; sin doble conteo. | E |
| STK-REQ-005 | Continuidad y contingencia ante fallos de conectividad/energía/infraestructura. | D02 P0109 | No indicada | Operación | T-REC-01: incidente controlado y restauración; horario y despliegue pendientes. | I |
| SYS-REQ-001 | PostgreSQL con integridad referencial, ACID y trazabilidad de entidades del dominio. | D02 P0112; PM fase 1 | No indicada | Persistencia | I-TEC-01 + T-DB-01: esquema y transacciones del motor aprobado; DEC-01. | C |
| SYS-REQ-002 | Web responsiva para navegadores modernos y WCAG 2.1 AA. | D02 P0113/P0052 | No indicada | UI | T-A11Y-01: revisión automática y manual de teclado, foco, contraste y formularios; navegadores por acordar. | I |
| SYS-REQ-003 | Saldo/historial p95 ≤2 s, ≥100 solicitudes, hasta 20 concurrentes. | D02 P0114, CA-02 | No indicada | API/cuenta | T-PERF-01: medir latencias, errores, carga y hardware; entorno acordado, se propone escenario a 20. | E |
| SYS-REQ-004 | Credenciales y privilegios de cobros/matrículas solo a operarios autorizados. | D02 P0115 | No indicada | Acceso | T-RBAC-01: sin sesión 401, sin permiso 403; matriz definitiva DEC-03. | I |

## 2. Catálogo funcional original (40 registros)

Criterios CP-FR proceden de D02 Anexo F; se mantiene el vínculo individual. La precisión de campos, permisos y casos negativos se ampliará al acordar contratos, sin cambiar el ID original.

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| FR-001 | Registrar estudiante. | D02 P0123–0126; Anexo F | Alta | Estudiantes | CP-FR-001: crear con datos válidos y consultar persistencia. | E |
| FR-002 | Asignar identificador único al estudiante. | D02 P0127–0130; Anexo F | Alta | Estudiantes | CP-FR-002: IDs distintos; clave repetida rechazada. | E |
| FR-003 | Registrar información personal del estudiante. | D02 P0131–0134; Anexo F | Alta | Estudiantes | CP-FR-003: guardar/recuperar valores; campos mínimos y privacidad por acordar. | I |
| FR-004 | Registrar información académica del estudiante. | D02 P0135–0138; Anexo F | Alta | Estudiantes/catálogos | CP-FR-004: grado y año válidos; no incorporar notas fuera de alcance. | E |
| FR-005 | Actualizar información del estudiante. | D02 P0139–0142; Anexo F | Alta | Estudiantes | CP-FR-005: editar campo permitido sin alterar otros; probar permiso y auditoría. | I |
| FR-006 | Buscar estudiante. | D02 P0143–0146; Anexo F | Alta | Estudiantes | CP-FR-006: buscar por ID/nombre, coincidencias y sin resultados. | E |
| FR-007 | Registrar padre o tutor. | D02 P0147–0150; Anexo F | Alta | Tutores | CP-FR-007: registro válido persiste; identidad y duplicados según catálogo acordado. | I |
| FR-008 | Asociar tutor con estudiante. | D02 P0151–0154; D05 RN-01 | Alta | Tutores | CP-FR-008: relación válida; rechazar referencia inexistente; matrícula requiere tutor. | I |
| FR-009 | Registrar información de contacto del tutor. | D02 P0155–0158; Anexo F | Media | Tutores | CP-FR-009: guardar/consultar contacto; formatos por especificar. | I |
| FR-010 | Actualizar información del tutor. | D02 P0159–0162; Anexo F | Media | Tutores | CP-FR-010: contacto actualizado solo por autorizado, historial financiero intacto. | I |
| FR-011 | Registrar año académico. | D02 P0163–0166; Anexo F | Alta | Catálogo escolar | CP-FR-011: crear año y rechazar duplicado bajo regla acordada. | I |
| FR-012 | Registrar grado o nivel escolar. | D02 P0167–0170; Anexo F | Alta | Catálogo escolar | CP-FR-012: registrar/consultar grado/nivel válido. | I |
| FR-013 | Registrar nivel de curso. | D02 P0171–0174; Anexo F | Media | Catálogo escolar | CP-FR-013: relación con grado coherente; resolver significado frente a FR-012. | I |
| FR-014 | Matricular estudiante en año académico. | D02 P0175–0178; Anexo F | Alta | Inscripción | CP-FR-014: asociación permitida única; confirmar inscripción frente a matrícula. | I |
| FR-015 | Asignar grado/nivel a inscripción. | D02 P0179–0182; Anexo F | Alta | Inscripción | CP-FR-015: grado existente y asociación consistente. | E |
| FR-016 | Registrar fecha de inscripción. | D02 P0183–0186; Anexo F | Media | Inscripción | CP-FR-016: fecha persistida y consultable; fecha efectiva/zona por acordar. | I |
| FR-017 | Registrar matrícula. | D02 P0187–0190; Anexo F | Alta | Matrícula | CP-FR-017: matrícula persistida con ID/estado y tutor; transacción sin duplicados. | I |
| FR-018 | Asociar matrícula al grado/nivel correspondiente. | D02 P0191–0194; Anexo F | Alta | Matrícula | CP-FR-018: recuperar grado vinculado y rechazar referencias inválidas. | E |
| FR-019 | Diferenciar matrículas por nivel educativo. | D02 P0195–0198; Anexo F | Alta | Matrícula | CP-FR-019: dos niveles diferenciados correctamente. | E |
| FR-020 | Asociar matrícula al año académico. | D02 P0199–0202; Anexo F | Alta | Matrícula | CP-FR-020: consultar matrícula filtrada por año y validar relación. | E |
| FR-021 | Registrar cuota mensual. | D02 P0203–0206; P0056 | Alta | Planes/cuotas | CP-FR-021 + T-PLAN-01: importe válido; diez cuotas por confirmación sin repetición. | I |
| FR-022 | Asociar cuota a estudiante. | D02 P0207–0210; Anexo F | Alta | Cuotas | CP-FR-022: titular correcto e integridad referencial. | E |
| FR-023 | Asociar cuota a mes académico. | D02 P0211–0214; Anexo F | Alta | Cuotas | CP-FR-023: calendario febrero–noviembre del año correspondiente. | E |
| FR-024 | Registrar vencimiento de cuota. | D02 P0215–0218; D05 §1.2 | Alta | Cuotas/mora | CP-FR-024: vencimiento correcto y fronteras temporales; DEC-04/05. | C |
| FR-025 | Registrar pago. | D02 P0219–0222; Anexo F | Alta | Pagos | CP-FR-025: persistencia atómica de pago válido, detalles y trazabilidad. | I |
| FR-026 | Asociar pago a estudiante. | D02 P0223–0226; Anexo F | Alta | Pagos | CP-FR-026: relación válida y autorización por titular. | E |
| FR-027 | Registrar importe del pago. | D02 P0227–0230; Anexo F | Alta | Pagos | CP-FR-027: decimal exacto, positivo y límites acordados, sin pérdida de centavos. | I |
| FR-028 | Registrar fecha del pago. | D02 P0231–0234; Anexo F | Alta | Pagos | CP-FR-028: fecha/zona horaria efectiva según política pendiente. | I |
| FR-029 | Registrar método de pago. | D02 P0235–0238; Anexo F | Alta | Pagos/medios | CP-FR-029: aceptar catálogo permitido y rechazar método ajeno; catálogo pendiente. | I |
| FR-030 | Aplicar pago a una cuota. | D02 P0239–0242; Anexo F | Alta | Motor financiero | CP-FR-030: saldo anterior menos aplicación exacta; FIFO y transacción. | I |
| FR-031 | Aplicar pago a varias cuotas. | D02 P0243–0246; Anexo F | Alta | Motor financiero | CP-FR-031: orden FIFO, suma exacta y sin sobregiro; empate/excedente pendientes. | I |
| FR-032 | Registrar pago parcial. | D02 P0247–0250; Anexo F | Alta | Motor financiero | CP-FR-032: cuota conserva saldo residual y estado parcial coherente. | E |
| FR-033 | Asociar varios métodos al mismo pago. | D02 P0251–0254; Anexo F | Alta | Pagos/medios | CP-FR-033: suma de medios igual al pago; combinaciones/referencias pendientes. | I |
| FR-034 | Generar recibo de pago. | D02 P0255–0258; P0058 | Alta | Recibos | CP-FR-034: PDF del pago confirmado con datos conciliados. | E |
| FR-035 | Asignar ID único a cada recibo. | D02 P0259–0262; D05 RN-04 | Alta | Recibos | CP-FR-035: IDs/folios no repetidos ni reutilizados; correlativo pendiente. | I |
| FR-036 | Registrar meses que abarca recibo. | D02 P0263–0266; Anexo F | Alta | Recibos | CP-FR-036: desglose multimes coincide con aplicaciones del pago. | E |
| FR-037 | Generar comprobante imprimible. | D02 P0267–0270; Anexo F | Alta | Recibos/UI | CP-FR-037: PDF legible, campos consistentes y reimpresión sin recobro. | E |
| FR-038 | Mora 10% desde día 11 a cuota vencida no saldada. | D02 P0271–0274; D05 RN-03; D12 P0227 | Alta | Mora | CP-FR-038 + CP-FN-06/07: frontera 10/11, una vez; conciliar día 5 y base. | C |
| FR-039 | Reportar estudiantes con cuota vencida y saldo pendiente. | D02 P0275–0278; Anexo F | Alta | Morosidad | CP-FR-039: incluir vencidas con saldo, excluir vigentes/saldadas y conciliar totales. | E |
| FR-040 | Resumen de arqueo diario de pagos de la jornada. | D02 P0279–0282; Anexo F | Alta | Caja/reportes | CP-FR-040: suma por jornada concilia con medios, recibos y reversiones; corte pendiente. | I |

## 3. Catálogo no funcional original (13 registros)

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| NFR-001 | Acceso autenticado por usuario. | D02 P0499–0503 | Alta | Acceso | T-NFR-001: sin sesión/credencial inválida no accede; válida accede según permiso. | E |
| NFR-002 | Restricción de funciones según rol. | D02 P0504–0508; D08 §III parte II | Alta | Acceso | T-NFR-002: positivos/negativos por operación y recurso; DEC-03. | C |
| NFR-003 | Preservar integridad de pagos. | D02 P0509–0513 | Alta | Persistencia/pagos | T-NFR-003: fallo parcial, concurrencia e idempotencia sin descuadre. | E |
| NFR-004 | Impedir modificación de pagos completados. | D02 P0514–0518; D12 §3.8 | Alta | Pagos/auditoría | T-NFR-004: UPDATE/DELETE denegados; reverso separado conserva original; DEC-08. | I |
| NFR-005 | Saldo/historial p95 ≤2 s con ≥100 solicitudes y hasta 20 concurrentes. | D02 P0519–0523; D10 CP-PERF-01 | Media | Cuenta/API | T-NFR-005: reporte reproducible de p95/carga/errores; mantener separado objetivo <1 s. | C |
| NFR-006 | Disponibilidad en horario escolar de operación. | D02 P0524–0528 | Alta | Operación | T-NFR-006: bitácora sobre horario/ventana/mantenimiento acordados, todavía indefinidos. | I |
| NFR-007 | Mensajes de validación ante formato inválido. | D02 P0529–0533 | Alta | UI/API | T-NFR-007: casos inválidos muestran error comprensible sin persistir dato incorrecto. | E |
| NFR-008 | Interfaz consistente entre módulos. | D02 P0534–0538 | Media | UI | I-NFR-008: navegación, formularios, tablas y mensajes según guía visual acordada. | I |
| NFR-009 | Proteger credenciales almacenadas y durante autenticación. | D02 P0539–0543; D08 SEC-REQ-02 | Alta | Acceso | T-NFR-009: hashes salteados, TLS y ausencia de secretos en respuestas/logs. | E |
| NFR-010 | Respaldos que garanticen RPO ≤1 hora. | D02 P0544–0548; D08 P0692 | Alta | Recuperación | T-NFR-010: recuperación medida con pérdida ≤1 h, no solo existencia de dump nocturno. | C |
| NFR-011 | Restaurar servicio/BD con RTO ≤30 minutos. | D02 P0549–0553; D08 P0596 | Alta | Recuperación | T-NFR-011: cronómetro hasta servicio íntegro operativo ≤30 min; no sustituir por 2 h. | C |
| NFR-012 | Auditar autenticación, pagos, estados y operaciones críticas con fecha/usuario/resultado. | D02 P0554–0558 | Alta | Auditoría | T-NFR-012: eventos positivos/negativos, permisos de lectura y resistencia a modificación. | I |
| NFR-013 | Operación hasta 300 estudiantes y crecimiento a cinco años. | D02 P0559–0563 | Alta | Capacidad | A-NFR-013 + T-PERF-01: dataset 300, volumetría y crecimiento registrados; no inferir padrón real. | E |

## 4. Reglas transversales identificadas

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| RN-SGPM-01 | Tutor obligatorio y relaciones válidas. | D05 RN-01/P0145; D02 P0055 | No indicada | Matrícula/tutores | T-RN-01: rechazar matrícula sin tutor/activo según decisión; permitir hermanos. | I |
| RN-SGPM-02 | Diez cuotas febrero–noviembre, generación idempotente. | D02 STK-REQ-002/Anexo I; PM fase 5 | No indicada | Planes | T-RN-02: reintento y error intermedio no crean plan parcial/duplicado. | I |
| RN-SGPM-03 | FIFO por vencimiento, sin saltos. | D05 RN-02; D07 P0347 | No indicada | Motor | T-RN-03: varias deudas, empate y años; resolver alcance y desempate primero. | I |
| RN-SGPM-04 | Pagos total/parcial/multicuota sin saldo negativo. | D02 FR-030–032/CA-03 | Alta (FR vinculados) | Motor | T-RN-04: completo, parcial, saldo cero y remanente; total excedido pendiente. | I |
| RN-SGPM-05 | Mora única sobre base, 10% desde día 11. | D05 RN-03/P0227; D12 FUN-04 anexo D | No indicada | Mora | T-RN-05: días 10/11, meses/años, ya pagada, abono previo y repetición. | C |
| RN-SGPM-06 | No borrar operación/recibo; reversión autorizada vinculada. | D05 RN-04; D12 PN-1; PM fase 7 | No indicada | Pagos/reversiones | T-RN-06: original íntegro, actor/motivo/fecha/referencia y saldos conciliados. | I |
| RN-SGPM-07 | Igualdad pago–medios–aplicaciones–recibo. | D07 P0128; D02 CP-FR-033; D09 §XIII | No indicada | Pagos/conciliación | T-RN-07: diferencias exactas 0, con pagos mixtos y reversiones; no beca como caja. | E |
| RN-SGPM-08 | Dinero exacto, no FLOAT/DOUBLE. | PM fase 2/6; D09 §§IV/VI | Obligatoria (PM) | Motor/persistencia | T-RN-08: metadatos DECIMAL/NUMERIC, centavos y acumulaciones exactas. | I |
| RN-SGPM-09 | Recibo único con desglose; emisión no vuelve a modificar saldo. | D02 FR-034–037; PM fase 7 | Alta (FR vinculados) | Recibos | T-RN-09: fallo/reintento PDF y reimpresión no duplican pago ni aplicaciones. | I |
| RN-SGPM-10 | Preservar historia y restringir borrado de personas vinculadas. | D09 §V; PM fase 4 | Obligatoria (PM) | Datos | T-RN-10: DELETE padre con historial se rechaza, sin huérfanos. | E |
| RN-SGPM-11 | No derivar tarifas del presupuesto de desarrollo. | PM regla 11; D12 §3.6/Anexo N; D13 Supuestos | Obligatoria (PM) | Tarifas | I-RN-11: semillas/configuración productiva no usan supuestos sin reglamento aprobado. | E |
| RN-SGPM-12 | Validar datos y confirmar titular antes del cobro. | PM regla 5; D02 Anexo B; D05 P0303 | Obligatoria (PM) | UI/API | T-RN-12: monto ≤0 y titular manipulado rechazados en backend; UI confirma identidad. | I |

## 5. Restricciones técnicas y controles adicionales

Los controles SEG amplían NFR-001/002/009/012, no los reemplazan. Cifras de D08 conservadas con su condición documental; no se interpretan como valores ya verificados.

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| TEC-01 | Separación por capas: React/TypeScript, Node/Express, persistencia relacional. | D02 §§1.3/3.2; D03 ADR-001 | No indicada | Arquitectura | I-TEC-01: UI sin SQL, dominio sin HTTP/driver, contratos definidos; versiones verificables. | E |
| TEC-02 | Fijar motor vigente antes de migraciones. | PM fase 1/2; D03 §18.1; D04 P0029 | Obligatoria (PM) | Persistencia | I-TEC-02: DEC-01 aprobada y documentación/driver/DDL coherentes. | C |
| TEC-03 | Migraciones, claves, restricciones, índices y datos ficticios separados. | PM fase 2; D09 §§IV/V | Obligatoria (PM) | Base de datos | T-TEC-03: instalación limpia, PK/FK/UNIQUE/NOT NULL y prueba de rollback. | E |
| TEC-04 | Control de concurrencia en escrituras financieras. | PM regla 4; D09 §VII; D08 SEC-REQ-03 | Obligatoria (PM) | Transacciones | T-TEC-04: dos sesiones/fallo parcial; aislamiento y estrategia de reintento documentados. | I |
| TEC-05 | Diagnóstico, errores centralizados y configuración externa reproducible. | PM fase 1; D11 §VIII | Obligatoria (PM) | Plataforma | T-TEC-05: diagnóstico con/sin BD; arranque inválido falla sin secretos expuestos. | E |
| TEC-06 | Despliegue local/remoto/híbrido aprobado y compatible. | PM fase 12; D03 ADR; D11 P0428 | Obligatoria (PM) | Infraestructura | T-TEC-06: inventario/proveedor, runtime persistente, datos, TLS y restauración comprobados. | I |
| TEC-07 | BD accesible solo desde backend/administración autorizados. | D11 P0388/P0431; D09 §IX | No indicada | Red/BD | T-TEC-07: conexión cliente/Internet bloqueada y cuenta mínima backend válida. | E |
| SEG-01 | Validación backend de cuerpo, parámetros y consulta; salida segura XSS. | D08 §IV/SEG-01; PM regla 5 | Obligatoria (PM) | API/UI | T-SEG-01: payloads malformados/maliciosos no persisten ni ejecutan scripts. | E |
| SEG-02 | SQL parametrizado y cuenta de mínimo privilegio. | D08 §V/SEG-02; D09 §IX | Obligatoria (PM) | Repositorios | T-SEG-02: SQLi como dato, identificadores en lista permitida, DDL denegado a app. | E |
| SEG-03 | bcrypt costo ≥12; 14 es objetivo. | D08 SEC-REQ-02/P0090 | No indicada | Credenciales | T-SEG-03: hashes salteados y verificación válida/inválida; medir costo real. | E |
| SEG-04 | Protección tras 5 fallos en 15 minutos. | D08 SEC-REQ-05/P0102/P0128 | No indicada | Autenticación | T-SEG-04: ventana, umbral y desbloqueo; conciliar cuenta/IP/intentos fallidos. | I |
| SEG-05 | JWT firmado/cookies HttpOnly, Secure, SameSite; expiración y revocación. | D08 SEC-REQ-01/§VII/P0683/anexos | No indicada | Sesiones | T-SEG-05: expiración, cierre, revocación, flags y solicitudes CSRF; duraciones por ratificar. | I |
| SEG-06 | Autorización por operación y pertenencia de recurso; denegación por defecto. | D08 §VII/parte II §VI.3; PM fase 3 | Obligatoria (PM) | Acceso | T-SEG-06: matriz positiva/negativa, IDs manipulados, privilegios y familias distintas. | C |
| SEG-07 | Secretos externos, plantilla sin credenciales, escaneo de historial. | D08 §VIII/P0979; PM regla 11 de calidad | Obligatoria (PM) | Configuración | I-SEG-07: escaneo sin secretos activos y rotación si corresponde; log anonimizado. | E |
| SEG-08 | TLS, CORS restrictivo y cabeceras HTTP seguras. | D08 SEG-10/P0685; PM fase 3/12 | Obligatoria (PM) | HTTP/red | T-SEG-08: orígenes permitidos/denegados, TLS y cabeceras; no tratar CORS como autenticación. | E |
| SEG-09 | Errores y logs sin secretos ni PII innecesaria. | D08 §IX/P0991; PM fase 10 | Obligatoria (PM) | Logs/API | T-SEG-09: error inducido no expone SQL/stack/token/cédula; acceso restringido. | E |
| SEG-10 | Auditoría financiera protegida con actor, tiempo, acción y resultado. | D02 NFR-012; D08 SEC-REQ-04/parte II §V.4 | Alta (NFR) | Auditoría | T-SEG-10: cobro/anulación/permisos/tarifa generan evento; usuario ordinario no edita. | I |
| SEG-11 | Lockfile, revisión de licencias y escaneo de dependencias. | D08 §X/anexos; D12 §9 | Obligatoria (PM calidad) | Cadena de suministro | I-SEG-11: manifiesto/lock, reporte fechado y tratamiento de vulnerabilidades. | E |
| SEG-12 | Entornos separados y datos sintéticos; sin datos de menores en IA pública. | D08 P0689; D12 §8.3/9.3; PM | Obligatoria (PM) | QA/privacidad | I-SEG-12: guardas de BD test y semillas; no credenciales/productivo en ensayos. | E |
| SEG-13 | Backups protegidos, retención, acceso y restauración ensayada. | D08 SEG-09; D02 NFR-010/011 | Alta (NFR) | Recuperación | T-SEG-13: restaurar copia cifrada independiente con checksum e integridad/RPO/RTO. | I |
| SEG-14 | Inventario, riesgos, respuesta a incidentes, formación y responsables. | D08 parte II §§II–IV/matriz final | No indicada | Gobierno/operación | I-SEG-14: política, matriz riesgo–control–responsable–evidencia, simulacro y actas reales. | I |

## 6. Calidad y gobierno de desarrollo

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación / prueba prevista | Estado |
|---|---|---|---|---|---|---|
| CAL-01 | SOLID aplicable, reglas centrales y contratos verificables. | D07 §§IX/X; PM calidad | Obligatoria (PM) | Arquitectura | I-CAL-01 + T-CONTRATO-01: componentes reales, responsabilidades, dependencias y pruebas de sustitución. | E |
| CAL-02 | Cobertura financiera ≥85% líneas, ramas y funciones. | D10 P0070; D03 P0334 | No indicada | QA/motor | T-CAL-02: reporte de las tres métricas vinculado a versión; distinguir meta >80% general. | I |
| CAL-03 | Complejidad ≤10, duplicación <3%, mantenibilidad >85 como metas documentales. | D08 P0281–0301; D07 §IX | No indicada | Calidad | A-CAL-03: definir herramienta/alcance y medir; no atribuir valores al producto actual. | P |
| CAL-04 | Pruebas unitarias, integración, sistema, seguridad, concurrencia, carga, recuperación y UAT. | PM fase 11; D09/D10 | Obligatoria (PM) | QA | T-CAL-04: casos con esperado/real, comandos, entorno, versión, salida y responsable. | E |
| CAL-05 | Usabilidad medible con operadores y accesibilidad. | D02 SYS-REQ-002/CA-01; D05 tabla 4; D10 CP-USA; D12 §8 | No indicada | UI/UAT | T-CAL-05: tareas y errores registrados; tiempos de aprendizaje/atención pendientes de conciliación. | C |
| CAL-06 | Objetivos de PDF, memoria, pago y disponibilidad adicionales por negociar. | D10 CP-PERF-02/04; D12 anexos D/M | No indicada | Rendimiento/operación | T-CAL-06: definir límites y entorno: PDF 1.5 s, pago 3 s o flujo con PDF 4 s, 99% propuesto. | P |
| GOB-01 | Kanban con preparado WIP 3, desarrollo 2, verificación 2, DoR/DoD y bloqueos. | D04 §§4.2–4.3 | No indicada | Proceso | I-GOB-01: tablero/historial real con requisito, aceptación, responsable, dependencias y evidencias. | E |
| GOB-02 | Métricas de flujo calculadas desde historial real. | D04 §§4.4–4.5 | No indicada | Proceso | A-GOB-02: lead/cycle time, throughput, WIP, bloqueos/antigüedad sin cifras inventadas. | E |
| GOB-03 | Control de cambios con fuente, impacto, decisión y trazabilidad. | D02 §4.3/Anexo C; PM §2 | Obligatoria (PM) | Gobierno | I-GOB-03: cambio registrado y aprobado por Dirección/cobros/equipo según competencia. | E |
| GOB-04 | Trabajo por fases con informe, estado y autorización para continuar. | PM §4/§8 | Obligatoria (PM) | Gobierno | I-GOB-04: informe con pruebas/limitaciones y continuación explícita antes de otra fase principal. | E |
| GOB-05 | Instalación, API, manuales, operación, respaldo y entrega reproducibles. | PM fases 1/12/13; D12 §§9–10 | Obligatoria (PM) | Documentación | I-GOB-05: documentación coincide con versión real; instalación desde cero ensayada. | E |
| GOB-06 | Propiedad/licencia, privacidad y mantenimiento formalizados. | D12 §9/anexos K/O; D13 Legal y contratos | No indicada | Legal/operación | I-GOB-06: instrumentos auténticos, inventario de licencias y responsable; no confundir borrador/firma. | I |
| GOB-07 | Auditoría final según rúbrica aportada y cuatro categorías del PM. | PM fase 14 | Obligatoria (PM) | Auditoría | I-GOB-07: criterio, evidencia y estado; obtener informe genérico faltante. | I |
| GOB-08 | Calidad no se presume por README, ejemplos o certificación ISO inexistente. | PM reglas 7/§6; D08/D10 anexos | Obligatoria (PM) | Evidencias | I-GOB-08: separar especificación, implementación, ejecución y aceptación. | E |

## 7. Capacidades condicionales y exclusiones controladas

No se omiten las menciones periféricas: se registran como candidatos para evitar convertir ejemplos en alcance autorizado.

| ID | Requisito/candidato | Fuente | Prioridad | Módulo | Criterio previo a implementar | Estado |
|---|---|---|---|---|---|---|
| CAND-01 | Becas, descuentos, exoneraciones y pronto pago/hermanos. | D05 CU-01 alternativo; D07 §OCP | No indicada | Tarifas | Política aprobada: beneficiario, porcentaje, vigencia, acumulación, base y autorización. DEC-07. | P |
| CAND-02 | Portal de consulta de tutores. | D05 CU-05; D08 cinco roles; D11 permisos | No indicada | Portal | Ratificar inclusión y pertenencia, recuperación de acceso y límites de datos. DEC-03. | P |
| CAND-03 | Cargos extraordinarios y matrícula como obligación financiera. | D05 P0038; D12 PN-1 | No indicada | Obligaciones | Conceptos, importes, generación y prioridad frente a mensualidades aprobados. DEC-12. | P |
| CAND-04 | Gestión de tarifas y cambios de parámetros financieros. | PM fases 2/10; D07/D08 año lectivo | No indicada | Configuración | Catálogo versionado y autoridad aprobados, sin alterar retroactivamente recibos. | I |
| CAND-05 | Exportaciones PDF/CSV/Excel y reportes adicionales. | PM fase 8; D07 OCP; D12 PN-1 | No indicada | Reportes | Lista/formatos/campos autorizados; no asumir Excel por ejemplo de patrón. DEC-13. | P |
| CAND-06 | Apertura/cierre formal de caja, conteo, diferencias y reapertura. | D01 sección 5 tabla 10; D12 PN-1 | No indicada | Caja | Ratificar diferencia frente a simple resumen FR-040 y protocolo de conciliación. | P |
| CAND-07 | Migración de Eleventa y saldos iniciales. | D12 riesgo R12/P1060–1065 | No indicada | Migración | Exportación autorizada, mapeo, conciliación y aceptación de saldos; no hay datos aportados. | P |
| CAND-08 | Recuperación segura de acceso, gestión de usuarios y roles. | PM fase 3; D08 anexos | Obligatoria (PM fase 3) | Acceso | Canal de recuperación, verificación de identidad y permisos acordados; no contraseña por defecto. | I |
| CAND-09 | Notificaciones correo/SMS/WhatsApp y predicción de cobro. | D07 ejemplos y recomendaciones; D02 §4.2 | No indicada | Integraciones | Fuera del núcleo actual; solo mediante cambio aprobado y evaluación de privacidad/costos. | P |
| CAND-10 | Firma o sello digital con validez jurídica en recibo. | D10 CP-FN-08; D08 parte II; D12 Ley 729 | No indicada | Recibos/legal | Precisar autenticidad técnica frente a firma legal, certificados y autoridad. DEC-10. | P |

Exclusiones explícitas: pasarela en línea, notas, asistencia, inventario de uniformes/libros, nómina y contabilidad general (D02 §1.3; D05 §1.2). Los ejemplos con tarjeta o pasarela no constituyen autorización de integración. No se eliminan IDs originales FR-013/014/017 por aparente redundancia: su relación debe resolverse y preservarse.

## 8. Correspondencia entre niveles y evidencia futura

| Origen | Obligaciones software principales | Diseño lógico previsto | Casos a relacionar |
|---|---|---|---|
| STK-REQ-001 | FR-001–020; SYS-REQ-002 | Estudiantes, tutores, catálogos y matrícula | CP-FR-001–020; CP-FN-01/02; T-UAT-01 |
| STK-REQ-002 | FR-021–024; RN-SGPM-01/02 | Generación de planes transaccional | CP-FR-021–024; T-PLAN-01; T-RN-02 |
| STK-REQ-003 | FR-025–038; NFR-003/004 | Cobranza, medios, aplicaciones, mora y recibos | CP-FR-025–038; CP-FN-03–08; T-RN-03–09 |
| STK-REQ-004 | FR-034–040; NFR-012 | Recibos, cuenta, morosidad y caja | CP-FR-034–040; CP-FN-09–12; T-NFR-012 |
| STK-REQ-005 | NFR-006/010/011 y controles transversales | Continuidad, respaldo y recuperación | T-NFR-006/010/011; T-REC-01 |
| SYS-REQ-001–004 | NFR-001–013; TEC/SEG/CAL aplicables | Capas, persistencia, seguridad y UI | Casos T/I/A correspondientes de esta matriz |

Relaciones de esta tabla son consolidación propuesta por contenido, no equivalencia automática con la RTM defectuosa de otros documentos. Falta completar, sin inventar rutas:

`ID → componente real → ruta/función/migración → versión/commit → archivo y caso de prueba → ejecución → resultado → evidencia → aprobador`.

La revisión inversa comprobará que cada componente implementado tenga origen aprobado. Las pruebas de controles transversales deben cubrir cada operación crítica, no solo un endpoint representativo.

## 9. Evidencia local de implementación y ejecución (FASE 5, 2026-11-10)

Registro de ejecución real, **independiente** de los estados documentales E/C/I/P de las secciones anteriores. Medio de medición: PostgreSQL 16.15 sobre socket Unix (nunca TCP), base `sgpm_auth_test`, suite de `backend` en modo serial. Resultado agregado del lote `sgpm-fase5-cierre-v3`: **218 tests, 218 PASS / 0 FAIL / 0 SKIP, 11 archivos, exit 0**; typecheck de `src` exit 0; typecheck estricto de `src` + tests exit 0; migraciones 001..008 por CLI (limpia, reaplicada, upgrade desde 001..007 y restauración) las cuatro con exit 0. Evidencia completa: `.tmp/test-artifacts/sgpm-fase5-cierre-v3/` e [INFORME_FASE_5.md](INFORME_FASE_5.md).

| ID de la matriz | Componente local real (ruta / migración) | Prueba ejecutada (resultado real) | Estado local |
|---|---|---|---|
| FR-014 | `backend/src/routes/matriculas.routes.ts` (`POST /api/matriculas`), `backend/src/services/matricula.service.ts`, `database/migrations/001_create_base_tables.sql` (`UNIQUE (estudiante_id, anio_lectivo_id)`) | `backend/tests/auth/matriculas.test.ts`: alta 201 con plan y cuotas; `POST duplicado estudiante+anio -> 409`; `duplicado concurrente: 2 POST -> 1x201 + 1x409, solo 1 plan` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-015 | Validación de `grado_id` contra el año lectivo en `matricula.service.ts` | `matriculas.test.ts`: `POST ... grado inactivo o fuera de año -> 400`; `idempotency_key reutilizada con otro grado -> 409` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-016 | `fecha_matricula` validada (`fechaEstricta`, sin normalización de `Date`) en `backend/src/validators/matricula.schema.ts` | `matriculas.test.ts`: `POST fecha inválida ... -> 400` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-017 | Alta transaccional de matrícula + plan + N cuotas + auditoría con el mismo `PoolClient` (`matriculas.routes.ts` → service → repository) | `matriculas.test.ts`: `POST N10 -> 201, 1 matricula, 1 plan, 10 cuotas, auditoria y snapshot tarifario`; `fallo de cuota via trigger -> ROLLBACK total (cero residuos)` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-018 | `grado_id` con integridad referencial (`REFERENCES grados(id)`, migración 001) y grado recuperado en el detalle y el historial | `matriculas.test.ts`: casos de grado inválido/inalcanzable (400/404) y `historial -> 200 con plan/cuotas/auditoria` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-019 | Diferenciación por nivel a través del catálogo `grados`/`anio_lectivo` (grado pertenece al año) | `matriculas.test.ts`: `POST ... grado fuera de año -> 400` | IMPLEMENTADA Y PROBADA (PASS); cardinalidad grado/nivel/curso sigue pendiente de glosario (DEC-11) |
| FR-020 | Filtro `anio_lectivo_id` en el listado y validación del año activo y su rango | `matriculas.test.ts`: `GET listado con filtros activo=false y paginación`; `POST ... año inactivo o fuera de rango -> 400` | IMPLEMENTADA Y PROBADA (PASS) |
| FR-021 | Generación de N cuotas con `monto NUMERIC` transportado como cadena exacta (`matriculas-migrations.test.ts`, migraciones 001/007/008) | `matriculas.test.ts`: plan con N cuotas y conteos exactos; `POST ... fecha de calendario duplicada -> 409` | MECANISMO IMPLEMENTADO Y PROBADO (PASS). **El valor institucional «diez cuotas febrero–noviembre» NO está adoptado:** `planes_pago.total_cuotas` quedó `NOT NULL` sin default (migración 008) y el número de cuotas llega de la petición; los valores de las pruebas son datos de prueba |
| RN-SGPM-02 | Generación idempotente de plan y cuotas (advisory lock + `idempotency_key` + índice único parcial `uq_matriculas_idempotencia_actor`) | `matriculas.test.ts`: `POST idempotency_key replay -> 200 misma matricula/plan y sin filas nuevas`; `fallo de cuota via trigger -> ROLLBACK total` | MECANISMO IMPLEMENTADO Y PROBADO (PASS); calendario feb–nov y número de cuotas pendientes (DEC-04/DEC-05) |
| STK-REQ-002 | Ídem RN-SGPM-02 (plan transaccional sin duplicados por reintento) | Ídem RN-SGPM-02 | MECANISMO IMPLEMENTADO Y PROBADO (PASS); política de diez mensualidades NO adoptada |
| TEC-03 | Migraciones 001..008 versionadas y aditivas; instalación limpia, reaplicación y upgrade | `.tmp/test-artifacts/sgpm-fase5-cierre-v3/results.json`: `cli-clean`, `cli-idempotent`, `cli-upgrade`, `cli-restore`, los cuatro exit 0; `backend/tests/auth/matriculas-migrations.test.ts` | IMPLEMENTADA Y PROBADA (PASS) |
| TEC-04 | Advisory lock `pg_advisory_xact_lock(4315003)` + unicidades de BD en escrituras de matrícula | `matriculas.test.ts`: `duplicado concurrente: 2 POST -> 1x201 + 1x409` | IMPLEMENTADA Y PROBADA (PASS) para matrícula; motor financiero (FASE 6) no iniciado |
| SEG-01 | Schemas Zod estrictos en `backend/src/validators/matricula.schema.ts` (campos desconocidos, IDs inseguros, formato de fecha) | `matriculas.test.ts`: `POST DTO desconocido -> 400`; `POST IDs inseguros -> 400`; `PATCH campo desconocido -> 400`; `idempotency_key invalida -> 400` | IMPLEMENTADA Y PROBADA (PASS) |
| SEG-02 | SQL parametrizado en `backend/src/repositories/matricula.repository.ts` (incluido el filtro del historial) | `matriculas.test.ts` y `matriculas-migrations.test.ts`; inspección de código por revisión y seguridad (PASS) | IMPLEMENTADA Y PROBADA (PASS) |
| SEG-06 | Permisos por operación `matriculas:read` / `matriculas:manage`, denegación por defecto | `matriculas.test.ts`: `anonymous GET /api/matriculas -> 401`; `user without matriculas:read -> 403 on GET /api/matriculas`; `historial -> 403 para actor sin matriculas:read`; `POST without CSRF header -> 403`; `estudiantes.test.ts` RC-01/RC-01b (403 con solo lectura, 403 con solo roles, 201 con solo `manage`) | MECANISMO IMPLEMENTADO Y PROBADO (PASS) en las lecturas; `requirePermission(matriculas:manage)` aplicado en las mutaciones por código. Matriz institucional definitiva pendiente (DEC-03) |
| NFR-012 / SEG-10 | Auditoría de `matricula_crear` / `matricula_actualizar` en la misma transacción, consultable por `GET /:id/historial` | `matriculas.test.ts`: `historial -> 200 ... auditoria` y `historial tras desactivar conserva las mismas cuotas y auditoria` | IMPLEMENTADA Y PROBADA (PASS) para matrículas; retención y alcance de eventos pendientes (DEC-18) |
| RN-SGPM-10 | `PATCH /:id/desactivar` (baja lógica) conservando plan, cuotas e historial | `matriculas.test.ts`: `PATCH desactivar conserva obligaciones e historial` | IMPLEMENTADA Y PROBADA (PASS) |

Filas **no verificadas** en este lote (se dejan constancia en lugar de asumir resultado): FR-011/012/013 (catálogo escolar: no se implementaron endpoints de año/grado en la FASE 5), FR-022/023/024 (cuota mensual, mes académico y vencimiento: estructura creada, calendario y política pendientes), FR-025–040, NFR-003/004/005/006/010/011/013, RN-SGPM-03–09, TEC-05/06/07, SEG-03/04/05/07/08/09/11/12/13/14, CAL-02/03/05/06 y CAND-01–10. Para esas filas mantiene vigencia el enunciado conservado en «Convenciones»: implementación local no iniciada o no ejecutada, prueba no ejecutada, resultado real **NO EJECUTADO**.

