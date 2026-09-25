# SIH26050 Anti-Drone 2-Axis Gimbal Controller
## STM32 Firmware & Hardware-In-The-Loop (HIL) Integration Guide

> **Notice for Firmware Engineer**: This firmware package is designed to operate as a **Sensor-Agnostic Gimbal Actuator**. It works identically for:
> 1. **Setup A: HIL 3D Simulation** (Testing with Three.js virtual radar, drone swarms, and high-altitude Ladakh environmental stress).
> 2. **Setup B: Field CV Tracking** (Outdoor tracking with physical camera, OpenCV/YOLO, and live drones).
>
> You do **not** need two separate firmwares. Flash this code once, and it serves both setups through the exact same serial protocol.

---

## 1. System Architecture

```
[ Setup A: 3D Simulation ]                   [ Setup B: Physical CV Tracker ]
 Three.js + Radar + Ladakh Env                     Physical Camera + YOLO / OpenCV
            ↓                                                      ↓
  Python Bridge (bridge.py)                              Python Tracker Script
            │                                                      │
            └─────────────────────────┬────────────────────────────┘
                                      │
                         USB Serial (115200 Baud, 8-N-1)
                         Newline-Delimited JSON Packets
                                      ▼
                        ┌───────────────────────────┐
                        │     STM32 GIMBAL MCU      │
                        │ (TIM2: 10kHz Pulse Gen)   │
                        │ (USART1: 20Hz Telemetry)  │
                        └───────────────────────────┘
                                      │
                         STEP / DIR / EN Signals
                                      ▼
                        ┌───────────────────────────┐
                        │   TMC2209 / A4988 Drivers │
                        └───────────────────────────┘
                                      │
                         PAN & TILT NEMA-17 Steppers
```

---

## 2. Electrical Wiring & Pinout Guide

### Recommended Hardware
* **Microcontroller**: STM32F401 / STM32F411 (BlackPill), STM32F103 (BluePill), or STM32 Nucleo.
* **Stepper Drivers**: TMC2209 (SilentStepStick) or A4988 / DRV8825.
* **Motors**: 2x NEMA-17 Stepper Motors (1.8° step angle, 200 steps/rev, 1.2A - 1.5A).
* **Power Supply**: 12V to 24V DC (for steppers), 5V/3.3V (for logic).

### Typical Pin Assignments (`Inc/gimbal_config.h`)

| Signal Name | STM32 Default Pin | Driver Pin | Description |
| :--- | :--- | :--- | :--- |
| **PAN_STEP** | `PA0` | STEP (M1) | High-speed step pulse train |
| **PAN_DIR** | `PA1` | DIR (M1) | HIGH = Clockwise, LOW = Counter-Clockwise |
| **PAN_EN** | `PA2` | EN (M1) | Active LOW (LOW = Motor energized) |
| **TILT_STEP** | `PA3` | STEP (M2) | High-speed step pulse train |
| **TILT_DIR** | `PA4` | DIR (M2) | HIGH = Tilt Down, LOW = Tilt Up |
| **TILT_EN** | `PA5` | EN (M2) | Active LOW (LOW = Motor energized) |
| **LIMIT_PAN** | `PA6` | Limit Switch | Optional Endstop (Active LOW with pull-up) |
| **LIMIT_TILT**| `PA7` | Limit Switch | Optional Endstop (Active LOW with pull-up) |
| **PTC_HEATER**| `PA8` | MOSFET Gate | Anti-freeze heater output (Active HIGH) |
| **UART1_TX**  | `PA9` | USB-TTL RX | 115200 Baud serial transmit to Laptop |
| **UART1_RX**  | `PA10`| USB-TTL TX | 115200 Baud serial receive from Laptop |

---

## 3. Calibration & Safe Mechanical Travel Limits

The step counts in this firmware are calibrated **1:1 with the Three.js Digital Twin**:

$$\text{Steps Per Degree} = \frac{\text{Steps/Rev} \times \text{Microstepping}}{360^\circ} = \frac{200 \times 16}{360} = 8.8888889\text{ steps/deg}$$

### Travel Limits (`Inc/gimbal_config.h`):
* **PAN Axis (Azimuth)**:
  * Range: $-180.0^\circ$ to $+180.0^\circ$
  * Steps: **$-1600$ to $+1600$ steps**
  * Orientation: $0\text{ steps} = 0^\circ$ points straight forward (North).
* **TILT Axis (Elevation)**:
  * Range: $-75.0^\circ$ to $+85.0^\circ$
  * Steps: **$-667$ to $+756$ steps**
  * Orientation: $0\text{ steps} = 0^\circ$ is level horizontal horizon. Negative values tilt upwards toward the sky.

---

## 4. Communication Protocol Specification

The serial bridge communicates with the STM32 over USB Serial at **115200 Baud, 8-N-1**.

### A. Custom Direct Rate-Control Protocol (Active Default)

The simulation evaluates Pan and Tilt axes independently at **30 Hz** and outputs compact speed strings only when command or speed changes:

#### 1. Pan Axis Commands:
* **Move Right**: `<P,R,speed>\n`
* **Move Left**:  `<P,L,speed>\n`

