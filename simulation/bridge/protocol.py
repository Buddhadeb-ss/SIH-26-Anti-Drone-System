"""
protocol.py
Python Protocol Parser and Packet Schema for STM32 Hardware Bridge.
"""

import json

CMD_MOVE = "MOVE"
CMD_STOP = "STOP"
CMD_HOME = "HOME"
CMD_ENABLE = "ENABLE"

TYPE_TELEMETRY = "telemetry"
TYPE_STATUS = "status"

def encode_packet(data: dict) -> bytes:
    """Encode dictionary into newline-delimited JSON bytes."""
    return (json.dumps(data) + "\n").encode("utf-8")

def decode_packet(line: str) -> dict | None:
    """Decode raw string into JSON dictionary safely."""
    if not line:
        return None
    trimmed = line.strip()
    if not (trimmed.startswith("{") and trimmed.endswith("}")):
        return None
    try:
        return json.loads(trimmed)
    except Exception:
        return None

def build_telemetry(pan: int, tilt: int, pan_target: int, tilt_target: int,
                    pan_temp: float = 24.5, tilt_temp: float = 23.2, heater: int = 0) -> dict:
    """Build standard telemetry payload."""
    return {
        "type": TYPE_TELEMETRY,
        "pan": pan,
        "tilt": tilt,
        "pan_target": pan_target,
        "tilt_target": tilt_target,
        "pan_temp": round(pan_temp, 1),
        "tilt_temp": round(tilt_temp, 1),
        "heater": heater
    }
