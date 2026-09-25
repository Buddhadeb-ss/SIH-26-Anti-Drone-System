/**
 * ============================================================================
 * SIH26050 NEWLINE-DELIMITED JSON PROTOCOL PARSER IMPLEMENTATION
 * ============================================================================
 * Zero-heap, robust, real-time parser for STM32 microcontrollers.
 * Parses:
 *   {"cmd":"MOVE","pan":1200,"tilt":-350}\n
 *   {"cmd":"STOP"}\n
 *   {"cmd":"HOME"}\n
 *   {"cmd":"ENABLE","value":1}\n
 * ============================================================================
 */

#include "protocol_parser.h"
#include "stepper_controller.h"
#include "gimbal_config.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static char rx_line_buffer[RX_BUFFER_SIZE];
static uint16_t rx_write_idx = 0;
static char completed_line[RX_BUFFER_SIZE];
static uint8_t line_ready_flag = 0;

void Protocol_Init(void) {
    rx_write_idx = 0;
    line_ready_flag = 0;
    memset(rx_line_buffer, 0, sizeof(rx_line_buffer));
    memset(completed_line, 0, sizeof(completed_line));
}

/**
 * Feed incoming characters from UART / USB CDC ISR
 * Returns 1 when a full newline-terminated JSON string is captured.
 */
uint8_t Protocol_ProcessChar(char c) {
    if (c == '\r') {
        return 0; // Ignore carriage return
    }

    if (c == '\n') {
        if (rx_write_idx > 0) {
            rx_line_buffer[rx_write_idx] = '\0';
            memcpy(completed_line, rx_line_buffer, rx_write_idx + 1);
            rx_write_idx = 0;
            line_ready_flag = 1;
            return 1;
        }
        return 0;
    }

    // Append to buffer with overflow protection
    if (rx_write_idx < (RX_BUFFER_SIZE - 2)) {
        rx_line_buffer[rx_write_idx++] = c;
    } else {
        // Buffer overflow: reset buffer
        rx_write_idx = 0;
    }

    return 0;
}

const char* Protocol_GetRxLine(void) {
    line_ready_flag = 0;
    return completed_line;
}

/**
 * Lightweight Zero-Allocation JSON Command Parser
 */
