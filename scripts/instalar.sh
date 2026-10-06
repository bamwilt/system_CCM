#!/usr/bin/env bash
#
# Instala las dependencias de los dos proyectos.
#
# `server` y `client` son paquetes independientes (no hay workspaces): cada uno
# tiene su propio package.json y su propio node_modules.
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for proyecto in server client; do
  printf '\n== %s ==\n' "$proyecto"
  (cd "$RAIZ/$proyecto" && npm ci)
done

printf '\nDependencias instaladas.\n'
