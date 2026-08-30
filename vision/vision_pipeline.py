#!/usr/bin/env python3
import cv2
import numpy as np
import time
import argparse
import sys
import serial
import threading
import json
import os
from ultralytics import YOLO

# ==========================================
# 1. Configuration & Global Standards
# ==========================================
# Default camera matrix parameters for 1080p stream
# (These should be calibrated using chessboard target on Day 7)
FOCAL_LENGTH_X = 1000.0  # fx
FOCAL_LENGTH_Y = 1000.0  # fy
CENTER_X = 960.0         # u0 (cx)
CENTER_Y = 540.0         # v0 (cy)

# State Machine Definitions
STATE_INIT = 0
STATE_IDLE = 1
STATE_TRACKING = 2
STATE_LOCKED = 3
STATE_FAULT = 4

STATE_NAMES = {
    STATE_INIT: "INIT",
    STATE_IDLE: "IDLE",
    STATE_TRACKING: "TRACKING",
    STATE_LOCKED: "LOCKED",
    STATE_FAULT: "FAULT"
}

# Global states updated by serial reader thread
current_system_state = STATE_IDLE
current_mcu_pan = 0.0
current_mcu_tilt = 0.0
current_mcu_temp = 25.0
current_mcu_lock = 0
last_telemetry_time = 0

# Serial communication configuration
TELEMETRY_TX_INTERVAL = 0.1  # Limit output to 10 Hz (100 ms)
last_tx_time = 0

# ==========================================
# 2. Mock Serial Class (For Testing without HW)
# ==========================================
class DummySerial:
    def __init__(self, port, baud):
        self.port = port
        self.baud = baud
        self.is_open = True
        print(f"[MOCK SERIAL] Initialized loopback connection on virtual port '{port}' at {baud} baud.")

    def write(self, data):
        # Decode and print command to terminal
        try:
            cmd = data.decode('ascii').strip()
            print(f"[MOCK SERIAL SEND] {cmd}")
        except Exception:
            pass

    def read_line(self):
        # Emulate receiving telemetry JSON from STM32
        time.sleep(0.1)  # Simulate 10 Hz rate
        mock_temp = 25.0 - (time.time() % 40)  # Emulate temperature changes down into negative
        mock_data = {
            "t": int(time.time() * 1000) & 0xFFFFFF,
            "p": round(current_mcu_pan + np.random.uniform(-0.1, 0.1), 2),
            "tlt": round(current_mcu_tilt + np.random.uniform(-0.1, 0.1), 2),
            "tmp": round(mock_temp, 1),
            "lck": current_mcu_lock
        }
        return json.dumps(mock_data).encode('ascii') + b'\n'

    def readline(self):
        return self.read_line()

    def close(self):
        self.is_open = False

