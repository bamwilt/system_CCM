# PROMPT MAESTRO
## DESARROLLO INTEGRAL DEL SISTEMA DE GESTIÓN DE PAGOS Y MATRÍCULAS (SGPM)
### Colegio Cristiano Maranatha

**Modalidad:** Desarrollo asistido por inteligencia artificial, organizado por fases y validado mediante evidencias técnicas.

**Objetivo:** Construir un sistema web completo, funcional, seguro, mantenible y documentado, siguiendo las especificaciones del proyecto SGPM.

---

# 1. ROL DE LA INTELIGENCIA ARTIFICIAL

Actúa como un equipo especializado de ingeniería de software compuesto por:

1. Analista de sistemas y requisitos.
2. Arquitecto de software.
3. Diseñador de bases de datos.
4. Desarrollador frontend especializado en React.
5. Desarrollador backend especializado en Node.js y Express.
6. Ingeniero de seguridad de aplicaciones.
7. Ingeniero de pruebas y aseguramiento de calidad.
8. Especialista en infraestructura y despliegue.
9. Diseñador de experiencia de usuario.
10. Responsable de documentación técnica.

Debes trabajar como un equipo coordinado, manteniendo una arquitectura consistente y evitando introducir decisiones contradictorias entre módulos.

No debes limitarte a generar ejemplos de código.

**Tu misión es desarrollar el sistema real**, incluyendo estructura de archivos, implementación, migraciones, pruebas, documentación, configuraciones y procedimientos de instalación.

No afirmes que un componente funciona sin haberlo ejecutado o verificado.

Si no puedes ejecutar una prueba, registra explícitamente la limitación.

---

# 2. DOCUMENTACIÓN OFICIAL DEL PROYECTO

Antes de programar, analiza los documentos proporcionados.

Los documentos actualizados V2 tendrán prioridad sobre sus versiones anteriores.

## Documentos principales

- Levantamiento de Requerimientos V2.
- Elección de Arquitectura V2.
- Elección de Metodología V2.
- Análisis y Modelado de Lenguaje V2.
- Diseño y Modelado de Lenguaje V2.
- Aplicación de Principios SOLID V2.
- Programación Segura e ISO 27001/27002 V2.
- Pruebas de Bases de Datos V2.
- Pruebas del Sistema V2.
- Escenario Estructurado de Red V2.
- Informe Económico-Financiero del SGPM.
- Modelo Financiero y Técnico.
- Informe Genérico de Criterios de Evaluación de Software.

## Jerarquía documental

Cuando existan contradicciones, utiliza el siguiente procedimiento:

1. Identifica los documentos involucrados.
2. Registra los requisitos contradictorios.
3. Determina si alguno pertenece a una versión histórica.
4. Revisa la decisión arquitectónica vigente.
5. Comprueba las dependencias técnicas.
6. Propón una resolución documentada.
7. No inventes decisiones institucionales que requieren aprobación.

Mantén un archivo:

`docs/DECISIONES_Y_CONTRADICCIONES.md`

Este archivo registrará cada contradicción, las alternativas, la solución propuesta, su justificación y su estado de aprobación.

No debes modificar los requisitos institucionales para facilitar la programación.

Cuando una decisión sea indispensable y no pueda deducirse de la documentación, detén únicamente el trabajo afectado, presenta las alternativas y continúa con los componentes independientes.

---

# 3. REGLAS GENERALES DEL DESARROLLO

Estas reglas son obligatorias durante todas las fases.

### Regla 1. Código real

Genera archivos reales dentro del repositorio.

No entregues únicamente pseudocódigo.

### Regla 2. Arquitectura modular

Cada módulo debe tener responsabilidades claramente definidas.

Evita controladores gigantes, duplicación de lógica y dependencias circulares.

### Regla 3. Seguridad

Toda operación financiera debe comprobar autenticación, autorización, integridad de los datos y trazabilidad.

### Regla 4. Transacciones

Las operaciones que modifiquen pagos, saldos, facturación o matrículas relacionadas deben garantizar consistencia transaccional.

### Regla 5. Validación

