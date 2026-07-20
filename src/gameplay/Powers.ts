import * as THREE from "three";
import { PLANET_RADIUS, ROAD_WIDTH } from "../config";
import { angularDistance, orientationFromFrame } from "../math/SphericalMath";
import type { RoadNetwork, RoadSample } from "../world/RoadNetwork";

export type PowerId =
  | "sand-surge"
  | "orbit-rush"
  | "bubble-shell"
  | "sticky-treads"
  | "sky-spring"
  | "tar-trail";

export type PowerDefinition = {
  id: PowerId;
  name: string;
  short: string;
  icon: string;
  color: number;
  duration: number;
  description: string;
};

export const POWER_DEFINITIONS: Record<PowerId, PowerDefinition> = {
  "sand-surge": {
    id: "sand-surge",
    name: "Sand Surge",
    short: "Rocket launch",
    icon: "~",
    color: 0xe8c27a,
    duration: 2.8,
    description: "Beach-buggy rocket: full boost + violent forward punch.",
  },
  "orbit-rush": {
    id: "orbit-rush",
    name: "Orbit Rush",
    short: "Super speed",
    icon: ">>",
    color: 0xff4d6d,
    duration: 3.8,
    description: "Toy-car warp speed with auto-boost for the whole burst.",
  },
  "bubble-shell": {
    id: "bubble-shell",
    name: "Bubble Shell",
    short: "Invincible",
    icon: "O",
    color: 0x6ad7ff,
    duration: 6,
    description: "Hard shell: no barrier scrapes, slicks bounce off you.",
  },
  "sticky-treads": {
    id: "sticky-treads",
    name: "Sticky Treads",
    short: "Rail grip",
    icon: "+",
    color: 0x7dffb2,
    duration: 6.5,
    description: "Magnet tires — corner like you're on rails.",
  },
  "sky-spring": {
    id: "sky-spring",
    name: "Sky Spring",
    short: "Mega jump",
    icon: "^",
    color: 0xc59bff,
    duration: 0.8,
    description: "Launch into a huge arcade leap from anywhere.",
  },
  "tar-trail": {
    id: "tar-trail",
    name: "Tar Trail",
    short: "Oil bomb",
    icon: "=",
    color: 0x2b2430,
    duration: 0.4,
    description: "Drop a wide sticky patch that wrecks momentum.",
  },
};

const POWER_POOL: PowerId[] = Object.keys(POWER_DEFINITIONS) as PowerId[];

export type CarModifiers = {
  speedCapScale: number;
  accelScale: number;
  gripScale: number;
  steerScale: number;
  boostDrainScale: number;
  boostRegenScale: number;
  boostPush: number;
  autoBoost: boolean;
  boundaryRetain: number;
};

export const DEFAULT_CAR_MODIFIERS: CarModifiers = {
  speedCapScale: 1,
  accelScale: 1,
  gripScale: 1,
  steerScale: 1,
  boostDrainScale: 1,
  boostRegenScale: 1,
  boostPush: 0,
  autoBoost: false,
  boundaryRetain: 0.86,
};

export type PowerHudState = {
  held: PowerDefinition | null;
  active: PowerDefinition | null;
  activeRemaining: number;
};

type Capsule = {
  normal: THREE.Vector3;
  group: THREE.Group;
  shell: THREE.Mesh;
  cooldown: number;
  material: THREE.MeshStandardMaterial;
};

type Slick = {
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  life: number;
};

/** Loud, readable aura so powers feel like Mario Kart items. */
export class PowerAura {
  readonly group = new THREE.Group();
  private readonly shell: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly trail: THREE.Mesh;
  private readonly shellMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly trailMat: THREE.MeshBasicMaterial;

