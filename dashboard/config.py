"""
config.py

Central configuration for the Anti-Drone Dashboard.

Change values here instead of hunting through the codebase.
Command-line arguments (see main.py) can override MOCK_MODE at runtime.
"""

# ---------------------------------------------------------------------------
# MODE
# ---------------------------------------------------------------------------

# If True, the dashboard generates its own fake CV/Radar/STM32 data
# instead of trying to talk to real hardware. This is also settable via
# `python main.py --mock` (the CLI flag takes priority over this default).
MOCK_MODE = False


# ---------------------------------------------------------------------------
# CAMERA
# ---------------------------------------------------------------------------

# Index passed to cv2.VideoCapture(). 0 is usually the default webcam.
CAMERA_INDEX = 0

# Target camera capture resolution. The camera may ignore this if it
# doesn't support the exact size; OpenCV will fall back to a default.
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480


# ---------------------------------------------------------------------------
# SERIAL / STM32
# ---------------------------------------------------------------------------

# Update this to match your STM32's actual port before connecting real
# hardware. Common values:
#   Windows:      "COM3", "COM4", ...
#   Linux:        "/dev/ttyUSB0", "/dev/ttyACM0"
#   macOS:        "/dev/tty.usbserial-XXXX"
SERIAL_PORT = "/dev/ttyUSB0"

SERIAL_BAUDRATE = 115200

# How long (seconds) to wait for a serial response before giving up.
SERIAL_TIMEOUT = 1.0


# ---------------------------------------------------------------------------
# UI REFRESH RATES
# ---------------------------------------------------------------------------

# How often (milliseconds) the UI polls for new camera frames / data.
# ~33ms is roughly 30 FPS.
UI_REFRESH_MS = 33

# How often (milliseconds) mock data is regenerated in simulation mode.
MOCK_UPDATE_MS = 100
