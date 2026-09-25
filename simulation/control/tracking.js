/**
 * tracking.js
 * Operating Mode Tracking Orchestrator.
 * 
 * Manages the three operating modes:
 * - MODE 1: ENVIRONMENTAL STRESS -> HARDWARE
 * - MODE 2: SIMULATION -> ERROR -> PID -> HARDWARE
 * - MODE 3: LIVE DRONE TRACKING DEMONSTRATION
 * 
 * Computes setpoints, incorporates environmental disturbances,
 * runs the dual-axis PID controllers, and converts angles to absolute steps.
 */

import { degToPanSteps, degToTiltSteps, panStepsToDeg, tiltStepsToDeg, clampPanDeg, clampTiltDeg } from './stepConversion.js';
import { PIDController } from './pid.js';
import { EnvironmentModel } from './environmentModel.js';

export const OPERATING_MODES = {
  MODE_1_STRESS: 'stress',
  MODE_2_PID: 'pid',
  MODE_3_TRACKING: 'tracking'
};

export class OperatingModeTracker {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.currentMode = OPERATING_MODES.MODE_3_TRACKING; // Default to Live Drone Tracking

    // Environmental disturbance model
    this.envModel = new EnvironmentModel();

    // Dual-axis PID controllers
    this.panPID = new PIDController({
      kp: 1.35,
      ki: 0.12,
      kd: 0.22,
      minOutput: -180,
      maxOutput: 180,
      integratorLimit: 30
    });

    this.tiltPID = new PIDController({
      kp: 1.45,
      ki: 0.15,
      kd: 0.25,
      minOutput: -75,
      maxOutput: 85,
      integratorLimit: 25
    });

    // Test input generation for Mode 2 (PID tuning demonstration)
    this.testSignalType = 'live'; // 'live' (drone), 'step', 'sine'
    this.simTime = 0;

