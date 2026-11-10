-- SGPM Migration 007: Integridad Fase 5
-- PostgreSQL 16+
-- Forward-only, additive, idempotent migration. No transaction wrappers.

-- Snapshot de referencia tarifaria en planes_pago (aditivo: columnas nulas,
-- sin defaults politicos y sin backfill inventado; filas legacy quedan nulas).
ALTER TABLE planes_pago ADD COLUMN IF NOT EXISTS tarifa_id INTEGER REFERENCES tarifas(id);
ALTER TABLE planes_pago ADD COLUMN IF NOT EXISTS moneda VARCHAR(3);

-- Precheck: no se permiten duplicados por matricula_id antes de imponer
-- unicidad. Si existen duplicados, la migracion se detiene sin borrar datos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM planes_pago
    GROUP BY matricula_id
    HAVING COUNT(*) > 1
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'planes_pago contiene filas duplicadas por matricula_id. No se agrega la restriccion UNIQUE: resolver duplicados manualmente.';
  END IF;
END $$;

-- Unicidad de un plan de pago por matricula (aditivo, no elimina filas legacy).
CREATE UNIQUE INDEX IF NOT EXISTS uq_planes_pago_matricula_id ON planes_pago(matricula_id);
