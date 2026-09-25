import * as THREE from 'three';
import { PrototypeGimbal } from './PrototypeGimbal.js';

/**
 * Station.js
 * Physical Digital Twin of the Anti-Drone Prototype.
 * High-visibility representation matching user photos on clean white snow:
 * - Base mounting plate & rubber feet
 * - 2-Axis NEMA-17 Stepper Pan/Tilt mechanism with black webcam
 * - STM32 Nucleo microcontroller board with glowing LEDs
 * - Stepper driver breadboard with colorful jumper wiring bundle
 * - Dual 180° Radar Modules: RADAR A (Forward) & RADAR B (Rearward)
 * - Visual 180° 3D radar coverage sectors (10m effective range)
 */
export class Station {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.radarRange = 10.0;
    this.radarSectorsVisible = true;

    this.buildBasePlatform();
    this.buildPrototypingElectronics();
    this.buildDualRadars();
    this.buildDualRadar3DSectors();
    this.buildMissileLauncherPod();

    // Instantiate compact physical gimbal
    this.gimbal = new PrototypeGimbal();
    this.gimbal.group.position.set(-0.12, 0.04, 0.05);
    this.group.add(this.gimbal.group);
  }

  buildBasePlatform() {
    // Mounting Bench / Test Platform (~0.85m x 0.65m x 0.035m)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x222832,
      roughness: 0.65,
      metalness: 0.4
    });

    const benchGeo = new THREE.BoxGeometry(0.88, 0.04, 0.68);
    const bench = new THREE.Mesh(benchGeo, baseMat);
    bench.position.y = 0.02;
    bench.receiveShadow = true;
    bench.castShadow = true;
    this.group.add(bench);

    // Hazard accent trim on base
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x0088cc });
    const trimGeo = new THREE.BoxGeometry(0.89, 0.005, 0.69);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = 0.041;
    this.group.add(trim);
  }

  buildPrototypingElectronics() {
    // =========================================================================
    // STM32 NUCLEO BOARD
    // =========================================================================
    const nucleoGroup = new THREE.Group();
    nucleoGroup.position.set(0.22, 0.042, -0.1);
    this.group.add(nucleoGroup);

    // White PCB
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.4 });
    const pcbGeo = new THREE.BoxGeometry(0.18, 0.006, 0.24);
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.castShadow = true;
    nucleoGroup.add(pcb);

    // Double-row Header strips
    const headerMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    [-0.075, 0.075].forEach((hx) => {
      const headerGeo = new THREE.BoxGeometry(0.014, 0.02, 0.21);
      const header = new THREE.Mesh(headerGeo, headerMat);
      header.position.set(hx, 0.012, 0);
      nucleoGroup.add(header);
    });

    // Central MCU chip (STM32 LQFP)
    const mcuMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const mcuGeo = new THREE.BoxGeometry(0.04, 0.005, 0.04);
    const mcu = new THREE.Mesh(mcuGeo, mcuMat);
    mcu.position.set(0, 0.006, 0.02);
    nucleoGroup.add(mcu);

    // Glowing Red Power LED
    const redLedMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const redLedGeo = new THREE.BoxGeometry(0.008, 0.005, 0.008);
    const redLed = new THREE.Mesh(redLedGeo, redLedMat);
    redLed.position.set(-0.04, 0.006, 0.08);
    nucleoGroup.add(redLed);

    // Glowing Green Status LED
    const grnLedMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const grnLed = new THREE.Mesh(redLedGeo, grnLedMat);
    grnLed.position.set(0.04, 0.006, 0.08);
    nucleoGroup.add(grnLed);

    // Mini-USB connector & cable
    const blackCableMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const usbCableGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.28, 8);
    usbCableGeo.rotateX(Math.PI / 2);
    const usbCable = new THREE.Mesh(usbCableGeo, blackCableMat);
    usbCable.position.set(0, 0.01, 0.24);
    nucleoGroup.add(usbCable);

    // =========================================================================
    // MINI BREADBOARD (With stepper drivers & colorful jumper wires)
    // =========================================================================
    const bbGroup = new THREE.Group();
    bbGroup.position.set(0.22, 0.042, 0.16);
    this.group.add(bbGroup);

    // White plastic breadboard
    const bbMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const bbGeo = new THREE.BoxGeometry(0.14, 0.02, 0.18);
    const bb = new THREE.Mesh(bbGeo, bbMat);
    bb.castShadow = true;
    bbGroup.add(bb);

    // Stepper driver boards with blue aluminum heatsinks
    const heatsinkMat = new THREE.MeshStandardMaterial({ color: 0x0077bb, metalness: 0.85 });
    [-0.035, 0.035].forEach((hx) => {
      const hsGeo = new THREE.BoxGeometry(0.028, 0.016, 0.028);
      const hs = new THREE.Mesh(hsGeo, heatsinkMat);
      hs.position.set(hx, 0.018, 0);
      bbGroup.add(hs);
    });

    // Colorful loop of jumper wires connecting Nucleo to Breadboard
    const jumperColors = [0xff5500, 0x00cc44, 0x1177ff, 0xffbb00, 0xaa22dd, 0xee2222];
    jumperColors.forEach((jCol, idx) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2 + (idx - 2.5) * 0.012, 0.06, -0.02),
        new THREE.Vector3(0.24 + (idx - 2.5) * 0.018, 0.14, 0.05),
        new THREE.Vector3(0.22 + (idx - 2.5) * 0.012, 0.07, 0.12)
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.0028, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: jCol });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this.group.add(tube);
    });
  }

  buildDualRadars() {
    const radarCaseMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.35,
      metalness: 0.85
    });

    // RADAR A (Facing Forward / North, +Z direction)
    this.radarAGroup = new THREE.Group();
    this.radarAGroup.position.set(-0.32, 0.09, 0.24);
    this.group.add(this.radarAGroup);

    const rBoxGeo = new THREE.BoxGeometry(0.09, 0.06, 0.03);
    const rBoxA = new THREE.Mesh(rBoxGeo, radarCaseMat);
    rBoxA.castShadow = true;
    this.radarAGroup.add(rBoxA);

    // Planar Dielectric Antenna Face (Emerald Green for RADAR A)
    const faceMatA = new THREE.MeshBasicMaterial({ color: 0x00cc77 });
    const rFaceGeo = new THREE.PlaneGeometry(0.08, 0.05);
    const rFaceA = new THREE.Mesh(rFaceGeo, faceMatA);
    rFaceA.position.set(0, 0, 0.0152);
    this.radarAGroup.add(rFaceA);

    // RADAR B (Facing Rearward / South, -Z direction)
    this.radarBGroup = new THREE.Group();
    this.radarBGroup.position.set(-0.32, 0.09, -0.24);
    this.group.add(this.radarBGroup);

    const rBoxB = new THREE.Mesh(rBoxGeo, radarCaseMat);
    rBoxB.castShadow = true;
    this.radarBGroup.add(rBoxB);

    // Planar Dielectric Antenna Face (Amber Orange for RADAR B)
    const faceMatB = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const rFaceB = new THREE.Mesh(rFaceGeo, faceMatB);
    rFaceB.position.set(0, 0, -0.0152);
    rFaceB.rotation.y = Math.PI;
    this.radarBGroup.add(rFaceB);
  }

  buildDualRadar3DSectors() {
    this.sectorGroup = new THREE.Group();
    this.group.add(this.sectorGroup);

    const segs = 64;
    const r = this.radarRange;

    // --- RADAR A: 180° FOV Forward (+Z hemisphere) ---
    const geoA = new THREE.BufferGeometry();
    const vertsA = [0, 0.03, 0];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      vertsA.push(x, 0.03, z);
    }
    const indicesA = [];
    for (let i = 1; i <= segs; i++) {
      indicesA.push(0, i, i + 1);
    }
    geoA.setAttribute('position', new THREE.Float32BufferAttribute(vertsA, 3));
    geoA.setIndex(indicesA);

    // Ultra-faint tactical tint (0.03) so snow remains brilliantly pure white
    const matA = new THREE.MeshBasicMaterial({
      color: 0x00cc77,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.03,
      depthWrite: false
    });
    this.sectorMeshA = new THREE.Mesh(geoA, matA);
    this.sectorGroup.add(this.sectorMeshA);

    // Crisp high-contrast perimeter boundary outline for RADAR A
    const arcPtsA = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI;
      arcPtsA.push(new THREE.Vector3(Math.cos(theta) * r, 0.035, Math.sin(theta) * r));
    }
    const arcGeoA = new THREE.BufferGeometry().setFromPoints(arcPtsA);
    const arcMatA = new THREE.LineBasicMaterial({ color: 0x00aa55 });
    this.sectorLineA = new THREE.Line(arcGeoA, arcMatA);
    this.sectorGroup.add(this.sectorLineA);

    // --- RADAR B: 180° FOV Rearward (-Z hemisphere) ---
    const geoB = new THREE.BufferGeometry();
    const vertsB = [0, 0.03, 0];
    for (let i = 0; i <= segs; i++) {
      const theta = Math.PI + (i / segs) * Math.PI;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      vertsB.push(x, 0.03, z);
    }
    const indicesB = [];
    for (let i = 1; i <= segs; i++) {
      indicesB.push(0, i, i + 1);
    }
    geoB.setAttribute('position', new THREE.Float32BufferAttribute(vertsB, 3));
    geoB.setIndex(indicesB);

    // Ultra-faint tactical tint (0.03) so snow remains brilliantly pure white
    const matB = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.03,
      depthWrite: false
    });
    this.sectorMeshB = new THREE.Mesh(geoB, matB);
    this.sectorGroup.add(this.sectorMeshB);

    // Crisp high-contrast perimeter boundary outline for RADAR B
    const arcPtsB = [];
    for (let i = 0; i <= segs; i++) {
      const theta = Math.PI + (i / segs) * Math.PI;
      arcPtsB.push(new THREE.Vector3(Math.cos(theta) * r, 0.035, Math.sin(theta) * r));
    }
    const arcGeoB = new THREE.BufferGeometry().setFromPoints(arcPtsB);
    const arcMatB = new THREE.LineBasicMaterial({ color: 0xdd6600 });
    this.sectorLineB = new THREE.Line(arcGeoB, arcMatB);
    this.sectorGroup.add(this.sectorLineB);

    // Dividing centerline between Sector A (+Z) and Sector B (-Z) along X axis
    const dividerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-r, 0.036, 0),
      new THREE.Vector3(r, 0.036, 0)
    ]);
    const dividerMat = new THREE.LineDashedMaterial({
      color: 0x0088cc,
      dashSize: 0.3,
      gapSize: 0.15
    });
    const dividerLine = new THREE.Line(dividerGeo, dividerMat);
    dividerLine.computeLineDistances();
    this.sectorGroup.add(dividerLine);
  }

  setRadarSectorsVisible(visible) {
    this.radarSectorsVisible = visible;
    this.sectorGroup.visible = visible;
  }

  getGimbalPivotPosition() {
    const pos = new THREE.Vector3();
    this.gimbal.group.getWorldPosition(pos);
    pos.y += 0.245; // Stationary elevation pivot axis (independent of pan rotation)
    return pos;
  }

  buildMissileLauncherPod() {
    // Twin-tube tactical mini-missile canister pod mounted on station bench
    this.launcherGroup = new THREE.Group();
    this.launcherGroup.position.set(-0.28, 0.042, 0.16);
    this.group.add(this.launcherGroup);

    const podMat = new THREE.MeshStandardMaterial({
      color: 0x242d38,
      roughness: 0.45,
      metalness: 0.7
    });

    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const greenLedMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

    // Base pedestal & pivot bracket
    const mountGeo = new THREE.BoxGeometry(0.12, 0.04, 0.14);
    const mount = new THREE.Mesh(mountGeo, podMat);
    mount.position.y = 0.02;
    this.launcherGroup.add(mount);

    // Angled launcher pod head (tilted up ~38° towards forward hemisphere)
    this.podHead = new THREE.Group();
    this.podHead.position.set(0, 0.045, 0);
    this.podHead.rotation.x = -Math.PI * 0.22; // ~40° elevation
    this.podHead.rotation.y = Math.PI * 0.1;  // slight outward pan
    this.launcherGroup.add(this.podHead);

    // Twin launch tubes
    [-0.038, 0.038].forEach((tx) => {
      const tubeGeo = new THREE.CylinderGeometry(0.028, 0.03, 0.28, 16);
      tubeGeo.rotateX(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, podMat);
      tube.position.set(tx, 0.04, 0.04);
      tube.castShadow = true;
      this.podHead.add(tube);

      // Warning hazard stripe on tube muzzle
      const muzzleGeo = new THREE.CylinderGeometry(0.031, 0.031, 0.02, 16);
      muzzleGeo.rotateX(Math.PI / 2);
      const muzzle = new THREE.Mesh(muzzleGeo, hazardMat);
      muzzle.position.set(tx, 0.04, 0.17);
      this.podHead.add(muzzle);

      // Dark tube interior
      const innerGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.01, 16);
      innerGeo.rotateX(Math.PI / 2);
      const innerMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(tx, 0.04, 0.181);
      this.podHead.add(inner);
    });

    // ARMED Status LED
    const ledGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const led = new THREE.Mesh(ledGeo, greenLedMat);
    led.position.set(0, 0.065, 0.08);
    this.podHead.add(led);
  }

  getMissileLaunchPosition() {
    const pos = new THREE.Vector3();
    if (this.podHead) {
      this.podHead.getWorldPosition(pos);
      // Offset to the tube muzzle
      const forward = new THREE.Vector3(0, 0, 0.25);
      forward.applyQuaternion(this.podHead.getWorldQuaternion(new THREE.Quaternion()));
      pos.add(forward);
    } else {
      pos.set(-0.28, 0.18, 0.32);
    }
    return pos;
  }

  getMissileLaunchDirection() {
    const dir = new THREE.Vector3(0, 0, 1);
    if (this.podHead) {
      dir.applyQuaternion(this.podHead.getWorldQuaternion(new THREE.Quaternion()));
    } else {
      dir.set(0.1, 0.65, 0.75).normalize();
    }
    return dir.normalize();
  }
}
