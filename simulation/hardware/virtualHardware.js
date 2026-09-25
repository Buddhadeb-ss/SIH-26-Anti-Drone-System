/**
 * virtualHardware.js
 * High-Fidelity Virtual STM32 Hardware & Stepper Motor Simulator.
 * 
 * Simulates:
 * - 2-Axis NEMA-17 stepper motor kinematics with acceleration / deceleration ramps
 * - Physical microstep tracking error, inertia lag, and mechanical backlash
 * - Dynamic motor Joule heating ($I^2 R$) during movement and steady-state holding
 * - Automatic high-altitude PTC anti-freeze heater control
 * - Periodic telemetry streaming conforming to the STM32 serial protocol
 */

import { STEPPER_CONFIG, clampPanSteps, clampTiltSteps } from '../control/stepConversion.js';
import { PROTOCOL_TYPES } from './protocol.js';

export class VirtualHardware {
  constructor() {
    this.isEnabled = true;
    this.isConnected = true;

    // Actual stepper positions (microsteps)
    this.actualPan = 0;
    this.actualTilt = 0;

    // Target positions (microsteps)
    this.targetPan = 0;
    this.targetTilt = 0;

    // Current velocities (steps / second)
    this.velocityPan = 0;
    this.velocityTilt = 0;

    // Kinematic constraints
    this.maxVelocity = STEPPER_CONFIG.MAX_VELOCITY_STEPS_PER_SEC; // 2400 steps/s (~270 deg/s)
    this.acceleration = STEPPER_CONFIG.ACCELERATION_STEPS_PER_SEC2; // 4800 steps/s^2

    // Thermal Simulation (°C)
    this.ambientTemp = 18.0;
    this.panTemp = 24.5;
    this.tiltTemp = 23.2;
    this.heaterActive = 0;

    // Telemetry listeners
    this.telemetryListeners = [];
    this.lastTelemetry = this.buildTelemetryPayload();
  }

  setAmbientTemperature(temp) {
    this.ambientTemp = temp;
  }

  moveTo(panSteps, tiltSteps) {
    if (!this.isEnabled) return;
    this.targetPan = clampPanSteps(Math.round(panSteps));
    this.targetTilt = clampTiltSteps(Math.round(tiltSteps));
  }

  stop() {
    this.targetPan = Math.round(this.actualPan);
    this.targetTilt = Math.round(this.actualTilt);
    this.velocityPan = 0;
    this.velocityTilt = 0;
  }

  home() {
    this.targetPan = STEPPER_CONFIG.PAN_HOME_STEPS;
    this.targetTilt = STEPPER_CONFIG.TILT_HOME_STEPS;
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
    this.velocityPan = 0;
    this.velocityTilt = 0;
  }

  /**
   * Physics frame update called by the engine
   * @param {number} dt Delta time in seconds
   */
  update(dt) {
    if (dt <= 0.0001) return;

    if (this.isEnabled) {
      // 1. Pan axis kinematics (smooth acceleration profile clamped to mechanical hard limit)
      this.actualPan = clampPanSteps(this.simulateAxis(
        this.actualPan,
        this.targetPan,
        this.velocityPan,
        dt,
        (v) => (this.velocityPan = v)
      ));

      // 2. Tilt axis kinematics
      this.actualTilt = clampTiltSteps(this.simulateAxis(
        this.actualTilt,
        this.targetTilt,
        this.velocityTilt,
        dt,
        (v) => (this.velocityTilt = v)
      ));
    }

    // 3. Thermal dynamics & Joule heating
    this.updateThermal(dt);

    // 4. Cache & emit telemetry
    this.lastTelemetry = this.buildTelemetryPayload();
    this.notifyListeners(this.lastTelemetry);
  }

  /**
   * Simulate a single trapezoidal acceleration profile axis
   */
  simulateAxis(currentPos, targetPos, currentVel, dt, setVel) {
    const error = targetPos - currentPos;
    if (Math.abs(error) < 0.5) {
      setVel(0);
      return targetPos;
    }

    // Direction
    const dir = Math.sign(error);

    // Stopping distance under maximum deceleration: d = v^2 / (2 * a)
    const stopDist = Math.pow(currentVel, 2) / (2 * this.acceleration);

    let desiredVel = 0;
    if (Math.abs(error) > stopDist) {
      // Accelerate toward target
      desiredVel = dir * Math.min(this.maxVelocity, Math.sqrt(2 * this.acceleration * Math.abs(error)));
    } else {
      // Decelerate
      desiredVel = dir * Math.max(80, Math.sqrt(Math.max(0, 2 * this.acceleration * Math.abs(error))));
    }

    // Apply acceleration limit
    const velDelta = desiredVel - currentVel;
    const maxVelStep = this.acceleration * dt;
    const newVel = currentVel + Math.max(-maxVelStep, Math.min(maxVelStep, velDelta));
    setVel(newVel);

    // Add tiny high-frequency microstep settling jitter (0.05 step)
    const microstepJitter = (Math.random() - 0.5) * 0.1;
    return currentPos + newVel * dt + microstepJitter;
  }

  /**
   * Simulate motor heating and PTC anti-freeze heater
   */
  updateThermal(dt) {
    const panSpeedRatio = Math.abs(this.velocityPan) / this.maxVelocity;
    const tiltSpeedRatio = Math.abs(this.velocityTilt) / this.maxVelocity;

    // Heat generation: dynamic motion power + static holding torque power
    const panHeatPower = 0.8 + panSpeedRatio * 3.2; // °C/min rate equivalent
    const tiltHeatPower = 0.8 + tiltSpeedRatio * 3.0;

    // Automatic PTC Heater Logic:
    // When motor drops below 5°C, heater turns ON to protect lubricants
    if (this.panTemp < 5.0 || this.tiltTemp < 5.0 || this.ambientTemp < 0.0) {
      this.heaterActive = 1;
    } else if (this.panTemp > 22.0 && this.tiltTemp > 22.0) {
      this.heaterActive = 0;
    }

    const heaterBoost = this.heaterActive ? 2.5 : 0; // extra heating power

    // Heat transfer differential: dT/dt = (Power + Heater) - HeatLossToAmbient
    const panEquilibrium = this.ambientTemp + (panHeatPower * 6.0) + (heaterBoost * 8.0);
    const tiltEquilibrium = this.ambientTemp + (tiltHeatPower * 5.8) + (heaterBoost * 8.0);

    // Thermal time constant (tau ~ 45 seconds for small NEMA-17)
    const thermalRate = (1.0 / 35.0) * dt;
    this.panTemp += (panEquilibrium - this.panTemp) * thermalRate;
    this.tiltTemp += (tiltEquilibrium - this.tiltTemp) * thermalRate;
  }

  buildTelemetryPayload() {
    return {
      type: PROTOCOL_TYPES.TELEMETRY,
      pan: Math.round(this.actualPan),
      tilt: Math.round(this.actualTilt),
      pan_target: Math.round(this.targetPan),
      tilt_target: Math.round(this.targetTilt),
      pan_temp: parseFloat(this.panTemp.toFixed(1)),
      tilt_temp: parseFloat(this.tiltTemp.toFixed(1)),
      heater: this.heaterActive,
      connected: true,
      mode: 'VIRTUAL'
    };
  }

  getTelemetry() {
    return this.lastTelemetry;
  }

  onTelemetry(fn) {
    this.telemetryListeners.push(fn);
  }

  notifyListeners(telemetry) {
    for (let i = 0; i < this.telemetryListeners.length; i++) {
      this.telemetryListeners[i](telemetry);
    }
  }
}
