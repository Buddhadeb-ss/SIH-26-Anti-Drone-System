import * as THREE from 'three';
import { Drone } from './Drone.js';
import { MissileInterceptor, ExplosionFX } from './MissileInterceptor.js';

/**
 * DroneManager.js
 * Multi-Drone Flight Management & Tactical Scenarios:
 * 1. SINGLE INTRUDER (drone enters at 8.5m, loops smoothly in front of camera at 4.2m)
 * 2. DRONE ATTACK (charges directly toward prototype down to 2.0m, threat escalates to CRITICAL)
 * 3. MULTIPLE DRONES (3 drones approaching from distinct compass directions)
 * 4. ZIGZAG / EVASIVE (lateral sinusoidal weaving in front of camera)
 * 5. ALTITUDE CHANGE (undulating vertically between 1.2m and 5.5m)
 * 6. MULTI-AXIS ATTACK (spiral dive approach)
 * 7. SWARM / MANY DRONES (7 simultaneous drones surrounding prototype)
 * 8. KINETIC MISSILE NEUTRALIZATION (High-speed interceptor missile launch & kinetic kill demo)
 * 9. SETTLEMENT SWARM ATTACK (25-drone swarm attacking valley settlements; building-proximity prioritized kinetic neutralization)
 */
export class DroneManager {
  constructor(scene) {
    this.scene = scene;
    this.drones = [];
    this.activeScenario = 'single_intruder';
    this.simTime = 0;
    this.selectedTargetId = null;

    this.station = null;
    this.settlementLocations = [];
    this.activeMissiles = [];
    this.activeExplosions = [];
    this.hasFiredInScenario8 = false;
    this.scenario8RespawnTimer = 0;
    this.swarmFireTimer = 0;
    this.swarmRespawnTimer = 0;
    this.onNeutralizationEvent = null;

    this.setScenario('single_intruder');
  }

  setStation(station) {
    this.station = station;
  }

  setSettlementLocations(locations) {
    this.settlementLocations = locations || [];
  }

