/**
 * Original grand-prix circuit path inspired by the structure of Autodromo
 * Nazionale Monza (Temple of Speed): long main straight, two chicanes,
 * sweeping Curva Grande, paired Lesmo rights, Ascari complex, and a long
 * Parabolica-style final right. Geometry is procedural and original — not a
 * surveyed copy of the real track.
 */

type Key = { t: number; lat: number };

const KEYS: Key[] = [
  // Rettifilo / main straight
  { t: 0.0, lat: 0.085 },
  { t: 0.155, lat: 0.085 },
  // Prima Variante — tight right-left chicane
  { t: 0.168, lat: 0.02 },
  { t: 0.186, lat: 0.155 },
  { t: 0.205, lat: 0.095 },
  // Curva Grande — long flat-out right sweep
  { t: 0.245, lat: 0.04 },
  { t: 0.3, lat: -0.035 },
  // Seconda Variante — left-right chicane
  { t: 0.315, lat: 0.07 },
  { t: 0.332, lat: -0.055 },
  { t: 0.35, lat: 0.01 },
  // Lesmo 1
  { t: 0.375, lat: -0.09 },
  { t: 0.395, lat: -0.115 },
  // Lesmo 2
  { t: 0.42, lat: -0.08 },
  { t: 0.445, lat: -0.165 },
  // Back straight
  { t: 0.5, lat: -0.15 },
  { t: 0.575, lat: -0.14 },
  // Ascari — left / right / left
  { t: 0.595, lat: -0.03 },
  { t: 0.62, lat: -0.185 },
  { t: 0.648, lat: -0.04 },
  { t: 0.67, lat: -0.1 },
  // Straight toward the final corner
  { t: 0.76, lat: -0.09 },
  // Parabolica-style decreasing-radius right onto the main straight
  { t: 0.82, lat: -0.175 },
  { t: 0.875, lat: -0.06 },
  { t: 0.93, lat: 0.035 },
  { t: 0.975, lat: 0.08 },
  { t: 1.0, lat: 0.085 },
];

function wrap01(value: number) {
  return ((value % 1) + 1) % 1;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function circuitProgressFromTheta(theta: number) {
  return wrap01(theta / (Math.PI * 2));
}

export function circuitLatitude(progress: number) {
  const t = wrap01(progress);
  for (let index = 0; index < KEYS.length - 1; index += 1) {
    const a = KEYS[index];
    const b = KEYS[index + 1];
    if (t < a.t || t > b.t) continue;
    const span = b.t - a.t;
    // Chicanes stay snappy; sweeping corners ease.
    const chicane = span < 0.03;
    const alpha = chicane
      ? (t - a.t) / span
      : smoothstep(a.t, b.t, t);
    return a.lat + (b.lat - a.lat) * alpha;
  }
  return KEYS[0].lat;
}

/** Landmark bands used to place kerbs / features. Values are progress 0..1. */
export const CIRCUIT_SECTORS = {
  mainStraight: [0.0, 0.155] as const,
  primaVariante: [0.155, 0.21] as const,
  curvaGrande: [0.21, 0.3] as const,
  secondaVariante: [0.3, 0.355] as const,
  lesmo: [0.355, 0.46] as const,
  backStraight: [0.46, 0.575] as const,
  ascari: [0.575, 0.68] as const,
  parabolica: [0.78, 0.97] as const,
};

export function inSector(
  progress: number,
  sector: readonly [number, number],
) {
  const t = wrap01(progress);
  return t >= sector[0] && t < sector[1];
}
