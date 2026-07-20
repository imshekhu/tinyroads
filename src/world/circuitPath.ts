import type { PathKey, TrackDefinition } from "./tracks/catalog";
import { TRACK_CATALOG } from "./tracks/catalog";

function wrap01(value: number) {
  return ((value % 1) + 1) % 1;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function keyAt(keys: PathKey[], index: number) {
  const count = keys.length - 1;
  if (index < 0) {
    return {
      t: keys[0].t - 0.05,
      lat: keys[count - 1].lat,
      elev: keys[count - 1].elev ?? 0,
    };
  }
  if (index >= keys.length) {
    return {
      t: keys[count].t + 0.05,
      lat: keys[1].lat,
      elev: keys[1].elev ?? 0,
    };
  }
  return keys[index];
}

function sampleChannel(
  keys: PathKey[],
  progress: number,
  channel: "lat" | "elev",
) {
  const t = wrap01(progress);
  for (let index = 0; index < keys.length - 1; index += 1) {
    const a = keys[index];
    const b = keys[index + 1];
    if (t < a.t || t > b.t) continue;
    const span = Math.max(1e-6, b.t - a.t);
    const local = (t - a.t) / span;
    const p0 = channel === "lat" ? keyAt(keys, index - 1).lat : (keyAt(keys, index - 1).elev ?? 0);
    const p1 = channel === "lat" ? a.lat : (a.elev ?? 0);
    const p2 = channel === "lat" ? b.lat : (b.elev ?? 0);
    const p3 = channel === "lat" ? keyAt(keys, index + 2).lat : (keyAt(keys, index + 2).elev ?? 0);
    return catmullRom(p0, p1, p2, p3, local);
  }
  return channel === "lat" ? (keys[0]?.lat ?? 0) : (keys[0]?.elev ?? 0);
}

export function latitudeFromKeys(keys: PathKey[], progress: number) {
  return sampleChannel(keys, progress, "lat");
}

export function elevationFromKeys(keys: PathKey[], progress: number) {
  return sampleChannel(keys, progress, "elev");
}

export function circuitProgressFromTheta(theta: number, phase = 0) {
  return wrap01((theta - phase) / (Math.PI * 2));
}

export function circuitLatitude(
  progress: number,
  track: TrackDefinition = TRACK_CATALOG[0],
) {
  return latitudeFromKeys(track.keys, progress);
}

export const CIRCUIT_SECTORS = {
  mainStraight: [0.0, 0.14] as const,
  primaVariante: [0.14, 0.24] as const,
  curvaGrande: [0.24, 0.34] as const,
  secondaVariante: [0.34, 0.44] as const,
  lesmo: [0.44, 0.6] as const,
  backStraight: [0.6, 0.7] as const,
  ascari: [0.7, 0.84] as const,
  parabolica: [0.84, 0.99] as const,
};

export function inSector(
  progress: number,
  sector: readonly [number, number],
) {
  const t = wrap01(progress);
  return t >= sector[0] && t < sector[1];
}
