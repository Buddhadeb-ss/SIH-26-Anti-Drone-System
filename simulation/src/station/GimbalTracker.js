import * as THREE from 'three';

/**
 * GimbalTracker.js
 * Smooth closed-loop 2-axis Pan/Tilt servo tracking.
 * Steers the physical gimbal's pan stepper and tilt stepper smoothly toward
 * the active drone target without instant snapping.
 */
export class GimbalTracker {
  constructor(gimbal) {
    this.gimbal = gimbal;

    this.currentPan = 0;
    this.currentTilt = -0.1;

    this.targetPan = 0;
    this.targetTilt = -0.1;

    // Slew rate limits (radians per second) matching real NEMA-17 stepper speeds
    this.maxPanSpeed = THREE.MathUtils.degToRad(75);  // 75 deg/s
    this.maxTiltSpeed = THREE.MathUtils.degToRad(60); // 60 deg/s
    this.trackingStatus = 'STANDBY';
  }

  update(deltaTime, targetDrone) {
    if (!targetDrone) {
      this.trackingStatus = 'STANDBY';
      return;
    }

    const targetPos = targetDrone.getPosition();
    const pivotPos = this.gimbal.getSensorWorldPosition();

    const delta = targetPos.clone().sub(pivotPos);
    const horizDist = Math.hypot(delta.x, delta.z);

    if (horizDist < 0.001) return;

    // 1. Desired Pan & Tilt from reference (Home = 0 rad)
    // Enforce strict mechanical cable-safe limits (Pan: max 180° = PI rad from reference)
    // Tilt: -75° to +85° from reference
    const PAN_LIMIT = Math.PI; // 180° in radians
    const TILT_MIN = THREE.MathUtils.degToRad(-75);
    const TILT_MAX = THREE.MathUtils.degToRad(85);

    this.targetPan = THREE.MathUtils.clamp(Math.atan2(delta.x, delta.z), -PAN_LIMIT, PAN_LIMIT);
    this.targetTilt = THREE.MathUtils.clamp(-Math.atan2(delta.y, horizDist), TILT_MIN, TILT_MAX);

    // Cable-Safe Non-Wrapping Pan Motion:
    // The stepper motor must NEVER rotate past +/-180° from reference to prevent wire tangling
    const panDiff = this.targetPan - this.currentPan;
    const maxPanStep = this.maxPanSpeed * deltaTime;
    const panStep = THREE.MathUtils.clamp(panDiff * 4.5 * deltaTime, -maxPanStep, maxPanStep);
    this.currentPan = THREE.MathUtils.clamp(this.currentPan + panStep, -PAN_LIMIT, PAN_LIMIT);

    // Tilt step
    const tiltDiff = this.targetTilt - this.currentTilt;
    const maxTiltStep = this.maxTiltSpeed * deltaTime;
    const tiltStep = THREE.MathUtils.clamp(tiltDiff * 4.5 * deltaTime, -maxTiltStep, maxTiltStep);
    this.currentTilt = THREE.MathUtils.clamp(this.currentTilt + tiltStep, TILT_MIN, TILT_MAX);

    // Apply to physical gimbal model
    this.gimbal.setPanTilt(this.currentPan, this.currentTilt);

    // Determine tracking lock status
    const pointingErrorDeg = THREE.MathUtils.radToDeg(Math.hypot(panDiff, tiltDiff));
    if (pointingErrorDeg < 2.5) {
      this.trackingStatus = 'LOCKED';
    } else {
      this.trackingStatus = 'TRACKING';
    }
  }

  getTrackingStatus() {
    return this.trackingStatus;
  }
}
