from typing import Optional
import threading
import time
import sys
from pathlib import Path

try:
    import cv2
    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False

from data_types import DetectionData, SystemState
import config


class CVInterface:
    """Adapter between the existing CV pipeline and the dashboard."""

    _STATE_MAP = {
        "INIT": SystemState.STARTUP,
        "IDLE": SystemState.SEARCHING,
        "TRACKING": SystemState.TRACKING,
        "LOCKED": SystemState.TARGET_LOCK,
        "FAULT": SystemState.SYSTEM_ERROR,
    }

    def __init__(self, camera_index: int = None):
        self.camera_index = (
            camera_index
            if camera_index is not None
            else config.CAMERA_INDEX
        )

        self._cap = None
        self._camera_available = False

        self._latest_detection = DetectionData()
        self._latest_frame = None

        self._last_frame_time = 0.0
        self._fps_estimate = 0.0

        self._vision_thread = None
        self._vision_stop = threading.Event()
        self._vision_running = False
        self._vision_error = None

    def open_camera(self) -> bool:
        if not _CV2_AVAILABLE:
            return False

        try:
            cap = cv2.VideoCapture(self.camera_index)

            if not cap.isOpened():
                return False

            cap.set(
                cv2.CAP_PROP_FRAME_WIDTH,
                config.CAMERA_WIDTH
            )
            cap.set(
                cv2.CAP_PROP_FRAME_HEIGHT,
                config.CAMERA_HEIGHT
            )

            self._cap = cap
            self._camera_available = True
            return True

        except Exception:
            self._camera_available = False
            return False

    def close_camera(self):
        self.stop_video_pipeline()

        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass

        self._cap = None
        self._camera_available = False

    def is_camera_available(self) -> bool:
        return self._camera_available or self._vision_running

    def read_frame(self):
        if not self._camera_available or self._cap is None:
            return None

        try:
            ret, frame = self._cap.read()

            if not ret or frame is None:
                return None

            now = time.time()

            if self._last_frame_time > 0:
                delta = now - self._last_frame_time

                if delta > 0:
                    instant_fps = 1.0 / delta
                    self._fps_estimate = (
                        self._fps_estimate * 0.8
                        + instant_fps * 0.2
                    )

            self._last_frame_time = now

            return frame

        except Exception:
            return None

    def start_video_pipeline(self, video_path: str) -> bool:
        if self._vision_running:
            return True

        try:
            repo_root = Path(__file__).resolve().parents[2]

            if str(repo_root) not in sys.path:
                sys.path.insert(0, str(repo_root))

            from vision.vision_pipeline import run_perception_pipeline

        except Exception as exc:
            self._vision_error = (
                f"Could not import vision pipeline: {exc}"
            )
            return False

        self._vision_stop.clear()
        self._vision_error = None
        self._vision_running = True

        def worker():
            try:
                run_perception_pipeline(
                    source_path=video_path,
                    serial_port="dashboard-mock",
                    baud_rate=115200,
                    use_yolo=True,
                    weights_path="yolov8n.pt",
                    dashboard_callback=self.receive_vision_result,
                    enable_serial=False,
                    display=False,
                    loop_video=True,
                    stop_event=self._vision_stop,
                    detection_interval=1,
                )

            except Exception as exc:
                self._vision_error = str(exc)

            finally:
                self._vision_running = False

        self._vision_thread = threading.Thread(
            target=worker,
            name="CVVisionPipeline",
            daemon=True,
        )

        self._vision_thread.start()

        return True

    def start_camera_pipeline(self, camera_index: int) -> bool:
        if self._vision_running:
            return True

        try:
            repo_root = Path(__file__).resolve().parents[2]

            if str(repo_root) not in sys.path:
                sys.path.insert(0, str(repo_root))

            from vision.vision_pipeline import run_perception_pipeline

        except Exception as exc:
            self._vision_error = (
                f"Could not import vision pipeline: {exc}"
            )
            return False

        self._vision_stop.clear()
        self._vision_error = None
        self._vision_running = True

        def worker():
            try:
                run_perception_pipeline(
                    source_path=camera_index,
                    serial_port="dashboard-mock",
                    baud_rate=115200,
                    use_yolo=True,
                    weights_path="yolov8n.pt",
                    dashboard_callback=self.receive_vision_result,
                    enable_serial=False,
                    display=False,
                    loop_video=False,
                    stop_event=self._vision_stop,
                    detection_interval=1,
                )

            except Exception as exc:
                self._vision_error = str(exc)

            finally:
                self._vision_running = False

        self._vision_thread = threading.Thread(
            target=worker,
            name="CVVisionPipeline",
            daemon=True,
        )

        self._vision_thread.start()

        return True

    def stop_video_pipeline(self):
        self._vision_stop.set()

        thread = self._vision_thread

        if thread is not None and thread.is_alive():
            thread.join(timeout=1.0)

        self._vision_thread = None
        self._vision_running = False

    def is_video_pipeline_running(self) -> bool:
        return self._vision_running

    def get_vision_error(self):
        return self._vision_error

    def receive_vision_result(self, result: dict):
        frame = result.get("frame")
        detected = bool(result.get("detected", False))

        bbox = result.get("bbox")
        confidence = float(
            result.get("confidence", 0.0) or 0.0
        )

        if bbox is None:
            x = y = width = height = 0.0
        else:
            x, y, width, height = bbox

        state = self._STATE_MAP.get(
            result.get("state", "IDLE"),
            SystemState.SEARCHING
        )

        self._latest_detection = DetectionData(
            detected=detected,
            target_id=1 if detected else None,
            x=float(x),
            y=float(y),
            width=float(width),
            height=float(height),
            confidence=confidence,
            fps=float(result.get("fps", 0.0) or 0.0),
            state=state,
            distance=result.get("distance"),
            pan_error=result.get("pan_error"),
            tilt_error=result.get("tilt_error"),
            annotated_frame=(
                frame.copy()
                if frame is not None
                else None
            ),
        )

        if frame is not None:
            self._latest_frame = frame

    def receive_detection(self, detection: DetectionData):
        self._latest_detection = detection

        if detection.annotated_frame is not None:
            self._latest_frame = detection.annotated_frame

    def get_latest_detection(self) -> DetectionData:
        return self._latest_detection

    def get_latest_frame(self):
        return self._latest_frame

    def get_fps(self) -> float:
        fps = self._latest_detection.fps

        return (
            round(fps, 1)
            if fps
            else round(self._fps_estimate, 1)
        )