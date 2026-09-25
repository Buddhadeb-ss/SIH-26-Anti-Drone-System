import * as THREE from 'three';

/**
 * FlightPath.js
 * Generates realistic 3D flight paths and waypoints for target drone
 * in high-altitude airspace.
 */
export class FlightPath {
  constructor() {
    this.profiles = {
      recon: {
        name: 'Perimeter Reconnaissance',
        baseSpeed: 22.0, // m/s (~79 km/h)
        waypoints: [
          new THREE.Vector3(120, 85, 140),
          new THREE.Vector3(220, 105, 50),
          new THREE.Vector3(260, 95, -110),
          new THREE.Vector3(140, 110, -220),
          new THREE.Vector3(-40, 80, -250),
          new THREE.Vector3(-180, 95, -130),
          new THREE.Vector3(-240, 115, 60),
          new THREE.Vector3(-110, 85, 190)
        ]
      },
      infiltration: {
        name: 'Low-Altitude Infiltration',
        baseSpeed: 28.0, // m/s (~100 km/h)
        waypoints: [
          new THREE.Vector3(320, 42, -180),
          new THREE.Vector3(210, 36, -80),
          new THREE.Vector3(150, 48, 40),
          new THREE.Vector3(50, 32, 130),
          new THREE.Vector3(-90, 40, 160),
          new THREE.Vector3(-180, 52, 60),
          new THREE.Vector3(-140, 38, -100),
          new THREE.Vector3(40, 45, -210)
        ]
      },
      dash: {
        name: 'High-Velocity Dash & Maneuver',
        baseSpeed: 42.0, // m/s (~151 km/h)
        waypoints: [
          new THREE.Vector3(-350, 140, -280),
          new THREE.Vector3(-120, 75, -120),
          new THREE.Vector3(80, 55, 60),
          new THREE.Vector3(280, 130, 220),
          new THREE.Vector3(340, 160, -40),
          new THREE.Vector3(160, 110, -240),
          new THREE.Vector3(-100, 135, -340)
        ]
      }
    };

    this.currentProfileKey = 'recon';
    this.buildCurve();
  }

  setProfile(profileKey) {
    if (!this.profiles[profileKey]) return;
    this.currentProfileKey = profileKey;
    this.buildCurve();
  }

  buildCurve() {
    const profile = this.profiles[this.currentProfileKey];
    // Create smooth closed Catmull-Rom spline
    this.curve = new THREE.CatmullRomCurve3(profile.waypoints, true, 'centripetal', 0.5);
    this.totalLength = this.curve.getLength();
  }

  /**
   * Get point on curve at normalized parameter u [0, 1]
   */
  getPointAt(u) {
    return this.curve.getPointAt(u % 1.0);
  }

  /**
   * Get normalized tangent vector at parameter u [0, 1]
   */
  getTangentAt(u) {
    return this.curve.getTangentAt(u % 1.0);
  }

  getBaseSpeed() {
    return this.profiles[this.currentProfileKey].baseSpeed;
  }

  getTotalLength() {
    return this.totalLength;
  }

  getProfileName() {
    return this.profiles[this.currentProfileKey].name;
  }
}
