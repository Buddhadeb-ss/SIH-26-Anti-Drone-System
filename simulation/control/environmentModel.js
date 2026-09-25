/**
 * environmentModel.js
 * High-Altitude Ladakh Atmospheric & Mechanical Disturbance Model.
 * 
 * Simulates environmental stress on the 2-axis gimbal:
 * 1. Aerodynamic wind drag and turbulent gusts on the webcam/tilt assembly
 * 2. High-altitude low atmospheric pressure (4,120m MSL ~ 62 kPa)
 * 3. Sub-zero extreme temperatures (-25°C to +15°C) affecting motor coil resistance
 *    and bearing lubricant viscosity
 * 4. Generates calculated disturbance torques and angular deviation
 */

export class EnvironmentModel {
  constructor() {
    // Environmental parameters
    this.altitudeMSL = 4120; // metres (Ladakh outpost base)
    this.ambientTemperature = -12.0; // °C
    this.baseWindSpeed = 1.0; // m/s (calm Himalayan mountain air default)
    this.windBearingDeg = 45.0; // degrees from North
    this.gustIntensity = 0.05; // calm variation

    // Physical gimbal aerodynamics
    this.frontalArea = 0.016; // m^2 (capsule camera + bracket)
    this.dragCoefficient = 1.15; // bluff body drag
    this.momentArm = 0.12; // metres from tilt/pan pivot to center of pressure

    // Dynamic state
    this.currentWindSpeed = this.baseWindSpeed;
    this.airDensity = 0.785; // kg/m^3 at 4,120m MSL
    this.airPressureKPa = 61.8; // kPa

    this.simTime = 0;
    this.disturbancePanDeg = 0;
    this.disturbanceTiltDeg = 0;
    this.dragTorqueNm = 0;

    // Toggle States
    this.isHighWind = false;
    this.isLowPressure = true; // High-Altitude default (4,120m MSL ~ 61.8 kPa thin air)
    this.isHighPressure = false;
    this.isSubZeroFreeze = true;

    // Recalculate based on initial parameters
    this.recalculateAtmosphere();
  }

  setHighWind(enabled) {
    this.isHighWind = Boolean(enabled);
    this.baseWindSpeed = this.isHighWind ? 26.0 : 1.0;
    this.currentWindSpeed = this.baseWindSpeed;
    this.gustIntensity = this.isHighWind ? 0.65 : 0.05;
  }

  setLowPressure(enabled) {
    this.isLowPressure = Boolean(enabled);
    this.isHighPressure = !this.isLowPressure;
    this.recalculateAtmosphere();
  }

  setHighPressure(enabled) {
    this.isHighPressure = Boolean(enabled);
    this.isLowPressure = !this.isHighPressure;
    this.recalculateAtmosphere();
  }

  setSubZeroFreeze(enabled) {
    this.isSubZeroFreeze = Boolean(enabled);
    this.ambientTemperature = this.isSubZeroFreeze ? -22.0 : 18.0;
    this.recalculateAtmosphere();
  }

  setConditions({ windSpeed, temperature, altitude, windBearing }) {
    if (windSpeed !== undefined && !isNaN(windSpeed)) {
      this.baseWindSpeed = Math.max(0, windSpeed);
      this.isHighWind = this.baseWindSpeed >= 15.0;
    }
    if (temperature !== undefined && !isNaN(temperature)) {
      this.ambientTemperature = temperature;
      this.isSubZeroFreeze = this.ambientTemperature < 0.0;
    }
    if (altitude !== undefined && !isNaN(altitude)) this.altitudeMSL = Math.max(0, altitude);
    if (windBearing !== undefined && !isNaN(windBearing)) this.windBearingDeg = windBearing;

    this.recalculateAtmosphere();
  }

