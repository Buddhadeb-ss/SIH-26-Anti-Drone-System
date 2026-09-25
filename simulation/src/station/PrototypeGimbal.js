import * as THREE from 'three';

/**
 * PrototypeGimbal.js
 * High-fidelity 3D Digital Twin of the actual compact 2-axis Pan/Tilt prototype.
 * Proportioned for crystal-clear visibility in the 3D simulation:
 * - Lower NEMA-17 Pan stepper motor (silver aluminum end-bells, black stator, corner hex bolts)
 * - Rigid black aluminum L-bracket
 * - Upper NEMA-17 Tilt stepper motor (horizontal shaft, "SKU: 51732" label, 4-pin JST connector)
 * - White 3D-printed/nylon shaft coupler hub
 * - Black capsule webcam mounted with white strap/zip-tie fasteners (exact match to user photos)
 * - Stepper wire ribbons (Red, Blue, Green, Black) & camera USB cable
 */
export class PrototypeGimbal {
  constructor() {
    this.group = new THREE.Group();

    // Pan & Tilt state (radians)
    this.panAngle = 0;       // Rotation about vertical Y axis (continuous)
    this.tiltAngle = -0.15;  // Rotation about horizontal X axis (slight pitch up)

    this.minTilt = -THREE.MathUtils.degToRad(75);
    this.maxTilt = THREE.MathUtils.degToRad(85);

    this.buildPrototypeGimbal();
  }

