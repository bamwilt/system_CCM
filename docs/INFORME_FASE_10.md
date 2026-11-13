# INFORME FASE 10 — Auditoría y controles de seguridad

## Objetivo
Consolidar la trazabilidad de las operaciones críticas del SGPM.

## Implementación
- Endpoint de solo lectura `GET /api/auditoria` protegido por `auditoria:leer`.
- Filtros por accion, entidad, entidadId, usuarioId, rango de fechas y limite.
- Los registros de auditoría se insertan en las transacciones de las operaciones críticas (login, pagos, matrículas, etc.) y no son modificables por usuarios ordinarios (no existen endpoints de escritura/borrado).
- Retención: conservación indefinida por defecto hasta definir política institucional (DEC-14).

## Matriz de controles ISO 27001/27002
Ver `docs/MATRIZ_CONTROLES_ISO27001.md`.

Nota: la implementación de controles del SGPM no equivale a certificar la gestión de seguridad del colegio.
