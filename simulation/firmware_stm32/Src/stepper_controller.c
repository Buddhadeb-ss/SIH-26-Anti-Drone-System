/**
 * ============================================================================
 * SIH26050 2-AXIS STEPPER CONTROLLER MODULE IMPLEMENTATION
 * ============================================================================
 */

#include "stepper_controller.h"
#include <stdlib.h>
#include <math.h>

static GimbalController_t gimbal;

// Hardware pin toggle helper (Adapt for STM32 HAL: HAL_GPIO_WritePin)
#ifdef USE_STM32_HAL
#include "main.h"
static inline void write_pin(GPIO_TypeDef* port, uint16_t pin, uint8_t val) {
    HAL_GPIO_WritePin(port, pin, val ? GPIO_PIN_SET : GPIO_PIN_RESET);
}
#else
// Generic fallback macros if compiling outside CubeMX
static inline void write_pin(void* port, uint16_t pin, uint8_t val) {
    (void)port; (void)pin; (void)val;
}
#endif

void Stepper_Init(void) {
    // Pan axis setup
    gimbal.pan.current_position = 0;
    gimbal.pan.target_position = 0;
    gimbal.pan.min_limit = PAN_LIMIT_MIN_STEPS;
    gimbal.pan.max_limit = PAN_LIMIT_MAX_STEPS;
    gimbal.pan.current_speed = 0.0f;
    gimbal.pan.target_speed = (float)STEPPER_MAX_SPEED_HZ;
    gimbal.pan.direction = 0;
    gimbal.pan.enabled = 1;
    gimbal.pan.homed = 1;

    // Tilt axis setup
    gimbal.tilt.current_position = 0;
    gimbal.tilt.target_position = 0;
    gimbal.tilt.min_limit = TILT_LIMIT_MIN_STEPS;
    gimbal.tilt.max_limit = TILT_LIMIT_MAX_STEPS;
    gimbal.tilt.current_speed = 0.0f;
    gimbal.tilt.target_speed = (float)STEPPER_MAX_SPEED_HZ;
    gimbal.tilt.direction = 0;
    gimbal.tilt.enabled = 1;
    gimbal.tilt.homed = 1;

    // Thermal simulation state
    gimbal.pan_temperature_c = 22.5f;
    gimbal.tilt_temperature_c = 21.8f;
    gimbal.heater_active = 0;
    gimbal.emergency_stopped = 0;

    Stepper_EnableDrivers(1);
}

void Stepper_EnableDrivers(uint8_t enable) {
    gimbal.pan.enabled = enable;
    gimbal.tilt.enabled = enable;

#if DRIVER_ENABLE_ACTIVE_LEVEL == 0
    uint8_t pin_state = enable ? 0 : 1; // Active LOW: 0 enables FETs
#else
    uint8_t pin_state = enable ? 1 : 0;
#endif

    write_pin(PAN_EN_PORT, PAN_EN_PIN, pin_state);
    write_pin(TILT_EN_PORT, TILT_EN_PIN, pin_state);
}

void Stepper_SetTargetPositions(int32_t pan_steps, int32_t tilt_steps) {
    if (gimbal.emergency_stopped) {
        return; // Reject moves until clear
    }

    // Hardware Limit Clamping (Prevents mechanical collision or wire twisting)
    if (pan_steps < gimbal.pan.min_limit) pan_steps = gimbal.pan.min_limit;
    if (pan_steps > gimbal.pan.max_limit) pan_steps = gimbal.pan.max_limit;

    if (tilt_steps < gimbal.tilt.min_limit) tilt_steps = gimbal.tilt.min_limit;
    if (tilt_steps > gimbal.tilt.max_limit) tilt_steps = gimbal.tilt.max_limit;

    gimbal.pan.target_position = pan_steps;
    gimbal.tilt.target_position = tilt_steps;
}

void Stepper_SetRatePan(char dir, uint8_t speed) {
    if (gimbal.emergency_stopped) return;
    if (speed < 1) speed = 1;
    if (speed > 20) speed = 20;
    float step_rate = 2250.0f - (float)speed * 105.0f;
    if (step_rate < 80.0f) step_rate = 80.0f;
    gimbal.pan.direction = (dir == 'R') ? 1 : -1;
    gimbal.pan.current_speed = step_rate;
    gimbal.pan.target_position = (gimbal.pan.direction > 0) ? gimbal.pan.max_limit : gimbal.pan.min_limit;
}

void Stepper_SetRateTilt(char dir, uint8_t speed) {
    if (gimbal.emergency_stopped) return;
    if (speed < 1) speed = 1;
    if (speed > 20) speed = 20;
    float step_rate = 2250.0f - (float)speed * 105.0f;
    if (step_rate < 80.0f) step_rate = 80.0f;
    gimbal.tilt.direction = (dir == 'D') ? 1 : -1; // Down is positive, Up is negative elevation
    gimbal.tilt.current_speed = step_rate;
    gimbal.tilt.target_position = (gimbal.tilt.direction > 0) ? gimbal.tilt.max_limit : gimbal.tilt.min_limit;
}

