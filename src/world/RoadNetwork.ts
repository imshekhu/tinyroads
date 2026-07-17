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

type RoadRoute = {
  id: "coast" | "highland" | "connector";
  samples: RoadSample[];
  closed: boolean;
  shoulderColor: number;
};

export type RoadInfo = {
  distance: number;
  index: number;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  progress: number;
  route: RoadRoute["id"];
};

export function mainRouteLatitude(theta: number) {
  return (
    Math.sin(theta * 3 + 0.35) * 0.17 +
    Math.sin(theta * 7 - 0.8) * 0.045
  );
}

export function highlandRouteLatitude(theta: number) {
  return 0.47 + Math.sin(theta * 2 - 0.5) * 0.09 + Math.sin(theta * 5) * 0.025;
}

function normalAt(theta: number, latitude: number) {
  return new THREE.Vector3(
    Math.cos(latitude) * Math.cos(theta),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(theta),
  ).normalize();
}

export class RoadNetwork {
  readonly group = new THREE.Group();
  readonly samples: RoadSample[] = [];
  readonly highlandSamples: RoadSample[] = [];
  readonly connectorSamples: RoadSample[] = [];

  private readonly routes: RoadRoute[] = [];
  private readonly allSamples: Array<{ sample: RoadSample; route: RoadRoute }> = [];
  private readonly surfaceRadiusAt: (normal: THREE.Vector3) => number;

  constructor(surfaceRadiusAt: (normal: THREE.Vector3) => number) {
    this.surfaceRadiusAt = surfaceRadiusAt;
    this.group.name = "road-network";
    this.generateNetwork();
    this.buildRoads();
    this.buildMarkings();
    this.buildRoadsidePosts();
    this.buildGuardRails();
  }

  private generateNetwork() {
    this.samples.push(
      ...this.generateRoute(
        ROAD_SAMPLE_COUNT,
        (progress) => {
          const theta = progress * Math.PI * 2;
          return normalAt(theta, mainRouteLatitude(theta));
        },
        true,
      ),
    );

    this.highlandSamples.push(
      ...this.generateRoute(
        380,
        (progress) => {
          const theta = progress * Math.PI * 2;
          return normalAt(theta, highlandRouteLatitude(theta));
        },
        true,
      ),
    );

    const connectorTheta = 0.72;
    const connectorStart = normalAt(
      connectorTheta,
      mainRouteLatitude(connectorTheta),
    );
    const connectorEnd = normalAt(
      connectorTheta,
      highlandRouteLatitude(connectorTheta),
    );
    this.connectorSamples.push(
      ...this.generateRoute(
        96,
        (progress) => {
          const normal = slerpDirection(
            connectorStart,
            connectorEnd,
            progress,
          );
          const sideways = new THREE.Vector3(-normal.z, 0, normal.x).normalize();
          return normal
            .addScaledVector(sideways, Math.sin(progress * Math.PI) * 0.025)
            .normalize();
        },
        false,
      ),
    );

    this.routes.push(
      {
        id: "coast",
        samples: this.samples,
        closed: true,
        shoulderColor: COLORS.roadEdge,
      },
      {
        id: "highland",
        samples: this.highlandSamples,
        closed: true,
        shoulderColor: 0xe87535,
      },
      {
        id: "connector",
        samples: this.connectorSamples,
        closed: false,
        shoulderColor: 0x59c8dd,
      },
    );
    for (const route of this.routes) {
      for (const sample of route.samples) this.allSamples.push({ sample, route });
    }
  }

  private generateRoute(
    count: number,
    normalForProgress: (progress: number) => THREE.Vector3,
    closed: boolean,
  ) {
    const positions: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    for (let index = 0; index < count; index += 1) {
      const progress = closed ? index / count : index / (count - 1);
      const normal = normalForProgress(progress);
      normals.push(normal);
      positions.push(
        normal
          .clone()
          .multiplyScalar(this.surfaceRadiusAt(normal) + 0.038),
      );
    }

    return positions.map((position, index) => {
      const previous = positions[closed ? (index - 1 + count) % count : Math.max(0, index - 1)];
      const next = positions[closed ? (index + 1) % count : Math.min(count - 1, index + 1)];
      const normal = normals[index];
      const difference = next.clone().sub(previous);
      const tangent = difference
        .addScaledVector(normal, -difference.dot(normal))
        .normalize();
      return { normal, position, tangent };
    });
  }

