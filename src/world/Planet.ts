import * as THREE from "three";
import {
  COLORS,
  OCEAN_LEVEL,
  PLANET_RADIUS,
  ROAD_CLEARANCE,
  ROAD_WIDTH,
} from "../config";
import { orientationFromFrame, tangentNorth } from "../math/SphericalMath";
import { latitudeFromKeys } from "./circuitPath";
import { fbm3D, SeededRandom } from "./Noise";
import { RoadNetwork } from "./RoadNetwork";
import { TRACK_CATALOG, type TrackDefinition } from "./tracks/catalog";
import { WorldScenery } from "./WorldScenery";

export class Planet {
  readonly group = new THREE.Group();
  readonly road: RoadNetwork;
  readonly oceanMaterial: THREE.MeshPhongMaterial;
  readonly scenery: WorldScenery;

  private terrain: THREE.Mesh;
  private ocean: THREE.Mesh;
  private terrainPositions: THREE.BufferAttribute | null = null;
  private readonly terrainTriangles: number[] = [];
  private readonly terrainBins = new Map<number, number[]>();
  private readonly groundRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  private readonly groundA = new THREE.Vector3();
  private readonly groundB = new THREE.Vector3();
  private readonly groundC = new THREE.Vector3();
  private readonly groundHit = new THREE.Vector3();
  private readonly oceanDay = new THREE.Color(COLORS.oceanDay);
  private readonly oceanNight = new THREE.Color(COLORS.oceanNight);
  readonly seed: number;

  constructor(seed = 7319) {
    this.seed = seed;
    this.group.name = "tiny-planet";
    this.terrain = this.buildTerrain();
    this.ocean = this.buildOcean();
    this.oceanMaterial = this.ocean.material as THREE.MeshPhongMaterial;
    this.group.add(this.terrain, this.ocean);

    this.road = new RoadNetwork(
      (normal) => this.surfaceRadiusAt(normal),
      TRACK_CATALOG[0],
      { fullDecor: true },
    );
    this.group.add(this.road.group);

    this.buildTrees();
    this.buildRocks();
    this.buildMountainRanges();
    this.buildVillages();
    this.scenery = new WorldScenery(this);
    this.group.add(this.scenery.group);
  }

  get activeTrack(): TrackDefinition {
    return this.road.definition;
  }

  nearestRoadDistance(normal: THREE.Vector3) {
    return this.road.getRoadInfo(normal).distance;
  }

  terrainHeight(normal: THREE.Vector3) {
    const n = normal;
    const theta = Math.atan2(n.z, n.x);
    const definition = TRACK_CATALOG[0];
    const progress =
      (((theta - definition.phase) / (Math.PI * 2)) % 1 + 1) % 1;
    const routeLat = latitudeFromKeys(definition.keys, progress);
    const routeDistance = Math.abs(n.y - Math.sin(routeLat));
    const roadContinent = Math.max(0, 1 - routeDistance / 0.28) * 0.3;
    const broad = fbm3D(n.x * 1.45, n.y * 1.45, n.z * 1.45, this.seed, 4);
    const detail = fbm3D(n.x * 4.8, n.y * 4.8, n.z * 4.8, this.seed + 91, 3);
    const mountain = Math.max(
      0,
      fbm3D(n.x * 2.4, n.y * 2.4, n.z * 2.4, this.seed + 341, 4) - 0.24,
    );
    return (
      -0.07 -
      Math.abs(n.y) * 0.08 +
      roadContinent +
      broad * 0.15 +
      detail * 0.03 +
      mountain * 0.28
    );
  }

  surfaceRadiusAt(normal: THREE.Vector3) {
    return PLANET_RADIUS + this.terrainHeight(normal);
  }

