import { describe, expect, it } from "vitest";
import { createServerPlayer, simulatePlayer } from "../../server/physics";

describe("server car simulation", () => {
  it("advances from validated inputs while preserving spherical invariants", () => {
    const player = createServerPlayer("p1", "Driver", 0xff0000, 0);
    player.input = {
      sequence: 1,
      throttle: 1,
      brake: 0,
      steering: 0.4,
      handbrake: false,
      boost: false,
      clientTime: 10,
    };

    for (let tick = 0; tick < 60; tick += 1) {
      simulatePlayer(player, 1 / 30);
    }

    const normalLength = Math.hypot(...player.state.normal);
    const forwardLength = Math.hypot(...player.state.forward);
    const tangentDot = player.state.normal.reduce(
      (sum, value, index) => sum + value * player.state.forward[index],
      0,
    );
    expect(player.state.speed).toBeGreaterThan(1);
    expect(normalLength).toBeCloseTo(1, 5);
    expect(forwardLength).toBeCloseTo(1, 5);
    expect(Math.abs(tangentDot)).toBeLessThan(0.00001);
    expect(player.state.lastInputSequence).toBe(1);
  });

  it("clamps untrusted acceleration to the server speed cap", () => {
    const player = createServerPlayer("p2", "Driver", 0, 1);
    player.input = {
      sequence: 3,
      throttle: 1,
      brake: 0,
      steering: 0,
      handbrake: false,
      boost: true,
      clientTime: 10,
    };
    for (let tick = 0; tick < 600; tick += 1) {
      simulatePlayer(player, 1 / 30);
    }
    expect(player.state.speed).toBeLessThanOrEqual(2.72);
  });
});
