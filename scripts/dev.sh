#!/usr/bin/env bash
set -euo pipefail

VECTOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VECTOR_ROOT"
[[ -x "$VECTOR_ROOT/.venv/bin/python" && -f "$VECTOR_ROOT/web/node_modules/vite/bin/vite.js" ]] || {
  printf '%s\n' 'Ejecuta primero: bash scripts/setup.sh (añade --demo solo para la demostración).' >&2
  exit 1
}
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Falta Node.js 22 o posterior.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
export PYTHONPATH="$VECTOR_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"

# Refuse occupied ports instead of stopping processes belonging to another task.
"$VECTOR_ROOT/.venv/bin/python" - <<'PY'
import socket
for port in (8000, 5173):
    with socket.socket() as sock:
        # A stopped server can leave TIME_WAIT sockets; these do not mean a
        # live service owns the port. Match the server's reuse setting.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(f"El puerto {port} está ocupado. Cierra tu proceso o usa otra terminal/proyecto.")
PY

VECTOR_API_PID=''
VECTOR_WEB_PID=''
cleanup() {
  trap - EXIT INT TERM
  for pid in "$VECTOR_API_PID" "$VECTOR_WEB_PID"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  for pid in "$VECTOR_API_PID" "$VECTOR_WEB_PID"; do
    if [[ -n "$pid" ]]; then wait "$pid" 2>/dev/null || true; fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$VECTOR_ROOT/.venv/bin/python" -m uvicorn vector.app:app --host 127.0.0.1 --port 8000 --reload &
VECTOR_API_PID=$!
(cd "$VECTOR_ROOT/web" && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort) &
VECTOR_WEB_PID=$!

"$VECTOR_ROOT/.venv/bin/python" - <<'PY'
import json
import time
import urllib.request
for url, api in (("http://127.0.0.1:8000/api/health", True), ("http://127.0.0.1:5173", False)):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                body = response.read().decode()
            ready = json.loads(body).get("status") == "ok" if api else 'id="root"' in body
            if ready:
                break
        except (OSError, ValueError):
            pass
        time.sleep(0.25)
    else:
        raise SystemExit(f"El servicio no respondió correctamente: {url}. Revisa los errores de arranque.")
PY

printf '%s\n' 'Vector listo: http://localhost:5173' 'API: http://localhost:8000/api/health · Documentación: http://localhost:8000/docs' 'Ctrl+C detiene los dos servicios iniciados por este script.'
while true; do
  for pid in "$VECTOR_API_PID" "$VECTOR_WEB_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      if wait "$pid"; then exit 1; else exit "$?"; fi
    fi
  done
  sleep 1
done
