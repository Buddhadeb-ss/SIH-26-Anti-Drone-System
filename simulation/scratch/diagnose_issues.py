import subprocess, time, json, urllib.request, socket, os, base64

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

subprocess.run(['taskkill', '/F', '/IM', 'msedge.exe'], capture_output=True)
time.sleep(1.0)

# Start Edge with 1366x768 to check UI fit on standard laptop screens
proc = subprocess.Popen([edge_path, '--headless', '--remote-debugging-port=9222', '--window-size=1366,768', 'http://localhost:8085'])
time.sleep(3.0)

tabs = json.loads(urllib.request.urlopen('http://localhost:9222/json').read().decode())
target_tab = [t for t in tabs if 'SIH26050' in t.get('title', '')][0]
page_id = target_tab['id']

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('127.0.0.1', 9222))
key = base64.b64encode(os.urandom(16)).decode('utf-8')
req = f'GET /devtools/page/{page_id} HTTP/1.1\r\nHost: 127.0.0.1:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
s.sendall(req.encode())
resp = s.recv(4096).decode('latin1')

def send_frame(s, payload):
    data = json.dumps(payload).encode('utf-8')
    length = len(data)
    frame = bytearray([0x81])
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
    else:
        frame.append(0x80 | 127)
        frame.extend(length.to_bytes(8, 'big'))
    mask = os.urandom(4)
    frame.extend(mask)
    masked = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    frame.extend(masked)
    s.sendall(frame)

def recv_frame(s):
    hdr = s.recv(2)
    if len(hdr) < 2: return None
    b1, b2 = hdr[0], hdr[1]
    masked = (b2 & 0x80) != 0
    payload_len = b2 & 0x7F
    if payload_len == 126:
        ext = s.recv(2)
        payload_len = int.from_bytes(ext, 'big')
    elif payload_len == 127:
        ext = s.recv(8)
        payload_len = int.from_bytes(ext, 'big')
    mask = s.recv(4) if masked else None
    data = bytearray()
    while len(data) < payload_len:
        chunk = s.recv(payload_len - len(data))
        if not chunk: break
        data.extend(chunk)
    if masked:
        data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    return data.decode('utf-8', errors='ignore')

msg_id = 100
def eval_js(expr):
    global msg_id
    msg_id += 1
    send_frame(s, {'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}})
    while True:
        txt = recv_frame(s)
        if not txt: break
        try:
            obj = json.loads(txt)
            if obj.get('id') == msg_id:
                return obj.get('result', {}).get('result', {}).get('value', {})
        except Exception:
            pass
    return None

send_frame(s, {'id': 1, 'method': 'Runtime.enable'})
time.sleep(1.0)

diag_code = """
(() => {
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    const bodyHeight = document.body.scrollHeight;
    const leftPanel = document.getElementById('drone-telemetry-panel');
    const rightPanel = document.getElementById('station-telemetry-panel');
    const missionBar = document.querySelector('.mission-bar');
    const hudHeader = document.querySelector('.hud-header');
    
    return {
        winHeight,
        docHeight,
        bodyHeight,
        hasVerticalScroll: docHeight > winHeight,
        leftPanelHeight: leftPanel ? leftPanel.offsetHeight : 0,
        rightPanelHeight: rightPanel ? rightPanel.offsetHeight : 0,
        leftBottom: leftPanel ? leftPanel.getBoundingClientRect().bottom : 0,
        rightBottom: rightPanel ? rightPanel.getBoundingClientRect().bottom : 0,
        missionBarTop: missionBar ? missionBar.getBoundingClientRect().top : 0,
        missionBarBottom: missionBar ? missionBar.getBoundingClientRect().bottom : 0,
        hudHeaderBottom: hudHeader ? hudHeader.getBoundingClientRect().bottom : 0,
        windToggleFound: Boolean(document.getElementById('toggle-env-wind')),
        windToggleActive: document.getElementById('toggle-env-wind')?.classList.contains('active'),
        isHighWindInit: window.app?.modeTracker?.envModel?.isHighWind,
        baseWindSpeedInit: window.app?.modeTracker?.envModel?.baseWindSpeed,
        currentWindSpeedInit: window.app?.modeTracker?.envModel?.currentWindSpeed,
    };
})()
"""

res = eval_js(diag_code)
print("DIAGNOSTIC 1 (Initial 1366x768):")
print(json.dumps(res, indent=2))

click_code = """
(() => {
    const btn = document.getElementById('toggle-env-wind');
    btn.click();
    return {
        clicked: true,
        btnActive: btn.classList.contains('active'),
        isHighWindAfter: window.app?.modeTracker?.envModel?.isHighWind,
        baseWindSpeedAfter: window.app?.modeTracker?.envModel?.baseWindSpeed,
        currentWindSpeedAfter: window.app?.modeTracker?.envModel?.currentWindSpeed,
    };
})()
"""
res2 = eval_js(click_code)
print("\nDIAGNOSTIC 2 (After clicking toggle-env-wind):")
print(json.dumps(res2, indent=2))

time.sleep(1.5)
tilt_code = """
(() => {
    return {
        isHighWind: window.app?.modeTracker?.envModel?.isHighWind,
        currentWindSpeed: window.app?.modeTracker?.envModel?.currentWindSpeed,
        windTiltDeg: window.app?.droneManager?.getWindTiltDeg(),
        drones: window.app?.droneManager?.getDrones().map(d => ({
            id: d.id,
            windTiltAngle: d.windTiltAngle,
            windTiltBearing: d.windTiltBearing,
            pos: d.getPosition()
        }))
    };
})()
"""
res3 = eval_js(tilt_code)
print("\nDIAGNOSTIC 3 (After 1.5s in High Wind):")
print(json.dumps(res3, indent=2))

# Also take screenshot at 1366x768
def capture_screenshot(filename):
    send_frame(s, {'id': 999, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}})
    while True:
        txt = recv_frame(s)
        if not txt: break
        try:
            obj = json.loads(txt)
            if obj.get('id') == 999:
                img_data = base64.b64decode(obj['result']['data'])
                with open(filename, 'wb') as f:
                    f.write(img_data)
                print(f"Saved screenshot: {filename}")
                break
        except Exception:
            pass

capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\screen_1366x768.png')

s.close()
proc.kill()
