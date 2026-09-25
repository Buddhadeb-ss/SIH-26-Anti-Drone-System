/*
 * stepper_controller.h
 *
 *  Created on: 22-Sept-2026
 *      Author: Adarsha Udupa
 */

#ifndef INC_STEPPER_CONTROLLER_H_
#define INC_STEPPER_CONTROLLER_H_

#include "main.h"

// Stepper Calibration (8.8888 steps/deg for 1/16 microstepping)
#define STEPS_PER_DEGREE       (8.8888889f)

// Port C Pin Mappings matching your .ioc configuration
#define PAN_STEP_PIN           GPIO_PIN_5
#define PAN_STEP_PORT          GPIOC
#define PAN_DIR_PIN            GPIO_PIN_4
#define PAN_DIR_PORT           GPIOC

#define TILT_STEP_PIN          GPIO_PIN_3
#define TILT_STEP_PORT         GPIOC
#define TILT_DIR_PIN           GPIO_PIN_2
#define TILT_DIR_PORT          GPIOC

#endif /* INC_STEPPER_CONTROLLER_H_ */
