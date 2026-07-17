export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number) {
    return min + (max - min) * this.next();
  }
}

function hash(x: number, y: number, z: number, seed: number) {
  let value =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2147483647) +
    Math.imul(seed, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function valueNoise3D(
  x: number,
  y: number,
  z: number,
  seed = 1,
) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const tz = smooth(z - zi);

  const c000 = hash(xi, yi, zi, seed);
  const c100 = hash(xi + 1, yi, zi, seed);
  const c010 = hash(xi, yi + 1, zi, seed);
  const c110 = hash(xi + 1, yi + 1, zi, seed);
  const c001 = hash(xi, yi, zi + 1, seed);
  const c101 = hash(xi + 1, yi, zi + 1, seed);
  const c011 = hash(xi, yi + 1, zi + 1, seed);
  const c111 = hash(xi + 1, yi + 1, zi + 1, seed);

  const x00 = lerp(c000, c100, tx);
  const x10 = lerp(c010, c110, tx);
  const x01 = lerp(c001, c101, tx);
  const x11 = lerp(c011, c111, tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz) * 2 - 1;
}

export function fbm3D(
  x: number,
  y: number,
  z: number,
  seed = 1,
  octaves = 5,
) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let index = 0; index < octaves; index += 1) {
    value +=
      valueNoise3D(x * frequency, y * frequency, z * frequency, seed + index * 17) *
      amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }

  return value / total;
}
