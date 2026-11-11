-- SGPM Migration 009: Fase 7.A - Comprobantes de pago, estado de reversion en pagos y permisos de pagos
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No BEGIN/COMMIT of its own
-- (the migration runner wraps each file in its own transaction). No row deletion,
-- no mass UPDATE, no rows inserted into auth_role_permissions and no grants to
-- institutional roles (DEC-03 remains open; the matrix is pending).
--
-- Referencias: PM FASE 7 (identificadores unicos de comprobante; la emision de un
-- comprobante no altera el saldo; anulaciones sin eliminacion silenciosa),
-- DEC-08 (reversion compensatoria con referencia, actor, motivo y fecha),
-- DEC-10 (correlativos: formato/serie/reinicio anual pendientes de ratificacion).
--
-- =====================================================================
-- 0) DECISIONES DE MODELADO (quedan aqui, no dispersas en el codigo)
-- =====================================================================
-- A) Identificador del comprobante: NUNCA MAX(id)+1 (pierde con dos INSERT
--    concurrentes). Se usa un contador por ano en `comprobantes_correlativos`
--    incrementado con un unico INSERT ... ON CONFLICT DO UPDATE ... RETURNING:
--    equivalente a una secuencia (no depende de lecturas previas) pero
--    reiniciable por ano sin DDL, porque DEC-10 todavia no ratifica serie ni
--    reinicio anual. El controlador de concurrencia es la fila del ano (bloqueo
--    de fila), no una relectura: dos transacciones concurrentes obtienen dos
--    valores distintos garantizados. Como el incremento ocurre dentro de la
--    transaccion del comprobante, una transaccion abortada no deja hueco.
--    Ultima linea de defensa: UNIQUE (numero_comprobante).
-- B) Copia fiel (snapshot): monto_total, moneda, fecha del pago, nombre del
--    estudiante, grado y ano lectivo. Son lo que el comprobante impreso debe
--    mostrar y no deben derivar con el tiempo (un nombre corregido o una
--    matricula reasignada no cambia un comprobante ya emitido).
-- C) Referencia viva: pago_id (FK), estudiante_id, matricula_id y usuario_id
--    emisor. Son las relaciones, no copias de estado.
-- D) NO se duplican importes de unica fuente: `pago_aplicaciones.monto_aplicado`
--    y `mensualidades.saldo_pendiente` siguen viviendo solo donde se calculan.
--    El comprobante copia el importe recibido de la cabecera (`pagos.monto_total`)
--    en el momento de emitir, y no almacena saldos derivados: el saldo se
--    consulta, no se imprime congelado. La emision del comprobante no escribe
--    saldos ni cuotas (PM FASE 7: "no debe alterar independientemente el saldo").
-- E) Reversion: la fila original del pago NO se borra ni se reescribe: conserva
--    sus datos y gana un estado final 'REVERTIDO' con referencia de la operacion
--    que la reversa, motivo, actor y fecha (DEC-08). No hay DELETE ni UPDATE
--    masivo en esta migracion: las columnas se agregan nulas y las filas
--    existentes quedan sin reversal registrado.

-- =====================================================================
-- 1) CONTADOR CORRELATIVO POR ANO (equivalente a secuencia, sin MAX()+1)
-- =====================================================================
CREATE TABLE IF NOT EXISTS comprobantes_correlativos (
    anio SMALLINT PRIMARY KEY,
    ultimo_valor BIGINT NOT NULL DEFAULT 0,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comprobantes_correlativos_anio_check CHECK (anio BETWEEN 2000 AND 2999),
    CONSTRAINT comprobantes_correlativos_ultimo_check CHECK (ultimo_valor >= 0)
);

-- El ano del correlativo deriva de la zona horaria de la sesion de PostgreSQL.
-- Pendiente de ratificacion: DEC-05 debe fijar la zona horaria institucional.
CREATE OR REPLACE FUNCTION fn_comprobantes_asignar_numero() RETURNS trigger AS $$
DECLARE
    v_anio SMALLINT;
    v_ultimo BIGINT;
