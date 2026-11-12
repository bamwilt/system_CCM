-- SGPM Migration 010: Permiso de lectura de reportes (FASE 8)
-- PostgreSQL 16+
-- Forward-only, idempotent migration. No transaction wrappers.
-- No borra filas, no hace UPDATE masivo, no concede permisos a roles.

-- Permiso tecnico de los reportes de la FASE 8. Codigo alineado con
-- backend/src/authorization/permissions.ts (AUTH_PERMISSIONS.REPORTES_READ).
INSERT INTO permisos (codigo, descripcion) VALUES
    ('reportes:read', 'Consultar reportes financieros y administrativos')
ON CONFLICT (codigo) DO NOTHING;

-- Ampliar el CHECK de auth_role_permissions SIN reducir el catalogo existente
-- (patron de 004/006/009). Al reaplicarse conserva todos los codigos vigentes.
ALTER TABLE auth_role_permissions DROP CONSTRAINT IF EXISTS auth_role_permissions_codigo_check;
ALTER TABLE auth_role_permissions ADD CONSTRAINT auth_role_permissions_codigo_check CHECK (
    permiso_codigo IN (
        'auth:users:manage',
        'auth:roles:manage',
        'estudiantes:manage',
        'estudiantes:read',
        'tutores:manage',
        'matriculas:manage',
        'matriculas:read',
        'pagos:manage',
        'pagos:read',
        'reportes:read'
    )
);

-- Sin concesiones automaticas a roles institucionales: la matriz de permisos
-- institucionales sigue pendiente (DEC-03).
