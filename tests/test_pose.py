"""Synthetic geometry tests; these do not validate a real competition judge."""

import math
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from vector.pose import PoseUnavailable, SquatCounter, _angle, ai_status, analyze_video


def pose(posture="standing", confidence=0.9, left=True, right=True):
    points = [[0.0, 0.0, 0.0] for _ in range(17)]
    hip = {"standing": (100, 100), "descending": (70, 115),
           "down": (50, 155), "shallow": (60, 120)}[posture]
    for hip_index, knee_index, ankle_index, enabled in ((11, 13, 15, left), (12, 14, 16, right)):
        score = confidence if enabled else 0.1
        points[hip_index] = [*hip, score]
        points[knee_index] = [100, 150, score]
        points[ankle_index] = [100, 200, score]
    return points


def cycle(counter, start=0.0):
    results = []
    for offset, posture in ((0.0, "standing"), (0.1, "standing"),
                            (0.2, "descending"), (0.3, "descending"),
                            (0.4, "down"), (0.5, "down"), (0.6, "descending"),
                            (0.7, "standing"), (0.8, "standing")):
        results.append(counter.update(pose(posture), round(start + offset, 3)))
    return results


class SquatCounterTests(unittest.TestCase):
    def test_angle_geometry(self):
        self.assertEqual(_angle((0, 0), (0, 1), (0, 2)), 180)
        self.assertEqual(_angle((1, 1), (0, 1), (0, 2)), 90)
        self.assertIsNone(_angle((0, 1), (0, 1), (0, 2)))

    def test_complete_rep_and_video_time(self):
        counter = SquatCounter(target_reps=2)
        self.assertEqual(sum(cycle(counter)), 1)
        self.assertIsNone(counter.time_seconds)
        self.assertEqual(sum(cycle(counter, 1.0)), 1)
        self.assertTrue(counter.complete)
        self.assertEqual(counter.reps, 2)
        self.assertAlmostEqual(counter.time_seconds, 1.6)
        self.assertEqual(counter.confidence, 0.9)
        self.assertFalse(counter.update(pose("standing"), 2.0))

    def test_video_must_start_from_standing(self):
        counter = SquatCounter(target_reps=1)
        for index, posture in enumerate(("down", "down", "standing", "standing")):
            counter.update(pose(posture), index / 10)
        self.assertEqual(counter.reps, 0)
        self.assertIsNone(counter.start_time)

    def test_partial_squat_does_not_count(self):
        counter = SquatCounter()
        for index, posture in enumerate(("standing", "standing", "descending", "shallow",
                                         "shallow", "standing", "standing")):
            counter.update(pose(posture), index / 10)
        self.assertEqual(counter.reps, 0)

    def test_angle_alone_is_not_enough(self):
        counter = SquatCounter()
        too_high_hip = pose("down")
        # A hip directly left of the knee has a 90° knee angle but is well
        # above it in this camera, so does not meet the depth heuristic.
        for hip_index in (11, 12):
            too_high_hip[hip_index] = [20, 140, 0.9]
        for timestamp, points in ((0.0, pose()), (0.1, pose()), (0.2, too_high_hip),
                                  (0.3, too_high_hip), (0.4, pose()), (0.5, pose())):
            counter.update(points, timestamp)
        self.assertEqual(counter.reps, 0)

    def test_one_frame_down_jitter_does_not_count(self):
        counter = SquatCounter()
        for index, posture in enumerate(("standing", "standing", "descending", "down",
                                         "descending", "standing", "standing")):
            counter.update(pose(posture), index / 10)
        self.assertEqual(counter.reps, 0)

    def test_low_confidence_does_not_count(self):
        counter = SquatCounter()
        for index, posture in enumerate(("standing", "standing", "down", "down", "standing", "standing")):
            counter.update(pose(posture, confidence=0.3), index / 10)
        self.assertEqual(counter.reps, 0)
        self.assertEqual(counter.valid_frames, 0)
        self.assertEqual(counter.invalid_frames, 6)
        self.assertIsNone(counter.confidence)

    def test_missing_frames_interrupt_cycle(self):
        counter = SquatCounter()
        counter.update(pose(), 0.0)
        counter.update(pose(), 0.1)
        counter.update(pose("down"), 0.2)
        counter.update(pose("down"), 0.3)
        counter.update(None, 0.5)
        counter.update(None, 1.2)
        counter.update(pose(), 1.3)
        counter.update(pose(), 1.4)
        self.assertEqual(counter.reps, 0)
        self.assertEqual(counter.interrupted_cycles, 1)

    def test_leg_switch_mid_rep_is_not_accepted(self):
        counter = SquatCounter()
        counter.update(pose(right=False), 0.0)
        counter.update(pose(right=False), 0.1)
        counter.update(pose("down", right=False), 0.2)
        counter.update(pose("down", right=False), 0.3)
        counter.update(pose(left=False), 0.4)
        counter.update(pose(left=False), 0.5)
        self.assertEqual(counter.reps, 0)
        self.assertEqual(counter.invalid_frames, 2)

    def test_nonfinite_keypoints_are_ignored(self):
        counter = SquatCounter()
        bad = pose()
        bad[11][0] = math.nan
        bad[12][2] = math.inf
        counter.update(bad, 0.0)
        self.assertEqual(counter.valid_frames, 0)

    def test_validates_target_and_time(self):
        for target in (0, -1, True, 1.5):
            with self.assertRaises(ValueError):
                SquatCounter(target_reps=target)
        counter = SquatCounter()
        counter.update(pose(), 1.0)
        with self.assertRaises(ValueError):
            counter.update(pose(), 0.9)
        with self.assertRaises(ValueError):
            counter.update(pose(), math.nan)


