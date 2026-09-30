/** Shared world constants (units are metres, +Z is "forward"). */
export const ROAD_HALF = 6.0; // road spans x in [-6, 6]
export const CROWD_LIMIT = ROAD_HALF - 0.7; // crowd centre clamp
export const RENDER_CAP = 1400; // max stickmen actually drawn
export const BASE_SPEED = 15.5; // forward m/s
export const LATERAL_SPEED = 13.0; // sideways m/s (keyboard)
export const GATE_WIDTH = ROAD_HALF; // each gate covers half the road
export const CAMERA_OFFSET = { x: 0, y: 8.2, z: -12.5 };

export const SKIN_TINTS = {
  azure: '#3b9dff',
  mint: '#35d9a6',
  coral: '#ff6b6b',
  sunset: '#ff9f43',
  violet: '#a55eea',
  lime: '#a3e635',
  ice: '#dbeafe',
  gold: '#ffc531',
  ink: '#37474f',
  rose: '#ff8fc8',
  cyber: '#00e5ff',
  magma: '#ff3d3d',
};
