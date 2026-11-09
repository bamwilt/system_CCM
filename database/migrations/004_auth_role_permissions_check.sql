-- SGPM Migration 004: Ampliar CHECK constraint de auth_role_permissions
-- PostgreSQL 16+
-- Forward-only, idempotent migration.

-- Eliminar y volver a crear el CHECK constraint para incluir permisos de estudiantes/tutores
ALTER TABLE auth_role_permissions DROP CONSTRAINT IF EXISTS auth_role_permissions_codigo_check;
ALTER TABLE auth_role_permissions ADD CONSTRAINT auth_role_permissions_codigo_check CHECK (
    permiso_codigo IN ('auth:users:manage', 'auth:roles:manage', 'estudiantes:manage', 'estudiantes:read', 'tutores:manage')
);

-- Re-insertar concesiones en auth_role_permissions (idempotente)
INSERT INTO auth_role_permissions (rol_id, permiso_codigo)
SELECT r.id, p.codigo
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre IN ('ADMIN', 'COBRADOR', 'DIRECTOR', 'CONSULTA')
  AND p.codigo IN ('estudiantes:manage', 'estudiantes:read', 'tutores:manage')
ON CONFLICT DO NOTHING;
