# INFORME FASE 11 — Pruebas integrales y aseguramiento de calidad

## Objetivo
Comprobar el funcionamiento del sistema completo.

## Estado
Suite integral ejecutada contra el clúster PostgreSQL de pruebas aprobado
(TEST_DATABASE_URL sobre socket Unix `.tmp/test-artifacts/sgpm-fase3-db`, puerto 55433,
BD `sgpm_auth_test`, usuario `sgpm_test`, migraciones 001..010 aplicadas).

Resultados reales:
- Test files: 17 passed | 2 failed (19 total)
- Tests: 317 passed | 38 skipped (355 total)
- Duración: ~196 s

## Fallos registrados
1. `tests/motor-aplicacion.test.ts` — falla (detalle en log de ejecución).
2. `tests/proyecciones-financieras.test.ts` — violación de check constraint
   `auth_role_permissions_codigo_check` al re-aplicar migraciones sobre una BD con datos
   residuales de ejecuciones previas (fila con permiso `invalid:perm`).

## Pruebas unitarias ejecutadas
- Typecheck de backend: exit 0.
- Suites sin dependencia de BD: 4 archivos PASS.

## Limitaciones
- 2 suites de integración fallan; el resto (17 archivos, 317 tests) pasa.
- No se registran resultados ficticios.

## Próximo paso
Investigar y corregir los 2 fallos registrados, luego reejecutar la suite completa.
