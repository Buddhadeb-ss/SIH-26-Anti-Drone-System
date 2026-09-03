"""
serial_link/serial_dashboard.py

Handles all serial communication with the STM32.

Two directions:

  1. OUTGOING (Python -> STM32):
     format_command(TargetData) -> "X{pan}Y{tilt}Z{distance}\\n"
     This is the ONLY thing Python sends. It never sends laser or
     engagement state — the STM32 decides engagement autonomously.

  2. INCOMING (STM32 -> Python):
     parse_telemetry(raw_line) -> STM32Data
     The exact telemetry protocol is still being finalized on the
     firmware side, so this parser is deliberately simple/forgiving:
     malformed or unrecognized lines produce an STM32Data with
     connected=True (we did receive *something*) but mostly-empty
     fields, rather than raising an exception.

This module isolates the STM32 command format from the rest of the
UI — if the format changes, only this file needs to change.

NOTE ON THE PACKAGE NAME: this package is named `serial_link` (not
`serial`) specifically so it does not shadow the real `pyserial`
package, which is imported in Python as `import serial`. Naming a
local package `serial` would break that import.
"""

from typing import Optional
import time

try:
    import serial as pyserial
    _PYSERIAL_AVAILABLE = True
except ImportError:
    _PYSERIAL_AVAILABLE = False

from data_types import TargetData, STM32Data
import config


def format_command(target: TargetData) -> str:
    """
    Formats a TargetData into the exact STM32 command string:

        X{pan}Y{tilt}Z{distance}\\n

    Example:
        format_command(TargetData(pan=12.5, tilt=-5.2, distance=1500.0))
        -> "X12.5Y-5.2Z1500.0\\n"

    Uses Python's default float-to-str formatting (via round-trip
    repr), which matches the example exactly for values like 12.5,
    -5.2, and 1500.0. If the STM32 firmware expects a fixed number of
    decimal places instead, adjust the format spec below (e.g. f"{x:.1f}")
    — but note this will change the exact output format, so confirm
    with firmware first.
    """
    pan_str = _format_number(target.pan)
    tilt_str = _format_number(target.tilt)
    distance_str = _format_number(target.distance)
    return f"X{pan_str}Y{tilt_str}Z{distance_str}\n"


def _format_number(value: float) -> str:
    """
    Formats a float the same way Python's str() does for simple
    decimals (e.g. 12.5 -> "12.5", 1500.0 -> "1500.0", -5.2 -> "-5.2").
    Kept as a separate function so the formatting rule lives in one
    obvious place if it needs to change later.
    """
    return str(float(value))


def parse_telemetry(raw_line: str) -> STM32Data:
    """
    Parses a single line of STM32 telemetry into an STM32Data.

    IMPORTANT: The real telemetry protocol is not finalized yet. This
    parser currently expects a simple comma-separated key:value format
    as a placeholder, e.g.:

        "PAN:12.5,TILT:-5.2,TEMP:34.2,STATUS:TRACKING"

    and is intentionally forgiving:
      - Unknown keys are ignored (not an error).
      - Missing keys stay None in the resulting STM32Data.
      - A completely unparseable line still returns a valid STM32Data
        (connected=True, raw=original line, all values None) instead
        of raising an exception.

    Replace this function's internals once the firmware team finalizes
    the actual protocol — nothing else in the dashboard needs to change,
    since callers only ever see the resulting STM32Data object.
    """
    result = STM32Data(connected=True, raw=raw_line)

    if not raw_line or not raw_line.strip():
        return result

    try:
        parts = raw_line.strip().split(",")
        for part in parts:
            if ":" not in part:
                continue
            key, _, value = part.partition(":")
            key = key.strip().upper()
            value = value.strip()

            if key == "PAN":
                result.pan = _safe_float(value)
            elif key == "TILT":
                result.tilt = _safe_float(value)
            elif key == "TEMP" or key == "TEMPERATURE":
                result.temperature = _safe_float(value)
            elif key == "STATUS":
                result.status = value
            # Unknown keys are silently ignored -- protocol isn't final.

    except Exception:
        # Any unexpected parsing failure: we still return a valid
        # STM32Data with connected=True and the raw line preserved,
        # rather than crashing the dashboard.
        pass

    return result


def _safe_float(value: str) -> Optional[float]:
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


class SerialDashboard:
    """
    Manages the physical serial connection to the STM32.

    Usage:
        link = SerialDashboard()
        link.connect()                        # returns True/False, never raises
        link.send_target(target_data)         # formats + sends
        telemetry = link.poll_telemetry()      # reads + parses one line, or None
        link.disconnect()

    All connection/IO failures are caught and reflected via
    is_connected() / return values — never raised up to the UI.
    """

    def __init__(self, port: str = None, baudrate: int = None, timeout: float = None):
        self.port = port if port is not None else config.SERIAL_PORT
        self.baudrate = baudrate if baudrate is not None else config.SERIAL_BAUDRATE
        self.timeout = timeout if timeout is not None else config.SERIAL_TIMEOUT
        self._conn = None
        self._connected = False

    def connect(self) -> bool:
        if not _PYSERIAL_AVAILABLE:
            self._connected = False
            return False

        try:
            self._conn = pyserial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
            )
            self._connected = True
            return True
        except Exception:
            # Wrong port, device not plugged in, permissions issue, etc.
            self._conn = None
            self._connected = False
            return False

    def disconnect(self):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
        self._conn = None
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    def send_target(self, target: TargetData) -> bool:
        """
        Formats and sends a TargetData to the STM32. Returns True on
        success, False if not connected or the write failed.
        """
        if not self._connected or self._conn is None:
            return False

        try:
            command = format_command(target)
            self._conn.write(command.encode("ascii"))
            return True
        except Exception:
            self._connected = False
            return False

    def poll_telemetry(self) -> Optional[STM32Data]:
        """
        Attempts to read one line of telemetry from the STM32.
        Returns a parsed STM32Data, or None if not connected / no
        data is currently available / a read error occurred.
        """
        if not self._connected or self._conn is None:
            return None

        try:
            if self._conn.in_waiting == 0:
                return None
            line = self._conn.readline().decode("ascii", errors="replace")
            return parse_telemetry(line)
        except Exception:
            self._connected = False
            return None
