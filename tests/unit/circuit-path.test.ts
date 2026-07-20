import { describe, expect, it } from "vitest";
import { PLANET_RADIUS, ROAD_LANES, ROAD_WIDTH } from "../../src/config";
import {
  CIRCUIT_SECTORS,
  circuitLatitude,
  inSector,
} from "../../src/world/circuitPath";
import { RoadNetwork } from "../../src/world/RoadNetwork";

describe("grand prix circuit path", () => {
  it("uses an eight-lane asphalt width", () => {
    expect(ROAD_LANES).toBe(8);
    expect(ROAD_WIDTH).toBeGreaterThan(1.2);
  });

  it("has Monza-like sector changes instead of a flat ring", () => {
    const main = circuitLatitude(0.08);
    const chicaneRight = circuitLatitude(0.168);
    const chicaneLeft = circuitLatitude(0.186);
    const lesmo = circuitLatitude(0.445);
    const parabolica = circuitLatitude(0.82);
    expect(Math.abs(chicaneRight - main)).toBeGreaterThan(0.05);
    expect(Math.abs(chicaneLeft - chicaneRight)).toBeGreaterThan(0.1);
    expect(Math.abs(lesmo - main)).toBeGreaterThan(0.15);
    expect(Math.abs(parabolica - main)).toBeGreaterThan(0.15);
    expect(inSector(0.18, CIRCUIT_SECTORS.primaVariante)).toBe(true);
    expect(inSector(0.5, CIRCUIT_SECTORS.backStraight)).toBe(true);
  });

  it("still targets an approximately eighty-second flat-out lap", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const estimatedSeconds = road.lapLength / 2.08;
    expect(estimatedSeconds).toBeGreaterThan(70);
    expect(estimatedSeconds).toBeLessThan(100);
    expect(road.group.name).toContain("eight-lane");
    road.dispose();
  });
});
