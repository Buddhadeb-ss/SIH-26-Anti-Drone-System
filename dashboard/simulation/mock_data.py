"""
simulation/mock_data.py

Generates fake but realistic-looking CV, radar, and STM32 data so the
entire dashboard can be tested without any hardware connected.

Cycles through the following sequence, looping forever:

    SYSTEM STARTUP -> SEARCHING -> TARGET DETECTED -> TRACKING
    -> TARGET LOCK -> TARGET LOST -> SEARCHING -> ...

Each state lasts a few seconds (see STATE_DURATIONS below) before
advancing to the next. Within TARGET DETECTED / TRACKING / TARGET LOCK,
values (position, confidence, distance, azimuth, etc.) drift smoothly
frame-to-frame rather than jumping randomly, so the UI looks alive
instead of noisy.

This module does NOT decide real system state — it only fabricates a
plausible state sequence for demo/testing purposes. Swap this out for
real CV/radar/STM32 data sources without touching the UI (see README).
"""

import math
import random
import time

from data_types import DetectionData, RadarData, STM32Data, SystemState

# How long (seconds) to stay in each state before advancing.
STATE_DURATIONS = {
    SystemState.STARTUP: 2.0,
    SystemState.SEARCHING: 4.0,
    SystemState.TARGET_DETECTED: 3.0,
    SystemState.TRACKING: 6.0,
    SystemState.TARGET_LOCK: 4.0,
    SystemState.TARGET_LOST: 2.5,
}

# The order states advance through. TARGET_LOST loops back to SEARCHING.
STATE_SEQUENCE = [
    SystemState.STARTUP,
    SystemState.SEARCHING,
    SystemState.TARGET_DETECTED,
    SystemState.TRACKING,
    SystemState.TARGET_LOCK,
    SystemState.TARGET_LOST,
]


