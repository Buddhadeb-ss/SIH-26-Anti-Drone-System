"""
radar/radar_display.py

A circular radar visualization widget for PySide6.

This module ONLY draws what it's given via `update_radar_data()`. It
does not process raw radar signals, does not compute azimuth/distance,
and does not decide when a target exists — all of that is expected to
happen upstream, in a separate radar-processing system.

Azimuth convention used here: 0 degrees = straight up (12 o'clock),
positive = clockwise. If your radar hardware uses a different
convention, convert before calling update_radar_data(), or adjust the
angle math in `_polar_to_cartesian()` below.
"""

import math
from PySide6.QtWidgets import QWidget, QSizePolicy
from PySide6.QtGui import QPainter, QPen, QBrush, QColor, QFont
from PySide6.QtCore import Qt, QPointF

from data_types import RadarData

# Maximum distance (meters) the radar display represents at its outer ring.
# Targets beyond this are clamped to the edge rather than drawn off-screen.
MAX_RANGE_M = 200.0
RANGE_RING_COUNT = 4  # number of concentric rings, evenly spaced


class RadarDisplay(QWidget):
    """
    A self-contained radar widget. Drop it into any layout:

        radar = RadarDisplay()
        layout.addWidget(radar)
        radar.update_radar_data(radar_data)   # call whenever new data arrives
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._data = RadarData()  # defaults to detected=False -> "NO TARGET"
        self.setMinimumSize(280, 280)
        # Tell the layout this widget should claim any extra space it's
        # given, rather than sitting at its minimum size. Without this,
        # a QVBoxLayout can leave empty space above/around the widget
        # instead of letting it grow (see the RADAR panel in dashboard.py,
        # which also needs a stretch factor on this widget for the same
        # reason).
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

    def update_radar_data(self, data: RadarData):
        """Call this with a fresh RadarData whenever new radar info arrives."""
        self._data = data
        self.update()  # trigger a repaint

    # -- Painting -------------------------------------------------------

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        w, h = self.width(), self.height()
        size = min(w, h) - 16  # leave margin for labels
        cx, cy = w / 2, h / 2
        radius = size / 2

        self._draw_background(painter, cx, cy, radius)
        self._draw_range_rings(painter, cx, cy, radius)
        self._draw_angle_markings(painter, cx, cy, radius)

        if self._data.detected:
            self._draw_target(painter, cx, cy, radius)
            self._draw_target_info(painter)
        else:
            self._draw_no_target(painter)

        painter.end()

    def _draw_background(self, painter, cx, cy, radius):
        painter.setBrush(QBrush(QColor(10, 20, 15)))
        painter.setPen(QPen(QColor(60, 200, 120), 2))
        painter.drawEllipse(QPointF(cx, cy), radius, radius)

    def _draw_range_rings(self, painter, cx, cy, radius):
        painter.setPen(QPen(QColor(40, 100, 70), 1, Qt.DashLine))
        for i in range(1, RANGE_RING_COUNT + 1):
            r = radius * (i / RANGE_RING_COUNT)
            painter.drawEllipse(QPointF(cx, cy), r, r)

        # Range labels along the bottom-right radius
        painter.setPen(QColor(80, 180, 120))
        painter.setFont(QFont("Consolas", 8))
        for i in range(1, RANGE_RING_COUNT + 1):
            r = radius * (i / RANGE_RING_COUNT)
            label_range = MAX_RANGE_M * (i / RANGE_RING_COUNT)
            painter.drawText(QPointF(cx + 4, cy - r + 12), f"{int(label_range)}m")

    def _draw_angle_markings(self, painter, cx, cy, radius):
        painter.setPen(QPen(QColor(40, 100, 70), 1))
        painter.setFont(QFont("Consolas", 8))
        for angle_deg in range(0, 360, 30):
            rad = math.radians(angle_deg - 90)  # -90 so 0 deg is "up"
            x1 = cx + radius * math.cos(rad)
            y1 = cy + radius * math.sin(rad)
            x2 = cx + (radius * 0.92) * math.cos(rad)
            y2 = cy + (radius * 0.92) * math.sin(rad)
            painter.drawLine(QPointF(x1, y1), QPointF(x2, y2))

            label_x = cx + (radius + 14) * math.cos(rad)
            label_y = cy + (radius + 14) * math.sin(rad)
            painter.drawText(QPointF(label_x - 8, label_y + 4), f"{angle_deg}")

    def _polar_to_cartesian(self, cx, cy, radius, distance_m, azimuth_deg):
        """
        Converts (distance, azimuth) into an (x, y) point on the widget.
        Distance is clamped to MAX_RANGE_M so far targets still render
        at the edge instead of disappearing off-widget.
        """
        clamped_distance = min(distance_m, MAX_RANGE_M)
        r = radius * (clamped_distance / MAX_RANGE_M)
        rad = math.radians(azimuth_deg - 90)
        x = cx + r * math.cos(rad)
        y = cy + r * math.sin(rad)
        return x, y

    def _draw_target(self, painter, cx, cy, radius):
        distance = self._data.distance if self._data.distance is not None else 0.0
        azimuth = self._data.azimuth if self._data.azimuth is not None else 0.0

        x, y = self._polar_to_cartesian(cx, cy, radius, distance, azimuth)

        painter.setBrush(QBrush(QColor(220, 40, 40)))
        painter.setPen(QPen(QColor(255, 100, 100), 2))
        painter.drawEllipse(QPointF(x, y), 7, 7)

        # subtle pulse ring around the dot for visibility
        painter.setBrush(Qt.NoBrush)
        painter.setPen(QPen(QColor(220, 40, 40, 120), 1))
        painter.drawEllipse(QPointF(x, y), 13, 13)

    def _draw_target_info(self, painter):
        lines = []
        if self._data.target_id is not None:
            lines.append(f"Target ID: {self._data.target_id:02d}")
        if self._data.distance is not None:
            lines.append(f"Distance: {self._data.distance:.0f} m")
        if self._data.azimuth is not None:
            sign = "+" if self._data.azimuth >= 0 else ""
            lines.append(f"Azimuth: {sign}{self._data.azimuth:.0f}°")
        if self._data.elevation is not None:
            sign = "+" if self._data.elevation >= 0 else ""
            lines.append(f"Elevation: {sign}{self._data.elevation:.0f}°")
        if self._data.velocity is not None:
            lines.append(f"Velocity: {self._data.velocity:.1f} m/s")

        painter.setPen(QColor(220, 240, 230))
        painter.setFont(QFont("Consolas", 7))
        y_offset = 11
        for line in lines:
            painter.drawText(QPointF(6, y_offset), line)
            y_offset += 11

    def _draw_no_target(self, painter):
        painter.setPen(QColor(120, 140, 130))
        painter.setFont(QFont("Consolas", 11, QFont.Bold))
        rect = self.rect()
        painter.drawText(rect, Qt.AlignCenter, "NO TARGET")
