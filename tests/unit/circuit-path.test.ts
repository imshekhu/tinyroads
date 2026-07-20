import { describe, expect, it } from "vitest";
import { PLANET_RADIUS, ROAD_LANES, ROAD_WIDTH } from "../../src/config";
import {
  CIRCUIT_SECTORS,
  circuitLatitude,
  inSector,
  latitudeFromKeys,
} from "../../src/world/circuitPath";
import { RoadNetwork } from "../../src/world/RoadNetwork";
import { TRACK_CATALOG } from "../../src/world/tracks/catalog";

describe("grand prix circuit path", () => {
  it("uses an eight-lane asphalt width on a larger planet", () => {
    expect(ROAD_LANES).toBe(8);
    expect(ROAD_WIDTH).toBeGreaterThan(1.2);
    expect(PLANET_RADIUS).toBeGreaterThanOrEqual(40);
  });

  it("focuses the world on one collision-free circuit", () => {
    expect(TRACK_CATALOG).toHaveLength(1);
    expect(TRACK_CATALOG[0].keys.every((key) => (key.elev ?? 0) === 0)).toBe(true);
  });

  it("builds frequent technical direction changes instead of a flat ring", () => {
    const track = TRACK_CATALOG[0];
    const samples = Array.from({ length: 41 }, (_, index) =>
      latitudeFromKeys(track.keys, index / 40),
    );
    let reversals = 0;
    let previousDirection = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const direction = Math.sign(samples[index]! - samples[index - 1]!);
      if (direction && previousDirection && direction !== previousDirection) reversals += 1;
      if (direction) previousDirection = direction;
    }
    expect(reversals).toBeGreaterThanOrEqual(12);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.25);
    expect(inSector(0.18, CIRCUIT_SECTORS.primaVariante)).toBe(true);
    expect(circuitLatitude(0.08)).toBeCloseTo(
      latitudeFromKeys(track.keys, 0.08),
      5,
    );
  });

  it("still targets a playable flat-out lap window", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS, TRACK_CATALOG[0]);
    const estimatedSeconds = road.lapLength / 2.08;
    expect(estimatedSeconds).toBeGreaterThan(90);
    expect(estimatedSeconds).toBeLessThan(210);
    expect(road.group.name).toContain("temple-speedway");
    road.dispose();
  });
});
