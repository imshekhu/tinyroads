import * as THREE from "three";
import { PLANET_RADIUS, ROAD_WIDTH } from "../config";
import { angularDistance, orientationFromFrame } from "../math/SphericalMath";
import type { RoadNetwork, RoadSample } from "../world/RoadNetwork";

export type PowerId =
  | "speed-boost"
  | "high-jump"
  | "lane-trap"
  | "cruise-missile"
  | "shield"
  | "smoke-screen"
  | "emp-blast";

export type OffensivePowerId =
  | "lane-trap"
  | "cruise-missile"
  | "smoke-screen"
  | "emp-blast";

export type PowerDefinition = {
  id: PowerId;
  name: string;
  short: string;
  icon: string;
  color: number;
  duration: number;
  description: string;
};

export type ActivatedPower = PowerDefinition;

export const POWER_DEFINITIONS: Record<PowerId, PowerDefinition> = {
  "speed-boost": {
    id: "speed-boost",
    name: "Speed Boost",
    short: "Maximum velocity",
    icon: "»",
    color: 0xff9d35,
    duration: 4,
    description: "A bright nitro burst with free boost and a higher top speed.",
  },
  "high-jump": {
    id: "high-jump",
    name: "High Jump",
    short: "Leap clear",
    icon: "↑",
    color: 0xc99cff,
    duration: 0.8,
    description: "Spring high over traffic and track hazards.",
  },
  "lane-trap": {
    id: "lane-trap",
    name: "Lane Trap",
    short: "Drop road spikes",
    icon: "⌁",
    color: 0xff4f5e,
    duration: 0.35,
    description: "Leave a glowing spike strip across the lane behind you.",
  },
  "cruise-missile": {
    id: "cruise-missile",
    name: "Cruise Missile",
    short: "Fire forward",
    icon: "➤",
    color: 0xffd24a,
    duration: 0.35,
    description: "Launch a fast road-hugging missile straight ahead.",
  },
  shield: {
    id: "shield",
    name: "Shield",
    short: "Block attacks",
    icon: "◉",
    color: 0x55d9ff,
    duration: 6,
    description: "Block every offensive power effect for six seconds.",
  },
  "smoke-screen": {
    id: "smoke-screen",
    name: "Smoke Screen",
    short: "Cloud the lane",
    icon: "☁",
    color: 0xadb4c7,
    duration: 0.35,
    description: "Drop a dense rolling cloud that obscures and slows pursuers.",
  },
  "emp-blast": {
    id: "emp-blast",
    name: "EMP Blast",
    short: "Lock steering",
    icon: "ϟ",
    color: 0x56f5ff,
    duration: 0.45,
    description: "Fire a forward pulse that locks steering for three seconds.",
  },
};

const POWER_POOL = Object.keys(POWER_DEFINITIONS) as PowerId[];
const EMP_LOCK_SECONDS = 3;

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

export type PowerVector = { x: number; y: number; z: number };

/**
 * Network-friendly event. `position` is a unit planet normal and `forward` is
 * tangent to it. Plain objects are accepted so transport code need not encode
 * Three.js classes.
 */
export type RemotePowerEvent = {
  powerId: OffensivePowerId;
  position: PowerVector;
  forward: PowerVector;
  elevation?: number;
};

export type RemotePowerEventResult = {
  accepted: true;
  blockedByShield: boolean;
};

export type PowerUpdateStatus = {
  trap: boolean;
  smoke: boolean;
  emp: boolean;
  missile: boolean;
  steeringLocked: boolean;
  /** Backwards-compatible alias for lane-trap contact. */
  slicked: boolean;
};

type Capsule = {
  normal: THREE.Vector3;
  group: THREE.Group;
  shell: THREE.Mesh;
  cooldown: number;
  material: THREE.MeshStandardMaterial;
};

