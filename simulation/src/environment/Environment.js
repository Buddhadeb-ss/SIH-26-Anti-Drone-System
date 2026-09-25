import * as THREE from 'three';

/**
 * Environment.js
 * Majestic High-Altitude Ladakh Environment (Pangong / Khardung La Sector, 4,200m MSL).
 * 
 * Features:
 * - Multi-tiered procedural Himalayan mountain ranges (distant snow massifs, craggy mid-range ridges, moraine hills)
 * - Authentic Ladakh plateau terrain: wind-swept snow dunes (sastrugi), exposed dark slate gravel patches, and granite boulders
 * - Defense outpost perimeter assets: lattice communications mast with blinking red aviation beacon, tactical windsock, military power revetments
 * - Atmospheric floating ice crystal particles (glittering in alpine sunlight)
 * - 100% preservation of 10m tactical radar datum rings, cardinal direction lines, and engineering grid
 */
export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.baseAltitudeMSL = 4120;
    this.gridVisible = true;
    this.settlementBuildings = [];

    this.buildLadakhTerrain();
    this.buildWindingHighway();
    this.buildGlacialRiver();
    this.buildValleySettlements();
    this.buildHimalayanMountainMassifs();
    this.buildOutpostPerimeterAssets();
    this.buildAtmosphericIceCrystals();
    this.buildSurfaceSpindrift();
    this.buildSpeedyWindStreaks();
    this.buildHighContrastDatum();
  }

  computeTerrainHeight(x, z) {
    const dist = Math.hypot(x, z);
    if (dist < 3.2) return 0.0;
    if (dist < 4.2) {
      const t = (dist - 3.2) / 1.0;
      return (1.0 - t) * 0.0 + t * this.computeTerrainRaw(x, z);
    }
    return this.computeTerrainRaw(x, z);
  }

  computeTerrainRaw(x, z) {
    // Towards the valley (+Z forward / East)
    if (z > 3.0) {
      const valleyDepth = -5.2;
      const slopeProgress = Math.min(1.0, (z - 3.0) / 6.0);
      const s = slopeProgress * slopeProgress * (3 - 2 * slopeProgress);
      let h = s * valleyDepth;

      // Sastrugi & terrain variations
      h += Math.sin(x * 0.15 + 0.5) * Math.cos(z * 0.12) * 0.45;
      h += Math.sin(x * 0.35 - z * 0.25) * 0.18;

      // River depression
      const zRoad = 13.5 + 2.5 * Math.sin(x * 0.08) - 1.0 * Math.cos(x * 0.16);
      const zRiver = zRoad + 4.5 + 1.8 * Math.sin(x * 0.11 + 0.8);
      const riverDist = Math.abs(z - zRiver);
      if (riverDist < 2.2) {
        h -= (1.0 - riverDist / 2.2) * 0.85;
      }

      // Highway flat road terrace
      const roadDist = Math.abs(z - zRoad);
      if (roadDist < 1.6) {
        h = valleyDepth - 0.05;
      }

      // Side mountain ridges
      if (Math.abs(x) > 22.0) {
        const wallFactor = (Math.abs(x) - 22.0) / 16.0;
        h += Math.min(16.0, wallFactor * wallFactor * 10.0);
      }

      // Far valley wall
      if (z > 34.0) {
        const farFactor = (z - 34.0) / 14.0;
        h += Math.min(24.0, farFactor * farFactor * 16.0);
      }

      return h;
    } else {
      // Behind the machine platform (z <= 3.0): elevated rocky ridge
      const backDist = Math.hypot(x, z);
      let h = 0;
      if (backDist > 3.2) {
        const factor = (backDist - 3.2) / 6.0;
        h = Math.min(14.0, factor * 1.6 + Math.sin(x * 0.15) * 0.6 + Math.cos(z * 0.18) * 0.5);
        if (z < -12.0) {
          h += Math.pow((Math.abs(z) - 12.0) * 0.35, 1.6);
        }
      }
      return h;
    }
  }

  buildLadakhTerrain() {
    // 160m x 160m high-altitude terrain with elevated ridge and deep valley corridor
    const terrainSize = 160;
    const segments = 128;
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const colSnow = new THREE.Color(0xfcfdff);       // Pure crisp high-altitude snow
    const colSnowShadow = new THREE.Color(0xdde8f4); // Shaded snow
    const colSlate = new THREE.Color(0x363e4a);      // Exposed Himalayan slate rock
    const colGravel = new THREE.Color(0x565e6d);     // Moraine gravel

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const h = this.computeTerrainHeight(x, z);
      pos.setY(i, h);

      // Vertex color blending based on slope and height
      const vertCol = new THREE.Color();
      const dist = Math.hypot(x, z);

      if (dist < 3.5) {
        // Outpost snow pad
        vertCol.copy(colSnow);
      } else {
        // Steep slopes reveal dark rock; valley floor has shaded snow
        const isSteepSlope = (z > 3.5 && z < 8.5) || Math.abs(x) > 24;
        if (isSteepSlope) {
          const rockMix = Math.min(1.0, Math.max(0.2, (Math.sin(x * 0.8 + z * 0.5) + 1.0) * 0.5));
          vertCol.lerpColors(colSlate, colGravel, rockMix);
        } else {
          const valleyShade = Math.sin(x * 0.05 + z * 0.05) * 0.15;
          vertCol.lerpColors(colSnow, colSnowShadow, Math.max(0.0, valleyShade + 0.1));
        }
      }
      colors.push(vertCol.r, vertCol.g, vertCol.b);
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const snowMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05
    });

    this.terrainMesh = new THREE.Mesh(geo, snowMat);
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);

    // Natural Himalayan boulders along the ridge edges
    this.buildPlateauBoulders();
  }

  buildWindingHighway() {
    this.highwayGroup = new THREE.Group();
    this.group.add(this.highwayGroup);

    // Paved 2-lane mountain highway (NH1 corridor) running across the valley floor
    const roadWidth = 2.4;
    const steps = 110;
    const xStart = -55;
    const xEnd = 55;
    const stepX = (xEnd - xStart) / steps;

    const roadGeo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    const centerPoints = [];

    for (let i = 0; i <= steps; i++) {
      const x = xStart + i * stepX;
      const zRoad = 13.5 + 2.5 * Math.sin(x * 0.08) - 1.0 * Math.cos(x * 0.16);
      const yRoad = this.computeTerrainHeight(x, zRoad) + 0.04;
      centerPoints.push(new THREE.Vector3(x, yRoad, zRoad));

      // Tangent and normal in X-Z plane
      let dx = stepX;
      let dz = 0;
      if (i < steps) {
        const nextX = x + stepX;
        const nextZ = 13.5 + 2.5 * Math.sin(nextX * 0.08) - 1.0 * Math.cos(nextX * 0.16);
        dx = nextX - x;
        dz = nextZ - zRoad;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;

      const halfW = roadWidth * 0.5;
      const pLeft = new THREE.Vector3(x + nx * halfW, yRoad, zRoad + nz * halfW);
      const pRight = new THREE.Vector3(x - nx * halfW, yRoad, zRoad - nz * halfW);

      positions.push(pLeft.x, pLeft.y, pLeft.z);
      positions.push(pRight.x, pRight.y, pRight.z);

      uvs.push(0, i / steps * 20);
      uvs.push(1, i / steps * 20);

      if (i < steps) {
        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = (i + 1) * 2;
        const v3 = (i + 1) * 2 + 1;
        indices.push(v0, v1, v2);
        indices.push(v2, v1, v3);
      }
    }

    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x22272e, // Dark mountain asphalt
      roughness: 0.9,
      metalness: 0.1
    });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.highwayGroup.add(roadMesh);

    // Dashed yellow centerline along the highway
    const centerGeo = new THREE.BufferGeometry();
    const centerPos = [];
    centerPoints.forEach((pt) => centerPos.push(pt.x, pt.y + 0.015, pt.z));
    centerGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerPos, 3));
    const centerMat = new THREE.LineDashedMaterial({
      color: 0xffbb00,
      dashSize: 0.8,
      gapSize: 0.6,
      linewidth: 2
    });
    const centerLine = new THREE.Line(centerGeo, centerMat);
    centerLine.computeLineDistances();
    this.highwayGroup.add(centerLine);

    // Solid white shoulder line on valley side
    const edgeGeo = new THREE.BufferGeometry();
    const edgePos = [];
    for (let i = 0; i <= steps; i++) {
      const idx = i * 6;
      edgePos.push(positions[idx], positions[idx + 1] + 0.012, positions[idx + 2]);
    }
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    const edgeLine = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee }));
    this.highwayGroup.add(edgeLine);

    // Roadside safety crash barriers / guardrails along steep curves
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x9098a0, metalness: 0.85, roughness: 0.35 });
    for (let i = 0; i < centerPoints.length; i += 3) {
      const pt = centerPoints[i];
      if (pt.x > -40 && pt.x < 40) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), barrierMat);
        post.position.set(pt.x, pt.y + 0.3, pt.z - (roadWidth * 0.5 + 0.15));
        this.highwayGroup.add(post);
      }
    }
  }

  buildGlacialRiver() {
    this.riverGroup = new THREE.Group();
    this.group.add(this.riverGroup);

    // Winding freezing glacial river with icy shelves
    const riverWidth = 3.6;
    const steps = 90;
    const xStart = -52;
    const xEnd = 52;
    const stepX = (xEnd - xStart) / steps;

    const riverGeo = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    for (let i = 0; i <= steps; i++) {
      const x = xStart + i * stepX;
      const zRoad = 13.5 + 2.5 * Math.sin(x * 0.08) - 1.0 * Math.cos(x * 0.16);
      const zRiver = zRoad + 4.5 + 1.8 * Math.sin(x * 0.11 + 0.8);
      const yRiver = this.computeTerrainHeight(x, zRiver) + 0.12;

      let dx = stepX;
      let dz = 0;
      if (i < steps) {
        const nextX = x + stepX;
        const nextZRoad = 13.5 + 2.5 * Math.sin(nextX * 0.08) - 1.0 * Math.cos(nextX * 0.16);
        const nextZRiver = nextZRoad + 4.5 + 1.8 * Math.sin(nextX * 0.11 + 0.8);
        dx = nextX - x;
        dz = nextZRiver - zRiver;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;

      const halfW = riverWidth * 0.5;
      positions.push(x + nx * halfW, yRiver, zRiver + nz * halfW);
      positions.push(x - nx * halfW, yRiver, zRiver - nz * halfW);

      if (i < steps) {
        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = (i + 1) * 2;
        const v3 = (i + 1) * 2 + 1;
        indices.push(v0, v1, v2);
        indices.push(v2, v1, v3);
      }
    }

    riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    riverGeo.setIndex(indices);
    riverGeo.computeVertexNormals();

    // Dark freezing glacier water
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0f2538, // Freezing deep glacial blue
      roughness: 0.18,
      metalness: 0.45,
      transparent: true,
      opacity: 0.92
    });

    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    this.riverGroup.add(riverMesh);

    // Arched concrete/stone highway bridge crossing near x: -4.0
    const bridgeGroup = new THREE.Group();
    const bGeo = new THREE.BoxGeometry(3.2, 0.45, 6.2);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x5a6370, roughness: 0.85 });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    const bridgeY = this.computeTerrainHeight(-4.0, 15.5) + 0.35;
    bMesh.position.set(-4.0, bridgeY, 15.5);
    bridgeGroup.add(bMesh);

    // Bridge side railings
    const rMat = new THREE.MeshStandardMaterial({ color: 0x85929e, metalness: 0.8 });
    const rL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 6.2), rMat);
    rL.position.set(-4.0 + 1.5, bridgeY + 0.35, 15.5);
    bridgeGroup.add(rL);
    const rR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 6.2), rMat);
    rR.position.set(-4.0 - 1.5, bridgeY + 0.35, 15.5);
    bridgeGroup.add(rR);

    this.riverGroup.add(bridgeGroup);
  }

  buildValleySettlements() {
    this.settlementsGroup = new THREE.Group();
    this.group.add(this.settlementsGroup);

    // Architectural materials matching reference photographs
    const wallWhiteMat = new THREE.MeshStandardMaterial({ color: 0xd8dcd6, roughness: 0.8 }); // White-washed mountain plaster
    const wallSlateMat = new THREE.MeshStandardMaterial({ color: 0x47515c, roughness: 0.9 }); // Local Himalayan slate stone
    const wallSandMat = new THREE.MeshStandardMaterial({ color: 0x7a6e60, roughness: 0.85 }); // Mud-brick / sandstone
    const wallOliveMat = new THREE.MeshStandardMaterial({ color: 0x3d493a, roughness: 0.7 }); // Defense facility / barracks

    // Pitched roofs (corrugated red, alpine green, olive tactical, or galvanized silver sheet)
    const roofRedMat = new THREE.MeshStandardMaterial({ color: 0x9e2d2d, roughness: 0.5 });
    const roofGreenMat = new THREE.MeshStandardMaterial({ color: 0x2e5c3e, roughness: 0.55 });
    const roofOliveMat = new THREE.MeshStandardMaterial({ color: 0x3d493a, roughness: 0.6 });
    const roofSilverMat = new THREE.MeshStandardMaterial({ color: 0x8a949e, roughness: 0.45, metalness: 0.3 });
    const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xfcfdff, roughness: 0.75 }); // Thick snow blanket on top

    const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xffba42 }); // Warm alpine interior light

    // 32 Settlement Buildings configured in 3 clusters
    const buildingConfigs = [
      // --- CLUSTER 1: MAIN TOWN / VILLAGE CENTER (x: -7 to +5, z: 11 to 16.5) ---
      { x: -5.5, z: 12.0, w: 2.8, d: 3.2, h: 2.1, rMat: roofRedMat, wMat: wallWhiteMat, name: 'Town Hall' },
      { x: -2.5, z: 11.5, w: 2.4, d: 2.6, h: 1.8, rMat: roofGreenMat, wMat: wallSlateMat, name: 'Residence A' },
      { x: 0.8, z: 11.8, w: 3.2, d: 3.0, h: 2.2, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'General Store' },
      { x: 4.2, z: 12.4, w: 2.6, d: 2.8, h: 1.9, rMat: roofRedMat, wMat: wallSandMat, name: 'Homestead' },
      { x: -6.2, z: 15.5, w: 3.0, d: 3.5, h: 2.0, rMat: roofSilverMat, wMat: wallSlateMat, name: 'Medical Post' },
      { x: -2.8, z: 15.2, w: 2.5, d: 2.8, h: 1.7, rMat: roofRedMat, wMat: wallWhiteMat, name: 'Residence B' },
      { x: 1.2, z: 15.8, w: 2.8, d: 3.2, h: 2.0, rMat: roofGreenMat, wMat: wallWhiteMat, name: 'School Block' },
      { x: 4.5, z: 16.2, w: 2.4, d: 2.5, h: 1.8, rMat: roofSilverMat, wMat: wallSandMat, name: 'Post Office' },
      { x: -4.0, z: 18.2, w: 2.2, d: 2.6, h: 1.6, rMat: roofRedMat, wMat: wallSlateMat, name: 'Cottage 1' },
      { x: 0.0, z: 18.5, w: 2.4, d: 2.4, h: 1.7, rMat: roofGreenMat, wMat: wallWhiteMat, name: 'Cottage 2' },
      { x: 3.2, z: 18.8, w: 2.6, d: 2.8, h: 1.8, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'Community Center' },
      { x: -7.5, z: 13.5, w: 2.1, d: 2.3, h: 1.6, rMat: roofGreenMat, wMat: wallSandMat, name: 'Barn / Storage' },

      // --- CLUSTER 2: ROADSIDE DEFENSE OUTPOST & LOGISTICS HUB (x: +9 to +24, z: 12 to 19) ---
      { x: 9.5, z: 12.8, w: 3.5, d: 4.2, h: 2.4, rMat: roofOliveMat, wMat: wallOliveMat, name: 'HQ Command Post' },
      { x: 14.0, z: 13.2, w: 3.8, d: 2.8, h: 2.0, rMat: roofSilverMat, wMat: wallOliveMat, name: 'Barracks Alpha' },
      { x: 18.5, z: 13.6, w: 3.8, d: 2.8, h: 2.0, rMat: roofSilverMat, wMat: wallOliveMat, name: 'Barracks Bravo' },
      { x: 22.5, z: 14.2, w: 3.2, d: 3.0, h: 1.9, rMat: roofOliveMat, wMat: wallSlateMat, name: 'Fuel Revetment' },
      { x: 11.2, z: 16.5, w: 3.0, d: 3.6, h: 2.2, rMat: roofRedMat, wMat: wallWhiteMat, name: 'Logistics Depot' },
      { x: 15.8, z: 16.8, w: 2.8, d: 3.2, h: 2.1, rMat: roofGreenMat, wMat: wallOliveMat, name: 'Vehicle Shelter' },
      { x: 20.2, z: 17.2, w: 2.5, d: 2.8, h: 1.8, rMat: roofSilverMat, wMat: wallSlateMat, name: 'Supply Warehouse' },
      { x: 13.5, z: 19.5, w: 2.4, d: 2.6, h: 1.7, rMat: roofOliveMat, wMat: wallOliveMat, name: 'Checkpoint Bunker' },
      { x: 17.5, z: 19.8, w: 2.6, d: 2.5, h: 1.8, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'Radio Relay Annex' },
      { x: 23.5, z: 17.5, w: 2.2, d: 2.4, h: 1.6, rMat: roofGreenMat, wMat: wallSandMat, name: 'Guard Post' },

      // --- CLUSTER 3: RIVERSIDE SETTLEMENT & CHECKPOINT (x: -28 to -11, z: 14 to 21) ---
      { x: -12.5, z: 14.5, w: 2.8, d: 3.0, h: 2.0, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'Riverside Mill' },
      { x: -16.5, z: 14.8, w: 2.6, d: 2.8, h: 1.9, rMat: roofRedMat, wMat: wallSlateMat, name: 'Riverside Lodge' },
      { x: -20.5, z: 15.2, w: 3.0, d: 3.2, h: 2.1, rMat: roofGreenMat, wMat: wallSandMat, name: 'Farmstead' },
      { x: -25.0, z: 15.8, w: 2.5, d: 2.6, h: 1.8, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'Outlying Cottage' },
      { x: -14.2, z: 17.8, w: 2.6, d: 3.2, h: 1.9, rMat: roofGreenMat, wMat: wallSlateMat, name: 'Stone Stable' },
      { x: -18.2, z: 18.2, w: 2.8, d: 2.8, h: 1.8, rMat: roofRedMat, wMat: wallWhiteMat, name: 'Valley Homestead' },
      { x: -22.5, z: 18.6, w: 2.4, d: 2.5, h: 1.7, rMat: roofSilverMat, wMat: wallSandMat, name: 'Storage Shed' },
      { x: -26.5, z: 19.2, w: 2.2, d: 2.4, h: 1.6, rMat: roofRedMat, wMat: wallSlateMat, name: 'Riverside Hut' },
      { x: -11.0, z: 17.5, w: 2.2, d: 2.4, h: 1.7, rMat: roofSilverMat, wMat: wallWhiteMat, name: 'Bridge Sentry' },
      { x: -15.5, z: 20.8, w: 2.5, d: 2.6, h: 1.8, rMat: roofGreenMat, wMat: wallWhiteMat, name: 'Riverside Annex' }
    ];

    buildingConfigs.forEach((cfg, idx) => {
      const bldgGroup = new THREE.Group();
      const groundY = this.computeTerrainHeight(cfg.x, cfg.z);
      bldgGroup.position.set(cfg.x, groundY, cfg.z);

      // 1. Building base walls
      const wallGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
      const wallMesh = new THREE.Mesh(wallGeo, cfg.wMat);
      wallMesh.position.y = cfg.h * 0.5;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      bldgGroup.add(wallMesh);

      // 2. Pitched gabled roof
      const roofH = cfg.h * 0.48;
      const roofGeo = new THREE.ConeGeometry(Math.max(cfg.w, cfg.d) * 0.72, roofH, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeo, cfg.rMat);
      roofMesh.position.y = cfg.h + roofH * 0.5;
      roofMesh.scale.set(cfg.w / Math.max(cfg.w, cfg.d) * 1.08, 1.0, cfg.d / Math.max(cfg.w, cfg.d) * 1.08);
      roofMesh.castShadow = true;
      bldgGroup.add(roofMesh);

      // 3. Thick snow cap on top of pitched roof
      const snowCapGeo = new THREE.ConeGeometry(Math.max(cfg.w, cfg.d) * 0.73, roofH * 0.45, 4);
      snowCapGeo.rotateY(Math.PI / 4);
      const snowCapMesh = new THREE.Mesh(snowCapGeo, snowRoofMat);
      snowCapMesh.position.y = cfg.h + roofH * 0.78;
      snowCapMesh.scale.set(cfg.w / Math.max(cfg.w, cfg.d) * 1.09, 1.0, cfg.d / Math.max(cfg.w, cfg.d) * 1.09);
      bldgGroup.add(snowCapMesh);

      // 4. Windows with warm glow
      const winGeo = new THREE.PlaneGeometry(0.35, 0.4);
      const win1 = new THREE.Mesh(winGeo, windowGlowMat);
      win1.position.set(cfg.w * 0.25, cfg.h * 0.55, cfg.d * 0.5 + 0.01);
      bldgGroup.add(win1);

      const win2 = new THREE.Mesh(winGeo, windowGlowMat);
      win2.position.set(-cfg.w * 0.25, cfg.h * 0.55, cfg.d * 0.5 + 0.01);
      bldgGroup.add(win2);

      // 5. Chimney on select buildings
      if (idx % 2 === 0) {
        const chimGeo = new THREE.BoxGeometry(0.25, 0.65, 0.25);
        const chimMesh = new THREE.Mesh(chimGeo, wallSlateMat);
        chimMesh.position.set(cfg.w * 0.3, cfg.h + roofH * 0.6, 0);
        bldgGroup.add(chimMesh);
      }

      this.settlementsGroup.add(bldgGroup);

      // Store building centroid for drone proximity threat analysis
      this.settlementBuildings.push({
        id: `BLD_${idx + 1}`,
        name: cfg.name,
        position: new THREE.Vector3(cfg.x, groundY + cfg.h * 0.5, cfg.z),
        radius: Math.max(cfg.w, cfg.d) * 0.65
      });
    });

    // Parked snow-dusted transport utility vehicles along village road
    const vehicleMat = new THREE.MeshStandardMaterial({ color: 0x3a483a, roughness: 0.6 });
    const vConfigs = [
      { x: -1.0, z: 13.8 },
      { x: 6.5, z: 13.2 },
      { x: 12.0, z: 14.5 }
    ];
    vConfigs.forEach((vc) => {
      const vGroup = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 3.2), vehicleMat);
      body.position.y = 0.5;
      vGroup.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 1.4), wallSlateMat);
      cab.position.set(0, 1.1, 0.4);
      vGroup.add(cab);
      const snowTop = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 1.42), snowRoofMat);
      snowTop.position.set(0, 1.45, 0.4);
      vGroup.add(snowTop);

      const vy = this.computeTerrainHeight(vc.x, vc.z);
      vGroup.position.set(vc.x, vy, vc.z);
      vGroup.rotation.y = 0.35;
      this.settlementsGroup.add(vGroup);
    });
  }

  getSettlementLocations() {
    return this.settlementBuildings.map((b) => b.position);
  }

  buildPlateauBoulders() {
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x3d4653,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true
    });
    const snowCapMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      flatShading: true
    });

    // Scattered natural Himalayan slate boulders along ridge rim and valley flanks
    const boulderConfigs = [
      { x: 14.5, z: 6.2, s: 1.8, h: 1.2 },
      { x: -15.0, z: 5.5, s: 2.2, h: 1.5 },
      { x: -12.5, z: -8.0, s: 2.0, h: 1.3 },
      { x: 16.0, z: -9.2, s: 2.4, h: 1.6 },
      { x: 21.0, z: 8.0, s: 1.6, h: 1.0 },
      { x: -22.0, z: 7.0, s: 2.8, h: 1.9 },
      { x: 7.0, z: 24.0, s: 1.9, h: 1.3 },
      { x: -8.0, z: 25.0, s: 2.5, h: 1.7 }
    ];

    boulderConfigs.forEach(({ x, z, s, h }) => {
      const g = new THREE.Group();
      const bGeo = new THREE.DodecahedronGeometry(s, 1);
      const bMesh = new THREE.Mesh(bGeo, boulderMat);
      bMesh.scale.set(1.1, h / s, 0.9);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      g.add(bMesh);

      // Snow cap on top of boulder
      const cGeo = new THREE.ConeGeometry(s * 0.9, 0.45 * h, 6);
      const cMesh = new THREE.Mesh(cGeo, snowCapMat);
      cMesh.position.y = (h / s) * s * 0.7;
      g.add(cMesh);

      const groundY = this.computeTerrainHeight(x, z);
      g.position.set(x, groundY + (h * 0.35), z);
      g.rotation.y = Math.sin(x) * 3.0;
      this.group.add(g);
    });
  }

  buildHimalayanMountainMassifs() {
    const mtnGroup = new THREE.Group();
    this.group.add(mtnGroup);

    const snowMassifMat = new THREE.MeshStandardMaterial({
      color: 0xfcfdff,
      roughness: 0.72,
      metalness: 0.05,
      flatShading: true
    });

    const darkRockMat = new THREE.MeshStandardMaterial({
      color: 0x222a36, // Deep Himalayan granite/slate rock
      roughness: 0.95,
      flatShading: true
    });

    const glacierMat = new THREE.MeshStandardMaterial({
      color: 0xd6e8f8, // Icy glacier blue-white
      roughness: 0.55,
      metalness: 0.15,
      flatShading: true
    });

    // --- TIER 1: DISTANT HIMALAYAN MASSIF (Radius 210m - 270m, Heights 55m - 105m) ---
    const farCount = 28;
    const farRadius = 230;
    for (let i = 0; i < farCount; i++) {
      const angle = (i / farCount) * Math.PI * 2;
      const r = farRadius + Math.sin(i * 3.2) * 25;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const peakHeight = 65 + Math.sin(i * 1.7) * 28 + Math.cos(i * 3.5) * 16;
      const baseWidth = 55 + (i % 4) * 10;

      // Base craggy mountain body (steep facets)
      const baseGeo = new THREE.ConeGeometry(baseWidth, peakHeight, 6);
      const pos = baseGeo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const py = pos.getY(j);
        if (py < peakHeight * 0.4) {
          // Asymmetrical ridge noise
          pos.setX(j, pos.getX(j) * (1.0 + Math.sin(j * 1.5) * 0.25));
          pos.setZ(j, pos.getZ(j) * (1.0 + Math.cos(j * 2.0) * 0.25));
        }
      }
      baseGeo.computeVertexNormals();

      const mtnBase = new THREE.Mesh(baseGeo, darkRockMat);
      mtnBase.position.set(x, peakHeight / 2 - 5, z);
      mtnBase.rotation.y = i * 0.73;
      mtnGroup.add(mtnBase);

      // Towering jagged snow crown & glaciers
      const snowH = peakHeight * 0.68;
      const snowGeo = new THREE.ConeGeometry(baseWidth * 0.62, snowH, 6);
      const snowMesh = new THREE.Mesh(snowGeo, snowMassifMat);
      snowMesh.position.set(x, peakHeight - snowH / 2 - 5, z);
      snowMesh.rotation.y = i * 0.73;
      mtnGroup.add(snowMesh);
    }

    // --- TIER 2: MID-RANGE SHARP CRAGS & RIDGES (Radius 120m - 165m, Heights 30m - 52m) ---
    const midCount = 22;
    const midRadius = 140;
    for (let i = 0; i < midCount; i++) {
      const angle = ((i + 0.5) / midCount) * Math.PI * 2;
      const r = midRadius + Math.sin(i * 2.5) * 18;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const peakH = 34 + Math.sin(i * 2.1) * 16;
      const baseW = 32 + (i % 3) * 6;

      const ridgeGeo = new THREE.ConeGeometry(baseW, peakH, 5);
      const ridgeMesh = new THREE.Mesh(ridgeGeo, darkRockMat);
      ridgeMesh.position.set(x, peakH / 2 - 3, z);
      ridgeMesh.rotation.y = i * 0.9;
      mtnGroup.add(ridgeMesh);

      // Mid-level snow & glacier tongues
      const capH = peakH * 0.58;
      const capGeo = new THREE.ConeGeometry(baseW * 0.55, capH, 5);
      const capMesh = new THREE.Mesh(capGeo, glacierMat);
      capMesh.position.set(x, peakH - capH / 2 - 3, z);
      capMesh.rotation.y = i * 0.9;
      mtnGroup.add(capMesh);
    }

    // --- TIER 3: FOREGROUND MORAINE HILLS (Radius 55m - 85m, Heights 10m - 20m) ---
    const nearCount = 14;
    const nearRadius = 70;
    for (let i = 0; i < nearCount; i++) {
      const angle = (i / nearCount) * Math.PI * 2;
      const r = nearRadius + Math.sin(i * 3.0) * 12;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const hillH = 12 + Math.sin(i * 1.9) * 7;
      const hillW = 24 + (i % 3) * 5;

      const hillGeo = new THREE.ConeGeometry(hillW, hillH, 7);
      const hillMesh = new THREE.Mesh(hillGeo, snowMassifMat);
      hillMesh.position.set(x, hillH / 2 - 2, z);
      hillMesh.rotation.y = i * 0.4;
      mtnGroup.add(hillMesh);
    }
  }

  buildOutpostPerimeterAssets() {
    this.outpostGroup = new THREE.Group();
    this.group.add(this.outpostGroup);

    // =========================================================================
    // 1. TACTICAL COMMUNICATIONS & RELAY MAST (Height 9.5m, at x: 13.0, z: -9.5)
    // =========================================================================
    const mastPos = new THREE.Vector3(13.0, this.getTerrainHeightAt(13.0, -9.5), -9.5);
    const mastGroup = new THREE.Group();
    mastGroup.position.copy(mastPos);

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3d444d, roughness: 0.4, metalness: 0.8 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.5 });
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x475542, roughness: 0.6 });

    // Concrete base foundation
    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.35, 8);
    const baseMesh = new THREE.Mesh(baseGeo, whiteMat);
    baseMesh.position.y = 0.175;
    mastGroup.add(baseMesh);

    // Lattice Steel Mast
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.12, 9.2, 6);
    const mastMesh = new THREE.Mesh(mastGeo, steelMat);
    mastMesh.position.y = 4.6 + 0.35;
    mastGroup.add(mastMesh);

    // Cross arms & microwave parabolic dish
    const dishGeo = new THREE.SphereGeometry(0.55, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.35);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, side: THREE.DoubleSide });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.position.set(0.1, 7.8, 0);
    dishMesh.rotation.x = Math.PI * 0.4;
    dishMesh.rotation.y = -Math.PI * 0.25;
    mastGroup.add(dishMesh);

    // Blinking Red Aviation Obstacle Beacon
    const beaconGeo = new THREE.SphereGeometry(0.12, 8, 8);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
    this.beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMat);
    this.beaconMesh.position.set(0, 9.6, 0);
    mastGroup.add(this.beaconMesh);

    // PointLight for beacon pulse
    this.beaconLight = new THREE.PointLight(0xff1122, 1.2, 12);
    this.beaconLight.position.set(0, 9.6, 0);
    mastGroup.add(this.beaconLight);

    this.outpostGroup.add(mastGroup);

    // =========================================================================
    // 2. METEOROLOGICAL MAST & HIGH-ALTITUDE WINDSOCK (at x: -12.5, z: 10.5)
    // =========================================================================
    const wsPos = new THREE.Vector3(-12.5, this.getTerrainHeightAt(-12.5, 10.5), 10.5);
    const wsGroup = new THREE.Group();
    wsGroup.position.copy(wsPos);

    // Pole (height 4.5m)
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 4.5, 8);
    const poleMesh = new THREE.Mesh(poleGeo, steelMat);
    poleMesh.position.y = 2.25;
    wsGroup.add(poleMesh);

    // Orange/white windsock cone
    const sockGeo = new THREE.ConeGeometry(0.24, 1.2, 10, 1, true);
    sockGeo.rotateZ(Math.PI / 2);
    const sockMat = new THREE.MeshStandardMaterial({
      color: 0xff5500, // Tactical safety orange
      side: THREE.DoubleSide,
      roughness: 0.6
    });
    this.windsockMesh = new THREE.Mesh(sockGeo, sockMat);
    this.windsockMesh.position.set(0.65, 4.4, 0);
    wsGroup.add(this.windsockMesh);

    this.outpostGroup.add(wsGroup);

    // =========================================================================
    // 3. TACTICAL BATTERY / POWER REVETMENT MODULES (at x: -14.0, z: -8.0)
    // =========================================================================
    const revPos = new THREE.Vector3(-14.0, this.getTerrainHeightAt(-14.0, -8.0), -8.0);
    const revGroup = new THREE.Group();
    revGroup.position.copy(revPos);

    // Modular Container 1 (Power Unit)
    const cont1Geo = new THREE.BoxGeometry(2.4, 1.4, 1.2);
    const cont1 = new THREE.Mesh(cont1Geo, oliveMat);
    cont1.position.set(0, 0.7, 0);
    cont1.castShadow = true;
    revGroup.add(cont1);

    // Container 2 (Storage)
    const cont2Geo = new THREE.BoxGeometry(1.6, 1.1, 1.0);
    const cont2 = new THREE.Mesh(cont2Geo, whiteMat);
    cont2.position.set(1.4, 0.55, 1.1);
    cont2.rotation.y = 0.25;
    cont2.castShadow = true;
    revGroup.add(cont2);

    this.outpostGroup.add(revGroup);
  }

  buildAtmosphericIceCrystals() {
    // 1,200 airborne high-speed snow flurry & ice crystal particles
    const particleCount = 1200;
    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const speedArray = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      posArray[i * 3 + 0] = (Math.random() - 0.5) * 72;
      posArray[i * 3 + 1] = Math.random() * 16 + 0.3;
      posArray[i * 3 + 2] = (Math.random() - 0.5) * 72;
      speedArray[i] = 0.75 + Math.random() * 0.85;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    this.crystalSpeeds = speedArray;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(225, 242, 255, 0.85)');
    grad.addColorStop(1, 'rgba(195, 225, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: tex,
      transparent: true,
      opacity: 0.70,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.icePoints = new THREE.Points(geo, mat);
    this.group.add(this.icePoints);
  }

  buildSurfaceSpindrift() {
    // 600 ground-skimming blowing snow spindrift particles that sweep across the terrain horizontally
    const spindriftCount = 600;
    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(spindriftCount * 3);
    const speedArray = new Float32Array(spindriftCount);

    for (let i = 0; i < spindriftCount; i++) {
      posArray[i * 3 + 0] = (Math.random() - 0.5) * 70;
      posArray[i * 3 + 1] = Math.random() * 1.1 + 0.06;
      posArray[i * 3 + 2] = (Math.random() - 0.5) * 70;
      speedArray[i] = 0.9 + Math.random() * 0.9;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    this.spindriftSpeeds = speedArray;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 8, 2, 16, 8, 14);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.5, 'rgba(220, 240, 255, 0.55)');
    grad.addColorStop(1, 'rgba(200, 230, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 16);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      size: 0.28,
      map: tex,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.spindriftPoints = new THREE.Points(geo, mat);
    this.group.add(this.spindriftPoints);
  }

  buildSpeedyWindStreaks() {
    // 400 high-speed aerodynamic wind streaks (motion-blurred speed lines rushing past)
    const count = 400;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 2 * 3);
    const streakLengths = new Float32Array(count);
    const streakSpeeds = new Float32Array(count);
    this.streakCenters = [];

    for (let i = 0; i < count; i++) {
      const cx = (Math.random() - 0.5) * 80;
      const cy = Math.random() * 15 + 0.3;
      const cz = (Math.random() - 0.5) * 80;
      this.streakCenters.push({ x: cx, y: cy, z: cz });
      streakLengths[i] = 1.8 + Math.random() * 2.4; // 1.8m to 4.2m long speed lines
      streakSpeeds[i] = 0.9 + Math.random() * 0.8;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.streakLengths = streakLengths;
    this.streakSpeeds = streakSpeeds;

    const mat = new THREE.LineBasicMaterial({
      color: 0xecf8ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.windStreakLines = new THREE.LineSegments(geo, mat);
    this.group.add(this.windStreakLines);
  }

  buildHighContrastDatum() {
    this.datumGroup = new THREE.Group();
    this.group.add(this.datumGroup);

    // 1. Fine engineering grid on snow surface (refined slate-blue grid lines) spanning 44m across 20m radar radius
    const gridHelper = new THREE.GridHelper(44, 44, 0x0088dd, 0xc8daf0);
    gridHelper.position.y = 0.006;
    this.datumGroup.add(gridHelper);

    // 2. High-Contrast Concentric Range Rings (5.0m, 10.0m, 15.0m, 20.0m)
    const ranges = [
      { r: 5.0, label: '5.0m' },
      { r: 10.0, label: '10.0m' },
      { r: 15.0, label: '15.0m' },
      { r: 20.0, label: '20.0m [RADAR DOMAIN]' }
    ];

    ranges.forEach(({ r, label }) => {
      const ringGeo = new THREE.BufferGeometry();
      const points = [];
      const segs = 140;
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * r, 0.014, Math.sin(theta) * r));
      }
      ringGeo.setFromPoints(points);

      const isMax = r === 20.0;
      const ringMat = new THREE.LineBasicMaterial({
        color: isMax ? 0x0055bb : 0x0088ee,
        linewidth: 2
      });
      const ring = new THREE.Line(ringGeo, ringMat);
      this.datumGroup.add(ring);

      // 3D Distance Label placed on the ring along +Z
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isMax ? 'rgba(0, 68, 153, 0.92)' : 'rgba(15, 25, 40, 0.88)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 10);
      ctx.fill();
      ctx.strokeStyle = isMax ? '#00e5a3' : '#00aaff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(label, 128, 40);

      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 0.20, r);
      sprite.scale.set(isMax ? 1.4 : 1.0, 0.28, 1);
      this.datumGroup.add(sprite);
    });

    // 3. Cardinal Direction Lines & Markers
    // +Z is Forward / North (matching RADAR A)
    const cardinalDirs = [
      { name: 'N', dir: new THREE.Vector3(0, 0, 1), color: 0xee2233 }, // High-Contrast Red North (+Z)
      { name: 'E', dir: new THREE.Vector3(1, 0, 0), color: 0x0077dd },
      { name: 'S', dir: new THREE.Vector3(0, 0, -1), color: 0x336699 },
      { name: 'W', dir: new THREE.Vector3(-1, 0, 0), color: 0x0077dd }
    ];

    cardinalDirs.forEach(({ dir, color }) => {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.016, 0),
        dir.clone().multiplyScalar(21.0).setY(0.016)
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.5,
        gapSize: 0.25
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      this.datumGroup.add(line);

      // Boundary cone marker
      const markerGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
      markerGeo.rotateX(Math.PI / 2);
      const markerMat = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(dir.clone().multiplyScalar(20.5)).setY(0.05);
      marker.lookAt(dir.clone().multiplyScalar(22.5).setY(0.05));
      this.datumGroup.add(marker);
    });
  }

  update(deltaTime, elapsedTime, windSpeed = 2.5, windBearingDeg = 45, isHighWind = false) {
    // 1. Blinking red obstacle beacon on communications mast
    if (this.beaconLight && this.beaconMat) {
      const blink = (Math.sin(elapsedTime * 4.0) > 0.3) ? 1.0 : 0.05;
      this.beaconLight.intensity = blink * 1.5;
      this.beaconMat.color.setHex(blink > 0.5 ? 0xff1122 : 0x440008);
    }

    // 2. Windsock rotation and flutter scaling with dynamic wind speed
    const isBlizzard = Boolean(isHighWind);
    if (this.windsockMesh) {
      const bearingRad = THREE.MathUtils.degToRad(windBearingDeg);
      const flutterFreq = isBlizzard ? 16.0 : 3.0;
      const flutter = Math.sin(elapsedTime * flutterFreq) * (isBlizzard ? 0.24 : 0.04);
      // Droop angle: near 0.68 when calm, stretches horizontal (0.02) under high wind
      const droop = isBlizzard ? 0.02 : 0.68;
      this.windsockMesh.rotation.y = bearingRad + Math.PI * 0.5 + Math.sin(elapsedTime * 1.2) * (isBlizzard ? 0.03 : 0.08);
      this.windsockMesh.rotation.z = droop + flutter;
    }

    const bearingRad = THREE.MathUtils.degToRad(windBearingDeg);
    const windDirX = Math.sin(bearingRad);
    const windDirZ = Math.cos(bearingRad);

    // 3. High-Speed Air & Snow Blizzard Particle Simulation
    if (this.icePoints) {
      const pos = this.icePoints.geometry.attributes.position;
      const count = pos.count;

      // When High Wind is toggled on, velocity increases to an extreme 55 - 70 m/s horizontal blizzard!
      // When High Wind is off, gentle mountain snowfall at 1.0 m/s
      const horizontalSpeed = isBlizzard ? (52.0 + (windSpeed || 26.0) * 0.6) : 1.2;
      const verticalSinkRate = isBlizzard ? (1.8 + Math.sin(elapsedTime * 6.0) * 0.8) : 0.65;

      // Dynamically adjust material for blizzard conditions (elongate and brighten)
      if (this.icePoints.material) {
        this.icePoints.material.size = isBlizzard ? 0.40 : 0.18;
        this.icePoints.material.opacity = isBlizzard ? 0.95 : 0.55;
      }

      for (let i = 0; i < count; i++) {
        const indSpeed = this.crystalSpeeds[i];
        const swirlNoise = isBlizzard ? (Math.sin(elapsedTime * 8.0 + i * 0.8) * 2.8) : (Math.sin(elapsedTime * 1.2 + i) * 0.15);

        let px = pos.getX(i) + deltaTime * indSpeed * (windDirX * horizontalSpeed + Math.cos(bearingRad) * swirlNoise);
        let py = pos.getY(i) - deltaTime * indSpeed * verticalSinkRate;
        let pz = pos.getZ(i) + deltaTime * indSpeed * (windDirZ * horizontalSpeed - Math.sin(bearingRad) * swirlNoise);

        // Wrap around boundaries
        if (px > 36) px = -36;
        if (px < -36) px = 36;
        if (py < 0.2) py = 16;
        if (pz > 36) pz = -36;
        if (pz < -36) pz = 36;

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;
    }

    // 4. Surface Spindrift (Ground-skimming blizzard drifts across snow at high velocity)
    if (this.spindriftPoints) {
      const pos = this.spindriftPoints.geometry.attributes.position;
      const count = pos.count;
      const spindriftSpeed = isBlizzard ? (50.0 + (windSpeed || 26.0) * 0.6) : 0.5;

      if (this.spindriftPoints.material) {
        this.spindriftPoints.material.opacity = isBlizzard ? 0.88 : 0.04;
      }

      for (let i = 0; i < count; i++) {
        const indSpeed = this.spindriftSpeeds[i];
        let px = pos.getX(i) + deltaTime * indSpeed * windDirX * spindriftSpeed;
        let py = pos.getY(i) + (Math.sin(elapsedTime * 8.0 + i) * 0.015);
        let pz = pos.getZ(i) + deltaTime * indSpeed * windDirZ * spindriftSpeed;

        if (px > 35) px = -35;
        if (px < -35) px = 35;
        if (py < 0.04 || py > 1.4) py = 0.08 + Math.random() * 0.9;
        if (pz > 35) pz = -35;
        if (pz < -35) pz = 35;

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;
    }

    // 5. Speedy Aerodynamic Wind Streaks (Speed lines rushing across the scene)
    if (this.windStreakLines) {
      this.windStreakLines.visible = isBlizzard;
      this.windStreakLines.material.opacity = isBlizzard ? 0.92 : 0.0;

      if (isBlizzard) {
        const posAttr = this.windStreakLines.geometry.attributes.position;
        const count = this.streakLengths.length;
        // High-speed rushing velocity: 68 - 85 m/s!
        const velocity = 65.0 + (windSpeed || 26.0) * 0.6;

        for (let i = 0; i < count; i++) {
          const center = this.streakCenters[i];
          const spd = this.streakSpeeds[i];
          const halfL = this.streakLengths[i] * 0.8;

          // Advance center along wind vector at high speed
          center.x += deltaTime * spd * velocity * windDirX;
          center.y -= deltaTime * spd * 0.8;
          center.z += deltaTime * spd * velocity * windDirZ;

          // Wrap around boundaries
          if (center.x > 38) center.x = -38;
          if (center.x < -38) center.x = 38;
          if (center.y < 0.2) center.y = 15.0;
          if (center.z > 38) center.z = -38;
          if (center.z < -38) center.z = 38;

          // Compute head and tail of the speed line aligned with the wind vector
          const hx = center.x + windDirX * halfL;
          const hy = center.y;
          const hz = center.z + windDirZ * halfL;

          const tx = center.x - windDirX * halfL;
          const ty = center.y;
          const tz = center.z - windDirZ * halfL;

          posAttr.setXYZ(i * 2 + 0, tx, ty, tz);
          posAttr.setXYZ(i * 2 + 1, hx, hy, hz);
        }
        posAttr.needsUpdate = true;
      }
    }
  }

  getTerrainHeightAt(x, z) {
    return this.computeTerrainHeight(x, z);
  }

  setGridVisible(visible) {
    this.gridVisible = visible;
    this.datumGroup.visible = visible;
  }
}
