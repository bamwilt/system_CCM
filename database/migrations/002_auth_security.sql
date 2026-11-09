-- SGPM Migration 002: Authentication and security tables
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No transaction wrappers.

-- Auth sessions (opaque hashed token is the primary key)
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    csrf_hash CHAR(64) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (token_hash),
    CONSTRAINT auth_sessions_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT auth_sessions_csrf_hash_hex CHECK (csrf_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > creado_en)
);

-- Login/rate-limit buckets. bucket_key is a hashed, prefixed value; never store raw email or IP.
CREATE TABLE IF NOT EXISTS auth_login_limits (
    bucket_key VARCHAR(128) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0,
    blocked_until TIMESTAMPTZ,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket_key),
    CONSTRAINT auth_login_limits_attempts_nonnegative CHECK (attempts >= 0)
);

-- Separate auth-specific grants. No rows are inserted by this migration.
CREATE TABLE IF NOT EXISTS auth_role_permissions (
    rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permiso_codigo VARCHAR(100) NOT NULL,
    PRIMARY KEY (rol_id, permiso_codigo),
    CONSTRAINT auth_role_permissions_codigo_check CHECK (
        permiso_codigo IN ('auth:users:manage', 'auth:roles:manage')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auth_sessions_usuario_id ON auth_sessions(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_login_limits_blocked_until ON auth_login_limits(blocked_until);
CREATE INDEX IF NOT EXISTS idx_auth_role_permissions_rol_id ON auth_role_permissions(rol_id);