# ==========================================
# 2.5. Sensor Fusion (Kalman Filter & Radar)
# ==========================================
class KalmanFilter3D:
    def __init__(self, dt=0.033, q_noise=0.05, r_cam_noise=0.02, r_radar_noise=0.4):
        self.dt = dt
        # State vector: [X, Y, Z, Vx, Vy, Vz]^T
        self.x = np.zeros((6, 1))
        # Covariance matrix P
        self.P = np.eye(6) * 10.0
        
        # State Transition model F (Constant Velocity)
        self.F = np.array([
            [1, 0, 0, dt,  0,  0],
            [0, 1, 0,  0, dt,  0],
            [0, 0, 1,  0,  0, dt],
            [0, 0, 0,  1,  0,  0],
            [0, 0, 0,  0,  1,  0],
            [0, 0, 0,  0,  0,  1]
        ])
        
        # Measurement matrix H (we measure position X, Y, Z directly)
        self.H = np.array([
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0]
        ])
        
        # Process Noise Q
        q_pos = 0.25 * (dt ** 4) * q_noise
        q_vel = (dt ** 2) * q_noise
        self.Q = np.array([
            [q_pos, 0, 0, 0.5*(dt**3)*q_noise, 0, 0],
            [0, q_pos, 0, 0, 0.5*(dt**3)*q_noise, 0],
            [0, 0, q_pos, 0, 0, 0.5*(dt**3)*q_noise],
            [0.5*(dt**3)*q_noise, 0, 0, q_vel, 0, 0],
            [0, 0.5*(dt**3)*q_noise, 0, 0, q_vel, 0],
            [0, 0, 0.5*(dt**3)*q_noise, 0, 0, q_vel]
        ])
        
        # Measurement Covariance matrices
        self.R_cam = np.eye(3) * r_cam_noise
        # Radar is noisy in X and Y, but very precise in Z (depth/range)
        self.R_radar = np.diag([r_radar_noise, r_radar_noise, r_cam_noise * 0.5])
        
        self.initialized = False
        self.last_update_time = 0

    def initialize(self, x_init, y_init, z_init, current_time):
        self.x = np.array([[x_init], [y_init], [z_init], [0.0], [0.0], [0.0]])
        self.P = np.eye(6) * 1.0
        self.initialized = True
        self.last_update_time = current_time

    def predict(self, current_time):
        if not self.initialized:
            return
        dt = current_time - self.last_update_time
        if dt <= 0:
            return
        self.last_update_time = current_time
        
        # Update F and Q with dynamic dt
        self.F[0, 3] = dt
        self.F[1, 4] = dt
        self.F[2, 5] = dt
        
        self.x = np.dot(self.F, self.x)
        self.P = np.dot(np.dot(self.F, self.P), self.F.T) + self.Q

    def update(self, z_meas, is_radar=False):
        if not self.initialized:
            return
            
        R = self.R_radar if is_radar else self.R_cam
        
        # Residual
        y = np.array([[z_meas[0]], [z_meas[1]], [z_meas[2]]]) - np.dot(self.H, self.x)
        # Residual covariance
        S = np.dot(np.dot(self.H, self.P), self.H.T) + R
        # Kalman Gain
        K = np.dot(np.dot(self.P, self.H.T), np.linalg.inv(S))
        # State update
        self.x = self.x + np.dot(K, y)
        # Covariance update
        I = np.eye(6)
        self.P = np.dot(I - np.dot(K, self.H), self.P)
        
    def get_position(self):
        return float(self.x[0, 0]), float(self.x[1, 0]), float(self.x[2, 0])

class MockRadar:
    def __init__(self, noise_std=0.8):
        self.noise_std = noise_std
        self.last_radar_time = 0
        
    def get_measurement(self, true_x, true_y, true_z, current_time):
        # 10 Hz update rate
        if current_time - self.last_radar_time >= 0.1:
            self.last_radar_time = current_time
            # X/Y are noisy, Z is clean
            noise_x = np.random.normal(0, self.noise_std)
            noise_y = np.random.normal(0, self.noise_std)
            noise_z = np.random.normal(0, self.noise_std * 0.1)
            return (true_x + noise_x, true_y + noise_y, true_z + noise_z)
        return None

# ==========================================
# 3. Serial Communication Thread
# ==========================================
def serial_reader_thread(ser):
    global current_system_state, current_mcu_pan, current_mcu_tilt, current_mcu_temp, current_mcu_lock, last_telemetry_time
    print("[SERIAL] Receiver daemon thread started.")
    while True:
        try:
            if not ser.is_open:
                break
            line = ser.readline()
            if line:
                # Parse incoming JSON from STM32
                data = json.loads(line.decode('ascii').strip())
                current_mcu_pan = data.get("p", current_mcu_pan)
                current_mcu_tilt = data.get("tlt", current_mcu_tilt)
                current_mcu_temp = data.get("tmp", current_mcu_temp)
                current_mcu_lock = data.get("lck", current_mcu_lock)
                last_telemetry_time = time.time()
        except Exception:
            time.sleep(0.1)  # Ignore parse/read errors during disconnects