BEGIN
    v_anio := EXTRACT(YEAR FROM NOW())::SMALLINT;

    -- Upsert atomico: la fila del ano se bloquea en memoria, por lo que dos
    -- transacciones concurrentes no pueden leer el mismo valor. El valor se
    -- devuelve en la misma sentencia (no hay relectura que pueda colisionar).
    INSERT INTO comprobantes_correlativos (anio, ultimo_valor)
    VALUES (v_anio, 1)
    ON CONFLICT (anio) DO UPDATE
        SET ultimo_valor = comprobantes_correlativos.ultimo_valor + 1,
            actualizado_en = NOW()
    RETURNING ultimo_valor INTO v_ultimo;

    NEW.anio := v_anio;
    -- Formato provisional: DEC-10 no ha ratificado serie ni reinicio anual.
    -- Si se ratifica otro formato, se sustituye esta linea y el CHECK de abajo.
    NEW.numero_comprobante := 'CMP-' || v_anio::TEXT || '-' || LPAD(v_ultimo::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE comprobantes_correlativos IS
  'Correlativo anual de comprobantes. Valor asignado por fn_comprobantes_asignar_numero '
  'con INSERT ... ON CONFLICT DO UPDATE (atomicidad garantizada, sin MAX()+1). '
  'DEC-10 (formato/serie/reinicio) permanece pendiente de ratificacion.';

-- =====================================================================
-- 2) TABLA DE COMPROBANTES (uno por pago)
-- =====================================================================
-- ON DELETE RESTRICT sobre pagos: un pago con comprobante emitido no puede
-- borrarse silenciosamente (PM FASE 7 / DEC-08). No borra filas: impide el borrado.
CREATE TABLE IF NOT EXISTS comprobantes (
    id BIGSERIAL PRIMARY KEY,
    numero_comprobante VARCHAR(50) NOT NULL,
    pago_id INTEGER NOT NULL,
    anio SMALLINT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'EMITIDO',
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Copia fiel congelada al emitir (ver decisiones 0.B).
    monto_total NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3),
    pago_fecha TIMESTAMPTZ NOT NULL,
    estudiante_nombre VARCHAR(201) NOT NULL,
    grado_nombre VARCHAR(50),
    anio_lectivo INTEGER,

    -- Referencias vivas (ver decision 0.C).
    estudiante_id INTEGER NOT NULL,
    matricula_id INTEGER,
    usuario_id INTEGER,

    observaciones TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Identificador unico del comprobante y un solo comprobante por pago.
    CONSTRAINT comprobantes_numero_unique UNIQUE (numero_comprobante),
    CONSTRAINT comprobantes_pago_unique UNIQUE (pago_id),

    CONSTRAINT comprobantes_numero_formato_check
        CHECK (numero_comprobante ~ '^CMP-[0-9]{4}-[0-9]{6}$'),
    -- Estado del COMPROBANTE, no del pago: 'ANULADO' lo fija el flujo de
    -- reversion (subfase 7.B) sobre esta fila, dentro de la misma transaccion
    -- que reversa el pago. La unica fuente de "el pago fue revertido" sigue
    -- siendo `pagos` (estado + columnas de reversion).
    CONSTRAINT comprobantes_estado_check CHECK (estado IN ('EMITIDO', 'ANULADO')),
    CONSTRAINT comprobantes_anio_check CHECK (anio BETWEEN 2000 AND 2999),
    -- Un comprobante de importe cero no es una operacion de cobro.
    CONSTRAINT comprobantes_monto_check CHECK (monto_total > 0),
    CONSTRAINT comprobantes_pago_fkey
        FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE RESTRICT,
    CONSTRAINT comprobantes_estudiante_fkey
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE RESTRICT,
    CONSTRAINT comprobantes_matricula_fkey
        FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE RESTRICT
);

COMMENT ON COLUMN comprobantes.numero_comprobante IS
  'Identificador unico y secuencial por ano. Lo asigna el trigger BEFORE INSERT '
  'fn_comprobantes_asignar_numero (contador atomico por ano); un numero inyectado '
  'por el cliente se ignora. Nunca MAX()+1. Formato provisional (DEC-10): CMP-AAAA-NNNNNN.';
COMMENT ON COLUMN comprobantes.estado IS
  'Ciclo del comprobante: EMITIDO o ANULADO. No copia el estado del pago.';
COMMENT ON COLUMN comprobantes.fecha_emision IS
  'Momento de emision del comprobante (NOW() por defecto).';
COMMENT ON COLUMN comprobantes.monto_total IS
  'Copia fiel del importe recibido (pagos.monto_total) en el momento de emitir. '
  'No es una segunda fuente de verdad: el importe oficial vive en pagos y las '
  'aplicaciones en pago_aplicaciones/mensualidades.';
COMMENT ON COLUMN comprobantes.moneda IS
  'Copia fiel de la moneda del plan de pago al emitir. Nullable: DEC-05 no ha '
  'ratificado la moneda operativa ni planes_pago.moneda puede quedar nula.';