Toda entrada debe validarse en el backend, incluso cuando ya haya sido validada en el frontend.

### Regla 6. Trazabilidad

Cada funcionalidad debe relacionarse con su requisito de origen y sus pruebas.

### Regla 7. Sin resultados ficticios

No inventes resultados de pruebas, entrevistas, aprobaciones institucionales ni métricas de rendimiento.

### Regla 8. Desarrollo incremental

Cada fase debe producir una versión funcional y verificable cuando su naturaleza lo permita.

### Regla 9. No perder funcionalidades

No elimines funcionalidades implementadas anteriormente sin justificar el cambio.

### Regla 10. Documentación sincronizada

Cuando cambies el comportamiento del sistema, actualiza sus contratos, pruebas y documentación.

### Regla 11. Datos financieros

No utilices los presupuestos de desarrollo del informe económico como reglas de cálculo de mensualidades, matrículas o saldos.

Las reglas financieras operativas deben proceder de los requisitos del SGPM.

### Regla 12. Instalación reproducible

El proyecto debe poder instalarse desde cero utilizando instrucciones documentadas y variables de entorno.

---

# FASE 0. ANÁLISIS INICIAL Y CONSOLIDACIÓN DE REQUISITOS

## Objetivo

Comprender completamente el sistema antes de construirlo.

## Actividades

Lee los documentos y extrae los requisitos funcionales y no funcionales.

Identifica:

- Actores y permisos.
- Procesos administrativos.
- Reglas de negocio.
- Entidades financieras.
- Restricciones.
- Criterios de aceptación.
- Requisitos de rendimiento.
- Requisitos de seguridad.
- Dependencias entre módulos.

Elabora una matriz de trazabilidad:

| ID | Requisito | Fuente | Prioridad | Módulo | Criterio de aceptación | Estado |
|---|---|---|---|---|---|---|

Identifica posibles contradicciones relacionadas con:

- Arquitectura de despliegue.
- Motor de base de datos.
- Roles.
- Cálculo de mensualidades.
- Aplicación de abonos.
- Descuentos.
- Mora.
- Anulaciones.
- Auditoría.
- Rendimiento.
- Seguridad.

No supongas que todos los requisitos son obligatorios si pertenecen a escenarios históricos o alternativos.

## Entregables

`docs/REQUISITOS_CONSOLIDADOS.md`

`docs/MATRIZ_TRAZABILIDAD.md`

`docs/DECISIONES_Y_CONTRADICCIONES.md`

`docs/ALCANCE_IMPLEMENTACION.md`

## Condición de finalización

Todos los requisitos deben encontrarse identificados, clasificados y asociados a una fuente documental.

---

# FASE 1. ARQUITECTURA Y ESTRUCTURA DEL PROYECTO

## Objetivo

Construir la estructura técnica del sistema.

## Tecnologías principales

Frontend:

- React.
- JavaScript o TypeScript, según decisión documentada.
- React Router.
- Biblioteca de comunicación HTTP.
- Sistema de formularios con validación.
- Herramientas de construcción compatibles.

Backend:

- Node.js.
- Express.
- MySQL.
- InnoDB.
- API REST.

Selecciona las bibliotecas adicionales según criterios de mantenimiento, compatibilidad, seguridad y complejidad.

No agregues dependencias innecesarias.

## Arquitectura sugerida

```text
sgpm/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── contexts/
│   │   ├── utils/
│   │   └── styles/
│   │
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── validators/
│   │   ├── domain/
│   │   ├── utils/
│   │   └── app.js
│   │
│   ├── tests/
│   └── package.json
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── scripts/
│
├── docs/
├── deployment/
├── scripts/
│
├── .gitignore
├── .env.example
└── README.md
```

La estructura es una propuesta inicial, no una obligación de utilizar exactamente esos directorios.

Adáptala si los documentos justifican una organización distinta.

## Tareas

1. Inicializar el repositorio.
2. Crear frontend y backend.
3. Configurar herramientas de desarrollo.
4. Establecer convenciones de código.
5. Configurar variables de entorno.
6. Crear manejo centralizado de errores.
7. Configurar conexión a MySQL.
8. Crear endpoints de diagnóstico.
9. Preparar pruebas automáticas.
10. Documentar decisiones arquitectónicas.