class MockDataGenerator:
    """
    Stateful generator that produces DetectionData, RadarData, and
    STM32Data snapshots that evolve smoothly over time.

    Usage:
        gen = MockDataGenerator()
        ...on a timer tick...
        gen.tick()
        detection = gen.get_detection_data()
        radar = gen.get_radar_data()
        stm32 = gen.get_stm32_data()
        state = gen.get_state()
    """

    def __init__(self, camera_width: int = 640, camera_height: int = 480):
        self.camera_width = camera_width
        self.camera_height = camera_height

        self._state_index = 0
        self._state = STATE_SEQUENCE[0]
        self._state_entered_at = time.time()

        # Smoothly-drifting target parameters, reused/perturbed each tick
        # so movement looks continuous rather than randomly teleporting.
        self._target_id = 1
        self._box_x = camera_width * 0.4
        self._box_y = camera_height * 0.3
        self._box_w = 60.0
        self._box_h = 45.0
        self._confidence = 0.0
        self._fps = 28.0

        self._azimuth = 0.0
        self._distance = 100.0
        self._elevation = 0.0
        self._velocity = 0.0

        self._pan = 0.0
        self._tilt = 0.0
        self._temperature = 32.0

        self._start_time = time.time()

    # -- State machine ----------------------------------------------------

    def tick(self):
        """
        Call this on every timer tick (see config.MOCK_UPDATE_MS).
        Advances the state machine if the current state's duration has
        elapsed, and perturbs all the drifting values.
        """
        now = time.time()
        elapsed_in_state = now - self._state_entered_at
        duration = STATE_DURATIONS.get(self._state, 3.0)

        if elapsed_in_state >= duration:
            self._advance_state()

        self._update_values(now)

    def _advance_state(self):
        self._state_index = (self._state_index + 1) % len(STATE_SEQUENCE)
        self._state = STATE_SEQUENCE[self._state_index]
        self._state_entered_at = time.time()

        # Give each new detection a fresh-ish ID when we re-detect after
        # a loss, so it's visually obvious this is a "new" acquisition.
        if self._state == SystemState.TARGET_DETECTED:
            self._target_id += 1
            self._confidence = 0.55  # detections start lower-confidence
            self._box_x = random.uniform(self.camera_width * 0.2, self.camera_width * 0.6)
            self._box_y = random.uniform(self.camera_height * 0.2, self.camera_height * 0.5)
            self._distance = random.uniform(150, 250)
            self._azimuth = random.uniform(-40, 40)

    def _update_values(self, now):
        t = now - self._start_time

        # FPS: gentle wobble around 28
        self._fps = 28.0 + 3.0 * math.sin(t * 0.7) + random.uniform(-0.5, 0.5)
        self._fps = max(15.0, min(30.0, self._fps))

        is_target_state = self._state in (
            SystemState.TARGET_DETECTED,
            SystemState.TRACKING,
            SystemState.TARGET_LOCK,
        )

        if is_target_state:
            # Confidence rises as we move DETECTED -> TRACKING -> LOCK
            if self._state == SystemState.TARGET_DETECTED:
                target_conf = 0.65
            elif self._state == SystemState.TRACKING:
                target_conf = 0.85
            else:  # TARGET_LOCK
                target_conf = 0.96

            self._confidence += (target_conf - self._confidence) * 0.05
            self._confidence += random.uniform(-0.01, 0.01)
            self._confidence = max(0.0, min(0.99, self._confidence))

            # Bounding box drifts smoothly (simulates a moving drone)
            self._box_x += math.sin(t * 1.3) * 1.5
            self._box_y += math.cos(t * 0.9) * 1.0
            self._box_x = max(0, min(self.camera_width - self._box_w, self._box_x))
            self._box_y = max(0, min(self.camera_height - self._box_h, self._box_y))
            self._box_w = 60 + 10 * math.sin(t * 0.5)
            self._box_h = 45 + 8 * math.sin(t * 0.5)

            # Radar values drift too
            self._azimuth += math.sin(t * 0.8) * 0.6
            self._azimuth = max(-60, min(60, self._azimuth))
            self._distance += math.sin(t * 0.6) * 1.2
            self._distance = max(20, min(300, self._distance))
            self._elevation = 5 * math.sin(t * 0.4)
            self._velocity = -3.0 + 2.0 * math.sin(t * 0.6)  # negative = closing

            # STM32 pan/tilt chase the target azimuth/elevation (simple
            # proportional-looking follow, purely for visual effect)
            self._pan += (self._azimuth - self._pan) * 0.08
            self._tilt += (self._elevation - self._tilt) * 0.08

        else:
            # SEARCHING / STARTUP / TARGET_LOST: confidence decays to 0,
            # pan/tilt drift back toward center (simulates a search sweep)
            self._confidence *= 0.9
            self._pan = 15 * math.sin(t * 0.3)
            self._tilt = 5 * math.sin(t * 0.2)

        # Temperature creeps up slowly and wobbles a little -- just for
        # visual realism, not modeling anything physical.
        self._temperature = 32.0 + 3.0 * math.sin(t * 0.05) + random.uniform(-0.2, 0.2)

    # -- Data accessors -----------------------------------------------------

    def get_state(self) -> str:
        return self._state

    def get_detection_data(self) -> DetectionData:
        detected = self._state in (
            SystemState.TARGET_DETECTED,
            SystemState.TRACKING,
            SystemState.TARGET_LOCK,
        )
        return DetectionData(
            detected=detected,
            target_id=self._target_id if detected else None,
            x=self._box_x,
            y=self._box_y,
            width=self._box_w,
            height=self._box_h,
            confidence=round(self._confidence, 3),
            fps=round(self._fps, 1),
            state=self._state,
        )

    def get_radar_data(self) -> RadarData:
        detected = self._state in (
            SystemState.TARGET_DETECTED,
            SystemState.TRACKING,
            SystemState.TARGET_LOCK,
        )
        if not detected:
            return RadarData(detected=False)

        return RadarData(
            detected=True,
            target_id=self._target_id,
            distance=round(self._distance, 1),
            azimuth=round(self._azimuth, 1),
            elevation=round(self._elevation, 1),
            velocity=round(self._velocity, 1),
            timestamp=time.time(),
        )

    def get_stm32_data(self) -> STM32Data:
        detected = self._state in (
            SystemState.TARGET_DETECTED,
            SystemState.TRACKING,
            SystemState.TARGET_LOCK,
        )
        return STM32Data(
            connected=True,
            pan=round(self._pan, 1),
            tilt=round(self._tilt, 1),
            temperature=round(self._temperature, 1),
            status=self._state if detected else "IDLE",
            raw=None,
        )
