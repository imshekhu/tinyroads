import * as THREE from "three";
import { PLANET_RADIUS, ROAD_SAMPLE_COUNT, ROAD_WIDTH } from "../config";
import { angularDistance, orientationFromFrame } from "../math/SphericalMath";
import type { RoadNetwork, RoadSample } from "./RoadNetwork";

type BoostPad = {
  normal: THREE.Vector3;
  group: THREE.Group;
  cooldown: number;
};

type Ramp = {
  normal: THREE.Vector3;
  cooldown: number;
};

export type TrackTrigger = {
  boost: boolean;
  ramp: boolean;
};

function sampleAt(road: RoadNetwork, progress: number) {
  const index =
    ((Math.round(progress * ROAD_SAMPLE_COUNT) % ROAD_SAMPLE_COUNT) +
      ROAD_SAMPLE_COUNT) %
    ROAD_SAMPLE_COUNT;
  return road.samples[index];
}

export class TrackFeatures {
  readonly group = new THREE.Group();
  private readonly road: RoadNetwork;
  private readonly pads: BoostPad[] = [];
  private readonly ramps: Ramp[] = [];
  private readonly boostMaterial = new THREE.MeshStandardMaterial({
    color: 0x3ce5ff,
    emissive: 0x0aa9d4,
    emissiveIntensity: 1.4,
    roughness: 0.3,
    metalness: 0.2,
  });

  constructor(road: RoadNetwork) {
    this.road = road;
    this.group.name = "arcade-track-features";
    this.buildBoostPads();
    this.buildRamps();
    this.buildTrackArches();
    this.buildBillboards();
    this.buildSignalTowers();
    this.buildCornerPylons();
    this.buildSpeedwayMarkers();
  }

  private placeAt(
    object: THREE.Object3D,
    sample: RoadSample,
    height: number,
  ) {
    object.position
      .copy(sample.position)
      .addScaledVector(sample.normal, height);
    object.quaternion.copy(
      orientationFromFrame(sample.normal, sample.tangent),
    );
  }

