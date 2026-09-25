import * as THREE from 'three';

/**
 * CameraPayload.js
 * Multi-sensor Electro-Optical (EO) & Infrared (IR) camera unit mounted
 * within the 2-axis gimbal tilt cradle.
 */
export class CameraPayload {
  constructor() {
    this.group = new THREE.Group();

    this.boresightVisible = true;
    this.buildPayload();
    this.buildBoresightLine();
  }

  buildPayload() {
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1a212b,
      roughness: 0.4,
      metalness: 0.8
    });

    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0e131a,
      roughness: 0.2,
      metalness: 0.9
    });

    const goldGermaniumMat = new THREE.MeshStandardMaterial({
      color: 0xc8963e, // Germanium IR lens anti-reflective tint
      roughness: 0.1,
      metalness: 0.95
    });

    const opticalLensMat = new THREE.MeshPhysicalMaterial({
      color: 0x002244,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.9,
      transparent: true,
      ior: 1.52
    });

    // 1. Central Aerodynamic / Rugged Sensor Enclosure
    const bodyGeo = new THREE.BoxGeometry(1.6, 1.1, 2.0);
    const body = new THREE.Mesh(bodyGeo, housingMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Heatsink cooling fins on top
    for (let f = -0.6; f <= 0.6; f += 0.2) {
      const finGeo = new THREE.BoxGeometry(1.4, 0.12, 0.04);
      const fin = new THREE.Mesh(finGeo, housingMat);
      fin.position.set(0, 0.6, f);
      this.group.add(fin);
    }

    // 2. Primary Electro-Optical (EO) Daylight Zoom Aperture (Left front)
    const eoBarrelGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.5, 32);
    eoBarrelGeo.rotateX(Math.PI / 2);
    const eoBarrel = new THREE.Mesh(eoBarrelGeo, bezelMat);
    eoBarrel.position.set(-0.4, 0, 1.1);
    eoBarrel.castShadow = true;
    this.group.add(eoBarrel);

    // EO Lens Glass
    const eoLensGeo = new THREE.CircleGeometry(0.34, 32);
    const eoLens = new THREE.Mesh(eoLensGeo, opticalLensMat);
    eoLens.position.set(-0.4, 0, 1.34);
    this.group.add(eoLens);

    // 3. Thermal Infrared (IR) Germanium Aperture (Right front)
    const irBarrelGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.45, 32);
    irBarrelGeo.rotateX(Math.PI / 2);
    const irBarrel = new THREE.Mesh(irBarrelGeo, bezelMat);
    irBarrel.position.set(0.4, 0, 1.08);
    irBarrel.castShadow = true;
    this.group.add(irBarrel);

    // Germanium Lens
    const irLensGeo = new THREE.CircleGeometry(0.28, 32);
    const irLens = new THREE.Mesh(irLensGeo, goldGermaniumMat);
    irLens.position.set(0.4, 0, 1.3);
    this.group.add(irLens);

    // 4. Laser Rangefinder (LRF) Small Center Bezel
    const lrfBarrelGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.3, 16);
    lrfBarrelGeo.rotateX(Math.PI / 2);
    const lrfBarrel = new THREE.Mesh(lrfBarrelGeo, bezelMat);
    lrfBarrel.position.set(0, 0.3, 1.05);
    this.group.add(lrfBarrel);

    // Optical Aperture Reference Marker (Camera sensor origin point)
    this.sensorOrigin = new THREE.Object3D();
    this.sensorOrigin.position.set(0, 0, 1.4);
    this.group.add(this.sensorOrigin);
  }

  buildBoresightLine() {
    // Optical line-of-sight reference ray pointing forward (+Z local)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 1.4),
      new THREE.Vector3(0, 0, 800) // Extends into airspace
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      linewidth: 1
    });
    this.boresightLine = new THREE.Line(lineGeo, lineMat);
    this.group.add(this.boresightLine);
  }

  setBoresightVisible(visible) {
    this.boresightVisible = visible;
    this.boresightLine.visible = visible;
  }

  getSensorOrigin() {
    return this.sensorOrigin;
  }
}
