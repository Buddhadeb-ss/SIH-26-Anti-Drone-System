/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

#include "stm32f4xx_nucleo.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */
typedef enum {
    SOURCE_RADAR_LD2452,    // Front Main Radar (Absolute Boresight Bearing)
    SOURCE_VISION_C2,       // Optical Tracking (Incremental Error from FOV Center)
    SOURCE_RADAR_BLINDSPOT  // Rear Alert Radar (Perimeter Warning)
} TargetSource_t;

typedef struct {
    float x_val;            // Vision: Pan error delta (deg) | Radar: Absolute bearing (deg)
    float y_val;            // Vision: Tilt error delta (deg) | Radar: Unused (0.0f)
    float distance;         // Euclidean distance to target (mm)
    uint32_t timestamp;     // System tick when target was captured (ms)
    TargetSource_t src;
} TargetData_t;

typedef enum {
    POD_STATE_SEARCH,
    POD_STATE_TRACK,
    POD_STATE_ENGAGE,
} PodState_t;
/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define NTC_IN_Pin GPIO_PIN_0
#define NTC_IN_GPIO_Port GPIOA
#define VCP_TX_Pin GPIO_PIN_2
#define VCP_TX_GPIO_Port GPIOA
#define VCP_RX_Pin GPIO_PIN_3
#define VCP_RX_GPIO_Port GPIOA
#define Laser_Pin GPIO_PIN_10
#define Laser_GPIO_Port GPIOB
#define Pan_A4988_DIR_Pin GPIO_PIN_6
#define Pan_A4988_DIR_GPIO_Port GPIOC
#define Tilt_A4988_DIR_Pin GPIO_PIN_7
#define Tilt_A4988_DIR_GPIO_Port GPIOC
#define Pan_A4988_STEP_Pin GPIO_PIN_8
#define Pan_A4988_STEP_GPIO_Port GPIOC
#define Tilt_A4988_STEP_Pin GPIO_PIN_9
#define Tilt_A4988_STEP_GPIO_Port GPIOC
#define Heater_Pin GPIO_PIN_8
#define Heater_GPIO_Port GPIOA
#define RADAR_TX_Pin GPIO_PIN_9
#define RADAR_TX_GPIO_Port GPIOA
#define RADAR_RX_Pin GPIO_PIN_10
#define RADAR_RX_GPIO_Port GPIOA
#define TMS_Pin GPIO_PIN_13
#define TMS_GPIO_Port GPIOA
#define TCK_Pin GPIO_PIN_14
#define TCK_GPIO_Port GPIOA
#define SWO_Pin GPIO_PIN_3
#define SWO_GPIO_Port GPIOB

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
