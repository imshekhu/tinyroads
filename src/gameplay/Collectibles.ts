import * as THREE from "three";
import { PLANET_RADIUS } from "../config";
import { angularDistance, orientationFromFrame } from "../math/SphericalMath";
import type { Planet } from "../world/Planet";

type Collectible = {
  group: THREE.Group;
  normal: THREE.Vector3;
  basePosition: THREE.Vector3;
  collected: boolean;
  phase: number;
};

export class Collectibles {
  readonly group = new THREE.Group();
  readonly total = 24;
  collected = 0;

  private readonly items: Collectible[] = [];
  private readonly onCollect: (position: THREE.Vector3, count: number) => void;

  constructor(
    planet: Planet,
    onCollect: (position: THREE.Vector3, count: number) => void,
  ) {
    this.onCollect = onCollect;
    this.group.name = "collectibles";
    const coreGeometry = new THREE.OctahedronGeometry(0.075, 0);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd449,
      emissive: 0xc27610,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.35,
      flatShading: true,
    });
    const ringGeometry = new THREE.TorusGeometry(0.105, 0.009, 6, 18);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffed93,
      transparent: true,
      opacity: 0.75,
    });

    for (let index = 0; index < this.total; index += 1) {
      const route =
        index < 16
          ? planet.road.samples
          : index < 22
            ? planet.road.highlandSamples
            : planet.road.connectorSamples;
      const routeIndex =
        index < 16 ? index : index < 22 ? index - 16 : index - 22;
      const routeCount = index < 16 ? 16 : index < 22 ? 6 : 2;
      const sampleIndex =
        (18 + routeIndex * Math.floor(route.length / routeCount)) % route.length;
      const sample = route[sampleIndex];
      const item = new THREE.Group();
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.castShadow = true;
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      item.add(core, ring);
      const basePosition = sample.position
        .clone()
        .addScaledVector(sample.normal, 0.2);
      item.position.copy(basePosition);
      item.quaternion.copy(
        orientationFromFrame(sample.normal, sample.tangent),
      );
      item.scale.setScalar(0.82);
      this.group.add(item);
      this.items.push({
        group: item,
        normal: sample.normal,
        basePosition,
        collected: false,
        phase: index * 0.77,
      });
    }
  }

  update(elapsed: number, carNormal: THREE.Vector3) {
    for (const item of this.items) {
      if (item.collected) continue;
      item.group.rotation.y = elapsed * 1.8 + item.phase;
      item.group.position
        .copy(item.basePosition)
        .addScaledVector(item.normal, Math.sin(elapsed * 2.4 + item.phase) * 0.025);

      const distance = angularDistance(carNormal, item.normal) * PLANET_RADIUS;
      if (distance < 0.16) {
        item.collected = true;
        item.group.visible = false;
        this.collected += 1;
        this.onCollect(item.group.position, this.collected);
      }
    }
  }

  reset() {
    this.collected = 0;
    for (const item of this.items) {
      item.collected = false;
      item.group.visible = true;
    }
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      list.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}
