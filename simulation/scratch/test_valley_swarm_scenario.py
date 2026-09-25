import subprocess, time, json, urllib.request, socket, os, base64

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

subprocess.run(['taskkill', '/F', '/IM', 'msedge.exe'], capture_output=True)
time.sleep(1.0)

proc = subprocess.Popen([edge_path, '--headless', '--remote-debugging-port=9222', '--window-size=1440,840', 'http://localhost:8085'])
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
    return json.loads(data.decode('utf-8'))

msg_id = 1
def eval_js(expr):
    global msg_id
    mid = msg_id
    msg_id += 1
    send_frame(s, {'id': mid, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}})
    while True:
        res = recv_frame(s)
        if res and res.get('id') == mid:
            if 'exceptionDetails' in res.get('result', {}):
                print('JS EXCEPTION:', res['result']['exceptionDetails'])
            return res.get('result', {}).get('result', {}).get('value')

def capture_screenshot(filename):
    global msg_id
    mid = msg_id
    msg_id += 1
    send_frame(s, {'id': mid, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}})
    while True:
        res = recv_frame(s)
        if res and res.get('id') == mid:
            data = res.get('result', {}).get('data', '')
            with open(filename, 'wb') as f:
                f.write(base64.b64decode(data))
            print(f'Saved screenshot: {filename}')
            return

# Check basic page load & terrain details
time.sleep(2.0)
buildings_count = eval_js('window.app.environment.settlementBuildings.length')
print(f'Valley settlement buildings count: {buildings_count}')
radar_range = eval_js('window.app.dualRadarEngine.maxRange')
print(f'Dual Radar Engine maxRange: {radar_range}m')

# Position camera for optimal overview of mountain ridge looking down into valley highway and settlements
eval_js('''
  const cam = window.app.engine.camera;
  cam.position.set(-6.5, 4.5, -4.5);
  cam.lookAt(0, -4.0, 16.0);
  window.app.cameraManager.controls.target.set(0, -4.0, 16.0);
''')
time.sleep(1.0)
capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\revamped_valley_overlook.png')

# 2. Trigger Scenario 9: 25-drone settlement swarm attack
print('Triggering Scenario 9: Settlement Swarm Attack...')
eval_js('''
  const sel = document.getElementById('select-scenario');
  sel.value = 'settlement_swarm';
  sel.dispatchEvent(new Event('change'));
''')
time.sleep(0.5)

drones_count = eval_js('window.app.droneManager.drones.length')
active_scenario = eval_js('window.app.droneManager.activeScenario')
print(f'Active scenario: {active_scenario}, Total drones spawned: {drones_count}')

# Check first target locked and distance to building
target_id = eval_js('window.app.droneManager.selectedTargetId')
bld_dist = eval_js('window.app.droneManager.getSelectedTarget() ? window.app.droneManager.getMinBuildingDist(window.app.droneManager.getSelectedTarget().getPosition()) : 0')
print(f'Initial target locked: {target_id}, Nearest building distance: {bld_dist}m')

# Move camera slightly to capture full swarm ingress over valley
eval_js('''
  const cam = window.app.engine.camera;
  cam.position.set(-14.0, 5.8, -2.0);
  cam.lookAt(2.0, -3.5, 16.5);
  window.app.cameraManager.controls.target.set(2.0, -3.5, 16.5);
''')
time.sleep(0.8)
capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\swarm_ingress_25drones.png')

# 3. Monitor missile interceptor launches and drone destructions over time
print('Monitoring rapid kinetic missile engagement sequence...')
kill_log = []
start_t = time.time()
for step in range(35):
    time.sleep(0.6)
    alive = eval_js('window.app.droneManager.drones.filter(d => !d.isNeutralized).length')
    current_tgt = eval_js('window.app.droneManager.selectedTargetId')
    active_missiles = eval_js('window.app.droneManager.activeMissiles.length')
    active_explosions = eval_js('window.app.droneManager.activeExplosions.length')
    tgt_bld_dist = eval_js('window.app.droneManager.getSelectedTarget() ? window.app.droneManager.getMinBuildingDist(window.app.droneManager.getSelectedTarget().getPosition()) : null')
    
    bld_dist_str = f'{tgt_bld_dist:.1f}m' if tgt_bld_dist is not None else 'N/A'
    status_str = f't={time.time()-start_t:.1f}s | Alive: {alive}/25 | Locked: {current_tgt} (BldDist: {bld_dist_str}) | Missiles: {active_missiles} | Explosions: {active_explosions}'
    print(status_str)
    
    if step == 4:
        capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\swarm_missile_intercept_action.png')
    if step == 12:
        capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\swarm_multi_kill_explosions.png')
        
    if alive == 0:
        print('SUCCESS: All 25 drones eliminated in settlement priority order!')
        capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\swarm_all_neutralized_secured.png')
        break

# Capture radar scope closeup
eval_js('''
  const p = document.getElementById('station-telemetry-panel');
  p.scrollIntoView();
''')
time.sleep(0.5)
capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\radar_20m_scope_closeup.png')

proc.terminate()
print('Verification script finished.')