  private makeRibbon(
    samples: RoadSample[],
    closed: boolean,
    width: number,
    lift: number,
    color: number,
  ) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (const sample of samples) {
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

    const segmentCount = closed ? samples.length : samples.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const next = (index + 1) % samples.length;
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
        roughness: 0.88,
        metalness: 0.02,
        flatShading: true,
      }),
    );
  }

  private buildRoads() {
    for (const route of this.routes) {
      const shoulder = this.makeRibbon(
        route.samples,
        route.closed,
        ROAD_WIDTH + 0.15,
        0,
        route.shoulderColor,
      );
      shoulder.receiveShadow = true;
      shoulder.name = `${route.id}-shoulder`;

      const asphalt = this.makeRibbon(
        route.samples,
        route.closed,
        ROAD_WIDTH,
        0.009,
        COLORS.road,
      );
      asphalt.receiveShadow = true;
      asphalt.name = `${route.id}-asphalt`;
      this.group.add(shoulder, asphalt);
    }
  }

  private buildMarkings() {
    const geometry = new THREE.BoxGeometry(0.018, 0.012, 0.11);
    for (const route of this.routes) {
      const stride = route.id === "connector" ? 5 : 9;
      const count = Math.floor(route.samples.length / stride);
      const material = new THREE.MeshBasicMaterial({
        color: route.id === "highland" ? 0xfff0d5 : COLORS.roadLine,
      });
      const markings = new THREE.InstancedMesh(geometry, material, count);
      const matrix = new THREE.Matrix4();
      const orientation = new THREE.Matrix4();
      for (let index = 0; index < count; index += 1) {
        const sample = route.samples[index * stride];
        const right = new THREE.Vector3()
          .crossVectors(sample.normal, sample.tangent)
          .normalize();
        orientation.makeBasis(right, sample.normal, sample.tangent);
        matrix
          .copy(orientation)
          .setPosition(
            sample.position.clone().addScaledVector(sample.normal, 0.059),
          );
        markings.setMatrixAt(index, matrix);
      }
      markings.instanceMatrix.needsUpdate = true;
      markings.name = `${route.id}-markings`;
      this.group.add(markings);
    }
  }

  private buildRoadsidePosts() {
    const geometry = new THREE.BoxGeometry(0.03, 0.12, 0.03);
    const material = new THREE.MeshStandardMaterial({
      color: 0xfff4dc,
      roughness: 0.85,
    });
    const routes = this.routes.filter((route) => route.id !== "connector");
    const count = routes.reduce(
      (total, route) => total + Math.ceil(route.samples.length / 30) * 2,
      0,
    );
    const posts = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;

    for (const route of routes) {
      for (let index = 0; index < route.samples.length; index += 30) {
        const sample = route.samples[index];
        const right = new THREE.Vector3()
          .crossVectors(sample.normal, sample.tangent)
          .normalize();
        orientation.makeBasis(right, sample.normal, sample.tangent);
        for (const side of [-1, 1]) {
          const position = sample.position
            .clone()
            .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.12))
            .addScaledVector(sample.normal, 0.07);
          matrix.copy(orientation).setPosition(position);
          posts.setMatrixAt(instance, matrix);
          instance += 1;
        }
      }
    }
    posts.count = instance;
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    this.group.add(posts);
  }

  private buildGuardRails() {
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5efe2,
      metalness: 0.35,
      roughness: 0.38,
    });
    const railGeometry = new THREE.BoxGeometry(0.025, 0.035, 0.16);
    const railSamples = [
      ...this.highlandSamples.filter((_, index) => index % 4 === 0),
      ...this.connectorSamples.filter((_, index) => index % 3 === 0),
    ];
    const rails = new THREE.InstancedMesh(
      railGeometry,
      railMaterial,
      railSamples.length * 2,
    );
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Matrix4();
    let instance = 0;
    for (const sample of railSamples) {
      const right = new THREE.Vector3()
        .crossVectors(sample.normal, sample.tangent)
        .normalize();
      orientation.makeBasis(right, sample.normal, sample.tangent);
      for (const side of [-1, 1]) {
        const position = sample.position
          .clone()
          .addScaledVector(right, side * (ROAD_WIDTH * 0.5 + 0.065))
          .addScaledVector(sample.normal, 0.095);
        matrix.copy(orientation).setPosition(position);
        rails.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    rails.instanceMatrix.needsUpdate = true;
    rails.castShadow = true;
    rails.name = "arcade-guard-rails";
    this.group.add(rails);
  }

  getRoadInfo(normal: THREE.Vector3): RoadInfo {
    let closest = this.allSamples[0];
    let bestDot = -Infinity;
    for (const candidate of this.allSamples) {
      const dot = normal.dot(candidate.sample.normal);
      if (dot > bestDot) {
        bestDot = dot;
        closest = candidate;
      }
    }

    let mainIndex = 0;
    let mainDot = -Infinity;
    for (let index = 0; index < this.samples.length; index += 1) {
      const dot = normal.dot(this.samples[index].normal);
      if (dot > mainDot) {
        mainDot = dot;
        mainIndex = index;
      }
    }

    const routeIndex = closest.route.samples.indexOf(closest.sample);
    return {
      distance: angularDistance(normal, closest.sample.normal) * PLANET_RADIUS,
      index: mainIndex,
      tangent: closest.sample.tangent,
      normal: closest.sample.normal,
      progress: routeIndex / Math.max(1, closest.route.samples.length - 1),
      route: closest.route.id,
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