  getMinBuildingDist(pos) {
    if (!this.settlementLocations || this.settlementLocations.length === 0) {
      return new THREE.Vector3(0, -5.2, 16.0).distanceTo(pos);
    }
    let minDist = Infinity;
    for (let i = 0; i < this.settlementLocations.length; i++) {
      const d = pos.distanceTo(this.settlementLocations[i]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  getPriorityBuildingTarget() {
    const aliveDrones = this.drones.filter((d) => !d.isNeutralized);
    if (aliveDrones.length === 0) return null;

    let closestDrone = null;
    let minBuildingDist = Infinity;

    for (const d of aliveDrones) {
      const pos = d.getPosition();
      const bDist = this.getMinBuildingDist(pos);
      if (bDist < minBuildingDist) {
        minBuildingDist = bDist;
        closestDrone = d;
      }
    }
    return { target: closestDrone, buildingDist: minBuildingDist };
  }

  setScenario(scenarioKey) {
    this.activeScenario = scenarioKey;
    this.simTime = 0;
    this.clearAllDrones();

    switch (scenarioKey) {
      case 'single_intruder':
        this.spawnSingleIntruder();
        break;

      case 'drone_attack':
        this.spawnDroneAttack();
        break;

      case 'multiple_drones':
        this.spawnMultipleDrones();
        break;

      case 'zigzag_evasive':
        this.spawnZigzagEvasive();
        break;

      case 'altitude_change':
        this.spawnAltitudeChange();
        break;

      case 'multi_axis_attack':
        this.spawnMultiAxisAttack();
        break;

      case 'swarm_many':
        this.spawnSwarm();
        break;

      case 'missile_neutralization':
        this.spawnMissileNeutralization();
        break;

      case 'settlement_swarm':
        this.spawnSettlementSwarm25();
        break;

      default:
        this.spawnSingleIntruder();
        break;
    }

    if (this.drones.length > 0) {
      if (scenarioKey === 'settlement_swarm') {
        const priority = this.getPriorityBuildingTarget();
        this.selectTarget(priority && priority.target ? priority.target.id : this.drones[0].id);
      } else {
        this.selectTarget(this.drones[0].id);
      }
    }
  }

  clearAllDrones() {
    this.drones.forEach((d) => d.destroy());
    this.drones = [];
    this.selectedTargetId = null;

    this.activeMissiles.forEach((m) => m.destroy());
    this.activeMissiles = [];

    this.activeExplosions.forEach((e) => e.destroy());
    this.activeExplosions = [];

    this.hasFiredInScenario8 = false;
    this.scenario8RespawnTimer = 0;
    this.swarmFireTimer = 0;
    this.swarmRespawnTimer = 0;
  }

  createDrone(id) {
    const drone = new Drone(this.scene, id);
    this.drones.push(drone);
    return drone;
  }

  // --- SCENARIO 1: SINGLE INTRUDER ---
  spawnSingleIntruder() {
    const d = this.createDrone('D01');
    d.flightController = (t) => {
      const dist = 5.2 + Math.sin(t * 0.5) * 1.2;
      const angle = Math.sin(t * 0.35) * 0.75;
      return new THREE.Vector3(
        Math.sin(angle) * dist,
        2.2 + Math.sin(t * 0.8) * 0.5,
        Math.cos(angle) * dist
      );
    };
  }

  // --- SCENARIO 2: DRONE ATTACK ---
  spawnDroneAttack() {
    const d = this.createDrone('D01');
    d.flightController = (t) => {
      const cycle = t % 8.0;
      const dist = Math.max(1.8, 9.8 - cycle * 1.1);
      return new THREE.Vector3(
        Math.sin(t * 1.2) * 0.5,
        Math.max(1.2, 3.2 - cycle * 0.2),
        dist
      );
    };
  }

  // --- SCENARIO 3: MULTIPLE DRONES ---
  spawnMultipleDrones() {
    const configs = [
      { id: 'D01', baseAngle: 0.2, speed: 0.25, r: 5.5, alt: 2.2 },
      { id: 'D02', baseAngle: 2.3, speed: 0.3, r: 7.2, alt: 3.2 },
      { id: 'D03', baseAngle: 4.4, speed: 0.22, r: 6.4, alt: 2.6 }
    ];

    configs.forEach((cfg) => {
      const d = this.createDrone(cfg.id);
      d.flightController = (t) => {
        const ang = cfg.baseAngle + t * cfg.speed;
        const dist = cfg.r + Math.sin(t * 0.6 + cfg.baseAngle) * 0.8;
        return new THREE.Vector3(
          Math.sin(ang) * dist,
          cfg.alt + Math.sin(t * 0.8) * 0.3,
          Math.cos(ang) * dist
        );
      };
    });
  }

  // --- SCENARIO 4: ZIGZAG / EVASIVE ---
  spawnZigzagEvasive() {
    const d = this.createDrone('D01');
    d.flightController = (t) => {
      const cycle = (t * 0.5) % 8.0;
      const forwardDist = Math.max(3.0, 8.5 - cycle * 0.7);
      const lateral = Math.sin(t * 1.6) * 3.2;
      return new THREE.Vector3(
        lateral,
        2.4 + Math.cos(t * 1.2) * 0.4,
        forwardDist
      );
    };
  }

  // --- SCENARIO 5: ALTITUDE CHANGE ---
  spawnAltitudeChange() {
    const d = this.createDrone('D01');
    d.flightController = (t) => {
      const dist = 5.5 + Math.sin(t * 0.3) * 1.8;
      const alt = 3.2 + Math.sin(t * 1.4) * 2.0;
      const angle = t * 0.4;
      return new THREE.Vector3(
        Math.sin(angle) * dist,
        Math.max(1.0, alt),
        Math.cos(angle) * dist
      );
    };
  }

  // --- SCENARIO 6: MULTI-AXIS ATTACK ---
  spawnMultiAxisAttack() {
    const d = this.createDrone('D01');
    d.flightController = (t) => {
      const dist = 4.5 + Math.sin(t * 0.5) * 2.5;
      const angle = t * 0.7;
      const alt = Math.max(1.2, 3.8 + Math.sin(t * 1.5) * 1.6);
      return new THREE.Vector3(
        Math.cos(angle) * dist,
        alt,
        Math.sin(angle) * dist
      );
    };
  }

  // --- SCENARIO 7: SWARM / MANY DRONES ---
  spawnSwarm() {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const id = `D0${i + 1}`;
      const d = this.createDrone(id);
      const baseAngle = (i / count) * Math.PI * 2;
      const dist = 5.0 + (i % 3) * 1.6;
      const speed = 0.2 + (i % 4) * 0.08;
      const altBase = 1.8 + (i % 3) * 0.7;

      d.flightController = (t) => {
        const ang = baseAngle + t * speed;
        return new THREE.Vector3(
          Math.sin(ang) * (dist + Math.sin(t * 0.5 + i) * 0.5),
          altBase + Math.sin(t * 0.7 + i) * 0.3,
          Math.cos(ang) * (dist + Math.sin(t * 0.5 + i) * 0.5)
        );
      };
    }
  }

  // --- SCENARIO 8: KINETIC MISSILE NEUTRALIZATION (DEMO) ---
  spawnMissileNeutralization() {
    this.hasFiredInScenario8 = false;
    this.scenario8RespawnTimer = 0;
    const d = this.createDrone('D01-HOSTILE');

    // Ingress flight path: approaches from 8.8m, weaving tactically towards the station
    d.flightController = (t) => {
      if (d.isNeutralized) {
        return d.getPosition(); // Stay fixed at impact location
      }
      const dist = Math.max(2.8, 8.8 - t * 0.82);
      const weaving = Math.sin(t * 1.1) * 1.1;
      const alt = Math.max(1.8, 3.1 - t * 0.15);
      return new THREE.Vector3(
        weaving,
        alt,
        dist
      );
    };
  }

  // --- SCENARIO 9: 25-DRONE SETTLEMENT SWARM ATTACK ---
  spawnSettlementSwarm25() {
    this.swarmFireTimer = 0;
    this.swarmRespawnTimer = 0;

    // 25 Hostile Drones attacking the valley settlement corridor:
    // Ranked with precise, progressive initial distances to nearest settlement building (from 1.1m out to 12.0m)
    // Moving with fast-paced, dynamic attack trajectories (3.5 - 6.5 m/s)
    const swarmConfigs = [
      // Cluster 1: Village Center (Immediate Rooftop Breaches)
      { id: 'SW01', cx: -0.5, cy: -4.2, cz: 14.8, rx: 0.9, rz: 0.7, spd: 2.2, phase: 0.0 },
      { id: 'SW02', cx: 8.5,  cy: -4.0, cz: 13.5, rx: 1.1, rz: 0.8, spd: 2.4, phase: 0.4 },
      { id: 'SW03', cx: -7.5, cy: -3.9, cz: 14.5, rx: 1.3, rz: 0.9, spd: 2.1, phase: 0.8 },
      { id: 'SW04', cx: 2.8,  cy: -3.8, cz: 15.2, rx: 1.4, rz: 1.0, spd: 2.5, phase: 1.2 },
      { id: 'SW05', cx: 12.0, cy: -3.6, cz: 14.2, rx: 1.5, rz: 1.1, spd: 2.3, phase: 1.6 },

      // Wave 2: Close Ingress over Bridge & Highway Outpost
      { id: 'SW06', cx: -11.0, cy: -3.5, cz: 15.2, rx: 1.6, rz: 1.1, spd: 2.6, phase: 2.0 },
      { id: 'SW07', cx: -3.2,  cy: -3.3, cz: 15.8, rx: 1.8, rz: 1.2, spd: 2.2, phase: 2.4 },
      { id: 'SW08', cx: 15.5,  cy: -3.1, cz: 15.0, rx: 1.9, rz: 1.3, spd: 2.7, phase: 2.8 },
      { id: 'SW09', cx: -14.5, cy: -3.0, cz: 16.0, rx: 2.0, rz: 1.3, spd: 2.4, phase: 3.2 },
      { id: 'SW10', cx: 5.2,   cy: -2.8, cz: 16.5, rx: 2.1, rz: 1.4, spd: 2.5, phase: 3.6 },

      // Wave 3: Mid-Range Swarm Vectors Sweeping River & Outpost
      { id: 'SW11', cx: 9.8,   cy: -2.6, cz: 16.2, rx: 2.2, rz: 1.5, spd: 2.3, phase: 4.0 },
      { id: 'SW12', cx: -9.2,  cy: -2.5, cz: 17.5, rx: 2.4, rz: 1.5, spd: 2.6, phase: 4.4 },
      { id: 'SW13', cx: 1.0,   cy: -2.3, cz: 17.2, rx: 2.5, rz: 1.6, spd: 2.8, phase: 4.8 },
      { id: 'SW14', cx: 13.8,  cy: -2.2, cz: 16.8, rx: 2.6, rz: 1.7, spd: 2.2, phase: 5.2 },
      { id: 'SW15', cx: -13.0, cy: -2.0, cz: 18.0, rx: 2.7, rz: 1.7, spd: 2.5, phase: 5.6 },

      // Wave 4: Valley Flanks & Highway Chokepoints
      { id: 'SW16', cx: -2.0,  cy: -1.9, cz: 18.2, rx: 2.9, rz: 1.8, spd: 2.4, phase: 6.0 },
      { id: 'SW17', cx: 17.0,  cy: -1.7, cz: 15.8, rx: 3.0, rz: 1.9, spd: 2.7, phase: 6.4 },
      { id: 'SW18', cx: -16.5, cy: -1.6, cz: 17.2, rx: 3.1, rz: 1.9, spd: 2.3, phase: 6.8 },
      { id: 'SW19', cx: -5.0,  cy: -1.4, cz: 19.5, rx: 3.2, rz: 2.0, spd: 2.6, phase: 7.2 },
      { id: 'SW20', cx: 3.5,   cy: -1.3, cz: 20.0, rx: 3.3, rz: 2.1, spd: 2.5, phase: 7.6 },

      // Wave 5: High-Altitude Rear Ingress Flanking the Ridge
      { id: 'SW21', cx: 11.0,  cy: -1.1, cz: 19.0, rx: 3.5, rz: 2.2, spd: 2.4, phase: 8.0 },
      { id: 'SW22', cx: -12.0, cy: -0.9, cz: 19.8, rx: 3.6, rz: 2.2, spd: 2.6, phase: 8.4 },
      { id: 'SW23', cx: 0.0,   cy: -0.8, cz: 18.5, rx: 3.7, rz: 2.3, spd: 2.7, phase: 8.8 },
      { id: 'SW24', cx: 8.0,   cy: -0.6, cz: 18.0, rx: 3.8, rz: 2.4, spd: 2.5, phase: 9.2 },
      { id: 'SW25', cx: -8.0,  cy: -0.4, cz: 18.0, rx: 4.0, rz: 2.5, spd: 2.6, phase: 9.6 }
    ];

    swarmConfigs.forEach((cfg) => {
      const d = this.createDrone(cfg.id);
      d.flightController = (t) => {
        if (d.isNeutralized) return d.getPosition();
        // Dynamic fast-paced flight: banking lateral weave and undulating attack dive
        const ang = cfg.phase + t * cfg.spd;
        const x = cfg.cx + Math.sin(ang) * cfg.rx + Math.sin(t * 1.8 + cfg.phase) * 0.45;
        const z = cfg.cz + Math.cos(ang * 0.85) * cfg.rz + Math.cos(t * 1.4 + cfg.phase) * 0.4;
        const y = cfg.cy + Math.sin(t * 2.2 + cfg.phase) * 0.35;
        return new THREE.Vector3(x, y, z);
      };
    });
  }

  launchMissileAtTarget(targetDrone) {
    if (!targetDrone || targetDrone.isNeutralized) return null;

    let launchPos = new THREE.Vector3(-0.28, 0.22, 0.28);
    let launchDir = new THREE.Vector3(0.1, 0.6, 0.79).normalize();

    if (this.station) {
      launchPos = this.station.getMissileLaunchPosition();
      launchDir = this.station.getMissileLaunchDirection();
    }

    const missile = new MissileInterceptor(
      this.scene,
      launchPos,
      launchDir,
      targetDrone,
      (impactPos, drone) => {
        // Impact callback:
        if (drone && !drone.isNeutralized) {
          drone.neutralize();
        }

        // Spawn multi-stage kinetic explosion FX
        const explosion = new ExplosionFX(this.scene, impactPos);
        this.activeExplosions.push(explosion);

        // Auto re-acquire next threat: in Scenario 9, strictly acquire the drone closest to buildings!
        let nextTarget = null;
        if (this.activeScenario === 'settlement_swarm') {
          const priority = this.getPriorityBuildingTarget();
          if (priority && priority.target) {
            nextTarget = priority.target;
            this.selectTarget(nextTarget.id);
          }
        } else {
          const aliveDrones = this.drones.filter((d) => !d.isNeutralized);
          if (aliveDrones.length > 0) {
            aliveDrones.sort((a, b) => a.getPosition().length() - b.getPosition().length());
            nextTarget = aliveDrones[0];
            this.selectTarget(nextTarget.id);
          }
        }

        // Notify app for HUD alert, camera trauma, and auto-targeting
        if (this.onNeutralizationEvent) {
          const remainingCount = this.drones.filter((d) => !d.isNeutralized).length;
          const buildingDist = this.getMinBuildingDist(impactPos);
          this.onNeutralizationEvent({
            targetId: drone ? drone.id : 'TARGET',
            position: impactPos,
            nextTargetId: nextTarget ? nextTarget.id : null,
            remainingCount: remainingCount,
            buildingDist: buildingDist
          });
        }
      }
    );

    this.activeMissiles.push(missile);
    return missile;
  }

  selectTarget(droneId) {
    this.selectedTargetId = droneId;
    this.drones.forEach((d) => {
      d.setSelected(d.id === droneId && !d.isNeutralized);
    });
  }

  getSelectedTarget() {
    // In settlement swarm attack, dynamic threat prioritization locks onto the drone closest to any building
    if (this.activeScenario === 'settlement_swarm') {
      const priority = this.getPriorityBuildingTarget();
      if (priority && priority.target) {
        if (this.selectedTargetId !== priority.target.id) {
          this.selectTarget(priority.target.id);
        }
        return priority.target;
      }
    }

    let current = this.drones.find((d) => d.id === this.selectedTargetId);
    // If the currently tracked drone is neutralized or missing, automatically acquire the next alive drone
    if (!current || current.isNeutralized) {
      const aliveDrones = this.drones.filter((d) => !d.isNeutralized);
      if (aliveDrones.length > 0) {
        aliveDrones.sort((a, b) => a.getPosition().length() - b.getPosition().length());
        current = aliveDrones[0];
        this.selectTarget(current.id);
      } else {
        return current || this.drones[0] || null;
      }
    }
    return current;
  }

  calculateWindDynamics(simTime, windSpeed, windBearingDeg) {
    const bearingRad = THREE.MathUtils.degToRad(windBearingDeg);
    const windDirX = Math.sin(bearingRad);
    const windDirZ = Math.cos(bearingRad);

    // 1. Smooth Aerodynamic Wind Push:
    // Pushed downstream along the wind vector by ~0.85m without vertical bobbing
    const pushMag = 0.85 + Math.sin(simTime * 0.8) * 0.12;
    const offsetX = windDirX * pushMag;
    const offsetZ = windDirZ * pushMag;
    const offsetY = 0; // Pure horizontal aerodynamic drift (no altitude jumping)

    // 2. Realistic Aerodynamic Tilt / Lean Movement:
    // The quadcopter leans smoothly (~19.5° ± 1.5°) into the oncoming wind vector
    const totalTiltDeg = 19.5 + Math.sin(simTime * 1.2) * 1.5;
    const totalTiltRad = THREE.MathUtils.degToRad(totalTiltDeg);

    return {
      offset: new THREE.Vector3(offsetX, offsetY, offsetZ),
      tiltRad: totalTiltRad,
      bearingRad: bearingRad,
      tiltDeg: totalTiltDeg
    };
  }

  getWindTiltDeg() {
    return this.currentWindTiltDeg || 0;
  }

  update(deltaTime, isPaused, envWind = null) {
    if (isPaused) return;

    this.simTime += deltaTime;
    const windSpeed = envWind ? envWind.windSpeed : 0;
    const isHighWind = Boolean(envWind && envWind.isHighWind);
    const windBearingDeg = envWind ? envWind.windBearingDeg : 45;

    // Wind dynamics are strictly active ONLY when the High Wind toggle is ON
    const windDynamics = isHighWind
      ? this.calculateWindDynamics(this.simTime, windSpeed, windBearingDeg)
      : null;

    this.currentWindTiltDeg = windDynamics ? windDynamics.tiltDeg : 0;

    // 1. Update Drones: Pure 100% original kinematics when wind is off; smooth aerodynamic tilt & push when wind is on
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      if (d.flightController && !d.isNeutralized) {
        const basePos = d.flightController(this.simTime);
        if (windDynamics) {
          const pushedPos = basePos.clone().add(windDynamics.offset);
          pushedPos.y = Math.max(0.65, pushedPos.y);
          d.setWindTilt(windDynamics.tiltRad, windDynamics.bearingRad);
          d.updateMotion(pushedPos, deltaTime);
        } else {
          // Zero offset, zero wind tilt: 100% original pre-wind flight controller motion
          d.setWindTilt(0, 0);
          d.updateMotion(basePos, deltaTime);
        }
      }
    }

    // 2. Scenario Execution & Interceptor Salvo Logic
    if (this.activeScenario === 'settlement_swarm') {
      const priority = this.getPriorityBuildingTarget();
      if (priority && priority.target) {
        if (this.selectedTargetId !== priority.target.id) {
          this.selectTarget(priority.target.id);
        }

        // Automated Rapid Kinetic Interception Sequence:
        // Locks and destroys the drone closest to buildings, then rolls to next
        this.swarmFireTimer = (this.swarmFireTimer || 0) + deltaTime;
        if (this.simTime >= 0.7 && this.swarmFireTimer >= 0.65 && this.activeMissiles.length < 2) {
          this.swarmFireTimer = 0;
          this.launchMissileAtTarget(priority.target);
        }
      }

      // Continuous demo loop after all 25 drones are eliminated
      const allDestroyed = this.drones.length === 25 && this.drones.every((d) => d.isNeutralized);
      if (allDestroyed) {
        this.swarmRespawnTimer = (this.swarmRespawnTimer || 0) + deltaTime;
        if (this.swarmRespawnTimer >= 5.5) {
          this.swarmRespawnTimer = 0;
          this.simTime = 0;
          this.setScenario('settlement_swarm');
        }
      }
    } else if (this.activeScenario === 'missile_neutralization') {
      const target = this.getSelectedTarget();
      if (target && !target.isNeutralized) {
        const dist = target.getPosition().length();
        // Fire when drone reaches optimal interception window (<= 7.2m) and time >= 1.5s
        if (!this.hasFiredInScenario8 && dist <= 7.2 && this.simTime >= 1.5) {
          this.hasFiredInScenario8 = true;
          this.launchMissileAtTarget(target);
        }
      } else if (target && target.isNeutralized) {
        // Auto-respawn after 5.0s for continuous demonstration
        this.scenario8RespawnTimer += deltaTime;
        if (this.scenario8RespawnTimer >= 5.0) {
          this.scenario8RespawnTimer = 0;
          this.simTime = 0;
          this.setScenario('missile_neutralization');
        }
      }
    } else {
      // For multi-drone scenarios (e.g. Scenarios 3 & 7):
      const allDronesNeutralized = this.drones.length > 0 && this.drones.every((d) => d.isNeutralized);
      if (allDronesNeutralized) {
        this.multiDroneRespawnTimer = (this.multiDroneRespawnTimer || 0) + deltaTime;
        if (this.multiDroneRespawnTimer >= 6.0) {
          this.multiDroneRespawnTimer = 0;
          this.simTime = 0;
          this.setScenario(this.activeScenario);
        }
      } else {
        this.multiDroneRespawnTimer = 0;
      }
    }

    // 3. Update Active Missiles
    this.activeMissiles = this.activeMissiles.filter((m) => m.update(deltaTime));

    // 4. Update Active Explosions
    this.activeExplosions = this.activeExplosions.filter((e) => e.update(deltaTime));
  }

  getDrones() {
    return this.drones;
  }

  reset() {
    this.setScenario(this.activeScenario);
  }
}
