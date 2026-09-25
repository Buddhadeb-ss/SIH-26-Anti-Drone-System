import * as THREE from 'three';

/**
 * RadarUnit.js
 * Tactical High-Altitude Phased-Array / Micro-Doppler Radar Unit mounted
 * on the ground-based anti-drone station.
 */
export class RadarUnit {
  constructor() {
    this.group = new THREE.Group();
    this.scanSpeed = 1.8; // Radians per second rotation
    this.currentHeading = 0;

    this.buildRadar();
  }

  buildRadar() {
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x18202a,
      roughness: 0.35,
      metalness: 0.85
    });

    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x2e3b4e,
      roughness: 0.25,
      metalness: 0.7
    });

    const radomeMat = new THREE.MeshStandardMaterial({
      color: 0x3d4f68, // Dielectric planar radome face
      roughness: 0.5,
      metalness: 0.2
    });

    const cyanGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18
    });

    // 1. Radar Mounting Base on station
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.3, 16);
    const base = new THREE.Mesh(baseGeo, darkMetalMat);
    base.position.y = 0.15;
    this.group.add(base);

    // 2. Rotating Radar Scanner Head
    this.scannerHead = new THREE.Group();
    this.scannerHead.position.y = 0.3;
    this.group.add(this.scannerHead);

    // Motor rotary turntable
    const rotaryGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16);
    const rotary = new THREE.Mesh(rotaryGeo, darkMetalMat);
    rotary.position.y = 0.1;
    this.scannerHead.add(rotary);

    // 3. Planar Phased-Array Antenna Panel (Curved/Tilted tactical panel)
    const panelGeo = new THREE.BoxGeometry(1.4, 0.9, 0.15);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0.8, 0);
    panel.rotation.x = -0.12; // Slight tilt up for airspace coverage
    panel.castShadow = true;
    this.scannerHead.add(panel);

    // Dielectric front radome face
    const radomeGeo = new THREE.PlaneGeometry(1.3, 0.82);
    const radome = new THREE.Mesh(radomeGeo, radomeMat);
    radome.position.set(0, 0.8, 0.08);
    radome.rotation.x = -0.12;
    this.scannerHead.add(radome);

    // Micro-Doppler feed horn & waveguide
    const hornGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
    hornGeo.rotateX(-Math.PI / 2);
    const horn = new THREE.Mesh(hornGeo, darkMetalMat);
    horn.position.set(0, 0.75, 0.3);
    this.scannerHead.add(horn);

    // RF Transceiver rear housing box
    const txGeo = new THREE.BoxGeometry(0.7, 0.5, 0.3);
    const tx = new THREE.Mesh(txGeo, darkMetalMat);
    tx.position.set(0, 0.8, -0.2);
    this.scannerHead.add(tx);

    // 4. Subtle Radar Scanning Fan Beam (tactical 3D visual)
    const beamGeo = new THREE.ConeGeometry(80, 160, 16, 1, true, -Math.PI / 8, Math.PI / 4);
    beamGeo.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, cyanGlowMat);
    this.beam.position.set(0, 0.8, 80);
    this.beam.visible = true;
    this.scannerHead.add(this.beam);

    // Blinking status beacon on top of radar
    const ledGeo = new THREE.SphereGeometry(0.06, 8, 8);
    this.statusLedMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const led = new THREE.Mesh(ledGeo, this.statusLedMat);
    led.position.set(0, 1.35, 0);
    this.scannerHead.add(led);
  }

  update(deltaTime) {
    // Continuously sweep 360 degrees
    this.currentHeading += this.scanSpeed * deltaTime;
    if (this.currentHeading > Math.PI * 2) {
      this.currentHeading -= Math.PI * 2;
    }
    this.scannerHead.rotation.y = this.currentHeading;

    // Subtle blink on status LED
    const pulse = Math.sin(Date.now() * 0.005) > 0.3;
    this.statusLedMat.color.setHex(pulse ? 0x00ff88 : 0x004422);
  }

  setBeamVisible(visible) {
    this.beam.visible = visible;
  }
}
