import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { Environment } from './environment/Environment.js';
import { Station } from './station/Station.js';
import { GimbalTracker } from './station/GimbalTracker.js';
import { DroneManager } from './drone/DroneManager.js';
import { DualRadarEngine } from './radar/DualRadarEngine.js';
import { TelemetryHUD } from './ui/TelemetryHUD.js';

import { HardwareInterface } from '../hardware/hardwareInterface.js';
import { OperatingModeTracker, OPERATING_MODES } from '../control/tracking.js';
import { panStepsToDeg, tiltStepsToDeg } from '../control/stepConversion.js';

import {
  RadarDetectionModule,
  CameraDetectionModule,
  SensorFusionModule,
  TargetTrackingModule,
  GimbalControllerModule,
  ThermalMonitoringModule,
  EnvironmentalEffectsModule,
  CompensationAlgorithmsModule
} from './modules/index.js';

/**
 * Main Application Orchestrator for SIH26050 Physical Digital Twin.
 */
class AntiDroneSimulationApp {
  constructor() {
    this.isPaused = false;
    this.simTime = 0;

    // 1. Initialize 3D Engine with Bright Ladakh Lighting
    this.engine = new Engine('canvas-container');

    // 2. Build Ladakh High-Altitude Environment (pale sky, light soil, snow patches, mountains)
    this.environment = new Environment(this.engine.scene);

    // 3. Build Physical Prototype Station (NEMA-17 steppers, webcam, Nucleo board, dual radars)
    this.station = new Station(this.engine.scene);

    // 4. Smooth Closed-Loop Gimbal Stepper Tracker
    this.gimbalTracker = new GimbalTracker(this.station.gimbal);

    // 5. Multi-Drone Flight Manager with Tactical Scenario Modes & Missile Interceptor
    this.droneManager = new DroneManager(this.engine.scene);
    this.droneManager.setStation(this.station);
    this.droneManager.setSettlementLocations(this.environment.getSettlementLocations());
    this.droneManager.onNeutralizationEvent = (evt) => {
      if (this.hud) {
        this.hud.showNeutralizationBanner(evt.targetId, evt.nextTargetId, evt.remainingCount, evt.buildingDist);
      }
      if (this.cameraManager) {
        this.cameraManager.triggerTrauma(0.45);
      }
    };

    // 6. Dual 180° Functional Radar Engine (RADAR A and RADAR B, 20m range)
    this.dualRadarEngine = new DualRadarEngine(20.0);

    // 7. Hardware Abstraction Layer (Virtual STM32 or Real STM32)
    this.hardware = new HardwareInterface();

    // 8. Operating Mode Tracker (Mode 1: Stress, Mode 2: PID, Mode 3: Live Drone Tracking)
    this.modeTracker = new OperatingModeTracker();

    // 9. Multi-View Camera Manager
    this.cameraManager = new CameraManager(
      this.engine.camera,
      this.engine.renderer.domElement,
      (mode) => {
        if (this.hud) {
          this.hud.setCameraMode(mode);
        }
      }
    );
    this.cameraManager.setTrackingTargets({
      droneManager: this.droneManager,
      gimbal: this.station.gimbal,
      station: this.station
    });

    // 10. Initialize Modular Architecture Stubs
    this.initModularExtensions();

    // 11. Setup Telemetry HUD & 2D Radar Canvas Display
    this.hud = new TelemetryHUD({
      onScenarioChange: (scenarioKey) => {
        this.droneManager.setScenario(scenarioKey);
      },
      onSelectTarget: (droneId) => {
        this.droneManager.selectTarget(droneId);
      },
      onTogglePlayPause: () => {
        this.isPaused = !this.isPaused;
        return this.isPaused;
      },
      onReset: () => {
        this.simTime = 0;
        this.droneManager.reset();
        this.hardware.home();
      },
      onSpeedChange: (speed) => {
        this.simSpeedMultiplier = speed;
      },
      onCameraModeChange: (mode) => {
        this.cameraManager.setMode(mode);
      },
      onToggleRadarSectors: (visible) => {
        this.station.setRadarSectorsVisible(visible);
      },
      onToggleTrajectory: (visible) => {
        this.droneManager.getDrones().forEach((d) => {
          if (d.trailRibbon) d.trailRibbon.visible = visible;
          if (d.dropLine) d.dropLine.visible = visible;
          if (d.groundRing) d.groundRing.visible = visible;
        });
      },
      onToggleGrid: (visible) => {
        this.environment.setGridVisible(visible);
      },
      // Kinetic Interceptor Missile Launch Trigger
      onLaunchInterceptor: () => {
        const target = this.droneManager.getSelectedTarget();
        if (target && !target.isNeutralized) {
          const missile = this.droneManager.launchMissileAtTarget(target);
          if (missile && this.hud) {
            this.hud.showToast(`INTERCEPTOR MISSILE LAUNCHED -> ${target.id}`);
          }
        } else {
          if (this.hud) {
            this.hud.showToast('NO ACTIVE TARGET TO ENGAGE');
          }
        }
      },
      // Hardware integration handlers
      onHardwareModeChange: (mode) => {
        this.hardware.setHardwareMode(mode);
      },
      onOperatingModeChange: (mode) => {
        this.modeTracker.setMode(mode);
      },
      onHardwareAction: (action) => {
        if (action === 'enable') this.hardware.enable();
        else if (action === 'disable') this.hardware.disable();
        else if (action === 'home') this.hardware.home();
        else if (action === 'stop') this.hardware.stop();
      },
      onEnvironmentChange: (env) => {
        this.modeTracker.envModel.setConditions(env);
      },
      onToggleEnvWind: (active) => {
        this.modeTracker.envModel.setHighWind(active);
        if (this.hud) {
          this.hud.showToast(active ? '💨 HIGH WIND ACTIVE: 26.0 m/s GUSTS' : '💨 WIND CALMED: 1.0 m/s');
        }
      },
      onToggleEnvFreeze: (active) => {
        this.modeTracker.envModel.setSubZeroFreeze(active);
        this.hardware.setAmbientTemperature(active ? -22.0 : 18.0);
        if (this.hud) {
          this.hud.showToast(active ? '❄️ SUB-ZERO FREEZE: -22°C (PTC HEATER ARMED)' : '❄️ MILD TEMPERATURE: +18°C');
        }
      },
      onPIDChange: (gains) => {
        this.modeTracker.setPIDGains({
          panKp: gains.kp,
          panKi: gains.ki,
          panKd: gains.kd,
          tiltKp: gains.kp,
          tiltKi: gains.ki,
          tiltKd: gains.kd
        });
      },
      onPIDTestSignalChange: (sig) => {
        this.modeTracker.setTestSignal(sig);
      }
    });

    this.simSpeedMultiplier = 1.0;

    // 12. Register Simulation Frame Tick
    this.engine.addUpdateCallback(this.update.bind(this));

    // 13. Start Engine Loop
    this.engine.start();
    console.log('[SIH26050] Physical Digital Twin with Hardware Integration running successfully.');
  }

