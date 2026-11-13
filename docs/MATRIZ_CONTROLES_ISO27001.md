# Matriz de controles ISO 27001/27002 (SGPM)

| Riesgo | Control | Responsable | Implementación | Evidencia | Resultado | Estado |
|---|---|---|---|---|---|---|
| Acceso no autorizado | Autenticación + RBAC | Admin TI | middleware/auth, permissions | tests fase 3 | OK | Implementado |
| Fuga de secretos | Sin secretos por defecto | Dev | env.ts | typecheck | OK | Implementado |
| Pérdida de trazabilidad | Auditoría append-only | Dev | auditoria table + endpoint | INFORME_FASE_10 | OK | Implementado |
| Manipulación financiera | Transacciones + advisory lock | Dev | pagos.service | tests fase 7 | OK | Implementado |
| Mora incorrecta | Motor financiero único | Dev | politicas-financieras.ts | tests fase 6B | OK | Implementado |
