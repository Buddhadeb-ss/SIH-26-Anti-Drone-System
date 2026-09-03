/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * File Name          : freertos.c
  * Description        : Code for freertos applications
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

/* Includes ------------------------------------------------------------------*/
#include "FreeRTOS.h"
#include "task.h"
#include "main.h"
#include "cmsis_os.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <math.h>
#include <stdbool.h>
#include <stdlib.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN Variables */

/* USER CODE END Variables */
/* Definitions for ControlTask */
osThreadId_t ControlTaskHandle;
const osThreadAttr_t ControlTask_attributes = {
  .name = "ControlTask",
  .stack_size = 256 * 4,
  .priority = (osPriority_t) osPriorityRealtime,
};
/* Definitions for CommTask */
osThreadId_t CommTaskHandle;
const osThreadAttr_t CommTask_attributes = {
  .name = "CommTask",
  .stack_size = 256 * 4,
  .priority = (osPriority_t) osPriorityAboveNormal,
};
/* Definitions for EngageTask */
osThreadId_t EngageTaskHandle;
const osThreadAttr_t EngageTask_attributes = {
  .name = "EngageTask",
  .stack_size = 128 * 4,
  .priority = (osPriority_t) osPriorityHigh,
};
/* Definitions for TelemetryTask */
osThreadId_t TelemetryTaskHandle;
const osThreadAttr_t TelemetryTask_attributes = {
  .name = "TelemetryTask",
  .stack_size = 256 * 4,
  .priority = (osPriority_t) osPriorityBelowNormal,
};
/* Definitions for ThermalTask */
osThreadId_t ThermalTaskHandle;
const osThreadAttr_t ThermalTask_attributes = {
  .name = "ThermalTask",
  .stack_size = 128 * 4,
  .priority = (osPriority_t) osPriorityLow,
};
/* Definitions for TargetQueue */
osMessageQueueId_t TargetQueueHandle;
const osMessageQueueAttr_t TargetQueue_attributes = {
  .name = "TargetQueue"
};
/* Definitions for FireSemaphore */
osSemaphoreId_t FireSemaphoreHandle;
const osSemaphoreAttr_t FireSemaphore_attributes = {
  .name = "FireSemaphore"
};

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN FunctionPrototypes */

/* USER CODE END FunctionPrototypes */

void StartDefaultTask(void *argument);
void StartTask02(void *argument);
void StartTask03(void *argument);
void StartTask04(void *argument);
void StartTask05(void *argument);

void MX_FREERTOS_Init(void); /* (MISRA C 2004 rule 8.1) */

/**
  * @brief  FreeRTOS initialization
  * @param  None
  * @retval None
  */
