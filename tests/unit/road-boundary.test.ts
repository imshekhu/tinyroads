import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLANET_RADIUS, ROAD_WIDTH } from "../../src/config";
import { RoadNetwork } from "../../src/world/RoadNetwork";

describe("eight-lane grand prix circuit", () => {
  it("targets an approximately 80-second flat-out lap", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const estimatedSeconds = road.lapLength / 2.08;
    expect(estimatedSeconds).toBeGreaterThan(90);
    expect(estimatedSeconds).toBeLessThan(180);
    road.dispose();
  });

  it("clamps positions inside the containment barriers", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const sample = road.samples[100];
    const side = new THREE.Vector3()
      .crossVectors(sample.normal, sample.tangent)
      .normalize();
    const outside = sample.normal
      .clone()
      .addScaledVector(side, 0.8 / PLANET_RADIUS)
      .normalize();
    const result = road.clampToTrack(outside);
    expect(result.constrained).toBe(true);
    expect(road.getRoadInfo(result.normal).distance).toBeLessThanOrEqual(
      ROAD_WIDTH * 0.415,
    );
    road.dispose();
  });
});