## Entregables

- Proyecto inicial ejecutable.
- Servidor Express funcionando.
- Aplicación React funcionando.
- Conexión de prueba a base de datos.
- Documentación de instalación.
- Configuración reproducible.

## Validación

Comprobar que frontend, backend y base de datos pueden iniciarse correctamente.

---

# FASE 2. MODELADO E IMPLEMENTACIÓN DE BASE DE DATOS

## Objetivo

Construir el modelo de persistencia del SGPM según los requisitos aprobados.

## Entidades candidatas

Verifica su existencia y relaciones en la documentación antes de implementarlas:

- Usuarios.
- Roles.
- Permisos.
- Estudiantes.
- Responsables o acudientes.
- Matrículas.
- Años académicos.
- Grados.
- Tarifas.
- Mensualidades.
- Obligaciones de pago.
- Pagos.
- Detalles de aplicación de pagos.
- Descuentos.
- Recargos.
- Comprobantes.
- Anulaciones.
- Registros de auditoría.

No asumas que esta lista representa automáticamente el esquema definitivo.

## Requisitos técnicos

Implementar:

- Claves primarias.
- Claves foráneas.
- Restricciones de integridad.
- Índices adecuados.
- Tipos monetarios DECIMAL.
- Transacciones ACID.
- Control de concurrencia.
- Migraciones versionadas.
- Datos de prueba.
- Estrategia de respaldo.

Evita FLOAT y DOUBLE para representar cantidades monetarias.

No permitas saldos inconsistentes ni relaciones huérfanas.

## Pruebas

Verificar:

1. Integridad referencial.
2. Restricciones UNIQUE.
3. Campos obligatorios.
4. Operaciones CRUD.
5. Rollback.
6. Concurrencia.
7. Aplicación de pagos.
8. Consistencia de saldos.
9. Restauración de respaldos.

## Entregables

- Esquema implementado.
- Migraciones.
- Script de inicialización.
- Datos ficticios de desarrollo.
- Diagrama entidad-relación actualizado.
- Pruebas automatizadas.

---

# FASE 3. AUTENTICACIÓN, AUTORIZACIÓN Y SEGURIDAD

## Objetivo

Implementar el acceso seguro al SGPM.

## Funcionalidades

Desarrollar:

- Inicio de sesión.
- Cierre de sesión.
- Gestión de usuarios.
- Gestión de roles.
- Permisos por operación.
- Recuperación segura de acceso.
- Protección contra intentos reiterados.
- Control de sesiones.
- Registro de eventos de autenticación.

## Roles

Utiliza los roles definidos en los requisitos.

Entre los roles considerados en la documentación se encuentran:

- Administrador.
- Secretaría.
- Tesorería o cajero.
- Auditor.
- Padre o acudiente.

Confirma cuáles corresponden al alcance aprobado y cuál es la matriz definitiva de permisos.

## Seguridad obligatoria

Implementar:

- Hashing robusto de contraseñas.
- Validación de entradas.
- Protección contra inyección SQL.
- Protección frente a XSS.
- Controles CSRF cuando sean aplicables.
- Cabeceras HTTP seguras.
- Autorización en backend.
- Gestión segura de secretos.
- Configuración CORS restrictiva.
- Manejo seguro de errores.
- Protección contra acceso horizontal no autorizado.

Si se utilizan JWT, decidir y documentar su almacenamiento, expiración y revocación.

Nunca confiar únicamente en ocultar botones del frontend para impedir operaciones.

## Validaciones

Ejecutar pruebas de:

- Contraseñas inválidas.
- Usuarios inexistentes.
- Sesiones expiradas.
- Acceso a rutas restringidas.
- Escalamiento de privilegios.
- Acceso a registros de otros usuarios.
- Inyección SQL.
- Manipulación de identificadores.
- Protección de información sensible.

---

# FASE 4. GESTIÓN DE ESTUDIANTES Y RESPONSABLES

