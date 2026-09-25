/**
 * hardwareInterface.js
 * Unified Hardware Abstraction Layer (HAL).
 * 
 * Provides a single, clean API for the Three.js simulation:
 * - Switches between VIRTUAL (VirtualHardware) and REAL (RealHardware) without altering simulation logic.
 * - Enforces mechanical safety limits before passing any commands.
 * - Normalizes telemetry streams and connection states.
 */

import { VirtualHardware } from './virtualHardware.js';
import { RealHardware } from './realHardware.js';
import { clampPanSteps, clampTiltSteps, panStepsToDeg, tiltStepsToDeg } from '../control/stepConversion.js';

export const HARDWARE_MODES = {
  SIMULATION: 'SIMULATION',
  REAL: 'REAL'
};

export class HardwareInterface {
  constructor() {
    this.currentMode = HARDWARE_MODES.SIMULATION; // Default = SIMULATION

    // Initialize backends
    this.virtualHw = new VirtualHardware();
    this.realHw = new RealHardware();

    this.telemetryCallbacks = [];
    this.statusCallbacks = [];

    // Forward telemetry from backends
    this.virtualHw.onTelemetry((t) => {
      if (this.currentMode === HARDWARE_MODES.SIMULATION) {
        this.emitTelemetry(t);
      }
    });

    this.realHw.onTelemetry((t) => {
      if (this.currentMode === HARDWARE_MODES.REAL) {
        this.emitTelemetry(t);
      }
    });

    this.realHw.onStatusChange((connected, msg) => {
      if (this.currentMode === HARDWARE_MODES.REAL) {
        this.emitStatus(connected, msg);
      }
    });
  }

  setHardwareMode(mode) {
    if (mode === HARDWARE_MODES.SIMULATION) {
      this.currentMode = HARDWARE_MODES.SIMULATION;
      this.emitStatus(true, 'Virtual Hardware Online');
    } else if (mode === HARDWARE_MODES.REAL) {
      this.currentMode = HARDWARE_MODES.REAL;
      this.realHw.connect();
      this.emitStatus(this.realHw.isConnected, this.realHw.isConnected ? 'Hardware Connected' : 'Connecting to Hardware Bridge...');
    }
  }

  getHardwareMode() {
    return this.currentMode;
  }

  isRealHardware() {
    return this.currentMode === HARDWARE_MODES.REAL;
  }

  getActiveBackend() {
    return this.currentMode === HARDWARE_MODES.REAL ? this.realHw : this.virtualHw;
  }

  setAmbientTemperature(temp) {
    if (this.virtualHw && typeof this.virtualHw.setAmbientTemperature === 'function') {
      this.virtualHw.setAmbientTemperature(temp);
    }
  }

  /**
   * Command gimbal movement in absolute stepper steps with safe limit clamping.
   * Dispatches to simulated twin and physical stepper motors concurrently.
   * @param {number} panSteps Target pan microsteps
   * @param {number} tiltSteps Target tilt microsteps
   */
  moveTo(panSteps, tiltSteps, meta = {}) {
    const safePan = clampPanSteps(panSteps);
    const safeTilt = clampTiltSteps(tiltSteps);

    // 1. Always update simulated prototype in 3D environment
    this.virtualHw.moveTo(safePan, safeTilt);

    // 2. Concurrently dispatch to real physical hardware over USB Serial
    if (this.currentMode === HARDWARE_MODES.REAL) {
      this.realHw.moveTo(safePan, safeTilt, meta);
    }
  }

  stop() {
    this.virtualHw.stop();
    if (this.currentMode === HARDWARE_MODES.REAL) {
      this.realHw.stop();
    }
  }

  home() {
    this.virtualHw.home();
    if (this.currentMode === HARDWARE_MODES.REAL) {
      this.realHw.home();
    }
  }

  enable() {
    this.virtualHw.enable();
    if (this.currentMode === HARDWARE_MODES.REAL) {
      this.realHw.enable();
    }
  }

  disable() {
    this.virtualHw.disable();
    if (this.currentMode === HARDWARE_MODES.REAL) {
      this.realHw.disable();
    }
  }

  /**
   * Get latest normalized telemetry snapshot
   */
  getTelemetry() {
    // If connected to real hardware and telemetry is arriving, use physical telemetry;
    // otherwise, use high-fidelity simulated twin telemetry
    let raw;
    if (this.currentMode === HARDWARE_MODES.REAL && this.realHw.isConnected && this.realHw.hasReceivedTelemetry) {
      raw = this.realHw.getTelemetry();
    } else {
      raw = this.virtualHw.getTelemetry();
    }

    return {
      ...raw,
      panDeg: panStepsToDeg(raw.pan),
      tiltDeg: tiltStepsToDeg(raw.tilt),
      panTargetDeg: panStepsToDeg(raw.pan_target),
      tiltTargetDeg: tiltStepsToDeg(raw.tilt_target),
      mode: this.currentMode
    };
  }

  getConnectionStatus() {
    if (this.currentMode === HARDWARE_MODES.SIMULATION) {
      return {
        connected: true,
        mode: 'SIMULATION',
        text: 'ONLINE (VIRTUAL STM32)'
      };
    } else {
      return {
        connected: this.realHw.isConnected,
        mode: 'REAL',
        text: this.realHw.isConnected ? 'ONLINE (REAL STM32 SYNC)' : 'DISCONNECTED (ws://localhost:8765)'
      };
    }
  }

  /**
   * Frame update for simulation loop
   * @param {number} dt Delta time
   */
  update(dt) {
    // Keep virtual twin kinematics alive for smooth continuous simulation
    this.virtualHw.update(dt);
  }

  onTelemetry(fn) {
    this.telemetryCallbacks.push(fn);
  }

  onStatusChange(fn) {
    this.statusCallbacks.push(fn);
  }

  emitTelemetry(t) {
    for (let i = 0; i < this.telemetryCallbacks.length; i++) {
      this.telemetryCallbacks[i](t);
    }
  }

  emitStatus(connected, msg) {
    for (let i = 0; i < this.statusCallbacks.length; i++) {
      this.statusCallbacks[i](connected, msg);
    }
  }
}
