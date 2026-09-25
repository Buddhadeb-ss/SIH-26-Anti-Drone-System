import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * CameraManager.js
 * Controls multi-angle prototype inspection views, smooth camera transitions,
 * OrbitControls, and dynamic tracking presets scaled for the prototype and 10m airspace.
 */
export class CameraManager {
  constructor(camera, domElement, onModeChange) {
    this.camera = camera;
    this.domElement = domElement;
    this.onModeChange = onModeChange;

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 60;
    this.controls.minDistance = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.02;

    // Default target centered to frame BOTH the prototype station in foreground and drone in airspace
    this.controls.target.set(0.0, 1.1, 2.4);
    this.camera.position.set(-2.8, 2.2, -3.2);
    this.controls.update();

    this.currentMode = 'orbit';

    // Transition interpolation state
    this.isTransitioning = false;
    this.transitionDuration = 0.8;
    this.transitionTime = 0;
    this.startCamPos = new THREE.Vector3();
    this.startTargetPos = new THREE.Vector3();
    this.desiredCamPos = new THREE.Vector3();
    this.desiredTargetPos = new THREE.Vector3();

    // Scene references
    this.droneManagerRef = null;
    this.gimbalRef = null;
    this.stationRef = null;
  }

  setTrackingTargets({ droneManager, gimbal, station }) {
    this.droneManagerRef = droneManager;
    this.gimbalRef = gimbal;
    this.stationRef = station;
  }

  setMode(mode) {
    if (this.currentMode === mode && mode !== 'orbit') return;
    this.currentMode = mode;

    this.isTransitioning = true;
    this.transitionTime = 0;
    this.startCamPos.copy(this.camera.position);
    this.startTargetPos.copy(this.controls.target);

    switch (mode) {
      case 'orbit':
        this.controls.enabled = true;
        // Optimal tactical perspective: prototype in foreground, flying drones and laser line in forward airspace
        this.desiredTargetPos.set(0.0, 1.1, 2.4);
        this.desiredCamPos.set(-2.8, 2.2, -3.2);
        break;

      case 'station':
        // Close-up on the NEMA-17 steppers, L-bracket, wiring and webcam
        this.controls.enabled = true;
        this.desiredTargetPos.set(-0.06, 0.22, 0.05);
        this.desiredCamPos.set(0.38, 0.42, 0.48);
        break;

      case 'topdown':
        this.controls.enabled = true;
        this.desiredTargetPos.set(0, 0, 3.5);
        this.desiredCamPos.set(0, 20.0, 3.51);
        break;

      case 'gimbal':
        this.controls.enabled = false;
        break;

      case 'drone':
        this.controls.enabled = false;
        break;
    }

    if (this.onModeChange) {
      this.onModeChange(mode);
    }
  }

  update(deltaTime) {
    if (this.isTransitioning) {
      this.transitionTime += deltaTime;
      const progress = Math.min(this.transitionTime / this.transitionDuration, 1.0);
      const ease = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(this.startCamPos, this.desiredCamPos, ease);
      this.controls.target.lerpVectors(this.startTargetPos, this.desiredTargetPos, ease);

      if (progress >= 1.0) {
        this.isTransitioning = false;
      }
      this.controls.update();
      return;
    }

    if (this.currentMode === 'drone' && this.droneManagerRef) {
      const selectedDrone = this.droneManagerRef.getSelectedTarget();
      if (selectedDrone) {
        const dronePos = selectedDrone.getPosition();
        const velocity = selectedDrone.getVelocity();

        let heading = new THREE.Vector3(0, 0, 1);
        if (velocity.lengthSq() > 0.01) {
          heading.copy(velocity).normalize();
        }

        // Chase camera 1.8m behind and 0.6m above the quadcopter
        const camOffset = heading.clone().multiplyScalar(-1.8).add(new THREE.Vector3(0, 0.6, 0));
        const targetPos = dronePos.clone().add(camOffset);

        this.camera.position.lerp(targetPos, 0.1);
        this.controls.target.lerp(dronePos, 0.2);
        this.camera.lookAt(dronePos);
      }
    } else if (this.currentMode === 'gimbal' && this.gimbalRef) {
      // Look out through webcam lens
      const sensorPos = this.gimbalRef.getSensorWorldPosition();
      const boresightDir = this.gimbalRef.getBoresightDirection();

      this.camera.position.copy(sensorPos);
      const lookTarget = sensorPos.clone().add(boresightDir.clone().multiplyScalar(10));
      this.camera.lookAt(lookTarget);
    } else {
      this.controls.update();
    }

    // Dynamic explosion screen shake
    if (this.trauma && this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 0.14;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.position.z += (Math.random() - 0.5) * shake;
      this.trauma = Math.max(0, this.trauma - (deltaTime || 0.016) * 1.8);
    }
  }

  triggerTrauma(amount = 0.35) {
    this.trauma = Math.min(1.0, (this.trauma || 0) + amount);
  }
}
