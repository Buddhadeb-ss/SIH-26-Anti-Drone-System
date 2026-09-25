import subprocess, time, json, urllib.request, socket, os, base64

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

subprocess.run(['taskkill', '/F', '/IM', 'msedge.exe'], capture_output=True)
time.sleep(1.0)

proc = subprocess.Popen([edge_path, '--headless', '--remote-debugging-port=9222', '--window-size=1600,900', 'http://localhost:8085'])
time.sleep(3.0)

def get_page_socket():
    tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json').read().decode())
    target_tab = [t for t in tabs if 'SIH26050' in t.get('title', '')][0]
    page_id = target_tab['id']
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(('127.0.0.1', 9222))
    key = base64.b64encode(os.urandom(16)).decode('utf-8')
    req = f'GET /devtools/page/{page_id} HTTP/1.1\r\nHost: 127.0.0.1:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    s.sendall(req.encode())
    resp = s.recv(4096).decode('latin1')
    return s

def send_frame(s, payload):
    data = json.dumps(payload).encode('utf-8')
    length = len(data)
    frame = bytearray([0x81])
    if length <= 125:
        frame.append(0x80 | length)
    else:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
    mask = os.urandom(4)
    frame.extend(mask)
    masked = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    frame.extend(masked)
    s.sendall(frame)

def take_snap(filename):
    s = get_page_socket()
    send_frame(s, {'id': 1, 'method': 'Page.enable'})
    send_frame(s, {'id': 2, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}})
    s.settimeout(5.0)
    raw = bytearray()
    t0 = time.time()
    while time.time() - t0 < 5.0:
        try:
            c = s.recv(65536)
            if c:
                raw.extend(c)
                idx = raw.find(b'"data":"')
                if idx != -1:
                    end_idx = raw.find(b'"', idx + 8)
                    if end_idx != -1:
                        b64 = raw[idx + 8:end_idx]
                        out_p = os.path.join(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891', filename)
                        with open(out_p, 'wb') as f:
                            f.write(base64.b64decode(b64))
                        print(f"SAVED: {filename} ({os.path.getsize(out_p)} bytes)", flush=True)
                        s.close()
                        return True
        except socket.timeout:
            break
    s.close()
    return False

def eval_code(code):
    s = get_page_socket()
    send_frame(s, {'id': 100, 'method': 'Runtime.evaluate', 'params': {'expression': code}})
    time.sleep(0.3)
    s.close()

def eval_return(code):
    s = get_page_socket()
    send_frame(s, {'id': 101, 'method': 'Runtime.evaluate', 'params': {'expression': code, 'returnByValue': True}})
    s.settimeout(3.0)
    raw = bytearray()
    t0 = time.time()
    res = None
    while time.time() - t0 < 3.0:
        try:
            c = s.recv(65536)
            if c:
                raw.extend(c)
                idx = raw.find(b'"result":')
                if idx != -1:
                    bracket_end = raw.find(b'}}\r\n')
                    if bracket_end == -1:
                        bracket_end = raw.find(b'}}}')
                    if bracket_end != -1:
                        chunk = raw[idx:bracket_end+3].decode('utf-8', errors='ignore')
                        try:
                            parsed = json.loads('{' + chunk)
                            val = parsed.get('result', {}).get('value')
                            res = val
                            break
                        except:
                            pass
        except socket.timeout:
            break
    s.close()
    return res

print("Verifying UI clean-up: Pressure toggle removed, Drone Wind Tilt added...")
ui_check = eval_return("""(() => {
    return {
        hasPressureToggle: Boolean(document.getElementById('toggle-env-pressure')),
        hasWindToggle: Boolean(document.getElementById('toggle-env-wind')),
        hasFreezeToggle: Boolean(document.getElementById('toggle-env-freeze')),
        droneTiltElem: Boolean(document.getElementById('val-rxn-dronetilt')),
        droneTiltText: document.getElementById('val-rxn-dronetilt')?.textContent,
        windStreakLinesCount: window.app.environment.windStreakLines?.geometry.attributes.position.count
    };
})()""")
print("UI & SPEED STREAKS CHECK:", json.dumps(ui_check, indent=2))

print("Activating High Wind toggle...")
eval_code("document.getElementById('toggle-env-wind').click();")
time.sleep(1.5)

wind_active_check = eval_return("""(() => {
    const drone = window.app.droneManager.getSelectedTarget();
    const trackingState = window.app.modeTracker.getState();
    return {
        windSpeed: window.app.modeTracker.envModel.currentWindSpeed,
        isHighWind: window.app.modeTracker.envModel.isHighWind,
        windTiltDeg: window.app.droneManager.getWindTiltDeg(),
        hudTiltText: document.getElementById('val-rxn-dronetilt')?.textContent,
        streakOpacity: window.app.environment.windStreakLines?.material.opacity,
        iceOpacity: window.app.environment.icePoints?.material.opacity,
        panErrorDeg: trackingState.panErrorDeg?.toFixed(2),
        tiltErrorDeg: trackingState.tiltErrorDeg?.toFixed(2)
    };
})()""")
print("WIND ACTIVE TELEMETRY:", json.dumps(wind_active_check, indent=2))

time.sleep(1.0)
take_snap("speedy_wind_streaks_and_tilted_drone.png")

# Close-up on drone to showcase smooth aerodynamic tilt into the wind
eval_code("window.app.cameraManager.setMode('drone');")
time.sleep(1.5)

take_snap("drone_aerodynamic_wind_tilt_closeup.png")

proc.kill()
print("ALL TESTS AND CAPTURES COMPLETED.")
