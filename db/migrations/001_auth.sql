-- ============================================================================
--  Migración 001 - Autenticación y roles
--
--  El esquema original define la tabla `usuarios` únicamente con
--  (usuario_id, nombre). No hay ningún campo que permita autenticarse ni
--  diferenciar permisos, así que la aplicación no podría iniciar sesión.
--
--  Esta migración añade lo mínimo necesario sin alterar el modelo original:
--    email         correo institucional, con restricción UNIQUE
--    password_hash hash bcrypt (NUNCA la contraseña en claro)
--    rol           admin | secretaria | docente | consulta
--    activo        baja lógica, evita borrar usuarios referenciados por orden_pago
--    creado_en     auditoría
-- ============================================================================

BEGIN;

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS email           character varying(120),
    ADD COLUMN IF NOT EXISTS password_hash   text,
    ADD COLUMN IF NOT EXISTS rol             character varying(20) NOT NULL DEFAULT 'consulta',
    ADD COLUMN IF NOT EXISTS activo          boolean      NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS creado_en       timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- El email es la credencial de acceso: debe ser único y no admits nulos
-- cuando el usuario ya fue dado de alta.
ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);

ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('admin', 'secretaria', 'docente', 'consulta'));

-- Restricción de seguridad: ningún usuario puede quedarse sin hash.
-- Permite filas legacy (email NULL) pero exige password si hay email.
ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_credenciales_check
    CHECK (email IS NULL OR password_hash IS NOT NULL);

COMMENT ON COLUMN public.usuarios.password_hash IS 'Hash bcrypt (cost 12). Nunca almacenar la contraseña en claro.';
COMMENT ON TABLE  public.usuarios IS 'Usuarios del sistema. El login se hace por email + contraseña.';

COMMIT;