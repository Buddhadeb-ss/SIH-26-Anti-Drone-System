import time, serial.tools.list_ports as lp

print("[WATCHER] Monitoring for new USB COM ports... (Press Ctrl+C to cancel)", flush=True)
known_ports = {p.device for p in lp.comports()}
print(f"[WATCHER] Baseline ports: {sorted(list(known_ports))}", flush=True)

while True:
    current = {p.device: p.description for p in lp.comports()}
    new_ports = set(current.keys()) - known_ports
    if new_ports:
        for p in new_ports:
            print(f"\n[FOUND NEW DEVICE] ==> Port: {p} | Description: {current[p]}", flush=True)
        break
    time.sleep(0.5)
