/** Larger world so seven circuits and scenic districts have room to breathe. */
export const PLANET_RADIUS = 48;
export const OCEAN_LEVEL = 0.015;
/** Eight-lane grand-prix asphalt width in world units. */
export const ROAD_WIDTH = 1.45;
export const ROAD_LANES = 8;
export const ROAD_SAMPLE_COUNT = 1100;
export const CAR_CLEARANCE = 0.055;
/** Keep props/buildings clear of asphalt + runoff. */
export const ROAD_CLEARANCE = ROAD_WIDTH * 0.5 + 1.35;

export const COLORS = {
  skyDay: 0x8ad7ff,
  skySunset: 0xf59b78,
  skyNight: 0x11152f,
  oceanDay: 0x2f9fb8,
  oceanNight: 0x19375d,
  road: 0x262a2c,
  roadEdge: 0xe9dcc4,
  roadLine: 0xf5c84b,
  grassLow: 0x6ea65d,
  grassHigh: 0x99bb68,
  stone: 0x888b85,
};

export const CAR_PALETTE = [
  { name: "Tangerine", value: 0xf36d38 },
  { name: "Sky blue", value: 0x39a5dc },
  { name: "Meadow", value: 0x4fae6b },
  { name: "Lavender", value: 0x9a72cf },
];
