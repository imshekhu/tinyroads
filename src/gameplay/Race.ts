import * as THREE from "three";
import { PLANET_RADIUS, ROAD_WIDTH } from "../config";
import { angularDistance, orientationFromFrame } from "../math/SphericalMath";
import type { Planet } from "../world/Planet";

export type RaceSnapshot = {
  status: "waiting" | "racing" | "finished";
  time: number;
  bestTime: number | null;
  checkpoint: number;
  total: number;
};

type Gate = {
  group: THREE.Group;
  normal: THREE.Vector3;
  material: THREE.MeshStandardMaterial;
};

export class Race {
  readonly group = new THREE.Group();
  readonly gateCount = 8;

  private readonly gates: Gate[] = [];
  private status: RaceSnapshot["status"] = "waiting";
  private time = 0;
  private nextGate = 0;
  private passedFinalSector = false;
  private insideGate = false;
  private bestTime: number | null;
  private readonly onEvent: (
    type: "start" | "checkpoint" | "finish",
    snapshot: RaceSnapshot,
  ) => void;

  constructor(
    planet: Planet,
    onEvent: (
      type: "start" | "checkpoint" | "finish",
      snapshot: RaceSnapshot,
    ) => void,
  ) {
    this.onEvent = onEvent;
    this.group.name = "road-race";
    const savedBest = Number(localStorage.getItem("tinyroads-best-lap"));
    this.bestTime = Number.isFinite(savedBest) && savedBest > 0 ? savedBest : null;

    for (let index = 0; index < this.gateCount; index += 1) {
      const sampleIndex =
        (42 + index * Math.floor(planet.road.samples.length / this.gateCount)) %
        planet.road.samples.length;
      const sample = planet.road.samples[sampleIndex];
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xf6c945 : 0x78d5ea,
        emissive: index === 0 ? 0xb16a0e : 0x1b6d82,
        emissiveIntensity: 0.3,
        roughness: 0.45,
        metalness: 0.12,
      });
      const gateRadius = ROAD_WIDTH * 0.55;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(gateRadius, 0.035, 8, 40),
        material,
      );
      ring.castShadow = true;
      group.add(ring);

      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.032, 0.26, 0.032),
          material,
        );
        post.scale.y = 2;
        post.position.set(side * gateRadius, -0.26, 0);
        post.castShadow = true;
        group.add(post);
      }
      group.position
        .copy(sample.position)
        .addScaledVector(sample.normal, 0.49);
      group.quaternion.copy(
        orientationFromFrame(sample.normal, sample.tangent),
      );
      this.group.add(group);
      this.gates.push({ group, normal: sample.normal, material });
    }
    this.updateGateAppearance();
  }

  update(delta: number, elapsed: number, carNormal: THREE.Vector3): RaceSnapshot {
    if (this.status === "racing") this.time += delta;

    this.gates.forEach((gate, index) => {
      const pulse =
        index === this.nextGate
          ? 1 + Math.sin(elapsed * 4) * 0.05
          : 1;
      gate.group.scale.setScalar(pulse);
    });

    const target = this.gates[this.nextGate];
    const distance = angularDistance(carNormal, target.normal) * PLANET_RADIUS;
    const nowInside = distance < ROAD_WIDTH * 0.45;

    if (nowInside && !this.insideGate) {
      this.handleGate();
    }
    this.insideGate = nowInside;
    return this.snapshot();
  }

  private handleGate() {
    if (this.status === "waiting" || this.status === "finished") {
      this.status = "racing";
      this.time = 0;
      this.nextGate = 1;
      this.passedFinalSector = false;
      this.onEvent("start", this.snapshot());
    } else if (this.nextGate === 0 && this.passedFinalSector) {
      this.status = "finished";
      if (!this.bestTime || this.time < this.bestTime) {
        this.bestTime = this.time;
        localStorage.setItem("tinyroads-best-lap", this.time.toFixed(3));
      }
      this.onEvent("finish", this.snapshot());
      this.nextGate = 0;
      this.passedFinalSector = false;
    } else {
      this.nextGate = (this.nextGate + 1) % this.gateCount;
      if (this.nextGate === 0) this.passedFinalSector = true;
      this.onEvent("checkpoint", this.snapshot());
    }
    this.updateGateAppearance();
  }

  private updateGateAppearance() {
    this.gates.forEach((gate, index) => {
      const active = index === this.nextGate;
      gate.material.emissiveIntensity = active ? 1.4 : 0.16;
      gate.material.opacity = active ? 1 : 0.58;
      gate.material.transparent = !active;
      gate.material.depthWrite = active;
    });
  }

  snapshot(): RaceSnapshot {
    return {
      status: this.status,
      time: this.time,
      bestTime: this.bestTime,
      checkpoint:
        this.status === "racing"
          ? this.nextGate === 0
            ? this.gateCount
            : this.nextGate
          : 0,
      total: this.gateCount,
    };
  }

  reset() {
    this.status = "waiting";
    this.time = 0;
    this.nextGate = 0;
    this.passedFinalSector = false;
    this.insideGate = false;
    this.updateGateAppearance();
  }

  dispose() {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }
}