COMMENT ON COLUMN comprobantes.pago_fecha IS
  'Copia fiel de la fecha efectiva del pago (pagos.fecha_pago) que se imprime.';
COMMENT ON COLUMN comprobantes.estudiante_nombre IS
  'Copia fiel del nombre impreso del estudiante al emitir.';
COMMENT ON COLUMN comprobantes.anio IS
  'Ano del correlativo, asignado por el trigger. Util para reportes por periodo.';
COMMENT ON COLUMN comprobantes.usuario_id IS
  'Emisor registrado. Sin FOREIGN KEY: registro historico del actor (patron 008).';

-- `usuario_id` es el emisor registrado, SIN FOREIGN KEY a proposito (mismo
-- patron que `matriculas.creado_por_usuario_id`, migracion 008): es un registro
-- historico del actor, no una relacion viva. Una FK obligaria a tocar
-- `comprobantes` al modificar usuarios (los usuarios no se borran fisicamente:
-- soft-delete via `activo`).

CREATE INDEX IF NOT EXISTS idx_comprobantes_anio ON comprobantes(anio);
CREATE INDEX IF NOT EXISTS idx_comprobantes_estudiante ON comprobantes(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha_emision ON comprobantes(fecha_emision);

-- Idempotencia: PostgreSQL no admite CREATE TRIGGER IF NOT EXISTS; se usa el
-- patron DROP TRIGGER IF EXISTS + CREATE TRIGGER (igual que en `pagos`).
DROP TRIGGER IF EXISTS trg_comprobantes_asignar_numero ON comprobantes;
CREATE TRIGGER trg_comprobantes_asignar_numero
    BEFORE INSERT ON comprobantes
    FOR EACH ROW
    EXECUTE FUNCTION fn_comprobantes_asignar_numero();

COMMENT ON TABLE comprobantes IS
  'Un comprobante por pago (UNIQUE pago_id). Identificador unico desde contador '
  'por ano (fn_comprobantes_asignar_numero), nunca MAX()+1. Copia fiel del importe '
  'recibido y de los datos impresos; los saldos y aplicaciones siguen siendo de '
  'unica fuente en pago_aplicaciones/mensualidades.';

-- =====================================================================
-- 3) ESTADO DE REVERSION EN pagos (la operacion original no se borra)
-- =====================================================================
-- Columnas de reversion: aditivas y sin backfill. Las filas existentes quedan
-- con todos los campos NULL (sin reversion registrada); no se reescribe ninguna.
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS reversion_pago_id INTEGER;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS revertido_motivo TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS revertido_por_usuario_id INTEGER;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS revertido_en TIMESTAMPTZ;

-- Precheck (patron de la migracion 007): si existieran filas incompatibles con
-- las nuevas restricciones, la migracion se detiene sin borrar ni reescribir nada.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pagos
        WHERE (estado = 'REVERTIDO' AND reversion_pago_id IS NULL)
           OR (estado <> 'REVERTIDO' AND reversion_pago_id IS NOT NULL)
           OR (reversion_pago_id IS NOT NULL AND (
                revertido_en IS NULL OR revertido_por_usuario_id IS NULL
                OR revertido_motivo IS NULL OR length(btrim(revertido_motivo)) = 0
                OR reversion_pago_id = id OR revertido_en < creado_en))
    ) THEN
        RAISE EXCEPTION 'pagos contiene filas incompatibles con el estado de reversion. No se agregan las restricciones: revisar los datos manualmente.';
    END IF;
END $$;

-- Referencia de la reversion: la operacion que reversa (reversion compensatoria
-- de DEC-08). SIN ON DELETE: impedir borrar la operacion que reversa.
-- `revertido_por_usuario_id` SIN FOREIGN KEY a proposito (patron de 008):
-- registro historico del actor responsable.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_pago_id_fkey;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_pago_id_fkey
    FOREIGN KEY (reversion_pago_id) REFERENCES pagos(id) ON DELETE RESTRICT;

-- Todo o nada: la reversion se registra con referencia, motivo, actor y fecha.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_atomica_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_atomica_check CHECK (
    (reversion_pago_id IS NULL AND revertido_en IS NULL
        AND revertido_por_usuario_id IS NULL AND revertido_motivo IS NULL)
    OR
    (reversion_pago_id IS NOT NULL AND revertido_en IS NOT NULL
        AND revertido_por_usuario_id IS NOT NULL AND revertido_motivo IS NOT NULL)
);

