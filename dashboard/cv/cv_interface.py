"""
cv/cv_interface.py

Interface between the dashboard and the computer-vision system.

This module has two responsibilities ONLY:
    1. Open/manage the physical camera (via OpenCV) and hand back raw frames.
    2. Accept DetectionData from an external CV/YOLO process and make the
       latest detection available to the UI.

It does NOT run YOLO. It does NOT decide bounding boxes. It does NOT
implement tracking logic. The actual YOLOv8-nano process is expected to
run separately and feed detections into this interface via
`receive_detection()`.

Camera failure handling: if the camera can't be opened, this class does
NOT raise/crash. `is_camera_available()` reports False and
`read_frame()` returns None, so the UI can show "CAMERA OFFLINE"
instead of falling over.
"""

from typing import Optional
import time

try:
    import cv2
    _CV2_AVAILABLE = True
except ImportError:
    # OpenCV might not be installed in some environments (e.g. a
    # headless mock-only test run). Camera features degrade gracefully.
    _CV2_AVAILABLE = False

from data_types import DetectionData
import config


class CVInterface:
    """
    Wraps camera access and holds the most recent detection data.

    Usage:
        cv_iface = CVInterface()
        cv_iface.open_camera()

        frame = cv_iface.read_frame()          # raw BGR numpy frame or None
        cv_iface.receive_detection(det_data)   # called by external YOLO process
        latest = cv_iface.get_latest_detection()
    """

    def __init__(self, camera_index: int = None):
        self.camera_index = camera_index if camera_index is not None else config.CAMERA_INDEX
        self._cap = None
        self._camera_available = False
        self._latest_detection = DetectionData()  # defaults to detected=False
        self._last_frame_time = 0.0
        self._fps_estimate = 0.0

    # -- Camera lifecycle ---------------------------------------------------

    def open_camera(self) -> bool:
        """
        Attempts to open the configured camera. Returns True/False and
        never raises — caller can check is_camera_available() at any time.
        """
        if not _CV2_AVAILABLE:
            self._camera_available = False
            return False

        try:
            cap = cv2.VideoCapture(self.camera_index)
            if not cap.isOpened():
                self._camera_available = False
                return False

            cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)

            self._cap = cap
            self._camera_available = True
            return True

        except Exception:
            # Any camera-open failure (missing driver, permissions,
            # device busy, etc.) results in OFFLINE, not a crash.
            self._camera_available = False
            return False

    def close_camera(self):
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
        self._cap = None
        self._camera_available = False

    def is_camera_available(self) -> bool:
        return self._camera_available

    # -- Frame reading --------------------------------------------------

    def read_frame(self):
        """
        Returns the next raw BGR frame (numpy array) or None if no
        camera is available / the read failed. Also updates a rough
        FPS estimate based on time between successful reads.
        """
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
                    # simple smoothing so the FPS readout isn't jumpy
                    self._fps_estimate = (self._fps_estimate * 0.8) + (instant_fps * 0.2)
            self._last_frame_time = now

            return frame

        except Exception:
            return None

    def get_fps(self) -> float:
        return round(self._fps_estimate, 1)

    # -- Detection data ---------------------------------------------------

    def receive_detection(self, detection: DetectionData):
        """
        Called by an external CV/YOLO process (or the mock simulator)
        to push the latest detection result into the dashboard.
        """
        self._latest_detection = detection

    def get_latest_detection(self) -> DetectionData:
        """
        Returns the most recently received DetectionData. Never None —
        defaults to a DetectionData() with detected=False if nothing
        has been received yet.
        """
        return self._latest_detection
