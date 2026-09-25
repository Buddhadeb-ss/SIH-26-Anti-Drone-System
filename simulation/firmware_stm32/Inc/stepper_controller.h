/**
 * ============================================================================
 * SIH26050 2-AXIS STEPPER CONTROLLER MODULE
 * ============================================================================
 */

#ifndef STEPPER_CONTROLLER_H
#define STEPPER_CONTROLLER_H

#include "gimbal_config.h"

typedef struct {
    int32_t current_position;  // Current step position
    int32_t target_position;   // Target setpoint commanded by Laptop
    int32_t min_limit;         // Minimum travel clamp
    int32_t max_limit;         // Maximum travel clamp
    float   current_speed;     // Current step rate (steps/sec)
    float   target_speed;      // Maximum slew rate
    int8_t  direction;         // 1 = Forward/CW, -1 = Backward/CCW, 0 = Stopped
    uint8_t enabled;           // 1 = Drivers energized, 0 = Free wheeling
    uint8_t homed;             // 1 = Zero position calibrated
} StepperAxis_t;

typedef struct {
    StepperAxis_t pan;
    StepperAxis_t tilt;
    float pan_temperature_c;   // Measured or modeled temperature (°C)
    float tilt_temperature_c;
    uint8_t heater_active;     // 1 = PTC heater running, 0 = OFF
    uint8_t emergency_stopped; // 1 = Software E-Stop active
} GimbalController_t;

// Public API
void Stepper_Init(void);
void Stepper_EnableDrivers(uint8_t enable);
void Stepper_SetTargetPositions(int32_t pan_steps, int32_t tilt_steps);
void Stepper_SetRatePan(char dir, uint8_t speed);
void Stepper_SetRateTilt(char dir, uint8_t speed);
void Stepper_HomeAxes(void);
void Stepper_EmergencyStop(void);
void Stepper_UpdateKinematics(float delta_time_sec);
void Stepper_TimerInterrupt_Handler(void); // Call this inside high-speed timer ISR (10-20 kHz)

// Read State
GimbalController_t* Stepper_GetState(void);

#endif // STEPPER_CONTROLLER_H
