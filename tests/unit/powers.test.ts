import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PLANET_RADIUS } from "../../src/config";
import {
  POWER_DEFINITIONS,
  PowerSystem,
} from "../../src/gameplay/Powers";
import { RoadNetwork } from "../../src/world/RoadNetwork";

describe("arcade power system", () => {
  it("defines original beach, toy-speed, and kart-style powers", () => {
    expect(Object.keys(POWER_DEFINITIONS)).toEqual(
      expect.arrayContaining([
        "sand-surge",
        "orbit-rush",
        "bubble-shell",
        "sticky-treads",
        "sky-spring",
        "tar-trail",
      ]),
    );
    expect(POWER_DEFINITIONS["orbit-rush"].name).toBe("Orbit Rush");
    expect(POWER_DEFINITIONS["sand-surge"].name).toBe("Sand Surge");
  });

  it("picks up one capsule charge and blocks a second until used", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const powers = new PowerSystem(road);
    const firstSample = road.samples[Math.round(0.05 * (road.samples.length - 1))];
    const nextSample = road.samples[Math.round(0.18 * (road.samples.length - 1))];

    const first = powers.tryPickup(firstSample.normal.clone());
    expect(first.picked).not.toBeNull();
    expect(powers.hud.held?.id).toBe(first.picked?.id);

    const blocked = powers.tryPickup(nextSample.normal.clone());
    expect(blocked.picked).toBeNull();
    expect(blocked.blocked).toBe(true);

    powers.dispose();
    road.dispose();
  });

  it("applies orbit rush modifiers after activation", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const powers = new PowerSystem(road);
    const sample = road.samples[Math.round(0.05 * (road.samples.length - 1))];
    powers.tryPickup(sample.normal.clone());

    // Force a deterministic held power for the modifier assertion.
    (powers as unknown as { held: string }).held = "orbit-rush";
    const used = powers.tryActivate({
      canLaunch: true,
      launch: () => true,
      dropBehind: sample.normal.clone(),
      forward: sample.tangent.clone(),
      normal: sample.normal.clone(),
      fillBoost: () => undefined,
      surgeSpeed: () => undefined,
    });

    expect(used?.id).toBe("orbit-rush");
    expect(powers.modifiers.speedCapScale).toBeGreaterThan(1.4);
    expect(powers.hud.active?.id).toBe("orbit-rush");

    powers.update(3, 0, sample.normal.clone());
    expect(powers.hud.active).toBeNull();

    powers.dispose();
    road.dispose();
  });

  it("drops a tar trail slick that affects nearby cars", () => {
    const road = new RoadNetwork(() => PLANET_RADIUS);
    const powers = new PowerSystem(road);
    const sample = road.samples[Math.round(0.28 * (road.samples.length - 1))];
    (powers as unknown as { held: string }).held = "tar-trail";

    const used = powers.tryActivate({
      canLaunch: true,
      launch: () => true,
      dropBehind: sample.normal.clone(),
      forward: sample.tangent.clone(),
      normal: sample.normal.clone(),
      fillBoost: () => undefined,
      surgeSpeed: () => undefined,
    });
    expect(used?.id).toBe("tar-trail");
    expect(powers.isOnSlick(sample.normal.clone())).toBe(true);

    const away = new THREE.Vector3(0, 1, 0);
    expect(powers.isOnSlick(away)).toBe(false);

    powers.dispose();
    road.dispose();
  });
});
