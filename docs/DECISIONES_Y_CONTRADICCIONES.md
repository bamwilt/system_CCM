# Decisiones y contradicciones del SGPM

Fecha de apertura: 2026-11-06. Versión 0.1. **Ninguna propuesta de este registro implica aprobación institucional.** Los originales permanecen sin cambios. Fuentes: [inventario](INVENTARIO_DOCUMENTAL.md).

## Procedimiento de decisión

Para cada diferencia se identifican fuentes, vigencia, alternativas, dependencia e impacto. Dirección y responsable de cobros ratifican políticas y alcance; equipo técnico propone mecanismos; responsable jurídico valida contratos y conservación. Son responsables propuestos por función, no personas que hayan aceptado un encargo. Cierre requiere fecha, decisor, alternativa elegida, justificación, evidencia y artefactos actualizados. Hasta entonces se detiene únicamente la implementación afectada; el análisis independiente puede continuar.

## Registro

### DEC-01 — Motor de base de datos (esencial antes de fase 1)

- **Fuentes:** PM fases 1–2: MySQL/InnoDB. D04 P0029/0047/0066 mantiene MySQL. D02 P0051/0112 y Anexo C, D03 ADR-001 y §18.1, D08/D09/D11/D12: PostgreSQL (18 en arquitectura). D03 dice expresamente que sustituye MySQL del texto anterior. No son todos documentos históricos: el conflicto está dentro de V2 y del prompt vigente.
- **Alternativas:** A) PostgreSQL según SRS/arquitectura V2, corrigiendo instrucciones técnicas afectadas; B) MySQL/InnoDB mediante cambio explícito a SRS/arquitectura/planes de pruebas; C) soportar ambos, ampliación de esfuerzo no recomendada sin necesidad.
- **Propuesta:** A, por prioridad de la arquitectura documental vigente; **no adoptada** mientras el solicitante no confirme cómo conciliar el PM. No portar ejemplos ni instalar driver de forma silenciosa.
- **Dependencias:** driver, DDL, migraciones, aislamiento, errores SQL, backups, CI y hosting. Datos de negocio y análisis de interfaz pueden definirse sin motor.
- **Responsable de cierre propuesto:** solicitante + responsable técnico; aprobación de cambio institucional cuando proceda. **Estado: RESUELTA POR SOLICITANTE (sesión de documentación): PostgreSQL, según la señal «psql»; las fuentes originales MySQL siguen contradictorias. El estado documental C no se reclasificó sin criterio; permanece abierta la ratificación institucional.**
- **Nota histórica (sesión `sgpm-fase0-correccion-01` — intento runtime1, ronda documental 2/2):** el estado original de este registro permanecía **PENDIENTE**; se menciona como histórico y la resolución reciente responde solo al solicitante, sin timestamp independiente; no se inventó fecha de aprobación institucional.

### DEC-02 — Archivo de diseño duplicado y documentos ausentes

- **Fuentes:** D06 y D11 tienen el mismo SHA-256 y texto de red, no diseño. D01 §5/P2782–3393 contiene diseño y declara fuente interna v2; el contenedor se llama v1. PM pide informe genérico `(1).md`, D02 cita `(2).md`; ninguno está disponible localmente. D13 podría ser el «Modelo Financiero y Técnico», sin equivalencia explícita.
- **Alternativas:** entregar diseño V2 independiente correcto y rúbrica; o confirmar por escrito D01 §5 como copia vigente y la equivalencia de D13, aportando la rúbrica después. No sustituir D06 ni renombrar originales unilateralmente.
- **Propuesta:** usar D01 §5 solo como referencia provisional, priorizando D02/D03 y preservando su condición. Solicitar fuentes correctas y revisar imágenes UML.
- **Impacto:** impide afirmar exhaustividad documental/cierre de fase 0 y preparar auditoría final íntegra; no impide catalogar la SRS.
- **Responsable:** custodio documental/solicitante. **Estado: PENDIENTE DE FUENTES/CONFIRMACIÓN.**

### DEC-03 — Roles, segregación y portal de tutores

