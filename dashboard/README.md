# SIH 2026 — Anti-Drone System Dashboard

A display/visualization dashboard for the Anti-Drone System. This project is **display-only** — it does not implement detection, tracking, gimbal control, or engagement logic. It receives data from external CV, radar, and STM32 systems (or generates mock data) and displays it.

---

## 1. File Tree

```text
dashboard/
├── main.py                          # entry point / CLI
├── config.py                        # camera/serial/refresh-rate settings
├── data_types.py                    # shared dataclasses
├── requirements.txt
├── README.md
├── ui/
│   └── dashboard.py                 # main window, panels, layout
├── cv/
│   └── cv_interface.py              # camera capture + CV data intake
├── serial_link/
│   ├── serial_dashboard.py          # STM32 telemetry/serial interface
│   └── test_format_command.py       # standalone command-format test
├── radar/
│   └── radar_display.py             # circular radar visualization
└── simulation/
    └── mock_data.py                 # mock/simulation data generator
```

### A naming note on `serial_link/`

The original spec named this folder `serial/`. It was renamed to `serial_link/` because a local package literally named `serial` can shadow the real `pyserial` library, which is imported in Python as `import serial`, causing confusing serial-communication failures.

The file inside remains `serial_dashboard.py`; only the containing folder was renamed.

---

## 2. Installation

From the `dashboard/` directory:

```bash
pip install -r requirements.txt
```

If using the project's virtual environment on Windows:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

---

## 3. Running

All commands below are run from the `dashboard/` directory.

### Mock/simulation mode

No real camera or hardware is required:

```bash
python main.py --mock
```

### Live camera + real CV + mocked hardware

This mode uses the **real camera and YOLO CV pipeline**, while radar and STM32 data remain simulated.

For the external USB webcam used during development:

```powershell
.\venv\Scripts\python.exe main.py --mock --camera 1
```

`1` is the OpenCV camera index. If your camera has a different index, replace it:

```bash
python main.py --mock --camera 0
```

The dashboard receives the annotated CV frame directly from the CV pipeline. No separate OpenCV display window is opened.

### Test video + real CV + mocked hardware

```bash
python main.py --mock --video ..\vision\test_videos\drone_test_2.mp4
```

Replace the video path with any compatible test video.

### Real hardware mode

Attempts to use the configured camera and STM32 serial connection:

```bash
python main.py
```

The camera and serial settings are read from `config.py`. If hardware is unavailable, the dashboard is designed to remain open and report the relevant component as offline/disconnected.

> **Note:** `--camera` and `--video` are alternative CV sources. Do not use both in the same command.

---

## 4. Mock-Mode Testing Procedure

Run:

```bash
python main.py --mock
```

Verify:

- [ ] A yellow **"MOCK / SIMULATION MODE"** banner is visible at the top.
- [ ] The camera panel shows a dark placeholder feed labeled `MOCK FEED`.
- [ ] A bounding box appears once a simulated target is present.
- [ ] The radar panel animates with range rings, angle markings, and a simulated target.
- [ ] Target information updates continuously.
- [ ] The system state cycles through approximately:
  `SYSTEM STARTUP → SEARCHING → TARGET DETECTED → TRACKING → TARGET LOCK → TARGET LOST → SEARCHING...`
- [ ] STM32 panel shows simulated connection/telemetry values.
- [ ] System health indicators show the simulated components as online.
- [ ] No crashes occur during an extended run.

### Testing the live-camera CV mode

Run:

```powershell
.\venv\Scripts\python.exe main.py --mock --camera 1
```

Verify:

- [ ] The external webcam feed appears in the **LIVE CAMERA** panel.
- [ ] YOLO detections appear as annotated bounding boxes when applicable.
- [ ] Confidence and FPS values update.
- [ ] Radar remains simulated.
- [ ] STM32 data remains simulated.
- [ ] No separate OpenCV window opens.
- [ ] Closing the dashboard stops the CV pipeline cleanly.

### Testing serial command formatting independently

```bash
python serial_link/test_format_command.py
```

This verifies the command-formatting function used by the serial interface.

### Testing malformed/missing serial data

`serial_link/serial_dashboard.py` contains `parse_telemetry()`, which is intended to handle malformed or missing telemetry without crashing the dashboard.

Example:

```python
from serial_link.serial_dashboard import parse_telemetry

print(parse_telemetry("garbage no colons here"))
print(parse_telemetry("PAN:notanumber,TILT:-5.2"))
```

### Testing missing camera/serial hardware

Run:

```bash
python main.py
```

on a machine without the expected hardware. The dashboard should remain running and report unavailable components rather than crashing.

---

## 5. Known Gap: Radar Data Source in Real Mode

The specification describes camera, radar, and STM32 hardware sources but does not specify how processed radar output reaches this Python process — for example, through serial, UDP, a socket, or shared memory.

Therefore, the current real-mode dashboard does not yet consume a real radar data stream. The real-mode `_tick_real()` path currently uses a no-target radar placeholder until the radar transport is defined.

Once the radar transport is decided, it should be wired into the dashboard's data layer rather than changing the radar visualization itself.

---

## 6. Connecting Real Hardware Later

### Real camera

The dashboard supports selecting a live camera through the command line:

```bash
python main.py --mock --camera 1
```

For normal real-hardware mode, `config.py` still contains the default camera settings:

```python
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
```

If multiple cameras are connected, try another OpenCV index such as `1` or `2`.

### Real STM32 serial connection

In `config.py`, set the correct port for your OS:

```python
SERIAL_PORT = "/dev/ttyUSB0"       # Linux example
# SERIAL_PORT = "COM3"             # Windows example
# SERIAL_PORT = "/dev/tty.usbserial-XXXX"  # macOS example

SERIAL_BAUDRATE = 115200
```

Run:

```bash
python main.py
```

The dashboard will attempt to connect using those settings.

> **Telemetry protocol note:** The STM32 → dashboard telemetry format is currently a placeholder. `parse_telemetry()` expects a format such as:

```text
PAN:12.5,TILT:-5.2,TEMP:34.2,STATUS:TRACKING
```

When the firmware team finalizes the actual telemetry protocol, update `parse_telemetry()` in `serial_link/serial_dashboard.py`.

The outgoing command format is:

```text
X{pan}Y{tilt}Z{distance}\n
```

This is handled by `format_command()`.

### Replacing simulated data with real data

The dashboard is designed to consume structured `DetectionData`, `RadarData`, and `STM32Data` objects. The CV interface provides `receive_detection()` for receiving externally produced detection data.

For the integrated CV pipeline, the dashboard can also start the existing vision pipeline directly using either a test video or a live camera source.

Real radar input still needs a transport/interface decision; see Section 5.

---

## 7. Design Notes / Deviations from Spec

- **`data_types.py`** was added at the project root to hold shared dataclasses such as `DetectionData`, `RadarData`, `STM32Data`, `TargetData`, `SystemHealth`, and `SystemState`.
- **`serial/` → `serial_link/`**: renamed to avoid shadowing the `pyserial` package.
- Radar azimuth convention: `0°` = straight up/forward, positive = clockwise. If the radar hardware uses another convention, convert the input before updating the radar display.
- The exact STM32 telemetry parsing format is still a placeholder because the final wire protocol has not been defined.
- The dashboard's live-camera mock mode intentionally combines **real camera/CV input** with **mock radar/STM32 data** so the integrated UI can be demonstrated without the complete hardware stack.
