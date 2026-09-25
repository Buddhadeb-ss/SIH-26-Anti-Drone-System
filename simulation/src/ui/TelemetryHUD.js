import * as THREE from 'three';
import { RadarDisplay2D } from './RadarDisplay2D.js';

/**
 * TelemetryHUD.js
 * Controls tactical UI telemetry, scenario switching, camera preset views,
 * and 2D radar PPI display interactions.
 */
export class TelemetryHUD {
  constructor(handlers) {
    this.handlers = handlers;

    // Header elements
    this.simTimeEl = document.getElementById('sim-time-text');
    this.sysStatusEl = document.getElementById('sys-status-text');
    this.activeDronesEl = document.getElementById('val-active-drones');
    this.detectedDronesEl = document.getElementById('val-detected-drones');

    // Target Telemetry Card
    this.targetIdEl = document.getElementById('val-target-id');
    this.slantRangeEl = document.getElementById('val-slant-range');
    this.speedMsEl = document.getElementById('val-speed-ms');
    this.speedKmhEl = document.getElementById('val-speed-kmh');
    this.radarSourceEl = document.getElementById('val-radar-source');
    this.threatLevelEl = document.getElementById('val-threat-level');
    this.valBuildingDist = document.getElementById('val-building-dist');
    this.valSettlementThreat = document.getElementById('val-settlement-threat');

    this.posXEl = document.getElementById('val-pos-x');
    this.posYEl = document.getElementById('val-pos-y');
    this.posZEl = document.getElementById('val-pos-z');

    this.velXEl = document.getElementById('val-vel-x');
    this.velYEl = document.getElementById('val-vel-y');
    this.velZEl = document.getElementById('val-vel-z');

    this.targetAzimuthEl = document.getElementById('val-target-azimuth');
    this.targetElevationEl = document.getElementById('val-target-elevation');
    this.compassNeedleEl = document.getElementById('compass-needle');

    // Gimbal Stepper Status
    this.gimbalPanEl = document.getElementById('val-gimbal-pan');
    this.gimbalTiltEl = document.getElementById('val-gimbal-tilt');
    this.trackingStatusEl = document.getElementById('val-tracking-status');

    // Controls
    this.scenarioSelect = document.getElementById('select-scenario');
    this.playPauseBtn = document.getElementById('btn-play-pause');
    this.playIconEl = document.getElementById('btn-play-icon');
    this.playLabelEl = document.getElementById('btn-play-label');
    this.resetBtn = document.getElementById('btn-reset');
    this.speedSelect = document.getElementById('select-speed');

    this.boresightReticle = document.getElementById('boresight-reticle');
    this.toastEl = document.getElementById('hud-toast');
    this.toastTimeout = null;

    // Neutralization Kill Banner & Interceptor Button
    this.btnLaunchInterceptor = document.getElementById('btn-launch-interceptor');
    this.neutralizedBanner = document.getElementById('hud-neutralized-banner');
    this.neutralizedBannerTimeout = null;

    // Atmospheric Toggles & Reaction Monitor
    this.toggleEnvWind = document.getElementById('toggle-env-wind');
    this.toggleEnvFreeze = document.getElementById('toggle-env-freeze');

    this.valRxnTorque = document.getElementById('val-rxn-torque');
    this.valRxnDeflection = document.getElementById('val-rxn-deflection');
    this.valRxnDroneTilt = document.getElementById('val-rxn-dronetilt');
    this.valRxnViscosity = document.getElementById('val-rxn-viscosity');
    this.valRxnMachine = document.getElementById('val-rxn-machine');
    this.envStressBadge = document.getElementById('env-stress-badge');

    // Camera buttons
    this.camButtons = document.querySelectorAll('[data-cam]');

    // Toggles
    this.toggleRadarSectorsEl = document.getElementById('toggle-radarsectors');
    this.toggleTrajectoryEl = document.getElementById('toggle-trajectory');
    this.toggleGridEl = document.getElementById('toggle-grid');
    this.toggleHudBtn = document.getElementById('btn-toggle-hud');
    this.leftPanel = document.getElementById('drone-telemetry-panel');
    this.rightPanel = document.getElementById('station-telemetry-panel');

    // Hardware Interface Elements
    this.btnHwSim = document.getElementById('btn-hw-sim');
    this.btnHwReal = document.getElementById('btn-hw-real');
    this.hwStatusStrip = document.getElementById('hw-status-strip');
    this.hwStatusDot = document.getElementById('hw-status-dot');
    this.hwStatusText = document.getElementById('hw-status-text');

    // Operating Mode Tabs
    this.btnModeStress = document.getElementById('btn-mode-stress');
    this.btnModePid = document.getElementById('btn-mode-pid');
    this.btnModeTracking = document.getElementById('btn-mode-tracking');
    this.subpanelStress = document.getElementById('subpanel-mode-stress');
    this.subpanelPid = document.getElementById('subpanel-mode-pid');
    this.subpanelTracking = document.getElementById('subpanel-mode-tracking');

    // Stepper Step and Thermal Telemetry
    this.valHwPanSteps = document.getElementById('val-hw-pan-steps');
    this.valHwTiltSteps = document.getElementById('val-hw-tilt-steps');
    this.valHwPanTgt = document.getElementById('val-hw-pan-tgt');
    this.valHwTiltTgt = document.getElementById('val-hw-tilt-tgt');
    this.valHwTempM1 = document.getElementById('val-hw-temp-m1');
    this.valHwTempM2 = document.getElementById('val-hw-temp-m2');
    this.valHwHeater = document.getElementById('val-hw-heater');
    this.valHwSyncMode = document.getElementById('val-hw-sync-mode');

    // Hardware Actions
    this.btnHwEnable = document.getElementById('btn-hw-enable');
    this.btnHwDisable = document.getElementById('btn-hw-disable');
    this.btnHwHome = document.getElementById('btn-hw-home');
    this.btnHwStop = document.getElementById('btn-hw-stop');

    // Mode 1 Sliders
    this.sliderEnvWind = document.getElementById('slider-env-wind');
    this.sliderEnvTemp = document.getElementById('slider-env-temp');
    this.valEnvWind = document.getElementById('val-env-wind');
    this.valEnvTemp = document.getElementById('val-env-temp');
    this.valEnvTorque = document.getElementById('val-env-torque');
    this.valEnvErrPan = document.getElementById('val-env-err-pan');
    this.valEnvErrTilt = document.getElementById('val-env-err-tilt');

    // Mode 2 PID Tuning & Select
    this.sliderPidKp = document.getElementById('slider-pid-kp');
    this.sliderPidKi = document.getElementById('slider-pid-ki');
    this.sliderPidKd = document.getElementById('slider-pid-kd');
    this.selectPidTest = document.getElementById('select-pid-test');
    this.valPidKp = document.getElementById('val-pid-kp');
    this.valPidKi = document.getElementById('val-pid-ki');
    this.valPidKd = document.getElementById('val-pid-kd');

    // Mode 2 Live Canvas Graphs
    this.canvasPidResponse = document.getElementById('canvas-pid-response');
    this.canvasPidError = document.getElementById('canvas-pid-error');
    this.ctxPidResponse = this.canvasPidResponse ? this.canvasPidResponse.getContext('2d') : null;
    this.ctxPidError = this.canvasPidError ? this.canvasPidError.getContext('2d') : null;
    this.pidHistory = [];
    this.maxPidPoints = 65;

    // Mode 3 Lock indicators
    this.valTrackLockAz = document.getElementById('val-track-lock-az');
    this.valTrackLockEl = document.getElementById('val-track-lock-el');

    // Instantiate 2D Radar PPI Scope
    this.radarDisplay = new RadarDisplay2D('radar-2d-canvas', (target) => {
      this.handlers.onSelectTarget(target.droneId);
      this.showToast(`Target Selected: ${target.droneId}`);
    });

    this.bindEvents();
  }