- **Fuentes:** D02 identifica Dirección, administradora y tutores indirectos. D08 P0588–0593 propone cinco perfiles: Padre, Secretaría, Tesorería, Administrador sin cobros, Auditor. D11 P0215–0232 propone Dirección con acceso total, Ventanilla y Tutor. D01 P3264–3266 describe cuatro roles del repositorio: Administrador, Secretaría, Docente, Consulta; D03 pide probar cuatro roles sin fijar matriz.
- **Alternativas:** cinco perfiles segregados; perfiles mínimos de Dirección/Ventanilla sin portal; adaptar cuatro perfiles del repositorio mediante una matriz explícita. Presencia en README no decide alcance.
- **Propuesta:** matriz por operación con denegación por defecto y separación de administración/cobro; decidir portal y quién autoriza becas/anulaciones. No elegir cantidad/nombres arbitrariamente.
- **Bloquea:** RBAC definitivo, usuarios/sesiones por perfil y portal; permite definir mecanismos de autorización genéricos después de aprobar fase 1.
- **Responsable:** Dirección + cobros. **Estado: PENDIENTE DE APROBACIÓN.**

### DEC-04 — Vencimiento, mora y ejemplos incompatibles

- **Fuentes:** D02 FR-038/CA-04 y D05 RN-03 establecen vencimiento día 10 y mora 10% desde día 11; D05 P0227 especifica una sola vez sobre monto base. D12 P0227 y Anexo D FUN-04 dicen después del día 5. D05 ejemplo P0336–0342 paga en abril deudas de febrero/marzo sin mora; no acredita una exención. Las expresiones OCL/ejemplos que miran solo el número de día omiten mes/año y no bastan como algoritmo.
- **Alternativas:** día 11 según SRS y arquitectura; día 6 mediante cambio institucional; otra política aprobada.
- **Propuesta técnica:** mantener día 11 como referencia de especificación y señalar día 5 como discrepancia, no reescribir fuente. Ratificar efectos de abonos previos, becas/base, exención, fechas históricas y no capitalización. No tratar el ejemplo sin mora como política.
- **Bloquea:** motor de mora y aceptación financiera hasta ratificación. **Responsable:** Dirección/cobros. **Estado: PROPUESTA SIN APROBACIÓN.**

### DEC-05 — Moneda, tarifas, redondeo y tiempo

- **Fuentes:** D02 Anexo B usa C$; D05/D10 ejemplos `$`; D09 propone DECIMAL(10,2) y centavos; D12/D13 usan USD para presupuesto, C$500 mensual/C$600 matrícula como supuestos no certificados. Ningún presupuesto determina arancel operativo (PM regla 11).
- **Alternativas:** única moneda operativa C$; multimoneda con reglas de conversión institucionales; otra moneda documentada. Redondeo por concepto o total, modo y momento deben acordarse; no inferirlos de `Math.round` de un ejemplo.
- **Propuesta:** solicitar reglamento de tarifas por grado/año, moneda, escala/límites, zona horaria, corte diario, vencimiento y fecha efectiva. Usar aritmética exacta independientemente de la decisión. No fijar C$500/C$600 como semillas productivas.
- **Bloquea:** importes finales, mora, tarifas, recibos y caja. **Responsable:** cobros/contabilidad/Dirección. **Estado: INCOMPLETO.**

### DEC-06 — FIFO: desempate, años y excedentes

- **Fuentes:** D02 P0101/CA-03, D05 RN-02 y D07 P0347: orden por vencimiento; D07 P0128 contempla deuda de ciclo actual antes de posterior. D10 §III define montos válidos ≤deuda total; su endpoint ilustrativo rechaza excedente. D05 CU-02 permite sobrante a siguiente cuota, no necesariamente excedente sobre deuda total. PM prohíbe inventar excepciones.
- **Alternativas para excedente total:** rechazar; recibir solo deuda y devolver cambio; saldo a favor. **Desempate:** ID de obligación estable u otra prioridad institucional. **Alcance:** plan/año o toda deuda del estudiante.
- **Propuesta:** FIFO por vencimiento como regla conocida; decisión explícita sobre empate, cuotas futuras, años previos y cargos extraordinarios. Solicitar casos con importes y estados esperados antes de implementar. No confundir sobrante entre cuotas con crédito global.
- **Bloquea:** servicio de aplicación y pruebas financieras de borde. **Responsable:** cobros/Dirección con propuesta técnica. **Estado: PENDIENTE.**

### DEC-07 — Descuentos, becas y exoneraciones