  constructor() {
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0x6ad7ff,
      emissive: 0x6ad7ff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0,
      roughness: 0.15,
      metalness: 0.1,
      depthWrite: false,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0xe8c27a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      this.shellMat,
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.035, 8, 24),
      this.ringMat,
    );
    this.ring.rotation.x = Math.PI / 2;
    this.trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.55, 8),
      this.trailMat,
    );
    this.trail.rotation.x = Math.PI;
    this.trail.position.z = -0.35;
    this.group.add(this.shell, this.ring, this.trail);
    this.group.visible = false;
  }

  update(
    delta: number,
    elapsed: number,
    active: PowerDefinition | null,
    carGroup: THREE.Object3D,
  ) {
    this.group.position.copy(carGroup.position);
    this.group.quaternion.copy(carGroup.quaternion);
    if (!active) {
      this.shellMat.opacity = THREE.MathUtils.lerp(this.shellMat.opacity, 0, 0.2);
      this.ringMat.opacity = THREE.MathUtils.lerp(this.ringMat.opacity, 0, 0.2);
      this.trailMat.opacity = THREE.MathUtils.lerp(this.trailMat.opacity, 0, 0.2);
      this.group.visible =
        this.shellMat.opacity > 0.02 ||
        this.ringMat.opacity > 0.02 ||
        this.trailMat.opacity > 0.02;
      return;
    }

    this.group.visible = true;
    const pulse = 0.7 + Math.sin(elapsed * 10) * 0.3;
    this.shellMat.color.setHex(active.color);
    this.shellMat.emissive.setHex(active.color);
    this.ringMat.color.setHex(active.color);
    this.trailMat.color.setHex(active.color);

    const showShell = active.id === "bubble-shell" || active.id === "sticky-treads";
    const showRing = active.id === "orbit-rush" || active.id === "sand-surge";
    const showTrail =
      active.id === "orbit-rush" ||
      active.id === "sand-surge" ||
      active.id === "sky-spring";

    this.shellMat.opacity = THREE.MathUtils.lerp(
      this.shellMat.opacity,
      showShell ? 0.35 * pulse : 0,
      1 - Math.exp(-delta * 10),
    );
    this.ringMat.opacity = THREE.MathUtils.lerp(
      this.ringMat.opacity,
      showRing ? 0.85 * pulse : 0,
      1 - Math.exp(-delta * 10),
    );
    this.trailMat.opacity = THREE.MathUtils.lerp(
      this.trailMat.opacity,
      showTrail ? 0.55 * pulse : 0,
      1 - Math.exp(-delta * 10),
    );
    this.ring.rotation.z += delta * 6;
    this.shell.scale.setScalar(0.95 + pulse * 0.12);
  }

  dispose() {
    this.shell.geometry.dispose();
    this.ring.geometry.dispose();
    this.trail.geometry.dispose();
    this.shellMat.dispose();
    this.ringMat.dispose();
    this.trailMat.dispose();
  }
}

