import subprocess, time, json, urllib.request, socket, os, base64

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

subprocess.run(['taskkill', '/F', '/IM', 'msedge.exe'], capture_output=True)
time.sleep(1.0)

proc = subprocess.Popen([edge_path, '--headless', '--remote-debugging-port=9222', '--window-size=1600,900', 'http://localhost:8085'])
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
    else:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
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

send_frame(s, {'id': 1, 'method': 'Runtime.enable'})
send_frame(s, {'id': 2, 'method': 'Log.enable'})
send_frame(s, {'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': 'window.app ? "APP_READY" : "NO_APP"', 'returnByValue': True}})

time.sleep(1.0)
s.settimeout(2.0)
while True:
    try:
        f = recv_frame(s)
        if not f: break
        print(f)
    except socket.timeout:
        break

s.close()
proc.kill()