  /**
   * Exact radial intersection with the rendered terrain triangles. Props use
   * this instead of the smooth height function so their bases cannot float
   * above the faceted low-poly mesh.
   */
  terrainSurfaceRadiusAt(normal: THREE.Vector3) {
    const positions = this.terrainPositions;
    if (!positions) return this.surfaceRadiusAt(normal);
    const theta = (Math.atan2(normal.z, normal.x) + Math.PI * 2) % (Math.PI * 2);
    const thetaBin = Math.floor((theta / (Math.PI * 2)) * 256) % 256;
    const yBin = THREE.MathUtils.clamp(Math.floor(((normal.y + 1) * 0.5) * 128), 0, 127);
    const candidates = new Set<number>();
    for (let dy = -4; dy <= 4; dy += 1) {
      const by = yBin + dy;
      if (by < 0 || by >= 128) continue;
      for (let dx = -4; dx <= 4; dx += 1) {
        const bx = (thetaBin + dx + 256) % 256;
        for (const triangle of this.terrainBins.get(by * 256 + bx) ?? []) {
          candidates.add(triangle);
        }
      }
    }
    this.groundRay.direction.copy(normal).normalize();
    let radius = -Infinity;
    for (const triangle of candidates) {
      const offset = triangle * 3;
      this.groundA.fromBufferAttribute(
        positions,
        this.terrainTriangles[offset]!,
      );
      this.groundB.fromBufferAttribute(
        positions,
        this.terrainTriangles[offset + 1]!,
      );
      this.groundC.fromBufferAttribute(
        positions,
        this.terrainTriangles[offset + 2]!,
      );
      const hit = this.groundRay.intersectTriangle(
        this.groundA,
        this.groundB,
        this.groundC,
        false,
        this.groundHit,
      );
      if (hit) radius = Math.max(radius, hit.length());
    }
    return Number.isFinite(radius) ? radius : this.surfaceRadiusAt(normal);
  }

  private buildTerrain() {
    const geometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, 6);
    const positions = geometry.getAttribute("position");
    const colors: number[] = [];
    const normal = new THREE.Vector3();
    const low = new THREE.Color(COLORS.grassLow);
    const high = new THREE.Color(COLORS.grassHigh);
    const beach = new THREE.Color(0xdac88f);
    const rock = new THREE.Color(0x8b8a7d);
    const color = new THREE.Color();

    for (let index = 0; index < positions.count; index += 1) {
      normal
        .set(positions.getX(index), positions.getY(index), positions.getZ(index))
        .normalize();
      const height = this.terrainHeight(normal);
      positions.setXYZ(
        index,
        normal.x * (PLANET_RADIUS + height),
        normal.y * (PLANET_RADIUS + height),
        normal.z * (PLANET_RADIUS + height),
      );
      if (height < OCEAN_LEVEL + 0.03) color.copy(beach);
      else if (height > 0.28) color.copy(rock);
      else color.lerpColors(low, high, Math.min(1, (height + 0.05) / 0.35));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.buildTerrainSurfaceIndex(geometry);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "terrain";
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildTerrainSurfaceIndex(geometry: THREE.BufferGeometry) {
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const index = geometry.getIndex();
    const triangleCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(positions.count / 3);
    this.terrainPositions = positions;
    const register = (triangle: number, normal: THREE.Vector3) => {
      const theta =
        (Math.atan2(normal.z, normal.x) + Math.PI * 2) % (Math.PI * 2);
      const bx = Math.floor((theta / (Math.PI * 2)) * 256) % 256;
      const by = THREE.MathUtils.clamp(
        Math.floor(((normal.y + 1) * 0.5) * 128),
        0,
        127,
      );
      const key = by * 256 + bx;
      const bin = this.terrainBins.get(key) ?? [];
      if (!bin.includes(triangle)) bin.push(triangle);
      this.terrainBins.set(key, bin);
    };
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = index ? index.getX(triangle * 3) : triangle * 3;
      const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      this.terrainTriangles.push(a, b, c);
      this.groundA.fromBufferAttribute(positions, a).normalize();
      this.groundB.fromBufferAttribute(positions, b).normalize();
      this.groundC.fromBufferAttribute(positions, c).normalize();
      register(triangle, this.groundA);
      register(triangle, this.groundB);
      register(triangle, this.groundC);
      register(
        triangle,
        this.groundA.clone().add(this.groundB).add(this.groundC).normalize(),
      );
    }
  }

  private buildOcean() {
    const geometry = new THREE.IcosahedronGeometry(
      PLANET_RADIUS + OCEAN_LEVEL,
      4,
    );
    const material = new THREE.MeshPhongMaterial({
      color: COLORS.oceanDay,
      transparent: true,
      opacity: 0.82,
      shininess: 55,
      emissive: COLORS.oceanDay,
      emissiveIntensity: 0.08,
    });
    const ocean = new THREE.Mesh(geometry, material);
    ocean.name = "ocean";
    ocean.receiveShadow = true;
    return ocean;
  }

