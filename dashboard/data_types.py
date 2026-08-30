"""
data_types.py

Shared data structures passed between modules:

    CV        -> DetectionData -> Dashboard
    Radar     -> RadarData     -> Dashboard
    STM32     -> STM32Data     -> Dashboard
    Dashboard -> TargetData    -> SerialDashboard -> STM32

These are intentionally simple. None of these fields are final —
add/remove/rename as the real CV, radar, and STM32 protocols solidify.
Every consumer of these classes should tolerate missing/None fields
rather than crashing (see the "OFFLINE, not crash" rule in the README).
"""

from dataclasses import dataclass, field
from typing import Optional
import time


# ---------------------------------------------------------------------------
# System state enum (kept as plain strings so it's easy to extend/print)
# ---------------------------------------------------------------------------

class SystemState:
    """
    Valid system states. Using string constants (not a real Enum) so
    they're trivial to compare, print, and log without extra imports.

    The dashboard only DISPLAYS these states — it does not decide when
    to transition between them. That decision belongs to the real CV /
    STM32 system (or, in mock mode, to simulation/mock_data.py).
    """
    STARTUP = "SYSTEM STARTUP"
    SEARCHING = "SEARCHING"
    TARGET_DETECTED = "TARGET DETECTED"
    TRACKING = "TRACKING"
    TARGET_LOCK = "TARGET LOCK"
    TARGET_LOST = "TARGET LOST"
    SYSTEM_ERROR = "SYSTEM ERROR"


# ---------------------------------------------------------------------------
# CV -> Dashboard
# ---------------------------------------------------------------------------

@dataclass
class DetectionData:
    """
    Output of the CV/YOLO system for a single frame.

    x, y, width, height are expected to be pixel coordinates of the
    bounding box (top-left corner + size), but the UI does not enforce
    this — it just draws whatever numbers it's given.
    """
    detected: bool = False
    target_id: Optional[int] = None
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    confidence: float = 0.0          # 0.0 - 1.0
    fps: float = 0.0
    state: str = SystemState.SEARCHING
    distance: Optional[float] = None
    pan_error: Optional[float] = None
    tilt_error: Optional[float] = None

    # Optional: a pre-annotated frame (numpy array / BGR image) coming
    # from the CV system, already drawn with boxes/labels. If provided,
    # the camera panel can display this directly instead of drawing its
    # own overlay. Left as None when the CV system sends raw frames +
    # separate detection metadata instead.
    annotated_frame: Optional[object] = None


# ---------------------------------------------------------------------------
# Radar -> Dashboard
# ---------------------------------------------------------------------------

@dataclass
class RadarData:
    """
    Output of the radar processing system for a single target.

    distance    : meters
    azimuth     : degrees, convention is up to the radar system
                  (this UI assumes 0 deg = straight ahead / up,
                  positive = clockwise, but adjust radar_display.py
                  if your radar uses a different convention)
    elevation   : degrees (optional — not all radar setups report this)
    velocity    : m/s, optional, positive = closing
    timestamp   : seconds (time.time() or similar), optional

    Only fields that are actually populated should be relied upon by
    the UI. RadarData(detected=False) with everything else default
    represents "no target".
    """
    detected: bool = False
    target_id: Optional[int] = None
    distance: Optional[float] = None
    azimuth: Optional[float] = None
    elevation: Optional[float] = None
    velocity: Optional[float] = None
    timestamp: Optional[float] = None


# ---------------------------------------------------------------------------
# STM32 -> Dashboard  (telemetry)
# ---------------------------------------------------------------------------

@dataclass
class STM32Data:
    """
    Telemetry received FROM the STM32.

    NOTE: The real STM32 -> dashboard telemetry protocol is still being
    finalized. This class is deliberately generic and easy to extend.
    connected=False with all other fields default represents "no
    telemetry available" (e.g. STM32 not plugged in, or mock mode with
    STM32 simulation disabled).
    """
    connected: bool = False
    pan: Optional[float] = None          # degrees
    tilt: Optional[float] = None         # degrees
    temperature: Optional[float] = None  # Celsius
    status: str = "UNKNOWN"              # e.g. "TRACKING", "IDLE", raw STM32 status string
    raw: Optional[str] = None            # last raw line received, for debugging


# ---------------------------------------------------------------------------
# Dashboard -> SerialDashboard -> STM32 (outgoing command)
# ---------------------------------------------------------------------------

@dataclass
class TargetData:
    """
    Data the dashboard/control layer wants to SEND to the STM32.

    pan      : pan error, degrees
    tilt     : tilt error, degrees
    distance : physical distance to target, in the same units the
               STM32 expects (project currently uses millimeters based
               on the example command, e.g. distance=1500.0 -> Z1500.0)

    Intentionally does NOT include a laser/engagement field — the
    STM32 handles engagement state autonomously and must never be told
    to fire/engage from the Python side.
    """
    pan: float
    tilt: float
    distance: float


# ---------------------------------------------------------------------------
# System health snapshot (used by the health bar in the UI)
# ---------------------------------------------------------------------------

@dataclass
class SystemHealth:
    """
    Simple online/offline flags for the health status bar.
    Each subsystem module is responsible for reporting its own state;
    the UI just reads these booleans and colors the indicator dots.
    """
    camera_online: bool = False
    cv_online: bool = False
    radar_online: bool = False
    stm32_online: bool = False
    serial_connected: bool = False
    last_updated: float = field(default_factory=time.time)
