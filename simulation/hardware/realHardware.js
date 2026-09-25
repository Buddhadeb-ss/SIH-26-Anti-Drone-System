/**
 * realHardware.js
 * Client Communication Module for Physical STM32 via Python Bridge.
 * 
 * Responsibilities:
 * - Connects to Python Hardware Bridge WebSocket (ws://localhost:8765)
 * - Dispatches JSON command packets (MOVE, STOP, HOME, ENABLE)
 * - Streams live telemetry from physical STM32 back to simulation
 * - Resilient auto-reconnection and zero-crash fault tolerance
 */

import { encodePacket, decodePacket, buildMoveCmd, buildStopCmd, buildHomeCmd, buildEnableCmd, isValidTelemetry } from './protocol.js';

export class RealHardware {
  constructor(wsUrl = 'ws://localhost:8765') {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.shouldAutoReconnect = true;
    this.reconnectTimer = null;

    this.telemetryListeners = [];
    this.statusListeners = [];

    // Cached telemetry (safe defaults)
    this.lastTelemetry = {
      type: 'telemetry',
      pan: 0,
      tilt: 0,
      pan_target: 0,
      tilt_target: 0,
      pan_temp: 20.0,
      tilt_temp: 20.0,
      heater: 0,
      connected: false,
      mode: 'REAL'
    };
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    this.notifyStatus(false, 'Connecting to hardware bridge...');

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.notifyStatus(true, 'Hardware Bridge Connected (ws://localhost:8765)');
        console.log('[RealHardware] Connected to Python bridge.');
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyStatus(false, 'Hardware Disconnected');
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        // Suppress unhandled exceptions to ensure simulation runs continuously
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyStatus(false, 'Bridge Offline (ws://localhost:8765)');
      };
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
      this.notifyStatus(false, 'Connection Failed');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.shouldAutoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.notifyStatus(false, 'Disconnected');
  }

  scheduleReconnect() {
    if (!this.shouldAutoReconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 4000); // retry every 4 seconds
  }

  handleMessage(raw) {
    const pkt = decodePacket(raw);
    if (!pkt) return;

    if (isValidTelemetry(pkt)) {
      this.hasReceivedTelemetry = true;
      this.lastTelemetry = {
        ...pkt,
        connected: this.isConnected,
        mode: 'REAL'
      };
      this.notifyTelemetry(this.lastTelemetry);
    } else if (pkt.type === 'status') {
      this.notifyStatus(this.isConnected && pkt.connected, pkt.message || 'Status update');
    }
  }

  send(cmdObj) {
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      const packet = encodePacket(cmdObj);
      this.socket.send(packet);
      // Log discrete action commands in browser console
      if (cmdObj.cmd !== 'MOVE') {
        console.log(`%c[Hardware TX] ${cmdObj.cmd}`, 'color: #00f0ff; font-weight: bold;', cmdObj);
      }
      return true;
    } catch (err) {
      console.warn('[RealHardware] Failed to send command:', err);
      return false;
    }
  }

  moveTo(panSteps, tiltSteps, meta = {}) {
    const now = performance.now();
    // Send if target changed or at least 33ms passed (~30Hz update rate)
    if (this._lastPanTarget === panSteps && this._lastTiltTarget === tiltSteps && (now - (this._lastMoveTime || 0) < 33)) {
      return true;
    }
    this._lastPanTarget = panSteps;
    this._lastTiltTarget = tiltSteps;
    this._lastMoveTime = now;
    return this.send(buildMoveCmd(panSteps, tiltSteps, meta));
  }

  stop() {
    return this.send(buildStopCmd());
  }

  home() {
    return this.send(buildHomeCmd());
  }

  enable() {
    return this.send(buildEnableCmd(true));
  }

  disable() {
    return this.send(buildEnableCmd(false));
  }

  getTelemetry() {
    return this.lastTelemetry;
  }

  onTelemetry(fn) {
    this.telemetryListeners.push(fn);
  }

  onStatusChange(fn) {
    this.statusListeners.push(fn);
  }

  notifyTelemetry(telemetry) {
    for (let i = 0; i < this.telemetryListeners.length; i++) {
      this.telemetryListeners[i](telemetry);
    }
  }

  notifyStatus(connected, message) {
    for (let i = 0; i < this.statusListeners.length; i++) {
      this.statusListeners[i](connected, message);
    }
  }
}
