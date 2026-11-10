-- SGPM Seed 001: Base data

-- Roles
INSERT INTO roles (nombre, descripcion) VALUES
    ('ADMIN', 'Administrador del sistema'),
    ('COBRADOR', 'Operador de ventanilla de cobros'),
    ('DIRECTOR', 'Director del colegio'),
    ('CONSULTA', 'Consulta de reportes')
ON CONFLICT (nombre) DO NOTHING;

-- Permisos basicos
-- Los codigos de los dominios ya implementados deben coincidir con
-- backend/src/authorization/permissions.ts (AUTH_PERMISSIONS).
-- Los codigos de pagos/reportes/auditoria (fases futuras) se conservan tal cual.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('estudiantes:read', 'Leer listado y detalle de estudiantes'),
    ('estudiantes:manage', 'Gestionar estudiantes (crear, editar, desactivar)'),
    ('tutores:manage', 'Gestionar tutores/responsables (crear, editar, desactivar, asociar)'),
    ('matriculas:read', 'Leer listado y detalle de matriculas'),
    ('matriculas:manage', 'Gestionar matriculas (crear, editar, desactivar)'),
    ('pagos:leer', 'Leer pagos'),
    ('pagos:escribir', 'Registrar pagos'),
    ('reportes:leer', 'Leer reportes'),
    ('auditoria:leer', 'Leer auditoria')
ON CONFLICT (codigo) DO NOTHING;

-- Rol-Permiso: ADMIN gets all
INSERT INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Anio lectivo 2026
INSERT INTO anio_lectivo (anio, fecha_inicio, fecha_fin, activo) VALUES
    (2026, '2026-02-01', '2026-11-30', TRUE)
ON CONFLICT (anio) DO NOTHING;

-- Grados para 2026
INSERT INTO grados (nombre, nivel, anio_lectivo_id)
SELECT g.nombre, g.nivel, a.id
FROM (VALUES
    ('Preescolar', 'Preescolar'),
    ('1er Grado', 'Primaria'),
    ('2do Grado', 'Primaria'),
    ('3er Grado', 'Primaria'),
    ('4to Grado', 'Primaria'),
    ('5to Grado', 'Primaria'),
    ('6to Grado', 'Primaria'),
    ('1er Anio', 'Secundaria'),
    ('2do Anio', 'Secundaria'),
    ('3er Anio', 'Secundaria'),
    ('4to Anio', 'Secundaria'),
    ('5to Anio', 'Secundaria')
) AS g(nombre, nivel)
CROSS JOIN anio_lectivo a
WHERE a.anio = 2026
ON CONFLICT (nombre, anio_lectivo_id) DO NOTHING;

-- Tarifas de ejemplo para 2026
INSERT INTO tarifas (concepto, monto, moneda, anio_lectivo_id, activo)
SELECT t.concepto, t.monto, 'NIO', a.id, TRUE
FROM (VALUES
    ('Matricula', 1500.00),
    ('Mensualidad', 800.00),
    ('Uniforme', 500.00)
) AS t(concepto, monto)
CROSS JOIN anio_lectivo a
WHERE a.anio = 2026
ON CONFLICT DO NOTHING;

-- Usuario admin de prueba (password: admin123 - solo desarrollo)
INSERT INTO usuarios (email, password_hash, nombre, apellido, rol_id)
SELECT 'admin@sgpm.local', '$2a$10$placeholder_hash_change_in_production', 'Admin', 'Sistema',
       r.id
FROM roles r WHERE r.nombre = 'ADMIN'
ON CONFLICT (email) DO NOTHING;
