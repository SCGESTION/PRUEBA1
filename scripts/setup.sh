#!/usr/bin/env bash
set -euo pipefail

VECTOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VECTOR_ROOT"

VECTOR_DEMO=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo) VECTOR_DEMO=true ;;
    -h|--help)
      printf '%s\n' 'Uso: bash scripts/setup.sh [--demo]' 'Instala dependencias y compila la web. --demo crea datos de demostración explícitos.' 'IA opcional: bash scripts/setup-pose.sh (consulta docs/POSE.md).'
      exit 0
      ;;
    *) printf 'Opción desconocida: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

command -v uv >/dev/null 2>&1 || { printf '%s\n' 'Falta uv. En macOS: brew install uv node' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Falta Node.js 22 o posterior. En macOS: brew install uv node' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { printf '%s\n' 'Falta npm; instala una distribución de Node.js que lo incluya.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Vector necesita Node.js 22 o posterior."); process.exit(1); }'

VECTOR_CACHE_ROOT="${VECTOR_CACHE_ROOT:-$VECTOR_ROOT/.cache}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$VECTOR_CACHE_ROOT/uv}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$VECTOR_CACHE_ROOT/npm}"
mkdir -p "$UV_CACHE_DIR" "$NPM_CONFIG_CACHE"
export PYTHONPATH="$VECTOR_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"

uv sync --frozen --group dev --python 3.12
(cd "$VECTOR_ROOT/web" && npm ci && npm run build)

if [[ "$VECTOR_DEMO" == true ]]; then
  uv run --no-sync python -m vector.seed --demo
else
  uv run --no-sync python -m vector.seed
fi
printf '%s\n' 'Instalación terminada. Desarrollo: bash scripts/dev.sh' 'Web compilada: bash scripts/serve.sh'
