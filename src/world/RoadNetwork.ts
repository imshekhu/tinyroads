import * as THREE from "three";
import {
  COLORS,
  PLANET_RADIUS,
  ROAD_LANES,
  ROAD_SAMPLE_COUNT,
  ROAD_WIDTH,
} from "../config";
import { angularDistance, slerpDirection } from "../math/SphericalMath";
import {
  CIRCUIT_SECTORS,
  circuitLatitude,
  circuitProgressFromTheta,
  inSector,
} from "./circuitPath";

export type RoadSample = {
  normal: THREE.Vector3;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  progress: number;
};

export type RoadInfo = {
  distance: number;
  index: number;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
  route: "coast";
};

/** Kept for Planet terrain bias — latitude of the GP circuit at longitude theta. */
export function mainRouteLatitude(theta: number) {
  return circuitLatitude(circuitProgressFromTheta(theta));
}

export class RoadNetwork {
  readonly group = new THREE.Group();
  readonly samples: RoadSample[] = [];
  readonly lapLength: number;

  private readonly surfaceRadiusAt: (normal: THREE.Vector3) => number;

  constructor(surfaceRadiusAt: (normal: THREE.Vector3) => number) {
    this.surfaceRadiusAt = surfaceRadiusAt;
    this.group.name = "eight-lane-grand-prix-circuit";
    this.generateSamples();
    this.lapLength = this.measureLap();
    this.buildRoad();
    this.buildLaneMarkings();
    this.buildChicaneKerbs();
    this.buildContainmentBarriers();
  }

  private generateSamples() {
    const positions: THREE.Vector3[] = [];
    const progresses: number[] = [];
    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const progress = index / ROAD_SAMPLE_COUNT;
      const theta = progress * Math.PI * 2;
      const latitude = circuitLatitude(progress);
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
      progresses.push(progress);
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
      this.samples.push({
        normal,
        position: positions[index],
        tangent,
        progress: progresses[index],
      });
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
    const shoulder = this.makeRibbon(ROAD_WIDTH + 0.34, 0, 0xe97937);
    shoulder.name = "circuit-safety-shoulder";
    shoulder.receiveShadow = true;
    const asphalt = this.makeRibbon(ROAD_WIDTH, 0.012, COLORS.road);
    asphalt.name = "eight-lane-asphalt";
    asphalt.receiveShadow = true;
    this.group.add(shoulder, asphalt);
  }

  private buildLaneMarkings() {
    const laneWidth = ROAD_WIDTH / ROAD_LANES;
    const stride = 8;
    const countPerLine = Math.floor(this.samples.length / stride);
    const offsets: number[] = [];
    for (let lane = 1; lane < ROAD_LANES; lane += 1) {
      offsets.push(-ROAD_WIDTH / 2 + lane * laneWidth);
    }
    const geometry = new THREE.BoxGeometry(0.012, 0.011, 0.11);
    const white = new THREE.MeshBasicMaterial({ color: 0xf7e9bd });
    const yellow = new THREE.MeshBasicMaterial({ color: COLORS.roadLine });
    const markings = new THREE.InstancedMesh(
      geometry,
      white,
      countPerLine * offsets.length,
    );
    const centerLine = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.018, 0.012, 0.16),
      yellow,
      countPerLine,
    );
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;
    let centerInstance = 0;
    for (const offset of offsets) {
      const isCenter = Math.abs(offset) < laneWidth * 0.25;
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
        if (isCenter) {
          centerLine.setMatrixAt(centerInstance++, matrix);
        } else {
          markings.setMatrixAt(instance++, matrix);
        }
      }
    }
    markings.count = instance;
    centerLine.count = centerInstance;
    markings.instanceMatrix.needsUpdate = true;
    centerLine.instanceMatrix.needsUpdate = true;
    markings.name = "eight-lane-dividers";
    centerLine.name = "center-line";
    this.group.add(markings, centerLine);
  }

  private buildChicaneKerbs() {
    const sectors = [
      CIRCUIT_SECTORS.primaVariante,
      CIRCUIT_SECTORS.secondaVariante,
      CIRCUIT_SECTORS.ascari,
    ];
    const red = new THREE.MeshBasicMaterial({ color: 0xd62828 });
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f0e6 });
    const geometry = new THREE.BoxGeometry(0.05, 0.02, 0.12);
    const candidates = this.samples.filter((sample) =>
      sectors.some((sector) => inSector(sample.progress, sector)),
    );
    const kerbs = new THREE.InstancedMesh(
      geometry,
      red,
      candidates.length * 2,
    );
    const whiteKerbs = new THREE.InstancedMesh(
      geometry,
      white,
      candidates.length * 2,
    );
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let redCount = 0;
    let whiteCount = 0;
    candidates.forEach((sample, index) => {
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      orientation.makeBasis(right, sample.normal, sample.tangent);
      for (const side of [-1, 1]) {
        const position = sample.position
          .clone()
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.02))
          .addScaledVector(sample.normal, 0.055);
        matrix.copy(orientation).setPosition(position);
        if (index % 2 === 0) kerbs.setMatrixAt(redCount++, matrix);
        else whiteKerbs.setMatrixAt(whiteCount++, matrix);
      }
    });
    kerbs.count = redCount;
    whiteKerbs.count = whiteCount;
    kerbs.instanceMatrix.needsUpdate = true;
    whiteKerbs.instanceMatrix.needsUpdate = true;
    kerbs.name = "chicane-kerbs-red";
    whiteKerbs.name = "chicane-kerbs-white";
    this.group.add(kerbs, whiteKerbs);
  }

  private buildContainmentBarriers() {
    const stride = 2;
    const segmentCount = Math.ceil(this.samples.length / stride);
    const barrierGeometry = new THREE.BoxGeometry(0.05, 0.13, 0.26);
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
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.08))
          .addScaledVector(sample.normal, 0.11);
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
    // Wider window so sharp chicane curvature still resolves the nearest sample.
    for (let offset = -18; offset <= 18; offset += 1) {
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
      progress: sample.progress,
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
