"""
main.py

Entry point for the SIH 2026 Anti-Drone System Dashboard.

Usage:
    python main.py
        Attempts to use real camera/serial hardware.

    python main.py --mock
        Runs entirely on simulated data.

    python main.py --mock --video <path>
        Uses the real CV pipeline with a test video,
        while radar/STM32 remain mocked.

    python main.py --mock --camera <index>
        Uses a live camera with the real CV pipeline,
        while radar/STM32 remain mocked.

The --mock flag overrides config.MOCK_MODE regardless
of its default value.
"""

import sys
import argparse

from PySide6.QtWidgets import QApplication

import config
from ui.dashboard import DashboardWindow


def parse_args():
    parser = argparse.ArgumentParser(
        description="SIH 2026 Anti-Drone System Dashboard"
    )

    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock/simulation mode (no hardware required).",
    )

    parser.add_argument(
        "--video",
        type=str,
        default=None,
        help=(
            "Use the existing CV pipeline on a video "
            "while hardware remains mocked."
        ),
    )

    parser.add_argument(
        "--camera",
        type=int,
        default=None,
        help=(
            "Use a live camera as the CV source "
            "while hardware remains mocked."
        ),
    )

    return parser.parse_args()


def main():
    args = parse_args()

    # CLI flag takes priority over config.py.
    mock_mode = args.mock or config.MOCK_MODE

    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    window = DashboardWindow(
        mock_mode=mock_mode,
        video_path=args.video,
        camera_index=args.camera,
    )

    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()