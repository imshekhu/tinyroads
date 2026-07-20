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
    short: "Beach push",
    icon: "~",
    color: 0xe8c27a,
    duration: 1.8,
    description: "Beach-buggy burst that tops up boost and digs forward.",
  },
  "orbit-rush": {
    id: "orbit-rush",
    name: "Orbit Rush",
    short: "Toy speed",
    icon: ">>",
    color: 0xff4d6d,
    duration: 2.6,
    description: "Hot-wheels pace with a raised speed ceiling.",
  },
  "bubble-shell": {
    id: "bubble-shell",
    name: "Bubble Shell",
    short: "Guard",
    icon: "O",
    color: 0x6ad7ff,
    duration: 4.2,
    description: "Glassy shell that shrugs off barrier scrapes.",
  },
  "sticky-treads": {
    id: "sticky-treads",
    name: "Sticky Treads",
    short: "Grip",
    icon: "+",
    color: 0x7dffb2,
    duration: 5,
    description: "Glue-like rubber for confident corner exits.",
  },
  "sky-spring": {
    id: "sky-spring",
    name: "Sky Spring",
    short: "Jump",
    icon: "^",
    color: 0xc59bff,
    duration: 0.05,
    description: "Kick the chassis into a tall arcade leap.",
  },
  "tar-trail": {
    id: "tar-trail",
    name: "Tar Trail",
    short: "Slick",
    icon: "=",
    color: 0x2b2430,
    duration: 0.05,
    description: "Drop a sticky patch that slows whoever crosses it.",
  },
};

const POWER_POOL: PowerId[] = Object.keys(POWER_DEFINITIONS) as PowerId[];

export type CarModifiers = {
  speedCapScale: number;
  accelScale: number;
  gripScale: number;
  steerScale: number;
  boostDrainScale: number;
  boundaryRetain: number;
};

export const DEFAULT_CAR_MODIFIERS: CarModifiers = {
  speedCapScale: 1,
  accelScale: 1,
  gripScale: 1,
  steerScale: 1,
  boostDrainScale: 1,
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

export class PowerSystem {
  readonly group = new THREE.Group();
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
        mods.accelScale = 1.55;
        mods.speedCapScale = 1.18;
        mods.boostDrainScale = 0.55;
        break;
      case "orbit-rush":
        mods.speedCapScale = 1.55;
        mods.accelScale = 1.4;
        mods.steerScale = 0.92;
        mods.boostDrainScale = 0.35;
        break;
      case "bubble-shell":
        mods.boundaryRetain = 1;
        mods.gripScale = 1.15;
        break;
      case "sticky-treads":
        mods.gripScale = 2.35;
        mods.steerScale = 1.18;
        mods.speedCapScale = 0.96;
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
      if (angularDistance(carNormal, capsule.normal) * PLANET_RADIUS > 0.4) {
        continue;
      }
      if (this.held) return { picked: null, blocked: true };
      const id = POWER_POOL[Math.floor(Math.random() * POWER_POOL.length)];
      this.held = id;
      capsule.cooldown = 8.5;
      capsule.group.visible = false;
      return { picked: POWER_DEFINITIONS[id], blocked: false };
    }
    return { picked: null, blocked: false };
  }

  tryActivate(context: {
    canLaunch: boolean;
    launch: (force: number) => boolean;
    dropBehind: THREE.Vector3;
    forward: THREE.Vector3;
    normal: THREE.Vector3;
    fillBoost: () => void;
    surgeSpeed: () => void;
  }): PowerDefinition | null {
    if (!this.held || this.active) return null;
    const id = this.held;
    const definition = POWER_DEFINITIONS[id];
    this.held = null;

    if (id === "sky-spring") {
      if (!context.canLaunch || !context.launch(1.28)) {
        this.held = id;
        return null;
      }
      this.active = id;
      this.activeRemaining = definition.duration;
      return definition;
    }

    if (id === "tar-trail") {
      this.spawnSlick(context.dropBehind, context.normal, context.forward);
      this.active = id;
      this.activeRemaining = definition.duration;
      return definition;
    }

    if (id === "sand-surge") {
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
        angularDistance(carNormal, slick.normal) * PLANET_RADIUS < 0.42,
    );
  }

  update(
    delta: number,
    elapsed: number,
    carNormal: THREE.Vector3,
  ): { slicked: boolean } {
    if (this.active) {
      this.activeRemaining = Math.max(0, this.activeRemaining - delta);
      if (this.activeRemaining === 0) this.active = null;
    }

    for (const capsule of this.capsules) {
      capsule.cooldown = Math.max(0, capsule.cooldown - delta);
      if (capsule.cooldown === 0) capsule.group.visible = true;
      capsule.group.rotation.y += delta * 1.6;
      capsule.shell.position.y = 0.08 + Math.sin(elapsed * 4 + capsule.cooldown) * 0.03;
      capsule.material.emissiveIntensity = 0.55 + Math.sin(elapsed * 6) * 0.25;
    }

    let slicked = false;
    for (let index = this.slicks.length - 1; index >= 0; index -= 1) {
      const slick = this.slicks[index];
      slick.life -= delta;
      const material = slick.mesh.material as THREE.MeshStandardMaterial;
      material.opacity = Math.min(0.85, slick.life / 2);
      if (
        angularDistance(carNormal, slick.normal) * PLANET_RADIUS < 0.42 &&
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
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 18),
      this.slickMaterial.clone(),
    );
    mesh.quaternion.copy(orientationFromFrame(normal, forward));
    mesh.position
      .copy(behind)
      .normalize()
      .multiplyScalar(PLANET_RADIUS + 0.07);
    mesh.rotateX(-Math.PI / 2);
    this.group.add(mesh);
    this.slicks.push({
      normal: behind.clone().normalize(),
      mesh,
      life: 7.5,
    });
  }

  private buildCapsules() {
    const indices = [95, 240, 400, 560, 720, 880, 1040, 1240, 1360];
    for (const index of indices) {
      const sample = this.road.samples[index];
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
    // Sit slightly inside a lane so capsules read as on-track pickups.
    object.position.addScaledVector(right, ROAD_WIDTH * 0.12);
  }

  dispose() {
    this.reset();
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
