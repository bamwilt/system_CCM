# Informe de control — FASE 4

Fecha: 2026-11-08. Versión: 1.0.

**FASE:** 4 — Gestión de estudiantes y responsables.

**OBJETIVO:** Implementar las funciones administrativas relacionadas con estudiantes y tutores/responsables.

## RESULTADO

**FASE 4 COMPLETADA CON RESERVAS** — endpoints REST implementados y verificados. No se asume aceptación institucional ni matriz de roles definitiva (DEC-03 pendiente).

## ENTREGABLES IMPLEMENTADOS

### Backend — Rutas REST
- `GET /api/estudiantes` — listado con paginación y filtro por activo (requiere `estudiantes:read`)
- `GET /api/estudiantes/:id` — detalle de estudiante (requiere `estudiantes:read`)
- `POST /api/estudiantes` — crear estudiante (requiere `estudiantes:manage`, CSRF)
- `PATCH /api/estudiantes/:id` — actualizar estudiante (requiere `estudiantes:manage`, CSRF)
- `PATCH /api/estudiantes/:id/desactivar` — desactivar estudiante (soft-delete, requiere `estudiantes:manage`, CSRF)
- `GET /api/tutores` — listado con paginación y filtro por activo (requiere `tutores:manage`)
- `GET /api/tutores/:id` — detalle de tutor (requiere `tutores:manage`)
- `POST /api/tutores` — crear tutor (requiere `tutores:manage`, CSRF)
- `PATCH /api/tutores/:id` — actualizar tutor (requiere `tutores:manage`, CSRF)
- `PATCH /api/tutores/:id/desactivar` — desactivar tutor (soft-delete, requiere `tutores:manage`, CSRF)
- `POST /api/tutores/:id/estudiantes` — asociar estudiante a tutor (requiere `estudiantes:manage`, CSRF)

### Backend — Capa de dominio y persistencia
- `backend/src/repositories/estudiante.repository.ts` — CRUD, búsqueda por documento, listado, desactivación, verificación de duplicados
- `backend/src/repositories/tutor.repository.ts` — CRUD, búsqueda por documento, listado, listar estudiantes asociados, asociar/desasociar estudiante-tutor
- `backend/src/services/estudiante.service.ts` — servicio con transacciones ACID, advisory lock 4315003, auditoría
- `backend/src/services/tutor.service.ts` — servicio con transacciones ACID, advisory lock 4315003, auditoría
- `backend/src/validators/estudiante.schema.ts` — esquemas Zod para crear y actualizar estudiante
- `backend/src/validators/tutor.schema.ts` — esquemas Zod para crear y actualizar tutor, asociar estudiante

### Base de datos
- `database/migrations/003_estudiantes_tutores_permisos.sql` — permisos técnicos `estudiantes:manage`, `estudiantes:read`, `tutores:manage`
- `database/migrations/004_auth_role_permissions_check.sql` — ampliar CHECK constraint de `auth_role_permissions`
- Tablas `estudiantes`, `tutores`, `estudiante_tutor` ya existían desde fase 2 (sin nueva migración DDL)

### Seguridad
- Todos los endpoints mutantes usan: `requireAuth` → `requirePermission` → `validateCsrf` → advisory lock `pg_advisory_xact_lock(4315003)` → `assertActiveSession` → transacción → auditoría
- Permisos denegación-por-defecto; sin ADMIN bypass
- Soft-delete (`activo = FALSE`) en lugar de borrado físico (RN-SGPM-10)
- Auditoría sin PII (sin contraseñas, tokens ni datos sensibles en `detalle`)

### Pruebas
- `backend/tests/auth/estudiantes.test.ts` — 14 pruebas contra PostgreSQL 16 real (socket Unix)
- Typecheck de src y tests: 0 errores
- Regresión de fase 3: 154 pruebas pasando

## RESERVAS Y LIMITACIONES

1. **Matriz de roles institucional pendiente (DEC-03):** los permisos `estudiantes:manage`, `estudiantes:read`, `tutores:manage` son técnicos de desarrollo; la matriz institucional debe ser ratificada.
2. **Interfaz de usuario pendiente (fase 9):** no hay pantallas React para estudiantes/tutores en esta fase.
3. **No se certificó aceptación institucional:** este informe es evidencia técnica, no un acta de aprobación.

## ARCHIVOS CREADOS/MODIFICADOS

Modificados: `backend/src/app.ts`, `backend/src/authorization/permissions.ts`

Creados: `backend/src/routes/estudiantes.routes.ts`, `backend/src/routes/tutores.routes.ts`, `backend/src/validators/estudiante.schema.ts`, `backend/src/validators/tutor.schema.ts`, `backend/src/services/estudiante.service.ts`, `backend/src/services/tutor.service.ts`, `backend/src/repositories/estudiante.repository.ts`, `backend/src/repositories/tutor.repository.ts`, `database/migrations/003_estudiantes_tutores_permisos.sql`, `database/migrations/004_auth_role_permissions_check.sql`, `backend/tests/auth/estudiantes.test.ts`, `docs/INFORME_FASE_4.md`

## PRÓXIMOS PASOS (FASE 5+)

- Fase 5: matrículas y planes de pago (10 cuotas)
- Fase 6: motor financiero de mensualidades (FIFO, mora, descuentos)
- Fase 9: interfaz web para estudiantes/tutores
