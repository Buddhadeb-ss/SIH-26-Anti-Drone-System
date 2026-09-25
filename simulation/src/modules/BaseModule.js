/**
 * BaseModule.js
 * Base class for all modular subsystems in SIH26050 Digital Twin.
 * Structured to allow subsequent phases to plug in Radar Detection,
 * Computer Vision, Sensor Fusion, PID Gimbal Control, and Environmental
 * Compensation without modifying the 3D core.
 */
export class BaseModule {
  constructor(name = 'BaseModule') {
    this.name = name;
    this.enabled = true;
    this.initialized = false;
  }

  /**
   * Initialize module with simulation context
   * @param {Object} context - Contains scene, drone, station, telemetry
   */
  init(context) {
    this.context = context;
    this.initialized = true;
  }

  /**
   * Called every simulation frame
   * @param {number} deltaTime - Frame delta in seconds
   * @param {Object} state - Current simulation state
   */
  update(deltaTime, state) {
    if (!this.enabled || !this.initialized) return;
    // Overridden by sub-modules
  }

  /**
   * Reset module state
   */
  reset() {
    // Overridden by sub-modules
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  destroy() {
    this.enabled = false;
    this.initialized = false;
  }
}
