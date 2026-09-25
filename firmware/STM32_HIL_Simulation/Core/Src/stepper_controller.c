/*
 * sih_stepper_tracking.c
 * Target: Direct Axis-Direction-Speed Command Engine (Port C Pins)
 */

#include "main.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

extern TIM_HandleTypeDef htim10;
extern UART_HandleTypeDef huart2;

uint8_t dma_rx_buffer[16];
uint8_t parse_buffer[16];
volatile uint8_t new_cv_data = 0;

// Motor states & dynamic speed counter variables
volatile uint8_t pan_enabled = 0;
volatile uint8_t pan_direction = 0;   // 1 = Right, 0 = Left
volatile uint16_t pan_speed_delay = 1;    // 1 = Fastest, 20 = Slowest
volatile uint16_t pan_tick_counter = 0;

volatile uint8_t tilt_enabled = 0;
volatile uint8_t tilt_direction = 0; // 1 = Down, 0 = Up
volatile uint16_t tilt_speed_delay = 1;
volatile uint16_t tilt_tick_counter = 0;

volatile uint8_t pan_pulse_state = 0;
volatile uint8_t tilt_pulse_state = 0;

void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size) {
    if (huart->Instance == USART2) {
        uint16_t copy_size = (Size < sizeof(parse_buffer) - 1) ? Size : (sizeof(parse_buffer) - 1);
        memcpy(parse_buffer, dma_rx_buffer, copy_size);
        parse_buffer[copy_size] = '\0';

        new_cv_data = 1;
        HAL_UARTEx_ReceiveToIdle_DMA(&huart2, dma_rx_buffer, sizeof(dma_rx_buffer));
    }
}

// TIM10 Heartbeat (Fires every 200µs with ARR = 199)
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
    if (htim->Instance == TIM10) {

        // --- PAN AXIS (PC4 = DIR, PC5 = STEP) ---
        if (pan_enabled) {
            pan_tick_counter++;
            if (pan_tick_counter >= pan_speed_delay) {
                pan_tick_counter = 0;

                if (pan_pulse_state == 0) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_4, pan_direction ? GPIO_PIN_SET : GPIO_PIN_RESET);
                    pan_pulse_state = 1;
                } else if (pan_pulse_state == 1) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_5, GPIO_PIN_SET);
                    pan_pulse_state = 2;
                } else if (pan_pulse_state == 2) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_5, GPIO_PIN_RESET);
                    pan_pulse_state = 0;
                }
            }
        } else {
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_5, GPIO_PIN_RESET);
            pan_pulse_state = 0;
            pan_tick_counter = 0;
        }

        // --- TILT AXIS (PC2 = DIR, PC3 = STEP) ---
        if (tilt_enabled) {
            tilt_tick_counter++;
            if (tilt_tick_counter >= tilt_speed_delay) {
                tilt_tick_counter = 0;

                if (tilt_pulse_state == 0) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_2, tilt_direction ? GPIO_PIN_SET : GPIO_PIN_RESET);
                    tilt_pulse_state = 1;
                } else if (tilt_pulse_state == 1) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_3, GPIO_PIN_SET);
                    tilt_pulse_state = 2;
                } else if (tilt_pulse_state == 2) {
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_3, GPIO_PIN_RESET);
                    tilt_pulse_state = 0;
                }
            }
        } else {
            HAL_GPIO_WritePin(GPIOC, GPIO_PIN_3, GPIO_PIN_RESET);
            tilt_pulse_state = 0;
            tilt_tick_counter = 0;
        }
    }
}

// Hybrid Parser: Supports single letters ('r', 'l', 'u', 'd', 's') and dynamic speed strings ('<P,R,5>')
void PROCESS_CV_DATA(void) {
    if (new_cv_data) {
        new_cv_data = 0;

        char first_char = parse_buffer[0];

        // 1. Stop Command
        if (first_char == 'S' || first_char == 's') {
            pan_enabled = 0;
            tilt_enabled = 0;
        }
        // 2. Simple Single-Letter Commands (Default Speed = 1)
        else if (first_char == 'R' || first_char == 'r') {
            pan_direction = 1;
            pan_speed_delay = 1;
            pan_enabled = 1;
        }
        else if (first_char == 'L' || first_char == 'l') {
            pan_direction = 0;
            pan_speed_delay = 1;
            pan_enabled = 1;
        }
        else if (first_char == 'U' || first_char == 'u') {
            tilt_direction = 0; // Up direction mapping
            tilt_speed_delay = 1;
            tilt_enabled = 1;
        }
        else if (first_char == 'D' || first_char == 'd') {
            tilt_direction = 1; // Down direction mapping
            tilt_speed_delay = 1;
            tilt_enabled = 1;
        }
        // 3. Formatted Dynamic Speed Packets e.g., <P,R,8> or <T,U,12>
        else {
            char axis = '\0';
            char dir_char = '\0';
            int speed = 1;

            if (sscanf((char*)parse_buffer, "<%c,%c,%d>", &axis, &dir_char, &speed) == 3) {
                if (speed < 1) speed = 1;
                if (speed > 20) speed = 20;

                if (axis == 'P' || axis == 'p') {
                    pan_direction = (dir_char == 'R' || dir_char == 'r') ? 1 : 0;
                    pan_speed_delay = (uint16_t)speed;
                    pan_enabled = 1;
                }
                else if (axis == 'T' || axis == 't') {
                    tilt_direction = (dir_char == 'U' || dir_char == 'u') ? 0 : 1;
                    tilt_speed_delay = (uint16_t)speed;
                    tilt_enabled = 1;
                }
            }
        }
    }
}

void RUN_TRACKING(void) {
    // Set TIM10 period ARR to 199 (fires every 200 microseconds for high-speed performance)
    __HAL_TIM_SET_AUTORELOAD(&htim10, 199);

    HAL_TIM_Base_Start_IT(&htim10);
    HAL_UARTEx_ReceiveToIdle_DMA(&huart2, dma_rx_buffer, sizeof(dma_rx_buffer));
}

void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart) {
    if (huart->Instance == USART2) {
        __HAL_UART_CLEAR_OREFLAG(huart);
        HAL_UART_AbortReceive(huart);
        HAL_UARTEx_ReceiveToIdle_DMA(&huart2, dma_rx_buffer, sizeof(dma_rx_buffer));
    }
}