type FieldEffect = {
  type: "trap" | "smoke" | "emp";
  normal: THREE.Vector3;
  forward: THREE.Vector3;
  group: THREE.Group;
  life: number;
  maxLife: number;
  radius: number;
  armDelay: number;
};

type MissileEffect = {
  normal: THREE.Vector3;
  forward: THREE.Vector3;
  group: THREE.Group;
  life: number;
  armDelay: number;
};

function vector(value: PowerVector) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** A readable local-car aura for timed powers. */
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
      color: 0x55d9ff,
      emissive: 0x55d9ff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0,
      roughness: 0.15,
      depthWrite: false,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff9d35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0xff9d35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 18, 12),
      this.shellMat,
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.035, 8, 28),
      this.ringMat,
    );
    this.ring.rotation.x = Math.PI / 2;
    this.trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.65, 10),
      this.trailMat,
    );
    this.trail.rotation.x = Math.PI;
    this.trail.position.z = -0.4;
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
    const blend = 1 - Math.exp(-delta * 10);
    const pulse = 0.72 + Math.sin(elapsed * 10) * 0.28;
    const showShell = active?.id === "shield";
    const showRing =
      active?.id === "speed-boost" ||
      active?.id === "high-jump" ||
      active?.id === "emp-blast";
    const showTrail = active?.id === "speed-boost";
    const color = active?.color ?? 0xffffff;
    this.shellMat.color.setHex(color);
    this.shellMat.emissive.setHex(color);
    this.ringMat.color.setHex(color);
    this.trailMat.color.setHex(color);
    this.shellMat.opacity = THREE.MathUtils.lerp(
      this.shellMat.opacity,
      showShell ? 0.38 * pulse : 0,
      blend,
    );
    this.ringMat.opacity = THREE.MathUtils.lerp(
      this.ringMat.opacity,
      showRing ? 0.9 * pulse : 0,
      blend,
    );
    this.trailMat.opacity = THREE.MathUtils.lerp(
      this.trailMat.opacity,
      showTrail ? 0.7 * pulse : 0,
      blend,
    );
    this.group.visible =
      this.shellMat.opacity > 0.02 ||
      this.ringMat.opacity > 0.02 ||
      this.trailMat.opacity > 0.02;
    this.ring.rotation.z += delta * 7;
    this.shell.scale.setScalar(0.96 + pulse * 0.12);
  }

  dispose() {
    disposeObject(this.group);
  }
}

export class PowerSystem {
  readonly group = new THREE.Group();
  readonly aura = new PowerAura();
  private readonly road: RoadNetwork;
  private readonly capsules: Capsule[] = [];
  private readonly fields: FieldEffect[] = [];
  private readonly missiles: MissileEffect[] = [];
  private held: PowerId | null = null;
  private active: PowerId | null = null;
  private activeRemaining = 0;
  private empRemaining = 0;
  private smokeContact = false;

  constructor(road: RoadNetwork) {
    this.road = road;
    this.group.name = "road-powers";
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
    if (this.active === "speed-boost") {
      mods.speedCapScale = 2.15;
      mods.accelScale = 2.1;
      mods.steerScale = 0.88;
      mods.boostDrainScale = 0.12;
      mods.boostRegenScale = 2.5;
      mods.boostPush = 1.1;
      mods.autoBoost = true;
    } else if (this.active === "shield") {
      mods.boundaryRetain = 1;
      mods.gripScale = 1.25;
    } else if (this.active === "high-jump") {
      mods.speedCapScale = 1.15;
    }
    if (this.empRemaining > 0 && this.active !== "shield") {
      mods.steerScale = 0;
    }
    if (this.smokeContact && this.active !== "shield") {
      mods.steerScale *= 0.45;
      mods.gripScale *= 0.62;
      mods.speedCapScale *= 0.84;
    }
    return mods;
  }

  /** Deterministic pickup helper for tests, demos, and authoritative networking. */
  grant(powerId: PowerId): PowerDefinition {
    this.held = powerId;
    return POWER_DEFINITIONS[powerId];
  }

