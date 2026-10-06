"""Optional, conservative squat analysis for Vector challenge videos.

This is a motion heuristic, not an official competition judge. It requires one
person, visible hip/knee/ankle keypoints and a side-on camera; a human must check
competition movement standards and athlete identity. ``confidence`` means mean
keypoint confidence, not probability that a result is correct.

Ultralytics YOLO and its pretrained models use the upstream AGPL-3.0/commercial
licensing scheme. Review https://www.ultralytics.com/license before incorporating
them into a hosted commercial product. Vector does not redistribute model
weights. This module never downloads weights during a request; an operator must
install and verify a local pose model and set VECTOR_POSE_MODEL.
"""

from __future__ import annotations

import importlib.util
import math
import os
from pathlib import Path
from statistics import mean
from typing import Sequence


class PoseUnavailable(RuntimeError):
    """The optional local pose runtime is missing or cannot be used safely."""


def _model_path() -> Path | None:
    configured = os.environ.get("VECTOR_POSE_MODEL", "").strip()
    if not configured:
        return None
    path = Path(configured).expanduser()
    return path.resolve() if path.is_file() and path.suffix.lower() == ".pt" else None


def ai_status() -> dict:
    """Report runtime prerequisites without importing YOLO or loading weights.

    ``available`` only indicates that the optional dependencies and model file
    exist. Loading/inference may still fail, in which case submissions require
    human review. No network operation or model download is performed here.
    """
    if _model_path() is None:
        return {"available": False, "detail": "Falta VECTOR_POSE_MODEL con un modelo YOLO Pose .pt local verificado. Los vídeos se envían a revisión humana."}
    missing = [name for name in ("ultralytics", "cv2") if importlib.util.find_spec(name) is None]
    if missing:
        return {"available": False, "detail": "Faltan las dependencias opcionales de YOLO Pose/OpenCV. Los vídeos se envían a revisión humana."}
    return {"available": True, "detail": "Modelo Pose local configurado; análisis de sentadillas asistido, sujeto a revisión humana."}


def _angle(a: Sequence[float], b: Sequence[float], c: Sequence[float]) -> float | None:
    first = (float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))
    second = (float(c[0]) - float(b[0]), float(c[1]) - float(b[1]))
    length = math.hypot(*first) * math.hypot(*second)
    if length < 1e-9:
        return None
    cosine = (first[0] * second[0] + first[1] * second[1]) / length
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


