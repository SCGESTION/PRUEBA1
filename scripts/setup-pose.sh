#!/usr/bin/env bash
set -euo pipefail
VECTOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$VECTOR_ROOT"
VECTOR_CACHE_ROOT="${VECTOR_CACHE_ROOT:-$VECTOR_ROOT/.cache}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$VECTOR_CACHE_ROOT/uv}"
command -v uv >/dev/null || { echo 'Instala uv: brew install uv'; exit 1; }
uv sync --frozen --python 3.12 --extra pose --group dev
export PYTHONPATH="$VECTOR_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
uv run --no-sync python - <<'PY'
from vector.db import data_dir
from pathlib import Path
import hashlib
import urllib.request
import os
url='https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo11n-pose.pt'
expected='869e83fcdffdc7371fa4e34cd8e51c838cc729571d1635e5141e3075e9319dc0'
# Digest published by GitHub on the official v8.4.0 release asset listing.
folder=data_dir()/'models'
folder.mkdir(exist_ok=True)
model=folder/'yolo11n-pose.pt'
def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()
if model.exists():
    if digest(model)!=expected:
        raise SystemExit('El modelo existente no coincide con el SHA-256 oficial. No se ha sobrescrito ni cargado.')
else:
    temp=model.with_suffix('.pt.download')
    try:
        with urllib.request.urlopen(url,timeout=60) as response, temp.open('wb') as output:
            size=0
            while block:=response.read(1024*1024):
                size+=len(block)
                if size>20*1024*1024:
                    raise RuntimeError('Tamaño inesperado del modelo.')
                output.write(block)
        if digest(temp)!=expected:
            raise RuntimeError('Verificación SHA-256 fallida; no se utilizará este archivo.')
        temp.replace(model)
    finally:
        temp.unlink(missing_ok=True)
for variable,folder_name in [('YOLO_CONFIG_DIR','.ultralytics'),('MPLCONFIGDIR','.matplotlib')]:
    folder=data_dir()/folder_name
    folder.mkdir(exist_ok=True)
    os.environ[variable]=str(folder)
from ultralytics import YOLO
import numpy as np
model_instance=YOLO(str(model),task='pose')
results=model_instance.predict(np.zeros((320,320,3),dtype=np.uint8),device='cpu',verbose=False)
assert results and results[0].keypoints is not None
print('Modelo verificado y prueba de inferencia CPU completada.')
print('Antes de iniciar Vector: export VECTOR_POSE_MODEL="'+str(model)+'"')
PY
