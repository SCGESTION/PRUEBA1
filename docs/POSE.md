# Análisis opcional de vídeos con YOLO Pose

La plataforma guarda los vídeos y permite revisión humana sin instalar IA. No genera repeticiones, tiempos ni rankings ficticios cuando el modelo falta. El analizador opcional sirve para **sentadillas**, con vídeo continuo, una persona y una cámara lateral fija que muestre cadera, rodillas y tobillos. Los resultados asistidos deben revisarse antes de publicarlos en una competición.

## Instalación en un Mac

Desde la raíz del repositorio, después del setup básico del README, instala el extra opcional con el script probado:

```bash
bash scripts/setup-pose.sh
```

El script usa Python 3.12 y `uv sync --frozen --extra pose --group dev`, con las versiones de `uv.lock`. Se fijan Ultralytics 8.4.174, OpenCV 4.11.0.86 y NumPy 1.26.4. Apple Silicon usa PyTorch 2.5.1 / torchvision 0.20.1; Mac Intel usa PyTorch 2.2.2 / torchvision 0.17.2, versiones que publican ruedas compatibles con Intel. Linux instala PyTorch 2.5.1 y torchvision 0.20.1 desde el índice oficial de ruedas CPU. No sustituyas estas versiones por una instalación genérica de la última versión: las versiones recientes de PyTorch no publican todas las ruedas de Mac Intel.

El modelo **YOLO11n Pose** devuelve 17 puntos COCO. El script descarga y verifica los pesos de una versión oficial antes de cargarlos:

| Dato | Valor |
| --- | --- |
| Versión de assets | `v8.4.0` |
| Archivo | `yolo11n-pose.pt` |
| Fuente | [Ultralytics Assets: modelo oficial](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo11n-pose.pt) |
| SHA-256 publicado por GitHub | `869e83fcdffdc7371fa4e34cd8e51c838cc729571d1635e5141e3075e9319dc0` |

Se mantiene la validación TLS y se compara SHA-256 con el digest publicado para ese asset. Un modelo existente con otro digest no se sobrescribe ni se carga. Los pesos se guardan en `data/models`, o dentro de `VECTOR_DATA_DIR` si lo configuraste. No se incluyen en Git ni se descargan durante una solicitud de vídeo. Los archivos PyTorch pueden ejecutar código al cargarlos: usa la fuente y el digest verificables, y no sustituyas el checksum para eludir un error. Después de verificar el archivo, el script ejecuta una inferencia CPU sobre una imagen vacía y muestra la ruta del modelo que debes configurar.

Configura el modelo ya verificado antes de lanzar el backend siguiendo el README:

```bash
export VECTOR_POSE_MODEL="${VECTOR_DATA_DIR:-$PWD/data}/models/yolo11n-pose.pt"
export VECTOR_POSE_DEVICE=cpu
export VECTOR_POSE_MAX_SECONDS=180
export VECTOR_POSE_CONFIDENCE=0.55
```

CPU es la opción portable y validada en Linux para este entorno. Los pines de Mac Intel y Apple Silicon están definidos en el lockfile; no se ha ejecutado la aplicación en hardware Mac en esta sesión. Puedes probar `VECTOR_POSE_DEVICE=mps` en Apple Silicon compatible, después de validar la inferencia. `/api/health` y el panel de administración indican si existen las dependencias y los pesos; esta comprobación no garantiza que un archivo corrupto o incompatible vaya a cargar. Un fallo de carga o inferencia pasa a revisión humana.

Ultralytics requiere `opencv-python`. Evita instalar a la vez sus variantes `headless`/`contrib`, ya que comparten el mismo módulo `cv2`. Aísla las dependencias opcionales en el entorno virtual del proyecto.

## Qué mide

Un ciclo exige rodilla extendida (≥160°), descenso, rodilla flexionada (≤105°), cadera a la altura de la rodilla o por debajo (tolerancia del 5% de la longitud de la tibia en la imagen), y extensión final. Se exigen al menos dos observaciones consecutivas para las posturas finales. Se mantiene la misma pierna durante el ciclo; los huecos superiores a 0,75 s interrumpen el conteo del ciclo. El tiempo comienza al primer descenso detectado y acaba al confirmar la extensión de la repetición objetivo, usando los timestamps de los frames proporcionados por el contenedor. Si estos faltan o no son crecientes, se puede estimar el conteo con la frecuencia nominal, pero no se devuelve un tiempo certificable y el resultado queda incompleto. Se procesa aproximadamente a 12 observaciones/s, por lo que hay cuantización temporal. La duración máxima configurable es de 5–600 segundos, con un límite adicional de 50.000 frames decodificados.

Varias personas, saltos de posición o pérdidas de continuidad generan resultados incompletos y revisión. El seguimiento por cuadro de persona detecta cambios evidentes de posición; **no verifica la identidad** ni descarta cortes de vídeo sutiles. La confianza es el promedio de confianza de los puntos visibles aceptados, no una probabilidad de que el resultado sea correcto. Un movimiento parcial no cuenta. Un vídeo truncado, sin extensión inicial, con oclusiones, cámara frontal o piernas fuera del encuadre puede producir menos repeticiones que las realizadas.

Los umbrales geométricos no sustituyen la norma oficial de profundidad de sentadilla. Perspectiva, ropa, iluminación, rapidez y errores del modelo afectan los resultados. El analizador solo utiliza coordenadas 2D y no demuestra esfuerzo, carga, profundidad 3D ni cumplimiento de todas las reglas de competición. No aprueba resultados automáticamente.

## Validación antes de una competición

Las pruebas de `tests/test_pose.py` comprueban geometría sintética, histéresis, tiempos, pérdida de puntos, repeticiones parciales y ausencia de modelo. También hay verificaciones con detector simulado para varias personas y timestamps ausentes. No prueban la precisión deportiva del modelo. La instalación se ha probado en Linux con los pesos oficiales verificados y una inferencia CPU real sobre una imagen vacía. También se ejecutó `analyze_video` con ese modelo sobre un MP4 negro de un segundo: devolvió `reps=0`, `complete=false`, `time_seconds=null` y `confidence=null`, indicando correctamente revisión humana. Esta prueba valida carga, decodificación e inferencia; no mide la precisión con atletas.

Prepara con consentimiento una muestra etiquetada manualmente que incluya distintos atletas, lateral izquierdo/derecho, cámaras, ritmos y luz. Incluye repeticiones válidas, medias sentadillas, personas entrando en escena, cortes y oclusiones. Compara conteo y tiempo con dos jueces, mide falsos positivos/negativos y error temporal, y acuerda criterios de aceptación antes de activar el análisis para una competición. Conserva la revisión humana para resultados dudosos y reclamaciones. No hay una validación deportiva del modelo con atletas ni una muestra deportiva de referencia en este repositorio.

Ultralytics y sus modelos tienen licencia [AGPL-3.0 y opción comercial](https://www.ultralytics.com/license). Revisa las obligaciones de distribución y prestación de servicios, o contrata la licencia adecuada, antes de usar este componente en un producto comercial. Las dependencias de IA son opcionales; la aplicación funciona con el circuito de revisión humana.