void MX_FREERTOS_Init(void) {
  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* USER CODE BEGIN RTOS_MUTEX */
  /* add mutexes, ... */
  /* USER CODE END RTOS_MUTEX */

  /* Create the semaphores(s) */
  /* creation of FireSemaphore */
  FireSemaphoreHandle = osSemaphoreNew(1, 0, &FireSemaphore_attributes);

  /* USER CODE BEGIN RTOS_SEMAPHORES */
  // BYPASS CUBEMX DEFAULT: Instantly acquire the semaphore to drain its count to 0.
  // This physically locks the weapon until the ControlTask explicitly authorizes it.
  /* USER CODE END RTOS_SEMAPHORES */

  /* USER CODE BEGIN RTOS_TIMERS */
  /* start timers, add new ones, ... */
  /* USER CODE END RTOS_TIMERS */

  /* Create the queue(s) */
  /* creation of TargetQueue */
  TargetQueueHandle = osMessageQueueNew (10, 20, &TargetQueue_attributes);

  /* USER CODE BEGIN RTOS_QUEUES */
  /* add queues, ... */
  /* USER CODE END RTOS_QUEUES */

  /* Create the thread(s) */
  /* creation of ControlTask */
  ControlTaskHandle = osThreadNew(StartDefaultTask, NULL, &ControlTask_attributes);

  /* creation of CommTask */
  CommTaskHandle = osThreadNew(StartTask02, NULL, &CommTask_attributes);

  /* creation of EngageTask */
  EngageTaskHandle = osThreadNew(StartTask03, NULL, &EngageTask_attributes);

  /* creation of TelemetryTask */
  TelemetryTaskHandle = osThreadNew(StartTask04, NULL, &TelemetryTask_attributes);

  /* creation of ThermalTask */
  ThermalTaskHandle = osThreadNew(StartTask05, NULL, &ThermalTask_attributes);

  /* USER CODE BEGIN RTOS_THREADS */
    extern UART_HandleTypeDef huart1;
    extern UART_HandleTypeDef huart2;
    extern UART_HandleTypeDef huart3;
    extern uint8_t radar_rx_buffer[64];
    extern uint8_t c2_ping_pong[2][32];
    extern volatile uint8_t active_c2_buffer;
    extern uint8_t blindspot_rx_buffer[32];

    // Arm DMA strictly after all queues and tasks are initialized
    HAL_UARTEx_ReceiveToIdle_DMA(&huart1, radar_rx_buffer, sizeof(radar_rx_buffer));
    HAL_UARTEx_ReceiveToIdle_DMA(&huart2, c2_ping_pong[active_c2_buffer], 32);
    HAL_UARTEx_ReceiveToIdle_DMA(&huart3, blindspot_rx_buffer, sizeof(blindspot_rx_buffer));
  /* USER CODE END RTOS_THREADS */

  /* USER CODE BEGIN RTOS_EVENTS */
  /* add events, ... */
  /* USER CODE END RTOS_EVENTS */

}

/* USER CODE BEGIN Header_StartDefaultTask */
/**
  * @brief  Function implementing the MotorTask thread.
  * @param  argument: Not used
  * @retval None
  */
