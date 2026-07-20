export type PathKey = { t: number; lat: number };

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

/**
 * Seven original circuits. Temple Speedway is Monza-inspired in structure only;
 * other routes explore harbor, alpine, desert, jungle, city, and archipelago moods.
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
      { t: 0.0, lat: 0.08 },
      { t: 0.14, lat: 0.08 },
      // Prima — softened S
      { t: 0.17, lat: 0.045 },
      { t: 0.2, lat: 0.11 },
      { t: 0.23, lat: 0.075 },
      // Curva Grande
      { t: 0.28, lat: 0.035 },
      { t: 0.34, lat: -0.02 },
      // Seconda — softened
      { t: 0.37, lat: 0.04 },
      { t: 0.4, lat: -0.03 },
      { t: 0.43, lat: 0.01 },
      // Lesmos
      { t: 0.47, lat: -0.05 },
      { t: 0.51, lat: -0.09 },
      { t: 0.55, lat: -0.06 },
      { t: 0.59, lat: -0.11 },
      // Back straight
      { t: 0.68, lat: -0.1 },
      // Ascari — flowing
      { t: 0.72, lat: -0.04 },
      { t: 0.76, lat: -0.12 },
      { t: 0.8, lat: -0.05 },
      { t: 0.84, lat: -0.08 },
      // Parabolica
      { t: 0.9, lat: -0.12 },
      { t: 0.94, lat: -0.02 },
      { t: 0.975, lat: 0.05 },
      { t: 1.0, lat: 0.08 },
    ],
  },
  {
    id: "harbor-crescent",
    name: "Harbor Crescent",
    label: "Port",
    tagline: "Sea-wall sweep past cranes and the container yard",
    phase: 0.85,
    asphalt: 0x2a3035,
    shoulder: 0xd4a574,
    keys: [
      { t: 0, lat: -0.18 },
      { t: 0.2, lat: -0.16 },
      { t: 0.32, lat: -0.08 },
      { t: 0.42, lat: -0.2 },
      { t: 0.55, lat: -0.12 },
      { t: 0.68, lat: -0.22 },
      { t: 0.82, lat: -0.1 },
      { t: 0.92, lat: -0.17 },
      { t: 1, lat: -0.18 },
    ],
  },
  {
    id: "alpine-ribbon",
    name: "Alpine Ribbon",
    label: "Peak",
    tagline: "High-altitude switchbacks through the pines",
    phase: 1.7,
    asphalt: 0x303438,
    shoulder: 0xcfd6de,
    keys: [
      { t: 0, lat: 0.32 },
      { t: 0.12, lat: 0.28 },
      { t: 0.22, lat: 0.38 },
      { t: 0.34, lat: 0.26 },
      { t: 0.46, lat: 0.36 },
      { t: 0.58, lat: 0.24 },
      { t: 0.7, lat: 0.34 },
      { t: 0.82, lat: 0.27 },
      { t: 0.92, lat: 0.33 },
      { t: 1, lat: 0.32 },
    ],
  },
  {
    id: "dune-oval",
    name: "Dune Oval",
    label: "Desert",
    tagline: "Wide, fast bowl with gentle banked arcs",
    phase: 2.55,
    asphalt: 0x3a342c,
    shoulder: 0xe2c08a,
    keys: [
      { t: 0, lat: 0.02 },
      { t: 0.25, lat: 0.08 },
      { t: 0.5, lat: 0.02 },
      { t: 0.75, lat: -0.05 },
      { t: 1, lat: 0.02 },
    ],
  },
  {
    id: "canopy-switchback",
    name: "Canopy Switchback",
    label: "Jungle",
    tagline: "Tight rhythm section under the rainforest canopy",
    phase: 3.4,
    asphalt: 0x243028,
    shoulder: 0x6b8f4e,
    keys: [
      { t: 0, lat: 0.14 },
      { t: 0.1, lat: 0.2 },
      { t: 0.2, lat: 0.1 },
      { t: 0.3, lat: 0.22 },
      { t: 0.4, lat: 0.09 },
      { t: 0.5, lat: 0.21 },
      { t: 0.6, lat: 0.11 },
      { t: 0.7, lat: 0.23 },
      { t: 0.8, lat: 0.12 },
      { t: 0.9, lat: 0.19 },
      { t: 1, lat: 0.14 },
    ],
  },
  {
    id: "neon-boulevard",
    name: "Neon Boulevard",
    label: "City",
    tagline: "Downtown figure-eight energy around the skyline",
    phase: 4.25,
    asphalt: 0x1e2228,
    shoulder: 0x7a6cff,
    keys: [
      { t: 0, lat: -0.05 },
      { t: 0.15, lat: 0.06 },
      { t: 0.3, lat: -0.08 },
      { t: 0.45, lat: 0.09 },
      { t: 0.6, lat: -0.07 },
      { t: 0.75, lat: 0.08 },
      { t: 0.9, lat: -0.04 },
      { t: 1, lat: -0.05 },
    ],
  },
  {
    id: "coral-archipelago",
    name: "Coral Archipelago",
    label: "Isles",
    tagline: "Island hops with beachside esses and a lagoon sweep",
    phase: 5.1,
    asphalt: 0x2c3330,
    shoulder: 0xf0d7a0,
    keys: [
      { t: 0, lat: -0.28 },
      { t: 0.18, lat: -0.22 },
      { t: 0.32, lat: -0.34 },
      { t: 0.48, lat: -0.2 },
      { t: 0.62, lat: -0.32 },
      { t: 0.78, lat: -0.24 },
      { t: 0.9, lat: -0.3 },
      { t: 1, lat: -0.28 },
    ],
  },
];

export function getTrackById(id: string) {
  return TRACK_CATALOG.find((track) => track.id === id) ?? TRACK_CATALOG[0];
}
