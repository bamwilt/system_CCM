-- SGPM Migration 008: Cierre de defaults financieros de produccion e idempotencia de matricula
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No transaction wrappers.
-- No borra filas, no hace UPDATE masivo, no inserta permisos ni concede roles.

-- 1) planes_pago.total_cuotas sin default: el numero de cuotas es una decision
--    institucional pendiente (DEC-04) y no puede quedar fijado por el esquema.
--    DROP DEFAULT es idempotente: aplicarlo sobre una columna ya sin default es un no-op.
--    La columna permanece NOT NULL; no se reescribe ninguna fila.
ALTER TABLE planes_pago ALTER COLUMN total_cuotas DROP DEFAULT;

-- 2) tarifas.moneda sin default: la moneda institucional no esta aprobada
--    (DEC-04/DEC-05). La columna permanece NOT NULL; no se reescribe ninguna fila.
ALTER TABLE tarifas ALTER COLUMN moneda DROP DEFAULT;

-- 3) Idempotencia de matricula: columna opcional (nullable) para replay seguro.
--    Aditiva y sin backfill: las filas legacy quedan con idempotency_key NULL.
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- 4) Actor que creo la matricula. Permite acotar la clave de idempotencia al
--    actor (hallazgo de seguridad: una clave global permitia a otro actor con
--    matriculas:manage descubrir y reinyectar una matricula ajena). Columna
--    opcional: las filas legacy quedan NULL, no se les inventa autor.
--    SIN FOREIGN KEY a proposito: es un registro historico del actor creador,
--    no una relacion viva. Una FK obligaria a tocar `matriculas` al borrar o
--    modificar usuarios (bloqueos y deadlock contra el flujo de matricula), y
--    en el SGPM los usuarios no se borran fisicamente (soft-delete via activo).
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS creado_por_usuario_id INTEGER;

-- 5) Unicidad ACOTADA AL ACTOR: (clave, creador). La clave es un identificador
--    por cliente, no un identificador global: dos autores distintos pueden usar
--    la misma clave sin colisionar, y un mismo autor no puede repetir la suya.
--    Indice parcial: las filas sin clave o sin actor registrado quedan fuera.
CREATE UNIQUE INDEX IF NOT EXISTS uq_matriculas_idempotencia_actor
    ON matriculas (idempotency_key, creado_por_usuario_id)
    WHERE idempotency_key IS NOT NULL AND creado_por_usuario_id IS NOT NULL;
