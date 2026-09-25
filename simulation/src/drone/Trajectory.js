import * as THREE from 'three';

/**
 * Trajectory.js
 * Visualizes 3D flight path trail behind the drone and real-time vertical
 * altitude drop line with ground target projection.
 */
export class Trajectory {
  constructor(scene, maxPoints = 250) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.history = [];

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.trailVisible = true;
    this.dropLineVisible = true;

    this.buildTrailRenderer();
    this.buildDropLine();
  }

  buildTrailRenderer() {
    this.positions = new Float32Array(this.maxPoints * 3);
    this.colors = new Float32Array(this.maxPoints * 3);

    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      linewidth: 2
    });

    this.trailLine = new THREE.Line(this.trailGeo, trailMat);
    this.group.add(this.trailLine);
  }

  buildDropLine() {
    // Vertical line connecting drone to ground
    const dropGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -10, 0)
    ]);
    const dropMat = new THREE.LineDashedMaterial({
      color: 0x00f0ff,
      dashSize: 3,
      gapSize: 2,
      transparent: true,
      opacity: 0.75
    });
    this.dropLine = new THREE.Line(dropGeo, dropMat);
    this.dropLine.computeLineDistances();
    this.group.add(this.dropLine);

    // Ground target circle marker
    const ringGeo = new THREE.RingGeometry(1.8, 2.4, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    this.groundRing = new THREE.Mesh(ringGeo, ringMat);
    this.group.add(this.groundRing);

    // Inner ground contact point dot
    const dotGeo = new THREE.CircleGeometry(0.6, 16);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xff3355,
      side: THREE.DoubleSide
    });
    this.groundDot = new THREE.Mesh(dotGeo, dotMat);
    this.group.add(this.groundDot);
  }

  update(dronePos, groundY) {
    // 1. Update Trajectory History
    this.history.unshift(dronePos.clone());
    if (this.history.length > this.maxPoints) {
      this.history.pop();
    }

    const count = this.history.length;
    const posAttr = this.trailGeo.attributes.position;
    const colAttr = this.trailGeo.attributes.color;

    const colorNew = new THREE.Color(0x00f0ff); // Neon Cyan (Head)
    const colorOld = new THREE.Color(0x102035); // Dim Navy (Tail)
    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const p = this.history[i];
      posAttr.setXYZ(i, p.x, p.y, p.z);

      const t = i / this.maxPoints; // 0 = newest, 1 = oldest
      tempColor.lerpColors(colorNew, colorOld, Math.pow(t, 0.7));
      colAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
    }

    // Duplicate last point to prevent trailing artifacts
    for (let i = count; i < this.maxPoints; i++) {
      if (count > 0) {
        const last = this.history[count - 1];
        posAttr.setXYZ(i, last.x, last.y, last.z);
        colAttr.setXYZ(i, colorOld.r, colorOld.g, colorOld.b);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.trailGeo.setDrawRange(0, count);

    // 2. Update Altitude Drop Line & Ground Ring
    const groundPos = new THREE.Vector3(dronePos.x, groundY + 0.1, dronePos.z);

    const dropPositions = this.dropLine.geometry.attributes.position;
    dropPositions.setXYZ(0, dronePos.x, dronePos.y, dronePos.z);
    dropPositions.setXYZ(1, groundPos.x, groundPos.y, groundPos.z);
    dropPositions.needsUpdate = true;
    this.dropLine.computeLineDistances();

    this.groundRing.position.copy(groundPos);
    this.groundDot.position.copy(groundPos);

    // Subtle breathing animation on ground ring
    const scale = 1.0 + Math.sin(Date.now() * 0.006) * 0.15;
    this.groundRing.scale.set(scale, 1, scale);
  }

  reset() {
    this.history = [];
    this.trailGeo.setDrawRange(0, 0);
  }

  setTrailVisible(visible) {
    this.trailVisible = visible;
    this.trailLine.visible = visible;
  }

  setDropLineVisible(visible) {
    this.dropLineVisible = visible;
    this.dropLine.visible = visible;
    this.groundRing.visible = visible;
    this.groundDot.visible = visible;
  }
}
