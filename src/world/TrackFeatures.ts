import * as THREE from "three";
import { PLANET_RADIUS, ROAD_WIDTH } from "../config";
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
    // Mix isolated pads with a short "speedway" burst sequence.
    const selections = [
      this.road.samples[120],
      this.road.samples[210],
      this.road.samples[220],
      this.road.samples[230],
      this.road.samples[350],
      this.road.samples[480],
      this.road.samples[620],
      this.road.samples[850],
      this.road.samples[990],
      this.road.samples[1100],
      this.road.samples[1300],
    ];
    for (const sample of selections) {
      const group = new THREE.Group();
      for (const x of [-0.28, -0.2, -0.12, -0.04, 0.04, 0.12, 0.2, 0.28]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.012, 0.2),
          this.boostMaterial,
        );
        strip.position.x = x;
        group.add(strip);
      }
      this.placeAt(group, sample, 0.064);
      this.group.add(group);
      this.pads.push({ normal: sample.normal, group, cooldown: 0 });
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
    const selections = [
      this.road.samples[190],
      this.road.samples[455],
      this.road.samples[690],
      this.road.samples[930],
      this.road.samples[1210],
    ];
    selections.forEach((sample, index) => {
      const arch = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.035, 8, 40, Math.PI),
        archMaterial,
      );
      ring.rotation.z = Math.PI;
      ring.position.y = -0.03;
      arch.add(ring);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.28, 0.035),
          archMaterial,
        );
        post.position.set(side * 0.48, -0.14, 0);
        arch.add(post);
      }
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.045, 0.02),
        accentMaterial,
      );
      badge.position.set(0, 0.235, 0);
      badge.rotation.z = index % 2 === 0 ? 0.05 : -0.05;
      arch.add(badge);
      this.placeAt(arch, sample, 0.275);
      arch.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      this.group.add(arch);
    });
  }

  private buildRamps() {
    const selections = [
      this.road.samples[280],
      this.road.samples[540],
      this.road.samples[760],
      this.road.samples[1020],
      this.road.samples[1180],
    ];
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6d35,
      emissive: 0x8f210a,
      emissiveIntensity: 0.4,
      roughness: 0.48,
    });
    for (const sample of selections) {
      const ramp = new THREE.Group();
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD_WIDTH * 0.86, 0.035, 0.34),
        material,
      );
      deck.position.y = 0.055;
      deck.rotation.x = -0.18;
      ramp.add(deck);
      for (const x of [-0.1, 0.1]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.039, 0.3),
          new THREE.MeshBasicMaterial({ color: 0xffd750 }),
        );
        stripe.position.set(x, 0.075, 0);
        stripe.rotation.x = -0.18;
        ramp.add(stripe);
      }
      this.placeAt(ramp, sample, 0.055);
      ramp.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      this.group.add(ramp);
      this.ramps.push({ normal: sample.normal, cooldown: 0 });
    }
  }

  private buildBillboards() {
    const samples = [
      this.road.samples[80],
      this.road.samples[310],
      this.road.samples[410],
      this.road.samples[640],
      this.road.samples[780],
      this.road.samples[1150],
    ];
    const colors = [0xf6c943, 0x4bd3e9, 0xff7040, 0x9e78e7, 0x7dffb2, 0xff8ab8];
    samples.forEach((sample, index) => {
      const billboard = new THREE.Group();
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      const side = index % 2 === 0 ? 1 : -1;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.16, 0.025),
        new THREE.MeshStandardMaterial({
          color: colors[index],
          emissive: colors[index],
          emissiveIntensity: 0.12,
          roughness: 0.6,
        }),
      );
      panel.position.y = 0.25;
      const slash = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.025, 0.029),
        new THREE.MeshBasicMaterial({ color: 0x20252a }),
      );
      slash.position.set(0, 0.25, 0.015);
      slash.rotation.z = -0.16;
      billboard.add(panel, slash);
      for (const x of [-0.1, 0.1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.25, 0.018),
          new THREE.MeshStandardMaterial({ color: 0xe9e2d2 }),
        );
        post.position.set(x, 0.1, 0);
        billboard.add(post);
      }
      this.placeAt(billboard, sample, 0.01);
      billboard.position.addScaledVector(
        right,
        side * (ROAD_WIDTH * 0.5 + 0.31),
      );
      billboard.rotation.y += side > 0 ? -0.16 : 0.16;
      this.group.add(billboard);
    });
  }

  private buildSignalTowers() {
    const samples = [
      this.road.samples[520],
      this.road.samples[860],
      this.road.samples[980],
    ];
    samples.forEach((sample, index) => {
      const tower = new THREE.Group();
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.035, 0.55, 6),
        new THREE.MeshStandardMaterial({
          color: 0xebe7dc,
          metalness: 0.55,
          roughness: 0.35,
        }),
      );
      mast.position.y = 0.275;
      tower.add(mast);
      for (let level = 0; level < 3; level += 1) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.09 + level * 0.025, 0.009, 5, 18),
          new THREE.MeshBasicMaterial({
            color: index === 0 ? 0x51d9ef : index === 1 ? 0xffdb4d : 0xff7650,
          }),
        );
        ring.position.y = 0.32 + level * 0.09;
        ring.rotation.x = Math.PI / 2;
        tower.add(ring);
      }
      this.placeAt(tower, sample, 0);
      const side = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      tower.position.addScaledVector(side, 0.48);
      this.group.add(tower);
    });
  }

  private buildCornerPylons() {
    const samples = [
      this.road.samples[160],
      this.road.samples[430],
      this.road.samples[700],
      this.road.samples[960],
      this.road.samples[1260],
    ];
    const material = new THREE.MeshStandardMaterial({
      color: 0xfff1d0,
      emissive: 0xff8a3d,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    samples.forEach((sample, index) => {
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.045, 0.22, 6),
          material,
        );
        this.placeAt(pylon, sample, 0.12);
        pylon.position.addScaledVector(
          right,
          side * (ROAD_WIDTH * 0.48 + 0.05),
        );
        pylon.position.addScaledVector(sample.tangent, (index % 2) * 0.08);
        this.group.add(pylon);
      }
    });
  }

  private buildSpeedwayMarkers() {
    const samples = [
      this.road.samples[205],
      this.road.samples[215],
      this.road.samples[225],
    ];
    const material = new THREE.MeshBasicMaterial({ color: 0x56f0ff });
    for (const sample of samples) {
      const chevron = new THREE.Group();
      for (let lane = -1; lane <= 1; lane += 1) {
        const mark = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.12, 3),
          material,
        );
        mark.rotation.x = Math.PI / 2;
        mark.position.set(lane * 0.16, 0.02, 0);
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
        angularDistance(carNormal, pad.normal) * PLANET_RADIUS < 0.38
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
        angularDistance(carNormal, ramp.normal) * PLANET_RADIUS < 0.36
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
