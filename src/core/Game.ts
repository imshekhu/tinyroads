import * as THREE from "three";
import { AudioEngine } from "../audio/AudioEngine";
import { ChaseCamera } from "../camera/ChaseCamera";
import { CAR_PALETTE, OCEAN_LEVEL } from "../config";
import { Collectibles } from "../gameplay/Collectibles";
import { Race, type RaceSnapshot } from "../gameplay/Race";
import { Traffic } from "../gameplay/Traffic";
import { Controls } from "../input/Controls";
import { HUD } from "../ui/HUD";
import { Car } from "../vehicle/Car";
import { Atmosphere } from "../world/Atmosphere";
import { Planet } from "../world/Planet";
import { TrackFeatures } from "../world/TrackFeatures";

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 120);
  private readonly clock = new THREE.Clock();
  private readonly planet: Planet;
  private readonly atmosphere: Atmosphere;
  private readonly car: Car;
  private readonly controls: Controls;
  private readonly chaseCamera: ChaseCamera;
  private readonly collectibles: Collectibles;
  private readonly race: Race;
  private readonly traffic: Traffic;
  private readonly trackFeatures: TrackFeatures;
  private readonly audio = new AudioEngine();
  private readonly hud: HUD;
  private readonly cleanups: Array<() => void> = [];

  private running = true;
  private started = false;
  private elapsed =
    new URLSearchParams(window.location.search).get("sky") === "night"
      ? 122
      : 27;
  private selectedColor = CAR_PALETTE[0].value;
  private waterResetCooldown = 0;
  private driftChain = 0;
  private driftGrace = 0;
  private totalStyleScore = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    const constrainedDevice =
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
    this.traffic = new Traffic(this.planet.road);
    this.car = new Car(this.planet, this.selectedColor);
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
      this.traffic.group,
      this.car.mesh.group,
      this.car.smoke.group,
      this.collectibles.group,
      this.race.group,
    );
    this.camera.position.set(10, 6.5, 9);
    this.camera.lookAt(0, 0, 0);
    this.bindInterface();
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
      this.chaseCamera.snap();
      this.hud.enterGame();
      this.hud.showToast("◆", "Welcome to the loop", "Find the glowing start gate");
    };
    driveButton.addEventListener("click", start);
    this.cleanups.push(() => driveButton.removeEventListener("click", start));

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

    const onKeyDown = (event: KeyboardEvent) => {
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
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("resize", this.resize),
      () =>
        document.removeEventListener(
          "visibilitychange",
          this.onVisibilityChange,
        ),
    );
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
    const orbit = this.elapsed * 0.055;
    const radius = 12.4;
    this.camera.position.set(
      Math.cos(orbit) * radius,
      5.1 + Math.sin(orbit * 0.6) * 1.1,
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
    this.elapsed += delta;
    const sky = this.atmosphere.update(this.elapsed);
    this.planet.update(this.elapsed);
    this.traffic.update(delta, this.elapsed);

    if (!this.started) {
      this.updatePreview(delta);
    } else {
      const input = this.controls.getInput();
      const telemetry = this.car.update(delta, input);
      this.updateDriftScore(delta, telemetry);
      if (
        this.trackFeatures.update(
          delta,
          this.elapsed,
          this.car.normal,
        )
      ) {
        this.car.applyTrackBoost();
        this.audio.checkpoint();
        this.chaseCamera.addShake(0.28);
        this.hud.showToast("»", "Track boost", "Hold the racing line");
      }
      this.chaseCamera.update(delta, telemetry);
      this.collectibles.update(this.elapsed, this.car.normal);
      const race = this.race.update(delta, this.elapsed, this.car.normal);
      this.hud.update(
        telemetry,
        race,
        this.collectibles.collected,
        this.collectibles.total,
        sky,
        this.driftChain,
        this.totalStyleScore,
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
    this.audio.dispose();
    this.car.dispose();
    this.collectibles.dispose();
    this.race.dispose();
    this.traffic.dispose();
    this.trackFeatures.dispose();
    this.planet.dispose();
    this.atmosphere.dispose();
    this.renderer.dispose();
  }
}
