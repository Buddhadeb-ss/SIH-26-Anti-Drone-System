/**
 * stepConversion.js
 * Single-source-of-truth stepper configuration for SIH26050 2-Axis Gimbal.
 * 
 * Configured for NEMA-17 steppers (1.8° step angle = 200 full steps/rev)
 * with 1/16 microstepping:
 * 200 * 16 = 3,200 microsteps per 360° revolution
 * 3,200 / 360 = 8.88888888888889 steps per degree.
 * 
 * Keep these values in this isolated configuration file so they can easily
 * be updated later when physical microstepping or mechanical pulley gear ratios change.
 */

export const STEPPER_CONFIG = {
  // Calibration: Microsteps per degree
  PAN_STEPS_PER_DEGREE: 8.88888888888889,   // 3200 steps / 360 deg
  TILT_STEPS_PER_DEGREE: 8.88888888888889,  // 3200 steps / 360 deg

  // Mechanical Safety Limits (Degrees)
  PAN_MIN_DEG: -180.0,
  PAN_MAX_DEG: 180.0,
  TILT_MIN_DEG: -75.0,   // -75° pitch down / elevation limits
  TILT_MAX_DEG: 85.0,    // +85° pitch up

  // Default Homed Position (Steps)
  PAN_HOME_STEPS: 0,
  TILT_HOME_STEPS: 0,

  // Speed and Acceleration limits for kinematic simulation (steps/s, steps/s^2)
  MAX_VELOCITY_STEPS_PER_SEC: 2400, // ~270 deg/s max slew rate
  ACCELERATION_STEPS_PER_SEC2: 4800 // smooth ramp
};

// Compute Step Limits from Degree Limits
STEPPER_CONFIG.PAN_MIN_STEPS = Math.round(STEPPER_CONFIG.PAN_MIN_DEG * STEPPER_CONFIG.PAN_STEPS_PER_DEGREE);
STEPPER_CONFIG.PAN_MAX_STEPS = Math.round(STEPPER_CONFIG.PAN_MAX_DEG * STEPPER_CONFIG.PAN_STEPS_PER_DEGREE);
STEPPER_CONFIG.TILT_MIN_STEPS = Math.round(STEPPER_CONFIG.TILT_MIN_DEG * STEPPER_CONFIG.TILT_STEPS_PER_DEGREE);
STEPPER_CONFIG.TILT_MAX_STEPS = Math.round(STEPPER_CONFIG.TILT_MAX_DEG * STEPPER_CONFIG.TILT_STEPS_PER_DEGREE);

/**
 * Convert Pan angle in degrees to absolute stepper steps
 * @param {number} deg 
 * @returns {number} Integer microsteps
 */
export function degToPanSteps(deg) {
  const steps = Math.round(deg * STEPPER_CONFIG.PAN_STEPS_PER_DEGREE);
  return clampPanSteps(steps);
}

/**
 * Convert Tilt angle in degrees to absolute stepper steps
 * @param {number} deg 
 * @returns {number} Integer microsteps
 */
export function degToTiltSteps(deg) {
  const steps = Math.round(deg * STEPPER_CONFIG.TILT_STEPS_PER_DEGREE);
  return clampTiltSteps(steps);
}

/**
 * Convert absolute Pan steps to degrees
 * @param {number} steps 
 * @returns {number} Degrees
 */
export function panStepsToDeg(steps) {
  return steps / STEPPER_CONFIG.PAN_STEPS_PER_DEGREE;
}

/**
 * Convert absolute Tilt steps to degrees
 * @param {number} steps 
 * @returns {number} Degrees
 */
export function tiltStepsToDeg(steps) {
  return steps / STEPPER_CONFIG.TILT_STEPS_PER_DEGREE;
}

/**
 * Clamp Pan steps within safe mechanical limits
 * @param {number} steps 
 * @returns {number}
 */
export function clampPanSteps(steps) {
  return Math.max(STEPPER_CONFIG.PAN_MIN_STEPS, Math.min(STEPPER_CONFIG.PAN_MAX_STEPS, steps));
}

/**
 * Clamp Tilt steps within safe mechanical limits
 * @param {number} steps 
 * @returns {number}
 */
export function clampTiltSteps(steps) {
  return Math.max(STEPPER_CONFIG.TILT_MIN_STEPS, Math.min(STEPPER_CONFIG.TILT_MAX_STEPS, steps));
}

/**
 * Clamp Pan angle within safe mechanical limits
 * @param {number} deg 
 * @returns {number}
 */
export function clampPanDeg(deg) {
  return Math.max(STEPPER_CONFIG.PAN_MIN_DEG, Math.min(STEPPER_CONFIG.PAN_MAX_DEG, deg));
}

/**
 * Clamp Tilt angle within safe mechanical limits
 * @param {number} deg 
 * @returns {number}
 */
export function clampTiltDeg(deg) {
  return Math.max(STEPPER_CONFIG.TILT_MIN_DEG, Math.min(STEPPER_CONFIG.TILT_MAX_DEG, deg));
}
