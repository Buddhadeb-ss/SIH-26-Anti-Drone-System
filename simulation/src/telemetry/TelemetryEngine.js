import * as THREE from 'three';

/**
 * TelemetryEngine.js
 * Calculates real-time mathematical telemetry metrics for the anti-drone digital twin:
 * Slant range, MSL & AGL altitude, velocity vectors, speed, bearing (azimuth),
 * and elevation relative to the ground station.
 */
export class TelemetryEngine {
  constructor(baseAltitudeMSL = 4120) {
    this.baseAltitudeMSL = baseAltitudeMSL;
    this.simTime = 0;
  }

  compute({ drone, station, environment, deltaTime, isPaused }) {
    if (!isPaused) {
      this.simTime += deltaTime;
    }

    const dronePos = drone.getPosition();
    const droneVel = drone.getVelocity();
    const droneSpeed = drone.getSpeed();
    const stationPos = station.getGimbalPivotPosition();

    // 1. Relative Vector (Station to Drone)
    const relVector = dronePos.clone().sub(stationPos);

    // 2. Slant Range (Euclidean 3D line-of-sight distance in meters)
    const slantRange = relVector.length();

    // 3. Altitudes
    const altMSL = this.baseAltitudeMSL + dronePos.y;
    const terrainHeight = environment.getTerrainHeightAt(dronePos.x, dronePos.z);
    const altAGL = Math.max(0, dronePos.y - terrainHeight);

    // 4. Target Bearing / Azimuth relative to True North
    // In Three.js: -Z is North, +X is East, +Z is South, -X is West.
    // Bearing angle: clockwise from North
    let bearingRad = Math.atan2(relVector.x, -relVector.z);
    let bearingDeg = THREE.MathUtils.radToDeg(bearingRad);
    if (bearingDeg < 0) bearingDeg += 360;

    // 5. Target Elevation angle relative to horizontal ground plane
    const horizontalDist = Math.sqrt(relVector.x * relVector.x + relVector.z * relVector.z);
    let elevationRad = Math.atan2(relVector.y, horizontalDist);
    let elevationDeg = THREE.MathUtils.radToDeg(elevationRad);

    // 6. Gimbal Pan and Tilt angles
    const gimbalPanDeg = station.gimbal.getPanDeg();
    const gimbalTiltDeg = station.gimbal.getTiltDeg();

    return {
      simTimeFormatted: this.formatTime(this.simTime),
      slantRange,
      speedMs: droneSpeed,
      speedKmh: droneSpeed * 3.6,
      altMSL,
      altAGL,
      terrainHeight,
      posX: dronePos.x,
      posY: dronePos.y,
      posZ: dronePos.z,
      velX: droneVel.x,
      velY: droneVel.y,
      velZ: droneVel.z,
      targetAzimuthDeg: bearingDeg,
      targetElevationDeg: elevationDeg,
      gimbalPanDeg,
      gimbalTiltDeg
    };
  }

  reset() {
    this.simTime = 0;
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    const padMin = mins < 10 ? '0' + mins : mins;
    const padSec = secs < 10 ? '0' + secs : secs;
    return `${padMin}:${padSec}`;
  }
}
