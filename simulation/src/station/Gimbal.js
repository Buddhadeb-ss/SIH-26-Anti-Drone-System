import * as THREE from 'three';
import { CameraPayload } from './CameraPayload.js';

/**
 * Gimbal.js
 * High-precision 2-axis Pan/Tilt gimbal mechanism.
 * Features an azimuth base (Pan stage) and elevation fork yoke (Tilt stage)
 * carrying the multi-sensor EO/IR camera payload.
 */
export class Gimbal {
  constructor() {
    this.group = new THREE.Group();

    // Pan (Azimuth) and Tilt (Elevation) angles in radians
    this.panAngle = 0;   // Rotation around Y
    this.tiltAngle = 0.15; // Rotation around local X (slight positive elevation)

    this.minPan = -Math.PI; // -180° from reference (Home = 0)
    this.maxPan = Math.PI;  // +180° from reference
    this.minTilt = -THREE.MathUtils.degToRad(75); // -75° pitch down / elevation limits
    this.maxTilt = THREE.MathUtils.degToRad(85);  // +85° pitch up

    this.buildGimbal();
  }

  buildGimbal() {
    const metalDark = new THREE.MeshStandardMaterial({
      color: 0x222a36,
      roughness: 0.35,
      metalness: 0.85
    });

    const metalLight = new THREE.MeshStandardMaterial({
      color: 0x4a5a70,
      roughness: 0.3,
      metalness: 0.9
    });

    const accentOrange = new THREE.MeshStandardMaterial({
      color: 0xff6600, // Tactical anodized hazard ring
      roughness: 0.4,
      metalness: 0.6
    });

    // 1. Fixed Pedestal Mount Collar
    const collarGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.4, 32);
    const collar = new THREE.Mesh(collarGeo, metalDark);
    collar.position.y = 0.2;
    collar.castShadow = true;
    this.group.add(collar);

    // 2. Azimuth Rotating Stage (Pan Base)
    this.panStage = new THREE.Group();
    this.panStage.position.y = 0.4;
    this.group.add(this.panStage);