class SquatCounter:
    """Pure timestamped COCO-17 keypoint squat counter, independent of YOLO.

    Feed ``update(keypoints, seconds)`` with 17 ``[x, y, confidence]`` points.
    Image y increases downwards. A repetition needs a stable standing posture,
    descent, a stable deep posture, then a stable standing posture. The knee
    thresholds are 160°/105° and depth requires the hip at/below knee height
    within 5% of shin length. This is conservative and camera-dependent.

    ``update`` returns True only when a repetition finishes. ``time_seconds``
    measures from the first departure from standing to the target-th completed
    repetition. Invalid/missing frames interrupt a cycle after ``max_gap``;
    interruptions remain visible to the caller and need human review.
    """

    def __init__(self, target_reps: int = 30, *, confidence_threshold: float = 0.55,
                 standing_angle: float = 160.0, down_angle: float = 105.0,
                 stable_frames: int = 2, max_gap: float = 0.75,
                 min_rep_seconds: float = 0.3, max_rep_seconds: float = 30.0):
        if isinstance(target_reps, bool) or not isinstance(target_reps, int) or target_reps < 1:
            raise ValueError("target_reps must be a positive integer")
        if not 0 < confidence_threshold <= 1 or not 0 < down_angle < standing_angle <= 180:
            raise ValueError("Invalid confidence or angle thresholds")
        if stable_frames < 1 or max_gap <= 0 or not 0 < min_rep_seconds < max_rep_seconds:
            raise ValueError("Invalid temporal thresholds")
        self.target_reps = target_reps
        self.confidence_threshold = confidence_threshold
        self.standing_angle = standing_angle
        self.down_angle = down_angle
        self.stable_frames = stable_frames
        self.max_gap = max_gap
        self.min_rep_seconds = min_rep_seconds
        self.max_rep_seconds = max_rep_seconds
        self.reps = 0
        self.start_time: float | None = None
        self.end_time: float | None = None
        self.interrupted_cycles = 0
        self.invalid_frames = 0
        self.valid_frames = 0
        self._state = "unarmed"
        self._standing_frames = 0
        self._down_frames = 0
        self._cycle_start: float | None = None
        self._last_timestamp: float | None = None
        self._last_valid_timestamp: float | None = None
        self._confidences: list[float] = []
        self._side: tuple[int, int, int] | None = None

    @property
    def complete(self) -> bool:
        return self.reps >= self.target_reps

    @property
    def time_seconds(self) -> float | None:
        if self.start_time is None or self.end_time is None:
            return None
        return round(self.end_time - self.start_time, 3)

    @property
    def confidence(self) -> float | None:
        return round(mean(self._confidences), 3) if self._confidences else None

    def _interrupt(self) -> None:
        if self._state in ("descending", "bottom"):
            self.interrupted_cycles += 1
        self._state = "unarmed"
        self._standing_frames = 0
        self._down_frames = 0
        self._cycle_start = None
        self._side = None

    def _observation(self, keypoints: Sequence[Sequence[float]] | None) -> tuple[float, bool, float] | None:
        if keypoints is None or len(keypoints) < 17:
            return None
        candidates = []
        for indices in ((11, 13, 15), (12, 14, 16)):
            try:
                points = [keypoints[index] for index in indices]
                if any(len(point) < 3 or not all(math.isfinite(float(value)) for value in point[:3]) for point in points):
                    continue
                scores = [float(point[2]) for point in points]
                if min(scores) < self.confidence_threshold:
                    continue
                hip, knee, ankle = points
                angle = _angle(hip, knee, ankle)
                shin_length = math.hypot(float(knee[0]) - float(ankle[0]), float(knee[1]) - float(ankle[1]))
                if angle is None or shin_length < 1:
                    continue
                depth = float(hip[1]) >= float(knee[1]) - shin_length * 0.05
                candidates.append((indices, angle, depth, mean(scores)))
            except (TypeError, ValueError, OverflowError):
                continue
        if not candidates:
            return None
        # Keep the same leg during each rep to avoid mixing left/right postures.
        if self._side is not None:
            candidate = next((item for item in candidates if item[0] == self._side), None)
            if candidate is None:
                return None
        else:
            candidate = max(candidates, key=lambda item: item[3])
            self._side = candidate[0]
        return candidate[1], candidate[2], candidate[3]

    def update(self, keypoints: Sequence[Sequence[float]] | None, timestamp: float) -> bool:
        """Process a frame at monotonic video time; return whether a rep ended."""
        timestamp = float(timestamp)
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError("timestamp must be finite and nonnegative")
        if self._last_timestamp is not None and timestamp < self._last_timestamp:
            raise ValueError("Video timestamps must be monotonic")
        self._last_timestamp = timestamp
        if self.complete:
            return False
        if self._last_valid_timestamp is not None and timestamp - self._last_valid_timestamp > self.max_gap:
            self._interrupt()
        observation = self._observation(keypoints)
        if observation is None:
            self.invalid_frames += 1
            self._standing_frames = 0
            self._down_frames = 0
            return False
        self._last_valid_timestamp = timestamp
        self.valid_frames += 1
        angle, deep, confidence = observation
        self._confidences.append(confidence)
        standing = angle >= self.standing_angle
        down = angle <= self.down_angle and deep
        self._standing_frames = self._standing_frames + 1 if standing else 0
        self._down_frames = self._down_frames + 1 if down else 0

        if self._state == "unarmed":
            if self._standing_frames >= self.stable_frames:
                self._state = "standing"
            return False
        if self._state == "standing":
            if angle < self.standing_angle - 10:
                self._cycle_start = timestamp
                if self.start_time is None:
                    self.start_time = timestamp
                self._state = "descending"
            return False
        if self._cycle_start is not None and timestamp - self._cycle_start > self.max_rep_seconds:
            self._interrupt()
            return False
        if self._state == "descending":
            if self._down_frames >= self.stable_frames:
                self._state = "bottom"
                self._standing_frames = 0
            elif self._standing_frames >= self.stable_frames:
                # A partial squat is not a repetition; its elapsed time remains.
                self._state = "standing"
                self._cycle_start = None
            return False
        if self._state == "bottom" and self._standing_frames >= self.stable_frames:
            duration = timestamp - (self._cycle_start if self._cycle_start is not None else timestamp)
            self._state = "standing"
            self._cycle_start = None
            self._down_frames = 0
            if duration < self.min_rep_seconds:
                self.interrupted_cycles += 1
                return False
            self.reps += 1
            if self.complete:
                self.end_time = timestamp
            return True
        return False