# ==========================================
# 4. Main Perception Pipeline
# ==========================================
def run_perception_pipeline(
    source_path,
    serial_port,
    baud_rate,
    use_yolo,
    weights_path="yolov8n.pt",
    dashboard_callback=None,
    enable_serial=True,
    display=True,
    loop_video=False,
    stop_event=None,
):
    global last_tx_time, current_system_state, current_mcu_lock
    global FOCAL_LENGTH_X, FOCAL_LENGTH_Y, CENTER_X, CENTER_Y

    # Load camera calibration if available
    calib_file = "camera_calibration.json"
    if os.path.exists(calib_file):
        try:
            with open(calib_file, 'r') as f:
                calib_data = json.load(f)
            FOCAL_LENGTH_X = calib_data.get("fx", FOCAL_LENGTH_X)
            FOCAL_LENGTH_Y = calib_data.get("fy", FOCAL_LENGTH_Y)
            CENTER_X = calib_data.get("cx", CENTER_X)
            CENTER_Y = calib_data.get("cy", CENTER_Y)
            print(f"[VISION] Loaded camera calibration parameters from '{calib_file}': fx={FOCAL_LENGTH_X:.2f}, fy={FOCAL_LENGTH_Y:.2f}, cx={CENTER_X:.2f}, cy={CENTER_Y:.2f}")
        except Exception as e:
            print(f"[VISION WARNING] Failed to read calibration file '{calib_file}': {e}. Using defaults.")
    else:
        print(f"[VISION] No calibration file '{calib_file}' found. Using default camera parameters.")
    
    # 4.1. Initialize Serial Link
    # Dashboard integration mode disables serial because the dashboard uses
    # its own mock STM32 data. Standalone/real mode keeps serial behavior.
    ser = None
    if enable_serial:
        try:
            ser = serial.Serial(serial_port, baud_rate, timeout=1.0)
            print(f"[SERIAL] Connected to physical port '{serial_port}' at {baud_rate} baud.")
        except Exception as e:
            print(f"[SERIAL WARNING] Could not connect to physical port '{serial_port}': {e}")
            print("[SERIAL WARNING] Falling back to DummySerial loopback mode.")
            ser = DummySerial(serial_port, baud_rate)

        reader = threading.Thread(target=serial_reader_thread, args=(ser,), daemon=True)
        reader.start()
    else:
        print("[SERIAL] Disabled for dashboard integration mode.")

    # 4.2. Initialize Detector & Tracker
    import torch
    device = 'cuda' if (use_yolo and torch.cuda.is_available()) else 'cpu'
    if use_yolo:
        # Auto-prepend hf-hub: if downloading from Hugging Face and not a local file
        if "/" in weights_path and not os.path.exists(weights_path) and not weights_path.startswith("hf-hub:"):
            weights_path = f"hf-hub:{weights_path}"
            
        print(f"[VISION] Loading weights on target device '{device}': '{weights_path}'")
        try:
            # First try loading directly
            model = YOLO(weights_path)
            print("[VISION] YOLO model loaded successfully.")
        except Exception as e:
            # If that fails and it's a Hugging Face path, run manual download
            if "/" in weights_path:
                clean_repo = weights_path.replace("hf-hub:", "")
                print(f"[VISION] Direct loading failed. Attempting manual download from Hugging Face repository '{clean_repo}'...")
                try:
                    from huggingface_hub import hf_hub_download
                    # Search for common weight filenames in the HF repo
                    model_loaded = False
                    for fname in ["best.pt", "model.pt", "drone-yolo.pt"]:
                        try:
                            print(f"[VISION] Querying HF Hub for '{fname}'...")
                            downloaded_path = hf_hub_download(repo_id=clean_repo, filename=fname)
                            print(f"[VISION] Found and downloaded '{fname}' successfully. Loading...")
                            model = YOLO(downloaded_path)
                            print("[VISION] YOLO model loaded successfully.")
                            model_loaded = True
                            break
                        except Exception:
                            continue
                    
                    if not model_loaded:
                        raise Exception("No supported weights file (best.pt, model.pt) found in this Hugging Face repository.")
                except Exception as hf_err:
                    print(f"[VISION ERROR] Hugging Face manual download failed: {hf_err}")
                    print("[VISION] Falling back to OpenCV KCF Tracker only.")
                    use_yolo = False
            else:
                print(f"[VISION ERROR] Failed to load YOLO model: {e}")
                print("[VISION] Falling back to OpenCV KCF Tracker only.")
                use_yolo = False

    # Initialize frame tracker and labels
    tracker = None
    tracking_active = False
    target_label = "TARGET"
    
    # Auto-adjust detection interval based on GPU capability
    if use_yolo:
        if device == 'cuda':
            detection_interval = 1  # Run YOLO on every frame on GPU (extremely fast, ~5ms)
            print("[VISION] GPU detected. Running YOLOv8 detection on every frame for zero-drift.")
        else:
            detection_interval = 10  # Use KCF tracker on CPU to save cycles
            print("[VISION] CPU mode. Running YOLOv8 every 10 frames + KCF tracker for low latency.")
    else:
        detection_interval = 10
        
    frame_counter = 0

    # 4.3. Initialize Video Feed
    print(f"[VISION] Opening video source: '{source_path}'")
    cap = cv2.VideoCapture(source_path)
    
    # Set video resolution (forces 1080p if webcam supports it)
    if isinstance(source_path, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"[VISION] Stream resolution: {width}x{height} @ {fps:.1f} FPS")

    # Update calibration constants to match actual frame size if not 1080p
    CENTER_X = width / 2.0
    CENTER_Y = height / 2.0

    # Initialize Sensor Fusion components
    dt_val = 1.0 / fps if (fps and fps > 0) else 0.033
    kf = KalmanFilter3D(dt=dt_val)
    radar = MockRadar(noise_std=0.8)
    occlusion_active = False
    radar_measurement = None

    if display:
        cv2.namedWindow("SIH26050 - Tactical Commander HUD", cv2.WINDOW_NORMAL)

    while cap.isOpened():
        if stop_event is not None and stop_event.is_set():
            print("[VISION] Stop requested by dashboard.")
            break

        start_frame_time = time.time()
        ret, frame = cap.read()
        if not ret:
            if loop_video and not isinstance(source_path, int):
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            print("[VISION] End of stream or empty frame received.")
            break
            
        frame_counter += 1
        bbox = None
        target_found = False
        best_conf = 0.0

        # 4.4. Detection & Tracking Logic (Ground Truth capture for simulator)
        ground_truth_bbox = None
        if use_yolo and (not tracking_active or (frame_counter % detection_interval == 0)):
            results = model(frame, verbose=False, device=device)[0]
            boxes = results.boxes.xyxy.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy()
            confidences = results.boxes.conf.cpu().numpy()

            ALLOWED_CLASS_NAMES = {"person", "airplane", "bird", "cell phone", "drone", "quadcopter", "fixed-wing"}
            best_idx = -1
            best_conf = 0.0
            for idx, conf in enumerate(confidences):
                class_id = int(classes[idx])
                class_name = model.names[class_id]
                if class_name.lower() in ALLOWED_CLASS_NAMES and conf > 0.5:
                    best_idx = idx
                    best_conf = conf
                    break

            if best_idx != -1:
                x1, y1, x2, y2 = boxes[best_idx]
                ground_truth_bbox = (int(x1), int(y1), int(x2 - x1), int(y2 - y1))
                class_name = model.names[int(classes[best_idx])]
                target_label = f"{class_name.upper()} ({best_conf*100:.0f}%)"
                
                # Update tracker if not occluded
                if not occlusion_active and detection_interval > 1:
                    tracker = cv2.TrackerKCF_create()
                    tracker.init(frame, ground_truth_bbox)
                    tracking_active = True
                
                if not occlusion_active:
                    bbox = ground_truth_bbox
                    target_found = True
            else:
                if not tracking_active:
                    target_label = "TARGET"
        
        elif tracking_active and tracker is not None and not occlusion_active:
            success, bbox = tracker.update(frame)
            if success:
                target_found = True
                ground_truth_bbox = bbox
            else:
                tracking_active = False
                tracker = None
                target_label = "TARGET"
        else:
            if not occlusion_active:
                target_label = "TARGET"

        # If occlusion is active, force reset tracking states and target found for the visual stream
        if occlusion_active:
            target_found = False
            tracking_active = False
            tracker = None

        # 4.5. Sensor Fusion (Radar Simulator & 3D Kalman Filter Update)
        current_time = time.time()
        
        # Calculate ground truth 3D coordinates from bbox (if available, even if occluded)
        if ground_truth_bbox is not None:
            gt_x, gt_y, gt_w, gt_h = ground_truth_bbox
            gt_center_x = gt_x + (gt_w / 2.0)
            gt_center_y = gt_y + (gt_h / 2.0)
            
            # 3D math: camera measurements
            z_cam = round(15.0 * (100.0 / float(max(1, gt_w))), 2)
            x_cam = ((gt_center_x - CENTER_X) * z_cam) / FOCAL_LENGTH_X
            y_cam = ((gt_center_y - CENTER_Y) * z_cam) / FOCAL_LENGTH_Y
            
            # Predict step
            kf.predict(current_time)
            
            # If not initialized, initialize now
            if not kf.initialized:
                kf.initialize(x_cam, y_cam, z_cam, current_time)
                
            # If camera is not occluded, update Kalman filter with camera measurements
            if not occlusion_active:
                kf.update((x_cam, y_cam, z_cam), is_radar=False)
                
            # Simulate Mock Radar update
            radar_measurement = radar.get_measurement(x_cam, y_cam, z_cam, current_time)
            if radar_measurement is not None:
                kf.update(radar_measurement, is_radar=True)
        else:
            # If no target seen at all, let Kalman filter predict and update *only* if radar still updates
            kf.predict(current_time)
            
        # 4.6. Calculate Gimbal Output Coordinates from Fused Kalman State
        pan_err = 0.0
        tilt_err = 0.0
        target_distance = 0.0
        
        if kf.initialized:
            x_fused, y_fused, z_fused = kf.get_position()
            
            # Angle offsets in degrees
            pan_err = np.arctan(x_fused / max(0.1, z_fused)) * (180.0 / np.pi)
            tilt_err = -np.arctan(y_fused / max(0.1, z_fused)) * (180.0 / np.pi)
            target_distance = round(z_fused, 2)
            
            current_system_state = STATE_TRACKING
            if abs(pan_err) < 2.0 and abs(tilt_err) < 2.0:
                current_system_state = STATE_LOCKED
                current_mcu_lock = 1
            else:
                current_mcu_lock = 0
                
            # Safety timeout: if target gets too far or lost, reset initialization
            if z_fused > 100.0 or z_fused <= 0.1:
                kf.initialized = False
        else:
            current_system_state = STATE_IDLE
            current_mcu_lock = 0

        # 4.7. Send Telemetry to STM32 at 10 Hz
        if enable_serial and ser is not None and current_time - last_tx_time >= TELEMETRY_TX_INTERVAL:
            serial_command = f"X{pan_err:+.2f}Y{tilt_err:+.2f}Z{target_distance:.2f}\n"
            ser.write(serial_command.encode('ascii'))
            last_tx_time = current_time

        # 4.8. Draw HUD overlays
        # Center reference crosshairs
        cv2.drawMarker(frame, (int(CENTER_X), int(CENTER_Y)), (0, 255, 0), cv2.MARKER_CROSS, 40, 2)
        cv2.circle(frame, (int(CENTER_X), int(CENTER_Y)), 10, (0, 255, 0), 1)

        # Draw camera visual tracking box (if active and not occluded)
        if target_found and bbox is not None and not occlusion_active:
            tx, ty, tw, th = bbox
            cv2.rectangle(frame, (int(tx), int(ty)), (int(tx+tw), int(ty+th)), (0, 255, 255), 2)
            cv2.putText(frame, f"{target_label} [CAM]", (int(tx), int(ty - 10)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

        # Draw Fused Kalman/Radar target tracking indicator
        if kf.initialized:
            x_fused, y_fused, z_fused = kf.get_position()
            u_fused = (x_fused * FOCAL_LENGTH_X) / z_fused + CENTER_X
            v_fused = (y_fused * FOCAL_LENGTH_Y) / z_fused + CENTER_Y
            
            # Map physical Z to a bounding box size on screen
            box_sz = max(20, int(100.0 * (15.0 / z_fused)))
            fx1 = int(u_fused - box_sz/2)
            fy1 = int(v_fused - box_sz/2)
            
            # Draw dotted box for Fused Target (Orange)
            fused_color = (0, 165, 255) if not occlusion_active else (30, 144, 255) # Orange or Dodger Blue
            
            # Dotted rectangle using OpenCV line function
            def draw_dotted_rect(img, p1, p2, color, thickness=1, gap=5):
                rx1, ry1 = p1
                rx2, ry2 = p2
                # horizontal lines
                for rx in range(rx1, rx2, gap * 2):
                    cv2.line(img, (rx, ry1), (min(rx + gap, rx2), ry1), color, thickness)
                    cv2.line(img, (rx, ry2), (min(rx + gap, rx2), ry2), color, thickness)
                # vertical lines
                for ry in range(ry1, ry2, gap * 2):
                    cv2.line(img, (rx1, ry), (rx1, min(ry + gap, ry2)), color, thickness)
                    cv2.line(img, (rx2, ry), (rx2, min(ry + gap, ry2)), color, thickness)

            draw_dotted_rect(frame, (fx1, fy1), (fx1 + box_sz, fy1 + box_sz), fused_color, 2)
            cv2.drawMarker(frame, (int(u_fused), int(v_fused)), fused_color, cv2.MARKER_TILTED_CROSS, 15, 2)
            
            label_text = "RADAR TRACK" if occlusion_active else "FUSED TARGET"
            cv2.putText(frame, f"{label_text} [{STATE_NAMES[current_system_state]}]", (fx1, fy1 - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, fused_color, 2)
            cv2.putText(frame, f"D_EST: {target_distance:.2f}m", (fx1, fy1 + box_sz + 20), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, fused_color, 2)

        # Draw visual occlusion banner if active
        if occlusion_active:
            if (int(time.time() * 3) % 2) == 0:
                cv2.putText(frame, "!!! VISUAL LOSS - RADAR TRACKING ACTIVE !!!", (width // 2 - 250, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 3)

        # Draw Tactical Information panel on top-left
        hud_bg = np.zeros((215, 360, 3), dtype=np.uint8)
        frame[10:225, 10:370] = cv2.addWeighted(frame[10:225, 10:370], 0.4, hud_bg, 0.6, 0.0)
        
        cv2.putText(frame, "SIH26050 COUNTER-UAS C2 HUD", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        cv2.putText(frame, "-------------------------", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        state_color = (0, 0, 255) if current_system_state == STATE_LOCKED else (0, 255, 255)
        cv2.putText(frame, f"SYSTEM STATE: {STATE_NAMES[current_system_state]}", (20, 70), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, state_color, 2)
        
        fusion_status = "ACTIVE [RADAR ONLY]" if occlusion_active else ("ACTIVE [CAM+RADAR]" if kf.initialized else "STANDBY")
        fusion_color = (30, 144, 255) if occlusion_active else ((0, 255, 0) if kf.initialized else (128, 128, 128))
        cv2.putText(frame, f"SENSOR FUSION: {fusion_status}", (20, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, fusion_color, 2)
                    
        cv2.putText(frame, f"TARGET ERROR: P:{pan_err:+.2f} deg | T:{tilt_err:+.2f} deg", (20, 115), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        cv2.putText(frame, f"MCU ENCODER : P:{current_mcu_pan:+.2f} deg | T:{current_mcu_tilt:+.2f} deg", (20, 140), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        # Display temperature from NTC thermistor and warning if cryogenic
        temp_color = (0, 255, 255) if current_mcu_temp < 5.0 else (0, 255, 0)
        if current_mcu_temp < 0.0:
            temp_color = (0, 0, 255)
            cv2.putText(frame, f"PTC HEATER  : ACTIVE [COLD SHOCK]", (20, 195), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        else:
            cv2.putText(frame, f"PTC HEATER  : STANDBY", (20, 195), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            
        cv2.putText(frame, f"AMBIENT TEMP: {current_mcu_temp:+.1f} C", (20, 165), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, temp_color, 2)

        # Performance / Latency readout
        latency_ms = (time.time() - start_frame_time) * 1000.0
        cv2.putText(frame, f"LATENCY: {latency_ms:.1f} ms", (width - 160, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # Publish processed output to the dashboard when requested.
        if dashboard_callback is not None:
            elapsed = max(time.time() - start_frame_time, 1e-6)
            dashboard_callback({
                "frame": frame.copy(),
                "detected": bool(target_found),
                "bbox": tuple(float(v) for v in bbox) if bbox is not None else None,
                "confidence": float(best_conf) if 'best_conf' in locals() else 0.0,
                "state": STATE_NAMES[current_system_state],
                "distance": float(target_distance),
                "pan_error": float(pan_err),
                "tilt_error": float(tilt_err),
                "fps": float(1.0 / elapsed),
            })

        # Standalone mode keeps the original OpenCV window and controls.
        if display:
            cv2.imshow("SIH26050 - Tactical Commander HUD", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                print("[VISION] Exiting pipeline.")
                break
            elif key == ord('o'):
                occlusion_active = not occlusion_active
                print(f"[VISION] Occlusion state toggled: {occlusion_active}")
            elif key == ord('r'):
                print("[VISION] Reset request triggered.")
                if ser is not None:
                    ser.write(b"RESET\n")


    # Cleanup
    cap.release()
    if ser is not None:
        ser.close()
    if display:
        cv2.destroyAllWindows()
    print("[VISION] Resources released successfully.")

# ==========================================
# 5. CLI Execution Handler
# ==========================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIH26050 Anti-Drone CV & Fusion Pipeline")
    parser.add_argument("--source", type=str, default="0", help="Video source (0 for webcam, or video file path)")
    parser.add_argument("--port", type=str, default="/dev/ttyUSB0", help="Serial port (e.g. /dev/ttyUSB0, COM3)")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate")
    parser.add_argument("--no-yolo", action="store_true", help="Disable YOLO detection and use color tracker")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="YOLO model weights (local file path or HuggingFace ID)")

    args = parser.parse_args()

    # Convert integer source values (e.g., "0" -> 0 for camera index)
    source_val = args.source
    if source_val.isdigit():
        source_val = int(source_val)

    use_yolo = not args.no_yolo
    
    run_perception_pipeline(
        source_path=source_val,
        serial_port=args.port,
        baud_rate=args.baud,
        use_yolo=use_yolo,
        weights_path=args.weights
    )