- **Fuentes:** D05 CU-01 alternativo contempla porcentaje autorizado antes del plan. D07 ejemplos hablan de 15% hermanos, 10% pronto pago, 50% beca y 25% convenio; no son reglamento. D07 P0350 suma descuento al efectivo en ejemplo, lo que no autoriza contabilizarlo como dinero cobrado.
- **Alternativas:** beca al generar plan; descuento de obligación autorizado posteriormente; ambos con reglas separadas, vigencia y trazabilidad.
- **Propuesta:** no adoptar porcentajes didácticos; acordar base, acumulabilidad, orden frente a mora, vigencia, autoridad y reflejo en caja. Separar efectivo recibido de importe exonerado.
- **Bloquea:** descuentos/tarifas especiales, no registro básico de personas. **Responsable:** Dirección/contabilidad. **Estado: PENDIENTE DE POLÍTICA.**

### DEC-08 — Inmutabilidad frente a anulación

- **Fuentes:** D02 NFR-004 prohíbe modificación de pagos completados; D05 RN-04 prohíbe modificar/eliminar recibo; PM fase 7 y D12 PN-1/Anexo M exigen reversión auditable. D08 contempla anulaciones sin fijar procedimiento institucional completo.
- **Alternativas:** prohibir toda anulación; reversión compensatoria vinculada sin editar documento original; edición directa/borrado (incompatible, descartada por requisitos).
- **Propuesta:** reversión compensatoria atómica con referencia, actor, motivo y fecha; mostrar estado por evento asociado sin cambiar el contenido original. Dirección debe aprobar autoridad, períodos cerrados, pagos posteriores, devolución y reversión de mora/descuentos. No es una política ya aceptada.
- **Bloquea:** anulación, saldos/recaudación posteriores y cierre definitivo de NFR-004. **Responsable:** Dirección/cobros. **Estado: PROPUESTA PENDIENTE.**

### DEC-09 — Rendimiento, capacidad, recuperación y disponibilidad

- **Fuentes:** D02 NFR-005/010/011/013: p95 ≤2 s, ≥100 solicitudes, hasta 20 concurrentes; 300 estudiantes; RPO 1 h/RTO 30 min. D10 CP-PERF mantiene ≤1 s, 5 concurrentes, PDF 1.5 s y RAM 2.8 GB; ensayo UAT menciona 500 estudiantes. D12 propone 10 concurrentes, pago <3 s y flujo cobro+PDF ≤4 s con ≥50 muestras. D08 parte II habla de RTO <2 h y backups nocturnos; D12 propone disponibilidad mensual ≥99%.
- **Alternativas:** baseline SRS para consultas/recuperación; cambiarlo mediante control aprobado; mantener objetivos adicionales claramente separados por operación/entorno, sin sustituir los mínimos SRS.
- **Propuesta:** referencia principal D02/D03; medir consulta a 20 concurrentes, ≥100 solicitudes con dataset 300, sujeto a entorno acordado. Tratar 1 s como objetivo interno o SQL separado, y PDF/pago/memoria como metas por conciliar, no resultados. Backups solo nocturnos insuficientes para acreditar RPO de 1 h. No rebajar RTO a dos horas para aprobar pruebas.
- **Pendientes:** horario, ventana de disponibilidad, exclusión de mantenimiento, dataset, hardware, herramienta, perfil de escritura, alcance del p95, estrategia y destino de copias.
- **Responsable:** Dirección/operación/QA. **Estado: REFERENCIA CONSOLIDADA; ACEPTACIÓN PENDIENTE.**

### DEC-10 — Correlativos y firma de comprobantes

- **Fuentes:** D02 FR-035 exige ID único; D05 ASR-04 exige correlativo inalterable. D10 CP-FN-08 añade sello digital, D08 menciona firma digital; D12 condiciona Ley 729 a implementar firma electrónica.
- **Alternativas:** ID/folio único institucional sin firma legal; sello técnico de integridad; firma electrónica jurídicamente validada. Consecutividad sin huecos no se deduce de unicidad.
- **Propuesta:** precisar formato/serie/reinicio anual, concurrencia, huecos por transacciones fallidas y reimpresión. No atribuir validez fiscal/legal ni firma criptográfica a un PDF ordinario.
- **Responsable:** Dirección/contabilidad/jurídico. **Estado: PENDIENTE; PDF básico sustentado, firma no aprobada.**

### DEC-11 — Tutor, inscripción, matrícula y catálogo escolar

