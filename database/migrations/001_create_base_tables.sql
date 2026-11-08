-- SGPM Migration 001: Base tables
-- PostgreSQL 16+

-- Roles
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permisos
CREATE TABLE IF NOT EXISTS permisos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rol-Permiso (many-to-many)
CREATE TABLE IF NOT EXISTS rol_permiso (
    rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

-- Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    rol_id INTEGER NOT NULL REFERENCES roles(id),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Estudiantes
CREATE TABLE IF NOT EXISTS estudiantes (
    id SERIAL PRIMARY KEY,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE,
    genero VARCHAR(10),
    documento_identidad VARCHAR(50),
    direccion TEXT,
    telefono VARCHAR(20),
    email VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tutores / Acudientes
CREATE TABLE IF NOT EXISTS tutores (
    id SERIAL PRIMARY KEY,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    documento_identidad VARCHAR(50),
    telefono VARCHAR(20),
    email VARCHAR(255),
    direccion TEXT,
    parentesco VARCHAR(50),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relacion Estudiante-Tutor (many-to-many)
CREATE TABLE IF NOT EXISTS estudiante_tutor (
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    tutor_id INTEGER NOT NULL REFERENCES tutores(id) ON DELETE CASCADE,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (estudiante_id, tutor_id)
);

-- Anio lectivo
CREATE TABLE IF NOT EXISTS anio_lectivo (
    id SERIAL PRIMARY KEY,
    anio INTEGER NOT NULL UNIQUE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grados / Niveles
CREATE TABLE IF NOT EXISTS grados (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    nivel VARCHAR(50) NOT NULL,
    anio_lectivo_id INTEGER NOT NULL REFERENCES anio_lectivo(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nombre, anio_lectivo_id)
);

-- Tarifas
CREATE TABLE IF NOT EXISTS tarifas (
    id SERIAL PRIMARY KEY,
    concepto VARCHAR(100) NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'NIO',
    anio_lectivo_id INTEGER REFERENCES anio_lectivo(id),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matriculas
CREATE TABLE IF NOT EXISTS matriculas (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
    anio_lectivo_id INTEGER NOT NULL REFERENCES anio_lectivo(id),
    grado_id INTEGER NOT NULL REFERENCES grados(id),
    tutor_id INTEGER REFERENCES tutores(id),
    fecha_matricula TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    observaciones TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (estudiante_id, anio_lectivo_id)
);

-- Plan de pagos (10 cuotas)
CREATE TABLE IF NOT EXISTS planes_pago (
    id SERIAL PRIMARY KEY,
    matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    total_cuotas INTEGER NOT NULL DEFAULT 10,
    monto_cuota NUMERIC(12, 2) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mensualidades / Cuotas
CREATE TABLE IF NOT EXISTS mensualidades (
    id SERIAL PRIMARY KEY,
    plan_pago_id INTEGER NOT NULL REFERENCES planes_pago(id) ON DELETE CASCADE,
    numero_cuota INTEGER NOT NULL,
    concepto VARCHAR(100) NOT NULL,
    monto_original NUMERIC(12, 2) NOT NULL,
    monto_pagado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    saldo_pendiente NUMERIC(12, 2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    mora_aplicada NUMERIC(12, 2) NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_pago_id, numero_cuota)
);

-- Pagos (cabecera)
CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
    matricula_id INTEGER REFERENCES matriculas(id),
    monto_total NUMERIC(12, 2) NOT NULL,
    fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotencia_key VARCHAR(255) UNIQUE,
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADO',
    usuario_id INTEGER REFERENCES usuarios(id),
    observaciones TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Medios de pago
CREATE TABLE IF NOT EXISTS pago_medios (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    referencia VARCHAR(255),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aplicaciones de pago (FIFO)
CREATE TABLE IF NOT EXISTS pago_aplicaciones (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    mensualidad_id INTEGER NOT NULL REFERENCES mensualidades(id),
    monto_aplicado NUMERIC(12, 2) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recibos
CREATE TABLE IF NOT EXISTS recibos (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    numero_recibo VARCHAR(50) NOT NULL UNIQUE,
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anulaciones / Reversiones
CREATE TABLE IF NOT EXISTS anulaciones (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id),
    motivo TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    fecha_anulacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auditoria
CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    accion VARCHAR(100) NOT NULL,
    entidad VARCHAR(100) NOT NULL,
    entidad_id INTEGER,
    detalle JSONB,
    ip_address VARCHAR(45),
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_mensualidades_plan ON mensualidades(plan_pago_id);
CREATE INDEX IF NOT EXISTS idx_mensualidades_estado ON mensualidades(estado);
CREATE INDEX IF NOT EXISTS idx_mensualidades_vencimiento ON mensualidades(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_estudiante ON pagos(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_pago ON pago_aplicaciones(pago_id);
CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_mensualidad ON pago_aplicaciones(mensualidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_estudiante ON matriculas(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_anio ON matriculas(anio_lectivo_id);