def analyze_video(path: str, target_reps: int) -> dict:
    """Analyze a local video with verified locally installed YOLO pose weights.

    Return ``reps``, ``time_seconds`` (None until the target is reached), mean
    keypoint ``confidence``, Spanish ``analysis_note``, and ``complete``. A true
    complete flag means the heuristic reached the target without observed
    ambiguity; it does not certify competition standards or athlete identity.
    PoseUnavailable signals missing/broken optional runtime. Invalid media and
    incomplete videos return incomplete results, never invented repetitions.
    """
    counter = SquatCounter(target_reps)
    model_path = _model_path()
    if not ai_status()["available"] or model_path is None:
        raise PoseUnavailable(ai_status()["detail"])
    video_path = Path(path)
    if not video_path.is_file():
        raise ValueError("No existe el vídeo local para analizar")
    try:
        import cv2
        from ultralytics import YOLO
    except Exception as exc:
        raise PoseUnavailable("No se pudo cargar el entorno opcional YOLO Pose/OpenCV") from exc

    def incomplete(note: str) -> dict:
        return {"reps": counter.reps, "time_seconds": counter.time_seconds,
                "confidence": counter.confidence, "analysis_note": note, "complete": False}

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        return incomplete("El vídeo no se puede decodificar; requiere revisión humana.")
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        if not math.isfinite(fps) or not 1 <= fps <= 240:
            return incomplete("El vídeo no proporciona una frecuencia válida para medir el tiempo.")
        try:
            max_seconds = float(os.environ.get("VECTOR_POSE_MAX_SECONDS", "180"))
            confidence_threshold = float(os.environ.get("VECTOR_POSE_CONFIDENCE", "0.55"))
        except ValueError as exc:
            raise PoseUnavailable("Configuración de límites/confianza de Pose inválida") from exc
        if not 5 <= max_seconds <= 600 or not 0 < confidence_threshold <= 1:
            raise PoseUnavailable("Los límites de Pose deben ser 5–600 s y confianza 0–1")
        counter = SquatCounter(target_reps, confidence_threshold=confidence_threshold)
        try:
            model = YOLO(str(model_path), task="pose")
            if getattr(model, "task", None) != "pose":
                raise ValueError("El modelo no es de estimación de pose")
        except Exception as exc:
            raise PoseUnavailable("No se pudo cargar el modelo Pose local; verifica su origen y compatibilidad") from exc

        stride = max(1, int(round(fps / 12)))
        frame_limit = min(int(fps * max_seconds), 50_000)
        previous_box: tuple[float, float, float, float] | None = None
        previous_person_time: float | None = None
        ambiguous = False
        tracking_lost = False
        timing_unreliable = False
        last_frame_time: float | None = None
        limited = False
        decoded = 0
        while decoded < frame_limit:
            ok, frame = capture.read()
            if not ok:
                break
            frame_index = decoded
            decoded += 1
            if frame_index % stride:
                continue
            # Container timestamps account for variable frame rate. A nominal
            # FPS fallback can support counting, but cannot certify elapsed
            # time and therefore always sends the result to human review.
            timestamp = float(capture.get(cv2.CAP_PROP_POS_MSEC)) / 1000
            if (not math.isfinite(timestamp) or timestamp < 0 or
                    (last_frame_time is not None and timestamp <= last_frame_time)):
                timing_unreliable = True
                timestamp = max(frame_index / fps,
                                (last_frame_time + stride / fps) if last_frame_time is not None else 0)
            last_frame_time = timestamp
            if timestamp > max_seconds:
                limited = True
                break
            try:
                predictions = model.predict(frame, verbose=False, conf=0.5,
                                            device=os.environ.get("VECTOR_POSE_DEVICE", "cpu"))
            except Exception as exc:
                raise PoseUnavailable("La inferencia Pose ha fallado; el vídeo requiere revisión humana") from exc
            if not predictions:
                counter.update(None, timestamp)
                continue
            result = predictions[0]
            keypoints = getattr(result, "keypoints", None)
            boxes = getattr(result, "boxes", None)
            if keypoints is None or boxes is None or len(boxes) == 0:
                counter.update(None, timestamp)
                continue
            points = keypoints.data.detach().cpu().tolist()
            bounding_boxes = boxes.xyxy.detach().cpu().tolist()
            scores = boxes.conf.detach().cpu().tolist()
            people = [(point, box) for point, box, score in zip(points, bounding_boxes, scores) if score >= 0.5]
            if len(people) != 1:
                ambiguous = ambiguous or len(people) > 1
                counter.update(None, timestamp)
                continue
            point, box = people[0]
            current_box = tuple(float(value) for value in box)
            if previous_box is not None and previous_person_time is not None:
                old_x, old_y = (previous_box[0] + previous_box[2]) / 2, (previous_box[1] + previous_box[3]) / 2
                new_x, new_y = (current_box[0] + current_box[2]) / 2, (current_box[1] + current_box[3]) / 2
                diagonal = math.hypot(previous_box[2] - previous_box[0], previous_box[3] - previous_box[1])
                if (timestamp - previous_person_time > counter.max_gap or
                        math.hypot(new_x - old_x, new_y - old_y) > max(20, diagonal * 0.6)):
                    tracking_lost = True
                    counter.update(None, timestamp)
                    previous_box, previous_person_time = current_box, timestamp
                    continue
            previous_box, previous_person_time = current_box, timestamp
            counter.update(point, timestamp)
            if counter.complete:
                break
        if not counter.complete and decoded >= frame_limit:
            limited = True
        reasons = []
        if ambiguous:
            reasons.append("hay varias personas en el encuadre")
        if tracking_lost:
            reasons.append("se perdió la continuidad de la persona")
        if timing_unreliable:
            reasons.append("el archivo no aporta timestamps fiables para medir el tiempo")
        if counter.interrupted_cycles:
            reasons.append("se interrumpieron ciclos de movimiento")
        if limited:
            reasons.append(f"se alcanzó el límite de análisis ({max_seconds:g} segundos o 50.000 frames)")
        if not counter.complete:
            reasons.append(f"solo se detectaron {counter.reps} de {target_reps} repeticiones completas")
        if counter.valid_frames == 0:
            reasons.append("no se observaron cadera, rodilla y tobillo con confianza suficiente")
        complete = counter.complete and not reasons
        note = ("Análisis asistido: " + "; ".join(reasons) + ". Requiere revisión humana." if reasons else
                "Objetivo detectado por ángulo de rodilla y profundidad de cadera. El tiempo parte del primer descenso y termina al recuperar la extensión final. Revisión humana necesaria antes de publicar el resultado.")
        return {"reps": counter.reps, "time_seconds": None if timing_unreliable else counter.time_seconds,
                "confidence": counter.confidence, "analysis_note": note, "complete": complete}
    finally:
        capture.release()