class OptionalRuntimeTests(unittest.TestCase):
    def test_missing_model_gives_human_review_status(self):
        with patch.dict(os.environ, {"VECTOR_POSE_MODEL": ""}):
            status = ai_status()
            self.assertFalse(status["available"])
            self.assertIn("revisión humana", status["detail"])
            with self.assertRaises(PoseUnavailable):
                analyze_video("does-not-exist.mp4", 30)

    def test_model_is_required_to_be_an_existing_local_pt_file(self):
        with patch.dict(os.environ, {"VECTOR_POSE_MODEL": "yolo11n-pose.pt"}):
            self.assertFalse(ai_status()["available"])
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "model.pt"
            model_path.write_bytes(b"fixture, not a loadable model")
            with patch.dict(os.environ, {"VECTOR_POSE_MODEL": str(model_path)}), patch("vector.pose.importlib.util.find_spec", return_value=None):
                self.assertFalse(ai_status()["available"])


class VideoAnalysisContractTests(unittest.TestCase):
    """Exercise media/result safeguards with a fake detector, not real ML."""

    def run_analysis(self, *, multiple_people=False, missing_timestamps=False):
        postures = ["standing", "standing", "descending", "descending", "down",
                    "down", "descending", "standing", "standing"]

        class Tensor:
            def __init__(self, value):
                self.value = value

            def detach(self):
                return self

            def cpu(self):
                return self

            def tolist(self):
                return self.value

        class Boxes:
            def __init__(self, count):
                self.xyxy = Tensor([[20, 50, 150, 220] for _ in range(count)])
                self.conf = Tensor([0.95] * count)
                self.count = count

            def __len__(self):
                return self.count

        class Capture:
            def __init__(self):
                self.index = -1
                self.released = False

            def isOpened(self):
                return True

            def get(self, key):
                if key == 1:
                    return 10.0
                return 0.0 if missing_timestamps else max(0, self.index) * 100.0

            def read(self):
                self.index += 1
                return (True, self.index) if self.index < len(postures) else (False, None)

            def release(self):
                self.released = True

        class Model:
            task = "pose"

            def predict(self, frame, **kwargs):
                count = 2 if multiple_people and frame == 3 else 1
                return [SimpleNamespace(
                    keypoints=SimpleNamespace(data=Tensor([pose(postures[frame]) for _ in range(count)])),
                    boxes=Boxes(count))]

        capture = Capture()
        fake_cv2 = SimpleNamespace(VideoCapture=lambda path: capture, CAP_PROP_FPS=1, CAP_PROP_POS_MSEC=2)
        fake_ultralytics = SimpleNamespace(YOLO=lambda path, task: Model())
        with tempfile.TemporaryDirectory() as directory:
            model_file = Path(directory) / "local.pt"
            model_file.write_bytes(b"fixture")
            video_file = Path(directory) / "video.mp4"
            video_file.write_bytes(b"fixture")
            with patch.dict(os.environ, {"VECTOR_POSE_MODEL": str(model_file)}), \
                 patch("vector.pose.ai_status", return_value={"available": True}), \
                 patch.dict("sys.modules", {"cv2": fake_cv2, "ultralytics": fake_ultralytics}):
                result = analyze_video(str(video_file), 1)
        self.assertTrue(capture.released)
        return result

    def test_timestamped_complete_sequence(self):
        result = self.run_analysis()
        self.assertTrue(result["complete"])
        self.assertEqual(result["reps"], 1)
        self.assertAlmostEqual(result["time_seconds"], 0.6)
        self.assertIn("Revisión humana", result["analysis_note"])

    def test_multiple_people_prevent_complete_result(self):
        result = self.run_analysis(multiple_people=True)
        self.assertFalse(result["complete"])
        self.assertIn("varias personas", result["analysis_note"])

    def test_missing_container_timestamps_never_certify_elapsed_time(self):
        result = self.run_analysis(missing_timestamps=True)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["time_seconds"])
        self.assertEqual(result["reps"], 1)
        self.assertIn("timestamps", result["analysis_note"])


if __name__ == "__main__":
    unittest.main()