- **Fuentes:** D02 FR-008 y D05 RN-01: al menos un tutor; algunos textos dicen «único». FR-012 y FR-013 diferencian grado/nivel/curso sin definirlos; FR-014–020 separan inscripción/matrícula con solapamiento. D01 diseño propone FK directa tutor–estudiante, no confirma cardinalidad definitiva.
- **Alternativas:** tutor principal más vínculos adicionales o un solo tutor; inscripción como etapa de matrícula o entidad independiente; catálogo grado/nivel/curso separado o jerárquico.
- **Propuesta:** no borrar FR ni imponer tablas hasta ratificar cardinalidad, identidad documental, duplicados, estados, aperturas y matrícula tardía/traslado/retiro. Mantener diez cuotas como regla general sin inventar prorrateos.
- **Responsable:** Secretaría/cobros/Dirección. **Estado: PENDIENTE DE GLOSARIO Y REGLAS.**

### DEC-12 — Infraestructura real, offline y cargos adicionales

- **Fuentes:** D11 cuerpo describe PC ventanilla, IP 192.168.1.10 y recursos; sus anexos P0385–0388/P0428 dicen que son ilustrativos. D08 afirma sala biométrica/CCTV/UPS sin evidencia; D12 exige inventario y advierte hosting de US$2/mes. D04 pide operación offline; D02 exige continuidad/contingencia, no sincronización desconectada multiusuario. D05 incluye aranceles extraordinarios sin catálogo.
- **Alternativas de despliegue:** local; remoto compatible; híbrido con diseño y costo de sincronización si se solicita. Operación LAN sin Internet no equivale a cobrar con el backend desconectado.
- **Propuesta:** seleccionar perfil con inventario/pruebas; no desarrollar pagos offline/sincronización por inferencia. Mantener cargos extraordinarios como candidato hasta conocer catálogo y prioridad financiera; no desarrollar inventario por cobrar un concepto.
- **Responsable:** Dirección/soporte/cobros. **Estado: PENDIENTE; diseño lógico por capas no controvertido.**

### DEC-13 — Reportes, caja y exportaciones

- **Fuentes:** D02 FR-039/040 y P0058: morosidad y resumen diario; D05 CU-04/05: arqueo/estado; D10 CP-FN-10 exportación y CP-FN-12 filtro ≥2 cuotas; D07 ejemplos PDF/Excel/CSV; D12 PN-1 y D01 diseño proponen cierres, conteo y diferencias.
- **Alternativas:** reportes mínimos SRS; añadir cierres formales/exportaciones/filtros mediante alcance explícito.
- **Propuesta:** no excluir de morosidad al deudor de una sola cuota por el filtro ilustrativo ≥2. Definir período, usuario/medio, anulaciones, formato, campos personales, paginación, apertura/cierre y corte horario. No asumir que resumen diario implica contabilidad de caja completa.
- **Responsable:** Dirección/contabilidad/cobros. **Estado: PENDIENTE DE DETALLE.**

### DEC-14 — Sesiones, controles de seguridad y bibliotecas

- **Fuentes:** D08 especifica JWT en cookies, bcrypt ≥12, 5 fallos/15 min, REPEATABLE READ, Winston; ejemplos mezclan Joi/Zod/Yup, bcrypt/bcryptjs, 401/403 y scopes IP/cuenta. D08 P0683 declara 2 h tesorería/8 h padres citando diseño independiente que no está disponible correctamente. PM pide decidir almacenamiento, expiración y revocación; no bastan las banderas de cookie.
- **Alternativas:** ratificar JWT/cookies con revocación y CSRF; proponer otra sesión mediante cambio documentado; elegir una sola biblioteca de validación según compatibilidad. La biblioteca no sustituye la propiedad de seguridad.
- **Propuesta:** conservar propiedades exigidas, revisar referencias actuales antes de fase 1/3 y emitir ADR. Acordar expiración, bloqueo/desbloqueo, recuperación de cuenta, autoridad de alta/baja y retención de auditoría. No presentar SameSite, CORS, React o SQL parametrizado como garantía absoluta contra todos los ataques.
- **Bloquea:** contrato definitivo de autenticación y de política transaccional, no la clasificación de riesgos. **Responsable:** técnico/seguridad/Dirección según política. **Estado: PENDIENTE.**

### DEC-15 — IDs de pruebas y errores técnicos de ejemplos

