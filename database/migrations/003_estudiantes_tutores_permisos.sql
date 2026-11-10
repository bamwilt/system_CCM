-- SGPM Migration 003: Permisos de estudiantes y tutores
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No transaction wrappers.

-- Permisos de estudiantes y tutores (codigos tecnicos, no roles institucionales)
INSERT INTO permisos (codigo, descripcion) VALUES
    ('estudiantes:manage', 'Gestionar estudiantes (crear, editar, desactivar)'),
    ('estudiantes:read', 'Leer listado y detalle de estudiantes'),
    ('tutores:manage', 'Gestionar tutores/responsables (crear, editar, desactivar, asociar)')
ON CONFLICT (codigo) DO NOTHING;

-- Ampliar CHECK de auth_role_permissions ANTES de insertar en ella.
-- Catalogo global preservado: todos los codigos de permiso vigentes.
ALTER TABLE auth_role_permissions DROP CONSTRAINT IF EXISTS auth_role_permissions_codigo_check;
ALTER TABLE auth_role_permissions ADD CONSTRAINT auth_role_permissions_codigo_check CHECK (
    permiso_codigo IN (
        'auth:users:manage',
        'auth:roles:manage',
        'estudiantes:manage',
        'estudiantes:read',
        'tutores:manage',
        'matriculas:manage',
        'matriculas:read'
    )
);

-- Sin concesiones automaticas a roles institucionales ADMIN/COBRADOR/DIRECTOR/CONSULTA:
-- la matriz de permisos institucionales esta pendiente (DEC-03).
