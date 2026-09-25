/**
 * ============================================================================
 * SIH26050 NEWLINE-DELIMITED JSON PROTOCOL PARSER
 * ============================================================================
 * Handles command decoding from Laptop (Simulation or CV Tracker)
 * Formats 20 Hz telemetry packets back to Laptop
 * ============================================================================
 */

#ifndef PROTOCOL_PARSER_H
#define PROTOCOL_PARSER_H

#include <stdint.h>
#include <stddef.h>

// Command Types recognized by the Firmware
typedef enum {
    CMD_TYPE_NONE = 0,
    CMD_TYPE_RATE_PAN,   // <P,R,speed> or <P,L,speed>
    CMD_TYPE_RATE_TILT,  // <T,U,speed> or <T,D,speed>
    CMD_TYPE_MOVE,       // {"cmd":"MOVE","pan":1200,"tilt":-350}
    CMD_TYPE_STOP,       // "S\n" or {"cmd":"STOP"}
    CMD_TYPE_HOME,       // {"cmd":"HOME"}
    CMD_TYPE_ENABLE,     // {"cmd":"ENABLE","value":1}
    CMD_TYPE_STATUS      // {"cmd":"STATUS"}
} CommandType_t;

typedef struct {
    CommandType_t type;
    char axis_dir;       // 'R', 'L', 'U', 'D'
    uint8_t rate_speed;  // 1 to 20
    int32_t pan_target;
    int32_t tilt_target;
    uint8_t enable_value;
} ParsedCommand_t;

// Public API
void Protocol_Init(void);
uint8_t Protocol_ProcessChar(char c); // Returns 1 when a complete newline-terminated line is ready
const char* Protocol_GetRxLine(void);
uint8_t Protocol_ParseCommand(const char* json_str, ParsedCommand_t* out_cmd);
uint16_t Protocol_FormatTelemetry(char* out_buffer, size_t max_len);
uint16_t Protocol_FormatStatus(char* out_buffer, size_t max_len, uint8_t is_connected);

#endif // PROTOCOL_PARSER_H