void Stepper_HomeAxes(void) {
    // Re-zero current coordinate datum to physical zero
    gimbal.pan.current_position = 0;
    gimbal.pan.target_position = 0;
    gimbal.pan.current_speed = 0.0f;
    gimbal.pan.direction = 0;

    gimbal.tilt.current_position = 0;
    gimbal.tilt.target_position = 0;
    gimbal.tilt.current_speed = 0.0f;
    gimbal.tilt.direction = 0;

    gimbal.pan.homed = 1;
    gimbal.tilt.homed = 1;
    gimbal.emergency_stopped = 0;
}

void Stepper_EmergencyStop(void) {
    gimbal.pan.direction = 0;
    gimbal.tilt.direction = 0;
    gimbal.pan.target_position = gimbal.pan.current_position;
    gimbal.tilt.target_position = gimbal.tilt.current_position;
    gimbal.pan.current_speed = 0.0f;
    gimbal.tilt.current_speed = 0.0f;
}

void Stepper_UpdateKinematics(float dt) {
    if (dt <= 0.0001f) return;

    // Thermal dissipation and PTC anti-freeze simulation (Ladakh sub-zero protection)
    float power_draw = 0.5f;
    if (abs(gimbal.pan.current_position - gimbal.pan.target_position) > 2 ||
        abs(gimbal.tilt.current_position - gimbal.tilt.target_position) > 2) {
        power_draw += 1.8f; // Motors active
    }

    // Auto PTC anti-freeze heater turns on below 5°C
    if (gimbal.pan_temperature_c < 5.0f) {
        gimbal.heater_active = 1;
        write_pin(PTC_HEATER_PORT, PTC_HEATER_PIN, 1);
    } else if (gimbal.pan_temperature_c > 18.0f) {
        gimbal.heater_active = 0;
        write_pin(PTC_HEATER_PORT, PTC_HEATER_PIN, 0);
    }

    float target_thermal = 20.0f + (power_draw * 2.5f) + (gimbal.heater_active ? 15.0f : 0.0f);
    gimbal.pan_temperature_c += (target_thermal - gimbal.pan_temperature_c) * (dt * 0.05f);
    gimbal.tilt_temperature_c += (target_thermal - 0.7f - gimbal.tilt_temperature_c) * (dt * 0.05f);
}

/**
 * High-Speed Pulse Generator ISR
 * Call this inside TIM2/TIM3 Period Elapsed Callback at 10 kHz - 20 kHz
 */
void Stepper_TimerInterrupt_Handler(void) {
    // 1. PAN AXIS PULSE
    if (gimbal.pan.enabled && !gimbal.emergency_stopped) {
        if (gimbal.pan.current_position < gimbal.pan.target_position) {
            write_pin(PAN_DIR_PORT, PAN_DIR_PIN, PAN_DIR_INVERT ? 0 : 1); // Towards Right
            gimbal.pan.current_position++;
            write_pin(PAN_STEP_PORT, PAN_STEP_PIN, 1);
            write_pin(PAN_STEP_PORT, PAN_STEP_PIN, 0);
        } else if (gimbal.pan.current_position > gimbal.pan.target_position) {
            write_pin(PAN_DIR_PORT, PAN_DIR_PIN, PAN_DIR_INVERT ? 1 : 0); // Towards Left
            gimbal.pan.current_position--;
            write_pin(PAN_STEP_PORT, PAN_STEP_PIN, 1);
            write_pin(PAN_STEP_PORT, PAN_STEP_PIN, 0);
        }
    }

    // 2. TILT AXIS PULSE
    if (gimbal.tilt.enabled && !gimbal.emergency_stopped) {
        if (gimbal.tilt.current_position < gimbal.tilt.target_position) {
            write_pin(TILT_DIR_PORT, TILT_DIR_PIN, 1); // Downward
            gimbal.tilt.current_position++;
            write_pin(TILT_STEP_PORT, TILT_STEP_PIN, 1);
            write_pin(TILT_STEP_PORT, TILT_STEP_PIN, 0);
        } else if (gimbal.tilt.current_position > gimbal.tilt.target_position) {
            write_pin(TILT_DIR_PORT, TILT_DIR_PIN, 0); // Upward
            gimbal.tilt.current_position--;
            write_pin(TILT_STEP_PORT, TILT_STEP_PIN, 1);
            write_pin(TILT_STEP_PORT, TILT_STEP_PIN, 0);
        }
    }
}

GimbalController_t* Stepper_GetState(void) {
    return &gimbal;
}
