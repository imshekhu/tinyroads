import { describe, expect, it } from "vitest";
import {
  DriveInputSchema,
  JoinRequestSchema,
  PROTOCOL_VERSION,
} from "../../shared/protocol";

describe("multiplayer protocol validation", () => {
  it("accepts a bounded current-version join request", () => {
    expect(
      JoinRequestSchema.safeParse({
        protocol: PROTOCOL_VERSION,
        name: "Driver One",
        color: 0xff7733,
        mode: "race",
      }).success,
    ).toBe(true);
  });

  it("rejects protocol mismatch and oversized names", () => {
    expect(
      JoinRequestSchema.safeParse({
        protocol: 999,
        name: "x".repeat(100),
        color: 0,
        mode: "race",
      }).success,
    ).toBe(false);
  });

  it("rejects impossible control payloads", () => {
    expect(
      DriveInputSchema.safeParse({
        sequence: 1,
        throttle: 4,
        brake: 0,
        steering: Number.NaN,
        handbrake: false,
        boost: false,
        clientTime: 1,
      }).success,
    ).toBe(false);
  });
});