uint8_t Protocol_ParseCommand(const char* json_str, ParsedCommand_t* out_cmd) {
    if (!json_str || !out_cmd) return 0;

    out_cmd->type = CMD_TYPE_NONE;
    out_cmd->pan_target = 0;
    out_cmd->tilt_target = 0;
    out_cmd->enable_value = 1;

    // 1. Direct Rate-Control String Commands
    // Check for "S" (Stop All / Centered / Lost)
    if (strcmp(json_str, "S") == 0 || strcmp(json_str, "S\r") == 0) {
        out_cmd->type = CMD_TYPE_STOP;
        return 1;
    }

    // Check for "<P,dir,speed>" (Pan Rate Command)
    if (json_str[0] == '<' && json_str[1] == 'P' && json_str[2] == ',') {
        char dir = json_str[3]; // 'R' or 'L'
        if ((dir == 'R' || dir == 'L') && json_str[4] == ',') {
            out_cmd->type = CMD_TYPE_RATE_PAN;
            out_cmd->axis_dir = dir;
            out_cmd->rate_speed = (uint8_t)strtol(&json_str[5], NULL, 10);
            return 1;
        }
    }

    // Check for "<T,dir,speed>" (Tilt Rate Command)
    if (json_str[0] == '<' && json_str[1] == 'T' && json_str[2] == ',') {
        char dir = json_str[3]; // 'U' or 'D'
        if ((dir == 'U' || dir == 'D') && json_str[4] == ',') {
            out_cmd->type = CMD_TYPE_RATE_TILT;
            out_cmd->axis_dir = dir;
            out_cmd->rate_speed = (uint8_t)strtol(&json_str[5], NULL, 10);
            return 1;
        }
    }

    // 2. Legacy Newline-Delimited JSON Commands
    if (strstr(json_str, "\"cmd\":\"MOVE\"") || strstr(json_str, "\"cmd\": \"MOVE\"")) {
        out_cmd->type = CMD_TYPE_MOVE;

        // Parse "pan": <number>
        const char* p_pan = strstr(json_str, "\"pan\":");
        if (!p_pan) p_pan = strstr(json_str, "\"pan\" :");
        if (p_pan) {
            p_pan = strchr(p_pan, ':');
            if (p_pan) out_cmd->pan_target = (int32_t)strtol(p_pan + 1, NULL, 10);
        }

        // Parse "tilt": <number>
        const char* p_tilt = strstr(json_str, "\"tilt\":");
        if (!p_tilt) p_tilt = strstr(json_str, "\"tilt\" :");
        if (p_tilt) {
            p_tilt = strchr(p_tilt, ':');
            if (p_tilt) out_cmd->tilt_target = (int32_t)strtol(p_tilt + 1, NULL, 10);
        }
        return 1;
    }
    else if (strstr(json_str, "\"cmd\":\"STOP\"") || strstr(json_str, "\"cmd\": \"STOP\"")) {
        out_cmd->type = CMD_TYPE_STOP;
        return 1;
    }
    else if (strstr(json_str, "\"cmd\":\"HOME\"") || strstr(json_str, "\"cmd\": \"HOME\"")) {
        out_cmd->type = CMD_TYPE_HOME;
        return 1;
    }
    else if (strstr(json_str, "\"cmd\":\"ENABLE\"") || strstr(json_str, "\"cmd\": \"ENABLE\"")) {
        out_cmd->type = CMD_TYPE_ENABLE;
        const char* p_val = strstr(json_str, "\"value\":");
        if (!p_val) p_val = strstr(json_str, "\"value\" :");
        if (p_val) {
            p_val = strchr(p_val, ':');
            if (p_val) out_cmd->enable_value = (uint8_t)strtol(p_val + 1, NULL, 10);
        }
        return 1;
    }
    else if (strstr(json_str, "\"cmd\":\"STATUS\"") || strstr(json_str, "\"cmd\": \"STATUS\"")) {
        out_cmd->type = CMD_TYPE_STATUS;
        return 1;
    }

    return 0;
}

/**
 * Format 20 Hz Telemetry Packet matching the simulation specification:
 * {"type":"telemetry","pan":1187,"tilt":-342,"pan_target":1200,"tilt_target":-350,"pan_temp":24.5,"tilt_temp":23.2,"heater":0}\n
 */
uint16_t Protocol_FormatTelemetry(char* out_buffer, size_t max_len) {
    if (!out_buffer || max_len < 128) return 0;

    GimbalController_t* state = Stepper_GetState();

    int len = snprintf(out_buffer, max_len,
        "{\"type\":\"telemetry\",\"pan\":%ld,\"tilt\":%ld,\"pan_target\":%ld,\"tilt_target\":%ld,\"pan_temp\":%.1f,\"tilt_temp\":%.1f,\"heater\":%d}\n",
        (long)state->pan.current_position,
        (long)state->tilt.current_position,
        (long)state->pan.target_position,
        (long)state->tilt.target_position,
        state->pan_temperature_c,
        state->tilt_temperature_c,
        state->heater_active);

    if (len < 0 || (size_t)len >= max_len) {
        return 0;
    }
    return (uint16_t)len;
}

uint16_t Protocol_FormatStatus(char* out_buffer, size_t max_len, uint8_t is_connected) {
    if (!out_buffer || max_len < 64) return 0;

    int len = snprintf(out_buffer, max_len,
        "{\"type\":\"status\",\"connected\":%s}\n",
        is_connected ? "true" : "false");

    if (len < 0 || (size_t)len >= max_len) {
        return 0;
    }
    return (uint16_t)len;
}
