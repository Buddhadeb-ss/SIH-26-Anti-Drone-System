"""
ui/dashboard.py

The main dashboard window. Pure DISPLAY layer — assembles the camera
panel, radar widget, target info panel, STM32 panel, and health bar
into the layout described in the project brief, and polls the CV /
radar / serial interfaces (or the mock generator) on a timer to keep
everything refreshed.

This file does NOT contain detection, tracking, or control logic. It
only reads data (real or mock) and draws it.
"""

import time
import numpy as np

from PySide6.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QHBoxLayout, QGridLayout,
    QFrame, QMainWindow,
)
from PySide6.QtGui import QImage, QPixmap, QFont, QColor
from PySide6.QtCore import Qt, QTimer

try:
    import cv2
    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False

import config
from data_types import SystemState, SystemHealth
from radar.radar_display import RadarDisplay
from cv.cv_interface import CVInterface
from serial_link.serial_dashboard import SerialDashboard
from simulation.mock_data import MockDataGenerator


# ---------------------------------------------------------------------------
# Color helpers for state indicators
# ---------------------------------------------------------------------------

STATE_COLORS = {
    SystemState.STARTUP: "#5599ff",
    SystemState.SEARCHING: "#cccc44",
    SystemState.TARGET_DETECTED: "#ff9933",
    SystemState.TRACKING: "#33ccff",
    SystemState.TARGET_LOCK: "#ff3333",
    SystemState.TARGET_LOST: "#888888",
    SystemState.SYSTEM_ERROR: "#ff0000",
}

ONLINE_COLOR = "#33cc66"
OFFLINE_COLOR = "#cc3333"


def _status_dot(is_online: bool) -> str:
    color = ONLINE_COLOR if is_online else OFFLINE_COLOR
    return f'<span style="color:{color};">\u25CF</span>'


# ---------------------------------------------------------------------------
# Small reusable "panel" frame with a title
# ---------------------------------------------------------------------------

class Panel(QFrame):
    """
    A bordered frame with a bold title label, used for every section.

    `compact_title=True` shrinks the title font and margins for panels
    that hold a single small widget (e.g. the RADAR panel) instead of
    multiple rows of labeled data — the default sizing was tuned for
    the latter and looks oversized around a bare one-word title.
    """

    def __init__(self, title: str, parent=None, compact_title: bool = False):
        super().__init__(parent)
        self.setFrameShape(QFrame.StyledPanel)
        self.setStyleSheet(
            "QFrame { background-color: #10151a; border: 1px solid #2a3540; "
            "border-radius: 4px; } "
            "QLabel { color: #d0e0d5; }"
        )

        self.layout = QVBoxLayout(self)
        if compact_title:
            self.layout.setContentsMargins(6, 4, 6, 6)
        else:
            self.layout.setContentsMargins(10, 8, 10, 10)

        title_label = QLabel(title)
        title_label.setStyleSheet("color: #7fd0a0; font-weight: bold; letter-spacing: 1px;")
        title_font_size = 8 if compact_title else 10
        title_label.setFont(QFont("Consolas", title_font_size, QFont.Bold))
        self.layout.addWidget(title_label)


# ---------------------------------------------------------------------------
# Camera panel
# ---------------------------------------------------------------------------

