"""
serial_link/test_format_command.py

Standalone proof that format_command() produces exactly the command
format specified in the project brief:

    pan = 12.5, tilt = -5.2, distance = 1500
    -> "X12.5Y-5.2Z1500.0\\n"

Run directly:
    python serial_link/test_format_command.py

Or with pytest (if installed):
    pytest serial_link/test_format_command.py
"""

import sys
import os

# Allow running this file directly (`python serial_link/test_format_command.py`)
# by ensuring the project root is on sys.path, since this file lives inside
# a subpackage but imports from the project root (data_types, this package).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_types import TargetData
from serial_link.serial_dashboard import format_command


def test_format_command_matches_spec():
    target = TargetData(pan=12.5, tilt=-5.2, distance=1500.0)
    result = format_command(target)
    expected = "X12.5Y-5.2Z1500.0\n"

    assert result == expected, f"Expected {expected!r}, got {result!r}"
    print(f"PASS: format_command produced exactly {result!r}")


def test_format_command_with_integer_distance():
    # distance passed as int(1500) rather than float(1500.0) -- should
    # still produce "Z1500.0" since TargetData/format_command normalize
    # everything to float.
    target = TargetData(pan=12.5, tilt=-5.2, distance=1500)
    result = format_command(target)
    expected = "X12.5Y-5.2Z1500.0\n"

    assert result == expected, f"Expected {expected!r}, got {result!r}"
    print(f"PASS: integer distance input still produced {result!r}")


def test_format_command_zero_values():
    target = TargetData(pan=0.0, tilt=0.0, distance=0.0)
    result = format_command(target)
    expected = "X0.0Y0.0Z0.0\n"

    assert result == expected, f"Expected {expected!r}, got {result!r}"
    print(f"PASS: zero values produced {result!r}")


if __name__ == "__main__":
    test_format_command_matches_spec()
    test_format_command_with_integer_distance()
    test_format_command_zero_values()
    print("\nAll serial format tests passed.")
