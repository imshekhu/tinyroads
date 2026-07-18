export type GameMode = "exploration" | "multiplayer-race" | "freestyle";

export type ModeDefinition = {
  id: GameMode;
  name: string;
  label: string;
  description: string;
  objective: string;
  multiplayer: boolean;
  raceEnabled: boolean;
  stuntEnabled: boolean;
};

export const MODE_DEFINITIONS: Record<GameMode, ModeDefinition> = {
  exploration: {
    id: "exploration",
    name: "Open Planet",
    label: "Exploration",
    description: "Cruise the full circuit, find bolts, and discover track landmarks.",
    objective: "Explore without a clock",
    multiplayer: false,
    raceEnabled: false,
    stuntEnabled: true,
  },
  "multiplayer-race": {
    id: "multiplayer-race",
    name: "Planet Prix",
    label: "Online race",
    description: "Match into a live room for a full four-lane circuit race.",
    objective: "First clean lap wins",
    multiplayer: true,
    raceEnabled: true,
    stuntEnabled: false,
  },
  freestyle: {
    id: "freestyle",
    name: "Stunt Planet",
    label: "Freestyle",
    description: "Use the circuit ramps to chain drifts, airtime, and combos.",
    objective: "Build a 90-second combo",
    multiplayer: false,
    raceEnabled: false,
    stuntEnabled: true,
  },
};

export class ModeManager {
  private currentMode: GameMode = "exploration";

  get current() {
    return MODE_DEFINITIONS[this.currentMode];
  }

  select(mode: GameMode) {
    if (!(mode in MODE_DEFINITIONS)) return this.current;
    this.currentMode = mode;
    return this.current;
  }

  reset() {
    this.currentMode = "exploration";
  }
}
