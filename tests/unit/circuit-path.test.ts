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

  it("catalogs seven distinct circuits", () => {
    expect(TRACK_CATALOG).toHaveLength(7);
    const ids = new Set(TRACK_CATALOG.map((track) => track.id));
    expect(ids.size).toBe(7);
  });

  it("smooths Temple Speedway corners instead of a flat ring", () => {
    const track = TRACK_CATALOG[0];
    const main = latitudeFromKeys(track.keys, 0.08);
    const chicaneA = latitudeFromKeys(track.keys, 0.17);
    const chicaneB = latitudeFromKeys(track.keys, 0.2);
    const lesmo = latitudeFromKeys(track.keys, 0.51);
    const parabolica = latitudeFromKeys(track.keys, 0.9);
    expect(Math.abs(chicaneA - main)).toBeGreaterThan(0.02);
    expect(Math.abs(chicaneB - chicaneA)).toBeGreaterThan(0.03);
    expect(Math.abs(lesmo - main)).toBeGreaterThan(0.1);
    expect(Math.abs(parabolica - main)).toBeGreaterThan(0.1);
    expect(inSector(0.18, CIRCUIT_SECTORS.primaVariante)).toBe(true);
    expect(circuitLatitude(0.08)).toBeCloseTo(main, 5);
  });

  it("still targets a playable flat-out lap window", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS, TRACK_CATALOG[0]);
    const estimatedSeconds = road.lapLength / 2.08;
    expect(estimatedSeconds).toBeGreaterThan(90);
    expect(estimatedSeconds).toBeLessThan(180);
    expect(road.group.name).toContain("temple-speedway");
    road.dispose();
  });
});
