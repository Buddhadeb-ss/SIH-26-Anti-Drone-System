# SIH 2026 — Anti-Drone System Dashboard

A display/visualization dashboard for the Anti-Drone System. This
project is **display-only** — it does not implement detection,
tracking, gimbal control, or engagement logic. It receives data from
external CV, radar, and STM32 systems (or generates mock data) and
displays it.

---

## 1. File Tree

```
dashboard/
├── main.py                          # entry point (--mock flag lives here)
├── config.py                        # camera/serial/refresh-rate settings
├── data_types.py                    # shared dataclasses (DetectionData, RadarData, etc.)
├── requirements.txt
├── README.md
├── ui/
│   └── dashboard.py                 # main window, all panels, layout
├── cv/
│   └── cv_interface.py              # camera capture + detection data intake
├── serial_link/                     # <-- see naming note below
│   ├── serial_dashboard.py          # STM32 command formatting + telemetry parsing
│   └── test_format_command.py       # standalone proof of the command format
├── radar/
│   └── radar_display.py             # circular radar widget (pure visualization)
└── simulation/
    └── mock_data.py                 # mock/simulation data generator
```

### A naming note on `serial_link/`

The original spec named this folder `serial/`. It was renamed to
`serial_link/` because a local package literally named `serial` will
shadow the real `pyserial` library — which is imported in Python code
as `import serial` — breaking serial communication in a confusing way.
The **file** inside is still `serial_dashboard.py` as specified; only
the containing folder name changed.

---

## 2. Installation

```bash
cd dashboard
pip install -r requirements.txt
```

---

## 3. Running

**Mock/simulation mode (no hardware required):**

```bash
python main.py --mock
```

**Real hardware mode** (attempts to open the configured camera and
serial port from `config.py`):

```bash
python main.py
```

If the camera or serial device isn't available, the dashboard will
show `CAMERA OFFLINE` / `DISCONNECTED` instead of crashing — see
Section 6.

---

## 4. Mock-Mode Testing Procedure

Run `python main.py --mock` and verify:

- [ ] A yellow **"MOCK / SIMULATION MODE"** banner is visible at the top.
- [ ] The camera panel shows a dark placeholder feed labeled "MOCK FEED"
      with a bounding box drawn on it once a target appears.
- [ ] The radar panel animates: range rings, angle markings, and a red
      target dot that appears/moves/disappears as the state cycles.
- [ ] Target info panel values (State, Target, Confidence, Distance,
      Target ID) update continuously.
- [ ] The system state cycles through, roughly every ~20 seconds:
      `SYSTEM STARTUP → SEARCHING → TARGET DETECTED → TRACKING → TARGET LOCK → TARGET LOST → SEARCHING...`
      This was verified directly during development — see note below.
- [ ] STM32 panel shows `CONNECTED`, with Pan/Tilt/Temperature values
      updating each tick.
- [ ] System health bar shows all five indicators green/ONLINE.
- [ ] No crashes over an extended run (left running for several minutes).

**Note on TARGET LOCK confidence:** in testing, confidence during
TARGET LOCK climbs toward ~0.96 but the 4-second dwell time in that
state may end before it fully converges (it reached ~0.83 in one
observed run). This is a tuning knob, not a bug — if you want
confidence to visibly settle at its target value before the state
advances, either increase `STATE_DURATIONS[SystemState.TARGET_LOCK]`
or increase the smoothing rate (the `* 0.05` factor) in
`simulation/mock_data.py`'s `_update_values()`.

### Testing serial command formatting independently

```bash
python serial_link/test_format_command.py
```

This proves `pan=12.5, tilt=-5.2, distance=1500` produces exactly
`X12.5Y-5.2Z1500.0\n` — confirmed passing during development.

### Testing malformed/missing serial data

`serial_link/serial_dashboard.py`'s `parse_telemetry()` was verified
against empty strings, non-numeric values, missing structure, and
`None` input — all return a valid (if partly empty) `STM32Data`
instead of raising. You can re-run this check yourself:

```python
from serial_link.serial_dashboard import parse_telemetry
print(parse_telemetry("garbage no colons here"))     # does not crash
print(parse_telemetry("PAN:notanumber,TILT:-5.2"))    # does not crash
```

