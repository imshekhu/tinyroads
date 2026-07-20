import { CAR_PALETTE } from "../config";
import type { RaceSnapshot } from "../gameplay/Race";
import {
  MODE_DEFINITIONS,
  type GameMode,
} from "../modes/GameMode";
import type { PowerHudState } from "../gameplay/Powers";
import type { CarTelemetry } from "../vehicle/Car";
import type { SkyState } from "../world/Atmosphere";
import { TRACK_CATALOG, type TrackDefinition } from "../world/tracks/catalog";

export function mountInterface(root: HTMLElement) {
  root.innerHTML = `
    <canvas id="game-canvas" aria-label="Tiny Roads 3D driving game"></canvas>

    <div class="loading-screen" id="loading-screen">
      <div class="loading-mark"><span></span></div>
      <p>Building your tiny world</p>
      <div class="loading-line"><i></i></div>
    </div>

    <section class="start-screen" id="start-screen" aria-labelledby="game-title">
      <div class="start-skyline" aria-hidden="true">
        <span class="start-sun"></span>
        <span class="start-road road-one"></span>
        <span class="start-road road-two"></span>
      </div>
      <div class="start-content">
        <p class="kicker">A tiny driving adventure</p>
        <h1 id="game-title"><span>Tiny</span> Roads</h1>
        <p class="start-copy">
          Seven eight-lane circuits wrap one oversized planet — ports, peaks,
          deserts, neon streets, and island hops. Pick a route, then drift.
        </p>
        <div class="track-picker" role="group" aria-label="Choose circuit">
          ${TRACK_CATALOG.map(
            (track, index) => `
              <button
                type="button"
                class="track-card ${index === 0 ? "is-active" : ""}"
                data-track="${track.id}"
                aria-pressed="${index === 0 ? "true" : "false"}"
              >
                <span>${track.label}</span>
                <b>${track.name}</b>
                <small>${track.tagline}</small>
              </button>
            `,
          ).join("")}
        </div>
        <div class="mode-picker" role="group" aria-label="Choose game mode">
          ${Object.values(MODE_DEFINITIONS)
            .map(
              (mode, index) => `
                <button
                  type="button"
                  class="mode-card ${index === 0 ? "is-active" : ""}"
                  data-mode="${mode.id}"
                  aria-pressed="${index === 0 ? "true" : "false"}"
                >
                  <span>${mode.label}</span>
                  <b>${mode.name}</b>
                  <small>${mode.objective}</small>
                </button>
              `,
            )
            .join("")}
        </div>
        <label class="driver-name">
          <span>Driver name</span>
          <input id="driver-name" maxlength="20" value="Road Runner" autocomplete="nickname" />
        </label>
        <div class="paint-picker" role="group" aria-label="Choose car colour">
          <p>Pick your paint</p>
          <div>
            ${CAR_PALETTE.map(
              (color, index) => `
                <button
                  class="paint-swatch ${index === 0 ? "is-active" : ""}"
                  type="button"
                  data-color="${color.value}"
                  aria-label="${color.name}"
                  aria-pressed="${index === 0 ? "true" : "false"}"
                  style="--swatch:#${color.value.toString(16).padStart(6, "0")}"
                ></button>
              `,
            ).join("")}
          </div>
        </div>
        <button class="drive-button" id="drive-button" type="button">
          <span>Start your engine</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6"/>
          </svg>
        </button>
        <div class="start-meta">
          <span>Procedural planet</span>
          <i></i>
          <span>Original low-poly world</span>
          <i></i>
          <span>Best with sound</span>
        </div>
      </div>
      <p class="start-controls">
        <b>WASD</b> drive <b>Space</b> drift <b>Shift</b> boost <b>E</b> power
      </p>
    </section>

    <div class="game-ui" id="game-ui" aria-hidden="true" inert>
      <header class="game-header">
        <a class="mini-logo" href="#" aria-label="Tiny Roads home">
          <span>TR</span>
          <b>Tiny Roads</b>
        </a>
        <div class="header-status">
          <span class="day-dot"></span>
          <span id="sky-phase">Day drive</span>
          <i></i>
          <span id="surface-status">On route</span>
          <i></i>
          <span id="network-status">Solo</span>
        </div>
        <div class="header-actions">
          <button id="pause-button" type="button" aria-label="Pause game">
            <span>Ⅱ</span>
          </button>
          <button id="mute-button" type="button" aria-label="Mute sound">
            <svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9H5Zm12-1c1.5 1.8 1.5 6.2 0 8"/></svg>
          </button>
          <button id="help-button" type="button" aria-label="Show controls">
            <span>?</span>
          </button>
          <button id="exit-button" type="button" aria-label="Exit to mode selection">
            <span>↙</span>
          </button>
        </div>
      </header>

      <aside class="objective-card">
        <p class="ui-label">Road trip / 01</p>
        <div class="objective-row">
          <span class="bolt-icon">✦</span>
          <div>
            <b>Golden bolts</b>
            <p><span id="bolt-count">0</span> / <span id="bolt-total">18</span> found</p>
          </div>
        </div>
        <div class="objective-progress"><i id="bolt-progress"></i></div>
      </aside>

      <aside class="race-card" id="race-card">
        <p class="ui-label" id="track-label">Temple Speedway / 02</p>
        <div class="race-time" id="race-time">--:--.---</div>
        <div class="race-details">
          <span id="race-status">Find the glowing start gate</span>
          <span id="race-best">Best —</span>
        </div>
      </aside>

      <div class="speed-cluster">
        <div class="speed-ring" id="speed-ring">
          <div>
            <strong id="speed-value">0</strong>
            <span>km/h</span>
          </div>
        </div>
        <div class="boost">
          <span>BOOST</span>
          <div><i id="boost-level"></i></div>
        </div>
        <div class="power-slot" id="power-slot" aria-live="polite">
          <span class="power-slot-label">POWER</span>
          <div class="power-slot-body">
            <b id="power-icon">·</b>
            <div>
              <strong id="power-name">Empty</strong>
              <small id="power-meta">Grab a road capsule</small>
            </div>
          </div>
        </div>
      </div>

      <div class="drift-hud" id="drift-hud">
        <span>DRIFT CHAIN</span>
        <strong><i id="drift-score">0</i> pts</strong>
        <small>STYLE <b id="style-score">0</b></small>
      </div>

      <div class="toast" id="toast" role="status" aria-live="polite">
        <span id="toast-icon">✦</span>
        <div><b id="toast-title">Golden bolt</b><p id="toast-copy">Keep exploring</p></div>
      </div>

      <div class="touch-controls" aria-label="Touch driving controls">
        <div class="touch-steering">
          <button type="button" data-control="left" aria-label="Steer left">‹</button>
          <button type="button" data-control="right" aria-label="Steer right">›</button>
        </div>
        <div class="touch-pedals">
          <button type="button" data-control="usePower" aria-label="Use power">
            <span>POWER</span>
          </button>
          <button type="button" data-control="boost" aria-label="Boost">
            <span>BOOST</span>
          </button>
          <button type="button" data-control="handbrake" aria-label="Drift">
            <span>DRIFT</span>
          </button>
          <button type="button" data-control="brake" aria-label="Brake">▼</button>
          <button type="button" data-control="throttle" aria-label="Accelerate">▲</button>
        </div>
      </div>
    </div>

    <section class="pause-overlay" id="pause-overlay" aria-labelledby="pause-title" hidden>
      <div>
        <p class="kicker">Pit stop</p>
        <h2 id="pause-title">Game paused</h2>
        <p>Your position is safe. Resume when you are ready.</p>
        <button id="resume-button" class="drive-button" type="button">Resume driving</button>
        <button id="pause-exit-button" class="pause-exit-button" type="button">Exit to mode selection</button>
      </div>
    </section>

    <dialog class="help-dialog" id="help-dialog">
      <button class="dialog-close" id="close-help" type="button" aria-label="Close">×</button>
      <p class="kicker">Driver handbook</p>
      <h2>Take the long way.</h2>
      <div class="help-grid">
        <div><kbd>W</kbd><span>Accelerate</span></div>
        <div><kbd>S</kbd><span>Brake / reverse</span></div>
        <div><kbd>A D</kbd><span>Steer</span></div>
        <div><kbd>Space</kbd><span>Handbrake drift</span></div>
        <div><kbd>Shift</kbd><span>Boost</span></div>
        <div><kbd>E</kbd><span>Use power</span></div>
        <div><kbd>R</kbd><span>Return to road</span></div>
      </div>
      <p class="help-note">
        Choose one of seven circuits before you start. Follow the lit asphalt
        for grip, keep clear of roadside districts, and grab glowing capsules
        for arcade powers. Drive through the glowing gate to begin a lap.
      </p>
    </dialog>
  `;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder
    .toFixed(3)
    .padStart(6, "0")}`;
}

export class HUD {
  private readonly ui = document.querySelector<HTMLElement>("#game-ui")!;
  private readonly startScreen =
    document.querySelector<HTMLElement>("#start-screen")!;
  private readonly loadingScreen =
    document.querySelector<HTMLElement>("#loading-screen")!;
  private readonly speedValue =
    document.querySelector<HTMLElement>("#speed-value")!;
  private readonly speedRing =
    document.querySelector<HTMLElement>("#speed-ring")!;
  private readonly boostLevel =
    document.querySelector<HTMLElement>("#boost-level")!;
  private readonly powerSlot =
    document.querySelector<HTMLElement>("#power-slot")!;
  private readonly powerIcon =
    document.querySelector<HTMLElement>("#power-icon")!;
  private readonly powerName =
    document.querySelector<HTMLElement>("#power-name")!;
  private readonly powerMeta =
    document.querySelector<HTMLElement>("#power-meta")!;
  private readonly surfaceStatus =
    document.querySelector<HTMLElement>("#surface-status")!;
  private readonly skyPhase =
    document.querySelector<HTMLElement>("#sky-phase")!;
  private readonly boltCount =
    document.querySelector<HTMLElement>("#bolt-count")!;
  private readonly boltTotal =
    document.querySelector<HTMLElement>("#bolt-total")!;
  private readonly boltProgress =
    document.querySelector<HTMLElement>("#bolt-progress")!;
  private readonly raceTime =
    document.querySelector<HTMLElement>("#race-time")!;
  private readonly raceStatus =
    document.querySelector<HTMLElement>("#race-status")!;
  private readonly raceBest =
    document.querySelector<HTMLElement>("#race-best")!;
  private readonly driftHud =
    document.querySelector<HTMLElement>("#drift-hud")!;
  private readonly driftScore =
    document.querySelector<HTMLElement>("#drift-score")!;
  private readonly styleScore =
    document.querySelector<HTMLElement>("#style-score")!;
  private readonly toast = document.querySelector<HTMLElement>("#toast")!;
  private readonly pauseOverlay =
    document.querySelector<HTMLElement>("#pause-overlay")!;
  private readonly networkStatus =
    document.querySelector<HTMLElement>("#network-status")!;
  private toastTimer: number | null = null;

  constructor(totalCollectibles: number) {
    this.boltTotal.textContent = String(totalCollectibles);
  }

  finishLoading() {
    this.loadingScreen.classList.add("is-done");
  }

  enterGame() {
    this.startScreen.classList.add("is-hidden");
    this.ui.classList.add("is-visible");
    this.ui.setAttribute("aria-hidden", "false");
    this.ui.inert = false;
  }

  exitGame() {
    this.setPaused(false);
    this.startScreen.classList.remove("is-hidden");
    this.ui.classList.remove("is-visible");
    this.ui.setAttribute("aria-hidden", "true");
    this.ui.inert = true;
  }

  setPaused(paused: boolean) {
    this.pauseOverlay.hidden = !paused;
    this.pauseOverlay.classList.toggle("is-visible", paused);
    this.ui.inert = paused;
  }

  setMode(mode: GameMode) {
    const definition = MODE_DEFINITIONS[mode];
    document
      .querySelector<HTMLElement>("#race-card")!
      .classList.toggle("is-mode-hidden", !definition.raceEnabled);
    document.querySelector<HTMLElement>(".objective-card .ui-label")!.textContent =
      mode === "freestyle" ? "Stunt run / 01" : "Road trip / 01";
    this.networkStatus.textContent = definition.multiplayer
      ? "Connecting"
      : mode === "freestyle"
        ? "Freestyle"
        : "Solo";
  }

  setTrack(track: TrackDefinition) {
    const label = document.querySelector<HTMLElement>("#track-label");
    if (label) label.textContent = `${track.name} / 02`;
  }

  setNetworkStatus(status: string) {
    this.networkStatus.textContent = status;
  }

  update(
    telemetry: CarTelemetry,
    race: RaceSnapshot,
    collected: number,
    total: number,
    sky: SkyState,
    driftChain: number,
    totalStyleScore: number,
    power: PowerHudState = { held: null, active: null, activeRemaining: 0 },
  ) {
    this.ui.style.setProperty(
      "--speed-intensity",
      String(Math.max(0, (telemetry.speedRatio - 0.5) * 0.75)),
    );
    this.speedValue.textContent = String(Math.round(telemetry.speedKph));
    this.speedRing.style.setProperty(
      "--speed",
      `${Math.round(telemetry.speedRatio * 270)}deg`,
    );
    this.boostLevel.style.width = `${Math.round(telemetry.boost * 100)}%`;
    if (power.active) {
      this.powerSlot.classList.add("is-active");
      this.powerSlot.classList.remove("is-charged");
      this.powerIcon.textContent = power.active.icon;
      this.powerName.textContent = power.active.name;
      this.powerMeta.textContent = `${power.activeRemaining.toFixed(1)}s left`;
      this.powerSlot.style.setProperty(
        "--power-color",
        `#${power.active.color.toString(16).padStart(6, "0")}`,
      );
    } else if (power.held) {
      this.powerSlot.classList.add("is-charged");
      this.powerSlot.classList.remove("is-active");
      this.powerIcon.textContent = power.held.icon;
      this.powerName.textContent = power.held.name;
      this.powerMeta.textContent = "Press E / POWER";
      this.powerSlot.style.setProperty(
        "--power-color",
        `#${power.held.color.toString(16).padStart(6, "0")}`,
      );
    } else {
      this.powerSlot.classList.remove("is-charged", "is-active");
      this.powerIcon.textContent = "·";
      this.powerName.textContent = "Empty";
      this.powerMeta.textContent = "Grab a road capsule";
      this.powerSlot.style.removeProperty("--power-color");
    }
    const routeNames = {
      coast: "Coast circuit",
      highland: "Highland loop",
      connector: "Sky connector",
    };
    this.surfaceStatus.textContent = telemetry.onRoad
      ? routeNames[telemetry.route]
      : "Off-road";
    this.surfaceStatus.classList.toggle("is-warning", !telemetry.onRoad);
    this.skyPhase.textContent =
      sky.phase === "night"
        ? "Night drive"
        : sky.phase === "sunset"
          ? "Golden hour"
          : "Day drive";
    this.boltCount.textContent = String(collected);
    this.boltProgress.style.width = `${(collected / total) * 100}%`;
    this.raceTime.textContent =
      race.status === "waiting" ? "--:--.---" : formatTime(race.time);
    this.raceStatus.textContent =
      race.status === "waiting"
        ? "Find the glowing start gate"
        : race.status === "finished"
          ? "Lap complete — cross to retry"
          : `Checkpoint ${race.checkpoint} / ${race.total}`;
    this.raceBest.textContent = race.bestTime
      ? `Best ${formatTime(race.bestTime)}`
      : "Best —";
    this.driftScore.textContent = String(Math.round(driftChain));
    this.styleScore.textContent = String(totalStyleScore);
    this.driftHud.classList.toggle("is-active", driftChain >= 8);
  }

  showToast(icon: string, title: string, copy: string) {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    document.querySelector<HTMLElement>("#toast-icon")!.textContent = icon;
    document.querySelector<HTMLElement>("#toast-title")!.textContent = title;
    document.querySelector<HTMLElement>("#toast-copy")!.textContent = copy;
    this.toast.classList.remove("is-visible");
    requestAnimationFrame(() => this.toast.classList.add("is-visible"));
    this.toastTimer = window.setTimeout(
      () => this.toast.classList.remove("is-visible"),
      2900,
    );
  }
}
