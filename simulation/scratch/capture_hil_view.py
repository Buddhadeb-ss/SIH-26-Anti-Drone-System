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
s.settimeout(3.0)
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
    try:
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
        return json.loads(data.decode('utf-8', errors='ignore'))
    except Exception:
        return None

msg_id = 100
def capture_screenshot(filename):
    global msg_id
    mid = msg_id
    msg_id += 1
    send_frame(s, {'id': mid, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}})
    start_t = time.time()
    while time.time() - start_t < 4.0:
        res = recv_frame(s)
        if res and res.get('id') == mid:
            img_data = base64.b64decode(res['result']['data'])
            with open(filename, 'wb') as f:
                f.write(img_data)
            print(f"Saved screenshot: {filename}")
            break

time.sleep(2.0)
capture_screenshot(r'C:\Users\buddh\.gemini\antigravity-ide\brain\6167fd7f-75a3-4097-9349-35752b74b891\hil_calibrated_tracking_view.png')

proc.terminate()
