"""
bridge.py
Python Hardware Bridge: WebSocket <-> USB Serial / Mock STM32.

Connects the Three.js frontend (via WebSocket on ws://localhost:8765)
to the physical STM32 microcontroller (via USB Serial).

Features:
- Standalone: Runs with ZERO dependencies using Python standard library asyncio,
  or uses 'websockets' and 'pyserial' if installed.
- Auto-fallback Mock Mode: If no physical STM32 COM port is detected,
  it automatically runs a high-fidelity Mock STM32 simulator so you can
  test the full end-to-end hardware pipeline immediately.
- Newline-delimited JSON protocol matching the simulation specification.
"""

import sys
import os
import json
import time
import math
import asyncio
import argparse
import socket
import struct
import hashlib
import base64
from typing import Set

# Try importing third-party libraries if available
try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

# ==============================================================================
# MOCK STM32 SIMULATOR
# ==============================================================================
class MockSTM32:
    """Emulates STM32 firmware with stepper kinematics and thermal models."""
    def __init__(self, invert_pan=True):
        self.invert_pan = invert_pan
        self.actual_pan = 0.0
        self.actual_tilt = 0.0
        self.target_pan = 0
        self.target_tilt = 0
        self.vel_pan = 0.0
        self.vel_tilt = 0.0
        self.max_speed = 2400.0  # steps/s
        self.accel = 4800.0      # steps/s^2
        self.pan_temp = 25.4
        self.tilt_temp = 24.1
        self.heater = 0
        self.enabled = 1
        self.last_update = time.time()

    def process_command(self, cmd: dict):
        action = cmd.get("cmd", "")
        if action == "MOVE":
            if self.enabled:
                self.target_pan = int(cmd.get("pan", self.target_pan))
                self.target_tilt = int(cmd.get("tilt", self.target_tilt))
        elif action == "STOP":
            self.target_pan = int(round(self.actual_pan))
            self.target_tilt = int(round(self.actual_tilt))
            self.vel_pan = 0.0
            self.vel_tilt = 0.0
        elif action == "HOME":
            self.target_pan = 0
            self.target_tilt = 0
        elif action == "ENABLE":
            self.enabled = int(cmd.get("value", 1))

    def process_rate_packet(self, pkt: str):
        pkt = pkt.strip()
        if pkt == "S":
            self.vel_pan = 0.0
            self.vel_tilt = 0.0
            self.target_pan = int(round(self.actual_pan))
            self.target_tilt = int(round(self.actual_tilt))
        elif pkt.startswith("<P,") and pkt.endswith(">"):
            parts = pkt[3:-1].split(",")
            if len(parts) == 2:
                direction, spd_str = parts[0], parts[1]
                spd = float(spd_str)
                # Map speed 1 (fast: ~2200 steps/s) to speed 20 (slow: ~100 steps/s)
                speed_val = max(80.0, 2250.0 - spd * 105.0)
                # If physical hardware pan is inverted:
                # packet <P,L,...> turns physically Right (positive pan in 3D digital twin)
                # packet <P,R,...> turns physically Left (negative pan in 3D digital twin)
                if self.invert_pan:
                    dir_val = 1.0 if direction == "L" else -1.0
                else:
                    dir_val = 1.0 if direction == "R" else -1.0
                self.vel_pan = dir_val * speed_val
        elif pkt.startswith("<T,") and pkt.endswith(">"):
            parts = pkt[3:-1].split(",")
            if len(parts) == 2:
                direction, spd_str = parts[0], parts[1]
                spd = float(spd_str)
                speed_val = max(80.0, 2250.0 - spd * 105.0)
                # Direction "U" is upward elevation (negative tilt steps in Three.js convention)
                # Direction "D" is downward depression (positive tilt steps in Three.js convention)
                dir_val = -1.0 if direction == "U" else 1.0
                self.vel_tilt = dir_val * speed_val

    def update(self):
        now = time.time()
        dt = min(now - self.last_update, 0.1)
        self.last_update = now

        if self.enabled:
            # If moving via rate control
            if abs(self.vel_pan) > 0.1:
                self.actual_pan += self.vel_pan * dt
                self.target_pan = int(round(self.actual_pan))
            else:
                # Pan kinematics setpoint ramp
                err_p = self.target_pan - self.actual_pan
                if abs(err_p) > 0.5:
                    dir_p = 1.0 if err_p > 0 else -1.0
                    desired_v = dir_p * min(self.max_speed, math.sqrt(2.0 * self.accel * abs(err_p)))
                    v_step = self.accel * dt
                    self.vel_pan += max(-v_step, min(v_step, desired_v - self.vel_pan))
                    self.actual_pan += self.vel_pan * dt
                else:
                    self.actual_pan = float(self.target_pan)
                    self.vel_pan = 0.0

            if abs(self.vel_tilt) > 0.1:
                self.actual_tilt += self.vel_tilt * dt
                self.target_tilt = int(round(self.actual_tilt))
            else:
                # Tilt kinematics setpoint ramp
                err_t = self.target_tilt - self.actual_tilt
                if abs(err_t) > 0.5:
                    dir_t = 1.0 if err_t > 0 else -1.0
                    desired_v = dir_t * min(self.max_speed, math.sqrt(2.0 * self.accel * abs(err_t)))
                    v_step = self.accel * dt
                    self.vel_tilt += max(-v_step, min(v_step, desired_v - self.vel_tilt))
                    self.actual_tilt += self.vel_tilt * dt
                else:
                    self.actual_tilt = float(self.target_tilt)
                    self.vel_tilt = 0.0

        # Thermal simulation
        power = 0.8 + (abs(self.vel_pan) + abs(self.vel_tilt)) / (2.0 * self.max_speed) * 3.5
        if self.pan_temp < 6.0:
            self.heater = 1
        elif self.pan_temp > 22.0:
            self.heater = 0
        target_temp = 18.0 + (power * 5.0) + (15.0 if self.heater else 0.0)
        self.pan_temp += (target_temp - self.pan_temp) * (dt / 35.0)
        self.tilt_temp += (target_temp - 0.8 - self.tilt_temp) * (dt / 35.0)

    def get_telemetry(self) -> dict:
        self.update()
        return {
            "type": "telemetry",
            "pan": int(round(self.actual_pan)),
            "tilt": int(round(self.actual_tilt)),
            "pan_target": self.target_pan,
            "tilt_target": self.target_tilt,
            "pan_temp": round(self.pan_temp, 1),
            "tilt_temp": round(self.tilt_temp, 1),
            "heater": self.heater
        }

