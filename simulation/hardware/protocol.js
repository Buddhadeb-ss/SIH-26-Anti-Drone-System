/**
 * protocol.js
 * STM32 Serial & WebSocket Communication Protocol Specifications.
 * 
 * Defines standard newline-delimited JSON commands and telemetry schemas:
 * 
 * Host -> STM32:
 *   {"cmd":"MOVE","pan":1200,"tilt":-350}
 *   {"cmd":"STOP"}
 *   {"cmd":"HOME"}
 *   {"cmd":"ENABLE","value":1}
 *   {"cmd":"ENABLE","value":0}
 * 
 * STM32 -> Host Telemetry:
 *   {
 *     "type":"telemetry",
 *     "pan":1187,
 *     "tilt":-342,
 *     "pan_target":1200,
 *     "tilt_target":-350,
 *     "pan_temp":31.4,
 *     "tilt_temp":29.8,
 *     "heater":0
 *   }
 * 
 * Status:
 *   {"type":"status","connected":true}
 */

export const PROTOCOL_CMDS = {
  MOVE: 'MOVE',
  STOP: 'STOP',
  HOME: 'HOME',
  ENABLE: 'ENABLE'
};

export const PROTOCOL_TYPES = {
  TELEMETRY: 'telemetry',
  STATUS: 'status',
  ACK: 'ack',
  ERROR: 'error'
};

/**
 * Build a MOVE command object with position and optical pixel error metadata
 * @param {number} pan Absolute pan steps
 * @param {number} tilt Absolute tilt steps
 * @param {Object} meta Metadata including errorPanPx, errorTiltPx, hasTarget
 * @returns {Object}
 */
export function buildMoveCmd(pan, tilt, meta = {}) {
  return {
    cmd: PROTOCOL_CMDS.MOVE,
    pan: Math.round(pan),
    tilt: Math.round(tilt),
    err_p: meta.errorPanPx !== undefined ? Math.round(meta.errorPanPx) : 0,
    err_t: meta.errorTiltPx !== undefined ? Math.round(meta.errorTiltPx) : 0,
    lock: meta.hasTarget !== undefined ? Boolean(meta.hasTarget) : true
  };
}

/**
 * Build a STOP command object
 * @returns {Object}
 */
export function buildStopCmd() {
  return { cmd: PROTOCOL_CMDS.STOP };
}

/**
 * Build a HOME command object
 * @returns {Object}
 */
export function buildHomeCmd() {
  return { cmd: PROTOCOL_CMDS.HOME };
}

/**
 * Build an ENABLE/DISABLE command object
 * @param {boolean|number} enable
 * @returns {Object}
 */
export function buildEnableCmd(enable) {
  return {
    cmd: PROTOCOL_CMDS.ENABLE,
    value: enable ? 1 : 0
  };
}

/**
 * Encode object to newline-delimited JSON string for serial / websocket
 * @param {Object} obj 
 * @returns {string}
 */
export function encodePacket(obj) {
  return JSON.stringify(obj) + '\n';
}

/**
 * Decode raw string into JSON object safely
 * @param {string} raw 
 * @returns {Object|null}
 */
export function decodePacket(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
}

/**
 * Validate incoming telemetry packet
 * @param {Object} pkt 
 * @returns {boolean}
 */
export function isValidTelemetry(pkt) {
  return (
    pkt &&
    pkt.type === PROTOCOL_TYPES.TELEMETRY &&
    typeof pkt.pan === 'number' &&
    typeof pkt.tilt === 'number'
  );
}
