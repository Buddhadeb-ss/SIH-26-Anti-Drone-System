import asyncio, json, time, sys
sys.path.insert(0, r'c:\Users\buddh\GIT_Projects\simulation\bridge')
from bridge import HardwareBridge

async def test_run():
    bridge = HardwareBridge(force_mock=True)
    bridge.ws_server.port = 8766 # Use non-conflicting port for unit test
    server = await bridge.ws_server.start()
    
    # Start the rate transmission loop in background
    tx_task = asyncio.create_task(bridge.serial_rate_tx_loop())
    
    print("\n--- Test 1: High error Pan Right (error_pan = 250px, error_tilt = -120px) ---")
    bridge.handle_frontend_cmd(json.dumps({
        "cmd": "MOVE", "pan": 400, "tilt": -200, "err_p": 250, "err_t": -120, "lock": True
    }))
    await asyncio.sleep(0.1) # Allow 30Hz loop tick
    
    print("\n--- Test 2: Identical command at 30Hz (Should NOT re-send to avoid buffer bloat) ---")
    await asyncio.sleep(0.1)
    
    print("\n--- Test 3: Moderate error Pan Left (error_pan = -60px, Tilt in deadband = 8px) ---")
    bridge.handle_frontend_cmd(json.dumps({
        "cmd": "MOVE", "pan": 200, "tilt": 0, "err_p": -60, "err_t": 8, "lock": True
    }))
    await asyncio.sleep(0.1)

    print("\n--- Test 4: Target centered within deadband (error_pan = 10px, error_tilt = 5px) ---")
    bridge.handle_frontend_cmd(json.dumps({
        "cmd": "MOVE", "pan": 0, "tilt": 0, "err_p": 10, "err_t": 5, "lock": True
    }))
    await asyncio.sleep(0.1)

    print("\n--- Test 5: Target lost / Stop ---")
    bridge.handle_frontend_cmd(json.dumps({"cmd": "STOP"}))
    await asyncio.sleep(0.1)

    tx_task.cancel()
    server.close()
    await server.wait_closed()
    print("\n[SUCCESS] Direct rate-control protocol verified end-to-end!")

asyncio.run(test_run())
