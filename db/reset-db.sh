#!/usr/bin/env bash
# ============================================================================
#  CCM - Reconstrucción completa de la base de datos
#
#  Uso:  ./db/reset-db.sh            reconstruye desde cero
#        ./db/reset-db.sh --seed     reconstruye y carga datos (por defecto)
#        ./db/reset-db.sh --no-seed  solo el esquema, sin datos
#
#  Las credenciales se leen de server/.env. No hay contraseñas en este archivo.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$RAIZ/server/.env"

CON_SIEMBRA=1
[[ "${1:-}" == "--no-seed" ]] && CON_SIEMBRA=0

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no existe $ENV_FILE" >&2
  echo "Copiá el ejemplo y completá tus credenciales:" >&2
  echo "  cp $RAIZ/server/.env.example $ENV_FILE" >&2
  exit 1
fi

# Lee DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME desde server/.env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_HOST:?falta DB_HOST en $ENV_FILE}"
: "${DB_PORT:?falta DB_PORT en $ENV_FILE}"
: "${DB_USER:?falta DB_USER en $ENV_FILE}"
: "${DB_NAME:?falta DB_NAME en $ENV_FILE}"

export PGPASSWORD="${DB_PASSWORD:-}"

psql_q() { psql -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> Base de datos: $DB_NAME  (host $DB_HOST:$DB_PORT, usuario $DB_USER)"

# --- 1. Recrear la base --------------------------------------------------
# Requiere que DB_USER sea dueño de la base (o superusuario). No pide sudo
# porque creaste el rol con CREATEDB.
psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null
psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\" ENCODING 'UTF8';"
echo "    [ok] base creada"

# --- 2. Esquema ----------------------------------------------------------
psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$RAIZ/db/schema.sql"
echo "    [ok] esquema aplicado (28 tablas)"

# --- 3. Migraciones ------------------------------------------------------
shopt -s nullglob
for m in "$RAIZ"/db/migrations/*.sql; do
  psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$m"
  echo "    [ok] migración $(basename "$m")"
done
shopt -u nullglob

# --- 4. Datos de demostración -------------------------------------------
if [[ $CON_SIEMBRA -eq 1 ]]; then
  psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$RAIZ/db/seed.sql"
  echo "    [ok] datos de demostración cargados"
else
  echo "    [--] datos omitidos (--no-seed)"
fi

# --- 5. Resumen ----------------------------------------------------------
TABLAS=$(psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
FILAS=$(psql_q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT coalesce(sum(c),0) FROM (SELECT (xpath('/row/c/text()', query_to_xml(
    'SELECT count(*) c FROM '||quote_ident(table_name), false, true, '')))[1]::text::int c
   FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') t;")

echo
echo "==> Listo: $TABLAS tablas, $FILAS filas."