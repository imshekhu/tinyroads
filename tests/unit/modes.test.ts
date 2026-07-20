import { describe, expect, it } from "vitest";
import { MODE_DEFINITIONS, ModeManager } from "../../src/modes/GameMode";

describe("ModeManager", () => {
  it("starts in exploration and exposes distinct capabilities", () => {
    const manager = new ModeManager();
    expect(manager.current.id).toBe("exploration");
    expect(MODE_DEFINITIONS.exploration.raceEnabled).toBe(false);
    expect(MODE_DEFINITIONS["multiplayer-race"].multiplayer).toBe(true);
    expect(MODE_DEFINITIONS.freestyle.stuntEnabled).toBe(true);
  });

  it("switches modes deterministically", () => {
    const manager = new ModeManager();
    expect(manager.select("freestyle").id).toBe("freestyle");
    expect(manager.select("multiplayer-race").raceEnabled).toBe(true);
    manager.reset();
    expect(manager.current.id).toBe("exploration");
  });
});
