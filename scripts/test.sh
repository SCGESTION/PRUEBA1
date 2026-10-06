#!/usr/bin/env bash
set -euo pipefail

VECTOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VECTOR_ROOT"
command -v uv >/dev/null 2>&1 || { printf '%s\n' 'Falta uv. Ejecuta la instalación indicada en README.md.' >&2; exit 1; }
[[ -x "$VECTOR_ROOT/.venv/bin/python" && -d "$VECTOR_ROOT/web/node_modules" ]] || {
  printf '%s\n' 'Ejecuta primero: bash scripts/setup.sh' >&2
  exit 1
}
VECTOR_CACHE_ROOT="${VECTOR_CACHE_ROOT:-$VECTOR_ROOT/.cache}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$VECTOR_CACHE_ROOT/uv}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$VECTOR_CACHE_ROOT/npm}"
export PYTHONPATH="$VECTOR_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
uv run --no-sync pytest "$@"
(cd "$VECTOR_ROOT/web" && npm run build)
