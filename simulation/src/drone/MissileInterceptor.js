import * as THREE from 'three';

/**
 * MissileInterceptor.js
 * High-Velocity Mini Surface-to-Air Interceptor Missile & Multi-Stage Kinetic Neutralization FX.
 * 
 * Features:
 * - Realistic 3D Mini Interceptor Missile model (tactical carbon/titanium body, ogive radome, canards & delta fins)
 * - Fiery rocket motor plume & expanding smoke trail
 * - Proportional Navigation (PN) guidance law closing in at high velocity (~30 m/s)
 * - Multi-stage kinetic explosion:
 *   1. Blinding initial detonation flash (PointLight)
 *   2. Expanding multi-layer fireball with fiery core
 *   3. Translucent luminous expanding 3D shockwave ring
 *   4. Shattered drone wreckage debris tumbling with gravity and smoke trails
 *   5. Lingering black smoke dissipating in high-altitude wind
 */

export class MissileInterceptor {
  constructor(scene, launchPos, launchDir, targetDrone, onInterceptCallback) {
    this.scene = scene;
    this.targetDrone = targetDrone;
    this.onIntercept = onInterceptCallback;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.position = launchPos.clone();
    this.group.position.copy(this.position);

    // Initial launch velocity along launch direction with slight upward boost
    this.velocity = launchDir.clone().normalize().multiplyScalar(12.0);
    this.speed = 12.0;
    this.maxSpeed = 32.0;
    this.acceleration = 28.0; // m/s^2 rocket motor thrust
    this.turnRate = 9.0;       // Max steering turn rate (rad/s)

    this.isAlive = true;
    this.age = 0;
    this.maxLife = 6.0; // Safety timeout

    this.trailHistory = [];
    this.maxTrail = 35;

    this.buildMissileModel();
    this.buildSmokeTrail();
  }