class CameraPanel(Panel):
    """
    Displays the live camera feed with detection overlay (bounding box,
    confidence, target ID) or a "CAMERA OFFLINE" message.
    """

    def __init__(self, parent=None):
        super().__init__("LIVE CAMERA", parent)

        self.video_label = QLabel()
        self.video_label.setMinimumSize(420, 300)
        self.video_label.setAlignment(Qt.AlignCenter)
        self.video_label.setStyleSheet("background-color: #05080a; color: #556;")
        self.video_label.setText("CAMERA OFFLINE")
        self.layout.addWidget(self.video_label)

        info_row = QHBoxLayout()
        self.confidence_label = QLabel("Confidence: --")
        self.fps_label = QLabel("FPS: --")
        for lbl in (self.confidence_label, self.fps_label):
            lbl.setFont(QFont("Consolas", 9))
        info_row.addWidget(self.confidence_label)
        info_row.addStretch()
        info_row.addWidget(self.fps_label)
        self.layout.addLayout(info_row)

    def show_offline(self):
        self.video_label.setPixmap(QPixmap())  # clear any previous frame
        self.video_label.setText("CAMERA OFFLINE")
        self.confidence_label.setText("Confidence: --")
        self.fps_label.setText("FPS: --")

    def show_frame(self, frame: np.ndarray, detection, mock_mode: bool):
        """
        frame: raw BGR numpy array (from OpenCV or a generated mock frame)
        detection: DetectionData with overlay info to draw
        """
        if detection is not None and detection.annotated_frame is not None:
            display_frame = detection.annotated_frame.copy()
        else:
            display_frame = frame.copy()
            if _CV2_AVAILABLE and detection is not None and detection.detected:
                self._draw_overlay(display_frame, detection)

        self._render_frame(display_frame)

        conf_text = f"{detection.confidence * 100:.0f}%" if (detection and detection.detected) else "--"
        fps_text = f"{detection.fps:.0f}" if detection else "--"
        self.confidence_label.setText(f"Confidence: {conf_text}")
        self.fps_label.setText(f"FPS: {fps_text}")

    def _draw_overlay(self, frame: np.ndarray, detection):
        if not _CV2_AVAILABLE:
            return
        x, y, w, h = int(detection.x), int(detection.y), int(detection.width), int(detection.height)
        color = (60, 200, 255)  # BGR: orange-ish
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)

        label_parts = []
        if detection.target_id is not None:
            label_parts.append(f"ID:{detection.target_id}")
        label_parts.append(f"{detection.confidence * 100:.0f}%")
        label = " ".join(label_parts)

        cv2.putText(
            frame, label, (x, max(0, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA
        )

    def _render_frame(self, frame: np.ndarray):
        """Converts a BGR numpy frame into a QPixmap and displays it, scaled to fit."""
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if _CV2_AVAILABLE else frame
            h, w, ch = rgb.shape
            bytes_per_line = ch * w
            qimg = QImage(rgb.data, w, h, bytes_per_line, QImage.Format_RGB888)
            pixmap = QPixmap.fromImage(qimg)
            scaled = pixmap.scaled(
                self.video_label.width(), self.video_label.height(),
                Qt.KeepAspectRatio, Qt.SmoothTransformation
            )
            self.video_label.setPixmap(scaled)
        except Exception:
            # If frame conversion fails for any reason, fall back to
            # offline text rather than crashing the UI thread.
            self.show_offline()


# ---------------------------------------------------------------------------
# Target information panel
# ---------------------------------------------------------------------------

class TargetInfoPanel(Panel):
    def __init__(self, parent=None):
        super().__init__("TARGET INFORMATION", parent)

        self.state_label = self._add_row("State:")
        self.target_label = self._add_row("Target:")
        self.confidence_label = self._add_row("Confidence:")
        self.distance_label = self._add_row("Distance:")
        self.target_id_label = self._add_row("Target ID:")

    def _add_row(self, prefix: str) -> QLabel:
        row = QHBoxLayout()
        prefix_label = QLabel(prefix)
        prefix_label.setFont(QFont("Consolas", 9))
        value_label = QLabel("--")
        value_label.setFont(QFont("Consolas", 9, QFont.Bold))
        row.addWidget(prefix_label)
        row.addStretch()
        row.addWidget(value_label)
        self.layout.addLayout(row)
        return value_label

    def update_info(self, detection, state: str):
        color = STATE_COLORS.get(state, "#ffffff")
        self.state_label.setText(f'<span style="color:{color};">{state}</span>')

        if detection and detection.detected:
            self.target_label.setText("DETECTED")
            self.confidence_label.setText(f"{detection.confidence * 100:.0f}%")
            self.target_id_label.setText(
                f"{detection.target_id:02d}" if detection.target_id is not None else "--"
            )
        else:
            self.target_label.setText("NONE")
            self.confidence_label.setText("--")
            self.target_id_label.setText("--")

    def update_distance(self, radar_data):
        if radar_data and radar_data.detected and radar_data.distance is not None:
            self.distance_label.setText(f"{radar_data.distance:.0f} m")
        else:
            self.distance_label.setText("--")

    def update_distance_value(self, distance):
        if distance is not None:
            self.distance_label.setText(f"{float(distance):.0f} m")
        else:
            self.distance_label.setText("--")


# ---------------------------------------------------------------------------
# STM32 / system data panel
# ---------------------------------------------------------------------------

class STM32Panel(Panel):
    def __init__(self, parent=None):
        super().__init__("STM32 / SYSTEM DATA", parent)

        self.connection_label = self._add_row("STM32:")
        self.temperature_label = self._add_row("Temperature:")
        self.pan_label = self._add_row("Pan:")
        self.tilt_label = self._add_row("Tilt:")
        self.status_label = self._add_row("Status:")

    def _add_row(self, prefix: str) -> QLabel:
        row = QHBoxLayout()
        prefix_label = QLabel(prefix)
        prefix_label.setFont(QFont("Consolas", 9))
        value_label = QLabel("--")
        value_label.setFont(QFont("Consolas", 9, QFont.Bold))
        row.addWidget(prefix_label)
        row.addStretch()
        row.addWidget(value_label)
        self.layout.addLayout(row)
        return value_label

    def update_data(self, stm32_data):
        if stm32_data and stm32_data.connected:
            self.connection_label.setText(f'<span style="color:{ONLINE_COLOR};">CONNECTED</span>')
            temp = f"{stm32_data.temperature:.1f} C" if stm32_data.temperature is not None else "--"
            pan = f"{stm32_data.pan:+.1f}\u00b0" if stm32_data.pan is not None else "--"
            tilt = f"{stm32_data.tilt:+.1f}\u00b0" if stm32_data.tilt is not None else "--"
            self.temperature_label.setText(temp)
            self.pan_label.setText(pan)
            self.tilt_label.setText(tilt)
            self.status_label.setText(stm32_data.status or "--")
        else:
            self.connection_label.setText(f'<span style="color:{OFFLINE_COLOR};">DISCONNECTED</span>')
            self.temperature_label.setText("--")
            self.pan_label.setText("--")
            self.tilt_label.setText("--")
            self.status_label.setText("--")


# ---------------------------------------------------------------------------
# System health bar
# ---------------------------------------------------------------------------

class HealthBar(Panel):
    def __init__(self, parent=None):
        super().__init__("SYSTEM HEALTH", parent)
        row = QHBoxLayout()

        self.camera_dot = QLabel()
        self.cv_dot = QLabel()
        self.radar_dot = QLabel()
        self.stm32_dot = QLabel()
        self.serial_dot = QLabel()

        for lbl in (self.camera_dot, self.cv_dot, self.radar_dot, self.stm32_dot, self.serial_dot):
            lbl.setFont(QFont("Consolas", 9, QFont.Bold))

        row.addWidget(self.camera_dot)
        row.addSpacing(20)
        row.addWidget(self.cv_dot)
        row.addSpacing(20)
        row.addWidget(self.radar_dot)
        row.addSpacing(20)
        row.addWidget(self.stm32_dot)
        row.addSpacing(20)
        row.addWidget(self.serial_dot)
        row.addStretch()

        self.layout.addLayout(row)

    def update_health(self, health: SystemHealth):
        self.camera_dot.setText(f"Camera {_status_dot(health.camera_online)} "
                                 f"{'ONLINE' if health.camera_online else 'OFFLINE'}")
        self.cv_dot.setText(f"CV {_status_dot(health.cv_online)} "
                             f"{'ONLINE' if health.cv_online else 'OFFLINE'}")
        self.radar_dot.setText(f"Radar {_status_dot(health.radar_online)} "
                                f"{'ONLINE' if health.radar_online else 'OFFLINE'}")
        self.stm32_dot.setText(f"STM32 {_status_dot(health.stm32_online)} "
                                f"{'ONLINE' if health.stm32_online else 'OFFLINE'}")
        self.serial_dot.setText(f"Serial {_status_dot(health.serial_connected)} "
                                 f"{'CONNECTED' if health.serial_connected else 'DISCONNECTED'}")


# ---------------------------------------------------------------------------
# Header bar (title + overall status + mock-mode banner)
# ---------------------------------------------------------------------------

class HeaderBar(QWidget):
    def __init__(self, mock_mode: bool, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 6)
        layout.setSpacing(2)

        title = QLabel("SIH 2026 - ANTI-DRONE SYSTEM")
        title.setAlignment(Qt.AlignCenter)
        title.setFont(QFont("Consolas", 16, QFont.Bold))
        title.setStyleSheet("color: #d0e0d5;")
        layout.addWidget(title)

        self.status_label = QLabel("SYSTEM STATUS: ONLINE")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setFont(QFont("Consolas", 10, QFont.Bold))
        self.status_label.setStyleSheet(f"color: {ONLINE_COLOR};")
        layout.addWidget(self.status_label)

        if mock_mode:
            mock_label = QLabel("\u25A0 MOCK / SIMULATION MODE \u25A0")
            mock_label.setAlignment(Qt.AlignCenter)
            mock_label.setFont(QFont("Consolas", 10, QFont.Bold))
            mock_label.setStyleSheet("color: #222; background-color: #ffcc33; padding: 3px; border-radius: 3px;")
            layout.addWidget(mock_label)

    def set_state(self, state: str):
        color = STATE_COLORS.get(state, ONLINE_COLOR)
        self.status_label.setText(f"SYSTEM STATUS: {state}")
        self.status_label.setStyleSheet(f"color: {color};")


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------

class DashboardWindow(QMainWindow):
    """
    Top-level dashboard window. Wires together the camera, radar,
    target info, STM32, and health panels, and polls data sources
    (real or mock) on a QTimer.
    """

    def __init__(
        self,
        mock_mode: bool = False,
        video_path: str = None,
        camera_index: int = None,
    ):
        super().__init__()
        self.mock_mode = mock_mode
        self.video_path = video_path
        self.camera_index = camera_index

        # Camera mode and video mode are mutually exclusive.
        if self.video_path is not None and self.camera_index is not None:
            raise ValueError("Use either video_path or camera_index, not both.")

        self.setWindowTitle("SIH 2026 - Anti-Drone System Dashboard")
        self.setStyleSheet("background-color: #05080a;")
        self.resize(1280, 860)

        # -- Data sources -----------------------------------------------
        if self.mock_mode:
            self.mock_generator = MockDataGenerator(
                camera_width=config.CAMERA_WIDTH, camera_height=config.CAMERA_HEIGHT
            )
            self.cv_interface = None
            self.serial_link = None

            # Real camera + real CV, while radar/STM32 remain mocked.
            # The CV pipeline owns VideoCapture so the camera is opened only once.
            if self.camera_index is not None:
                self.cv_interface = CVInterface(camera_index=self.camera_index)
                if not self.cv_interface.start_camera_pipeline(self.camera_index):
                    print(
                        "[DASHBOARD] Camera CV pipeline failed to start: "
                        f"{self.cv_interface.get_vision_error()}"
                    )

            # Existing real CV + test-video mode.
            elif self.video_path is not None:
                self.cv_interface = CVInterface()
                if not self.cv_interface.start_video_pipeline(self.video_path):
                    print(
                        "[DASHBOARD] Video CV pipeline failed to start: "
                        f"{self.cv_interface.get_vision_error()}"
                    )
        else:
            self.mock_generator = None
            self.cv_interface = CVInterface()
            self.cv_interface.open_camera()
            self.serial_link = SerialDashboard()
            self.serial_link.connect()

        self._build_ui()
        self._start_timers()

    # -- UI construction ---------------------------------------------------

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(14, 10, 14, 14)
        root_layout.setSpacing(10)

        self.header = HeaderBar(self.mock_mode)
        root_layout.addWidget(self.header)

        # Top row: camera (left) + radar (right)
        top_row = QHBoxLayout()
        top_row.setSpacing(10)

        self.camera_panel = CameraPanel()
        top_row.addWidget(self.camera_panel, stretch=3)

        radar_panel = Panel("RADAR", compact_title=True)
        self.radar_display = RadarDisplay()
        radar_panel.layout.addWidget(self.radar_display, stretch=1)
        top_row.addWidget(radar_panel, stretch=2)

        root_layout.addLayout(top_row, stretch=5)

        # Middle row: target info (left) + STM32 data (right)
        mid_row = QHBoxLayout()
        mid_row.setSpacing(10)

        self.target_info_panel = TargetInfoPanel()
        mid_row.addWidget(self.target_info_panel, stretch=1)

        self.stm32_panel = STM32Panel()
        mid_row.addWidget(self.stm32_panel, stretch=1)

        root_layout.addLayout(mid_row, stretch=2)

        # Bottom row: system health
        self.health_bar = HealthBar()
        root_layout.addWidget(self.health_bar)

    # -- Timers / polling loop ----------------------------------------------

    def _start_timers(self):
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._on_tick)

        interval = config.MOCK_UPDATE_MS if self.mock_mode else config.UI_REFRESH_MS
        self.timer.start(interval)

    def _on_tick(self):
        if self.mock_mode and (
            self.video_path is not None or self.camera_index is not None
        ):
            self._tick_mock_video()
        elif self.mock_mode:
            self._tick_mock()
        else:
            self._tick_real()

    def _tick_mock_video(self):
        # Shared dashboard path for either a real test video or a live camera.
        self.mock_generator.tick()
        detection = self.cv_interface.get_latest_detection()
        radar_data = self.mock_generator.get_radar_data()
        stm32_data = self.mock_generator.get_stm32_data()
        frame = self.cv_interface.get_latest_frame()

        if frame is not None:
            self.camera_panel.show_frame(frame, detection, mock_mode=True)
        elif self.cv_interface.get_vision_error():
            self.camera_panel.show_offline()
            self.camera_panel.video_label.setText("CV OFFLINE")
        else:
            self.camera_panel.show_offline()

        self.radar_display.update_radar_data(radar_data)

        state = detection.state if detection is not None else SystemState.SEARCHING
        self.target_info_panel.update_info(detection, state)

        if detection is not None and detection.distance is not None:
            self.target_info_panel.update_distance_value(detection.distance)
        else:
            self.target_info_panel.update_distance(radar_data)

        self.stm32_panel.update_data(stm32_data)
        self.header.set_state(state)

        health = SystemHealth(
            camera_online=frame is not None,
            cv_online=(
                self.cv_interface.get_vision_error() is None
                and self.cv_interface.is_video_pipeline_running()
            ),
            radar_online=True,
            stm32_online=True,
            serial_connected=True,
        )
        self.health_bar.update_health(health)

    def _tick_mock(self):
        self.mock_generator.tick()

        detection = self.mock_generator.get_detection_data()
        radar_data = self.mock_generator.get_radar_data()
        stm32_data = self.mock_generator.get_stm32_data()
        state = self.mock_generator.get_state()

        frame = self._generate_mock_frame(detection)
        self.camera_panel.show_frame(frame, detection, mock_mode=True)

        self.radar_display.update_radar_data(radar_data)
        self.target_info_panel.update_info(detection, state)
        self.target_info_panel.update_distance(radar_data)
        self.stm32_panel.update_data(stm32_data)
        self.header.set_state(state)

        health = SystemHealth(
            camera_online=True,
            cv_online=True,
            radar_online=True,
            stm32_online=True,
            serial_connected=True,
        )
        self.health_bar.update_health(health)

    def _tick_real(self):
        # -- Camera / CV --
        detection = self.cv_interface.get_latest_detection()
        frame = self.cv_interface.read_frame()

        if frame is not None:
            self.camera_panel.show_frame(frame, detection, mock_mode=False)
        else:
            self.camera_panel.show_offline()

        # -- Radar --
        # In real mode, radar data is expected to arrive from an external
        # radar-processing source calling into this window (or a shared
        # interface) — this dashboard has no radar hardware of its own.
        # Left as "no target" until wired up; see README "Connecting a
        # real radar source".
        from data_types import RadarData
        radar_data = RadarData(detected=False)
        self.radar_display.update_radar_data(radar_data)

        # -- STM32 telemetry --
        stm32_data = None
        if self.serial_link is not None:
            stm32_data = self.serial_link.poll_telemetry()

        state = detection.state if detection else SystemState.SEARCHING
        self.target_info_panel.update_info(detection, state)
        self.target_info_panel.update_distance(radar_data)
        self.stm32_panel.update_data(stm32_data)
        self.header.set_state(state)

        health = SystemHealth(
            camera_online=self.cv_interface.is_camera_available(),
            cv_online=detection is not None,
            radar_online=radar_data.detected if radar_data else False,
            stm32_online=stm32_data.connected if stm32_data else False,
            serial_connected=self.serial_link.is_connected() if self.serial_link else False,
        )
        self.health_bar.update_health(health)

    def _generate_mock_frame(self, detection) -> np.ndarray:
        """
        Generates a plain dark placeholder frame for mock mode (since
        there's no real camera to read from). The detection overlay
        (box/label) is drawn on top by CameraPanel.show_frame() as usual.
        """
        frame = np.full(
            (config.CAMERA_HEIGHT, config.CAMERA_WIDTH, 3), (12, 18, 15), dtype=np.uint8
        )
        if _CV2_AVAILABLE:
            cv2.putText(
                frame, "MOCK FEED", (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 100, 90), 1, cv2.LINE_AA
            )
        return frame

    # -- Cleanup ---------------------------------------------------------

    def closeEvent(self, event):
        if self.cv_interface is not None:
            self.cv_interface.close_camera()
        if self.serial_link is not None:
            self.serial_link.disconnect()
        super().closeEvent(event)
