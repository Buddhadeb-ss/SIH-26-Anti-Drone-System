#!/usr/bin/env python3
import cv2
import numpy as np
import json
import argparse
import os

def run_calibration(source, chessboard_size, square_size):
    cols, rows = chessboard_size
    print(f"[CALIB] Chessboard size configured to: {cols}x{rows} interior corners.")
    print(f"[CALIB] Square size: {square_size} meters.")

    # 3D points in real-world space
    objp = np.zeros((cols * rows, 3), np.float32)
    objp[:, :2] = np.mgrid[0:cols, 0:rows].T.reshape(-1, 2) * square_size

    # Arrays to store object points and image points from all the images.
    objpoints = [] # 3d point in real world space
    imgpoints = [] # 2d points in image plane.

    cap = cv2.VideoCapture(source)
    if isinstance(source, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[CALIB] Camera resolution: {width}x{height}")

    print("\n=== INSTRUCTIONS ===")
    print("1. Hold a printed chessboard pattern in front of the camera.")
    print("2. When corners are detected (lines colored), press 'SPACE' to capture a calibration frame.")
    print("3. Capture at least 12-15 frames from different angles, distances, and tilts.")
    print("4. Press 'c' to run the mathematical calibration and save parameters.")
    print("5. Press 'q' to quit.")
    print("====================\n")

    captured_frames = 0
    cv2.namedWindow("SIH26050 - Camera Calibration Wizard", cv2.WINDOW_NORMAL)

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[CALIB ERROR] Empty frame received.")
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Find the chessboard corners
        ret_corners, corners = cv2.findChessboardCorners(gray, (cols, rows), None)

        display_frame = frame.copy()

        # If found, draw the corners
        if ret_corners:
            cv2.drawChessboardCorners(display_frame, (cols, rows), corners, ret_corners)
            cv2.putText(display_frame, "CHESSBOARD DETECTED - Press SPACE to capture", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        else:
            cv2.putText(display_frame, "Searching for Chessboard...", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # Telemetry panel
        cv2.putText(display_frame, f"Captured Frames: {captured_frames}", (20, height - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        cv2.imshow("SIH26050 - Camera Calibration Wizard", display_frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord(' '):
            if ret_corners:
                objpoints.append(objp)
                # Refine corners for subpixel accuracy
                criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
                corners2 = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
                imgpoints.append(corners2)
                captured_frames += 1
                print(f"[CALIB] Captured frame {captured_frames} successfully!")
            else:
                print("[CALIB WARNING] Chessboard corners not detected in this frame. Capture rejected.")
        
        elif key == ord('c'):
            if captured_frames < 10:
                print(f"[CALIB WARNING] You only captured {captured_frames} frames. Minimum 10 is recommended.")
                continue
            
            print("[CALIB] Computing calibration matrix (this may take a few seconds)...")
            ret_val, camera_matrix, distortion_coefficients, rotation_vectors, translation_vectors = cv2.calibrateCamera(
                objpoints, imgpoints, gray.shape[::-1], None, None
            )

            if ret_val:
                fx = float(camera_matrix[0, 0])
                fy = float(camera_matrix[1, 1])
                cx = float(camera_matrix[0, 2])
                cy = float(camera_matrix[1, 2])
                
                print("\n=== CALIBRATION RESULTS ===")
                print(f"Calibration Re-projection Error: {ret_val:.4f} pixels")
                print(f"Focal Length X (fx): {fx:.2f} pixels")
                print(f"Focal Length Y (fy): {fy:.2f} pixels")
                print(f"Principal Point X (cx): {cx:.2f} pixels")
                print(f"Principal Point Y (cy): {cy:.2f} pixels")
                print("===========================\n")

                # Save to JSON
                calibration_data = {
                    "fx": fx,
                    "fy": fy,
                    "cx": cx,
                    "cy": cy,
                    "error": ret_val,
                    "dist_coef": distortion_coefficients.ravel().tolist(),
                    "resolution": [width, height],
                    "timestamp": os.path.getmtime(__file__) if os.path.exists(__file__) else 0.0
                }

                output_path = "camera_calibration.json"
                with open(output_path, 'w') as f:
                    json.dump(calibration_data, f, indent=4)
                print(f"[CALIB] Calibration parameters successfully written to '{output_path}'.")
                break
            else:
                print("[CALIB ERROR] Calibration math failed.")

        elif key == ord('q'):
            print("[CALIB] Exited calibration wizard without saving.")
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIH26050 Camera Calibration Script")
    parser.add_argument("--source", type=str, default="0", help="Camera index (0, 1) or test video file")
    parser.add_argument("--cols", type=int, default=9, help="Number of interior corners along the width (cols)")
    parser.add_argument("--rows", type=int, default=6, help="Number of interior corners along the height (rows)")
    parser.add_argument("--square", type=float, default=0.025, help="Size of chessboard square in meters (e.g. 0.025 for 25mm)")

    args = parser.parse_args()

    source_val = args.source
    if source_val.isdigit():
        source_val = int(source_val)

    run_calibration(
        source=source_val,
        chessboard_size=(args.cols, args.rows),
        square_size=args.square
    )