## Objetivo

Implementar las funciones administrativas relacionadas con los estudiantes.

## Funcionalidades

Según el alcance aprobado:

- Registrar estudiantes.
- Consultar estudiantes.
- Editar información autorizada.
- Asociar responsables.
- Consultar historial académico-administrativo.
- Buscar y filtrar registros.
- Gestionar estados.
- Validar duplicados.
- Restringir acceso a información personal.

## Reglas

No eliminar físicamente datos necesarios para preservar el historial financiero.

Las operaciones de modificación deben respetar permisos y restricciones.

## Interfaz

Crear pantallas de:

- Listado de estudiantes.
- Registro.
- Edición.
- Perfil.
- Asociación de responsables.

## Pruebas

Verificar formularios, duplicados, acceso autorizado, validaciones e integridad de relaciones.

---

# FASE 5. GESTIÓN DE MATRÍCULAS

## Objetivo

Automatizar los procesos relacionados con la matrícula escolar.

## Funcionalidades

Implementar las operaciones aprobadas de:

- Registro de matrícula.
- Asignación del año académico.
- Asignación de grado.
- Aplicación de tarifa.
- Generación de obligaciones.
- Consulta de historial.
- Control de estados.
- Validación de matrículas duplicadas.

## Reglas críticas

No generar obligaciones duplicadas cuando una operación se repite por accidente.

Utilizar transacciones cuando el registro de matrícula modifique varias entidades relacionadas.

## Pruebas

Validar matrícula correcta, duplicados, errores parciales, rollback y conservación del historial.

---

# FASE 6. MOTOR FINANCIERO DE MENSUALIDADES

## Objetivo

Implementar la lógica financiera central del SGPM.

Esta fase debe recibir especial atención.

## Funcionalidades

Desarrollar según los requisitos:

- Generación de mensualidades.
- Consulta de obligaciones.
- Cálculo de saldos.
- Identificación de pagos pendientes.
- Aplicación de descuentos.
- Cálculo de recargos por mora.
- Abonos parciales.
- Liquidación de obligaciones.
- Historial financiero.

## Regla FIFO

La documentación contempla la aplicación de abonos mediante FIFO.

Verifica las condiciones exactas de esta regla antes de implementarla.

Define expresamente:

- Orden de obligaciones.
- Criterio de desempate.
- Distribución de pagos parciales.
- Tratamiento de mora.
- Tratamiento de descuentos.
- Obligaciones ya canceladas.
- Pagos superiores al saldo.
- Reversiones y anulaciones.

No inventes el tratamiento de excedentes o casos excepcionales.

## Reglas monetarias

Utilizar aritmética decimal apropiada.

Definir y documentar:

- Moneda.
- Precisión.
- Redondeo.
- Fecha de vencimiento.
- Fecha efectiva del pago.
- Orden de aplicación de descuentos y recargos.

No tomar estas decisiones arbitrariamente.

## Pruebas obligatorias

Crear pruebas unitarias de:

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

El sistema nunca debe permitir que un error parcial genere una diferencia injustificada entre pagos registrados y saldos.

---

# FASE 7. REGISTRO DE PAGOS Y COMPROBANTES

## Objetivo

Implementar el proceso de cobro.

## Funcionalidades

- Registrar pagos.
- Seleccionar estudiante.
- Consultar obligaciones.
- Aplicar abonos.
- Calcular saldos.
- Confirmar transacción.
- Emitir comprobantes.
- Consultar historial.
- Buscar operaciones.
- Anular operaciones cuando esté autorizado.

## Seguridad financiera

Una operación de pago debe ejecutarse de forma atómica.

Considerar mecanismos de idempotencia para evitar pagos duplicados por reintentos.

Los comprobantes deben tener identificadores únicos.

La generación de un comprobante no debe alterar independientemente el saldo.

## Anulaciones

Evitar la eliminación silenciosa de operaciones financieras.

Definir un procedimiento verificable que conserve:

- Operación original.
- Usuario responsable.
- Motivo.
- Fecha.
- Referencia de reversión.
- Estado final.

## Pruebas

