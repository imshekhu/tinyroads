import * as THREE from "three";
import {
  COLORS,
  PLANET_RADIUS,
  ROAD_LANES,
  ROAD_SAMPLE_COUNT,
  ROAD_WIDTH,
} from "../config";
import {
  angularDistance,
  orientationFromFrame,
  slerpDirection,
} from "../math/SphericalMath";
import {
  CIRCUIT_SECTORS,
  elevationFromKeys,
  inSector,
  latitudeFromKeys,
} from "./circuitPath";
import type { TrackDefinition } from "./tracks/catalog";
import { TRACK_CATALOG } from "./tracks/catalog";

export type RoadSample = {
  normal: THREE.Vector3;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  progress: number;
  elevation: number;
};

export type RoadInfo = {
  distance: number;
  index: number;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
  elevation: number;
  route: "coast";
};

/** Terrain helper for the default / active temple-style bias. */
export function mainRouteLatitude(theta: number) {
  const track = TRACK_CATALOG[0];
  const progress = ((theta - track.phase) / (Math.PI * 2) + 10) % 1;
  return latitudeFromKeys(track.keys, progress);
}

export class RoadNetwork {
  readonly group = new THREE.Group();
  readonly samples: RoadSample[] = [];
  readonly lapLength: number;
  readonly definition: TrackDefinition;

  private readonly surfaceRadiusAt: (normal: THREE.Vector3) => number;

  constructor(
    surfaceRadiusAt: (normal: THREE.Vector3) => number,
    definition: TrackDefinition = TRACK_CATALOG[0],
    options: { fullDecor?: boolean } = {},
  ) {
    this.surfaceRadiusAt = surfaceRadiusAt;
    this.definition = definition;
    const fullDecor = options.fullDecor ?? true;
    this.group.name = `circuit-${definition.id}`;
    this.generateSamples();
    this.lapLength = this.measureLap();
    this.buildRoad();
    this.buildGradeStructures();
    if (fullDecor) {
      this.buildLaneMarkings();
      this.buildChicaneKerbs();
      this.buildContainmentBarriers();
    } else {
      this.buildLaneMarkings(true);
    }
  }

  private generateSamples() {
    const count = ROAD_SAMPLE_COUNT;
    const positions: THREE.Vector3[] = [];
    const progresses: number[] = [];
    const elevations: number[] = [];
    const normals: THREE.Vector3[] = [];
    for (let index = 0; index < count; index += 1) {
      const progress = index / count;
      const theta = progress * Math.PI * 2 + this.definition.phase;
      const latitude = latitudeFromKeys(this.definition.keys, progress);
      const elevation = elevationFromKeys(this.definition.keys, progress);
      const normal = new THREE.Vector3(
        Math.cos(latitude) * Math.cos(theta),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(theta),
      ).normalize();
      normals.push(normal);
      elevations.push(elevation);
      positions.push(
        normal
          .clone()
          .multiplyScalar(this.surfaceRadiusAt(normal) + 0.04 + elevation),
      );
      progresses.push(progress);
    }

    for (let index = 0; index < count; index += 1) {
      const previous = positions[(index - 1 + count) % count];
      const next = positions[(index + 1) % count];
      const normal = normals[index];
      const difference = next.clone().sub(previous);
      const tangent = difference
        .addScaledVector(normal, -difference.dot(normal))
        .normalize();
      this.samples.push({
        normal,
        position: positions[index],
        tangent,
        progress: progresses[index],
        elevation: elevations[index],
      });
    }
  }

