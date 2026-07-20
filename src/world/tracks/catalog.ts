export type PathKey = {
  t: number;
  lat: number;
  /** Reserved for future grade-separated circuits; the current track is flat. */
  elev?: number;
};

export type TrackDefinition = {
  id: string;
  name: string;
  label: string;
  tagline: string;
  phase: number;
  asphalt: number;
  shoulder: number;
  keys: PathKey[];
};

/**
 * One deliberately technical circuit. Longitude always advances, so this
 * ribbon cannot cross itself; frequent latitude reversals create braking
 * zones, esses, and hairpins without bridge or tunnel clutter.
 */
export const TRACK_CATALOG: TrackDefinition[] = [
  {
    id: "temple-speedway",
    name: "Temple Technical",
    label: "Technical GP",
    tagline: "Twenty corners, tight esses, and brake-heavy switchbacks",
    phase: 0,
    asphalt: 0x262a2c,
    shoulder: 0x7a33cc,
    keys: [
      { t: 0.0, lat: 0.08 },
      { t: 0.07, lat: 0.08 },
      { t: 0.105, lat: 0.18 },
      { t: 0.14, lat: -0.04 },
      { t: 0.18, lat: 0.15 },
      { t: 0.225, lat: -0.13 },
      { t: 0.27, lat: -0.02 },
      { t: 0.315, lat: 0.17 },
      { t: 0.355, lat: -0.14 },
      { t: 0.4, lat: 0.12 },
      { t: 0.445, lat: 0.02 },
      { t: 0.49, lat: -0.17 },
      { t: 0.535, lat: 0.14 },
      { t: 0.58, lat: -0.1 },
      { t: 0.63, lat: 0.04 },
      { t: 0.68, lat: 0.18 },
      { t: 0.725, lat: -0.12 },
      { t: 0.77, lat: 0.11 },
      { t: 0.815, lat: -0.16 },
      { t: 0.86, lat: 0.04 },
      { t: 0.905, lat: 0.17 },
      { t: 0.95, lat: 0.08 },
      { t: 1.0, lat: 0.08 },
    ],
  },
];

export function getTrackById(id: string) {
  return TRACK_CATALOG.find((track) => track.id === id) ?? TRACK_CATALOG[0];
}
