/**
 * ============================================================================
 * SIH26050 ANTI-DRONE SYSTEM - 2-AXIS GIMBAL CONTROLLER CONFIGURATION
 * ============================================================================
 * Target MCU: STM32F4 / STM32F1 / STM32G4 / STM32H7 (Any ARM Cortex-M)
 * System Clock: 72 MHz - 168 MHz
 * UART Baud: 115200 Baud, 8-N-1, Newline Delimited JSON
 * ============================================================================
 */

#ifndef GIMBAL_CONFIG_H
#define GIMBAL_CONFIG_H

#include <stdint.h>

// ============================================================================
// 1. MECHANICAL & STEPPER CALIBRATION (Matched 1:1 with Three.js Simulation)
// ============================================================================
// Formula: (Motor_Steps_Per_Rev * Microstepping * Gear_Ratio) / 360.0
// Standard NEMA-17: 200 steps/rev (1.8°), TMC2209/A4988 at 1/16 microstep = 3200 steps/rev
// 3200 steps / 360 degrees = 8.8888889 steps per degree
#define PAN_STEPS_PER_DEGREE       (8.8888889f)
#define TILT_STEPS_PER_DEGREE      (8.8888889f)

// Safe Mechanical Travel Limits (in steps)
// PAN Range:  -180° to +180°  ==> -1600 to +1600 steps
// TILT Range:  -75° to  +85°  ==>  -667 to  +756 steps (-75° = upward elevation, +85° = depression)
#define PAN_LIMIT_MIN_STEPS        (-1600)
#define PAN_LIMIT_MAX_STEPS        (1600)
#define TILT_LIMIT_MIN_STEPS       (-667)
#define TILT_LIMIT_MAX_STEPS       (756)

// Kinematic Limits for Stepper Controller
#define STEPPER_MAX_SPEED_HZ       (4000)   // Maximum step frequency (steps/sec)
#define STEPPER_ACCELERATION       (8000)   // Step acceleration (steps/sec^2)
#define STEP_PULSE_WIDTH_US        (3)      // Minimum step pulse width in microseconds

// ============================================================================
// 2. TIMING & PROTOCOL CONFIGURATION
// ============================================================================
#define UART_BAUDRATE              (115200)
#define TELEMETRY_INTERVAL_MS      (50)     // 20 Hz Telemetry broadcast rate
#define RX_BUFFER_SIZE             (256)    // Maximum JSON packet length
#define TX_BUFFER_SIZE             (256)

// ============================================================================
// 3. HARDWARE GPIO PIN MAPPING & MOTOR DIRECTION POLARITY
// ============================================================================
// Direction Polarity Inversion (1 = Invert Pan DIR, 0 = Normal)
// Hardware in the loop fix: User physical stepper motor wiring requires inverted DIR polarity
#define PAN_DIR_INVERT             (1)          // 1 = Inverted (PC4 LOW = Right, HIGH = Left)
#define TILT_DIR_INVERT            (0)          // 0 = Standard (PC2 HIGH = Down, LOW = Up)

// PAN Stepper Driver (Axis 1 - Azimuth)
#define PAN_DIR_PIN                GPIO_PIN_4   // PC4: DIR
#define PAN_DIR_PORT               GPIOC
#define PAN_STEP_PIN               GPIO_PIN_5   // PC5: STEP Pulse
#define PAN_STEP_PORT              GPIOC
#define PAN_EN_PIN                 GPIO_PIN_0   // Optional Driver EN (Active LOW)
#define PAN_EN_PORT                GPIOA

// TILT Stepper Driver (Axis 2 - Elevation)
#define TILT_DIR_PIN               GPIO_PIN_2   // PC2: DIR (HIGH = Down, LOW = Up)
#define TILT_DIR_PORT              GPIOC
#define TILT_STEP_PIN              GPIO_PIN_3   // PC3: STEP Pulse
#define TILT_STEP_PORT             GPIOC
#define TILT_EN_PIN                GPIO_PIN_1   // Optional Driver EN (Active LOW)
#define TILT_EN_PORT               GPIOA

// Optional Endstops / Limit Switches (Active LOW with internal pull-up)
#define PAN_LIMIT_PIN              GPIO_PIN_6
#define PAN_LIMIT_PORT             GPIOA
#define TILT_LIMIT_PIN             GPIO_PIN_7
#define TILT_LIMIT_PORT            GPIOA

// Optional PTC Anti-Freeze Heater Control Output (Active HIGH MOSFET)
#define PTC_HEATER_PIN             GPIO_PIN_8
#define PTC_HEATER_PORT            GPIOA

// Stepper Enable Logic Level:
// Most driver boards (A4988, DRV8825, TMC2209) are Active LOW (0 = Enabled, 1 = Disabled)
#define DRIVER_ENABLE_ACTIVE_LEVEL (0)

#endif // GIMBAL_CONFIG_H
