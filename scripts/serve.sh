#!/usr/bin/env bash
set -euo pipefail

VECTOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VECTOR_ROOT"
[[ -x "$VECTOR_ROOT/.venv/bin/python" && -f "$VECTOR_ROOT/web/dist/index.html" ]] || {
  printf '%s\n' 'Falta el entorno Python o la web compilada. Ejecuta: bash scripts/setup.sh' >&2
  exit 1
}
export PYTHONPATH="$VECTOR_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
printf '%s\n' "Vector: http://${VECTOR_HOST:-127.0.0.1}:${VECTOR_PORT:-8000} · Ctrl+C para detener."
exec "$VECTOR_ROOT/.venv/bin/python" -m uvicorn vector.app:app --host "${VECTOR_HOST:-127.0.0.1}" --port "${VECTOR_PORT:-8000}"
