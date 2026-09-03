#!/usr/bin/env python3
import urllib.request
import os

def download_video():
    url = "https://github.com/HarshSingh2009/Drone-Detection-YOLOv8/raw/main/drone.mp4"
    dest = "drone.mp4"
    print(f"[DOWNLOAD] Downloading test drone video from: {url}")
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"[DOWNLOAD] Success! Saved as '{dest}' ({os.path.getsize(dest) / 1024 / 1024:.2f} MB).")
    except Exception as e:
        print(f"[DOWNLOAD ERROR] Failed to download from primary link: {e}")
        # Fallback to people detection video
        url_fallback = "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4"
        print(f"[DOWNLOAD] Trying fallback video from: {url_fallback}")
        try:
            urllib.request.urlretrieve(url_fallback, dest)
            print(f"[DOWNLOAD] Success! Saved fallback as '{dest}' ({os.path.getsize(dest) / 1024 / 1024:.2f} MB).")
        except Exception as e2:
            print(f"[DOWNLOAD ERROR] Fallback also failed: {e2}")

if __name__ == "__main__":
    download_video()