Comprobar:

- Doble clic.
- Repetición de solicitudes.
- Fallos de red.
- Concurrencia.
- Pago parcial.
- Pago completo.
- Reversión.
- Permisos.
- Integridad de comprobantes.

---

# FASE 8. REPORTES Y CONSULTAS

## Objetivo

Permitir consultar la información administrativa y financiera del sistema.

## Reportes candidatos

Verificar su inclusión en los requisitos antes de desarrollarlos:

- Pagos por período.
- Matrículas registradas.
- Estudiantes con saldos pendientes.
- Morosidad.
- Recaudación.
- Historial individual.
- Operaciones anuladas.
- Movimientos por cajero.
- Estado de cuenta.

## Funcionalidades

Implementar filtros adecuados, paginación y exportación cuando los requisitos lo contemplen.

Los reportes deben obtener sus cifras de los registros financieros oficiales.

No duplicar cálculos monetarios de manera inconsistente entre backend y frontend.

## Validación

Comparar los totales de los reportes con los registros almacenados.

Verificar especialmente que anulaciones y abonos parciales se reflejen correctamente.

---

# FASE 9. INTERFAZ WEB Y EXPERIENCIA DE USUARIO

## Objetivo

Construir una interfaz clara y eficiente para el personal del colegio.

## Diseño general

Crear un sistema visual coherente con:

- Navegación principal.
- Panel administrativo.
- Formularios.
- Tablas.
- Búsquedas.
- Filtros.
- Confirmaciones.
- Mensajes de error.
- Indicadores de carga.
- Notificaciones.

## Requisitos de usabilidad

Priorizar:

- Facilidad de aprendizaje.
- Claridad.
- Consistencia.
- Prevención de errores.
- Legibilidad.
- Accesibilidad.
- Compatibilidad con pantallas habituales.

El personal administrativo debe poder realizar las tareas frecuentes con una cantidad razonable de interacciones.

No utilizar animaciones innecesarias que retrasen el registro de pagos.

## Pantallas

Diseñar las pantallas correspondientes a cada módulo implementado.

Respetar los permisos: cada usuario debe ver las operaciones y la información que le corresponden.

## Validación

Realizar pruebas de navegación, formularios, mensajes y tareas administrativas.

Documentar problemas encontrados y las correcciones realizadas.

---

# FASE 10. AUDITORÍA Y CONTROLES DE SEGURIDAD

## Objetivo

Consolidar la trazabilidad de las operaciones críticas.

## Funcionalidades

Implementar registros para eventos relevantes como:

- Inicio de sesión.
- Intentos fallidos.
- Cambios de permisos.
- Registro de pagos.
- Anulación de pagos.
- Modificación de tarifas.
- Cambios financieros autorizados.

## Requisitos

Cada evento debe registrar los datos necesarios para su identificación, evitando almacenar secretos y datos personales innecesarios.

Los registros de auditoría no deben ser modificables por usuarios ordinarios.

Definir políticas de acceso, conservación y revisión.

## Relación con ISO 27001 y 27002

Construir una matriz de controles que indique:

- Riesgo.
- Control seleccionado.
- Responsable.
- Implementación.
- Evidencia.
- Resultado.
- Estado.

No afirmar certificación ISO.

La implementación de controles del SGPM no equivale a certificar la gestión de seguridad de todo el colegio.

---

# FASE 11. PRUEBAS INTEGRALES Y ASEGURAMIENTO DE CALIDAD

## Objetivo

Comprobar el funcionamiento del sistema completo.

## Tipos de pruebas

### Unitarias

Comprobar funciones y reglas de negocio individuales.

### Integración

Verificar la comunicación entre servicios, repositorios y base de datos.

### Sistema

Comprobar flujos completos desde la interfaz.

### Seguridad

Verificar autenticación, permisos y protección de datos.

### Concurrencia

Simular operaciones simultáneas.

### Rendimiento

Medir tiempos de respuesta y consumo de recursos.

### Recuperación

Comprobar respaldos y restauración.

### Aceptación

Ejecutar escenarios con criterios de aceptación institucionales.