  buildMissileModel() {
    this.missileMeshGroup = new THREE.Group();
    this.group.add(this.missileMeshGroup);

    // Aerodynamic proportions: 0.58m length, 0.05m diameter
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.35,
      metalness: 0.8
    });

    const radomeMat = new THREE.MeshStandardMaterial({
      color: 0xee2222, // High-visibility tactical red seeker radome
      roughness: 0.2,
      metalness: 0.6
    });

    const finMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.4,
      metalness: 0.9,
      side: THREE.DoubleSide
    });

    const whiteStripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const motorGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // 1. Cylindrical Fuselage
    const bodyGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.42, 16);
    bodyGeo.rotateX(Math.PI / 2); // Orient along +Z
    const body = new THREE.Mesh(bodyGeo, carbonMat);
    body.castShadow = true;
    this.missileMeshGroup.add(body);

    // Hazard identification rings
    [-0.08, 0.08].forEach((zPos) => {
      const ringGeo = new THREE.CylinderGeometry(0.0255, 0.0255, 0.02, 16);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, whiteStripeMat);
      ring.position.z = zPos;
      this.missileMeshGroup.add(ring);
    });

    // 2. Ogive Seeker Radome (Nosecone)
    const noseGeo = new THREE.ConeGeometry(0.025, 0.12, 16);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, radomeMat);
    nose.position.z = 0.21 + 0.06;
    this.missileMeshGroup.add(nose);

    // 3. Four Rear Cruciform Stabilizing Delta Fins
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(0.08, -0.04);
      finShape.lineTo(0.08, -0.14);
      finShape.lineTo(0, -0.12);
      finShape.closePath();

      const finGeo = new THREE.ShapeGeometry(finShape);
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(0, 0, -0.18);
      fin.rotation.z = angle;
      this.missileMeshGroup.add(fin);
    }

    // 4. Four Forward Steering Canards
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const canardShape = new THREE.Shape();
      canardShape.moveTo(0, 0);
      canardShape.lineTo(0.045, -0.02);
      canardShape.lineTo(0.045, -0.06);
      canardShape.lineTo(0, -0.05);
      canardShape.closePath();

      const canardGeo = new THREE.ShapeGeometry(canardShape);
      const canard = new THREE.Mesh(canardGeo, finMat);
      canard.position.set(0, 0, 0.12);
      canard.rotation.z = angle;
      this.missileMeshGroup.add(canard);
    }

    // 5. Rocket Motor Thruster Nozzle & Fiery Exhaust Plume
    const plumeGeo = new THREE.ConeGeometry(0.035, 0.22, 12);
    plumeGeo.rotateX(-Math.PI / 2);
    this.plumeMat = new THREE.MeshBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0.95
    });
    this.plume = new THREE.Mesh(plumeGeo, this.plumeMat);
    this.plume.position.z = -0.21 - 0.11;
    this.missileMeshGroup.add(this.plume);

    // Inner white-hot exhaust core
    const coreGeo = new THREE.ConeGeometry(0.018, 0.15, 8);
    coreGeo.rotateX(-Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.z = -0.21 - 0.075;
    this.missileMeshGroup.add(core);

    // Glowing rocket motor point light
    this.exhaustLight = new THREE.PointLight(0xff6600, 2.5, 6);
    this.exhaustLight.position.z = -0.25;
    this.missileMeshGroup.add(this.exhaustLight);
  }

  buildSmokeTrail() {
    // Dynamic luminous rocket smoke ribbon
    const ribbonMaxPoints = this.maxTrail;
    this.ribbonGeo = new THREE.BufferGeometry();

    const positions = new Float32Array(ribbonMaxPoints * 2 * 3);
    const colors = new Float32Array(ribbonMaxPoints * 2 * 3);
    const indices = [];

    for (let i = 0; i < ribbonMaxPoints - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      indices.push(v0, v1, v2, v2, v1, v3);
    }

    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ribbonGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.ribbonGeo.setIndex(indices);

    this.ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.trailRibbon = new THREE.Mesh(this.ribbonGeo, this.ribbonMat);
    this.scene.add(this.trailRibbon);
  }

  update(deltaTime) {
    if (!this.isAlive) return false;

    this.age += deltaTime;
    if (this.age > this.maxLife) {
      this.destroy();
      return false;
    }

    // Rocket acceleration along velocity vector
    this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * deltaTime);

    // Proportional Navigation Guidance towards Target
    if (this.targetDrone && !this.targetDrone.isNeutralized) {
      const targetPos = this.targetDrone.getPosition();
      const targetVel = this.targetDrone.getVelocity();

      // Lead intercept point prediction
      const distToTarget = this.position.distanceTo(targetPos);
      const timeToImpact = Math.max(0.01, distToTarget / Math.max(this.speed, 10.0));
      const predictedPos = targetPos.clone().addScaledVector(targetVel, Math.min(timeToImpact, 0.4));

      // Steer velocity vector smoothly towards predicted intercept position
      const desiredDir = predictedPos.clone().sub(this.position).normalize();
      const currentDir = this.velocity.clone().normalize();

      const maxTurnThisFrame = this.turnRate * deltaTime;
      const steeredDir = currentDir.clone().lerp(desiredDir, Math.min(1.0, maxTurnThisFrame * 2.5)).normalize();

      this.velocity.copy(steeredDir).multiplyScalar(this.speed);

      // Check for kinetic collision / proximity detonation
      if (distToTarget <= 0.55) {
        this.detonate();
        return false;
      }
    }

    // Update position
    this.position.addScaledVector(this.velocity, deltaTime);
    this.group.position.copy(this.position);

    // Orient missile fuselage along flight velocity
    if (this.velocity.lengthSq() > 0.01) {
      const forward = this.velocity.clone().normalize();
      const lookTarget = this.position.clone().add(forward);
      this.group.lookAt(lookTarget);
    }

    // Rocket plume flicker
    if (this.plume) {
      const flicker = 0.85 + Math.random() * 0.35;
      this.plume.scale.set(flicker, flicker, flicker * (1.0 + Math.random() * 0.3));
      this.exhaustLight.intensity = 2.0 + Math.random() * 1.5;
    }

    // Update Smoke Trail
    this.updateSmokeTrail();

    return true;
  }

  updateSmokeTrail() {
    this.trailHistory.unshift(this.position.clone());
    if (this.trailHistory.length > this.maxTrail) {
      this.trailHistory.pop();
    }

    const count = this.trailHistory.length;
    if (count > 1) {
      const posAttr = this.ribbonGeo.attributes.position;
      const colAttr = this.ribbonGeo.attributes.color;

      const colHead = new THREE.Color(0xff8822); // Orange smoke at exhaust
      const colTail = new THREE.Color(0xdde8f5); // Pale white dissipating smoke
      const tempCol = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const p = this.trailHistory[i];
        // Width expands as smoke billows behind missile
        const width = 0.04 + (i / this.maxTrail) * 0.22;
        const vIdx0 = i * 2;
        const vIdx1 = i * 2 + 1;

        posAttr.setXYZ(vIdx0, p.x, p.y + width, p.z);
        posAttr.setXYZ(vIdx1, p.x, p.y - width, p.z);

        const frac = i / this.maxTrail;
        tempCol.lerpColors(colHead, colTail, frac);

        colAttr.setXYZ(vIdx0, tempCol.r, tempCol.g, tempCol.b);
        colAttr.setXYZ(vIdx1, tempCol.r, tempCol.g, tempCol.b);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      this.ribbonGeo.setDrawRange(0, (count - 1) * 6);
    }
  }

  detonate() {
    this.isAlive = false;

    // Trigger target neutralization callback
    if (this.onIntercept) {
      this.onIntercept(this.position.clone(), this.targetDrone);
    }

    this.destroy();
  }

  destroy() {
    this.isAlive = false;
    this.scene.remove(this.group);
    if (this.trailRibbon) {
      // Fade out and remove trail ribbon after a brief duration
      setTimeout(() => {
        this.scene.remove(this.trailRibbon);
      }, 1200);
    }
  }
}

