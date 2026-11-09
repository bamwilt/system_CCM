-- SGPM Migration 003: Permisos de estudiantes y tutores
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No transaction wrappers.

-- Permisos de estudiantes y tutores (códigos técnicos, no roles institucionales)
INSERT INTO permisos (codigo, descripcion) VALUES
    ('estudiantes:manage', 'Gestionar estudiantes (crear, editar, desactivar)'),
    ('estudiantes:read', 'Leer listado y detalle de estudiantes'),
    ('tutores:manage', 'Gestionar tutores/responsables (crear, editar, desactivar, asociar)')
ON CONFLICT (codigo) DO NOTHING;

-- Concesiones de permisos a roles existentes
-- Nota: estos roles son técnicos de desarrollo; la matriz institucional está pendiente (DEC-03)
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre IN ('ADMIN', 'COBRADOR', 'DIRECTOR', 'CONSULTA')
  AND p.codigo IN ('estudiantes:manage', 'estudiantes:read', 'tutores:manage')
ON CONFLICT DO NOTHING;

-- También registrar en auth_role_permissions para consistencia con el modelo de auth
INSERT INTO auth_role_permissions (rol_id, permiso_codigo)
SELECT r.id, p.codigo
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre IN ('ADMIN', 'COBRADOR', 'DIRECTOR', 'CONSULTA')
  AND p.codigo IN ('estudiantes:manage', 'estudiantes:read', 'tutores:manage')
ON CONFLICT DO NOTHING;