#### 2. Tilt Axis Commands:
* **Move Up**:    `<T,U,speed>\n`
* **Move Down**:  `<T,D,speed>\n`

#### 3. Stop / Target Lost / Centered:
* **Stop All**:   `S\n`

#### 4. Speed Scaling (1 to 20):
Speed is dynamically scaled from optical tracking pixel error magnitude (or equivalent angle):
* **Error > 200px** ($> 18.7^\circ$): `speed = 1 to 3` (Fastest catch-up rate, lowest timer delay)
* **Error > 80px** ($> 7.5^\circ$): `speed = 5 to 8` (Moderate tracking speed)
* **15px < Error <= 80px**: `speed = 9 to 20` (Slow crawling near deadband)
* **Error <= Deadband (15px)** or Target Lost: `S\n` (Stop)

---

### B. Legacy JSON Position Protocol (Supported for compatibility)

#### 1. Move to Absolute Step Position:
```json
{"cmd":"MOVE","pan":1200,"tilt":-350}
```
* `pan`: Absolute target steps (clamped to $[-1600, +1600]$).
* `tilt`: Absolute target steps (clamped to $[-667, +756]$).

#### 2. Emergency Stop:
```json
{"cmd":"STOP"}
```
* Halts step generation immediately; clamps velocity to 0.

#### 3. Home / Re-Zero:
```json
{"cmd":"HOME"}
```
* Sets the current physical position as datum `(0, 0)`.

#### 4. Enable / Disable Stepper Drivers:
```json
{"cmd":"ENABLE","value":1}
{"cmd":"ENABLE","value":0}
```
* `value: 1`: Energizes motor coils (Driver state = `LOCKED`).
* `value: 0`: De-energizes motor coils (Free wheeling, cuts power dissipation).

---

### B. STM32 $\rightarrow$ Laptop (Telemetry @ 20 Hz)

Every 50 ms ($20\text{ Hz}$), the STM32 broadcasts a telemetry packet:
```json
{"type":"telemetry","pan":1187,"tilt":-342,"pan_target":1200,"tilt_target":-350,"pan_temp":24.5,"tilt_temp":23.2,"heater":0}
```

* `pan`: Current step position of Pan axis.
* `tilt`: Current step position of Tilt axis.
* `pan_target`: Commanded Pan target setpoint.
* `tilt_target`: Commanded Tilt target setpoint.
* `pan_temp`: Measured/modeled temperature of Pan motor in °C.
* `tilt_temp`: Measured/modeled temperature of Tilt motor in °C.
* `heater`: `1` if PTC anti-freeze heater is active, `0` if OFF.

---

## 5. STM32CubeIDE Integration Steps

1. **Create CubeMX Project**:
   * Select your MCU (e.g. `STM32F401RE` / `STM32F103C8`).
   * Enable **USART1** (Asynchronous, 115200 Baud, 8-N-1).
   * Enable **USART1 Global Interrupt** in the NVIC tab.
   * Enable **TIM2** with an internal clock producing a **10 kHz interrupt** (e.g. Prescaler = 84-1, Period = 100-1 for 84 MHz clock).
   * Configure GPIO pins for `STEP`, `DIR`, and `EN` as GPIO Outputs.
2. **Add Files to Project**:
   * Copy `Inc/gimbal_config.h`, `Inc/stepper_controller.h`, `Inc/protocol_parser.h` into your project's `Core/Inc/`.
   * Copy `Src/stepper_controller.c`, `Src/protocol_parser.c` into `Core/Src/`.
3. **Hook Interrupt Callbacks in `Core/Src/main.c`**:
   ```c
   // Inside UART RX Complete Callback:
   void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
       if (huart->Instance == USART1) {
           Hardware_UART_OnByteReceived(rx_byte);
           HAL_UART_Receive_IT(&huart1, (uint8_t*)&rx_byte, 1);
       }
   }

   // Inside Timer Interrupt Callback (10 kHz):
   void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
       if (htim->Instance == TIM2) {
           Stepper_TimerInterrupt_Handler();
       }
   }
   ```

---

## 6. How to Test Your Firmware Independently

Before connecting to the 3D simulation or CV tracker, use the included Python test tool:

1. Connect your STM32 USB cable. Note the COM port (e.g. `COM3`).
2. Open terminal in the `Tools/` folder and run:
   ```cmd
   python firmware_serial_test.py --port COM3
   ```
   *(Or double-click `test_stm32.bat`)*

3. The script will automatically verify:
   * [PASS] Telemetry streaming at 20 Hz.
   * [PASS] Driver ENABLE and HOME command response.
   * [PASS] Movement to target angles and return to zero.
   * [PASS] Emergency STOP execution.

---

## 7. Connecting to the Three.js HIL Simulation

Once verified:
1. Start the simulation web app:
   ```cmd
   cd simulation
   python -m http.server 8085
   ```
2. Start the Hardware Bridge on your STM32 COM port:
   ```cmd
   python bridge\bridge.py --port COM3 --baud 115200
   ```
3. Open `http://localhost:8085` in your browser.
4. Under **HARDWARE INTERFACE**, click **`[REAL]`**.
5. As simulated drones fly in the virtual Ladakh airspace, your physical stepper motors will rotate in exact physical lockstep with the 3D digital twin!
