#!/usr/bin/env python3
"""
PROJECT ZERO: Autonomous Optical Anti-Drone Tracking Pipeline
Runs YOLOv8 inference, calculates pixel error from center, and streams coordinates to ESP32-S3.
Protocol: <X:%d,Y:%d>\n @ 115200 baud, 50 Hz streaming rate.
"""
import cv2
import time
import argparse
import serial
import serial.tools.list_ports
from ultralytics import YOLO

# 1. AUTO-DETECT ESP32 SERIAL PORT (EXCLUDES BLUETOOTH VIRTUAL PORTS)
def find_esp32_port():
    """Auto-detect USB serial port for ESP32-S3 while filtering out Bluetooth ports."""
    try:
        def is_bluetooth(p):
            text = (p.description + " " + p.device + " " + (p.hwid or "")).lower()
            return any(b in text for b in ["bluetooth", "bth", "bthenum"])

        # 1. Prefer known USB-to-UART bridge chips (CH34x, CP210x, FTDI, ESP, USB Serial)
        for p in serial.tools.list_ports.comports():
            if is_bluetooth(p):
                continue
            text = (p.description + " " + p.device + " " + (p.hwid or "")).lower()
            if any(k in text for k in ["ch34", "cp21", "usb", "uart", "esp", "ftdi", "silicon labs"]):
                return p.device

        # 2. Fallback to any non-Bluetooth COM port
        for p in serial.tools.list_ports.comports():
            if not is_bluetooth(p):
                return p.device
    except Exception:
        pass
    return None

def main():
    parser = argparse.ArgumentParser(description="Project Zero: Optical Gimbal Tracking Pipeline")
    parser.add_argument("--source", type=str, default="0", help="Camera index (0, 1) or test video file path")
    parser.add_argument("--port", type=str, default="auto", help="Serial port (auto or COMx / /dev/ttyUSBx)")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate (default: 115200)")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="YOLOv8 weights file")
    parser.add_argument("--width", type=int, default=640, help="Camera capture width (default: 640)")
    parser.add_argument("--height", type=int, default=480, help="Camera capture height (default: 480)")
    parser.add_argument("--deadzone", type=int, default=15, help="Deadzone in pixels (default: 15)")
    args = parser.parse_args()

    # Port connection
    port = args.port
    if port.lower() == "auto":
        port = find_esp32_port()

    print(f"📡 Connecting to Gimbal on {port} @ {args.baud} baud...")
    ser = None
    if port:
        try:
            ser = serial.Serial(port, args.baud, timeout=0.05)
            time.sleep(1.0)
            print(f"✅ Connected to ESP32-S3 Gimbal Controller on {port}!")
        except Exception as e:
            print(f"⚠️ Warning: Serial connection to {port} failed ({e}). Running in Preview Mode only.")
            ser = None
    else:
        print("⚠️ Warning: No USB serial device detected. Running in Preview Mode only.")

    # Load YOLOv8 Model
    print(f"🧠 Loading YOLOv8 model ({args.weights})...")
    model = YOLO(args.weights)

    source_val = int(args.source) if args.source.isdigit() else args.source
    cap = None
    if isinstance(source_val, int):
        # Use DirectShow backend on Windows to prevent MSMF grabFrame errors
        cap = cv2.VideoCapture(source_val, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(source_val)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
        # Flush initial frames to let camera sensor stabilize
        for _ in range(5):
            cap.read()
    else:
        cap = cv2.VideoCapture(source_val)

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or args.width
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or args.height
    center_x = frame_w // 2
    center_y = frame_h // 2
    deadzone_px = args.deadzone

    print(f"📷 Stream Resolution: {frame_w}x{frame_h} | Optical Center: ({center_x}, {center_y}) | Deadzone: {deadzone_px}px")
    print("🚀 Tracking active! Press 'Q' on the video window to exit.\n")

    last_serial_t = 0.0
    allowed_classes = {"person", "airplane", "aeroplane", "bird", "cell phone", "drone", "quadcopter", "fixed-wing", "sports ball"}

    try:
        consecutive_drops = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                if not isinstance(source_val, int):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                consecutive_drops += 1
                if consecutive_drops > 30:
                    print("⚠️ Lost camera feed or camera disconnected.")
                    break
                time.sleep(0.02)
                continue
            consecutive_drops = 0

            results = model(frame, verbose=False)
            target_box = None
            best_conf = 0.0
            target_label = "TARGET"

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = model.names[cls_id]
                    conf = float(box.conf[0])
                    if (cls_name.lower() in allowed_classes or conf > 0.60) and conf > 0.35:
                        if conf > best_conf:
                            best_conf = conf
                            target_box = box.xyxy[0].cpu().numpy()
                            target_label = f"{cls_name.upper()} ({conf*100:.0f}%)"

            err_x, err_y = 0, 0
            target_locked = False
            u, v = None, None

            if target_box is not None:
                x1, y1, x2, y2 = target_box
                u = int((x1 + x2) / 2)
                v = int((y1 + y2) / 2)
                err_x = u - center_x
                err_y = v - center_y
                target_locked = True

                # Draw target bounding box, center dot, and tracking line
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
                cv2.circle(frame, (u, v), 5, (0, 0, 255), -1)
                cv2.line(frame, (center_x, center_y), (u, v), (0, 255, 255), 2)
                cv2.putText(frame, f"{target_label} (u:{u}, v:{v})", (int(x1), max(20, int(y1) - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

            # Stream coordinate frame to ESP32 @ 50 Hz (<X:%d,Y:%d>\n)
            now = time.time()
            if (now - last_serial_t) >= 0.02:
                cmd = f"<X:{err_x},Y:{err_y}>\n"
                if ser is not None:
                    try:
                        ser.write(cmd.encode("utf-8"))
                    except Exception as tx_err:
                        print(f"⚠️ Serial TX Error: {tx_err}")
                last_serial_t = now

            # HUD Reticle & Deadzone Overlay
            in_deadzone = target_locked and (abs(err_x) <= deadzone_px)
            color = (0, 255, 0) if in_deadzone else ((0, 255, 255) if target_locked else (0, 165, 255))
            cv2.drawMarker(frame, (center_x, center_y), color, cv2.MARKER_CROSS, 25, 2)
            cv2.circle(frame, (center_x, center_y), deadzone_px, (0, 255, 0), 1)

            # HUD Text
            status_text = f"LOCKED: ΔX={err_x:+d}px, ΔY={err_y:+d}px" if target_locked else "SEARCHING..."
            if in_deadzone:
                status_text += " [DEADZONE]"
            cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

            packet_text = f"TX: <X:{err_x},Y:{err_y}> (50Hz)"
            cv2.putText(frame, packet_text, (20, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)

            cv2.imshow("PROJECT ZERO - Optical Drone Tracking", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
        if ser is not None:
            ser.close()
        print("🛑 Tracking terminated cleanly.")

if __name__ == "__main__":
    main()