  buildPrototypeGimbal() {
    // Prototyping materials with high visual contrast against white snow
    const silverAluMat = new THREE.MeshStandardMaterial({
      color: 0xd4d8de,
      roughness: 0.25,
      metalness: 0.85
    });

    const blackStatorMat = new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      roughness: 0.55,
      metalness: 0.35
    });

    const blackBracketMat = new THREE.MeshStandardMaterial({
      color: 0x111316,
      roughness: 0.35,
      metalness: 0.75
    });

    const whiteNylonMat = new THREE.MeshStandardMaterial({
      color: 0xf4f6f8,
      roughness: 0.45,
      metalness: 0.1
    });

    const cameraBodyMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e11,
      roughness: 0.3,
      metalness: 0.5
    });

    const opticalLensMat = new THREE.MeshPhysicalMaterial({
      color: 0x001a33,
      roughness: 0.05,
      metalness: 0.2,
      transmission: 0.85,
      ior: 1.52
    });

    const steelShaftMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.15,
      metalness: 0.95
    });

    const wireColors = [0xdd2222, 0x2266dd, 0x22aa44, 0x111111]; // Red, Blue, Green, Black

    // Scale calibrated for clear prototype inspection in 3D:
    // Motor width: 0.14m, height: 0.12m
    const motorW = 0.13;
    const motorH = 0.11;
    const endCapH = 0.022;
    const statorH = motorH - 2 * endCapH;

    // =========================================================================
    // 1. LOWER PAN STEPPER MOTOR (Stationary base)
    // =========================================================================
    const panMotorBase = new THREE.Group();
    panMotorBase.position.y = motorH / 2;
    this.group.add(panMotorBase);

    // Bottom aluminum end-cap
    const bCapGeo = new THREE.BoxGeometry(motorW, endCapH, motorW);
    const bCap = new THREE.Mesh(bCapGeo, silverAluMat);
    bCap.position.y = -motorH / 2 + endCapH / 2;
    bCap.castShadow = true;
    bCap.receiveShadow = true;
    panMotorBase.add(bCap);

    // Black central stator stack
    const statorGeo = new THREE.BoxGeometry(motorW - 0.004, statorH, motorW - 0.004);
    const stator = new THREE.Mesh(statorGeo, blackStatorMat);
    stator.castShadow = true;
    stator.receiveShadow = true;
    panMotorBase.add(stator);

    // Top aluminum end-cap
    const tCapGeo = new THREE.BoxGeometry(motorW, endCapH, motorW);
    const tCap = new THREE.Mesh(tCapGeo, silverAluMat);
    tCap.position.y = motorH / 2 - endCapH / 2;
    tCap.castShadow = true;
    panMotorBase.add(tCap);

    // 4 Corner hex bolts
    for (let bx = -1; bx <= 1; bx += 2) {
      for (let bz = -1; bz <= 1; bz += 2) {
        const boltGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8);
        const bolt = new THREE.Mesh(boltGeo, steelShaftMat);
        bolt.position.set(bx * (motorW / 2 - 0.012), motorH / 2 + 0.004, bz * (motorW / 2 - 0.012));
        panMotorBase.add(bolt);
      }
    }

    // Pan motor output shaft (steel)
    const panShaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.045, 16);
    const panShaft = new THREE.Mesh(panShaftGeo, steelShaftMat);
    panShaft.position.y = motorH / 2 + 0.022;
    panShaft.castShadow = true;
    panMotorBase.add(panShaft);

    // =========================================================================
    // 2. PAN ROTATION STAGE (Rotates around Y axis)
    // =========================================================================
    this.panStage = new THREE.Group();
    this.panStage.position.y = motorH + 0.015;
    this.group.add(this.panStage);

    // Shaft coupler / collar hub clamping pan shaft to L-bracket
    const panHubGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.025, 16);
    const panHub = new THREE.Mesh(panHubGeo, blackBracketMat);
    panHub.position.y = 0.012;
    panHub.castShadow = true;
    this.panStage.add(panHub);

    // Black Aluminum L-Bracket:
    // Horizontal base flange
    const lBaseGeo = new THREE.BoxGeometry(0.14, 0.01, 0.14);
    const lBase = new THREE.Mesh(lBaseGeo, blackBracketMat);
    lBase.position.set(0, 0.025, 0);
    lBase.castShadow = true;
    this.panStage.add(lBase);

    // Vertical upright flange holding tilt motor
    const lVertGeo = new THREE.BoxGeometry(0.01, 0.16, 0.14);
    const lVert = new THREE.Mesh(lVertGeo, blackBracketMat);
    lVert.position.set(-0.065, 0.105, 0);
    lVert.castShadow = true;
    this.panStage.add(lVert);

    // =========================================================================
    // 3. UPPER TILT STEPPER MOTOR (NEMA-17, Mounted horizontally on L-bracket)
    // =========================================================================
    const tiltMotorGroup = new THREE.Group();
    const tiltCenterY = 0.12;
    tiltMotorGroup.position.set(0.01, tiltCenterY, 0);
    this.panStage.add(tiltMotorGroup);

    // Motor body oriented with horizontal output shaft along +X
    const tMotorBody = new THREE.Group();
    tMotorBody.rotation.z = Math.PI / 2;
    tiltMotorGroup.add(tMotorBody);

    // Rear end-cap
    const tRearCap = new THREE.Mesh(bCapGeo, silverAluMat);
    tRearCap.position.y = -motorH / 2 + endCapH / 2;
    tRearCap.castShadow = true;
    tMotorBody.add(tRearCap);

    // Central black stator
    const tStator = new THREE.Mesh(statorGeo, blackStatorMat);
    tStator.castShadow = true;
    tMotorBody.add(tStator);

    // Front end-cap
    const tFrontCap = new THREE.Mesh(tCapGeo, silverAluMat);
    tFrontCap.position.y = motorH / 2 - endCapH / 2;
    tFrontCap.castShadow = true;
    tMotorBody.add(tFrontCap);

    // White SKU specification sticker on tilt motor ("SKU: 51732" matching photo)
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const labelGeo = new THREE.PlaneGeometry(0.08, 0.045);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 0, motorW / 2 + 0.001);
    tMotorBody.add(label);

    // 4-Pin JST-XH white connector block on top of tilt motor
    const jstGeo = new THREE.BoxGeometry(0.035, 0.016, 0.024);
    const jstBlock = new THREE.Mesh(jstGeo, whiteNylonMat);
    jstBlock.position.set(0, motorW / 2 + 0.008, 0.02);
    tMotorBody.add(jstBlock);

    // 4 Colored wires (Red, Blue, Green, Black)
    wireColors.forEach((col, idx) => {
      const wireMat = new THREE.MeshBasicMaterial({ color: col });
      const wireGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 6);
      wireGeo.rotateX(Math.PI / 4);
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(-0.012 + idx * 0.008, motorW / 2 + 0.025, 0.035);
      tMotorBody.add(wire);
    });

    // Horizontal Tilt output shaft (steel)
    const tiltShaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 16);
    tiltShaftGeo.rotateZ(Math.PI / 2);
    const tiltShaft = new THREE.Mesh(tiltShaftGeo, steelShaftMat);
    tiltShaft.position.set(motorH / 2 + 0.02, 0, 0);
    tiltShaft.castShadow = true;
    tiltMotorGroup.add(tiltShaft);

    // =========================================================================
    // 4. TILT ROTATION STAGE (Pivots about horizontal X axis)
    // =========================================================================
    this.tiltStage = new THREE.Group();
    this.tiltStage.position.set(motorH / 2 + 0.045, tiltCenterY, 0);
    this.panStage.add(this.tiltStage);

    // White 3D-printed / nylon shaft coupler hub (prominent in user's photo)
    const couplerGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.035, 16);
    couplerGeo.rotateZ(Math.PI / 2);
    const coupler = new THREE.Mesh(couplerGeo, whiteNylonMat);
    coupler.castShadow = true;
    this.tiltStage.add(coupler);

    // Set screw on white coupler
    const setScrewGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.008, 8);
    const setScrew = new THREE.Mesh(setScrewGeo, steelShaftMat);
    setScrew.position.set(0, 0.022, 0);
    this.tiltStage.add(setScrew);

    // White mounting arm connecting coupler to webcam
    const camArmGeo = new THREE.BoxGeometry(0.012, 0.065, 0.035);
    const camArm = new THREE.Mesh(camArmGeo, whiteNylonMat);
    camArm.position.set(0.02, 0, 0);
    camArm.castShadow = true;
    this.tiltStage.add(camArm);

    // =========================================================================
    // 5. BLACK CAPSULE WEBCAM (Mounted with white zip-tie straps)
    // Exactly matches the webcam shown in user's prototype photos!
    // =========================================================================
    this.webcamGroup = new THREE.Group();
    this.webcamGroup.position.set(0.04, 0, 0.03);
    this.tiltStage.add(this.webcamGroup);

    // Rounded capsule / lozenge body: 0.22m tall x 0.07m wide x 0.06m deep
    const camH = 0.22;
    const camW = 0.07;
    const camD = 0.06;

    // Central rectangular body
    const camBodyGeo = new THREE.BoxGeometry(camW, camH - camW, camD);
    const camBody = new THREE.Mesh(camBodyGeo, cameraBodyMat);
    camBody.castShadow = true;
    this.webcamGroup.add(camBody);

    // Rounded top cap
    const topCapGeo = new THREE.CylinderGeometry(camW / 2, camW / 2, camD, 24);
    topCapGeo.rotateX(Math.PI / 2);
    const topCap = new THREE.Mesh(topCapGeo, cameraBodyMat);
    topCap.position.y = (camH - camW) / 2;
    topCap.castShadow = true;
    this.webcamGroup.add(topCap);

    // Rounded bottom cap
    const botCap = new THREE.Mesh(topCapGeo, cameraBodyMat);
    botCap.position.y = -(camH - camW) / 2;
    botCap.castShadow = true;
    this.webcamGroup.add(botCap);

    // Optical Lens Bezel (Center front)
    const lensBezelGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.01, 32);
    lensBezelGeo.rotateX(Math.PI / 2);
    const lensBezel = new THREE.Mesh(lensBezelGeo, blackBracketMat);
    lensBezel.position.set(0, 0, camD / 2 + 0.005);
    lensBezel.castShadow = true;
    this.webcamGroup.add(lensBezel);

    // Dark Glass Lens Element
    const lensGlassGeo = new THREE.CircleGeometry(0.019, 32);
    const lensGlass = new THREE.Mesh(lensGlassGeo, opticalLensMat);
    lensGlass.position.set(0, 0, camD / 2 + 0.0105);
    this.webcamGroup.add(lensGlass);

    // White Zip-Tie / Elastic Fastening Straps (faithfully representing the prototype!)
    [-0.042, 0.042].forEach((strapY) => {
      const strapGeo = new THREE.BoxGeometry(camW + 0.006, 0.008, camD + 0.008);
      const strap = new THREE.Mesh(strapGeo, whiteNylonMat);
      strap.position.set(0, strapY, 0);
      strap.castShadow = true;
      this.webcamGroup.add(strap);
    });

    // Black USB Cable extending out of webcam bottom
    const usbCableGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.18, 8);
    usbCableGeo.rotateX(Math.PI / 6);
    const usbCableMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const usbCable = new THREE.Mesh(usbCableGeo, usbCableMat);
    usbCable.position.set(0, -camH / 2 - 0.06, -0.02);
    this.webcamGroup.add(usbCable);

    // Optical sensor origin for POV view
    this.sensorOrigin = new THREE.Object3D();
    this.sensorOrigin.position.set(0, 0, camD / 2 + 0.02);
    this.webcamGroup.add(this.sensorOrigin);

    // High-visibility collimated optical laser beam (clearly visible in 3D)
    const beamLength = 12.0;
    const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, beamLength, 8);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, beamLength / 2);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0x00d0ff,
      transparent: true,
      opacity: 0.75
    });
    this.boresightBeam = new THREE.Mesh(beamGeo, this.beamMat);
    this.sensorOrigin.add(this.boresightBeam);

    // Inner bright laser core
    const coreGeo = new THREE.CylinderGeometry(0.002, 0.002, beamLength, 6);
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.translate(0, 0, beamLength / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.boresightBeam.add(coreMesh);

    this.applyTransform();
  }

  setPanTilt(panRad, tiltRad) {
    // Mechanical and cable-safe limit: Pan clamped to [-180°, +180°] from reference to prevent wire tangling
    this.panAngle = THREE.MathUtils.clamp(panRad, -Math.PI, Math.PI);
    this.tiltAngle = THREE.MathUtils.clamp(tiltRad, this.minTilt, this.maxTilt);
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
    // Returns signed degrees from reference Home datum (0°), strictly within [-180°, +180°]
    return THREE.MathUtils.radToDeg(this.panAngle);
  }

  getTiltDeg() {
    return -THREE.MathUtils.radToDeg(this.tiltAngle);
  }

  getSensorWorldPosition() {
    const worldPos = new THREE.Vector3();
    this.sensorOrigin.getWorldPosition(worldPos);
    return worldPos;
  }

  getBoresightDirection() {
    const dir = new THREE.Vector3(0, 0, 1);
    this.sensorOrigin.getWorldDirection(dir);
    return dir.normalize();
  }

  setBoresightVisible(visible) {
    if (this.boresightBeam) {
      this.boresightBeam.visible = visible;
    }
  }
}
