export type PathKey = {
  t: number;
  lat: number;
  /** Radial offset in world units: +bridge / flyover, -tunnel / underpass. */
  elev?: number;
};

export type TrackDefinition = {
  id: string;
  name: string;
  label: string;
  tagline: string;
  /** Longitude rotation so circuits fan around the planet. */
  phase: number;
  asphalt: number;
  shoulder: number;
  keys: PathKey[];
};

const TAU = Math.PI * 2;

/**
 * Seven circuits on separated latitude belts with intentional grade separation
 * (bridges / tunnels) so ribbons no longer z-fight when they cross.
 */
export const TRACK_CATALOG: TrackDefinition[] = [
  {
    id: "temple-speedway",
    name: "Temple Speedway",
    label: "GP",
    tagline: "Long straights, smooth chicanes, sweeping final right",
    phase: 0,
    asphalt: 0x262a2c,
    shoulder: 0xe97937,
    keys: [
      { t: 0.0, lat: 0.1, elev: 0 },
      { t: 0.14, lat: 0.1, elev: 0 },
      { t: 0.18, lat: 0.06, elev: 0 },
      { t: 0.22, lat: 0.13, elev: 0.05 },
      { t: 0.28, lat: 0.08, elev: 0.15 },
      { t: 0.34, lat: 0.03, elev: 0.35 }, // flyover
      { t: 0.4, lat: 0.07, elev: 0.2 },
      { t: 0.46, lat: 0.02, elev: 0 },
      { t: 0.52, lat: -0.02, elev: 0 },
      { t: 0.58, lat: 0.02, elev: 0 },
      { t: 0.66, lat: -0.04, elev: 0 },
      { t: 0.74, lat: 0.02, elev: -0.15 }, // dip / underpass start
      { t: 0.8, lat: -0.04, elev: -0.42 }, // tunnel
      { t: 0.86, lat: 0.02, elev: -0.15 },
      { t: 0.92, lat: 0.06, elev: 0 },
      { t: 1.0, lat: 0.1, elev: 0 },
    ],
  },
  {
    id: "harbor-crescent",
    name: "Harbor Crescent",
    label: "Port",
    tagline: "Sea-wall sweep with a breakwater tunnel",
    phase: (1 * TAU) / 7,
    asphalt: 0x2a3035,
    shoulder: 0xd4a574,
    keys: [
      { t: 0, lat: -0.26, elev: 0.05 },
      { t: 0.18, lat: -0.24, elev: 0.05 },
      { t: 0.3, lat: -0.2, elev: -0.35 },
      { t: 0.4, lat: -0.28, elev: -0.45 },
      { t: 0.52, lat: -0.22, elev: -0.1 },
      { t: 0.66, lat: -0.3, elev: 0.2 },
      { t: 0.8, lat: -0.22, elev: 0.4 },
      { t: 0.92, lat: -0.27, elev: 0.1 },
      { t: 1, lat: -0.26, elev: 0.05 },
    ],
  },
  {
    id: "alpine-ribbon",
    name: "Alpine Ribbon",
    label: "Peak",
    tagline: "High viaduct switchbacks above the pines",
    phase: (2 * TAU) / 7,
    asphalt: 0x303438,
    shoulder: 0xcfd6de,
    keys: [
      { t: 0, lat: 0.38, elev: 0.55 },
      { t: 0.15, lat: 0.34, elev: 0.6 },
      { t: 0.28, lat: 0.42, elev: 0.7 },
      { t: 0.42, lat: 0.33, elev: 0.55 },
      { t: 0.56, lat: 0.4, elev: 0.65 },
      { t: 0.7, lat: 0.32, elev: 0.5 },
      { t: 0.84, lat: 0.39, elev: 0.6 },
      { t: 1, lat: 0.38, elev: 0.55 },
    ],
  },
  {
    id: "dune-oval",
    name: "Dune Oval",
    label: "Desert",
    tagline: "Fast bowl with one canyon underpass",
    phase: (3 * TAU) / 7,
    asphalt: 0x3a342c,
    shoulder: 0xe2c08a,
    keys: [
      { t: 0, lat: 0.0, elev: 0 },
      { t: 0.2, lat: 0.05, elev: 0 },
      { t: 0.35, lat: 0.01, elev: -0.2 },
      { t: 0.45, lat: -0.03, elev: -0.48 },
      { t: 0.55, lat: 0.01, elev: -0.2 },
      { t: 0.72, lat: -0.04, elev: 0 },
      { t: 0.88, lat: 0.03, elev: 0.1 },
      { t: 1, lat: 0.0, elev: 0 },
    ],
  },
  {
    id: "canopy-switchback",
    name: "Canopy Switchback",
    label: "Jungle",
    tagline: "Root-tunnel rhythm under the rainforest",
    phase: (4 * TAU) / 7,
    asphalt: 0x243028,
    shoulder: 0x6b8f4e,
    keys: [
      { t: 0, lat: 0.2, elev: -0.1 },
      { t: 0.12, lat: 0.25, elev: -0.35 },
      { t: 0.24, lat: 0.16, elev: -0.5 },
      { t: 0.36, lat: 0.26, elev: -0.35 },
      { t: 0.48, lat: 0.15, elev: -0.1 },
      { t: 0.6, lat: 0.24, elev: 0.15 },
      { t: 0.72, lat: 0.17, elev: 0.35 },
      { t: 0.84, lat: 0.23, elev: 0.1 },
      { t: 1, lat: 0.2, elev: -0.1 },
    ],
  },
  {
    id: "neon-boulevard",
    name: "Neon Boulevard",
    label: "City",
    tagline: "Elevated downtown flyover around the skyline",
    phase: (5 * TAU) / 7,
    asphalt: 0x1e2228,
    shoulder: 0x7a6cff,
    keys: [
      { t: 0, lat: -0.08, elev: 0.65 },
      { t: 0.18, lat: 0.02, elev: 0.75 },
      { t: 0.34, lat: -0.1, elev: 0.7 },
      { t: 0.5, lat: 0.04, elev: 0.8 },
      { t: 0.66, lat: -0.09, elev: 0.7 },
      { t: 0.82, lat: 0.03, elev: 0.75 },
      { t: 1, lat: -0.08, elev: 0.65 },
    ],
  },
  {
    id: "coral-archipelago",
    name: "Coral Archipelago",
    label: "Isles",
    tagline: "Lagoon bridges and a reef underpass",
    phase: (6 * TAU) / 7,
    asphalt: 0x2c3330,
    shoulder: 0xf0d7a0,
    keys: [
      { t: 0, lat: -0.4, elev: 0.15 },
      { t: 0.16, lat: -0.35, elev: 0.35 },
      { t: 0.3, lat: -0.44, elev: 0.2 },
      { t: 0.44, lat: -0.34, elev: -0.25 },
      { t: 0.56, lat: -0.42, elev: -0.5 },
      { t: 0.68, lat: -0.36, elev: -0.15 },
      { t: 0.82, lat: -0.43, elev: 0.25 },
      { t: 1, lat: -0.4, elev: 0.15 },
    ],
  },
];

export function getTrackById(id: string) {
  return TRACK_CATALOG.find((track) => track.id === id) ?? TRACK_CATALOG[0];
}