    // Last computed state
    this.lastState = {
      mode: this.currentMode,
      targetPanDeg: 0,
      targetTiltDeg: 0,
      disturbedPanDeg: 0,
      disturbedTiltDeg: 0,
      correctedPanDeg: 0,
      correctedTiltDeg: 0,
      commandedPanSteps: 0,
      commandedTiltSteps: 0,
      actualPanSteps: 0,
      actualTiltSteps: 0,
      actualPanDeg: 0,
      actualTiltDeg: 0,
      panErrorDeg: 0,
      tiltErrorDeg: 0,
      pidPanState: this.panPID.getState(),
      pidTiltState: this.tiltPID.getState(),
      envData: {}
    };
  }

  setMode(mode) {
    if (mode === OPERATING_MODES.MODE_1_STRESS ||
        mode === OPERATING_MODES.MODE_2_PID ||
        mode === OPERATING_MODES.MODE_3_TRACKING) {
      this.currentMode = mode;
      this.panPID.reset();
      this.tiltPID.reset();
    }
  }

  getMode() {
    return this.currentMode;
  }

  setPIDGains({ panKp, panKi, panKd, tiltKp, tiltKi, tiltKd }) {
    if (panKp !== undefined || panKi !== undefined || panKd !== undefined) {
      this.panPID.setGains(panKp, panKi, panKd);
    }
    if (tiltKp !== undefined || tiltKi !== undefined || tiltKd !== undefined) {
      this.tiltPID.setGains(tiltKp, tiltKi, tiltKd);
    }
  }

  setTestSignal(type) {
    this.testSignalType = type;
  }

  /**
   * Main tracking calculation called each simulation tick
   * @param {number} dt Delta time in seconds
   * @param {Object} rawTargetAngles { panDeg, tiltDeg } from radar/camera targeting
   * @param {Object} actualTelemetry { pan, tilt } from hardware (steps)
   * @returns {Object} Target step commands to dispatch to hardware
   */
  update(dt, rawTargetAngles, actualTelemetry) {
    this.simTime += dt;

    // Actual measured position from hardware telemetry (steps converted to degrees)
    const actualPanSteps = actualTelemetry?.pan || 0;
    const actualTiltSteps = actualTelemetry?.tilt || 0;
    const actualPanDeg = panStepsToDeg(actualPanSteps);
    const actualTiltDeg = tiltStepsToDeg(actualTiltSteps);

    // Determine baseline target angle clamped to safe physical limits (max 180° from reference to prevent wire tangling)
    let targetPanDeg = clampPanDeg(rawTargetAngles?.panDeg || 0);
    let targetTiltDeg = clampTiltDeg(rawTargetAngles?.tiltDeg || 0);

    // Kinematic target angular velocity (deg/s) with boundary jump suppression
    let diffPan = (this.prevTargetPanDeg !== undefined) ? (targetPanDeg - this.prevTargetPanDeg) : 0;
    if (Math.abs(diffPan) > 270.0) {
      diffPan = 0; // Prevent impulse spike when target crosses near +/-180° boundary
    }
    const maxRate = 180.0; // deg/s max rate
    const targetPanRate = (dt > 0.0001) ? Math.max(-maxRate, Math.min(maxRate, diffPan / dt)) : 0;
    const diffTilt = (this.prevTargetTiltDeg !== undefined) ? (targetTiltDeg - this.prevTargetTiltDeg) : 0;
    const targetTiltRate = (dt > 0.0001) ? Math.max(-maxRate, Math.min(maxRate, diffTilt / dt)) : 0;
    this.prevTargetPanDeg = targetPanDeg;
    this.prevTargetTiltDeg = targetTiltDeg;

    if (this.currentMode === OPERATING_MODES.MODE_2_PID && this.testSignalType !== 'live') {
      if (this.testSignalType === 'step') {
        // Square wave step toggling between -25° and +25° every 4 seconds
        targetPanDeg = (Math.floor(this.simTime / 4.0) % 2 === 0) ? 25.0 : -25.0;
        targetTiltDeg = (Math.floor(this.simTime / 4.0) % 2 === 0) ? 15.0 : -10.0;
      } else if (this.testSignalType === 'sine') {
        // Sinusoidal sweep
        targetPanDeg = Math.sin(this.simTime * 0.75) * 35.0;
        targetTiltDeg = Math.sin(this.simTime * 1.2) * 20.0 + 10.0;
      }
    }

    // 1. Calculate environmental disturbance
    const envData = this.envModel.update(dt, actualPanDeg, actualTiltDeg);

    let commandedPanDeg = targetPanDeg;
    let commandedTiltDeg = targetTiltDeg;
    let disturbedPanDeg = targetPanDeg;
    let disturbedTiltDeg = targetTiltDeg;

    // 2. Mode-specific processing
    switch (this.currentMode) {
      case OPERATING_MODES.MODE_1_STRESS: {
        // In Mode 1: Environmental disturbance directly injects deflection onto the command
        disturbedPanDeg = targetPanDeg + envData.disturbancePanDeg;
        disturbedTiltDeg = targetTiltDeg + envData.disturbanceTiltDeg;

        // Command the disturbed setpoint to show environmental displacement
        commandedPanDeg = disturbedPanDeg;
        commandedTiltDeg = disturbedTiltDeg;
        break;
      }

      case OPERATING_MODES.MODE_2_PID: {
        // In Mode 2: The system experiences environmental disturbance,
        // measuring the position error and running closed-loop PID compensation
        disturbedPanDeg = targetPanDeg + envData.disturbancePanDeg;
        disturbedTiltDeg = targetTiltDeg + envData.disturbanceTiltDeg;

        // Effective position with disturbance acting on actual feedback
        const effectiveMeasuredPan = actualPanDeg - envData.disturbancePanDeg;
        const effectiveMeasuredTilt = actualTiltDeg - envData.disturbanceTiltDeg;

        // Compute PID correction
        const panCorrection = this.panPID.compute(targetPanDeg, effectiveMeasuredPan, dt);
        const tiltCorrection = this.tiltPID.compute(targetTiltDeg, effectiveMeasuredTilt, dt);

        commandedPanDeg = targetPanDeg + panCorrection * 0.45;
        commandedTiltDeg = targetTiltDeg + tiltCorrection * 0.45;
        break;
      }

      case OPERATING_MODES.MODE_3_TRACKING:
      default: {
        // In Mode 3: Direct closed-loop tracking with dynamic wind & atmospheric counter-torque
        disturbedPanDeg = targetPanDeg + envData.disturbancePanDeg;
        disturbedTiltDeg = targetTiltDeg + envData.disturbanceTiltDeg;

        // The machine actively holds bore-sight lock against the wind forces with 85% rejection stiffness.
        const holdingStiffness = 0.85;
        const residualWindPan = envData.disturbancePanDeg * (1.0 - holdingStiffness);
        const residualWindTilt = envData.disturbanceTiltDeg * (1.0 - holdingStiffness);

        // High-bandwidth dynamic lead feed-forward:
        // When high wind causes erratic drone gust darts, the stepper controller predicts and tracks
        // the target with zero lag (45ms lead compensation) while maintaining active counter-torque:
        const isWindy = envData.isHighWind || envData.windSpeed > 10.0;
        const leadTime = isWindy ? 0.045 : 0.010;
        commandedPanDeg = targetPanDeg + (targetPanRate * leadTime) + residualWindPan;
        commandedTiltDeg = targetTiltDeg + (targetTiltRate * leadTime) + residualWindTilt;
        break;
      }
    }

    // 3. Clamp angles to safe mechanical boundaries
    commandedPanDeg = clampPanDeg(commandedPanDeg);
    commandedTiltDeg = clampTiltDeg(commandedTiltDeg);

    // 4. Convert to absolute stepper steps
    const commandedPanSteps = degToPanSteps(commandedPanDeg);
    const commandedTiltSteps = degToTiltSteps(commandedTiltDeg);

    // 5. Calculate remaining error
    const panErrorDeg = targetPanDeg - actualPanDeg;
    const tiltErrorDeg = targetTiltDeg - actualTiltDeg;

    this.lastState = {
      mode: this.currentMode,
      targetPanDeg,
      targetTiltDeg,
      disturbedPanDeg,
      disturbedTiltDeg,
      correctedPanDeg: commandedPanDeg,
      correctedTiltDeg: commandedTiltDeg,
      commandedPanSteps,
      commandedTiltSteps,
      actualPanSteps,
      actualTiltSteps,
      actualPanDeg,
      actualTiltDeg,
      panErrorDeg,
      tiltErrorDeg,
      pidPanState: this.panPID.getState(),
      pidTiltState: this.tiltPID.getState(),
      envData
    };

    return {
      panSteps: commandedPanSteps,
      tiltSteps: commandedTiltSteps,
      panDeg: commandedPanDeg,
      tiltDeg: commandedTiltDeg
    };
  }

  getState() {
    return this.lastState;
  }
}