  reset() {
    this.held = null;
    this.active = null;
    this.activeRemaining = 0;
    this.empRemaining = 0;
    this.smokeContact = false;
    for (const capsule of this.capsules) {
      capsule.cooldown = 0;
      capsule.group.visible = true;
    }
    while (this.fields.length > 0) this.removeField(this.fields.length - 1);
    while (this.missiles.length > 0) this.removeMissile(this.missiles.length - 1);
  }

  tryPickup(carNormal: THREE.Vector3): {
    picked: PowerDefinition | null;
    blocked: boolean;
  } {
    for (const capsule of this.capsules) {
      if (
        capsule.cooldown > 0 ||
        angularDistance(carNormal, capsule.normal) * PLANET_RADIUS > 0.45
      ) {
        continue;
      }
      if (this.held) return { picked: null, blocked: true };
      const id = POWER_POOL[Math.floor(Math.random() * POWER_POOL.length)]!;
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
  }): ActivatedPower | null {
    if (!this.held || this.active) return null;
    const id = this.held;
    const definition = POWER_DEFINITIONS[id];
    this.held = null;

    if (id === "high-jump") context.launch(1.85);
    if (id === "speed-boost") {
      context.fillBoost();
      context.surgeSpeed();
    }
    if (id === "lane-trap") {
      this.spawnField(
        "trap",
        context.dropBehind,
        context.forward,
        context.elevation,
        0.45,
      );
    }
    if (id === "smoke-screen") {
      this.spawnField(
        "smoke",
        context.dropBehind,
        context.forward,
        context.elevation,
        0.45,
      );
    }
    if (id === "emp-blast") {
      const ahead = context.normal
        .clone()
        .addScaledVector(context.forward, 0.1)
        .normalize();
      this.spawnField("emp", ahead, context.forward, context.elevation, 0.4);
    }
    if (id === "cruise-missile") {
      this.spawnMissile(
        context.normal,
        context.forward,
        context.elevation,
        0.35,
      );
    }

    this.active = id;
    this.activeRemaining = definition.duration;
    return definition;
  }

  /**
   * Adds an offensive event received from another driver. The return value lets
   * networking/UI acknowledge an attack that arrived while shielded.
   */
  receiveRemotePowerEvent(event: RemotePowerEvent): RemotePowerEventResult {
    if (this.active === "shield") {
      return { accepted: true, blockedByShield: true };
    }
    const position = vector(event.position).normalize();
    const forward = vector(event.forward)
      .projectOnPlane(position)
      .normalize();
    const elevation = event.elevation ?? 0;
    if (event.powerId === "cruise-missile") {
      this.spawnMissile(position, forward, elevation, 0);
    } else {
      const type =
        event.powerId === "lane-trap"
          ? "trap"
          : event.powerId === "smoke-screen"
            ? "smoke"
            : "emp";
      this.spawnField(type, position, forward, elevation, 0);
    }
    return { accepted: true, blockedByShield: false };
  }

  isOnHazard(carNormal: THREE.Vector3) {
    if (this.active === "shield") return false;
    return this.fields.some(
      (field) =>
        field.type === "trap" &&
        field.armDelay <= 0 &&
        angularDistance(carNormal, field.normal) * PLANET_RADIUS < field.radius,
    );
  }

  /** Existing Game.ts compatibility. */
  isOnSlick(carNormal: THREE.Vector3) {
    return this.isOnHazard(carNormal);
  }

