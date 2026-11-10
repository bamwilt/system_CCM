-- SGPM Migration 004: Ampliar CHECK constraint de auth_role_permissions
-- PostgreSQL 16+
-- Forward-only, idempotent migration.

-- Al re-aplicarse NO reduce el catalogo: conserva todos los codigos vigentes.
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

-- Sin concesiones automaticas a roles institucionales: la matriz esta pendiente (DEC-03).
