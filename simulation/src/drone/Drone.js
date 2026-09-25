import * as THREE from 'three';

/**
 * Drone.js
 * High-Visibility 3D Drone Digital Twin (Quadcopter).
 * Features:
 * - Carbon-fiber fuselage and 4 tubular arms (0.65m span for crystal-clear 3D visibility)
 * - 4 brushless motors with spinning propellers
 * - Red/Green navigation LEDs and flashing strobe
 * - Dynamic 3D Billboard ID Label ([D01 | Alt]) floating above drone
 * - Aerodynamic banking, pitch, and yaw aligned with flight velocity
 * - High-contrast electric cyan/magenta trajectory ribbon and vertical AGL drop line
 * - Selection highlight ring
 */
export class Drone {
  constructor(scene, id = 'D01') {
    this.scene = scene;
    this.id = id;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.position = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.isSelected = false;
    this.isNeutralized = false;

    this.maxTrailPoints = 90;
    this.trailHistory = [];
    this.propellers = [];

    this.buildDroneModel();
    this.buildBillboardLabel();
    this.buildTrajectoryVisuals();
  }

  buildDroneModel() {
    // Proportions: High-visibility tactical quadcopter (0.82m span)
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.3,
      metalness: 0.7
    });

    // High-visibility tactical safety-orange for motor housings
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.25,
      metalness: 0.8
    });

    const motorBellMat = new THREE.MeshStandardMaterial({
      color: 0x2b323c,
      roughness: 0.2,
      metalness: 0.9
    });

    const propMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.3,
      metalness: 0.2
    });

    const rotorBlurMat = new THREE.MeshBasicMaterial({
      color: 0x334455,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });

    // 1. Central Carbon Fuselage Pod (Sleek tactical body)
    const bodyGeo = new THREE.BoxGeometry(0.24, 0.09, 0.32);
    const body = new THREE.Mesh(bodyGeo, carbonMat);
    body.castShadow = true;
    this.group.add(body);

    // Hazard accent stripe along fuselage
    const stripeGeo = new THREE.BoxGeometry(0.04, 0.092, 0.322);
    const stripe = new THREE.Mesh(stripeGeo, orangeMat);
    this.group.add(stripe);

    // Top GNSS / Avionics Dome
    const domeGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.04, 16);
    const dome = new THREE.Mesh(domeGeo, carbonMat);
    dome.position.y = 0.065;
    this.group.add(dome);

    // Forward FPV Camera Pod (Front Nose)
    const camPodGeo = new THREE.BoxGeometry(0.06, 0.05, 0.06);
    const camPod = new THREE.Mesh(camPodGeo, orangeMat);
    camPod.position.set(0, -0.01, 0.17);
    this.group.add(camPod);

    const lensGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, -0.01, 0.205);
    this.group.add(lens);

    // 2. Four Tubular Carbon Motor Arms (X-Configuration, 0.82m total span)
    const armSpan = 0.82;
    const armAngles = [
      Math.PI / 4,       // Front-Right (Starboard)
      (3 * Math.PI) / 4, // Front-Left (Port)
      (5 * Math.PI) / 4, // Rear-Left
      (7 * Math.PI) / 4  // Rear-Right
    ];

    armAngles.forEach((angle, idx) => {
      const armLength = armSpan / 2;
      const armGeo = new THREE.CylinderGeometry(0.016, 0.016, armLength, 12);
      armGeo.rotateZ(Math.PI / 2);

      const arm = new THREE.Mesh(armGeo, carbonMat);
      arm.position.set(
        Math.sin(angle) * (armLength * 0.5),
        0,
        Math.cos(angle) * (armLength * 0.5)
      );
      arm.rotation.y = angle;
      arm.castShadow = true;
      this.group.add(arm);

      // Brushless Motor Mount & Stator
      const motorX = Math.sin(angle) * armLength;
      const motorZ = Math.cos(angle) * armLength;

      // Orange motor clamp
      const clampGeo = new THREE.BoxGeometry(0.045, 0.035, 0.045);
      const clamp = new THREE.Mesh(clampGeo, orangeMat);
      clamp.position.set(motorX, 0.005, motorZ);
      this.group.add(clamp);

      // Motor Bell
      const mGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.036, 16);
      const motor = new THREE.Mesh(mGeo, motorBellMat);
      motor.position.set(motorX, 0.028, motorZ);
      motor.castShadow = true;
      this.group.add(motor);

      // Spinning Propeller Assembly
      const propGroup = new THREE.Group();
      propGroup.position.set(motorX, 0.052, motorZ);

      // Dual-Blade Propeller (0.30m diameter)
      const bladeGeo = new THREE.BoxGeometry(0.30, 0.006, 0.028);
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.castShadow = true;
      propGroup.add(blade);

      const hubGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 12);
      const hub = new THREE.Mesh(hubGeo, motorBellMat);
      propGroup.add(hub);

      // Translucent spinning rotor blur disc
      const blurGeo = new THREE.CircleGeometry(0.15, 24);
      blurGeo.rotateX(-Math.PI / 2);
      const blurMesh = new THREE.Mesh(blurGeo, rotorBlurMat);
      blurMesh.position.y = 0.002;
      propGroup.add(blurMesh);

      this.group.add(propGroup);
      this.propellers.push({ group: propGroup, dir: idx % 2 === 0 ? 1 : -1 });

      // Bright Navigation LEDs
      // idx 0 (Front-Right): Green | idx 1 (Front-Left): Red | idx 2,3 (Rear): White
      const ledColor = idx === 1 ? 0xff0033 : (idx === 0 ? 0x00ff44 : 0xffffff);
      const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
      const ledGeo = new THREE.SphereGeometry(0.014, 8, 8);
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(motorX, -0.018, motorZ);
      this.group.add(led);
    });

    // 3. Flashing Anti-Collision Strobe on top dome
    this.strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const strobeGeo = new THREE.SphereGeometry(0.016, 8, 8);
    const strobe = new THREE.Mesh(strobeGeo, this.strobeMat);
    strobe.position.set(0, 0.095, 0);
    this.group.add(strobe);

    // 4. Selection Highlight Ring (Pulsing Amber)
    const selectGeo = new THREE.RingGeometry(0.55, 0.64, 32);
    selectGeo.rotateX(-Math.PI / 2);
    this.selectMat = new THREE.MeshBasicMaterial({
      color: 0xff9900,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this.selectionRing = new THREE.Mesh(selectGeo, this.selectMat);
    this.selectionRing.visible = false;
    this.group.add(this.selectionRing);
  }

  buildBillboardLabel() {
    // Sharp 512x128 Canvas Billboard floating above drone
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    this.labelCtx = canvas.getContext('2d');
    this.labelTexture = new THREE.CanvasTexture(canvas);

    const spriteMat = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true
    });
    this.labelSprite = new THREE.Sprite(spriteMat);
    this.labelSprite.position.set(0, 0.52, 0);
    this.labelSprite.scale.set(2.0, 0.50, 1);
    this.group.add(this.labelSprite);

    this.updateLabel(2.5);
  }

  updateLabel(alt) {
    const ctx = this.labelCtx;
    ctx.clearRect(0, 0, 512, 128);

    // High-contrast tactical badge card
    ctx.fillStyle = this.isSelected ? 'rgba(10, 16, 26, 0.92)' : 'rgba(12, 18, 30, 0.88)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 488, 104, 18);
    ctx.fill();

    ctx.strokeStyle = this.isSelected ? '#ffaa00' : '#00d0ff';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Top Header: ID and Tracking Status
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = this.isSelected ? '#ffaa00' : '#00e5ff';
    ctx.textAlign = 'left';
    ctx.fillText(`TARGET: ${this.id}`, 36, 58);

    // Right tag: Threat
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'right';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`HIGH THREAT`, 476, 56);

    // Subtitle: Altitude & Range Info
    ctx.font = '600 28px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`ALT: ${alt.toFixed(1)}m AGL | 10m FMCW`, 36, 96);

    this.labelTexture.needsUpdate = true;
  }

  buildTrajectoryVisuals() {
    // 3D Ribbon Mesh for Trajectory (always thick, visible from all angles without WebGL 1px line limit)
    const maxSegments = this.maxTrailPoints;
    this.ribbonGeo = new THREE.BufferGeometry();
    const ribbonVerts = new Float32Array(maxSegments * 2 * 3);
    const ribbonColors = new Float32Array(maxSegments * 2 * 3);
    const ribbonIndices = [];

    for (let i = 0; i < maxSegments - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      ribbonIndices.push(v0, v1, v2);
      ribbonIndices.push(v2, v1, v3);
    }

    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonVerts, 3));
    this.ribbonGeo.setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3));
    this.ribbonGeo.setIndex(ribbonIndices);

    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this.trailRibbon = new THREE.Mesh(this.ribbonGeo, ribbonMat);
    this.scene.add(this.trailRibbon);

    // Vertical Altitude Drop Line to Ground
    const dropGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -1, 0)
    ]);
    const dropMat = new THREE.LineDashedMaterial({
      color: 0x0066cc,
      dashSize: 0.35,
      gapSize: 0.18,
      linewidth: 2
    });
    this.dropLine = new THREE.Line(dropGeo, dropMat);
    this.scene.add(this.dropLine);

    // Ground Target Shadow Disc on Snow
    const gRingGeo = new THREE.RingGeometry(0.35, 0.46, 32);
    gRingGeo.rotateX(-Math.PI / 2);
    const gRingMat = new THREE.MeshBasicMaterial({
      color: 0x0066cc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.groundRing = new THREE.Mesh(gRingGeo, gRingMat);
    this.scene.add(this.groundRing);
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.prevPosition.copy(this.position);
    this.group.position.copy(this.position);
  }

  setSelected(selected) {
    this.isSelected = selected;
    this.selectionRing.visible = selected;
    this.updateLabel(this.position.y);
  }

  setWindTilt(tiltRad, bearingRad) {
    this.windTiltAngle = tiltRad || 0;
    this.windTiltBearing = bearingRad || 0;
  }

  updateMotion(newPos, deltaTime) {
    if (this.isNeutralized) return;

    this.prevPosition.copy(this.position);
    this.position.copy(newPos);

    if (deltaTime > 0.0001) {
      this.velocity.copy(this.position).sub(this.prevPosition).divideScalar(deltaTime);
      this.speed = this.velocity.length();
    }

    this.group.position.copy(this.position);

    // Orientation: face forward along horizontal velocity
    const horizVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    if (horizVel.lengthSq() > 0.01) {
      const lookTarget = this.position.clone().add(horizVel);
      this.group.lookAt(lookTarget);

      const pitch = THREE.MathUtils.clamp(this.speed * 0.05, 0, 0.35);
      this.group.rotateX(pitch);
    }

    // Realistic aerodynamic wind tilt:
    // When encountering high wind, a multirotor tilts/leans smoothly into the oncoming wind to resist it
    if (this.windTiltAngle && this.windTiltAngle > 0.001) {
      const leanAxis = new THREE.Vector3(
        -Math.cos(this.windTiltBearing),
        0,
        Math.sin(this.windTiltBearing)
      ).normalize();
      this.group.rotateOnWorldAxis(leanAxis, this.windTiltAngle);
    }

    // Spin Propellers
    const propRpm = 65.0;
    this.propellers.forEach((p) => {
      p.group.rotation.y += propRpm * deltaTime * p.dir;
    });

    // Strobe flash
    const flash = (Date.now() % 800) < 80;
    this.strobeMat.color.setHex(flash ? 0xffffff : 0x222222);

    // Pulsate selection ring
    if (this.isSelected) {
      const s = 1.0 + Math.sin(Date.now() * 0.008) * 0.15;
      this.selectionRing.scale.set(s, 1, s);
    }

    // Update floating altitude label
    this.updateLabel(this.position.y);

    // Update Trajectory & Drop Line
    this.updateTrajectoryVisuals();
  }

  updateTrajectoryVisuals() {
    this.trailHistory.unshift(this.position.clone());
    if (this.trailHistory.length > this.maxTrailPoints) {
      this.trailHistory.pop();
    }

    const count = this.trailHistory.length;
    if (count >= 2) {
      const posAttr = this.ribbonGeo.attributes.position;
      const colAttr = this.ribbonGeo.attributes.color;

      const colHead = this.isSelected ? new THREE.Color(0xffaa00) : new THREE.Color(0x00e5ff);
      const colTail = new THREE.Color(0x0044aa);
      const tempCol = new THREE.Color();

      const ribbonHalfHeight = 0.045; // 9cm high luminous ribbon tape

      for (let i = 0; i < count; i++) {
        const p = this.trailHistory[i];
        const vIdx0 = i * 2;
        const vIdx1 = i * 2 + 1;

        posAttr.setXYZ(vIdx0, p.x, p.y + ribbonHalfHeight, p.z);
        posAttr.setXYZ(vIdx1, p.x, p.y - ribbonHalfHeight, p.z);

        const t = i / this.maxTrailPoints;
        tempCol.lerpColors(colHead, colTail, t);

        colAttr.setXYZ(vIdx0, tempCol.r, tempCol.g, tempCol.b);
        colAttr.setXYZ(vIdx1, tempCol.r, tempCol.g, tempCol.b);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      this.ribbonGeo.setDrawRange(0, (count - 1) * 6);
    } else {
      this.ribbonGeo.setDrawRange(0, 0);
    }

    // Drop line
    const dropPositions = this.dropLine.geometry.attributes.position;
    dropPositions.setXYZ(0, this.position.x, this.position.y, this.position.z);
    dropPositions.setXYZ(1, this.position.x, 0.02, this.position.z);
    dropPositions.needsUpdate = true;
    this.dropLine.computeLineDistances();

    this.groundRing.position.set(this.position.x, 0.02, this.position.z);
  }

  getPosition() {
    return this.position.clone();
  }

  getVelocity() {
    return this.velocity.clone();
  }

  getSpeed() {
    return this.speed;
  }

  neutralize() {
    this.isNeutralized = true;
    this.group.visible = false;
    if (this.trailRibbon) this.trailRibbon.visible = false;
    if (this.dropLine) this.dropLine.visible = false;
    if (this.groundRing) this.groundRing.visible = false;
    if (this.selectionRing) this.selectionRing.visible = false;
  }

  resetNeutralization() {
    this.isNeutralized = false;
    this.group.visible = true;
    if (this.trailRibbon) this.trailRibbon.visible = true;
    if (this.dropLine) this.dropLine.visible = true;
    if (this.groundRing) this.groundRing.visible = true;
  }

  destroy() {
    this.scene.remove(this.group);
    this.scene.remove(this.trailRibbon);
    this.scene.remove(this.dropLine);
    this.scene.remove(this.groundRing);
  }
}
