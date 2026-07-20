import * as THREE from "three";
import { AudioEngine } from "../audio/AudioEngine";
import { ChaseCamera } from "../camera/ChaseCamera";
import { CAR_PALETTE, OCEAN_LEVEL } from "../config";
import { Collectibles } from "../gameplay/Collectibles";
import { PowerSystem } from "../gameplay/Powers";
import { Race, type RaceSnapshot } from "../gameplay/Race";
import { Controls } from "../input/Controls";
import {
  ModeManager,
  type GameMode,
} from "../modes/GameMode";
import type { MultiplayerClient } from "../network/MultiplayerClient";
import { RemoteCars } from "../network/RemoteCars";
import { HUD } from "../ui/HUD";
import { Car } from "../vehicle/Car";
import { Atmosphere } from "../world/Atmosphere";
import { Planet } from "../world/Planet";
import { TrackFeatures } from "../world/TrackFeatures";

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 420);
  private readonly clock = new THREE.Clock();
  private readonly planet: Planet;
  private readonly atmosphere: Atmosphere;
  private readonly car: Car;
  private readonly controls: Controls;
  private readonly chaseCamera: ChaseCamera;
  private collectibles: Collectibles;
  private race: Race;
  private trackFeatures: TrackFeatures;
  private powers: PowerSystem;
  private readonly modeManager = new ModeManager();
  private readonly remoteCars: RemoteCars;
  private multiplayer: MultiplayerClient | null = null;
  private readonly audio = new AudioEngine();
  private readonly hud: HUD;
  private readonly cleanups: Array<() => void> = [];

  private running = true;
  private started = false;
  private paused = false;
  private elapsed =
    new URLSearchParams(window.location.search).get("sky") === "night"
      ? 122
      : 27;
  private selectedColor = CAR_PALETTE[0].value;
  private waterResetCooldown = 0;
  private driftChain = 0;
  private driftGrace = 0;
  private totalStyleScore = 0;
  private airChain = 0;
  private wasAirborne = false;
  private powerBlockedToastCooldown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    const constrainedDevice =
      navigator.webdriver ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 760;
    this.renderer.shadowMap.enabled = !constrainedDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.planet = new Planet();
    this.atmosphere = new Atmosphere(this.scene);
    this.trackFeatures = new TrackFeatures(this.planet.road);
    this.powers = new PowerSystem(this.planet.road);
    this.car = new Car(this.planet, this.selectedColor);
    this.remoteCars = new RemoteCars(this.planet);
    this.race = new Race(this.planet, (type, snapshot) =>
      this.onRaceEvent(type, snapshot),
    );
    this.collectibles = new Collectibles(
      this.planet,
      (_position, count) => this.onCollect(count),
    );
    this.hud = new HUD(this.collectibles.total);
    this.controls = new Controls();
    this.chaseCamera = new ChaseCamera(this.camera, this.car);

    this.scene.add(
      this.planet.group,
      this.atmosphere.group,
      this.trackFeatures.group,
      this.powers.group,
      this.powers.aura.group,
      this.remoteCars.group,
      this.car.mesh.group,
      this.car.smoke.group,
      this.car.skids.group,
      this.collectibles.group,
      this.race.group,
    );
    this.camera.position.set(10, 6.5, 9);
    this.camera.lookAt(0, 0, 0);
    this.bindInterface();
    this.applyMode("exploration");
    this.hud.setTrack(this.planet.activeTrack);
    this.resize();
    requestAnimationFrame(() => {
      this.hud.finishLoading();
      this.tick();
    });
  }

  private bindInterface() {
    const driveButton = document.querySelector<HTMLButtonElement>("#drive-button")!;
    const start = () => {
      if (this.started) return;
      this.started = true;
      this.audio.start();
      this.audio.setPaused(false);
      this.controls.setEnabled(true);
      this.chaseCamera.snap();
      this.hud.enterGame();
      this.renderer.domElement.tabIndex = -1;
      this.renderer.domElement.focus({ preventScroll: true });
      const mode = this.modeManager.current;
      this.hud.showToast("◆", mode.name, mode.objective);
      if (mode.multiplayer) void this.connectMultiplayer();
    };
    driveButton.addEventListener("click", start);
    this.cleanups.push(() => driveButton.removeEventListener("click", start));

    document.querySelectorAll<HTMLButtonElement>(".mode-card").forEach((button) => {
      const select = () => {
        const mode = button.dataset.mode as GameMode;
        this.applyMode(mode);
        document.querySelectorAll(".mode-card").forEach((card) => {
          const active = card === button;
          card.classList.toggle("is-active", active);
          card.setAttribute("aria-pressed", String(active));
        });
      };
      button.addEventListener("click", select);
      this.cleanups.push(() => button.removeEventListener("click", select));
    });

    document.querySelectorAll<HTMLButtonElement>(".paint-swatch").forEach((button) => {
      const choose = () => {
        this.selectedColor = Number(button.dataset.color);
        this.car.setColor(this.selectedColor);
        document.querySelectorAll(".paint-swatch").forEach((swatch) => {
          const active = swatch === button;
          swatch.classList.toggle("is-active", active);
          swatch.setAttribute("aria-pressed", String(active));
        });
      };
      button.addEventListener("click", choose);
      this.cleanups.push(() => button.removeEventListener("click", choose));
    });

    const help = document.querySelector<HTMLDialogElement>("#help-dialog")!;
    const helpButton = document.querySelector<HTMLButtonElement>("#help-button")!;
    const closeHelp = document.querySelector<HTMLButtonElement>("#close-help")!;
    const showHelp = () => help.showModal();
    const hideHelp = () => help.close();
    helpButton.addEventListener("click", showHelp);
    closeHelp.addEventListener("click", hideHelp);
    help.addEventListener("click", (event) => {
      if (event.target === help) hideHelp();
    });

    const muteButton =
      document.querySelector<HTMLButtonElement>("#mute-button")!;
    const toggleMute = () => {
      const muted = this.audio.toggleMute();
      muteButton.classList.toggle("is-muted", muted);
      muteButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    };
    muteButton.addEventListener("click", toggleMute);

    const pauseButton =
      document.querySelector<HTMLButtonElement>("#pause-button")!;
    const resumeButton =
      document.querySelector<HTMLButtonElement>("#resume-button")!;
    const exitButton =
      document.querySelector<HTMLButtonElement>("#exit-button")!;
    const pauseExitButton =
      document.querySelector<HTMLButtonElement>("#pause-exit-button")!;
    const homeLink = document.querySelector<HTMLAnchorElement>(".mini-logo")!;
    const togglePause = () => this.setPaused(!this.paused);
    const exitToMenu = () => this.exitToMenu();
    const home = (event: Event) => {
      event.preventDefault();
      exitToMenu();
    };
    pauseButton.addEventListener("click", togglePause);
    resumeButton.addEventListener("click", togglePause);
    exitButton.addEventListener("click", exitToMenu);
    pauseExitButton.addEventListener("click", exitToMenu);
    homeLink.addEventListener("click", home);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && this.started) {
        event.preventDefault();
        togglePause();
        return;
      }
      if (event.code === "KeyR" && this.started) {
        this.car.reset(this.planet.road.getRoadInfo(this.car.normal).index);
        this.chaseCamera.snap();
        this.hud.showToast("↻", "Back on route", "Fresh tires, fresh start");
      }
      if (event.code === "KeyM" && this.started) toggleMute();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.cleanups.push(
      () => helpButton.removeEventListener("click", showHelp),
      () => closeHelp.removeEventListener("click", hideHelp),
      () => muteButton.removeEventListener("click", toggleMute),
      () => pauseButton.removeEventListener("click", togglePause),
      () => resumeButton.removeEventListener("click", togglePause),
      () => exitButton.removeEventListener("click", exitToMenu),
      () => pauseExitButton.removeEventListener("click", exitToMenu),
      () => homeLink.removeEventListener("click", home),
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("resize", this.resize),
      () =>
        document.removeEventListener(
          "visibilitychange",
          this.onVisibilityChange,
        ),
    );
  }

  private setPaused(paused: boolean) {
    if (!this.started) return;
    this.paused = paused;
    this.controls.setEnabled(!paused);
    this.audio.setPaused(paused);
    this.hud.setPaused(paused);
    if (!paused) {
      this.renderer.domElement.focus({ preventScroll: true });
    }
  }

  private exitToMenu() {
    if (!this.started) return;
    this.paused = false;
    this.started = false;
    this.controls.setEnabled(false);
    this.audio.setPaused(true);
    this.multiplayer?.disconnect();
    this.remoteCars.dispose();
    this.car.reset();
    this.race.reset();
    this.powers.reset();
    this.driftChain = 0;
    this.airChain = 0;
    this.driftGrace = 0;
    this.wasAirborne = false;
    this.hud.exitGame();
  }

  private applyMode(mode: GameMode) {
    const definition = this.modeManager.select(mode);
    this.hud.setMode(mode);
    this.race.group.visible = definition.raceEnabled;
    this.remoteCars.group.visible = definition.multiplayer;
  }

  private bindMultiplayer(client: MultiplayerClient) {
    client.onStateChange = (state) => {
      this.hud.setNetworkStatus(
        state === "connected"
          ? "Online"
          : state === "connecting"
            ? "Connecting"
            : state === "error"
              ? "Solo fallback"
              : "Solo",
      );
    };
    client.onNotice = (message) => {
      this.hud.showToast("⚑", message, "Race server synchronized");
    };
    client.onPowerEvent = (event) => {
      this.powers.receiveRemotePowerEvent({
        powerId: event.powerId,
        position: {
          x: event.position[0],
          y: event.position[1],
          z: event.position[2],
        },
        forward: {
          x: event.forward[0],
          y: event.forward[1],
          z: event.forward[2],
        },
        elevation: event.elevation,
      });
    };
    client.onSnapshot = (snapshot) => {
      this.remoteCars.applySnapshot(
        snapshot.players,
        client.localPlayerId,
      );
      const local = snapshot.players.find(
        (player) => player.id === client.localPlayerId,
      );
      if (local) {
        this.car.reconcile(local.normal, local.forward, local.speed);
      }
      if (snapshot.phase === "countdown" && snapshot.countdownEndsAt) {
        const seconds = Math.max(
          0,
          Math.ceil((snapshot.countdownEndsAt - Date.now()) / 1000),
        );
        this.hud.setNetworkStatus(`Start ${seconds}`);
      } else if (snapshot.phase === "racing") {
        this.hud.setNetworkStatus(
          `${snapshot.players.length} ${snapshot.players.length === 1 ? "racer" : "racers"}`,
        );
      } else if (snapshot.phase === "results") {
        this.hud.setNetworkStatus("Results");
      }
    };
  }

  private async connectMultiplayer() {
    if (!this.multiplayer) {
      const { MultiplayerClient } = await import(
        "../network/MultiplayerClient"
      );
      this.multiplayer = new MultiplayerClient();
      this.bindMultiplayer(this.multiplayer);
    }
    const input = document.querySelector<HTMLInputElement>("#driver-name");
    const name = input?.value.trim() || "Road Runner";
    const result = await this.multiplayer.connect(name, this.selectedColor);
    if (!result.ok) {
      this.hud.showToast(
        "!",
        "Practice room",
        "Race server unavailable — driving locally",
      );
    }
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.clock.stop();
    else this.clock.start();
  };

  private readonly resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, width < 720 ? 1.25 : 1.75),
    );
  };

  private onCollect(count: number) {
    this.audio.collect();
    this.chaseCamera.addShake(0.12);
    const complete = count === this.collectibles.total;
    this.hud.showToast(
      "✦",
      complete ? "Every bolt found!" : "Golden bolt",
      complete ? "The whole planet is shining" : `${count} of ${this.collectibles.total} collected`,
    );
  }

  private onRaceEvent(
    type: "start" | "checkpoint" | "finish",
    snapshot: RaceSnapshot,
  ) {
    if (type === "start") {
      this.audio.raceStart();
      this.hud.showToast("⚑", "Lap started", "Hit every glowing gate");
      return;
    }
    if (type === "checkpoint") {
      this.audio.checkpoint();
      this.hud.showToast(
        "◆",
        `Checkpoint ${snapshot.checkpoint}`,
        `${snapshot.total - snapshot.checkpoint} to go`,
      );
      return;
    }
    this.audio.raceFinish();
    this.chaseCamera.addShake(0.35);
    this.hud.showToast(
      "★",
      "Lap complete",
      snapshot.bestTime === snapshot.time
        ? "New personal best!"
        : "Cross the start gate to try again",
    );
  }

  private updatePreview(delta: number) {
    const orbit = this.elapsed * 0.045;
    const radius = 96;
    this.camera.position.set(
      Math.cos(orbit) * radius,
      34 + Math.sin(orbit * 0.6) * 6,
      Math.sin(orbit) * radius,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.car.mesh.update(0, 0, delta, 0);
  }

  private updateDriftScore(
    delta: number,
    telemetry: ReturnType<Car["update"]>,
  ) {
    if (telemetry.airborne) {
      this.airChain += delta * 240 * (0.6 + telemetry.speedRatio);
      this.wasAirborne = true;
    } else if (this.wasAirborne) {
      const airPoints = Math.round(this.airChain);
      if (airPoints >= 20) {
        this.totalStyleScore += airPoints;
        if (this.modeManager.current.multiplayer) {
          this.multiplayer?.sendScore({ kind: "air", points: airPoints });
        }
        this.hud.showToast("↑", `${airPoints} air points`, "Clean landing");
      }
      this.airChain = 0;
      this.wasAirborne = false;
    }
    const active =
      Math.abs(telemetry.drift) > 0.055 && telemetry.speedRatio > 0.32;
    if (active) {
      this.driftGrace = 0.65;
      this.driftChain +=
        Math.abs(telemetry.drift) * telemetry.speedRatio * delta * 1450;
      return;
    }
    if (this.driftGrace > 0) {
      this.driftGrace -= delta;
      return;
    }
    if (this.driftChain >= 20) {
      const banked = Math.round(this.driftChain);
      this.totalStyleScore += banked;
      if (this.modeManager.current.multiplayer) {
        this.multiplayer?.sendScore({ kind: "drift", points: banked });
      }
      this.hud.showToast("〰", `${banked} drift points`, "Style score banked");
    }
    this.driftChain = 0;
  }

  private tick = () => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    // Preserve arcade pace on lower-end devices while bounding unstable steps.
    const delta = Math.min(this.clock.getDelta(), 0.1);
    if (delta <= 0) return;
    if (this.started && this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.elapsed += delta;
    const sky = this.atmosphere.update(this.elapsed);
    this.planet.update(this.elapsed, sky.daylight);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      1.38,
      1.08,
      sky.daylight,
    );
    this.remoteCars.update(delta);

    if (!this.started) {
      this.updatePreview(delta);
    } else {
      const input = this.controls.getInput();
      const mods = { ...this.powers.modifiers };
      if (this.powers.isOnSlick(this.car.normal)) {
        mods.steerScale *= 0.72;
        mods.gripScale *= 0.55;
        mods.accelScale *= 0.7;
        mods.speedCapScale *= 0.78;
      }
      this.car.modifiers = mods;
      const telemetry = this.car.update(delta, input);
      if (this.modeManager.current.multiplayer) {
        this.multiplayer?.sendInput(input);
      }
      this.updateDriftScore(delta, telemetry);
      const trigger = this.trackFeatures.update(
        delta,
        this.elapsed,
        this.car.normal,
      );
      if (trigger.boost) {
        this.car.applyTrackBoost();
        this.audio.checkpoint();
        this.chaseCamera.addShake(0.28);
        this.hud.showToast("»", "Track boost", "Hold the racing line");
      }
      if (
        trigger.ramp &&
        this.modeManager.current.stuntEnabled &&
        this.car.launch(this.modeManager.current.id === "freestyle" ? 1.05 : 0.82)
      ) {
        this.audio.raceStart();
        this.chaseCamera.addShake(0.2);
        this.hud.showToast("↑", "Air time", "Stay composed for the landing");
      }

      this.powerBlockedToastCooldown = Math.max(
        0,
        this.powerBlockedToastCooldown - delta,
      );
      const pickup = this.powers.tryPickup(this.car.normal);
      if (pickup.picked) {
        this.audio.powerPickup();
        this.chaseCamera.addShake(0.12);
        this.hud.showToast(
          pickup.picked.icon,
          pickup.picked.name,
          pickup.picked.description,
        );
      } else if (pickup.blocked && this.powerBlockedToastCooldown === 0) {
        this.powerBlockedToastCooldown = 1.6;
        this.hud.showToast("▣", "Already charged", "Press E to fire your power");
      }

      if (this.controls.consumeUsePower()) {
        const dropBehind = this.car.normal
          .clone()
          .addScaledVector(this.car.forward, -0.045)
          .normalize();
        const used = this.powers.tryActivate({
          launch: (force) => this.car.launch(force, true),
          dropBehind,
          forward: this.car.forward,
          normal: this.car.normal,
          elevation: this.car.roadElevation,
          fillBoost: () => this.car.fillBoost(1),
          surgeSpeed: () => this.car.surgeSpeed(1.45),
        });
        if (used) {
          this.audio.powerUse();
          this.chaseCamera.addShake(
            used.id === "speed-boost" || used.id === "cruise-missile" ? 0.55 : 0.35,
          );
          this.hud.showToast(used.icon, used.name, used.description);
          if (
            this.modeManager.current.multiplayer &&
            (used.id === "lane-trap" ||
              used.id === "cruise-missile" ||
              used.id === "smoke-screen" ||
              used.id === "emp-blast")
          ) {
            const eventPosition =
              used.id === "lane-trap" || used.id === "smoke-screen"
                ? dropBehind
                : this.car.normal;
            this.multiplayer?.sendPowerUse({
              powerId: used.id,
              position: [eventPosition.x, eventPosition.y, eventPosition.z],
              forward: [this.car.forward.x, this.car.forward.y, this.car.forward.z],
              elevation: this.car.roadElevation,
            });
          }
        }
      }

      const powerTick = this.powers.update(
        delta,
        this.elapsed,
        this.car.normal,
        this.car.mesh.group,
      );
      if (powerTick.slicked) {
        this.car.speed *= Math.exp(-delta * 4.2);
        this.car.boost = Math.max(0, this.car.boost - delta * 0.45);
      }
      if (powerTick.smoke) {
        this.car.speed *= Math.exp(-delta * 1.15);
        this.car.boost = Math.max(0, this.car.boost - delta * 0.18);
      }
      if (powerTick.missile) {
        this.car.speed *= 0.42;
        this.car.boost = 0;
        this.chaseCamera.addShake(0.8);
        this.hud.showToast("✹", "Missile hit", "Speed and boost knocked out");
      }

      this.chaseCamera.update(delta, telemetry);
      this.collectibles.update(this.elapsed, this.car.normal);
      const race = this.modeManager.current.raceEnabled
        ? this.race.update(delta, this.elapsed, this.car.normal)
        : this.race.snapshot();
      this.hud.update(
        telemetry,
        race,
        this.collectibles.collected,
        this.collectibles.total,
        sky,
        this.driftChain + this.airChain,
        this.totalStyleScore,
        this.powers.hud,
      );
      this.audio.update(
        telemetry.speedRatio,
        input.throttle,
        !telemetry.onRoad,
      );

      this.waterResetCooldown -= delta;
      if (
        this.waterResetCooldown <= 0 &&
        this.planet.terrainHeight(this.car.normal) < OCEAN_LEVEL - 0.018
      ) {
        const roadIndex = this.planet.road.getRoadInfo(this.car.normal).index;
        this.car.reset(roadIndex);
        this.chaseCamera.snap();
        this.chaseCamera.addShake(0.2);
        this.waterResetCooldown = 2;
        this.hud.showToast("↟", "Wrong turn", "The tiny tow crew put you back");
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    for (const cleanup of this.cleanups) cleanup();
    this.controls.dispose();
    this.multiplayer?.disconnect();
    this.audio.dispose();
    this.car.dispose();
    this.collectibles.dispose();
    this.race.dispose();
    this.trackFeatures.dispose();
    this.powers.dispose();
    this.remoteCars.dispose();
    this.planet.dispose();
    this.atmosphere.dispose();
    this.renderer.dispose();
  }
}