  update(
    delta: number,
    elapsed: number,
    carNormal: THREE.Vector3,
    carGroup?: THREE.Object3D,
  ): PowerUpdateStatus {
    if (this.active) {
      this.activeRemaining = Math.max(0, this.activeRemaining - delta);
      if (this.activeRemaining === 0) this.active = null;
    }
    if (this.active === "shield") this.empRemaining = 0;
    else this.empRemaining = Math.max(0, this.empRemaining - delta);
    if (carGroup) this.aura.update(delta, elapsed, this.hud.active, carGroup);

    for (const capsule of this.capsules) {
      capsule.cooldown = Math.max(0, capsule.cooldown - delta);
      if (capsule.cooldown === 0) capsule.group.visible = true;
      capsule.group.rotation.y += delta * 1.6;
      capsule.shell.position.y =
        0.08 + Math.sin(elapsed * 4 + capsule.cooldown) * 0.03;
      capsule.material.emissiveIntensity =
        0.55 + Math.sin(elapsed * 6) * 0.25;
    }

    let trap = false;
    let smoke = false;
    let missile = false;
    for (let index = this.fields.length - 1; index >= 0; index -= 1) {
      const field = this.fields[index]!;
      field.life -= delta;
      field.armDelay = Math.max(0, field.armDelay - delta);
      this.animateField(field, delta, elapsed);
      const touching =
        field.armDelay <= 0 &&
        angularDistance(carNormal, field.normal) * PLANET_RADIUS < field.radius;
      if (touching && this.active !== "shield") {
        if (field.type === "trap") trap = true;
        if (field.type === "smoke") smoke = true;
        if (field.type === "emp") {
          this.empRemaining = EMP_LOCK_SECONDS;
          this.removeField(index);
          continue;
        }
      } else if (touching && field.type === "emp") {
        this.removeField(index);
        continue;
      }
      if (field.life <= 0) this.removeField(index);
    }

    for (let index = this.missiles.length - 1; index >= 0; index -= 1) {
      const effect = this.missiles[index]!;
      effect.life -= delta;
      effect.armDelay = Math.max(0, effect.armDelay - delta);
      this.advanceMissile(effect, delta);
      const touching =
        effect.armDelay <= 0 &&
        angularDistance(carNormal, effect.normal) * PLANET_RADIUS < 0.32;
      if (touching) {
        missile = this.active !== "shield";
        this.removeMissile(index);
      } else if (effect.life <= 0) {
        this.removeMissile(index);
      }
    }

    const emp = this.empRemaining > 0 && this.active !== "shield";
    this.smokeContact = smoke;
    return {
      trap,
      smoke,
      emp,
      missile,
      steeringLocked: emp,
      slicked: trap,
    };
  }

  private spawnField(
    type: FieldEffect["type"],
    position: PowerVector,
    forwardValue: PowerVector,
    elevation: number,
    armDelay: number,
  ) {
    const normal = vector(position).normalize();
    const forward = vector(forwardValue).projectOnPlane(normal).normalize();
    const group =
      type === "trap"
        ? this.createTrapVfx()
        : type === "smoke"
          ? this.createSmokeVfx()
          : this.createEmpVfx();
    group.position
      .copy(normal)
      .multiplyScalar(PLANET_RADIUS + elevation + (type === "smoke" ? 0.18 : 0.07));
    group.quaternion.copy(orientationFromFrame(normal, forward));
    this.group.add(group);
    const life = type === "trap" ? 12 : type === "smoke" ? 8 : 4;
    this.fields.push({
      type,
      normal,
      forward,
      group,
      life,
      maxLife: life,
      radius: type === "smoke" ? 0.58 : type === "emp" ? 0.48 : 0.34,
      armDelay,
    });
  }