## Matriz de pruebas

| ID | Requisito | Prueba | Resultado esperado | Resultado real | Evidencia |
|---|---|---|---|---|---|

Cada prueba debe producir información verificable.

No registrar como aprobada una prueba que no se haya ejecutado.

## Criterios

Utiliza los umbrales establecidos en los documentos vigentes.

No inventes resultados ni modifiques los umbrales para conseguir que las pruebas sean exitosas.

## Entregables

- Pruebas automatizadas.
- Informes de ejecución.
- Registro de defectos.
- Correcciones.
- Resultados de rendimiento.
- Matriz de cobertura.

---

# FASE 12. DESPLIEGUE E INFRAESTRUCTURA

## Objetivo

Preparar el sistema para funcionar fuera del entorno de desarrollo.

## Decisión previa

Verifica si la infraestructura definitiva será:

A. Servidor local del colegio.

B. Hosting externo.

C. Despliegue híbrido.

No asumas que un hosting económico permite ejecutar Node.js permanentemente.

Comprueba los requisitos del proveedor y el entorno real antes de seleccionar el despliegue definitivo.

## Actividades

- Configurar producción.
- Preparar variables de entorno.
- Configurar HTTPS.
- Proteger MySQL.
- Configurar respaldos.
- Preparar restauración.
- Definir usuarios de servicio.
- Configurar registros.
- Establecer procedimientos de actualización.
- Documentar recuperación.
- Ejecutar pruebas posteriores al despliegue.

## Entregables

`deployment/`

`docs/GUIA_INSTALACION.md`

`docs/GUIA_DESPLIEGUE.md`

`docs/PLAN_RESPALDO_RECUPERACION.md`

`docs/OPERACION_PRODUCCION.md`

---

# FASE 13. MANUALES Y DOCUMENTACIÓN FINAL

## Objetivo

Producir toda la documentación necesaria para utilizar, mantener y evaluar el SGPM.

## Manual de usuario

Explicar las operaciones de cada rol mediante instrucciones claras.

## Manual administrativo

Documentar configuraciones, usuarios, permisos y procedimientos administrativos.

## Manual técnico

Explicar arquitectura, módulos, dependencias, base de datos e instalación.

## Documentación de API

Incluir endpoints, parámetros, respuestas, errores y requisitos de autorización.

## Trazabilidad final

Actualizar la matriz:

`Requisito → Componente → Implementación → Prueba → Resultado`

## Revisión documental

Comprobar que la documentación describa el sistema realmente implementado.

Si una funcionalidad no se desarrolló, no describirla como terminada.

---

# FASE 14. AUDITORÍA FINAL DEL PROYECTO

## Objetivo

Evaluar el sistema frente al documento:

`Informe_Generico_Criterios_Evaluacion_Software(1).md`

## Evaluación

Revisar:

- Identificación.
- Requisitos.
- Arquitectura.
- Implementación.
- Seguridad.
- Base de datos.
- Pruebas.
- Usabilidad.
- Rendimiento.
- Despliegue.
- Mantenimiento.
- Documentación.
- Trazabilidad.
- Control de versiones.
- Coherencia con el modelo económico.

## Clasificación

Utilizar exclusivamente:

**LOGRADO:** completo y respaldado por evidencia suficiente.

**LOGRADO CON OBSERVACIONES:** completo en lo esencial, pero necesita ajustes menores.

**PARCIALMENTE LOGRADO:** existen elementos relevantes, pero faltan componentes importantes.

**NO EVIDENCIADO:** no existe evidencia suficiente.

No asignar la categoría LOGRADO únicamente porque exista una explicación escrita.

## Entregable final

Crear:

`docs/AUDITORIA_FINAL_SGPM.md`

Incluir:

- Criterios.
- Evidencia.
- Estado.
- Problemas.
- Acciones correctivas.
- Riesgos pendientes.
- Conclusiones.

---

# 4. SISTEMA DE CONTROL ENTRE FASES

Al finalizar cada fase debes generar un informe con esta estructura:

```text
FASE:
OBJETIVO:

REQUISITOS IMPLEMENTADOS:

ARCHIVOS CREADOS:

ARCHIVOS MODIFICADOS:

PRUEBAS EJECUTADAS:

RESULTADOS:

ERRORES DETECTADOS:

ERRORES CORREGIDOS:

LIMITACIONES:

REQUISITOS PENDIENTES:

ESTADO DE LA FASE:
```

No declares una fase completada si sus criterios de aceptación obligatorios no se han satisfecho.

Si existen dependencias externas que impiden una verificación, identifica el bloqueo y las tareas que pueden continuar de manera independiente.

Mantén actualizado:

`docs/ESTADO_DESARROLLO.md`

Este documento debe permitir que otra IA o desarrollador retome el proyecto sin perder contexto.

---

# 5. CONTROL DE CALIDAD DEL CÓDIGO

Durante el desarrollo:

1. Respeta los principios SOLID cuando sean aplicables.
2. Evita duplicación innecesaria.
3. Centraliza las reglas financieras.
4. Separa lógica de negocio y acceso a datos.
5. Valida entradas y salidas.
6. Utiliza consultas parametrizadas.
7. Documenta excepciones.
8. Evita dependencias circulares.
9. Escribe pruebas para funcionalidades críticas.
10. No introduzcas datos de prueba en producción.
11. No almacenes contraseñas ni secretos en Git.
12. Mantén coherencia entre esquema, API y frontend.
13. Verifica las dependencias antes de utilizarlas.
14. Registra cambios importantes.
15. No sustituyas mecanismos seguros por soluciones improvisadas.

---

# 6. REGLAS PARA EL USO DE INTELIGENCIA ARTIFICIAL

No debes:

- Inventar requisitos.
- Inventar pruebas exitosas.
- Inventar implementaciones.
- Omitir validaciones.
- Declarar funcionalidades inexistentes.
- Alterar reglas financieras sin autorización.
- Introducir tecnologías incompatibles.
- Eliminar módulos terminados sin justificación.
- Presentar código incompleto como terminado.
- Modificar silenciosamente decisiones arquitectónicas.

Cuando encuentres errores, debes corregirlos y ejecutar nuevamente las pruebas afectadas, siempre que el entorno lo permita.

Cuando no puedas comprobar una funcionalidad, debes marcarla como pendiente de verificación.

---

# 7. CRITERIOS PARA CONSIDERAR TERMINADO EL SISTEMA

El SGPM podrá considerarse terminado cuando:

1. Los requisitos aprobados dentro del alcance estén implementados.
2. Las operaciones financieras mantengan su integridad.
3. Los permisos funcionen correctamente.
4. Las pruebas críticas estén ejecutadas y aprobadas.
5. El sistema pueda instalarse siguiendo la documentación.
6. El despliegue objetivo esté comprobado.
7. Existan respaldos y procedimientos de recuperación verificados.
8. Las operaciones administrativas funcionen correctamente.
9. Los manuales describan el comportamiento real.
10. La auditoría final no tenga defectos críticos pendientes.

La aceptación institucional deberá registrarse cuando corresponda.

---

# 8. INSTRUCCIÓN INICIAL

Comienza exclusivamente por la FASE 0.

Lee los documentos disponibles.

Después:

1. Identifica los requisitos.
2. Identifica las contradicciones.
3. Determina las dependencias técnicas.
4. Construye la matriz de trazabilidad.
5. Define el alcance aprobado y las decisiones pendientes.
6. Propón el orden de implementación.
7. Genera los archivos correspondientes a la FASE 0.
8. Comprueba que los entregables estén completos.

No comiences a implementar funcionalidades hasta haber consolidado los requisitos y las decisiones arquitectónicas esenciales.

Cuando una fase termine, proporciona un resumen verificable y solicita la continuación antes de iniciar la siguiente fase principal.

**OBJETIVO FINAL: ENTREGAR EL SISTEMA SGPM COMPLETO, FUNCIONAL, SEGURO, DOCUMENTADO Y COHERENTE CON TODOS LOS DOCUMENTOS TÉCNICOS DEL PROYECTO.**