/**
 * ExplosionFX
 * Spectacular Multi-Stage Kinetic Neutralization Particle System.
 */
export class ExplosionFX {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.age = 0;
    this.lifespan = 2.4;
    this.isAlive = true;

    this.debrisParticles = [];

    this.buildDetonationFlash();
    this.buildFireball();
    this.buildShockwaveRing();
    this.buildDebrisWreckage();
    this.buildSmokeCloud();
  }

  buildDetonationFlash() {
    // Blinding white-hot initial point light flash
    this.flashLight = new THREE.PointLight(0xffeedd, 18.0, 16.0);
    this.group.add(this.flashLight);
  }

  buildFireball() {
    // Expanding inner white-hot core
    const coreGeo = new THREE.SphereGeometry(0.35, 16, 16);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0
    });
    this.coreMesh = new THREE.Mesh(coreGeo, this.coreMat);
    this.group.add(this.coreMesh);

    // Expanding outer fiery fireball
    const fireGeo = new THREE.DodecahedronGeometry(0.55, 2);
    this.fireMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.92
    });
    this.fireMesh = new THREE.Mesh(fireGeo, this.fireMat);
    this.group.add(this.fireMesh);
  }

  buildShockwaveRing() {
    // High-energy luminous 3D shockwave ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.28, 32);
    ringGeo.rotateX(Math.PI / 2);
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    this.shockMesh = new THREE.Mesh(ringGeo, this.shockMat);
    this.group.add(this.shockMesh);
  }

  buildDebrisWreckage() {
    // 14 shattered drone pieces (carbon arm, broken rotor, fuselage chunks)
    const debrisCount = 14;
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x1f242c,
      roughness: 0.4,
      metalness: 0.8,
      flatShading: true
    });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.3,
      metalness: 0.5
    });

    for (let i = 0; i < debrisCount; i++) {
      const isArm = i % 3 === 0;
      let dGeo;
      if (isArm) {
        dGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6);
      } else {
        dGeo = new THREE.BoxGeometry(0.06 + Math.random() * 0.08, 0.03, 0.05 + Math.random() * 0.08);
      }

      const mesh = new THREE.Mesh(dGeo, (i % 4 === 0 ? orangeMat : debrisMat));
      mesh.position.set(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      );
      this.group.add(mesh);

      // Random radial blast velocity
      const blastSpeed = 4.5 + Math.random() * 7.5;
      const blastDir = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.2 + 0.3,
        (Math.random() - 0.5) * 1.5
      ).normalize();

      this.debrisParticles.push({
        mesh,
        velocity: blastDir.multiplyScalar(blastSpeed),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15
        )
      });
    }
  }

  buildSmokeCloud() {
    // 8 expanding dark smoke puffs
    this.smokePuffs = [];
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x22262d,
      transparent: true,
      opacity: 0.65
    });

    for (let i = 0; i < 8; i++) {
      const sGeo = new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.3, 1);
      const sMesh = new THREE.Mesh(sGeo, smokeMat.clone());
      sMesh.position.set(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      );
      this.group.add(sMesh);

      this.smokePuffs.push({
        mesh: sMesh,
        drift: new THREE.Vector3(
          (Math.random() - 0.5) * 0.8 + 0.3, // High altitude wind drift
          0.6 + Math.random() * 0.8,         // Thermal rise
          (Math.random() - 0.5) * 0.8
        ),
        growthRate: 1.8 + Math.random() * 1.2
      });
    }
  }

  update(deltaTime) {
    if (!this.isAlive) return false;

    this.age += deltaTime;
    const progress = this.age / this.lifespan;

    if (progress >= 1.0) {
      this.destroy();
      return false;
    }

    // 1. Initial flash decay
    if (this.flashLight) {
      this.flashLight.intensity = Math.max(0, 18.0 * (1.0 - progress * 4.0));
    }

    // 2. Fireball expansion & fade
    if (this.fireMesh && this.coreMesh) {
      const fireScale = 1.0 + progress * 5.2;
      this.fireMesh.scale.set(fireScale, fireScale, fireScale);
      this.coreMesh.scale.set(fireScale * 0.6, fireScale * 0.6, fireScale * 0.6);

      this.fireMat.opacity = Math.max(0, 0.92 * (1.0 - progress * 2.2));
      this.coreMat.opacity = Math.max(0, 1.0 * (1.0 - progress * 3.5));
    }

    // 3. Shockwave ring expansion
    if (this.shockMesh) {
      const shockScale = 1.0 + progress * 14.0;
      this.shockMesh.scale.set(shockScale, shockScale, shockScale);
      this.shockMat.opacity = Math.max(0, 0.85 * (1.0 - progress * 2.5));
    }

    // 4. Tumbling debris physics (gravity + bounce)
    for (let i = 0; i < this.debrisParticles.length; i++) {
      const d = this.debrisParticles[i];
      // Gravity
      d.velocity.y -= 9.8 * deltaTime;

      d.mesh.position.addScaledVector(d.velocity, deltaTime);
      d.mesh.rotation.x += d.rotSpeed.x * deltaTime;
      d.mesh.rotation.y += d.rotSpeed.y * deltaTime;
      d.mesh.rotation.z += d.rotSpeed.z * deltaTime;

      // Ground collision clamp
      const worldY = this.position.y + d.mesh.position.y;
      if (worldY < 0.05) {
        d.mesh.position.y = 0.05 - this.position.y;
        d.velocity.y = -d.velocity.y * 0.3; // Dampened bounce
        d.velocity.x *= 0.6;
        d.velocity.z *= 0.6;
        d.rotSpeed.multiplyScalar(0.5);
      }
    }

    // 5. Smoke cloud drift & rise
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const s = this.smokePuffs[i];
      s.mesh.position.addScaledVector(s.drift, deltaTime);
      const currentScale = 1.0 + this.age * s.growthRate;
      s.mesh.scale.set(currentScale, currentScale, currentScale);
      s.mesh.material.opacity = Math.max(0, 0.65 * (1.0 - progress));
    }

    return true;
  }

  destroy() {
    this.isAlive = false;
    this.scene.remove(this.group);
  }
}
