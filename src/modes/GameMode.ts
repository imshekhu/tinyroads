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
    description: "Roam every route, find bolts, shortcuts, and hidden landmarks.",
    objective: "Explore without a clock",
    multiplayer: false,
    raceEnabled: false,
    stuntEnabled: true,
  },
  "multiplayer-race": {
    id: "multiplayer-race",
    name: "Planet Prix",
    label: "Online race",
    description: "Match into a live room and race the coast circuit together.",
    objective: "First clean lap wins",
    multiplayer: true,
    raceEnabled: true,
    stuntEnabled: false,
  },
  freestyle: {
    id: "freestyle",
    name: "Stunt Planet",
    label: "Freestyle",
    description: "Hit ramps, chain drifts, catch air, and bank the biggest score.",
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