export class PowerSystem {
  readonly group = new THREE.Group();
  readonly aura = new PowerAura();
  private readonly road: RoadNetwork;
  private readonly capsules: Capsule[] = [];
  private readonly slicks: Slick[] = [];
  private held: PowerId | null = null;
  private active: PowerId | null = null;
  private activeRemaining = 0;
  private readonly slickMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1520,
    roughness: 0.92,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
  });

  constructor(road: RoadNetwork) {
    this.road = road;
    this.group.name = "road-power-capsules";
    this.buildCapsules();
  }

  get hud(): PowerHudState {
    return {
      held: this.held ? POWER_DEFINITIONS[this.held] : null,
      active: this.active ? POWER_DEFINITIONS[this.active] : null,
      activeRemaining: this.activeRemaining,
    };
  }

  get modifiers(): CarModifiers {
    const mods = { ...DEFAULT_CAR_MODIFIERS };
    if (!this.active) return mods;
    switch (this.active) {
      case "sand-surge":
        mods.accelScale = 2.4;
        mods.speedCapScale = 1.55;
        mods.boostDrainScale = 0.2;
        mods.boostRegenScale = 3.5;
        mods.boostPush = 0.85;
        mods.autoBoost = true;
        break;
      case "orbit-rush":
        mods.speedCapScale = 2.15;
        mods.accelScale = 2.1;
        mods.steerScale = 0.85;
        mods.boostDrainScale = 0.12;
        mods.boostPush = 1.15;
        mods.autoBoost = true;
        break;
      case "bubble-shell":
        mods.boundaryRetain = 1;
        mods.gripScale = 1.35;
        mods.speedCapScale = 1.08;
        break;
      case "sticky-treads":
        mods.gripScale = 4.2;
        mods.steerScale = 1.45;
        mods.speedCapScale = 1.12;
        mods.accelScale = 1.25;
        break;
      case "sky-spring":
        mods.speedCapScale = 1.2;
        break;
      default:
        break;
    }
    return mods;
  }

  reset() {
    this.held = null;
    this.active = null;
    this.activeRemaining = 0;
    for (const capsule of this.capsules) {
      capsule.cooldown = 0;
      capsule.group.visible = true;
    }
    for (const slick of this.slicks) this.group.remove(slick.mesh);
    this.slicks.length = 0;
  }

  tryPickup(carNormal: THREE.Vector3): {
    picked: PowerDefinition | null;
    blocked: boolean;
  } {
    for (const capsule of this.capsules) {
      if (capsule.cooldown > 0) continue;
      if (angularDistance(carNormal, capsule.normal) * PLANET_RADIUS > 0.45) {
        continue;
      }
      if (this.held) return { picked: null, blocked: true };
      const id = POWER_POOL[Math.floor(Math.random() * POWER_POOL.length)];
      this.held = id;
      capsule.cooldown = 6.5;
      capsule.group.visible = false;
      return { picked: POWER_DEFINITIONS[id], blocked: false };
    }
    return { picked: null, blocked: false };
  }

  tryActivate(context: {
    launch: (force: number) => boolean;
    dropBehind: THREE.Vector3;
    forward: THREE.Vector3;
    normal: THREE.Vector3;
    elevation: number;
    fillBoost: () => void;
    surgeSpeed: () => void;
  }): PowerDefinition | null {
    if (!this.held || this.active) return null;
    const id = this.held;
    const definition = POWER_DEFINITIONS[id];
    this.held = null;

    if (id === "sky-spring") {
      // Always usable — mega jump is the fantasy.
      context.launch(1.85);
      this.active = id;
      this.activeRemaining = definition.duration;
      return definition;
    }

    if (id === "tar-trail") {
      this.spawnSlick(context.dropBehind, context.normal, context.forward, context.elevation);
      this.spawnSlick(
        context.dropBehind
          .clone()
          .addScaledVector(context.forward, -0.03)
          .normalize(),
        context.normal,
        context.forward,
        context.elevation,
      );
      this.active = id;
      this.activeRemaining = definition.duration;
      return definition;
    }

    if (id === "sand-surge" || id === "orbit-rush") {
      context.fillBoost();
      context.surgeSpeed();
    }

    this.active = id;
    this.activeRemaining = definition.duration;
    return definition;
  }

  isOnSlick(carNormal: THREE.Vector3) {
    if (this.active === "bubble-shell") return false;
    return this.slicks.some(
      (slick) =>
        angularDistance(carNormal, slick.normal) * PLANET_RADIUS < 0.55,
    );
  }

  update(
    delta: number,
    elapsed: number,
    carNormal: THREE.Vector3,
    carGroup?: THREE.Object3D,
  ): { slicked: boolean } {
    if (this.active) {
      this.activeRemaining = Math.max(0, this.activeRemaining - delta);
      if (this.activeRemaining === 0) this.active = null;
    }
    if (carGroup) this.aura.update(delta, elapsed, this.hud.active, carGroup);

    for (const capsule of this.capsules) {
      capsule.cooldown = Math.max(0, capsule.cooldown - delta);
      if (capsule.cooldown === 0) capsule.group.visible = true;
      capsule.group.rotation.y += delta * 1.6;
      capsule.shell.position.y = 0.08 + Math.sin(elapsed * 4 + capsule.cooldown) * 0.03;
      capsule.material.emissiveIntensity = 0.55 + Math.sin(elapsed * 6) * 0.25;
    }

    let slicked = false;
    for (let index = this.slicks.length - 1; index >= 0; index -= 1) {
      const slick = this.slicks[index]!;
      slick.life -= delta;
      const material = slick.mesh.material as THREE.MeshStandardMaterial;
      material.opacity = Math.min(0.9, slick.life / 2);
      if (
        angularDistance(carNormal, slick.normal) * PLANET_RADIUS < 0.55 &&
        this.active !== "bubble-shell"
      ) {
        slicked = true;
      }
      if (slick.life <= 0) {
        this.group.remove(slick.mesh);
        slick.mesh.geometry.dispose();
        material.dispose();
        this.slicks.splice(index, 1);
      }
    }
    return { slicked };
  }

  private spawnSlick(
    behind: THREE.Vector3,
    normal: THREE.Vector3,
    forward: THREE.Vector3,
    elevation: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 20),
      this.slickMaterial.clone(),
    );
    mesh.quaternion.copy(orientationFromFrame(normal, forward));
    mesh.position
      .copy(behind)
      .normalize()
      .multiplyScalar(PLANET_RADIUS + 0.07 + elevation);
    mesh.rotateX(-Math.PI / 2);
    this.group.add(mesh);
    this.slicks.push({
      normal: behind.clone().normalize(),
      mesh,
      life: 10,
    });
  }

  private buildCapsules() {
    const progresses = [0.05, 0.18, 0.28, 0.36, 0.47, 0.55, 0.64, 0.75, 0.86, 0.94];
    for (const progress of progresses) {
      const index = Math.round(progress * (this.road.samples.length - 1));
      const sample = this.road.samples[index]!;
      const material = new THREE.MeshStandardMaterial({
        color: 0xfff2b0,
        emissive: 0xffb347,
        emissiveIntensity: 0.7,
        roughness: 0.35,
        metalness: 0.35,
        transparent: true,
        opacity: 0.92,
      });
      const group = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.09, 0.1, 4, 10),
        material,
      );
      shell.position.y = 0.08;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.012, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(shell, ring);
      this.placeAt(group, sample, 0.16);
      this.group.add(group);
      this.capsules.push({
        normal: sample.normal.clone(),
        group,
        shell,
        cooldown: 0,
        material,
      });
    }
  }

  private placeAt(object: THREE.Object3D, sample: RoadSample, height: number) {
    object.position.copy(sample.position).addScaledVector(sample.normal, height);
    object.quaternion.copy(
      orientationFromFrame(sample.normal, sample.tangent),
    );
    const right = new THREE.Vector3()
      .crossVectors(sample.normal, sample.tangent)
      .normalize();
    object.position.addScaledVector(right, ROAD_WIDTH * 0.12);
  }

  dispose() {
    this.reset();
    this.aura.dispose();
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.slickMaterial.dispose();
  }
}