/* USER CODE END Header_StartDefaultTask */
void StartDefaultTask(void *argument)
{
  /* USER CODE BEGIN StartDefaultTask */
	  extern I2C_HandleTypeDef hi2c1;
	  extern volatile int32_t pan_target_steps;
	  extern volatile int32_t tilt_target_steps;
	  extern volatile int32_t pan_current_steps;

	  TargetData_t current_target;
	  PodState_t pod_state = POD_STATE_SEARCH;

	  float current_pan_angle = 0.0f;
	  float current_tilt_angle = 0.0f;
	  int sweep_direction = 1;

	  const float DEADBAND_DEG = 1.0f;
	  uint32_t last_vision_tick = 0;
	  uint32_t last_radar_tick = 0;
	  uint32_t last_fire_tick = 0;

	  const uint32_t VISION_TIMEOUT = 500;     // Fallback to radar after 500ms blind
	  const uint32_t SEARCH_TIMEOUT = 2000;    // Revert to search after 2000ms total loss
	  const uint32_t FIRE_COOLDOWN_MS = 3000;  // 3-second lockout between trigger actions

	  	  // --- ABSOLUTE HOMING VIA AS5600 ---
	  	  const uint16_t AS5600_ADDR = 0x36 << 1;
	  	  uint8_t i2c_buf[2];

	  	  if (HAL_I2C_Mem_Read(&hi2c1, AS5600_ADDR, 0x0C, I2C_MEMADD_SIZE_8BIT, i2c_buf, 2, 100) == HAL_OK)
	  	  {
	  	      uint16_t raw_angle = (i2c_buf[0] << 8) | i2c_buf[1];
	  	      float boot_angle = ((float)raw_angle * 360.0f) / 4096.0f - 180.0f;

	  	      current_pan_angle = boot_angle;

	  	      // FIXED: 1/16th Microstepping Boot Assignment
	  	      pan_current_steps = (int32_t)(boot_angle / 0.1125f);
	  	      pan_target_steps = pan_current_steps;
	  	  }

	  for(;;)
	  	  {
	  	      bool vision_updated = false;
	  	      bool radar_updated = false;
	  	      bool blindspot_updated = false;

	  	      TargetData_t latest_vision, latest_radar, latest_blindspot;

	  	      // 1. Drain the queue and segregate the freshest data per sensor
	  	      while (osMessageQueueGet(TargetQueueHandle, &current_target, NULL, 0) == osOK)
	  	      {
	  	          if (current_target.src == SOURCE_VISION_C2) {
	  	              latest_vision = current_target;
	  	              vision_updated = true;
	  	          } else if (current_target.src == SOURCE_RADAR_LD2452) {
	  	              latest_radar = current_target;
	  	              radar_updated = true;
	  	          } else if (current_target.src == SOURCE_RADAR_BLINDSPOT) {
	  	              latest_blindspot = current_target;
	  	              blindspot_updated = true;
	  	          }
	  	      }

	  	      // 2. Execute Sensor Priority Hierarchy
	  	      if (vision_updated)
	  	      {
	  	          last_vision_tick = latest_vision.timestamp;
	  	          pod_state = POD_STATE_TRACK;

	  	        // Visual Servoing: Accumulate incremental offset with 0.5f damping to prevent oscillation
	  	        if (fabs(latest_vision.x_val) > DEADBAND_DEG) {
	  	        	current_pan_angle += (latest_vision.x_val * 0.5f);
	  	        }
	  	        if (fabs(latest_vision.y_val) > DEADBAND_DEG) {
	  	            current_tilt_angle += (latest_vision.y_val * 0.5f);
	  	        }
	  	        if (latest_vision.distance > 100.0f && latest_vision.distance < 2000.0f) {
	  	              if ((osKernelGetTickCount() - last_fire_tick) > FIRE_COOLDOWN_MS) {
	  	                  pod_state = POD_STATE_ENGAGE;
	  	              }
	  	          }
	  	      }
	  	      else if (blindspot_updated && ((osKernelGetTickCount() - last_vision_tick) > VISION_TIMEOUT))
	  	      {
	  	          // Blindspot supersedes Front Radar if we have no visual lock
	  	          pod_state = POD_STATE_TRACK;
	  	          current_pan_angle = (current_pan_angle >= 0.0f) ? 90.0f : -90.0f;
	  	      }
	  	      else if (radar_updated && ((osKernelGetTickCount() - last_vision_tick) > VISION_TIMEOUT))
	  	      {
	  	          // Front Radar is the lowest priority fallback
	  	          last_radar_tick = latest_radar.timestamp;
	  	          pod_state = POD_STATE_TRACK;

	  	          if (fabs(latest_radar.x_val - current_pan_angle) > DEADBAND_DEG) {
	  	              current_pan_angle = latest_radar.x_val;
	  	          }
	  	      }

	  	      // 3. De-escalate to Search mode on total signal loss
	  	      if ((osKernelGetTickCount() - last_vision_tick > SEARCH_TIMEOUT) &&
	  	          (osKernelGetTickCount() - last_radar_tick > SEARCH_TIMEOUT))
	  	      {
	  	          pod_state = POD_STATE_SEARCH;
	  	      }

	  	      // --- KINEMATIC ENVELOPE CLAMPING ---
	  	      if (current_pan_angle > 90.0f) current_pan_angle = 90.0f;
	  	      if (current_pan_angle < -90.0f) current_pan_angle = -90.0f;
	  	      if (current_tilt_angle > 45.0f) current_tilt_angle = 45.0f;
	  	      if (current_tilt_angle < -15.0f) current_tilt_angle = -15.0f;

	  	    switch (pod_state)
	  	    	  	      {
	  	    	  	          case POD_STATE_SEARCH:
	  	    	  	              current_pan_angle += (0.5f * sweep_direction);
	  	    	  	              if (current_pan_angle >= 45.0f) {
	  	    	  	                  sweep_direction = -1;
	  	    	  	              } else if (current_pan_angle <= -45.0f) {
	  	    	  	                  sweep_direction = 1;
	  	    	  	              }
	  	    	  	              pan_target_steps = (int32_t)(current_pan_angle / 0.1125f);
	  	    	  	              tilt_target_steps = 0;
	  	    	  	              break;

	  	    	  	          case POD_STATE_TRACK:
	  	    	  	              pan_target_steps = (int32_t)(current_pan_angle / 0.1125f);
	  	    	  	              tilt_target_steps = (int32_t)(current_tilt_angle / 0.1125f);
	  	    	  	              break;

	  	    	  	          case POD_STATE_ENGAGE:
	  	    	  	              pan_target_steps = (int32_t)(current_pan_angle / 0.1125f);
	  	    	  	              tilt_target_steps = (int32_t)(current_tilt_angle / 0.1125f);

	  	    	  	              osSemaphoreRelease(FireSemaphoreHandle);
	  	    	  	              last_fire_tick = osKernelGetTickCount();
	  	    	  	              pod_state = POD_STATE_TRACK;
	  	    	  	              break;
	  	    	  	      }

	  	      osDelay(20);
	  	  }
  /* USER CODE END StartDefaultTask */
}

