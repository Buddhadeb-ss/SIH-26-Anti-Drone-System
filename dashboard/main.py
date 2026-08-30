"""
main.py

Entry point for the SIH 2026 Anti-Drone System Dashboard.

Usage:
    python main.py            # attempts to use real camera/serial hardware
    python main.py --mock     # runs entirely on simulated data, no hardware needed

The --mock flag overrides config.MOCK_MODE regardless of its default value.
"""

import sys
import argparse

from PySide6.QtWidgets import QApplication

import config
from ui.dashboard import DashboardWindow


def parse_args():
    parser = argparse.ArgumentParser(description="SIH 2026 Anti-Drone System Dashboard")
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock/simulation mode (no hardware required).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # CLI flag takes priority over the config.py default.
    mock_mode = args.mock or config.MOCK_MODE

    app = QApplication(sys.argv)
    app.setStyle("Fusion")  # consistent, clean look across platforms

    window = DashboardWindow(mock_mode=mock_mode)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