  bindEvents() {
    if (this.toggleHudBtn) {
      this.toggleHudBtn.addEventListener('click', () => {
        this.leftPanel.classList.toggle('collapsed');
        this.rightPanel.classList.toggle('collapsed');
        const isCollapsed = this.leftPanel.classList.contains('collapsed');
        this.showToast(isCollapsed ? 'HUD Panels Hidden (Full 3D View)' : 'HUD Panels Visible');
      });
    }

    // Kinetic Interceptor Missile Launch Button
    if (this.btnLaunchInterceptor) {
      this.btnLaunchInterceptor.addEventListener('click', () => {
        this.handlers.onLaunchInterceptor?.();
      });
    }

    // Scenario Selector
    this.scenarioSelect.addEventListener('change', (e) => {
      const scenarioKey = e.target.value;
      this.handlers.onScenarioChange(scenarioKey);
      this.showToast(`Scenario: ${e.target.selectedOptions[0].text}`);
    });

    // Play / Pause
    this.playPauseBtn.addEventListener('click', () => {
      const isPaused = this.handlers.onTogglePlayPause();
      this.updatePlayPauseState(isPaused);
    });

    // Reset
    this.resetBtn.addEventListener('click', () => {
      this.handlers.onReset();
      this.showToast('Scenario Reset');
    });

    // Speed Multiplier
    this.speedSelect.addEventListener('change', (e) => {
      const speed = parseFloat(e.target.value);
      this.handlers.onSpeedChange(speed);
      this.showToast(`Simulation Speed: ${speed}x`);
    });

    // Camera View Buttons
    this.camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const camMode = btn.getAttribute('data-cam');
        this.setCameraMode(camMode);
        this.handlers.onCameraModeChange(camMode);
      });
    });

    // Layer Toggles
    this.toggleRadarSectorsEl.addEventListener('click', () => {
      const active = this.toggleRadarSectorsEl.classList.toggle('active');
      this.handlers.onToggleRadarSectors(active);
    });

    this.toggleTrajectoryEl.addEventListener('click', () => {
      const active = this.toggleTrajectoryEl.classList.toggle('active');
      this.handlers.onToggleTrajectory(active);
    });

    this.toggleGridEl.addEventListener('click', () => {
      const active = this.toggleGridEl.classList.toggle('active');
      this.handlers.onToggleGrid(active);
    });

    // Atmospheric Toggles
    if (this.toggleEnvWind) {
      this.toggleEnvWind.addEventListener('click', () => {
        const active = this.toggleEnvWind.classList.toggle('active');
        this.handlers.onToggleEnvWind?.(active);
      });
    }


    if (this.toggleEnvFreeze) {
      this.toggleEnvFreeze.addEventListener('click', () => {
        const active = this.toggleEnvFreeze.classList.toggle('active');
        this.handlers.onToggleEnvFreeze?.(active);
      });
    }

    // Hardware Mode Toggle Buttons
    if (this.btnHwSim && this.btnHwReal) {
      this.btnHwSim.addEventListener('click', () => {
        this.btnHwSim.classList.add('active');
        this.btnHwReal.classList.remove('active');
        this.handlers.onHardwareModeChange?.('SIMULATION');
        this.showToast('Hardware: VIRTUAL STM32 SIMULATION');
      });
      this.btnHwReal.addEventListener('click', () => {
        this.btnHwReal.classList.add('active');
        this.btnHwSim.classList.remove('active');
        this.handlers.onHardwareModeChange?.('REAL');
        this.showToast('Hardware: REAL STM32 (ws://localhost:8765)');
      });
    }

    // Operating Mode Tabs
    const modeTabs = [
      { btn: this.btnModeStress, mode: 'stress', panel: this.subpanelStress, name: '1. Environmental Stress' },
      { btn: this.btnModePid, mode: 'pid', panel: this.subpanelPid, name: '2. Closed-Loop PID Compensation' },
      { btn: this.btnModeTracking, mode: 'tracking', panel: this.subpanelTracking, name: '3. Live Drone Tracking' }
    ];

    modeTabs.forEach(({ btn, mode, panel, name }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          modeTabs.forEach((t) => {
            if (t.btn) t.btn.classList.toggle('active', t.mode === mode);
            if (t.panel) t.panel.classList.toggle('active', t.mode === mode);
          });
          this.handlers.onOperatingModeChange?.(mode);
          this.showToast(`Operating Mode: ${name}`);
        });
      }
    });

    // Hardware Control Actions
    if (this.btnHwEnable) this.btnHwEnable.addEventListener('click', () => {
      this.handlers.onHardwareAction?.('enable');
      this.showToast('Hardware Drivers: ENABLED');
    });
    if (this.btnHwDisable) this.btnHwDisable.addEventListener('click', () => {
      this.handlers.onHardwareAction?.('disable');
      this.showToast('Hardware Drivers: DISABLED');
    });
    if (this.btnHwHome) this.btnHwHome.addEventListener('click', () => {
      this.handlers.onHardwareAction?.('home');
      this.showToast('Homing Steppers to Mechanical Zero');
    });
    if (this.btnHwStop) this.btnHwStop.addEventListener('click', () => {
      this.handlers.onHardwareAction?.('stop');
      this.showToast('EMERGENCY STOP TRIGGERED');
    });

    // Mode 1 Sliders
    if (this.sliderEnvWind) {
      this.sliderEnvWind.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valEnvWind) this.valEnvWind.textContent = `${val.toFixed(1)} m/s`;
        this.handlers.onEnvironmentChange?.({ windSpeed: val });
      });
    }
    if (this.sliderEnvTemp) {
      this.sliderEnvTemp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valEnvTemp) this.valEnvTemp.textContent = `${val.toFixed(1)} °C`;
        this.handlers.onEnvironmentChange?.({ temperature: val });
      });
    }

    // Mode 2 Sliders
    const handlePIDChange = () => {
      const kp = parseFloat(this.sliderPidKp?.value || 1.35);
      const ki = parseFloat(this.sliderPidKi?.value || 0.12);
      const kd = parseFloat(this.sliderPidKd?.value || 0.22);
      if (this.valPidKp) this.valPidKp.textContent = kp.toFixed(2);
      if (this.valPidKi) this.valPidKi.textContent = ki.toFixed(2);
      if (this.valPidKd) this.valPidKd.textContent = kd.toFixed(2);
      this.handlers.onPIDChange?.({ kp, ki, kd });
    };

    if (this.sliderPidKp) this.sliderPidKp.addEventListener('input', handlePIDChange);
    if (this.sliderPidKi) this.sliderPidKi.addEventListener('input', handlePIDChange);
    if (this.sliderPidKd) this.sliderPidKd.addEventListener('input', handlePIDChange);

    if (this.selectPidTest) {
      this.selectPidTest.addEventListener('change', (e) => {
        this.handlers.onPIDTestSignalChange?.(e.target.value);
        this.showToast(`PID Input: ${e.target.selectedOptions[0].text}`);
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const isPaused = this.handlers.onTogglePlayPause();
        this.updatePlayPauseState(isPaused);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.handlers.onReset();
        this.showToast('Scenario Reset');
      } else if (e.key >= '1' && e.key <= '5') {
        const camMap = { '1': 'orbit', '2': 'station', '3': 'gimbal', '4': 'drone', '5': 'topdown' };
        const mode = camMap[e.key];
        if (mode) {
          this.setCameraMode(mode);
          this.handlers.onCameraModeChange(mode);
        }
      }
    });
  }

  updatePlayPauseState(isPaused) {
    if (isPaused) {
      this.playIconEl.textContent = '▶';
      this.playLabelEl.textContent = 'RESUME';
      this.playPauseBtn.classList.remove('primary');
      this.sysStatusEl.textContent = 'PAUSED';
      this.showToast('Simulation Paused');
    } else {
      this.playIconEl.textContent = '⏸';
      this.playLabelEl.textContent = 'PAUSE';
      this.playPauseBtn.classList.add('primary');
      this.sysStatusEl.textContent = 'ONLINE / SIMULATING';
      this.showToast('Simulation Resumed');
    }
  }

  setCameraMode(mode) {
    this.camButtons.forEach((btn) => {
      if (btn.getAttribute('data-cam') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (mode === 'gimbal') {
      this.boresightReticle.classList.add('active');
    } else {
      this.boresightReticle.classList.remove('active');
    }

    const titles = {
      orbit: 'Tactical Free Orbit View',
      station: 'Prototype Gimbal Stepper Close-up',
      gimbal: 'Webcam Optical Boresight POV',
      drone: 'Target Drone Chase Camera',
      topdown: 'Top-Down Airspace Radar Overview'
    };
    this.showToast(`Camera: ${titles[mode] || mode}`);
  }

  update({ simTimeFormatted, radarData, activeTarget, gimbalState, hwTelemetry, trackingState, envData, droneWindTiltDeg, connStatus }) {
    // 1. Header counts
    this.simTimeEl.textContent = simTimeFormatted;
    this.activeDronesEl.textContent = radarData.targets.length;

    const detectedCount = radarData.targets.filter((t) => t.isDetected).length;
    this.detectedDronesEl.textContent = detectedCount;

    // 2. Draw 2D Radar PPI Scope
    if (activeTarget) {
      this.radarDisplay.setSelectedTargetId(activeTarget.droneId);
    }
    this.radarDisplay.draw(radarData);

    // 3. Target Telemetry Card
    if (activeTarget) {
      this.targetIdEl.textContent = `TARGET: ${activeTarget.droneId}`;
      this.slantRangeEl.textContent = activeTarget.slantDist.toFixed(2);
      this.speedMsEl.textContent = activeTarget.speed.toFixed(1);
      this.speedKmhEl.textContent = (activeTarget.speed * 3.6).toFixed(1);

      this.radarSourceEl.textContent = activeTarget.detectionSource;
      if (activeTarget.detectionSource === 'BOTH') {
        this.radarSourceEl.style.color = 'var(--accent-cyan)';
      } else if (activeTarget.detectionSource === 'RADAR A') {
        this.radarSourceEl.style.color = 'var(--accent-green)';
      } else if (activeTarget.detectionSource === 'RADAR B') {
        this.radarSourceEl.style.color = 'var(--accent-amber)';
      } else {
        this.radarSourceEl.style.color = 'var(--text-dim)';
      }

      if (activeTarget.isNeutralized) {
        this.threatLevelEl.textContent = 'NEUTRALIZED';
        this.threatLevelEl.style.color = '#ef4444';
        this.targetIdEl.textContent = `TARGET: ${activeTarget.droneId} [KILLED]`;
      } else {
        this.threatLevelEl.textContent = activeTarget.threatLevel;
        if (activeTarget.threatLevel === 'CRITICAL') {
          this.threatLevelEl.style.color = 'var(--accent-red)';
        } else if (activeTarget.threatLevel === 'HIGH') {
          this.threatLevelEl.style.color = 'var(--accent-amber)';
        } else if (activeTarget.threatLevel === 'MEDIUM') {
          this.threatLevelEl.style.color = 'var(--accent-cyan)';
        } else {
          this.threatLevelEl.style.color = 'var(--text-secondary)';
        }
      }

      if (this.valBuildingDist) {
        if (activeTarget.buildingDist !== undefined && activeTarget.buildingDist !== null) {
          this.valBuildingDist.textContent = activeTarget.buildingDist.toFixed(1);
          if (this.valSettlementThreat) {
            if (activeTarget.buildingDist < 2.5) {
              this.valSettlementThreat.textContent = 'CRITICAL SETTLEMENT HAZARD!';
              this.valSettlementThreat.style.color = 'var(--accent-red)';
            } else if (activeTarget.buildingDist < 5.0) {
              this.valSettlementThreat.textContent = 'HIGH SETTLEMENT PROXIMITY';
              this.valSettlementThreat.style.color = 'var(--accent-amber)';
            } else {
              this.valSettlementThreat.textContent = 'PERIMETER CORRIDOR';
              this.valSettlementThreat.style.color = 'var(--accent-cyan)';
            }
          }
        } else {
          this.valBuildingDist.textContent = '--';
          if (this.valSettlementThreat) {
            this.valSettlementThreat.textContent = 'Distance to structures';
            this.valSettlementThreat.style.color = 'var(--text-dim)';
          }
        }
      }

      this.posXEl.textContent = activeTarget.position.x.toFixed(2);
      this.posYEl.textContent = activeTarget.position.y.toFixed(2);
      this.posZEl.textContent = activeTarget.position.z.toFixed(2);

      this.velXEl.textContent = activeTarget.velocity.x.toFixed(2);
      this.velYEl.textContent = activeTarget.velocity.y.toFixed(2);
      this.velZEl.textContent = activeTarget.velocity.z.toFixed(2);

      this.targetAzimuthEl.textContent = activeTarget.bearingDeg.toFixed(1).padStart(5, '0');
      const elev = THREE.MathUtils.radToDeg(Math.atan2(activeTarget.position.y, activeTarget.horizontalDist));
      this.targetElevationEl.textContent = `${elev >= 0 ? '+' : ''}${elev.toFixed(1)}°`;

      this.compassNeedleEl.style.transform = `rotate(${activeTarget.bearingDeg}deg)`;
    }

    // 4. Stepper Angles
    if (gimbalState) {
      this.gimbalPanEl.textContent = gimbalState.panDeg.toFixed(1);
      this.gimbalTiltEl.textContent = `${gimbalState.tiltDeg >= 0 ? '+' : ''}${gimbalState.tiltDeg.toFixed(1)}`;
      this.trackingStatusEl.textContent = gimbalState.status;
      this.trackingStatusEl.style.color = gimbalState.status === 'LOCKED' ? 'var(--accent-green)' : (gimbalState.status === 'TRACKING' ? 'var(--accent-cyan)' : 'var(--text-dim)');
    }

    // 5. Hardware Interface & Stepper Step Telemetry
    if (hwTelemetry) {
      if (this.valHwPanSteps) this.valHwPanSteps.textContent = hwTelemetry.pan;
      if (this.valHwTiltSteps) this.valHwTiltSteps.textContent = hwTelemetry.tilt;
      if (this.valHwPanTgt) this.valHwPanTgt.textContent = hwTelemetry.pan_target;
      if (this.valHwTiltTgt) this.valHwTiltTgt.textContent = hwTelemetry.tilt_target;

      if (this.valHwTempM1) this.valHwTempM1.textContent = hwTelemetry.pan_temp.toFixed(1);
      if (this.valHwTempM2) this.valHwTempM2.textContent = hwTelemetry.tilt_temp.toFixed(1);
      if (this.valHwHeater) {
        this.valHwHeater.textContent = hwTelemetry.heater ? 'ON (ACTIVE)' : 'OFF';
        this.valHwHeater.style.color = hwTelemetry.heater ? 'var(--accent-amber)' : 'var(--accent-green)';
      }
    }

    // 6. Connection Status Pill
    if (connStatus && this.hwStatusStrip && this.hwStatusText) {
      this.hwStatusStrip.className = connStatus.connected ? 'hw-status-strip connected' : 'hw-status-strip disconnected';
      this.hwStatusText.textContent = connStatus.text;
    }

    // 7. Operating Mode Specific Telemetry & Live Graphs
    if (trackingState) {
      // Mode 1: Environmental metrics
      if (trackingState.envData) {
        if (this.valEnvTorque) this.valEnvTorque.textContent = `${trackingState.envData.dragTorqueNm.toFixed(2)} Nm`;
        if (this.valEnvErrPan) {
          const ep = trackingState.envData.disturbancePanDeg;
          this.valEnvErrPan.textContent = `${ep >= 0 ? '+' : ''}${ep.toFixed(1)}°`;
        }
        if (this.valEnvErrTilt) {
          const et = trackingState.envData.disturbanceTiltDeg;
          this.valEnvErrTilt.textContent = `${et >= 0 ? '+' : ''}${et.toFixed(1)}°`;
        }
      }

      // Mode 3: Azimuth & Elevation Lock readouts
      if (this.valTrackLockAz) {
        this.valTrackLockAz.textContent = `±${Math.abs(trackingState.panErrorDeg).toFixed(1)}°`;
      }
      if (this.valTrackLockEl) {
        this.valTrackLockEl.textContent = `±${Math.abs(trackingState.tiltErrorDeg).toFixed(1)}°`;
      }

      // Mode 2: Live PID Graphs
      this.updatePIDHistoryAndGraphs(trackingState);
    }

    // 8. Update Atmospheric Stress & Machine Reaction Monitor Card
    const env = envData || trackingState?.envData;
    if (env) {
      if (this.valRxnTorque) {
        this.valRxnTorque.textContent = `${env.dragTorqueNm.toFixed(2)} Nm`;
      }
      if (this.valRxnDeflection) {
        const p = env.disturbancePanDeg;
        const t = env.disturbanceTiltDeg;
        this.valRxnDeflection.textContent = `P: ${p >= 0 ? '+' : ''}${p.toFixed(1)}° | T: ${t >= 0 ? '+' : ''}${t.toFixed(1)}°`;
      }
      if (this.valRxnDroneTilt) {
        const tiltDeg = droneWindTiltDeg !== undefined ? droneWindTiltDeg : (env.isHighWind ? 17.5 : 0.0);
        this.valRxnDroneTilt.textContent = tiltDeg > 1.0 ? `${tiltDeg.toFixed(1)}° (Wind Lean)` : '0.0° (Level)';
        this.valRxnDroneTilt.style.color = tiltDeg > 5.0 ? 'var(--accent-amber)' : 'var(--accent-cyan)';
      }
      if (this.valRxnViscosity) {
        this.valRxnViscosity.textContent = env.ambientTemp < 0 ? 'STIFFENED (+35%)' : 'NOMINAL';
        this.valRxnViscosity.style.color = env.ambientTemp < 0 ? 'var(--accent-amber)' : 'var(--accent-green)';
      }
      if (this.envStressBadge) {
        this.envStressBadge.textContent = `STRESS: ${env.stressIndex}%`;
        if (env.stressIndex > 65) {
          this.envStressBadge.style.color = 'var(--accent-red)';
        } else if (env.stressIndex > 35) {
          this.envStressBadge.style.color = 'var(--accent-amber)';
        } else {
          this.envStressBadge.style.color = 'var(--accent-cyan)';
        }
      }
      if (this.valRxnMachine) {
        const currentMode = trackingState?.mode || 'tracking';
        if (currentMode === 'stress') {
          this.valRxnMachine.textContent = 'EXPOSED | UNCOMPENSATED DEFLECTION';
          this.valRxnMachine.style.color = 'var(--accent-amber)';
        } else if (currentMode === 'pid') {
          this.valRxnMachine.textContent = 'COMPENSATING | PID CLOSED-LOOP GUST REJECTION';
          this.valRxnMachine.style.color = 'var(--accent-cyan)';
        } else {
          const isWindy = env.isHighWind || env.windSpeed > 10;
          this.valRxnMachine.textContent = isWindy ? 'LOCKED | DYNAMIC GUST LEAD-TRACKING ON' : 'STABILIZED | DIGITAL TWIN SYNC';
          this.valRxnMachine.style.color = isWindy ? 'var(--accent-green)' : 'var(--text-secondary)';
        }
      }
    }
  }

  updatePIDHistoryAndGraphs(trackingState) {
    this.pidHistory.push({
      target: trackingState.targetPanDeg,
      actual: trackingState.actualPanDeg,
      error: trackingState.panErrorDeg
    });

    if (this.pidHistory.length > this.maxPidPoints) {
      this.pidHistory.shift();
    }

    // Render Canvas 1: Target vs Actual
    if (this.ctxPidResponse && this.canvasPidResponse) {
      const ctx = this.ctxPidResponse;
      const w = this.canvasPidResponse.width;
      const h = this.canvasPidResponse.height;

      ctx.fillStyle = '#080c12';
      ctx.fillRect(0, 0, w, h);

      // Grid center line
      ctx.strokeStyle = 'rgba(70, 100, 140, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const count = this.pidHistory.length;
      if (count > 1) {
        const spanY = 80; // range -40° to +40°
        const mapY = (val) => h / 2 - (val / spanY) * (h - 8);

        // Draw Target Line (Green)
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = (i / (this.maxPidPoints - 1)) * w;
          const y = mapY(this.pidHistory[i].target);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw Actual Measured Line (Cyan)
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = (i / (this.maxPidPoints - 1)) * w;
          const y = mapY(this.pidHistory[i].actual);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Render Canvas 2: Position Error vs Time
    if (this.ctxPidError && this.canvasPidError) {
      const ctx = this.ctxPidError;
      const w = this.canvasPidError.width;
      const h = this.canvasPidError.height;

      ctx.fillStyle = '#080c12';
      ctx.fillRect(0, 0, w, h);

      // Center zero line
      ctx.strokeStyle = 'rgba(70, 100, 140, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const count = this.pidHistory.length;
      if (count > 1) {
        const spanErr = 30; // -15° to +15°
        const mapY = (val) => h / 2 - (val / spanErr) * (h - 8);

        // Draw Error Line (Red)
        ctx.strokeStyle = '#ff3355';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = (i / (this.maxPidPoints - 1)) * w;
          const y = mapY(this.pidHistory[i].error);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  showToast(message) {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2200);
  }

  showNeutralizationBanner(targetId = 'TARGET', nextTargetId = null, remainingCount = 0, buildingDist = null) {
    if (this.neutralizedBannerTimeout) clearTimeout(this.neutralizedBannerTimeout);
    if (this.neutralizedBanner) {
      const textEl = document.getElementById('kill-target-text');
      if (textEl) {
        let bldInfo = '';
        if (buildingDist !== null && buildingDist !== undefined) {
          bldInfo = ` [PROX: ${buildingDist.toFixed(1)}m]`;
        }
        if (remainingCount > 0 && nextTargetId) {
          textEl.innerHTML = `<strong>${targetId} DESTROYED${bldInfo}</strong> | AUTO-LOCK: <strong style="color: #00f0ff;">${nextTargetId}</strong> (${remainingCount} REMAINING)`;
        } else if (remainingCount === 0) {
          textEl.innerHTML = `<strong>${targetId} DESTROYED${bldInfo}</strong> | <strong style="color: #00ff88;">ALL THREATS ELIMINATED — SETTLEMENT SECURED</strong>`;
        } else {
          textEl.textContent = `${targetId} DESTROYED${bldInfo}`;
        }
      }
      this.neutralizedBanner.classList.add('visible');
      this.neutralizedBannerTimeout = setTimeout(() => {
        this.neutralizedBanner.classList.remove('visible');
      }, 3500);
    }
  }
}