/* USER CODE BEGIN Header_StartTask02 */
/**
CommTask thread (Parses C2 Vision Strings).
*/
/* USER CODE END Header_StartTask02 */
void StartTask02(void *argument)
{
  /* USER CODE BEGIN StartTask02 */
	  extern uint8_t c2_ping_pong[2][32];
	  float parsed_x, parsed_y, parsed_z;

	  for(;;)
	  {
	      uint32_t flags = osThreadFlagsWait(0x03, osFlagsWaitAny, osWaitForever);

	      if (flags & 0x01)
	      {
	    	  if (sscanf((char*)c2_ping_pong[0], "<X%fY%fZ%f>", &parsed_x, &parsed_y, &parsed_z) == 3) {
	              TargetData_t vision_target = {
	                  .x_val = parsed_x,
	                  .y_val = parsed_y,
	                  .distance = parsed_z,
	                  .timestamp = osKernelGetTickCount(),
	                  .src = SOURCE_VISION_C2
	              };
	              osMessageQueuePut(TargetQueueHandle, &vision_target, 0, 0);
	          }
	      }

	      if (flags & 0x02)
	      {
	    	  if (sscanf((char*)c2_ping_pong[1], "<X%fY%fZ%f>", &parsed_x, &parsed_y, &parsed_z) == 3) {
	              TargetData_t vision_target = {
	                  .x_val = parsed_x,
	                  .y_val = parsed_y,
	                  .distance = parsed_z,
	                  .timestamp = osKernelGetTickCount(),
	                  .src = SOURCE_VISION_C2
	              };
	              osMessageQueuePut(TargetQueueHandle, &vision_target, 0, 0);
	          }
	      }
	  }
  /* USER CODE END StartTask02 */
}

/* USER CODE BEGIN Header_StartTask03 */
/**
* @brief Function implementing the EngageTask thread (Fire Control).
*/
/* USER CODE END Header_StartTask03 */
void StartTask03(void *argument)
{
  /* USER CODE BEGIN StartTask03 */
  /* Infinite loop */
	for(;;)
	  {
	      // Wait indefinitely until the ControlTask gives the order to fire
	      if (osSemaphoreAcquire(FireSemaphoreHandle, osWaitForever) == osOK)
	      {
	          // 1. Pull GPIO HIGH to fire the 12V payload (Laser/Net)
	          // HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_SET);

	          // 2. Wait for physical actuation (150 ms)
	          osDelay(150);

	          // 3. Turn it off
	          // HAL_GPIO_WritePin(GPIOB, GPIO_PIN_10, GPIO_PIN_RESET);
	      }
	  }
  /* USER CODE END StartTask03 */
}