  private createTrapVfx() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH * 0.72, 0.035, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x36151b,
        emissive: 0xff243c,
        emissiveIntensity: 0.75,
        roughness: 0.5,
      }),
    );
    base.position.y = 0.015;
    group.add(base);
    for (let index = -3; index <= 3; index += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.16, 5),
        new THREE.MeshStandardMaterial({
          color: 0xffd6d8,
          emissive: 0xff334f,
          emissiveIntensity: 1.2,
          metalness: 0.65,
        }),
      );
      spike.position.set(index * 0.105, 0.1, index % 2 === 0 ? -0.04 : 0.04);
      group.add(spike);
    }
    return group;
  }

  private createSmokeVfx() {
    const group = new THREE.Group();
    for (let index = 0; index < 11; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0x343946 : 0x697080,
        emissive: 0x1a2030,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        roughness: 1,
      });
      const puff = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.14 + (index % 3) * 0.035, 1),
        material,
      );
      puff.position.set(
        ((index * 37) % 11) * 0.075 - 0.37,
        0.1 + (index % 4) * 0.075,
        ((index * 23) % 7) * 0.07 - 0.2,
      );
      group.add(puff);
    }
    return group;
  }

  private createEmpVfx() {
    const group = new THREE.Group();
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.18 + index * 0.1, 0.018, 6, 32),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? 0xffffff : 0x3eeaff,
          transparent: true,
          opacity: 0.9 - index * 0.18,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.035 + index * 0.012;
      group.add(ring);
    }
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    core.position.y = 0.07;
    group.add(core);
    return group;
  }

  private animateField(field: FieldEffect, delta: number, elapsed: number) {
    const fade = THREE.MathUtils.clamp(field.life / 1.2, 0, 1);
    field.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material & {
        opacity?: number;
        transparent?: boolean;
      };
      if (material.transparent && material.opacity !== undefined) {
        material.opacity = Math.min(material.opacity, fade * 0.8);
      }
    });
    if (field.type === "smoke") {
      field.group.rotation.y += delta * 0.25;
      field.group.children.forEach((puff, index) => {
        puff.position.y += delta * (0.012 + (index % 3) * 0.006);
        puff.scale.setScalar(1 + Math.sin(elapsed * 2 + index) * 0.08);
      });
    } else if (field.type === "emp") {
      const age = field.maxLife - field.life;
      field.group.rotation.y -= delta * 2.5;
      field.group.scale.setScalar(1 + Math.min(age, 1.5) * 0.45);
    }
  }

  private spawnMissile(
    position: PowerVector,
    forwardValue: PowerVector,
    elevation: number,
    armDelay: number,
  ) {
    const normal = vector(position).normalize();
    const forward = vector(forwardValue).projectOnPlane(normal).normalize();
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.25, 4, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffe8a3,
        emissive: 0xff8a1f,
        emissiveIntensity: 0.8,
        metalness: 0.75,
        roughness: 0.25,
      }),
    );
    body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.058, 0.14, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff3f32,
        emissive: 0xff1900,
        emissiveIntensity: 0.9,
      }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.22;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.28, 8),
      new THREE.MeshBasicMaterial({
        color: 0x55eaff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -0.25;
    group.add(body, nose, flame);
    group.position.copy(normal).multiplyScalar(PLANET_RADIUS + elevation + 0.15);
    group.quaternion.copy(orientationFromFrame(normal, forward));
    this.group.add(group);
    this.missiles.push({ normal, forward, group, life: 3.5, armDelay });
  }

  private advanceMissile(effect: MissileEffect, delta: number) {
    const step = (delta * 3.3) / PLANET_RADIUS;
    effect.normal
      .addScaledVector(effect.forward, step)
      .normalize();
    effect.forward.projectOnPlane(effect.normal).normalize();
    const radius = effect.group.position.length();
    effect.group.position.copy(effect.normal).multiplyScalar(radius);
    effect.group.quaternion.copy(
      orientationFromFrame(effect.normal, effect.forward),
    );
    const flame = effect.group.children[2];
    if (flame) flame.scale.y = 0.8 + Math.random() * 0.45;
  }

  private removeField(index: number) {
    const field = this.fields[index];
    if (!field) return;
    this.group.remove(field.group);
    disposeObject(field.group);
    this.fields.splice(index, 1);
  }

  private removeMissile(index: number) {
    const effect = this.missiles[index];
    if (!effect) return;
    this.group.remove(effect.group);
    disposeObject(effect.group);
    this.missiles.splice(index, 1);
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
    disposeObject(this.group);
    this.group.clear();
    this.capsules.length = 0;
  }
}