-- Estado final explicito: 'REVERTIDO' si y solo si hay reversion registrada.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_estado_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_estado_check CHECK (
    (estado = 'REVERTIDO' AND reversion_pago_id IS NOT NULL)
    OR (estado <> 'REVERTIDO' AND reversion_pago_id IS NULL)
);

-- Un pago no puede ser su propia reversion.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_no_autoreferencia_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_no_autoreferencia_check
    CHECK (reversion_pago_id IS NULL OR reversion_pago_id <> id);

-- Motivo obligatorio y con contenido cuando hay reversion.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_motivo_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_motivo_check
    CHECK (revertido_motivo IS NULL OR length(btrim(revertido_motivo)) > 0);

-- La reversion no puede ser anterior a la operacion que reversa.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_reversion_fecha_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_reversion_fecha_check
    CHECK (revertido_en IS NULL OR revertido_en >= creado_en);

-- Indice parcial: localizar pagos revertidos sin depender del estado.
CREATE INDEX IF NOT EXISTS idx_pagos_reversion_pago ON pagos(reversion_pago_id)
    WHERE reversion_pago_id IS NOT NULL;

-- Reversion unica e irreversible: la segunda reversion (o cualquier reapertura
-- del estado final) ABORTA sin borrar ni reescribir la fila original.
-- Los cambios sobre columnas ajenas a la reversion (por ejemplo observaciones)
-- siguen permitidos: la restriccion es sobre la reversion, no sobre la correccion.
CREATE OR REPLACE FUNCTION fn_pagos_reversion_unica() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Un pago no puede nacer revertido: la reversion es un evento posterior
        -- sobre una operacion COMPLETADA, nunca un estado inicial.
        IF NEW.estado = 'REVERTIDO' OR NEW.reversion_pago_id IS NOT NULL THEN
            RAISE EXCEPTION 'Un pago nuevo no puede registrarse revertido (estado %, reversion %)',
                NEW.estado, NEW.reversion_pago_id
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.estado = 'REVERTIDO' OR OLD.reversion_pago_id IS NOT NULL THEN
        IF NEW.estado IS DISTINCT FROM OLD.estado
            OR NEW.reversion_pago_id IS DISTINCT FROM OLD.reversion_pago_id
            OR NEW.revertido_en IS DISTINCT FROM OLD.revertido_en
            OR NEW.revertido_por_usuario_id IS DISTINCT FROM OLD.revertido_por_usuario_id
            OR NEW.revertido_motivo IS DISTINCT FROM OLD.revertido_motivo
        THEN
            -- 23505 (unique_violation): la traduccion existente a 409 CONFLICT del
            -- proyecto cubre "operacion ya realizada" sin filtrar el driver.
            RAISE EXCEPTION 'El pago % ya fue revertido: no se admite una segunda reversion ni reabrir su estado final',
                OLD.id USING ERRCODE = '23505';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagos_reversion_unica ON pagos;
CREATE TRIGGER trg_pagos_reversion_unica
    BEFORE INSERT OR UPDATE ON pagos
    FOR EACH ROW
    EXECUTE FUNCTION fn_pagos_reversion_unica();

COMMENT ON COLUMN pagos.reversion_pago_id IS
  'Referencia de reversion (DEC-08): operacion que reversa este pago. '
  'Un comprobante por pago con estado EMITIDO/ANULADO refleja la reversion.';
COMMENT ON COLUMN pagos.revertido_motivo IS
  'Motivo de la reversion, obligatorio y no vacio cuando hay reversion.';
COMMENT ON COLUMN pagos.revertido_por_usuario_id IS
  'Actor responsable de la reversion. Sin FK: registro historico (patron 008).';
COMMENT ON COLUMN pagos.revertido_en IS
  'Fecha de la reversion, no anterior a la creacion del pago.';

-- =====================================================================
-- 4) CATALOGO DE PERMISOS (ampliar CHECK sin reducir lo existente)
-- =====================================================================
-- Patron de 004/006: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Al reejecutarse
-- NO reduce el catalogo: se declaran todos los codigos vigentes.
-- Se agregan pagos:manage y pagos:read (FASE 7). Los codigos legacy del seed
-- (pagos:leer, pagos:escribir, reportes:leer, auditoria:leer) NO entran aqui:
-- pertenecen a la tabla legacy `permisos` (DEC-19).
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
        'pagos:read'
    )
);

-- Sin concesiones automaticas a roles institucionales: la matriz de permisos
-- esta pendiente (DEC-03). Esta migracion NO inserta filas en
-- auth_role_permissions ni concede nada a ADMIN/COBRADOR/DIRECTOR/CONSULTA.