  private buildGradeStructures() {
    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.85,
      metalness: 0.15,
    });
    const portalMat = new THREE.MeshStandardMaterial({
      color: 0xf6c945,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      roughness: 0.7,
      metalness: 0.2,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.55,
      roughness: 0.35,
    });

    let previousTunnel = false;
    for (let index = 0; index < this.samples.length; index += 4) {
      const sample = this.samples[index]!;
      if (sample.elevation < -0.28) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ROAD_WIDTH * 0.62, 0.07, 6, 18),
          tunnelMat,
        );
        ring.position.copy(sample.position);
        ring.quaternion.copy(
          orientationFromFrame(sample.normal, sample.tangent),
        );
        ring.rotateY(Math.PI / 2);
        this.group.add(ring);
        if (!previousTunnel) {
          const portal = new THREE.Mesh(
            new THREE.TorusGeometry(ROAD_WIDTH * 0.68, 0.05, 6, 20),
            portalMat,
          );
          portal.position.copy(sample.position);
          portal.quaternion.copy(
            orientationFromFrame(sample.normal, sample.tangent),
          );
          portal.rotateY(Math.PI / 2);
          this.group.add(portal);
        }
        previousTunnel = true;
      } else {
        previousTunnel = false;
      }

      if (sample.elevation > 0.28) {
        const pillarHeight = Math.max(0.25, sample.elevation + 0.08);
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.09, pillarHeight, 6),
          pillarMat,
        );
        const ground = sample.normal
          .clone()
          .multiplyScalar(this.surfaceRadiusAt(sample.normal) + 0.02);
        pillar.position
          .copy(ground)
          .addScaledVector(sample.normal, pillarHeight * 0.5);
        pillar.quaternion.copy(
          orientationFromFrame(sample.normal, sample.tangent),
        );
        this.group.add(pillar);

        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.08, 0.5),
            railMat,
          );
          const right = new THREE.Vector3()
            .crossVectors(sample.normal, sample.tangent)
            .normalize();
          rail.position
            .copy(sample.position)
            .addScaledVector(sample.normal, 0.12)
            .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.1));
          rail.quaternion.copy(
            orientationFromFrame(sample.normal, sample.tangent),
          );
          this.group.add(rail);
        }
      }
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
      ROAD_WIDTH + 0.38,
      0,
      this.definition.shoulder,
    );
    shoulder.name = "circuit-safety-shoulder";
    shoulder.receiveShadow = true;
    const asphalt = this.makeRibbon(ROAD_WIDTH, 0.012, this.definition.asphalt);
    asphalt.name = "eight-lane-asphalt";
    asphalt.receiveShadow = true;
    this.group.add(shoulder, asphalt);
  }

  private buildLaneMarkings(sparse = false) {
    const laneWidth = ROAD_WIDTH / ROAD_LANES;
    const stride = sparse ? 14 : 8;
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
        if (isCenter) centerLine.setMatrixAt(centerInstance++, matrix);
        else markings.setMatrixAt(instance++, matrix);
      }
    }
    markings.count = instance;
    centerLine.count = centerInstance;
    markings.instanceMatrix.needsUpdate = true;
    centerLine.instanceMatrix.needsUpdate = true;
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
    const geometry = new THREE.BoxGeometry(0.045, 0.016, 0.1);
    const candidates = this.samples.filter(
      (sample, index) =>
        index % 3 === 0 &&
        sectors.some((sector) => inSector(sample.progress, sector)),
    );
    const kerbs = new THREE.InstancedMesh(geometry, red, candidates.length * 2);
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
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.08))
          .addScaledVector(sample.normal, 0.05);
        matrix.copy(orientation).setPosition(position);
        if (index % 2 === 0) kerbs.setMatrixAt(redCount++, matrix);
        else whiteKerbs.setMatrixAt(whiteCount++, matrix);
      }
    });
    kerbs.count = redCount;
    whiteKerbs.count = whiteCount;
    kerbs.instanceMatrix.needsUpdate = true;
    whiteKerbs.instanceMatrix.needsUpdate = true;
    this.group.add(kerbs, whiteKerbs);
  }

  private buildContainmentBarriers() {
    const stride = 3;
    const segmentCount = Math.ceil(this.samples.length / stride);
    const barrierGeometry = new THREE.BoxGeometry(0.045, 0.12, 0.22);
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
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.16))
          .addScaledVector(sample.normal, 0.1);
        matrix.copy(orientation).setPosition(position);
        barriers.setMatrixAt(instance++, matrix);
      }
    }
    barriers.count = instance;
    barriers.instanceMatrix.needsUpdate = true;
    barriers.castShadow = true;
    this.group.add(barriers);
  }

  getRoadInfo(normal: THREE.Vector3): RoadInfo {
    let theta = Math.atan2(normal.z, normal.x) - this.definition.phase;
    if (theta < 0) theta += Math.PI * 2;
    const estimatedIndex = Math.round(
      (theta / (Math.PI * 2)) * this.samples.length,
    );
    let bestIndex = estimatedIndex % this.samples.length;
    let bestDot = -Infinity;
    for (let offset = -22; offset <= 22; offset += 1) {
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
      elevation: sample.elevation,
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

  setActiveVisual(active: boolean) {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if ("opacity" in material && "transparent" in material) {
          material.transparent = !active;
          material.opacity = active ? 1 : 0.28;
          if ("depthWrite" in material) material.depthWrite = active;
        }
        if (object.name === "eight-lane-asphalt" && "emissiveIntensity" in material) {
          const std = material as THREE.MeshStandardMaterial;
          std.emissive = new THREE.Color(active ? 0x1a3040 : 0x000000);
          std.emissiveIntensity = active ? 0.22 : 0;
        }
      }
    });
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