  private buildBoostPads() {
    // Straights get the speed — Monza-style DRS energy.
    const progresses = [
      0.06, 0.1, 0.13, // main straight burst
      0.27, // Curva Grande exit
      0.48, 0.52, 0.56, // back straight
      0.72, // after Ascari
      0.98, // onto main straight
    ];
    for (const progress of progresses) {
      const sample = sampleAt(this.road, progress);
      const group = new THREE.Group();
      const laneSpan = ROAD_WIDTH * 0.42;
      for (let step = -4; step <= 4; step += 1) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.012, 0.22),
          this.boostMaterial,
        );
        strip.position.x = (step / 4) * laneSpan;
        group.add(strip);
      }
      this.placeAt(group, sample, 0.064);
      this.group.add(group);
      this.pads.push({ normal: sample.normal.clone(), group, cooldown: 0 });
    }
  }

  private buildTrackArches() {
    const archMaterial = new THREE.MeshStandardMaterial({
      color: 0xff7040,
      emissive: 0x8f210d,
      emissiveIntensity: 0.45,
      roughness: 0.48,
    });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: 0xffdb4d });
    const progresses = [0.0, 0.21, 0.355, 0.575, 0.78];
    progresses.forEach((progress, index) => {
      const sample = sampleAt(this.road, progress);
      const arch = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ROAD_WIDTH * 0.52, 0.038, 8, 40, Math.PI),
        archMaterial,
      );
      ring.rotation.z = Math.PI;
      ring.position.y = -0.03;
      arch.add(ring);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.32, 0.04),
          archMaterial,
        );
        post.position.set(side * ROAD_WIDTH * 0.52, -0.15, 0);
        arch.add(post);
      }
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.05, 0.02),
        accentMaterial,
      );
      badge.position.set(0, 0.27, 0);
      badge.rotation.z = index % 2 === 0 ? 0.05 : -0.05;
      arch.add(badge);
      this.placeAt(arch, sample, 0.3);
      arch.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      this.group.add(arch);
    });
  }

  private buildRamps() {
    const progresses = [0.4, 0.61, 0.7, 0.84];
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6d35,
      emissive: 0x8f210a,
      emissiveIntensity: 0.4,
      roughness: 0.48,
    });
    for (const progress of progresses) {
      const sample = sampleAt(this.road, progress);
      const ramp = new THREE.Group();
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD_WIDTH * 0.62, 0.028, 0.4),
        material,
      );
      // Sit flush with asphalt: slight wedge, not a floating plank.
      deck.position.y = 0.014;
      deck.rotation.x = -0.12;
      ramp.add(deck);
      for (const x of [-0.12, 0.12]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.028, 0.03, 0.34),
          new THREE.MeshBasicMaterial({ color: 0xffd750 }),
        );
        stripe.position.set(x, 0.03, 0);
        stripe.rotation.x = -0.12;
        ramp.add(stripe);
      }
      this.placeAt(ramp, sample, 0.014);
      ramp.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      this.group.add(ramp);
      this.ramps.push({ normal: sample.normal.clone(), cooldown: 0 });
    }
  }

  private buildBillboards() {
    const progresses = [0.08, 0.25, 0.38, 0.5, 0.66, 0.88];
    const colors = [0xf6c943, 0x4bd3e9, 0xff7040, 0x9e78e7, 0x7dffb2, 0xff8ab8];
    progresses.forEach((progress, index) => {
      const sample = sampleAt(this.road, progress);
      const billboard = new THREE.Group();
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      const side = index % 2 === 0 ? 1 : -1;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.17, 0.025),
        new THREE.MeshStandardMaterial({
          color: colors[index],
          emissive: colors[index],
          emissiveIntensity: 0.12,
          roughness: 0.6,
        }),
      );
      panel.position.y = 0.26;
      const slash = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.025, 0.029),
        new THREE.MeshBasicMaterial({ color: 0x20252a }),
      );
      slash.position.set(0, 0.26, 0.015);
      slash.rotation.z = -0.16;
      billboard.add(panel, slash);
      for (const x of [-0.1, 0.1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.26, 0.018),
          new THREE.MeshStandardMaterial({ color: 0xe9e2d2 }),
        );
        post.position.set(x, 0.1, 0);
        billboard.add(post);
      }
      this.placeAt(billboard, sample, 0.01);
      billboard.position.addScaledVector(
        right,
        side * (ROAD_WIDTH * 0.5 + 0.55),
      );
      billboard.rotation.y += side > 0 ? -0.16 : 0.16;
      this.group.add(billboard);
    });
  }

  private buildSignalTowers() {
    const progresses = [0.155, 0.445, 0.78];
    progresses.forEach((progress, index) => {
      const sample = sampleAt(this.road, progress);
      const tower = new THREE.Group();
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.035, 0.58, 6),
        new THREE.MeshStandardMaterial({
          color: 0xebe7dc,
          metalness: 0.55,
          roughness: 0.35,
        }),
      );
      mast.position.y = 0.29;
      tower.add(mast);
      for (let level = 0; level < 3; level += 1) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.09 + level * 0.025, 0.009, 5, 18),
          new THREE.MeshBasicMaterial({
            color: index === 0 ? 0x51d9ef : index === 1 ? 0xffdb4d : 0xff7650,
          }),
        );
        ring.position.y = 0.34 + level * 0.09;
        ring.rotation.x = Math.PI / 2;
        tower.add(ring);
      }
      this.placeAt(tower, sample, 0);
      const side = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      tower.position.addScaledVector(side, ROAD_WIDTH * 0.5 + 0.65);
      this.group.add(tower);
    });
  }

  private buildCornerPylons() {
    const progresses = [0.17, 0.19, 0.32, 0.34, 0.38, 0.43, 0.6, 0.63, 0.85, 0.9];
    const material = new THREE.MeshStandardMaterial({
      color: 0xfff1d0,
      emissive: 0xff8a3d,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    progresses.forEach((progress, index) => {
      const sample = sampleAt(this.road, progress);
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.048, 0.24, 6),
          material,
        );
        this.placeAt(pylon, sample, 0.12);
        pylon.position.addScaledVector(
          right,
          side * (ROAD_WIDTH * 0.5 + 0.38),
        );
        pylon.position.addScaledVector(sample.tangent, (index % 2) * 0.06);
        this.group.add(pylon);
      }
    });
  }

  private buildSpeedwayMarkers() {
    const progresses = [0.07, 0.09, 0.11, 0.5, 0.53];
    const material = new THREE.MeshBasicMaterial({ color: 0x56f0ff });
    for (const progress of progresses) {
      const sample = sampleAt(this.road, progress);
      const chevron = new THREE.Group();
      for (let lane = -2; lane <= 2; lane += 1) {
        const mark = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.11, 3),
          material,
        );
        mark.rotation.x = Math.PI / 2;
        mark.position.set(lane * (ROAD_WIDTH / 10), 0.02, 0);
        chevron.add(mark);
      }
      this.placeAt(chevron, sample, 0.05);
      this.group.add(chevron);
    }
  }

  update(
    delta: number,
    elapsed: number,
    carNormal: THREE.Vector3,
  ): TrackTrigger {
    this.boostMaterial.emissiveIntensity = 1.3 + Math.sin(elapsed * 7) * 0.55;
    let triggered = false;
    for (const pad of this.pads) {
      pad.cooldown = Math.max(0, pad.cooldown - delta);
      pad.group.scale.y = 1 + Math.sin(elapsed * 8) * 0.08;
      if (
        pad.cooldown === 0 &&
        angularDistance(carNormal, pad.normal) * PLANET_RADIUS < 0.42
      ) {
        pad.cooldown = 2.2;
        triggered = true;
      }
    }
    let launched = false;
    for (const ramp of this.ramps) {
      ramp.cooldown = Math.max(0, ramp.cooldown - delta);
      if (
        ramp.cooldown === 0 &&
        angularDistance(carNormal, ramp.normal) * PLANET_RADIUS < 0.4
      ) {
        ramp.cooldown = 2.5;
        launched = true;
      }
    }
    return { boost: triggered, ramp: launched };
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
