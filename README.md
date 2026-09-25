# SIH 2026 — Anti-Drone System

<p align="center">
  <img src="docs/images/hero.png" width="95%">
</p>

<h3 align="center">
High-Altitude Robust Anti-Drone System
</h3>

<p align="center">
  Radar • Computer Vision • Sensor Fusion • Embedded Control • Precision Gimbal • 3D Simulation • HIL
</p>

<p align="center">
  <a href="https://github.com/Buddhadeb-ss/SIH-26-Anti-Drone-System">Repository</a>
  ·
  <a href="#simulation">Simulation</a>
  ·
  <a href="#dashboard">Dashboard</a>
  ·
  <a href="#architecture">Architecture</a>
</p>

---

## Overview

This project is a modular **anti-drone detection, tracking and precision-pointing system** developed for **Smart India Hackathon 2026 — SIH26050**.

The system combines radar awareness, camera-based computer vision, target tracking, STM32 embedded control and a 2-axis gimbal into a single architecture.

A dedicated real-time simulation and Hardware-in-the-Loop environment is used to validate the sensing and control pipeline under controlled environmental disturbances.

### Core Pipeline

```text
        RADAR                         CAMERA
          │                             │
          │                             ▼
          │                       ┌───────────┐
          └──────────────────────▶│ Detection │
                                  └─────┬─────┘
                                        │
                                        ▼
                                 Target Tracking
                                        │
                                        ▼
                                  Control System
                                        │
                                        ▼
                                     STM32
                                        │
                                        ▼
                                  2-Axis Gimbal
                                        │
                                        ▼
                                  Target Pointing
```

---

# System Demonstration

## Real-Time 3D Simulation

<p align="center">
  <img src="docs/images/simulation-main.png" width="95%">
</p>

The simulation provides a real-time 3D environment for representing the radar, target, gimbal and control system together.

---

## Multiple Simulation Views

|                  3D Environment                  |                      360° Radar                     |
| :----------------------------------------------: | :-------------------------------------------------: |
| <img src="docs/images/3d-view.png" width="100%"> | <img src="docs/images/radar-view.png" width="100%"> |

|                      Environmental Stress                     |                    PID Closed-Loop                   |
| :-----------------------------------------------------------: | :--------------------------------------------------: |
| <img src="docs/images/environmental-stress.png" width="100%"> | <img src="docs/images/pid-control.png" width="100%"> |

The simulation is designed to make system behavior observable from multiple perspectives rather than relying on a single visualization.

---

# Architecture

```text
                         ┌─────────────────────┐
                         │       RADAR         │
                         │ Detection / Bearing │
                         │       / Range       │
                         └──────────┬──────────┘
                                    │
                                    ▼
┌─────────────────┐        ┌─────────────────────┐
│     CAMERA      │───────▶│ Detection / Fusion  │
│                 │        │                     │
│ YOLO-based CV   │        │ Target State        │
└─────────────────┘        └──────────┬──────────┘
                                      │
                                      ▼
                             ┌────────────────┐
                             │ Target Tracking│
                             └───────┬────────┘
                                     │
                                     ▼
                             ┌────────────────┐
                             │ Control System │
                             │     STM32      │
                             └───────┬────────┘
                                     │
                                     ▼
                             ┌────────────────┐
                             │  2-Axis Gimbal │
                             │   PAN / TILT   │
                             └───────┬────────┘
                                     │
                                     ▼
                               Target Pointing
```

The repository is organized around these independent subsystems, including dedicated areas for firmware, radar, vision, gimbal, dashboard, simulation, hardware and mechanical design.

---

# Computer Vision

The vision subsystem provides camera-based target detection and tracking.

```text
Camera
  │
  ▼
Frame Acquisition
  │
  ▼
YOLO Detection
  │
  ├── Bounding Box
  ├── Confidence
  └── Target Position
  │
  ▼
Target Tracking
  │
  ▼
Control Pipeline
```

The vision pipeline can be exercised independently using recorded test footage as well as integrated into the dashboard.

---

# Radar

Radar provides an independent sensing layer for target awareness.

The system represents radar information through a **360° radar visualization**, allowing target bearing and range information to be observed alongside the camera-based detection pipeline.

<p align="center">
  <img src="docs/images/radar-view.png" width="70%">
</p>

---

# Precision Gimbal

The pointing system uses a **2-axis PAN/TILT gimbal**.

```text
Target Position
      │
      ▼
Angular Error
      │
      ▼
Controller
      │
      ▼
 PAN / TILT
      │
      ▼
    STM32
      │
      ▼
   Gimbal
```

The simulation allows the gimbal response and controller behavior to be evaluated without requiring every test to be performed on physical hardware.

---

# Environmental Stress Simulation

A major part of the project is the ability to study the effect of environmental disturbances on the tracking and pointing system.

<p align="center">
  <img src="docs/images/environmental-stress.png" width="90%">
