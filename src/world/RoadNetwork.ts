import * as THREE from "three";
import {
  COLORS,
  PLANET_RADIUS,
  ROAD_SAMPLE_COUNT,
  ROAD_WIDTH,
} from "../config";
import { angularDistance, slerpDirection } from "../math/SphericalMath";

export type RoadSample = {
  normal: THREE.Vector3;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
};

export type RoadInfo = {
  distance: number;
  index: number;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
  route: "coast";
};

export function mainRouteLatitude(theta: number) {
  return (
    Math.sin(theta * 3 + 0.35) * 0.11 +
    Math.sin(theta * 7 - 0.8) * 0.025
  );
}

export class RoadNetwork {
  readonly group = new THREE.Group();
  readonly samples: RoadSample[] = [];
  readonly lapLength: number;

  private readonly surfaceRadiusAt: (normal: THREE.Vector3) => number;

  constructor(surfaceRadiusAt: (normal: THREE.Vector3) => number) {
    this.surfaceRadiusAt = surfaceRadiusAt;
    this.group.name = "four-lane-circuit";
    this.generateSamples();
    this.lapLength = this.measureLap();
    this.buildRoad();
    this.buildLaneMarkings();
    this.buildContainmentBarriers();
  }

  private generateSamples() {
    const positions: THREE.Vector3[] = [];
    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const theta = (index / ROAD_SAMPLE_COUNT) * Math.PI * 2;
      const latitude = mainRouteLatitude(theta);
      const normal = new THREE.Vector3(
        Math.cos(latitude) * Math.cos(theta),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(theta),
      ).normalize();
      positions.push(
        normal
          .clone()
          .multiplyScalar(this.surfaceRadiusAt(normal) + 0.04),
      );
    }

    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const previous =
        positions[(index - 1 + ROAD_SAMPLE_COUNT) % ROAD_SAMPLE_COUNT];
      const next = positions[(index + 1) % ROAD_SAMPLE_COUNT];
      const normal = positions[index].clone().normalize();
      const difference = next.clone().sub(previous);
      const tangent = difference
        .addScaledVector(normal, -difference.dot(normal))
        .normalize();
      this.samples.push({ normal, position: positions[index], tangent });
    }
  }

  private measureLap() {
    let length = 0;
    for (let index = 0; index < this.samples.length; index += 1) {
      length += this.samples[index].position.distanceTo(
        this.samples[(index + 1) % this.samples.length].position,
      );
    }
    return length;
  }

  private makeRibbon(width: number, lift: number, color: number) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const sample of this.samples) {
      const side = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      const center = sample.position.clone().addScaledVector(sample.normal, lift);
      const left = center.clone().addScaledVector(side, -width / 2);
      const right = center.clone().addScaledVector(side, width / 2);
      vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
      normals.push(
        sample.normal.x,
        sample.normal.y,
        sample.normal.z,
        sample.normal.x,
        sample.normal.y,
        sample.normal.z,
      );
    }
    for (let index = 0; index < this.samples.length; index += 1) {
      const next = (index + 1) % this.samples.length;
      const a = index * 2;
      const b = a + 1;
      const c = next * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.86,
        metalness: 0.03,
      }),
    );
  }

  private buildRoad() {
    const shoulder = this.makeRibbon(
      ROAD_WIDTH + 0.22,
      0,
      0xe97937,
    );
    shoulder.name = "circuit-safety-shoulder";
    shoulder.receiveShadow = true;
    const asphalt = this.makeRibbon(ROAD_WIDTH, 0.012, COLORS.road);
    asphalt.name = "four-lane-asphalt";
    asphalt.receiveShadow = true;
    this.group.add(shoulder, asphalt);
  }

  private buildLaneMarkings() {
    const stride = 9;
    const countPerLine = Math.floor(this.samples.length / stride);
    const offsets = [-ROAD_WIDTH * 0.25, 0, ROAD_WIDTH * 0.25];
    const geometry = new THREE.BoxGeometry(0.014, 0.012, 0.13);
    const material = new THREE.MeshBasicMaterial({ color: 0xf7e9bd });
    const markings = new THREE.InstancedMesh(
      geometry,
      material,
      countPerLine * offsets.length,
    );
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;
    for (const offset of offsets) {
      for (let index = 0; index < countPerLine; index += 1) {
        const sample = this.samples[index * stride];
        const right = new THREE.Vector3()
          .crossVectors(sample.normal, sample.tangent)
          .normalize();
        orientation.makeBasis(right, sample.normal, sample.tangent);
        const position = sample.position
          .clone()
          .addScaledVector(right, offset)
          .addScaledVector(sample.normal, 0.063);
        matrix.copy(orientation).setPosition(position);
        markings.setMatrixAt(instance++, matrix);
      }
    }
    markings.instanceMatrix.needsUpdate = true;
    markings.name = "four-lane-dividers";
    this.group.add(markings);
  }

  private buildContainmentBarriers() {
    const stride = 2;
    const segmentCount = Math.ceil(this.samples.length / stride);
    const barrierGeometry = new THREE.BoxGeometry(0.045, 0.12, 0.25);
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4eee2,
      metalness: 0.25,
      roughness: 0.42,
    });
    const barriers = new THREE.InstancedMesh(
      barrierGeometry,
      barrierMaterial,
      segmentCount * 2,
    );
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;
    for (let index = 0; index < this.samples.length; index += stride) {
      const sample = this.samples[index];
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      orientation.makeBasis(right, sample.normal, sample.tangent);
      for (const side of [-1, 1]) {
        const position = sample.position
          .clone()
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.065))
          .addScaledVector(sample.normal, 0.105);
        matrix.copy(orientation).setPosition(position);
        barriers.setMatrixAt(instance++, matrix);
      }
    }
    barriers.count = instance;
    barriers.instanceMatrix.needsUpdate = true;
    barriers.castShadow = true;
    barriers.name = "continuous-containment-barriers";
    this.group.add(barriers);
  }

  getRoadInfo(normal: THREE.Vector3): RoadInfo {
    let theta = Math.atan2(normal.z, normal.x);
    if (theta < 0) theta += Math.PI * 2;
    const estimatedIndex = Math.round(
      (theta / (Math.PI * 2)) * this.samples.length,
    );
    let bestIndex = estimatedIndex % this.samples.length;
    let bestDot = -Infinity;
    for (let offset = -5; offset <= 5; offset += 1) {
      const index =
        (estimatedIndex + offset + this.samples.length) % this.samples.length;
      const dot = normal.dot(this.samples[index].normal);
      if (dot > bestDot) {
        bestDot = dot;
        bestIndex = index;
      }
    }
    const sample = this.samples[bestIndex];
    return {
      distance: angularDistance(normal, sample.normal) * PLANET_RADIUS,
      index: bestIndex,
      tangent: sample.tangent,
      normal: sample.normal,
      progress: bestIndex / this.samples.length,
      route: "coast",
    };
  }

  clampToTrack(normal: THREE.Vector3, target = new THREE.Vector3()) {
    const info = this.getRoadInfo(normal);
    const maximumDistance = ROAD_WIDTH * 0.41;
    if (info.distance <= maximumDistance) {
      return { normal: target.copy(normal), info, constrained: false };
    }
    const ratio = maximumDistance / Math.max(info.distance, 0.0001);
    slerpDirection(info.normal, normal, ratio, target);
    return { normal: target, info, constrained: true };
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
