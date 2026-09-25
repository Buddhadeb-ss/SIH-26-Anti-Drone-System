/**
 * pid.js
 * High-Performance Discrete PID Controller for Gimbal Servo Tracking.
 * 
 * Features:
 * - Proportional-Integral-Derivative with anti-windup integrator clamping
 * - Low-pass derivative filter to attenuate high-frequency sensor noise
 * - Output saturation limits
 * - Detailed telemetry (error, pTerm, iTerm, dTerm, output)
 */

export class PIDController {
  /**
   * @param {Object} options
   * @param {number} [options.kp=1.2] Proportional gain
   * @param {number} [options.ki=0.08] Integral gain
   * @param {number} [options.kd=0.18] Derivative gain
   * @param {number} [options.minOutput=-180] Minimum output limit
   * @param {number} [options.maxOutput=180] Maximum output limit
   * @param {number} [options.integratorLimit=45] Max absolute integral accumulation
   * @param {number} [options.derivativeFilterAlpha=0.7] Filter factor (0 = no filter, 1 = max filter)
   */
  constructor(options = {}) {
    this.kp = options.kp !== undefined ? options.kp : 1.2;
    this.ki = options.ki !== undefined ? options.ki : 0.08;
    this.kd = options.kd !== undefined ? options.kd : 0.18;

    this.minOutput = options.minOutput !== undefined ? options.minOutput : -180;
    this.maxOutput = options.maxOutput !== undefined ? options.maxOutput : 180;
    this.integratorLimit = options.integratorLimit !== undefined ? options.integratorLimit : 45;
    this.filterAlpha = options.derivativeFilterAlpha !== undefined ? options.derivativeFilterAlpha : 0.65;

    this.integral = 0;
    this.prevError = 0;
    this.filteredDerivative = 0;
    this.isFirstRun = true;

    // Telemetry cache
    this.lastState = {
      setpoint: 0,
      measured: 0,
      error: 0,
      pTerm: 0,
      iTerm: 0,
      dTerm: 0,
      output: 0
    };
  }

  /**
   * Update gains dynamically (e.g. from UI sliders)
   */
  setGains(kp, ki, kd) {
    if (kp !== undefined && !isNaN(kp)) this.kp = Math.max(0, kp);
    if (ki !== undefined && !isNaN(ki)) this.ki = Math.max(0, ki);
    if (kd !== undefined && !isNaN(kd)) this.kd = Math.max(0, kd);
  }

  /**
   * Compute PID control effort
   * @param {number} setpoint Desired target value
   * @param {number} measured Current measured value
   * @param {number} dt Time delta in seconds
   * @returns {number} Corrected control effort
   */
  compute(setpoint, measured, dt) {
    if (dt <= 0.0001) return this.lastState.output;

    const error = setpoint - measured;

    // 1. Proportional term
    const pTerm = this.kp * error;

    // 2. Integral term with anti-windup clamping
    this.integral += error * dt;
    this.integral = Math.max(-this.integratorLimit, Math.min(this.integratorLimit, this.integral));
    const iTerm = this.ki * this.integral;

    // 3. Derivative term with low-pass filtering
    let dTerm = 0;
    if (!this.isFirstRun) {
      const rawDerivative = (error - this.prevError) / dt;
      // Exponential moving average filter
      this.filteredDerivative = (this.filterAlpha * this.filteredDerivative) + ((1 - this.filterAlpha) * rawDerivative);
      dTerm = this.kd * this.filteredDerivative;
    } else {
      this.isFirstRun = false;
      this.filteredDerivative = 0;
    }
    this.prevError = error;

    // 4. Raw output
    let rawOutput = pTerm + iTerm + dTerm;

    // 5. Output saturation limits
    const output = Math.max(this.minOutput, Math.min(this.maxOutput, rawOutput));

    this.lastState = {
      setpoint,
      measured,
      error,
      pTerm,
      iTerm,
      dTerm,
      output
    };

    return output;
  }

  /**
   * Get latest telemetry computation
   */
  getState() {
    return { ...this.lastState };
  }

  /**
   * Reset internal integrator and derivative states
   */
  reset() {
    this.integral = 0;
    this.prevError = 0;
    this.filteredDerivative = 0;
    this.isFirstRun = true;
    this.lastState = {
      setpoint: 0,
      measured: 0,
      error: 0,
      pTerm: 0,
      iTerm: 0,
      dTerm: 0,
      output: 0
    };
  }
}