### Testing missing camera/serial hardware

Run `python main.py` (no `--mock`) on a machine with no camera and no
STM32 plugged in. This was verified during development: OpenCV logs
some noisy backend warnings to the console (harmless — that's OpenCV's
own logging, not a Python exception), and the dashboard correctly
reports `Camera available: False` / `Serial connected: False` and
keeps running without crashing.

---

## 5. Known Gap: Radar Data Source in Real Mode

The spec describes three hardware sources (camera, radar, STM32) but
doesn't specify **how the processed radar output reaches this Python
process** — serial, a second serial port, UDP, a socket, shared
memory, etc. Rather than guess and risk it being wrong, `ui/dashboard.py`'s
`_tick_real()` currently hardcodes radar data to "no target" in
non-mock mode, with a comment marking exactly where to wire in the
real source once that's decided. Search for `_tick_real` in
`ui/dashboard.py` to find it.

---

## 6. Connecting Real Hardware Later

### Real camera

Already wired up. In `config.py`, adjust:

```python
CAMERA_INDEX = 0        # try 1, 2, etc. if you have multiple cameras
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
```

Run without `--mock` and `cv/cv_interface.py`'s `CVInterface` will
attempt to open that camera automatically. If it fails, the dashboard
shows `CAMERA OFFLINE` rather than crashing.

### Real STM32 serial connection

In `config.py`, set the correct port for your OS:

```python
SERIAL_PORT = "/dev/ttyUSB0"   # Linux example
# SERIAL_PORT = "COM3"          # Windows example
# SERIAL_PORT = "/dev/tty.usbserial-XXXX"  # macOS example

SERIAL_BAUDRATE = 115200        # match your STM32 firmware's baud rate
```

Run without `--mock` and `serial_link/serial_dashboard.py`'s
`SerialDashboard` will attempt to connect automatically.

**Important — telemetry protocol is a placeholder.** The STM32 →
dashboard telemetry format was not finalized in the spec, so
`parse_telemetry()` currently expects a simple placeholder format:

```
PAN:12.5,TILT:-5.2,TEMP:34.2,STATUS:TRACKING
```

Once your firmware team finalizes the real protocol, **only**
`parse_telemetry()` in `serial_link/serial_dashboard.py` needs to
change — it always returns an `STM32Data` object, so nothing else in
the dashboard needs to be touched.

The **outgoing** command format (Python → STM32) is already final per
your spec and is NOT a placeholder:

```
X{pan}Y{tilt}Z{distance}\n
```

This is implemented in `format_command()` and verified exact by
`test_format_command.py`. It deliberately does not include a
laser/engagement field, since the STM32 handles engagement autonomously.

### Replacing mock CV/radar data with real data

Real CV data comes in via `CVInterface.receive_detection(DetectionData)`
in `cv/cv_interface.py` — call this from wherever your real YOLOv8-nano
process runs (a separate script/process pushing into this interface,
or however you choose to connect them).

Real radar data: see Section 5 above — the transport mechanism isn't
decided yet, so this needs to be wired into `_tick_real()` in
`ui/dashboard.py` once it is.

In both cases, the UI code (`ui/dashboard.py`, `radar/radar_display.py`)
never needs to change — it only ever reads `DetectionData` / `RadarData`
/ `STM32Data` objects, regardless of where they came from.

---

## 7. Design Notes / Deviations from Spec

- **`data_types.py`** was added at the project root (not explicitly
  listed in the original file tree) to hold the shared dataclasses
  (`DetectionData`, `RadarData`, `STM32Data`, `TargetData`,
  `SystemHealth`, `SystemState`). This was necessary so every module
  (cv, radar, serial_link, simulation, ui) can import the same class
  definitions without importing from each other and risking circular
  imports.
- **`serial/` → `serial_link/`**: see Section 1.
- Radar azimuth convention: 0° = straight up/forward, positive =
  clockwise. If your radar hardware uses a different convention,
  convert before calling `update_radar_data()`, or adjust the angle
  math in `radar/radar_display.py`'s `_polar_to_cartesian()`.
- The exact STM32 telemetry parsing format is a placeholder (see
  Section 6) since the real protocol wasn't finalized — everything
  else assumes only the `STM32Data` shape, not the wire format.