- **Fuentes:** D05 SRS-FN-01 = FIFO, D10 SRS-FN-01 = tutor/matrícula; SRS-FN-02 también cambia de significado. D09 §XI llama CP-DB-01 a tutor/matrícula y §XII a precisión monetaria. D02 Anexo G sugiere rollback para NFR-004 aunque no prueba inmutabilidad. D09 conserva `FOREIGN_KEY_CHECKS`, «Binlogs» y alias de SELECT en HAVING junto a PostgreSQL; D10 mezcla rótulo Jest/Vitest.
- **Alternativas:** sobrescribir IDs; o preservar identificador compuesto fuente/sección/ID y crear mapeo de pruebas sin colisiones.
- **Propuesta:** segunda opción. SRS D02 FR/NFR como IDs canónicos; CP-FR para aceptación individual, casos nuevos trazados por contenido, nunca por igualdad del nombre. Revisar sintaxis de todo ejemplo antes de implementarlo; ejemplos no se ejecutaron ni copiaron al sistema.
- **Responsable:** QA/técnico/custodio documental. **Estado: HALLAZGO REGISTRADO; RECONCILIACIÓN COMPLETA PENDIENTE.**

### DEC-16 — Aprobaciones, repositorio, propiedad y datos

- **Fuentes:** D02 Anexo C declara actas ausentes; D08 algunos párrafos dicen «aprobado/implementado» y anexos niegan acreditación; D12 K/O son modelos sin firmas. D01/D02/D03 describen repositorio público y licencia MIT como referencia, no evidencia local actual. Directorio actual sin repositorio Git, con documentos y prompt.
- **Alternativas:** proyecto nuevo o continuación de system_CCM tras fijar commit, revisar código/licencia y preservar funcionalidades. No copiar/eliminar módulos externos antes de decidir.
- **Propuesta:** confirmar relación con el repositorio antes de inicializar fase 1. No atribuir autoría/titularidad ni actas por inferencia. D12 §9.2 y P0674 exigen formalización/inventario antes de implementación institucional: aclarar si se autoriza prototipo académico sintético mientras se obtiene esa evidencia, sin operar con datos reales.
- **Resolución en sesión (documentación):** el solicitante confirmó desarrollo NUEVO; se resuelve SOLO el origen nuevo y no se importa `system_CCM`. Se mantienen abiertos contrato/licencia/privacidad/actas y autorización futura; no se inventó autorización de prototipo sintético.
- **Actualización (sesión `sgpm-fase0-correccion-01` — intento runtime1, ronda documental 2/2):** el origen quedó **RESUELTO** (desarrollo NUEVO, sin importar `system_CCM`); el resto permanece **ABIERTO**.
- **Pendientes:** contrato/licencia, autorización de tratamiento, retención, mantenimiento/SLA, actas de requisitos y riesgos. D10 propone atención crítica ≤2 h; D12 soporte sugiere 1 día hábil: son ámbitos/metas por pactar, no SLA vigente ni RTO intercambiable.
- **Responsable:** solicitante/Dirección/jurídico/técnico. **Estado: PENDIENTE; NO HAY ACEPTACIÓN INSTITUCIONAL ACREDITADA.**

## Preguntas de cierre priorizadas

1. ¿Se confirma PostgreSQL de los V2 o se solicita cambiar la línea base a MySQL/InnoDB?
2. ¿Se trabajará desde cero o sobre una revisión concreta de system_CCM? ¿Se autoriza prototipo con datos sintéticos mientras se formalizan los instrumentos institucionales?
3. ¿Se aporta el diseño V2 correcto y la rúbrica genérica? ¿Se reconoce D01 §5/D13 como fuentes vigentes equivalentes mientras tanto?
4. ¿Cuál es la matriz de permisos por operación y entra el portal de tutores?
5. ¿Se ratifican día 11/10% una sola vez, moneda, tarifas, redondeo, zona horaria, excedentes, becas y anulaciones con casos esperados?
6. ¿Qué servidor/proveedor, horario, conservación y responsables se aprueban para las pruebas de 300 estudiantes, 20 concurrentes y recuperación?

**Actualización de la sesión de documentación (2026-11-06):** las preguntas 1 y 2 quedaron respondidas por el solicitante (motor PostgreSQL con señal «psql»; desarrollo NUEVO sin importar `system_CCM`). Las preguntas 3–6 permanecen abiertas.

## Registro de aprobación

Sin decisiones aprobadas en esta sesión. Al responder, incorporar ID, alternativa elegida, alcance de la autorización, fecha y evidencia; no convertir una autorización técnica del solicitante en acta del colegio. En esta sesión se registraron confirmaciones técnicas del solicitante (motor y origen de desarrollo) sin que ello constituya aprobación institucional ni decisión adoptada del colegio.
