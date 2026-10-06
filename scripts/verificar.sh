#!/usr/bin/env bash
#
# Verificación completa del proyecto.
#
# Corre, en orden: comprobación de herramientas, tipos, lint, formato, pruebas
# unitarias y build de los dos proyectos. Al final, si la API está levantado,
# hace un humo de los endpoints; si no, lo dice y termina bien, para que el
# script sirva tanto en desarrollo como en una máquina sin base de datos.
#
#   ./scripts/verificar.sh            # todo
#   ./scripts/verificar.sh --rapido   # omite build y pruebas
#
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAPIDO=0
[[ "${1:-}" == "--rapido" ]] && RAPIDO=1

FALLOS=0
pass() { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFALLA\033[0m %s\n' "$1"; FALLOS=$((FALLOS + 1)); }

titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --- Herramientas -----------------------------------------------------------

titulo 'Herramientas'
command -v node >/dev/null || { fail 'node no está instalado'; exit 1; }
command -v npm  >/dev/null || { fail 'npm no está instalado'; exit 1; }

# .nvmrc fija la versión con la que se ticked el proyecto; avisar evita sorceros
# rarezas con versiones nuevas de Vite o TypeScript.
if [[ -f "$RAIZ/.nvmrc" ]]; then
  REQUERIDA="$(tr -d '[:space:]' < "$RAIZ/.nvmrc")"
  ACTUAL="$(node -v | sed 's/^v//')"
  # .nvmrc puede traer la versión exacta o solo la mayor: se compara por partes.
  if [[ "$ACTUAL" == "$REQUERIDA" || "${ACTUAL%%.*}" == "${REQUERIDA%%.*}" ]]; then
    pass "node $ACTUAL coincide con .nvmrc"
  else
    printf '  \033[33mAVISO\033[0m node %s; el proyecto está probado con %s (nvm use)\n' "$ACTUAL" "$REQUERIDA"
  fi
fi

if [[ ! -d "$RAIZ/client/node_modules" || ! -d "$RAIZ/server/node_modules" ]]; then
  fail 'faltan dependencias: ejecuta scripts/instalar.sh'
  exit 1
fi

# --- Servidor ---------------------------------------------------------------

if [[ $RAPIDO -eq 0 ]]; then
  for proyecto in server client; do
    titulo "$proyecto"
    # Nada entre paréntesis: un subshell impediría que `fail` incrementara el
    # contador del script y todo terminaría con «Todo en orden».
    cd "$RAIZ/$proyecto" || { fail "$proyecto: no existe"; continue; }

    if [[ $proyecto == client ]]; then
      npx tsc -b --noEmit && pass 'tipos' || fail 'tipos'
    else
      npx tsc --noEmit && pass 'tipos' || fail 'tipos'
    fi

    npx eslint src --max-warnings=0 && pass 'eslint' || fail 'eslint'

    npx prettier --check src >/dev/null 2>&1 && pass 'prettier'       || fail 'prettier (corre: npx prettier --write src)'

    if [[ $RAPIDO -eq 0 ]]; then
      if npx vitest run --silent >/dev/null 2>&1; then
        pass "pruebas ($(npx vitest run --reporter=dot 2>/dev/null | grep -oE 'Tests +[0-9]+ passed' | head -1))"
      else
        npx vitest run 2>&1 | tail -25
        fail 'pruebas'
      fi

      npm run build >/dev/null 2>&1 && pass 'build' || fail 'build'
    fi

    cd "$RAIZ" || exit 1
  done
fi

# --- Humo de la API ---------------------------------------------------------

titulo 'API'
API="${API_URL:-http://localhost:4000}"

# `/api/health` es la única ruta pública: si responde, hay proceso.
if curl -sf -m 3 "$API/api/health" >/dev/null 2>&1; then
  pass 'respondiendo'
else
  printf '  \033[33mAVISO\033[0m la API no está en %s; se omite el humo\n' "$API"
fi

# Para los listados hace falta un token. Se usa el que venga en TOKEN; si no,
# se autentica con la cuenta de demostración del seed (db/seed.sql), que es lo
# normal en desarrollo y evita que el humo se salte sin avisar de verdad.
if [[ -z "${TOKEN:-}" && "$API" == "http://localhost:4000" ]]; then
  TOKEN="$(curl -s -m 5 -X POST "$API/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL:-admin@ccm.edu.do}\",\"password\":\"${PASSWORD:-Admin123!}\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  [[ -n "$TOKEN" ]] && pass 'login con la cuenta del seed'
fi

if [[ -n "${TOKEN:-}" ]]; then
  for mod in estudiantes clientes docentes asignaturas grupos matriculas notas pagos; do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
      -H "Authorization: Bearer $TOKEN" "$API/api/$mod?pageSize=1")"
    if [[ "$codigo" == "200" ]]; then pass "GET /api/$mod"; else fail "GET /api/$mod ($codigo)"; fi
  done
else
  printf '  \033[33mAVISO\033[0m define TOKEN=... para comprobar los listados\n'
fi

# --- Resultado --------------------------------------------------------------

echo
if [[ $FALLOS -eq 0 ]]; then
  printf '\033[32mTodo en orden.\033[0m\n'
  exit 0
fi
printf '\033[31m%d comprobación(es) fallida(s).\033[0m\n' "$FALLOS"
exit 1