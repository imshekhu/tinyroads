import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLANET_RADIUS } from "../../src/config";
import {
  POWER_DEFINITIONS,
  PowerSystem,
  type PowerId,
} from "../../src/gameplay/Powers";
import { RoadNetwork } from "../../src/world/RoadNetwork";

const expectedIds: PowerId[] = [
  "speed-boost",
  "high-jump",
  "lane-trap",
  "cruise-missile",
  "shield",
  "smoke-screen",
  "emp-blast",
];

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function setup() {
  const road = new RoadNetwork(() => PLANET_RADIUS);
  const powers = new PowerSystem(road);
  const sample = road.samples[Math.round(0.28 * (road.samples.length - 1))]!;
  cleanups.push(() => {
    powers.dispose();
    road.dispose();
  });
  return { road, powers, sample };
}

function activationContext(
  normal: THREE.Vector3,
  forward: THREE.Vector3,
  overrides: Partial<{
    launch: (force: number) => boolean;
    fillBoost: () => void;
    surgeSpeed: () => void;
  }> = {},
) {
  return {
    launch: overrides.launch ?? (() => true),
    dropBehind: normal.clone(),
    forward: forward.clone(),
    normal: normal.clone(),
    elevation: 0,
    fillBoost: overrides.fillBoost ?? (() => undefined),
    surgeSpeed: overrides.surgeSpeed ?? (() => undefined),
  };
}

describe("power system", () => {
  it("defines exactly the seven requested powers", () => {
    expect(Object.keys(POWER_DEFINITIONS)).toEqual(expectedIds);
    for (const id of expectedIds) {
      expect(POWER_DEFINITIONS[id]).toMatchObject({
        id,
        name: expect.any(String),
        description: expect.any(String),
      });
      expect(POWER_DEFINITIONS[id].duration).toBeGreaterThan(0);
    }
  });

  it("picks up one capsule and blocks a second until the charge is used", () => {
    const { road, powers } = setup();
    const first = road.samples[Math.round(0.05 * (road.samples.length - 1))]!;
    const second = road.samples[Math.round(0.18 * (road.samples.length - 1))]!;

    const pickup = powers.tryPickup(first.normal);
    expect(pickup.picked).not.toBeNull();
    expect(powers.hud.held?.id).toBe(pickup.picked?.id);
    expect(powers.tryPickup(second.normal)).toEqual({
      picked: null,
      blocked: true,
    });
  });

  it("grants and activates a speed boost deterministically", () => {
    const { powers, sample } = setup();
    const fillBoost = vi.fn();
    const surgeSpeed = vi.fn();

    expect(powers.grant("speed-boost").id).toBe("speed-boost");
    const used = powers.tryActivate(
      activationContext(sample.normal, sample.tangent, {
        fillBoost,
        surgeSpeed,
      }),
    );

    expect(used?.id).toBe("speed-boost");
    expect(fillBoost).toHaveBeenCalledOnce();
    expect(surgeSpeed).toHaveBeenCalledOnce();
    expect(powers.modifiers.speedCapScale).toBeGreaterThan(2);
    expect(powers.modifiers.autoBoost).toBe(true);
    powers.update(4, 4, sample.normal);
    expect(powers.hud.active).toBeNull();
    expect(powers.modifiers).toMatchObject({
      speedCapScale: 1,
      autoBoost: false,
    });
  });

  it("launches high jump with the arcade jump force", () => {
    const { powers, sample } = setup();
    const launch = vi.fn(() => true);
    powers.grant("high-jump");

    expect(
      powers.tryActivate(
        activationContext(sample.normal, sample.tangent, { launch }),
      )?.id,
    ).toBe("high-jump");
    expect(launch).toHaveBeenCalledWith(1.85);
  });

  it("drops an armed rear lane trap and keeps the slick compatibility alias", () => {
    const { powers, sample } = setup();
    powers.grant("lane-trap");
    powers.tryActivate(activationContext(sample.normal, sample.tangent));

    expect(powers.isOnHazard(sample.normal)).toBe(false);
    const status = powers.update(0.5, 0.5, sample.normal);
    expect(status).toMatchObject({ trap: true, slicked: true });
    expect(powers.isOnSlick(sample.normal)).toBe(true);
    expect(powers.isOnSlick(new THREE.Vector3(0, 1, 0))).toBe(false);
  });

  it("shield blocks trap, smoke, EMP, and missile effects", () => {
    const { powers, sample } = setup();
    powers.grant("shield");
    powers.tryActivate(activationContext(sample.normal, sample.tangent));

    for (const powerId of [
      "lane-trap",
      "smoke-screen",
      "emp-blast",
      "cruise-missile",
    ] as const) {
      expect(
        powers.receiveRemotePowerEvent({
          powerId,
          position: sample.normal,
          forward: sample.tangent,
        }),
      ).toEqual({ accepted: true, blockedByShield: true });
    }

    expect(powers.update(0, 0, sample.normal)).toMatchObject({
      trap: false,
      smoke: false,
      emp: false,
      missile: false,
      steeringLocked: false,
      slicked: false,
    });
    expect(powers.modifiers.steerScale).toBeGreaterThan(0);
  });

  it("applies a remote EMP steering lock for exactly three seconds", () => {
    const { powers, sample } = setup();
    expect(
      powers.receiveRemotePowerEvent({
        powerId: "emp-blast",
        position: sample.normal,
        forward: sample.tangent,
      }),
    ).toEqual({ accepted: true, blockedByShield: false });

    const hit = powers.update(0, 0, sample.normal);
    expect(hit).toMatchObject({ emp: true, steeringLocked: true });
    expect(powers.modifiers.steerScale).toBe(0);

    expect(powers.update(2.99, 2.99, sample.normal).steeringLocked).toBe(true);
    expect(powers.modifiers.steerScale).toBe(0);
    expect(powers.update(0.01, 3, sample.normal).steeringLocked).toBe(false);
    expect(powers.modifiers.steerScale).toBe(1);
  });
});