  initModularExtensions() {
    this.modules = [
      new RadarDetectionModule(),
      new CameraDetectionModule(),
      new SensorFusionModule(),
      new TargetTrackingModule(),
      new GimbalControllerModule(),
      new ThermalMonitoringModule(),
      new EnvironmentalEffectsModule(),
      new CompensationAlgorithmsModule()
    ];

    const context = {
      scene: this.engine.scene,
      station: this.station,
      droneManager: this.droneManager,
      environment: this.environment
    };

    this.modules.forEach((mod) => mod.init(context));
  }

  update(deltaTime, elapsedTime) {
    const effectiveDelta = deltaTime * this.simSpeedMultiplier;

    if (!this.isPaused) {
      this.simTime += effectiveDelta;
    }

    // 1. Update Multi-Drone Kinematics with Live Wind Turbulence (Making Drones Unpredictable in High Wind)
    const envWind = {
      windSpeed: this.modeTracker.envModel.currentWindSpeed,
      windBearingDeg: this.modeTracker.envModel.windBearingDeg,
      isHighWind: this.modeTracker.envModel.isHighWind
    };
    this.droneManager.update(effectiveDelta, this.isPaused, envWind);
    const activeDrones = this.droneManager.getDrones();

    // 2. Functional Dual 180° Radar Detection Calculation
    const radarData = this.dualRadarEngine.update(effectiveDelta, activeDrones);

    // 2.5 Update High-Altitude Atmospheric Environment (beacon pulse, windsock, high-speed blizzard simulation)
    if (this.environment.update) {
      const windSpd = this.modeTracker.envModel.currentWindSpeed;
      const windBrg = this.modeTracker.envModel.windBearingDeg;
      const isHighWind = this.modeTracker.envModel.isHighWind;
      this.environment.update(effectiveDelta, this.simTime, windSpd, windBrg, isHighWind);
    }

    // 3. Determine Active Target & Steer Gimbal
    let selectedDrone = this.droneManager.getSelectedTarget();
    // If current selected drone is not found or is neutralized, prioritize closest detected active drone
    if ((!selectedDrone || selectedDrone.isNeutralized) && radarData.targets.length > 0) {
      const detected = radarData.targets.filter((t) => t.isDetected && !t.isNeutralized);
      if (detected.length > 0) {
        selectedDrone = detected[0].droneRef;
        this.droneManager.selectTarget(selectedDrone.id);
      } else {
        const aliveDrones = activeDrones.filter((d) => !d.isNeutralized);
        if (aliveDrones.length > 0) {
          selectedDrone = aliveDrones[0];
          this.droneManager.selectTarget(selectedDrone.id);
        }
      }
    }

    // 4. Determine Target Aiming Angles from Active Drone / Radar
    let rawTargetPanDeg = 0;
    let rawTargetTiltDeg = 0;
    if (selectedDrone && !selectedDrone.isNeutralized) {
      const targetPos = selectedDrone.getPosition();
      const pivotPos = this.station.getGimbalPivotPosition();
      const delta = targetPos.clone().sub(pivotPos);
      const horizDist = Math.hypot(delta.x, delta.z);
      if (horizDist > 0.001) {
        const panRad = Math.atan2(delta.x, delta.z);
        const tiltRad = -Math.atan2(delta.y, horizDist);
        // Strict Cable-Safe Limits: Maximum 180° from reference (Home = 0°) to prevent wire tangling
        rawTargetPanDeg = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(panRad), -180.0, 180.0);
        rawTargetTiltDeg = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(tiltRad), -75.0, 85.0);
      }
    }

    // 5. Update Hardware Simulation Loop (kinematics, thermals, PTC heater)
    this.hardware.update(effectiveDelta);
    const hwTelemetry = this.hardware.getTelemetry();

    // 6. Operating Mode Processing (Disturbance injection, PID compensation, or direct tracking)
    const targetCmd = this.modeTracker.update(
      effectiveDelta,
      { panDeg: rawTargetPanDeg, tiltDeg: rawTargetTiltDeg },
      hwTelemetry
    );

    // Optical error in equivalent pixels (640x480 FOV ~60° -> 10.67 px/deg)
    const trackingState = this.modeTracker.getState();
    const panErrorDeg = trackingState.panErrorDeg !== undefined ? trackingState.panErrorDeg : (rawTargetPanDeg - (hwTelemetry.panDeg || 0));
    const tiltErrorDeg = trackingState.tiltErrorDeg !== undefined ? trackingState.tiltErrorDeg : (rawTargetTiltDeg - (hwTelemetry.tiltDeg || 0));
    const PIXELS_PER_DEG = 10.667;
    const errorPanPx = panErrorDeg * PIXELS_PER_DEG;
    const errorTiltPx = tiltErrorDeg * PIXELS_PER_DEG;
    const hasTarget = Boolean(selectedDrone && !selectedDrone.isNeutralized);

    // 7. Dispatch Absolute Step Commands & Optical Pixel Error to Hardware Abstraction Layer
    this.hardware.moveTo(targetCmd.panSteps, targetCmd.tiltSteps, {
      errorPanPx,
      errorTiltPx,
      hasTarget
    });

    // 8. DIGITAL TWIN SYNCHRONIZATION:
    // The 3D Prototype Gimbal on screen reflects ACTUAL measured hardware position!
    const actualPanRad = THREE.MathUtils.degToRad(panStepsToDeg(hwTelemetry.pan));
    const actualTiltRad = THREE.MathUtils.degToRad(tiltStepsToDeg(hwTelemetry.tilt));
    this.station.gimbal.setPanTilt(actualPanRad, actualTiltRad);

    // 9. Gather Active Target Telemetry Information
    let activeTargetData = null;
    if (selectedDrone) {
      const match = radarData.targets.find((t) => t.droneId === selectedDrone.id);
      const bDist = this.droneManager.getMinBuildingDist(selectedDrone.getPosition());
      activeTargetData = match ? { ...match, buildingDist: bDist } : {
        droneId: selectedDrone.id,
        position: selectedDrone.getPosition(),
        velocity: selectedDrone.getVelocity(),
        speed: selectedDrone.getSpeed(),
        horizontalDist: selectedDrone.getPosition().distanceTo(new THREE.Vector3(0, 0, 0)),
        slantDist: selectedDrone.getPosition().distanceTo(new THREE.Vector3(0, 0, 0)),
        bearingDeg: 0,
        detectionSource: 'NONE',
        threatLevel: 'NONE',
        isDetected: false,
        buildingDist: bDist
      };
    }

    // 10. Update Tactical Telemetry HUD, 2D Radar Canvas & Hardware Status
    const connStatus = this.hardware.getConnectionStatus();
    this.hud.update({
      simTimeFormatted: this.formatTime(this.simTime),
      radarData,
      activeTarget: activeTargetData,
      gimbalState: {
        panDeg: this.station.gimbal.getPanDeg(),
        tiltDeg: this.station.gimbal.getTiltDeg(),
        status: connStatus.connected ? 'LOCKED' : 'OFFLINE'
      },
      hwTelemetry,
      trackingState: this.modeTracker.getState(),
      envData: this.modeTracker.getState().envData,
      droneWindTiltDeg: this.droneManager.getWindTiltDeg ? this.droneManager.getWindTiltDeg() : 0,
      connStatus
    });

    // 7. Update Modular Extension Layer
    this.modules.forEach((mod) => mod.update(effectiveDelta, activeTargetData));

    // 8. Update Camera Transition & Dynamic Tracking
    this.cameraManager.update(effectiveDelta);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    const padMin = mins < 10 ? '0' + mins : mins;
    const padSec = secs < 10 ? '0' + secs : secs;
    return `${padMin}:${padSec}`;
  }
}

// Instantiate on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AntiDroneSimulationApp();
});