  recalculateAtmosphere() {
    const T_kelvin = this.ambientTemperature + 273.15;
    const R_specific = 287.058; // J/(kg·K)

    if (this.isHighPressure) {
      // Dense storm / sea-level pressure (101.3 kPa, ~1.225 kg/m³)
      this.airPressureKPa = 101.325;
      this.airDensity = (this.airPressureKPa * 1000) / (R_specific * T_kelvin);
    } else {
      // Standard ISA barometric formula at high altitude (4,120m MSL ~ 61.8 kPa, ~0.785 kg/m³)
      const T0 = 288.15;
      const L = 0.0065;
      const P0 = 101.325;
      const g0 = 9.80665;
      const M = 0.0289644;
      const R0 = 8.31447;
      const exp = (g0 * M) / (R0 * L);
      this.airPressureKPa = P0 * Math.pow(Math.max(0.1, 1 - (L * this.altitudeMSL) / T0), exp);
      this.airDensity = (this.airPressureKPa * 1000) / (R_specific * T_kelvin);
    }
  }

  /**
   * Update dynamic disturbance forces for the current simulation frame
   * @param {number} dt Delta time
   * @param {number} currentPanDeg Current Pan gimbal angle
   * @param {number} currentTiltDeg Current Tilt gimbal angle
   * @returns {Object} Disturbance details
   */
  update(dt, currentPanDeg = 0, currentTiltDeg = 0) {
    this.simTime += dt;

    // Multi-frequency wind turbulence
    const gustWave1 = Math.sin(this.simTime * 0.85);
    const gustWave2 = Math.sin(this.simTime * 2.3 + 1.2) * 0.5;
    const gustWave3 = Math.sin(this.simTime * 5.7) * 0.25;
    const gustFactor = 1.0 + (gustWave1 + gustWave2 + gustWave3) * this.gustIntensity;

    this.currentWindSpeed = Math.max(0, this.baseWindSpeed * gustFactor);

    // Dynamic wind pressure: q = 0.5 * rho * v^2
    const dynamicPressure = 0.5 * this.airDensity * Math.pow(this.currentWindSpeed, 2);

    // Relative angle between wind vector and gimbal optical boresight
    const relBearingRad = ((this.windBearingDeg - currentPanDeg) * Math.PI) / 180;
    const dragForce = dynamicPressure * this.dragCoefficient * this.frontalArea;
    this.dragTorqueNm = dragForce * this.momentArm;

    // Angular disturbance on Pan axis (lateral component of wind)
    // Low temperature increases mechanical friction/stiffness
    const coldStiffnessFactor = this.ambientTemperature < 0
      ? 1.0 + Math.abs(this.ambientTemperature) * 0.015
      : 1.0;

    // Expected angular disturbance displacement
    const deflectionScale = 0.14 * coldStiffnessFactor;
    this.disturbancePanDeg = Math.sin(relBearingRad) * this.dragTorqueNm * deflectionScale * 180 / Math.PI;

    // Vertical pitch disturbance (aerodynamic lift/downforce component)
    const pitchRel = (currentTiltDeg * Math.PI) / 180;
    this.disturbanceTiltDeg = Math.sin(pitchRel + 0.2) * (this.dragTorqueNm * 0.55 * deflectionScale * 180 / Math.PI) +
      (gustWave2 * (this.isHighWind ? 0.45 : 0.08));

    // Stress index from 0 to 100%
    const stressIndex = Math.min(100, Math.round(
      (this.currentWindSpeed / 25.0) * 50 +
      (Math.max(0, -this.ambientTemperature) / 25.0) * 30 +
      ((this.airDensity - 0.7) / 0.6) * 20
    ));

    return {
      windSpeed: this.currentWindSpeed,
      baseWindSpeed: this.baseWindSpeed,
      ambientTemp: this.ambientTemperature,
      airPressureKPa: this.airPressureKPa,
      airDensity: this.airDensity,
      dragTorqueNm: this.dragTorqueNm,
      disturbancePanDeg: this.disturbancePanDeg,
      disturbanceTiltDeg: this.disturbanceTiltDeg,
      stressIndex,
      isHighWind: this.isHighWind,
      isLowPressure: this.isLowPressure,
      isHighPressure: this.isHighPressure,
      isSubZeroFreeze: this.isSubZeroFreeze
    };
  }
}
