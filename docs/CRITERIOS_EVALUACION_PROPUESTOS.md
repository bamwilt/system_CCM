# Criterios de evaluación propuestos — SGPM

Fecha: 2026-11-06. Versión: 0.1. **PROPUESTO — no sustituye la rúbrica institucional.**

## 1. Objeto y alcance

El presente documento propone criterios de evaluación para el SGPM, elaborados durante la sesión `sgpm-fase0-documentacion-01 — intento 1`.

Se toma como base la Fase 14 del PM y sus categorías de clasificación. No existe en el árbol local el «Informe Genérico de Criterios de Evaluación de Software» referido por el PM (ausente localmente; véase DEC-02), por lo que este documento no es un sustituto, un nombre oficial ni una rúbrica institucional: es una propuesta derivada para una evaluación futura con evidencia real.

No califica implementación inexistente: mientras no exista código ejecutado, la categoría aplicable es **NO EVIDENCIADO**, salvo que se cuente con evidencia verificable.

## 2. Categorías de clasificación

- **LOGRADO:** completo y respaldado por evidencia suficiente.
- **LOGRADO CON OBSERVACIONES:** completo en lo esencial, pero necesita ajustes menores.
- **PARCIALMENTE LOGRADO:** existen elementos relevantes, pero faltan componentes importantes.
- **NO EVIDENCIADO:** no existe evidencia suficiente.

No se asigna LOGRADO únicamente por existencia de una explicación escrita.

## 3. Áreas de evaluación y criterios propuestos

Criterios por áreas del PM (Fase 14):

| Área | IDs | Criterio propuesto | Artefacto(s) específico(s) mínimo(es) |
|---|---|---|---|
| Identificación | STK-REQ-001–005 / SYS-REQ-001–004 | Fuentes y localizadores identificados; sin requisitos inventados. | Inventario + matriz de trazabilidad. |
| Requisitos | FR-001–040 | Cada obligación tiene fuente, criterio y estado documental coherente. | Matriz de trazabilidad + informe. |
| Arquitectura | TEC-01 / GOB-05 | Capas, módulos y relaciones con sus incertidumbres (DEC) registradas. | Diseño técnico propuesto + matriz TEC. |
| Implementación | CAL-04 / GOB-05 | Componentes existentes; propuesta sin ejecutar se evalúa como no evidenciada. | Matriz TEC/CAL + informe. |
| Seguridad | SEG-001–014 | Controles de RBAC, sesiones, CSRF, secrets, validación, logs y auditoría con RPO/RTO. | Contrato de acceso, esquema de control de acceso, logs/auditoría. |
| Base de datos | TEC-003 / NFR-001–013 | Integridad, concurrencia y precisión; motor decidido sin adopción silenciosa. | Esquema conceptual + TEC-03. |
| Pruebas | CP-FR-001–040 / T-* | Casos con esperado/real; no se presume verificación sin ejecución. | Casos CP + informe. |
| Usabilidad | SYS-REQ-002 / CA-01 | Tareas con operadores; accesibilidad WCAG 2.1 AA cuando aplique. | Checklist a11y + casos CA. |
| Rendimiento | NFR-005 | Umbrales con medición; metas y resultados no mezclados. | Medición T-NFR-005. |
| Despliegue | TEC-006 / SEG-13 | Perfil aprobado y compatible; instalación y restauración comprobadas. | Procedimiento de backup + manuales. |
| Mantenimiento | GOB-05 | Documentación, soporte y conservación con responsables definidos. | Manuales / GOB-05. |
| Documentación | GOB-05 | Coherencia con la implementación real; no se describe lo no ejecutado. | Informe / documentación. |
| Trazabilidad | MATRIZ_TRAZABILIDAD | Requisito → componente → implementación → prueba → resultado. | Matriz. |
| Control de versiones | GOB-03 | Historial y control de cambios con fuente e impacto. | Registro de cambios. |
| Coherencia económica | RN-SGPM-11 | Reglas financieras operativas proceden de requisitos, no de presupuestos. | RN-SGPM-11. |

## 4. Trazabilidad y evidencia mínima verificable

Para considerar un criterio evaluado se requiere, como mínimo:

1. Requisito origen → componente → implementación → prueba → resultado → evidencia → aprobador.
2. Evidencia real de ejecución (no proyección ni ejemplo escrito).
3. Resultado esperado vs. resultado real contrastados.
4. Responsable de la verificación y fecha.

## 5. Reglas honestas de evaluación

- No inventar resultados, aprobaciones institucionales ni métricas.
- Distinguir especificación, implementación, ejecución y aceptación.
- Los defectos críticos pendientes condicionan negativamente la clasificación.
- No mezclar metas propuestas con resultados obtenidos.
- No sustituir la aprobación institucional por validación técnica interna.
- No calificar como LOGRADO una parte inexistente o no evidenciada.
- Distinguir áreas documentales (identificación, requisitos, arquitectura, decisiones, documentación interna) — inspeccionables sin ejecutar código — de áreas de producto, que requieren ejecución; no calificar automáticamente NO EVIDENCIADO por falta de aplicación cuando el criterio es documental.
- Tests, firmas y UAT con datos sintéticos; umbrales de rendimiento/recuperación deben referenciar los NFR correctos (p. ej., NFR-005 p95 ≤2 s, NFR-010 RPO ≤1 h, NFR-011 RTO ≤30 min).
- Roles y políticas financieras sin decisión institucional: no asignar LOGRADO a criterios que dependen de DEC pendientes (DEC-03, DEC-04–08, DEC-11).
- Plantilla de evaluación futura: sin llenar PASS ni puntajes; se registra criterios aplicados, evidencia, resultado y defectos.

## 6. Formato para la evaluación futura

Al evaluar una fase o el sistema completo, se debe registrar: criterios aplicados, evidencia por área, resultado por categoría, defectos, acciones correctivas, riesgos pendientes y conclusiones, manteniendo las cuatro categorías exactas y sin puntuaciones inventadas.

## 7. Estado

**PROPUESTO.** Su uso futuro requiere la rúbrica institucional correspondiente y la evidencia de implementación antes de aplicarlo al sistema real. Actualización de la sesión `sgpm-fase0-correccion-01 — intento runtime1, ronda documental 2/2`: se actualizaron los criterios con columnas de IDs y artefactos mínimos específicos; la verificación correspondiente está **PENDIENTE**. No se llenó la plantilla con PASS ni puntajes.
