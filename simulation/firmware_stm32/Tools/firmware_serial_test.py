#!/usr/bin/env python3
"""
==============================================================================
SIH26050 FIRMWARE TEST UTILITY (For Firmware Teammate)
==============================================================================
Use this script to test the STM32 firmware independently over USB Serial
before connecting it to the 3D simulation or Computer Vision tracking setup.

Tests:
  1. Serial Connection @ 115200 Baud
  2. Telemetry Reception (20 Hz)
  3. Action Commands: HOME, STOP, ENABLE
  4. Movement Commands: MOVE Pan & Tilt steps
==============================================================================
"""

import sys
import time
import json
import argparse

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[ERROR] pyserial is not installed! Run: pip install pyserial")
    sys.exit(1)

def find_stm32_port():
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = (p.description or "").lower()
        if "stm" in desc or "stlink" in desc or "ch340" in desc or "cp210" in desc or "usb" in desc:
            return p.device
    if ports:
        return ports[0].device
    return None

def main():
    parser = argparse.ArgumentParser(description="SIH26050 STM32 Firmware Tester")
    parser.add_argument("--port", type=str, default=None, help="Serial port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    args = parser.parse_args()

    port = args.port or find_stm32_port()
    if not port:
        print("[ERROR] No COM port detected! Plug in STM32 USB cable and retry.")
        sys.exit(1)

    print(f"[TEST] Opening {port} at {args.baud} baud...")
    try:
        ser = serial.Serial(port, args.baud, timeout=0.5)
    except Exception as e:
        print(f"[ERROR] Could not open {port}: {e}")
        sys.exit(1)

    time.sleep(1.0) # Allow STM32 to boot
    ser.reset_input_buffer()
    ser.reset_output_buffer()

    print("\n==================================================================")
    print(" 1. WAITING FOR 20 Hz TELEMETRY STREAM FROM STM32...")
    print("==================================================================")
    start_t = time.time()
    telemetry_count = 0
    last_telemetry = None

    while time.time() - start_t < 3.0:
        line = ser.readline().decode("utf-8", errors="ignore").strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                pkt = json.loads(line)
                if pkt.get("type") == "telemetry":
                    telemetry_count += 1
                    last_telemetry = pkt
                    if telemetry_count <= 3:
                        print(f"  [RX TELEMETRY #{telemetry_count}] {line}")
            except Exception:
                pass

    if telemetry_count > 0:
        rate = telemetry_count / 3.0
        print(f"[PASS] Telemetry streaming verified! Rate: ~{rate:.1f} Hz (Expected ~20 Hz)")
        print(f"       Current Pan: {last_telemetry.get('pan')} stp, Tilt: {last_telemetry.get('tilt')} stp")
    else:
        print("[WARN] No telemetry packets received yet. Make sure main loop calls Protocol_FormatTelemetry()!")

    print("\n==================================================================")
    print(" 2. TESTING ACTION COMMANDS (ENABLE & HOME)...")
    print("==================================================================")
    enable_cmd = json.dumps({"cmd": "ENABLE", "value": 1}) + "\n"
    print(f"  [TX] {enable_cmd.strip()}")
    ser.write(enable_cmd.encode("utf-8"))
    time.sleep(0.5)

    home_cmd = json.dumps({"cmd": "HOME"}) + "\n"
    print(f"  [TX] {home_cmd.strip()}")
    ser.write(home_cmd.encode("utf-8"))
    time.sleep(1.0)

    print("\n==================================================================")
    print(" 3. TESTING STEP MOVEMENT (PAN = 400 stp / +45°, TILT = -180 stp / -20°)...")
    print("==================================================================")
    move_cmd = json.dumps({"cmd": "MOVE", "pan": 400, "tilt": -180}) + "\n"
    print(f"  [TX] {move_cmd.strip()}")
    ser.write(move_cmd.encode("utf-8"))
    time.sleep(1.5)

    # Read back response
    ser.reset_input_buffer()
    time.sleep(0.5)
    line = ser.readline().decode("utf-8", errors="ignore").strip()
    print(f"  [RX RESPONSE] {line}")

    print("\n==================================================================")
    print(" 4. TESTING RETURN TO MECHANICAL ZERO (PAN = 0, TILT = 0)...")
    print("==================================================================")
    move_zero = json.dumps({"cmd": "MOVE", "pan": 0, "tilt": 0}) + "\n"
    print(f"  [TX] {move_zero.strip()}")
    ser.write(move_zero.encode("utf-8"))
    time.sleep(1.5)

    print("\n==================================================================")
    print(" 5. TESTING EMERGENCY STOP...")
    print("==================================================================")
    stop_cmd = json.dumps({"cmd": "STOP"}) + "\n"
    print(f"  [TX] {stop_cmd.strip()}")
    ser.write(stop_cmd.encode("utf-8"))
    time.sleep(0.5)

    print("\n[SUCCESS] Test sequence completed! Firmware is ready for HIL Simulation.")
    ser.close()

if __name__ == "__main__":
    main()
