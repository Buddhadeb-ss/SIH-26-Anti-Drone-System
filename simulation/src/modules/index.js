/**
 * Central module registry for SIH26050 digital twin.
 * Allows easy plug-and-play extension for subsequent development phases.
 */
export { BaseModule } from './BaseModule.js';
export { RadarDetectionModule } from './RadarDetectionModule.js';
export { CameraDetectionModule } from './CameraDetectionModule.js';
export { SensorFusionModule } from './SensorFusionModule.js';
export { TargetTrackingModule } from './TargetTrackingModule.js';
export { GimbalControllerModule } from './GimbalControllerModule.js';
export { ThermalMonitoringModule } from './ThermalMonitoringModule.js';
export { EnvironmentalEffectsModule } from './EnvironmentalEffectsModule.js';
export { CompensationAlgorithmsModule } from './CompensationAlgorithmsModule.js';
