import * as THREE from "three";
import {
  COLORS,
  PLANET_RADIUS,
  ROAD_SAMPLE_COUNT,
  ROAD_WIDTH,
} from "../config";
import { angularDistance } from "../math/SphericalMath";

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
};

export class RoadNetwork {
  readonly group = new THREE.Group();
  readonly samples: RoadSample[] = [];

  constructor(
    private readonly surfaceRadiusAt: (normal: THREE.Vector3) => number,
  ) {
    this.group.name = "road-network";
    this.generateSamples();
    this.buildRoad();
    this.buildMarkings();
    this.buildRoadsidePosts();
  }

  private generateSamples() {
    const positions: THREE.Vector3[] = [];

    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const theta = (index / ROAD_SAMPLE_COUNT) * Math.PI * 2;
      const latitude =
        Math.sin(theta * 3 + 0.35) * 0.17 +
        Math.sin(theta * 7 - 0.8) * 0.045;
      const normal = new THREE.Vector3(
        Math.cos(latitude) * Math.cos(theta),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(theta),
      ).normalize();
      const radius = this.surfaceRadiusAt(normal) + 0.035;
      positions.push(normal.clone().multiplyScalar(radius));
    }

    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const previous =
        positions[(index - 1 + ROAD_SAMPLE_COUNT) % ROAD_SAMPLE_COUNT];
      const next = positions[(index + 1) % ROAD_SAMPLE_COUNT];
      const normal = positions[index].clone().normalize();
      const tangent = next
        .clone()
        .sub(previous)
        .addScaledVector(normal, -next.clone().sub(previous).dot(normal))
        .normalize();
      this.samples.push({
        normal,
        position: positions[index],
        tangent,
      });
    }
  }

  private makeRibbon(width: number, lift: number, color: number) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (const sample of this.samples) {
      const side = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      const center = sample.position
        .clone()
        .addScaledVector(sample.normal, lift);
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

    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 1) {
      const next = (index + 1) % ROAD_SAMPLE_COUNT;
      const a = index * 2;
      const b = a + 1;
      const c = next * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setIndex(indices);

    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0,
        flatShading: true,
      }),
    );
  }

  private buildRoad() {
    const shoulder = this.makeRibbon(ROAD_WIDTH + 0.14, 0, COLORS.roadEdge);
    shoulder.name = "road-shoulder";
    shoulder.receiveShadow = true;
    this.group.add(shoulder);

    const asphalt = this.makeRibbon(ROAD_WIDTH, 0.008, COLORS.road);
    asphalt.name = "road-asphalt";
    asphalt.receiveShadow = true;
    this.group.add(asphalt);
  }

  private buildMarkings() {
    const geometry = new THREE.BoxGeometry(0.018, 0.012, 0.12);
    const material = new THREE.MeshBasicMaterial({ color: COLORS.roadLine });
    const count = Math.floor(ROAD_SAMPLE_COUNT / 9);
    const markings = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();

    for (let index = 0; index < count; index += 1) {
      const sample = this.samples[(index * 9) % ROAD_SAMPLE_COUNT];
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      orientation.makeBasis(right, sample.normal, sample.tangent);
      const position = sample.position
        .clone()
        .addScaledVector(sample.normal, 0.058);
      matrix.copy(orientation).setPosition(position);
      markings.setMatrixAt(index, matrix);
    }

    markings.instanceMatrix.needsUpdate = true;
    markings.name = "road-centre-markings";
    this.group.add(markings);
  }

  private buildRoadsidePosts() {
    const postGeometry = new THREE.BoxGeometry(0.035, 0.13, 0.035);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4dc,
      roughness: 0.85,
    });
    const count = Math.floor(ROAD_SAMPLE_COUNT / 28) * 2;
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, count);
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;

    for (let index = 0; index < ROAD_SAMPLE_COUNT; index += 28) {
      const sample = this.samples[index];
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      orientation.makeBasis(right, sample.normal, sample.tangent);
      for (const side of [-1, 1]) {
        const position = sample.position
          .clone()
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.13))
          .addScaledVector(sample.normal, 0.075);
        matrix.copy(orientation).setPosition(position);
        posts.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }

    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.name = "roadside-posts";
    this.group.add(posts);
  }

  getRoadInfo(normal: THREE.Vector3): RoadInfo {
    let bestIndex = 0;
    let bestDot = -Infinity;

    for (let index = 0; index < this.samples.length; index += 1) {
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
      progress: bestIndex / ROAD_SAMPLE_COUNT,
    };
  }

  dispose() {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
  }
}