/* USER CODE BEGIN Header_StartTask04 */
/**
* @brief Function implementing the PositionTask thread (Slip Recovery & I2C Fault Detect).
*/
/* USER CODE END Header_StartTask04 */
void StartTask04(void *argument)
{
  /* USER CODE BEGIN StartTask04 */
	extern I2C_HandleTypeDef hi2c1;
	  extern volatile int32_t pan_current_steps;
	  extern volatile int32_t pan_target_steps; // Added so we can halt the motor

	  const uint16_t AS5600_ADDR = 0x36 << 1;
	  uint8_t i2c_buf[2];
	  uint8_t as5600_fault_counter = 0;

	  for(;;)
	  {
	      if (HAL_I2C_Mem_Read(&hi2c1, AS5600_ADDR, 0x0C, I2C_MEMADD_SIZE_8BIT, i2c_buf, 2, 10) == HAL_OK)
	      {
	          as5600_fault_counter = 0; // Hardware is healthy, reset counter

	          uint16_t raw_angle = (i2c_buf[0] << 8) | i2c_buf[1];
	          float true_physical_angle = ((float)raw_angle * 360.0f) / 4096.0f - 180.0f;

	          // Convert physical degrees to expected motor steps (1/16th microstepping)
	          int32_t true_physical_steps = (int32_t)(true_physical_angle / 0.1125f);

	          // 2. Closed-Loop Correction (Only trigger if slip is > 3 steps to prevent jitter)
	          if (abs(true_physical_steps - pan_current_steps) > 3)
	          	 {
	          	  // RTOS-Safe Critical Section
	          	  taskENTER_CRITICAL();
	          	  pan_current_steps = true_physical_steps;
	          	  taskEXIT_CRITICAL();
	          	  }
	      }
	      else
	      {
	          // FAULT DETECTION: I2C line dropped a packet
	          as5600_fault_counter++;

	          if (as5600_fault_counter > 10)
	          {
	              // FAULT COUNTER-MEASURE: 200ms of silence. The encoder is dead.
	              // Lock the motor to its current step count to prevent a blind physical crash.
	              pan_target_steps = pan_current_steps;
	          }
	      }

	      osDelay(20);
	  }
  /* USER CODE END StartTask04 */
}

/* USER CODE BEGIN Header_StartTask05 */
/**
* @brief Function implementing the ThermalTask thread.
* @param argument: Not used
* @retval None
*/
/* USER CODE END Header_StartTask05 */
void StartTask05(void *argument)
{
  /* USER CODE BEGIN StartTask05 */
	extern ADC_HandleTypeDef hadc1;

		  // 10k NTC Thermistor Parameters
		  const float SERIES_RESISTOR = 10000.0f;
		  const float NOMINAL_RESISTANCE = 10000.0f;
		  const float NOMINAL_TEMP = 25.0f;
		  const float BETA_COEFFICIENT = 3950.0f;

		  float current_temp_c = 25.0f;
		  bool heater_is_on = false;

		  for(;;)
		  {
		      HAL_ADC_Start(&hadc1);
		      if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK)
		      {
		          uint32_t adc_value = HAL_ADC_GetValue(&hadc1);

		          if (adc_value > 50 && adc_value < 4050)
		          {
		              float resistance = SERIES_RESISTOR * ((4095.0f / (float)adc_value) - 1.0f);
		              float steinhart = resistance / NOMINAL_RESISTANCE;
		              steinhart = log(steinhart);
		              steinhart /= BETA_COEFFICIENT;
		              steinhart += 1.0f / (NOMINAL_TEMP + 273.15f);
		              steinhart = 1.0f / steinhart;
		              current_temp_c = steinhart - 273.15f;
		          }
		          else
		          {
		              // FAULT: Thermistor broken. Kill heater.
		              heater_is_on = false;
		              current_temp_c = 25.0f;
		          }
		      }
		      HAL_ADC_Stop(&hadc1);

		      // Bang-Bang Hysteresis Toggle
		      if (current_temp_c < 5.0f && !heater_is_on && current_temp_c != 25.0f) {
		          heater_is_on = true;
		      } else if (current_temp_c > 15.0f && heater_is_on) {
		          heater_is_on = false;
		      }

		      // 50% SOFTWARE PWM: Prevents 5A Power Supply Brownout
		      if (heater_is_on) {
		          HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_SET);
		          osDelay(500); // ON for 500ms
		          HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET);
		          osDelay(500); // OFF for 500ms
		      } else {
		          HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET);
		          osDelay(1000); // Stay OFF
		      }
		  }
  /* USER CODE END StartTask05 */
}

/* Private application code --------------------------------------------------*/
/* USER CODE BEGIN Application */

/* USER CODE END Application */

