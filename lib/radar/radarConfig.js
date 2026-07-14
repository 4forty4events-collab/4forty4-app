// 4Forty4 Radar — client engine config.
//
// RADAR_SIM_ENABLED is the master DEV/TEST switch for the local foreground engine.
// It stays FALSE in the shipped build so the flagship stays flag-locked (the UI only
// shows the "coming soon" modal/card). Flip to true — with an admin account — to
// exercise the full proximity pipeline on-device against the real DB, no paid infra.
export const RADAR_SIM_ENABLED = false;

// Venue proximity radius, in meters, fed to evaluate_radar_proximity.
export const RADAR_RADIUS_M = 500;

// Minimum gap between pipeline evaluations, so a walking user pings at a sane rate.
export const RADAR_PING_INTERVAL_MS = 15000;
