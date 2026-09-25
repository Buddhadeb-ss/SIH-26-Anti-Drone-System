import * as THREE from 'three';

/**
 * DualRadarEngine.js
 * Implements functional detection logic for two independent 2D 180° radars:
 * - RADAR A: Forward-facing 180° FOV (+Z hemisphere)
 * - RADAR B: Rearward-facing 180° FOV (-Z hemisphere)
 * - Effective range: 10.0 metres
 * 
 * Detection occurs ONLY when a drone is both within range (<= 10m)
 * and inside the radar's 180° planar field of view.
 */
export class DualRadarEngine {
  constructor(maxRange = 20.0) {
    this.maxRange = maxRange;
    this.sweepAngle = 0; // Current radar sweep angle in radians [0, 2*PI]
    this.sweepSpeed = 2.4; // rad/s
  }

  update(deltaTime, drones) {
    this.sweepAngle = (this.sweepAngle + this.sweepSpeed * deltaTime) % (Math.PI * 2);

    const results = [];
    const stationPos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      const pos = drone.getPosition();

      // 1. Calculate 2D horizontal distance from station (metres)
      const dx = pos.x - stationPos.x;
      const dz = pos.z - stationPos.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      const slantDist = pos.distanceTo(stationPos);

      // 2. Calculate Bearing relative to True North
      // In Three.js: -Z is North, +X is East, +Z is South, -X is West.
      let bearingRad = Math.atan2(dx, -dz);
      let bearingDeg = THREE.MathUtils.radToDeg(bearingRad);
      if (bearingDeg < 0) bearingDeg += 360;

      // 3. Independent Detection Check for RADAR A (+Z Forward 180° FOV)
      // Forward normal is +Z (0, 0, 1). Inside 180° means dot product with normal >= 0 (i.e. dz >= 0)
      const inRangeA = horizontalDist <= this.maxRange;
      const inFovA = dz >= -0.05; // Small margin for boundary
      const detectedA = inRangeA && inFovA;

      // 4. Independent Detection Check for RADAR B (-Z Rearward 180° FOV)
      // Rearward normal is -Z (0, 0, -1). Inside 180° means dz <= 0
      const inRangeB = horizontalDist <= this.maxRange;
      const inFovB = dz <= 0.05;
      const detectedB = inRangeB && inFovB;

      // 5. Source Classification
      let detectionSource = 'NONE';
      if (detectedA && detectedB) {
        detectionSource = 'BOTH';
      } else if (detectedA) {
        detectionSource = 'RADAR A';
      } else if (detectedB) {
        detectionSource = 'RADAR B';
      }

      // Threat Level Calculation: escalates as drone approaches prototype or settlement
      let threatLevel = 'NONE';
      if (detectionSource !== 'NONE') {
        if (horizontalDist <= 6.0) {
          threatLevel = 'CRITICAL';
        } else if (horizontalDist <= 12.0) {
          threatLevel = 'HIGH';
        } else {
          threatLevel = 'MEDIUM';
        }
      } else {
        if (horizontalDist <= 26.0) {
          threatLevel = 'LOW';
        }
      }

      results.push({
        droneId: drone.id,
        droneRef: drone,
        position: pos,
        horizontalDist,
        slantDist,
        bearingDeg,
        altitudeAgl: pos.y,
        velocity: drone.getVelocity(),
        speed: drone.getSpeed(),
        detectedA,
        detectedB,
        detectionSource,
        isDetected: detectionSource !== 'NONE',
        threatLevel: drone.isNeutralized ? 'NEUTRALIZED' : threatLevel,
        isNeutralized: !!drone.isNeutralized
      });
    }

    return {
      sweepAngle: this.sweepAngle,
      targets: results,
      maxRange: this.maxRange
    };
  }

  setMaxRange(range) {
    this.maxRange = range;
  }
}