  private randomLandNormal(
    random: SeededRandom,
    avoidRoad = true,
  ): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const y = random.range(-0.78, 0.78);
      const theta = random.range(0, Math.PI * 2);
      const radial = Math.sqrt(1 - y * y);
      const normal = new THREE.Vector3(
        Math.cos(theta) * radial,
        y,
        Math.sin(theta) * radial,
      );
      if (this.terrainHeight(normal) < OCEAN_LEVEL + 0.055) continue;
      if (avoidRoad && this.nearestRoadDistance(normal) < ROAD_CLEARANCE) {
        continue;
      }
      return normal;
    }
    return null;
  }

  private instanceTransform(
    normal: THREE.Vector3,
    scale: number,
    yaw: number,
    extraHeight = 0,
  ) {
    const forward = tangentNorth(normal);
    forward.applyAxisAngle(normal, yaw);
    const quaternion = orientationFromFrame(normal, forward);
    const position = normal
      .clone()
      .multiplyScalar(this.terrainSurfaceRadiusAt(normal) + extraHeight);
    return new THREE.Matrix4().compose(
      position,
      quaternion,
      new THREE.Vector3(scale, scale, scale),
    );
  }

  private buildTrees() {
    const random = new SeededRandom(this.seed + 100);
    const count = 1600;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.14, 5),
      new THREE.MeshStandardMaterial({
        color: 0x765338,
        roughness: 1,
        flatShading: true,
      }),
      count,
    );
    const crown = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.105, 0.28, 7),
      new THREE.MeshStandardMaterial({
        color: 0x356f49,
        roughness: 1,
        flatShading: true,
      }),
      count,
    );
    trunk.name = "grounded-tree-trunks";
    crown.name = "grounded-tree-crowns";
    const upOffset = new THREE.Matrix4();
    let placed = 0;
    while (placed < count) {
      const normal = this.randomLandNormal(random);
      if (!normal) break;
      const scale = random.range(0.75, 1.45);
      const base = this.instanceTransform(normal, scale, random.range(0, 6.28));
      trunk.setMatrixAt(
        placed,
        upOffset.makeTranslation(0, 0.07, 0).premultiply(base),
      );
      crown.setMatrixAt(
        placed,
        upOffset.makeTranslation(0, 0.25, 0).premultiply(base),
      );
      placed += 1;
    }
    trunk.count = placed;
    crown.count = placed;
    trunk.instanceMatrix.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
    trunk.castShadow = true;
    crown.castShadow = true;
    this.group.add(trunk, crown);
  }

  private buildRocks() {
    const random = new SeededRandom(this.seed + 220);
    const count = 220;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.085, 0),
      new THREE.MeshStandardMaterial({
        color: COLORS.stone,
        roughness: 1,
        flatShading: true,
      }),
      count,
    );
    rocks.name = "grounded-rocks";
    let placed = 0;
    while (placed < count) {
      const normal = this.randomLandNormal(random);
      if (!normal) break;
      rocks.setMatrixAt(
        placed,
        this.instanceTransform(
          normal,
          random.range(0.45, 1.4),
          random.range(0, 6.28),
          0.025,
        ),
      );
      placed += 1;
    }
    rocks.count = placed;
    rocks.instanceMatrix.needsUpdate = true;
    rocks.castShadow = true;
    this.group.add(rocks);
  }

  private buildMountainRanges() {
    const random = new SeededRandom(this.seed + 275);
    const count = 150;
    const peakGeometry = new THREE.ConeGeometry(0.34, 1.15, 7);
    // A buried skirt keeps the broad base inside adjacent low-poly facets.
    peakGeometry.translate(0, 0.44, 0);
    const peaks = new THREE.InstancedMesh(
      peakGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x777b78,
        roughness: 1,
        flatShading: true,
      }),
      count,
    );
    const snowGeometry = new THREE.ConeGeometry(0.19, 0.32, 7);
    snowGeometry.translate(0, 0.16, 0);
    const snow = new THREE.InstancedMesh(
      snowGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xe8edf0,
        roughness: 0.9,
        flatShading: true,
      }),
      count,
    );
    peaks.name = "mountain-peaks";
    snow.name = "mountain-snowcaps";
    const matrix = new THREE.Matrix4();
    const snowMatrix = new THREE.Matrix4();
    const snowOffset = new THREE.Matrix4();
    let placed = 0;
    for (let attempt = 0; attempt < count * 35 && placed < count; attempt += 1) {
      const normal = this.randomLandNormal(random);
      if (!normal || Math.abs(normal.y) < 0.28) continue;
      if (this.nearestRoadDistance(normal) < ROAD_CLEARANCE + 1.1) continue;
      const forward = tangentNorth(normal).applyAxisAngle(
        normal,
        random.range(0, Math.PI * 2),
      );
      const scale = random.range(0.7, 1.75);
      const heightScale = random.range(0.85, 1.8) * scale;
      const position = normal
        .clone()
        .multiplyScalar(this.terrainSurfaceRadiusAt(normal));
      matrix.compose(
        position,
        orientationFromFrame(normal, forward),
        new THREE.Vector3(scale, heightScale, scale),
      );
      peaks.setMatrixAt(placed, matrix);
      snowOffset.makeTranslation(0, 0.62, 0);
      snowMatrix.copy(snowOffset).premultiply(matrix);
      snow.setMatrixAt(placed, snowMatrix);
      placed += 1;
    }
    peaks.count = placed;
    snow.count = placed;
    peaks.instanceMatrix.needsUpdate = true;
    snow.instanceMatrix.needsUpdate = true;
    peaks.castShadow = true;
    snow.castShadow = true;
    this.group.add(peaks, snow);
  }

  private buildVillages() {
    const random = new SeededRandom(this.seed + 330);
    const houseGeometry = new THREE.BoxGeometry(0.19, 0.15, 0.16);
    const roofGeometry = new THREE.ConeGeometry(0.145, 0.11, 4);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe5b4,
      roughness: 0.9,
    });
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0xc95d4c,
      roughness: 0.95,
      flatShading: true,
    });

    // Sit villages well outside every ribbon — never on asphalt or kerbs.
    for (let village = 0; village < 10; village += 1) {
      const routeIndex =
        (80 + village * Math.floor(this.road.samples.length / 10)) %
        this.road.samples.length;
      const route = this.road.samples[routeIndex]!;
      const side = new THREE.Vector3()
        .crossVectors(route.normal, route.tangent)
        .normalize()
        .multiplyScalar(village % 2 === 0 ? 1 : -1);
      const baseOffset = (ROAD_WIDTH * 0.5 + 1.6) / PLANET_RADIUS;

      for (let house = 0; house < 4; house += 1) {
        const normal = route.normal
          .clone()
          .addScaledVector(side, baseOffset + house * 0.012)
          .addScaledVector(route.tangent, (house - 1.5) * 0.02)
          .normalize();
        if (this.nearestRoadDistance(normal) < ROAD_CLEARANCE) continue;
        const forward = route.tangent
          .clone()
          .addScaledVector(normal, -route.tangent.dot(normal))
          .normalize();
        const quaternion = orientationFromFrame(normal, forward);
        const houseScale = random.range(0.82, 1.1);
        const basePosition = normal
          .clone()
          .multiplyScalar(
            this.terrainSurfaceRadiusAt(normal) + 0.075 * houseScale,
          );
        const houseMesh = new THREE.Mesh(houseGeometry, wallMaterial);
        houseMesh.position.copy(basePosition);
        houseMesh.quaternion.copy(quaternion);
        houseMesh.scale.setScalar(houseScale);
        houseMesh.castShadow = true;
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position
          .copy(basePosition)
          .addScaledVector(normal, 0.125 * houseMesh.scale.y);
        roof.quaternion.copy(quaternion);
        roof.rotateY(Math.PI / 4);
        roof.scale.setScalar(houseMesh.scale.x);
        roof.castShadow = true;
        this.group.add(houseMesh, roof);
      }
    }
  }

  update(elapsed: number, daylight = 1) {
    const night = 1 - THREE.MathUtils.clamp(daylight, 0, 1);
    this.oceanMaterial.color
      .copy(this.oceanNight)
      .lerp(this.oceanDay, daylight);
    this.oceanMaterial.emissive.copy(this.oceanNight).lerp(this.oceanDay, daylight);
    this.oceanMaterial.emissiveIntensity =
      0.07 + night * 0.09 + Math.sin(elapsed * 0.4) * 0.02;
    this.road.updateLighting(daylight, elapsed);
    this.scenery.update(elapsed, daylight);
  }

  dispose() {
    this.road.dispose();
    this.scenery.dispose();
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