    // Harmonic drive gearbox housing
    const azBaseGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.6, 32);
    const azBase = new THREE.Mesh(azBaseGeo, metalDark);
    azBase.position.y = 0.3;
    azBase.castShadow = true;
    this.panStage.add(azBase);

    // Anodized encoder accent ring
    const encoderRingGeo = new THREE.CylinderGeometry(0.87, 0.87, 0.08, 32);
    const encoderRing = new THREE.Mesh(encoderRingGeo, accentOrange);
    encoderRing.position.y = 0.3;
    this.panStage.add(encoderRing);

    // Azimuth Motor Bell Cover
    const azMotorGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16);
    const azMotor = new THREE.Mesh(azMotorGeo, metalLight);
    azMotor.position.set(0.55, 0.3, 0);
    this.panStage.add(azMotor);

    // 3. Elevation Yoke / U-Fork Structure
    // Lower crossbar
    const crossbarGeo = new THREE.BoxGeometry(2.4, 0.3, 1.0);
    const crossbar = new THREE.Mesh(crossbarGeo, metalDark);
    crossbar.position.y = 0.75;
    crossbar.castShadow = true;
    this.panStage.add(crossbar);

    // Left structural upright arm
    const leftArmGeo = new THREE.BoxGeometry(0.35, 1.5, 0.8);
    const leftArm = new THREE.Mesh(leftArmGeo, metalDark);
    leftArm.position.set(-1.05, 1.5, 0);
    leftArm.castShadow = true;
    this.panStage.add(leftArm);

    // Right structural upright arm
    const rightArmGeo = new THREE.BoxGeometry(0.35, 1.5, 0.8);
    const rightArm = new THREE.Mesh(rightArmGeo, metalDark);
    rightArm.position.set(1.05, 1.5, 0);
    rightArm.castShadow = true;
    this.panStage.add(rightArm);

    // Elevation Pivot Hubs (Left & Right)
    const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24);
    hubGeo.rotateZ(Math.PI / 2);

    const leftHub = new THREE.Mesh(hubGeo, accentOrange);
    leftHub.position.set(-1.25, 1.9, 0);
    this.panStage.add(leftHub);

    const rightHub = new THREE.Mesh(hubGeo, metalLight);
    rightHub.position.set(1.25, 1.9, 0);
    this.panStage.add(rightHub);

    // 4. Elevation Tilt Stage (Tilt Axis)
    this.tiltStage = new THREE.Group();
    this.tiltStage.position.set(0, 1.9, 0); // Elevation pivot center
    this.panStage.add(this.tiltStage);

    // Cradle Cross-axle & mounting frame
    const axleGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.1, 16);
    axleGeo.rotateZ(Math.PI / 2);
    const axle = new THREE.Mesh(axleGeo, metalLight);
    this.tiltStage.add(axle);

    // Counterweight Cylinders (rear of tilt stage)
    const counterweightGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.8, 16);
    counterweightGeo.rotateZ(Math.PI / 2);
    const counterweight = new THREE.Mesh(counterweightGeo, metalDark);
    counterweight.position.set(0, -0.1, -1.1);
    this.tiltStage.add(counterweight);

    // 5. Mount the Multi-Sensor Camera Payload inside the Tilt Cradle
    this.cameraPayload = new CameraPayload();
    this.tiltStage.add(this.cameraPayload.group);

    this.applyTransform();
  }

  setPan(panRad) {
    this.panAngle = THREE.MathUtils.clamp(panRad, this.minPan, this.maxPan);
    this.applyTransform();
  }

  setTilt(tiltRad) {
    this.tiltAngle = THREE.MathUtils.clamp(tiltRad, this.minTilt, this.maxTilt);
    this.applyTransform();
  }

  setPanTilt(panRad, tiltRad) {
    this.panAngle = THREE.MathUtils.clamp(panRad, this.minPan, this.maxPan);
    this.tiltAngle = THREE.MathUtils.clamp(tiltRad, this.minTilt, this.maxTilt);
    this.applyTransform();
  }

  /**
   * Smoothly track a target world coordinate
   * Calculates required Azimuth and Elevation and slews toward it
   * Strictly clamps travel to prevent rotating more than 180° from reference to avoid cable tangling.
   */
  trackTarget(targetWorldPos, lerpFactor = 0.08) {
    // World position of gimbal pivot
    const pivotWorldPos = new THREE.Vector3();
    this.tiltStage.getWorldPosition(pivotWorldPos);

    // Vector from gimbal to target
    const delta = targetWorldPos.clone().sub(pivotWorldPos);
    const horizontalDist = Math.sqrt(delta.x * delta.x + delta.z * delta.z);

    if (horizontalDist < 0.001) return;

    // Desired azimuth: in Three.js coordinates, camera looks along +Z
    // Enforce cable-safe limits (Pan: -180° to +180° from reference)
    let desiredPan = THREE.MathUtils.clamp(Math.atan2(delta.x, delta.z), this.minPan, this.maxPan);
    let desiredTilt = THREE.MathUtils.clamp(-Math.atan2(delta.y, horizontalDist), this.minTilt, this.maxTilt);

    // Cable-safe direct differential without continuous unwrapped loops:
    let panDiff = desiredPan - this.panAngle;

    this.panAngle = THREE.MathUtils.clamp(this.panAngle + panDiff * lerpFactor, this.minPan, this.maxPan);
    this.tiltAngle = THREE.MathUtils.clamp(
      this.tiltAngle + (desiredTilt - this.tiltAngle) * lerpFactor,
      this.minTilt,
      this.maxTilt
    );

    this.applyTransform();
  }

  applyTransform() {
    if (this.panStage) {
      this.panStage.rotation.y = this.panAngle;
    }
    if (this.tiltStage) {
      this.tiltStage.rotation.x = this.tiltAngle;
    }
  }

  getPanDeg() {
    // Returns signed degrees from reference Home (0°), within [-180°, +180°]
    return THREE.MathUtils.radToDeg(this.panAngle);
  }

  getTiltDeg() {
    // Negative tilt in our rotation convention is pitch up
    return -THREE.MathUtils.radToDeg(this.tiltAngle);
  }

  getSensorWorldPosition() {
    const worldPos = new THREE.Vector3();
    this.cameraPayload.getSensorOrigin().getWorldPosition(worldPos);
    return worldPos;
  }

  getBoresightDirection() {
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    this.tiltStage.getWorldPosition(origin);
    forward.transformDirection(this.tiltStage.matrixWorld);
    return forward.normalize();
  }

  setBoresightVisible(visible) {
    this.cameraPayload.setBoresightVisible(visible);
  }
}
