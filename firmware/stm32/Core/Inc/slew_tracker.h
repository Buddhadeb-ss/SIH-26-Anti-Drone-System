/*
 * slew_tracker.h
 *
 *  Created on: 27-Aug-2026
 *      Author: Adarsha Udupa
 */

#ifndef INC_SLEW_TRACKER_H_
#define INC_SLEW_TRACKER_H_

typedef enum {
    SOURCE_RADAR_LD2452,
    SOURCE_VISION_C2
} TargetSource_t;

typedef struct {
    float x_angle;      // Azimuth error from center
    float y_angle;      // Elevation error from center
    float distance;     // Meters (from radar)
    TargetSource_t src; // Who is reporting this target?
} TargetData_t;

typedef enum {
    POD_STATE_SEARCH,   // Raster sweeping 360 degrees
    POD_STATE_TRACK,    // Locking onto a radar/vision target
    POD_STATE_ENGAGE    // Firing the net-shooter
} PodState_t;

#endif /* INC_SLEW_TRACKER_H_ */