# ==============================================================================
# LIGHTWEIGHT ASYNCIO WEBSOCKET SERVER (RFC 6455)
# Zero external dependencies needed!
# ==============================================================================
class StandaloneWebSocketServer:
    def __init__(self, host="127.0.0.1", port=8765, on_message=None):
        self.host = host
        self.port = port
        self.on_message = on_message
        self.clients = set()

    async def start(self):
        server = await asyncio.start_server(self.handle_client, self.host, self.port)
        print(f"[BRIDGE] WebSocket Server listening on ws://{self.host}:{self.port}", flush=True)
        return server

    async def handle_client(self, reader, writer):
        # Perform WebSocket Handshake
        try:
            headers = b""
            while b"\r\n\r\n" not in headers:
                chunk = await reader.read(1024)
                if not chunk:
                    return
                headers += chunk

            header_text = headers.decode("latin1")
            key = None
            for line in header_text.split("\r\n"):
                if line.lower().startswith("sec-websocket-key:"):
                    key = line.split(":", 1)[1].strip()
                    break

            if not key:
                writer.close()
                return

            accept_guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept_val = base64.b64encode(hashlib.sha1((key + accept_guid).encode("utf-8")).digest()).decode("utf-8")

            handshake_resp = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
            )
            writer.write(handshake_resp.encode("latin1"))
            await writer.drain()

            self.clients.add(writer)
            print("[BRIDGE] Three.js Frontend Client connected!")

            # Framing loop
            while True:
                head = await reader.read(2)
                if len(head) < 2:
                    break
                b1, b2 = head[0], head[1]
                opcode = b1 & 0x0F
                if opcode == 8: # Close
                    break

                is_masked = bool(b2 & 0x80)
                length = b2 & 0x7F

                if length == 126:
                    ext = await reader.read(2)
                    length = struct.unpack("!H", ext)[0]
                elif length == 127:
                    ext = await reader.read(8)
                    length = struct.unpack("!Q", ext)[0]

                masks = await reader.read(4) if is_masked else b""
                payload = await reader.read(length)

                if is_masked:
                    unmasked = bytes(b ^ masks[i % 4] for i, b in enumerate(payload))
                else:
                    unmasked = payload

                text = unmasked.decode("utf-8", errors="ignore")
                if self.on_message:
                    self.on_message(text)

        except Exception as e:
            pass
        finally:
            self.clients.discard(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            print("[BRIDGE] Frontend Client disconnected.")

    async def broadcast(self, message: str):
        if not self.clients:
            return
        payload = message.encode("utf-8")
        length = len(payload)
        header = bytearray([0x81]) # FIN + Text frame
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", length))

        frame = bytes(header + payload)
        dead = set()
        for client in list(self.clients):
            try:
                client.write(frame)
                await client.drain()
            except Exception:
                dead.add(client)
        for d in dead:
            self.clients.discard(d)


# ==============================================================================
# DIRECT RATE-CONTROL PROTOCOL HELPERS
# ==============================================================================
def calculate_rate_speed(error_px: float):
    """
    Direct Rate-Control Speed Calculation:
    - Deadband (error <= 15px): return None (Stop)
    - Error > 200px: speed = 1 to 3 (fast catch-up)
    - Error > 80px: speed = 5 to 8
    - 15px < Error <= 80px: speed = 9 to 20 (slow crawling near deadband)
    """
    abs_err = abs(error_px)
    if abs_err <= 15.0:
        return None  # Within deadband -> Stop
    elif abs_err > 200.0:
        if abs_err > 400.0:
            return 1
        elif abs_err > 280.0:
            return 2
        else:
            return 3
    elif abs_err > 80.0:
        # Scale between 8 and 5 for errors between 80px and 200px
        fraction = (abs_err - 80.0) / 120.0
        return int(round(8.0 - fraction * 3.0))  # 8 down to 5
    else:
        # Scale between 20 and 9 for errors between 15px and 80px
        fraction = (abs_err - 15.0) / 65.0
        return int(round(20.0 - fraction * 11.0))  # 20 down to 9


# ==============================================================================
# MAIN BRIDGE ORCHESTRATOR
# ==============================================================================
class HardwareBridge:
    def __init__(self, port_name=None, baudrate=115200, force_mock=False, swap_axes=False, invert_pan=True):
        self.port_name = port_name
        self.baudrate = baudrate
        self.force_mock = force_mock
        self.swap_axes = swap_axes
        self.invert_pan = invert_pan
        self.serial_port = None
        self.mock_stm32 = MockSTM32(invert_pan=invert_pan)
        self.ws_server = StandaloneWebSocketServer(host="127.0.0.1", port=8765, on_message=self.handle_frontend_cmd)
        self.last_telem_log_time = 0.0

        # Custom Direct Rate-Control Protocol State
        self.target_locked = False
        self.error_pan_px = 0.0
        self.error_tilt_px = 0.0
        self.last_sent_pan_cmd = None
        self.last_sent_tilt_cmd = None
        self.is_stopped = True

    def connect_serial(self):
        if self.force_mock or not HAS_SERIAL:
            print("[BRIDGE] Mode: MOCK STM32 SIMULATOR (No physical serial needed).", flush=True)
            return

        # Attempt to auto-detect STM32
        target_port = self.port_name
        if not target_port:
            ports = list(serial.tools.list_ports.comports())
            for p in ports:
                desc = (p.description or "").lower()
                if "stm" in desc or "stlink" in desc or "ch340" in desc or "cp210" in desc or "usb" in desc:
                    target_port = p.device
                    break

        if target_port:
            try:
                self.serial_port = serial.Serial(target_port, self.baudrate, timeout=0.05)
                print(f"[BRIDGE] Connected to Physical STM32 on {target_port} @ {self.baudrate} baud.", flush=True)
                return
            except Exception as e:
                print(f"[BRIDGE] Could not open {target_port}: {e}", flush=True)

        print("[BRIDGE] No physical STM32 COM port available. Falling back to MOCK STM32 Mode.", flush=True)

    def handle_frontend_cmd(self, text: str):
        # Process command from Three.js simulation
        line = text.strip()
        if not line:
            return
        try:
            cmd = json.loads(line)
        except Exception:
            return

        cmd_type = cmd.get("cmd", "")

        if cmd_type == "MOVE":
            self.target_locked = cmd.get("lock", True)
            if "err_p" in cmd and "err_t" in cmd:
                self.error_pan_px = float(cmd.get("err_p", 0))
                self.error_tilt_px = float(cmd.get("err_t", 0))
            else:
                self.error_pan_px = (cmd.get("pan", 0) - self.mock_stm32.actual_pan) / 8.8889 * 10.667
                self.error_tilt_px = (cmd.get("tilt", 0) - self.mock_stm32.actual_tilt) / 8.8889 * 10.667
            self.mock_stm32.process_command(cmd)

        elif cmd_type in ("STOP", "HOME", "ENABLE"):
            if cmd_type == "STOP" or (cmd_type == "ENABLE" and cmd.get("value") == 0):
                self.target_locked = False
                self.send_serial_rate("S\n")
            elif cmd_type == "HOME":
                self.send_serial_rate("S\n")
            self.mock_stm32.process_command(cmd)

    def send_serial_rate(self, packet_str: str):
        # Update internal kinematic model so digital twin mirrors physical motion
        self.mock_stm32.process_rate_packet(packet_str)
        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.write(packet_str.encode("utf-8"))
                print(f"[TX -> STM32 RATE PROTOCOL] {packet_str.strip()}", flush=True)
            except Exception as e:
                print(f"[BRIDGE] Serial write error: {e}", flush=True)
        else:
            print(f"[TX -> STM32 RATE PROTOCOL (MOCK)] {packet_str.strip()}", flush=True)

    async def serial_rate_tx_loop(self):
        """
        Custom Direct Rate-Control Serial Loop (30 Hz):
        - Evaluates Pan & Tilt axes independently
        - Transmits compact strings only when command or speed changes
        - Pan: <P,R,speed> or <P,L,speed>
        - Tilt: <T,U,speed> or <T,D,speed>
        - Stop / Centered / Lost: S
        """
        while True:
            await asyncio.sleep(0.033) # 30 Hz loop interval

            if not self.target_locked:
                if not self.is_stopped:
                    self.send_serial_rate("S\n")
                    self.is_stopped = True
                    self.last_sent_pan_cmd = None
                    self.last_sent_tilt_cmd = None
                continue

            # 1. Evaluate Pan and Tilt Axes (with hardware pan inversion)
            if self.swap_axes:
                # Swapped mapping: Physical Pan motor is wired to PC2/PC3 (firmware <T,...>),
                #                  Physical Tilt motor is wired to PC4/PC5 (firmware <P,...>)
                pan_spd = calculate_rate_speed(self.error_pan_px)
                if pan_spd is None:
                    new_pan_cmd = None
                else:
                    if self.invert_pan:
                        pan_dir = "U" if self.error_pan_px > 0 else "D"
                    else:
                        pan_dir = "D" if self.error_pan_px > 0 else "U"
                    new_pan_cmd = f"<T,{pan_dir},{pan_spd}>\n"

                tilt_spd = calculate_rate_speed(self.error_tilt_px)
                if tilt_spd is None:
                    new_tilt_cmd = None
                else:
                    tilt_dir = "U" if self.error_tilt_px < 0 else "D"
                    new_tilt_cmd = f"<P,{tilt_dir},{tilt_spd}>\n"
            else:
                # Standard mapping: Pan is <P,R/L,...>, Tilt is <T,U/D,...>
                pan_spd = calculate_rate_speed(self.error_pan_px)
                if pan_spd is None:
                    new_pan_cmd = None # Centered / Deadband
                else:
                    # Physical Pan Inversion:
                    # User requirement: "the left and right pan is inverted to the hardware so change that too"
                    # Target to Right (error_pan_px > 0): Hardware DIR polarity requires "L" to rotate Right towards target
                    # Target to Left (error_pan_px < 0): Hardware DIR polarity requires "R" to rotate Left towards target
                    if self.invert_pan:
                        pan_dir = "L" if self.error_pan_px > 0 else "R"
                    else:
                        pan_dir = "R" if self.error_pan_px > 0 else "L"
                    new_pan_cmd = f"<P,{pan_dir},{pan_spd}>\n"

                tilt_spd = calculate_rate_speed(self.error_tilt_px)
                if tilt_spd is None:
                    new_tilt_cmd = None # Centered / Deadband
                else:
                    # Target above boresight in sky produces negative angular/pixel error (error_tilt_px < 0) -> Move Up ("U")
                    # Target below boresight produces positive angular/pixel error (error_tilt_px > 0) -> Move Down ("D")
                    tilt_dir = "U" if self.error_tilt_px < 0 else "D"
                    new_tilt_cmd = f"<T,{tilt_dir},{tilt_spd}>\n"

            # 3. Check All-Axis Stop / Centered
            if new_pan_cmd is None and new_tilt_cmd is None:
                if not self.is_stopped:
                    self.send_serial_rate("S\n")
                    self.is_stopped = True
                    self.last_sent_pan_cmd = None
                    self.last_sent_tilt_cmd = None
                continue

            self.is_stopped = False

            # 4. Handle Axis Entering Deadband while the other axis is active
            if self.last_sent_pan_cmd is not None and new_pan_cmd is None:
                # Pan entered deadband -> halt all with 'S', then re-issue active tilt command
                self.send_serial_rate("S\n")
                self.last_sent_pan_cmd = None
                if new_tilt_cmd is not None:
                    self.send_serial_rate(new_tilt_cmd)
                    self.last_sent_tilt_cmd = new_tilt_cmd
            elif self.last_sent_tilt_cmd is not None and new_tilt_cmd is None:
                # Tilt entered deadband -> halt all with 'S', then re-issue active pan command
                self.send_serial_rate("S\n")
                self.last_sent_tilt_cmd = None
                if new_pan_cmd is not None:
                    self.send_serial_rate(new_pan_cmd)
                    self.last_sent_pan_cmd = new_pan_cmd

            # 5. Transmit Active Axis Commands only when changed or speed changed
            if new_pan_cmd is not None and new_pan_cmd != self.last_sent_pan_cmd:
                self.send_serial_rate(new_pan_cmd)
                self.last_sent_pan_cmd = new_pan_cmd

            if new_tilt_cmd is not None and new_tilt_cmd != self.last_sent_tilt_cmd:
                self.send_serial_rate(new_tilt_cmd)
                self.last_sent_tilt_cmd = new_tilt_cmd

    async def telemetry_loop(self):
        """Streams telemetry at 30 Hz to all connected simulation clients."""
        while True:
            await asyncio.sleep(0.033) # ~30 Hz
            telemetry = None
            t_obj = None
            now = time.time()

            if self.serial_port and self.serial_port.is_open:
                # Read from physical serial if firmware provides telemetry
                try:
                    while self.serial_port.in_waiting:
                        line = self.serial_port.readline().decode("utf-8", errors="ignore").strip()
                        if line.startswith("{") and line.endswith("}"):
                            try:
                                t_obj = json.loads(line)
                                self._last_hw_telem_time = now
                                # If physical hardware pan is inverted, normalize pan steps to 3D digital twin
                                if self.invert_pan and "pan" in t_obj:
                                    t_obj["pan"] = -t_obj["pan"]
                                if self.invert_pan and "pan_target" in t_obj:
                                    t_obj["pan_target"] = -t_obj["pan_target"]
                                telemetry = json.dumps(t_obj)
                            except Exception:
                                pass
                            break
                except Exception:
                    pass

            # If physical firmware does not stream telemetry (open-loop pulse generator),
            # synthesize digital twin telemetry from the internal kinematic model
            if not t_obj or (now - getattr(self, '_last_hw_telem_time', 0)) > 0.2:
                t_obj = self.mock_stm32.get_telemetry()
                telemetry = json.dumps(t_obj)

            if telemetry:
                await self.ws_server.broadcast(telemetry)

            now = time.time()

            # Dynamic Hot-Plug: Attempt to connect if physical port is not yet open
            if not self.serial_port and not self.force_mock and (now - getattr(self, '_last_scan_time', 0)) >= 3.0:
                self._last_scan_time = now
                self.connect_serial()

            # Periodically print telemetry status to terminal when a client is connected
            if t_obj and len(self.ws_server.clients) > 0 and (now - self.last_telem_log_time) >= 2.0:
                self.last_telem_log_time = now
                p_deg = t_obj.get("pan", 0) / 8.8889
                t_deg = t_obj.get("tilt", 0) / 8.8889
                h_str = "ON" if t_obj.get("heater") else "OFF"
                print(f"[HARDWARE -> SIM] TELEMETRY | Pan: {t_obj.get('pan', 0):5d} stp ({p_deg:+6.1f} deg) | Tilt: {t_obj.get('tilt', 0):5d} stp ({t_deg:+5.1f} deg) | M1: {t_obj.get('pan_temp', 0):.1f}C | M2: {t_obj.get('tilt_temp', 0):.1f}C | Heater: {h_str}", flush=True)

    async def run(self):
        self.connect_serial()
        server = await self.ws_server.start()
        print("==================================================================", flush=True)
        print(" SIH26050 Hardware Bridge running on ws://localhost:8765", flush=True)
        print(" Protocol: Custom Direct Rate-Control (<P,R/L,spd>, <T,U/D,spd>, S)", flush=True)
        print(f" Axis Mapping: {'SWAPPED (--swap-axes active)' if self.swap_axes else 'STANDARD (Pan -> P, Tilt -> T)'}", flush=True)
        print(f" Pan Polarity: {'INVERTED (Matched to physical prototype)' if self.invert_pan else 'STANDARD'}", flush=True)
        print(" Open simulation in browser (http://localhost:8085)", flush=True)
        print(" Toggle 'REAL' hardware in the HUD to connect to this bridge.", flush=True)
        print(" Press Ctrl+C to terminate.", flush=True)
        print("==================================================================", flush=True)
        await asyncio.gather(
            self.telemetry_loop(),
            self.serial_rate_tx_loop()
        )

def main():
    parser = argparse.ArgumentParser(description="SIH26050 STM32 Hardware Bridge")
    parser.add_argument("--port", type=str, default=None, help="Serial COM port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--mock", action="store_true", help="Force Mock STM32 hardware simulator mode")
    parser.add_argument("--swap-axes", action="store_true", help="Swap Pan and Tilt axis assignments")
    parser.add_argument("--no-invert-pan", dest="invert_pan", action="store_false", help="Disable physical pan axis inversion")
    parser.set_defaults(invert_pan=True)
    args = parser.parse_args()

    bridge = HardwareBridge(port_name=args.port, baudrate=args.baud, force_mock=args.mock, swap_axes=args.swap_axes, invert_pan=args.invert_pan)
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        print("\n[BRIDGE] Stopped by user.")

if __name__ == "__main__":
    main()