</p>

The simulation provides controlled scenarios for studying effects such as:

* Wind disturbance
* Temperature variation
* Mechanical disturbances
* Sensor/control variations

The purpose is to observe how disturbances propagate through the control loop and influence pointing behavior.

---

# PID Closed-Loop Control

The simulation includes a closed-loop control environment for tuning and observing gimbal response.

<p align="center">
  <img src="docs/images/pid-control.png" width="90%">
</p>

```text
              Desired Angle
                    │
                    ▼
              ┌──────────┐
              │   PID    │
              └────┬─────┘
                   │
                   ▼
              Gimbal Model
                   │
                   ▼
              Actual Angle
                   │
                   └────────── Feedback
```

This provides a controlled environment for studying controller response, overshoot, settling behavior and disturbance rejection.

---

# Hardware-in-the-Loop

The system bridges the simulation and embedded controller through a Hardware-in-the-Loop architecture.

```text
             SIMULATION
                  │
          Target / Environment
                  │
                  ▼
            Control Command
                  │
                  ▼
               STM32
                  │
                  ▼
            Gimbal / Motor
                  │
                  ▼
              Feedback
                  │
                  └──────────────▶ Simulation
```

This allows the embedded control layer to interact with simulated system conditions before complete physical integration.

### Command Interface

```text
X{pan}Y{tilt}Z{distance}
```

Example:

```text
X12.5Y-5.2Z1500.0
```

### Telemetry

```text
PAN:12.5,TILT:-5.2,TEMP:34.2,STATUS:TRACKING
```

The communication layer keeps the simulation, embedded controller and higher-level software loosely coupled.

---

# Operator Dashboard

<p align="center">
  <img src="docs/images/dashboard.png" width="95%">
</p>

The dashboard provides a unified operator interface for:

* Camera feed
* Computer-vision detections
* Radar visualization
* Target information
* STM32 telemetry
* System state
* Connection status

The dashboard supports both simulated and hardware-connected workflows.

---

# Operating Modes

### Mock / Simulation

```bash
python main.py --mock
```

Runs the dashboard with simulated subsystem data.

### Camera + Computer Vision

```bash
python main.py --mock --camera 1
```

Uses a real camera while retaining simulated components.

### Test Video

```bash
python main.py --mock --video <video-path>
```

Runs the CV pipeline against recorded footage.

### Hardware

```bash
python main.py
```

Uses the configured physical interfaces.

---

# Technology Stack

| Subsystem        | Technology                   |
| ---------------- | ---------------------------- |
| Computer Vision  | Python · OpenCV · YOLO       |
| Dashboard        | Python · PySide6             |
| Embedded Control | STM32                        |
| Communication    | UART / Serial                |
| Simulation       | Three.js · WebGL             |
| Control          | PID · Closed-loop control    |
| Hardware         | Sensors · Actuators · Gimbal |
| Mechanical       | CAD                          |
| Version Control  | Git                          |

---

# Repository Structure

```text
SIH-26-Anti-Drone-System/
│
├── dashboard/                 # Operator dashboard
├── vision/                    # Computer vision
├── radar/                     # Radar subsystem
├── gimbal/                    # Gimbal and control
│
├── firmware/
│   └── STM32_HIL_Simulation/ # STM32 HIL integration
│
├── simulation/                # Real-time 3D simulation
├── hardware/                  # Electronics and wiring
├── mechanical/                # CAD and mechanical design
├── docs/                      # Technical documentation
└── tests/                     # Testing
```

---

# Quick Start

```bash
git clone https://github.com/Buddhadeb-ss/SIH-26-Anti-Drone-System.git
cd SIH-26-Anti-Drone-System
```

### Dashboard

```bash
cd dashboard
pip install -r requirements.txt
python main.py --mock
```

### Simulation

Open the simulation entry point from:

```text
simulation/
```

The simulation can be run independently from the dashboard and is designed for interactive system-level testing.

---

# Engineering Approach

The project follows a layered development architecture:

```text
             SENSING
          Radar + Camera
                │
                ▼
           PERCEPTION
        Detection + Tracking
                │
                ▼
            CONTROL
             STM32
                │
                ▼
            ACTUATION
           PAN / TILT
                │
                ▼
           SIMULATION
         + HIL VALIDATION
```

The separation between these layers makes it possible to test individual components while preserving the interfaces required for complete system integration.

---

# Project Context

**Smart India Hackathon 2026**

**Problem Statement:** SIH26050
**Organization:** DRDO
**Domain:** High-Altitude Performance Optimization & Robust Design of Anti-Drone System

The project addresses the challenge through a combination of:

**Detection → Tracking → Precision Pointing → Embedded Control → Simulation → HIL**

---

## License

This project is licensed under the [MIT License](./LICENSE).

---

<p align="center">
  <b>Built for SIH 2026 · SIH26050</b>
</p>
