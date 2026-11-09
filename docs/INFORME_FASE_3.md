# Informe de control — FASE 3

Fecha: 2026-11-08. Versión: 1.0.

**FASE:** 3 — Autenticación, autorización y seguridad.

**OBJETIVO:** Implementar el acceso seguro al SGPM (inicio de sesión, cierre de sesión, gestión de usuarios/roles, permisos por operación, recuperación segura, protección contra intentos reiterados, control de sesiones y registro de eventos de autenticación).

## RESULTADO

**FASE 3 COMPLETADA CON RESERVAS** — entrega técnica provisional implementada y verificada. No se asume aceptación institucional ni matriz de roles definitiva (DEC-03/DEC-16 pendientes).

## ENTREGABLES IMPLEMENTADOS

### Configuración y esquema de seguridad
- `backend/src/config/env.ts`: validación estricta de variables de entorno; producción rechaza credenciales por defecto; TTL de sesión 8h; bcrypt coste 12–14; límite 5 fallos/15 min; límites IP y global; recuperación de contraseña deshabilitada por defecto (503 hasta entrega segura configurada).
- `database/migrations/002_auth_security.sql`: tablas aditivas `auth_sessions` (token hash SHA-256, FK usuario, expiración, revocación), `auth_login_limits` (bloqueo persistente por clave hasheada), `auth_role_permissions` (concesiones auth separadas del seed legacy). Migración idempotente, forward-only, sin transacción envolvente, sin tocar la 001.
- `backend/src/utils/authCrypto.ts`: tokens aleatorios de 32 bytes, hash SHA-256, comparación en tiempo constante, validación de contraseña (12–72 bytes UTF-8), hash dummy para anti-enumeración.
- `backend/src/utils/redact.ts`: redacción recursiva de claves sensibles (password, token, secret, cookie, authorization, email, IP, query), sanitización de errores sin filtrar stack/mensaje/código arbitrario.

### Autenticación
- `backend/src/services/auth.service.ts`: login con bcrypt antes del advisory lock global (4315003), re-lectura de credenciales bajo lock (rechaza si hash/rol/estado cambiaron), sesión opaca en BD con cookie HttpOnly/SameSite/Secure, CSRF derivado por HMAC, logout con revocación atómica, `/me` con perfil seguro, recuperación deshabilitada (503 uniforme, sin revelar existencia de correo).
- `backend/src/middleware/auth.ts`: sesión opaca desde cookie, validación de expiración y revocación.
- `backend/src/middleware/csrf.ts`: validación de origen exacto y token CSRF por sesión en operaciones que cambian estado (incluido logout).
- `backend/src/middleware/rateLimit.ts`: límite persistente por IP (primero), luego global; IP bloqueada no consume global; 429 con Retry-After.
- `backend/src/routes/auth.routes.ts`: validación de Origin y Content-Type ANTES del rate limiter; endpoints `/login`, `/logout`, `/me`, `/recovery` (503).
- `backend/src/middleware/errorHandler.ts`: errores sin filtrar stack/mensaje/código arbitrario; manejo de JSON malformed y payload demasiado grande.

### Autorización
- `backend/src/authorization/permissions.ts`: permisos técnicos `auth:users:manage` / `auth:roles:manage` con denegación por defecto; contexto fresco desde BD (no se confía en caché); helper `assertActiveSession` para validar sesión exacta bajo lock; `canGrant` para impedir escalada de privilegios.
- `backend/src/routes/users.routes.ts` y `backend/src/routes/roles.routes.ts`: GET/POST/PATCH protegidos con advisory lock global, revalidación de sesión del actor bajo lock, revocación de sesiones al cambiar contraseña/rol/actividad, auditoría sin PII.
- `backend/src/scripts/bootstrap-auth.ts`: bootstrap dev opt-in (credenciales por variable de entorno, nunca por argv; confirmación explícita; solo desarrollo; no sobrescribe usuarios existentes; rol técnico con exactamente 2 concesiones auth).

### Pruebas
- 154 pruebas pasando contra PostgreSQL 16 real (socket Unix privado, sin TCP): configuración, criptografía, migración, sesiones, API de autenticación, autorización, concurrencia.
- Typecheck de src y tests: 0 errores.
- Migración aplicada dos veces sin errores; restricciones verificadas (`23514` check, `23503` FK, `23505` unique).
- Seed aplicado; `auth_role_permissions` queda vacío (no se heredan concesiones del seed legacy).

## RESERVAS Y LIMITACIONES

1. **Matriz de roles institucional pendiente (DEC-03):** los roles semilla (ADMIN/COBRADOR/DIRECTOR/CONSULTA) del seed 001 NO se activan como matriz oficial. Las concesiones de auth son técnicas y separadas.
2. **Contrato de sesión pendiente (DEC-14):** expiración (8h propuesto), revocación, bloqueo/desbloqueo, recuperación de cuenta y retención de auditoría requieren ratificación institucional.
3. **Recuperación de contraseña:** deshabilitada hasta que se apruebe e integre un adaptador de entrega seguro (correo u otro).
4. **Interfaz de usuario:** pendiente (fase 9). No hay pantallas de login ni de gestión de usuarios/roles.
5. **No se certifica aceptación institucional:** este informe es evidencia técnica, no un acta de aprobación.

## PRÓXIMOS PASOS (FASE 4+)

- Fase 4: gestión de estudiantes y responsables.
- Fase 5: matrículas y planes de pago.
- Fase 6: motor financiero de mensualidades (FIFO, mora, recibos).
- Fase 9: interfaz web (login, gestión de usuarios/roles).

## ARCHIVOS CREADOS/MODIFICADOS EN FASE 3

Modificados: `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/middleware/errorHandler.ts`, `backend/src/config/database.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/csrf.ts`, `backend/src/middleware/rateLimit.ts`, `backend/src/routes/auth.routes.ts`, `backend/src/routes/users.routes.ts`, `backend/src/routes/roles.routes.ts`, `backend/src/validators/auth.validator.ts`, `backend/package.json`.

Creados: `database/migrations/002_auth_security.sql`, `backend/src/utils/authCrypto.ts`, `backend/src/utils/redact.ts`, `backend/src/utils/cookies.ts`, `backend/src/repositories/auth.repository.ts`, `backend/src/repositories/session.repository.ts`, `backend/src/services/auth.service.ts`, `backend/src/authorization/permissions.ts`, `backend/src/scripts/bootstrap-auth.ts`, `backend/tests/auth/config.test.ts`, `backend/tests/auth/crypto.test.ts`, `backend/tests/auth/migration.test.ts`, `backend/tests/auth/session.test.ts`, `backend/tests/auth/auth-api.test.ts`, `backend/tests/auth/permissions.test.ts`, `backend/tests/auth/concurrency.test.ts`, `backend/tests/auth/testDb.ts`.

Documentación: `docs/INFORME_FASE_3.md` (este documento), `docs/ESTADO_DESARROLLO.md` actualizado.
