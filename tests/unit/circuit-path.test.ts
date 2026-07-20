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
    const mid = latitudeFromKeys(track.keys, 0.34);
    const late = latitudeFromKeys(track.keys, 0.8);
    expect(Math.abs(mid - main) + Math.abs(late - main)).toBeGreaterThan(0.05);
    expect(inSector(0.18, CIRCUIT_SECTORS.primaVariante)).toBe(true);
    expect(circuitLatitude(0.08)).toBeCloseTo(main, 5);
    // Grade separation: temple has a flyover and a tunnel.
    const elevBridge = track.keys.some((key) => (key.elev ?? 0) > 0.25);
    const elevTunnel = track.keys.some((key) => (key.elev ?? 0) < -0.25);
    expect(elevBridge).toBe(true);
    expect(elevTunnel).toBe(true);
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
