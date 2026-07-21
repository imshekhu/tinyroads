import * as THREE from "three";
import { OCEAN_LEVEL, PLANET_RADIUS, ROAD_CLEARANCE } from "../config";
import { orientationFromFrame, tangentNorth } from "../math/SphericalMath";
import type { Planet } from "./Planet";
import { SeededRandom } from "./Noise";

type BobbingProp = {
  object: THREE.Object3D;
  normal: THREE.Vector3;
  radius: number;
  phase: number;
  amplitude: number;
};

/**
 * Landmark districts around the planet — port, city, beach, airport, farms,
 * lighthouse, and wind belt. Placed with hard road clearance so nothing sits
 * on the racing line.
 */
export class WorldScenery {
  readonly group = new THREE.Group();
  private readonly planet: Planet;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly lighthouseLamps: THREE.MeshStandardMaterial;
  private readonly windRotors: THREE.Group[] = [];
  private readonly bobbingProps: BobbingProp[] = [];

  constructor(planet: Planet) {
    this.planet = planet;
    this.group.name = "world-scenery";
    this.lighthouseLamps = this.standardMaterial("lighthouse-lamp", {
      color: 0xfff1a8,
      emissive: 0xffb000,
      emissiveIntensity: 1.2,
      roughness: 0.25,
    });
    const random = new SeededRandom(planet.seed + 900);
    this.buildPort(random);
    this.buildCity(random);
    this.buildBeach(random);
    this.buildAirport(random);
    this.buildCountryside(random);
    this.buildLighthouse(random);
    this.buildWindFarm(random);
    this.buildGroundedStructures(random);
    this.buildWaterActivity(random);
  }

  private geometry(
    key: string,
    factory: () => THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = factory();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private standardMaterial(
    key: string,
    parameters: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial {
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial(parameters);
      this.materials.set(key, material);
    }
    return material as THREE.MeshStandardMaterial;
  }

  private basicMaterial(
    key: string,
    parameters: THREE.MeshBasicMaterialParameters,
  ): THREE.MeshBasicMaterial {
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial(parameters);
      this.materials.set(key, material);
    }
    return material as THREE.MeshBasicMaterial;
  }

  private mesh(
    geometryKey: string,
    geometryFactory: () => THREE.BufferGeometry,
    material: THREE.Material,
  ) {
    return new THREE.Mesh(this.geometry(geometryKey, geometryFactory), material);
  }

  private unitBox(material: THREE.Material) {
    return this.mesh(
      "unit-box",
      () => new THREE.BoxGeometry(1, 1, 1),
      material,
    );
  }

  private normalAt(theta: number, y: number) {
    const clampedY = THREE.MathUtils.clamp(y, -0.98, 0.98);
    const radial = Math.sqrt(Math.max(0, 1 - clampedY * clampedY));
    return new THREE.Vector3(
      Math.cos(theta) * radial,
      clampedY,
      Math.sin(theta) * radial,
    ).normalize();
  }

  private placeNormal(
    theta: number,
    y: number,
    minClearance = ROAD_CLEARANCE,
  ): THREE.Vector3 | null {
    const normal = this.normalAt(theta, y);
    if (this.planet.terrainHeight(normal) < 0.04) return null;
    if (this.planet.nearestRoadDistance(normal) < minClearance) return null;
    return normal;
  }

  /**
   * Retains the authored location when possible, but searches a small,
   * deterministic spiral if terrain or the selected circuit occupies it.
   */
  private findLandNormal(
    theta: number,
    y: number,
    minClearance = ROAD_CLEARANCE,
  ): THREE.Vector3 | null {
    const authored = this.placeNormal(theta, y, minClearance);
    if (authored) return authored;
    for (let ring = 1; ring <= 10; ring += 1) {
      const spread = ring * 0.035;
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = (spoke * Math.PI) / 4;
        const candidate = this.placeNormal(
          theta + Math.cos(angle) * spread,
          y + Math.sin(angle) * spread,
          minClearance,
        );
        if (candidate) return candidate;
      }
    }
    return null;
  }

  private findOceanNormal(theta: number, y: number) {
    for (let ring = 0; ring <= 12; ring += 1) {
      const spread = ring * 0.045;
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = (spoke * Math.PI) / 4;
        const normal = this.normalAt(
          theta + Math.cos(angle) * spread,
          y + Math.sin(angle) * spread,
        );
        if (this.planet.terrainHeight(normal) < OCEAN_LEVEL - 0.008) {
          return normal;
        }
      }
    }
    return this.normalAt(theta, y);
  }

  private attach(
    object: THREE.Object3D,
    normal: THREE.Vector3,
    height: number,
    yaw = 0,
  ) {
    const forward = tangentNorth(normal).applyAxisAngle(normal, yaw);
    object.position.copy(normal).multiplyScalar(
      this.planet.terrainSurfaceRadiusAt(normal) + height,
    );
    object.quaternion.copy(orientationFromFrame(normal, forward));
    this.group.add(object);
  }

  private attachOcean(
    object: THREE.Object3D,
    normal: THREE.Vector3,
    height: number,
    yaw = 0,
    bob?: { phase: number; amplitude: number },
  ) {
    const oceanNormal = normal.clone().normalize();
    const radius = PLANET_RADIUS + OCEAN_LEVEL + height;
    const forward = tangentNorth(oceanNormal).applyAxisAngle(oceanNormal, yaw);
    object.position.copy(oceanNormal).multiplyScalar(radius);
    object.quaternion.copy(orientationFromFrame(oceanNormal, forward));
    this.group.add(object);
    if (bob) {
      this.bobbingProps.push({
        object,
        normal: oceanNormal,
        radius,
        phase: bob.phase,
        amplitude: bob.amplitude,
      });
    }
  }

  /** A deep skirt hides gaps where a broad prop crosses faceted triangles. */
  private addFoundation(
    group: THREE.Group,
    width: number,
    depth: number,
    color = 0x756f65,
    height = 0.18,
  ) {
    const foundation = this.unitBox(
      this.standardMaterial(`foundation-${color}`, {
        color,
        roughness: 0.96,
        flatShading: true,
      }),
    );
    foundation.scale.set(width, height, depth);
    foundation.position.y = -height * 0.35;
    group.add(foundation);
  }

  private addBuilding(
    group: THREE.Group,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    material: THREE.Material,
    roof = false,
  ) {
    const building = this.unitBox(material);
    building.scale.set(width, height, depth);
    building.position.set(x, height * 0.5, z);
    group.add(building);
    if (roof) {
      const roofMesh = this.mesh(
        "roof-4",
        () => new THREE.ConeGeometry(0.5, 0.35, 4),
        this.standardMaterial("roof-slate", {
          color: 0x4b5563,
          roughness: 0.9,
          flatShading: true,
        }),
      );
      roofMesh.scale.set(width * 1.35, 1, depth * 1.35);
      roofMesh.position.set(x, height + 0.12, z);
      roofMesh.rotation.y = Math.PI / 4;
      group.add(roofMesh);
    }
  }

  private buildPort(random: SeededRandom) {
    const dock = new THREE.Group();
    dock.name = "cargo-port";
    this.addFoundation(dock, 2.65, 1.35, 0x68645d, 0.24);
    const wood = this.standardMaterial("dock-wood", {
      color: 0x8b6a45,
      roughness: 0.9,
    });
    const plank = this.unitBox(wood);
    plank.scale.set(2.5, 0.08, 0.62);
    plank.position.set(0, 0.04, 0.3);
    dock.add(plank);
    const pierMaterial = this.standardMaterial("pier-dark", {
      color: 0x5f4935,
      roughness: 1,
    });
    for (let i = 0; i < 3; i += 1) {
      const finger = this.unitBox(wood);
      finger.scale.set(0.2, 0.08, 1.35);
      finger.position.set(-0.85 + i * 0.85, 0.03, 0.75);
      dock.add(finger);
      for (const z of [0.25, 1.2]) {
        const piling = this.mesh(
          "port-piling",
          () => new THREE.CylinderGeometry(0.035, 0.045, 0.45, 6),
          pierMaterial,
        );
        piling.position.set(-0.85 + i * 0.85, -0.08, z);
        dock.add(piling);
      }
    }

    const craneOrange = this.standardMaterial("crane-orange", {
      color: 0xe85d04,
      metalness: 0.4,
      roughness: 0.55,
    });
    const craneYellow = this.standardMaterial("crane-yellow", {
      color: 0xffba08,
      metalness: 0.3,
    });
    for (let i = 0; i < 4; i += 1) {
      const crane = this.unitBox(craneOrange);
      crane.scale.set(0.08, 0.9, 0.08);
      crane.position.set(-0.9 + i * 0.58, 0.5, 0.12);
      const arm = this.unitBox(craneYellow);
      arm.scale.set(0.62, 0.06, 0.06);
      arm.position.set(0.25, 0.38, 0);
      crane.add(arm);
      dock.add(crane);
    }

    const containerMaterials = [0x0081a7, 0xf07167, 0x00afb9, 0xf4d35e].map(
      (color) =>
        this.standardMaterial(`container-${color}`, {
          color,
          roughness: 0.72,
          metalness: 0.15,
        }),
    );
    for (let i = 0; i < 12; i += 1) {
      const box = this.unitBox(random.pick(containerMaterials));
      box.scale.set(0.28, 0.18, 0.22);
      box.position.set(
        -1.05 + (i % 6) * 0.39,
        0.14 + Math.floor(i / 6) * 0.18,
        -0.35,
      );
      dock.add(box);
    }

    const warehouseMaterial = this.standardMaterial("warehouse", {
      color: 0xb7b9b3,
      roughness: 0.8,
      metalness: 0.2,
    });
    this.addBuilding(dock, 0.65, -0.35, 0.75, 0.5, 0.42, warehouseMaterial, true);
    const normal = this.findLandNormal(0.9, -0.22, ROAD_CLEARANCE + 1.1);
    if (normal) this.attach(dock, normal, 0.07, 0.4);

    // A second marina keeps the cargo port and leisure waterfront distinct.
    const marina = new THREE.Group();
    marina.name = "marina";
    this.addFoundation(marina, 1.8, 0.55, 0x746b5e, 0.2);
    const boardwalk = this.unitBox(wood);
    boardwalk.scale.set(1.8, 0.06, 0.28);
    boardwalk.position.y = 0.03;
    marina.add(boardwalk);
    for (let i = 0; i < 5; i += 1) {
      const finger = this.unitBox(wood);
      finger.scale.set(0.1, 0.05, 0.72);
      finger.position.set(-0.72 + i * 0.36, 0.02, 0.38);
      marina.add(finger);
    }
    const marinaNormal = this.findLandNormal(1.08, -0.29, ROAD_CLEARANCE + 0.8);
    if (marinaNormal) this.attach(marina, marinaNormal, 0.04, 0.15);
  }

  private buildCity(random: SeededRandom) {
    const towerMaterials = [0x4a5568, 0x718096, 0x2d3748, 0xa0aec0, 0x64748b].map(
      (color) =>
        this.standardMaterial(`city-${color}`, {
          color,
          metalness: 0.35,
          roughness: 0.45,
          flatShading: true,
        }),
    );
    const glass = this.standardMaterial("city-glass", {
      color: 0x7dd3fc,
      emissive: 0x173b53,
      emissiveIntensity: 0.22,
      metalness: 0.65,
      roughness: 0.24,
    });
    const districts = [
      { theta: 4.3, y: -0.02, yaw: 1.1, columns: 7, rows: 4, tall: true },
      { theta: 4.16, y: 0.08, yaw: 0.65, columns: 5, rows: 3, tall: false },
      { theta: 4.45, y: 0.07, yaw: 1.5, columns: 5, rows: 3, tall: false },
    ];
    districts.forEach((district, districtIndex) => {
      const city = new THREE.Group();
      city.name = `city-district-${districtIndex + 1}`;
      const width = district.columns * 0.34 + 0.25;
      const depth = district.rows * 0.36 + 0.25;
      this.addFoundation(city, width, depth, districtIndex === 0 ? 0x666b70 : 0x807d73, 0.25);
      for (let row = 0; row < district.rows; row += 1) {
        for (let column = 0; column < district.columns; column += 1) {
          if (!district.tall && (row + column) % 5 === 0) continue;
          const centerBias =
            1 - Math.abs(column - (district.columns - 1) * 0.5) / district.columns;
          const height = district.tall
            ? random.range(0.45, 1.1) + centerBias * random.range(0.25, 0.75)
            : random.range(0.24, 0.68);
          const material = random.next() > 0.8 ? glass : random.pick(towerMaterials);
          this.addBuilding(
            city,
            (column - (district.columns - 1) * 0.5) * 0.34,
            (row - (district.rows - 1) * 0.5) * 0.36,
            random.range(0.19, 0.28),
            random.range(0.2, 0.29),
            height,
            material,
          );
        }
      }
      if (districtIndex === 0) {
        const spire = this.mesh(
          "city-spire",
          () => new THREE.ConeGeometry(0.055, 0.6, 6),
          glass,
        );
        spire.position.set(0, 1.88, 0);
        city.add(spire);
      }
      const normal = this.findLandNormal(
        district.theta,
        district.y,
        ROAD_CLEARANCE + (district.tall ? 1.25 : 0.95),
      );
      if (normal) this.attach(city, normal, 0.08, district.yaw);
    });

    // A low old-town cluster gives the skyline a readable foreground.
    const oldTown = new THREE.Group();
    oldTown.name = "old-town";
    this.addFoundation(oldTown, 1.65, 1.05, 0x9b8e78, 0.19);
    const plaster = this.standardMaterial("old-town-plaster", {
      color: 0xe8d9bd,
      roughness: 0.95,
    });
    for (let i = 0; i < 10; i += 1) {
      this.addBuilding(
        oldTown,
        -0.62 + (i % 5) * 0.31,
        -0.25 + Math.floor(i / 5) * 0.5,
        0.22,
        0.3,
        random.range(0.24, 0.42),
        plaster,
        true,
      );
    }
    const oldTownNormal = this.findLandNormal(4.55, -0.08, ROAD_CLEARANCE + 0.85);
    if (oldTownNormal) this.attach(oldTown, oldTownNormal, 0.06, 0.9);
  }

  private buildBeach(random: SeededRandom) {
    const beach = new THREE.Group();
    beach.name = "beach";
    const sandMaterial = this.standardMaterial("beach-sand", {
      color: 0xe9d8a6,
      roughness: 1,
      flatShading: true,
    });
    const sand = this.mesh(
      "beach-sand-bank",
      () => new THREE.CylinderGeometry(1.2, 1.35, 0.16, 12),
      sandMaterial,
    );
    sand.scale.set(1.18, 1, 0.68);
    sand.position.y = -0.025;
    beach.add(sand);
    const white = this.standardMaterial("paint-white", {
      color: 0xf8f1e3,
      roughness: 0.75,
    });
    const canopyMaterials = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x5b8def].map(
      (color) => this.standardMaterial(`canopy-${color}`, { color, roughness: 0.8 }),
    );
    for (let i = 0; i < 9; i += 1) {
      const umbrella = new THREE.Group();
      const pole = this.mesh(
        "umbrella-pole",
        () => new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5),
        white,
      );
      pole.position.y = 0.18;
      const canopy = this.mesh(
        "umbrella-canopy",
        () => new THREE.ConeGeometry(0.18, 0.1, 8),
        random.pick(canopyMaterials),
      );
      canopy.position.y = 0.38;
      umbrella.add(pole, canopy);
      umbrella.position.set(
        -0.82 + (i % 5) * 0.39,
        0.04,
        -0.18 + Math.floor(i / 5) * 0.42,
      );
      beach.add(umbrella);
    }
    const pier = this.unitBox(
      this.standardMaterial("beach-pier", { color: 0x9c6644, roughness: 0.92 }),
    );
    pier.scale.set(0.25, 0.08, 1.5);
    pier.position.set(0.9, 0.05, 0.55);
    beach.add(pier);
    for (let i = 0; i < 3; i += 1) {
      const hut = this.unitBox(random.pick(canopyMaterials));
      hut.scale.set(0.28, 0.25, 0.24);
      hut.position.set(-0.75 + i * 0.36, 0.17, -0.58);
      beach.add(hut);
    }
    const volleyballPole = this.mesh(
      "beach-pole",
      () => new THREE.CylinderGeometry(0.012, 0.012, 0.38, 5),
      white,
    );
    for (const x of [-0.22, 0.28]) {
      const pole = volleyballPole.clone();
      pole.position.set(x, 0.23, 0.62);
      beach.add(pole);
    }
    const normal = this.findLandNormal(5.2, -0.3, ROAD_CLEARANCE + 1.15);
    if (normal) this.attach(beach, normal, 0.09, 0.2);
  }

  private buildAirport(random: SeededRandom) {
    const airport = new THREE.Group();
    airport.name = "airport";
    this.addFoundation(airport, 2.15, 3.7, 0x77786e, 0.28);
    const runwayMaterial = this.standardMaterial("runway", {
      color: 0x3d4450,
      roughness: 0.85,
    });
    const runway = this.unitBox(runwayMaterial);
    runway.scale.set(0.55, 0.04, 3.4);
    runway.position.y = 0.03;
    airport.add(runway);
    const runwayPaint = this.basicMaterial("runway-paint", { color: 0xf7f7f7 });
    for (let i = 0; i < 10; i += 1) {
      const stripe = this.unitBox(runwayPaint);
      stripe.scale.set(0.08, 0.045, 0.18);
      stripe.position.set(0, 0.055, -1.4 + i * 0.3);
      airport.add(stripe);
    }
    const terminalMaterial = this.standardMaterial("airport-terminal", {
      color: 0xdce3eb,
      metalness: 0.2,
      roughness: 0.58,
    });
    const terminal = this.unitBox(terminalMaterial);
    terminal.scale.set(1.15, 0.32, 0.48);
    terminal.position.set(0.82, 0.19, -0.8);
    airport.add(terminal);
    const tower = this.mesh(
      "control-tower",
      () => new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6),
      terminalMaterial,
    );
    tower.position.set(0.95, 0.4, -0.5);
    airport.add(tower);
    const towerCab = this.mesh(
      "control-cab",
      () => new THREE.CylinderGeometry(0.13, 0.1, 0.15, 6),
      this.standardMaterial("control-glass", {
        color: 0x80b9cf,
        metalness: 0.5,
        roughness: 0.25,
      }),
    );
    towerCab.position.set(0.95, 0.78, -0.5);
    airport.add(towerCab);
    const hangar = this.unitBox(terminalMaterial);
    hangar.scale.set(0.75, 0.35, 0.6);
    hangar.position.set(-0.75, 0.2, 0.8);
    airport.add(hangar);
    const planeMaterial = this.standardMaterial("plane", {
      color: 0xf4f4f2,
      roughness: 0.5,
      metalness: 0.15,
    });
    for (let i = 0; i < 3; i += 1) {
      const plane = new THREE.Group();
      const fuselage = this.mesh(
        "plane-body",
        () => new THREE.CylinderGeometry(0.035, 0.05, 0.55, 7),
        planeMaterial,
      );
      fuselage.rotation.x = Math.PI / 2;
      const wing = this.unitBox(
        random.next() > 0.5
          ? planeMaterial
          : this.standardMaterial("plane-accent", { color: 0xe63946 }),
      );
      wing.scale.set(0.5, 0.018, 0.09);
      plane.add(fuselage, wing);
      plane.position.set(-0.75 + i * 0.52, 0.16, -0.95);
      airport.add(plane);
    }
    const normal = this.findLandNormal(2.2, 0.05, ROAD_CLEARANCE + 1.9);
    if (normal) this.attach(airport, normal, 0.13, -0.5);
  }

  private buildCountryside(random: SeededRandom) {
    const farm = new THREE.Group();
    farm.name = "countryside-farm";
    this.addFoundation(farm, 2.65, 1.75, 0x726c4f, 0.2);
    const fieldMaterials = [0x90be6d, 0xf9c74f, 0x43aa8b, 0xb7a94b].map(
      (color) => this.standardMaterial(`field-${color}`, { color, roughness: 1 }),
    );
    for (let i = 0; i < 8; i += 1) {
      const field = this.unitBox(random.pick(fieldMaterials));
      field.scale.set(0.58, 0.045, 0.46);
      field.position.set(-0.9 + (i % 4) * 0.61, 0.035, -0.35 + Math.floor(i / 4) * 0.55);
      farm.add(field);
    }
    const barnMaterial = this.standardMaterial("barn-red", {
      color: 0xc1121f,
      roughness: 0.9,
    });
    this.addBuilding(farm, -0.82, -0.72, 0.45, 0.38, 0.32, barnMaterial, true);
    const silo = this.mesh(
      "farm-silo",
      () => new THREE.CylinderGeometry(0.13, 0.15, 0.52, 8),
      this.standardMaterial("silo-metal", {
        color: 0xb8b8ad,
        metalness: 0.45,
        roughness: 0.58,
      }),
    );
    silo.position.set(-0.25, 0.28, -0.72);
    farm.add(silo);
    const hayMaterial = this.standardMaterial("hay", {
      color: 0xd6a62f,
      roughness: 1,
    });
    for (let i = 0; i < 5; i += 1) {
      const bale = this.mesh(
        "hay-bale",
        () => new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8),
        hayMaterial,
      );
      bale.rotation.z = Math.PI / 2;
      bale.position.set(0.48 + (i % 3) * 0.24, 0.13, -0.68 + Math.floor(i / 3) * 0.22);
      farm.add(bale);
    }
    const normal = this.findLandNormal(1.4, 0.18, ROAD_CLEARANCE + 1.35);
    if (normal) this.attach(farm, normal, 0.09, 0.7);

    const orchard = new THREE.Group();
    orchard.name = "orchard";
    this.addFoundation(orchard, 1.45, 1.0, 0x6f784d, 0.14);
    const trunkMaterial = this.standardMaterial("orchard-trunk", {
      color: 0x76543c,
      roughness: 1,
    });
    const crownMaterials = [0x4f8a45, 0x68a64e, 0x7da95b].map((color) =>
      this.standardMaterial(`orchard-${color}`, { color, roughness: 1, flatShading: true }),
    );
    for (let i = 0; i < 12; i += 1) {
      const tree = new THREE.Group();
      const trunk = this.mesh(
        "orchard-trunk-geo",
        () => new THREE.CylinderGeometry(0.018, 0.025, 0.18, 5),
        trunkMaterial,
      );
      trunk.position.y = 0.09;
      const crown = this.mesh(
        "orchard-crown",
        () => new THREE.IcosahedronGeometry(0.11, 0),
        random.pick(crownMaterials),
      );
      crown.position.y = 0.22;
      tree.add(trunk, crown);
      tree.position.set(-0.52 + (i % 4) * 0.35, 0.04, -0.33 + Math.floor(i / 4) * 0.33);
      orchard.add(tree);
    }
    const orchardNormal = this.findLandNormal(1.62, 0.24, ROAD_CLEARANCE + 0.8);
    if (orchardNormal) this.attach(orchard, orchardNormal, 0.06, 0.25);
  }

  private buildLighthouse(_random: SeededRandom) {
    const white = this.standardMaterial("lighthouse-white", {
      color: 0xf8f9fa,
      roughness: 0.72,
    });
    const red = this.standardMaterial("lighthouse-red", {
      color: 0xe63946,
      roughness: 0.65,
    });
    const dark = this.standardMaterial("lighthouse-railing", {
      color: 0x303740,
      metalness: 0.65,
      roughness: 0.5,
    });
    const locations = [
      { theta: 5.6, y: -0.34, yaw: 0 },
      { theta: 0.58, y: -0.34, yaw: 0.6 },
      { theta: 2.85, y: 0.33, yaw: 1.1 },
      { theta: 4.95, y: 0.3, yaw: 1.8 },
    ];
    locations.forEach((location, index) => {
      const light = new THREE.Group();
      light.name = `lighthouse-${index + 1}`;
      const plinth = this.mesh(
        "lighthouse-plinth",
        () => new THREE.CylinderGeometry(0.24, 0.3, 0.22, 7),
        this.standardMaterial("lighthouse-rock", {
          color: 0x77766f,
          roughness: 1,
          flatShading: true,
        }),
      );
      plinth.position.y = -0.01;
      const tower = this.mesh(
        "lighthouse-tower",
        () => new THREE.CylinderGeometry(0.1, 0.15, 1.1, 8),
        white,
      );
      tower.position.y = 0.58;
      const stripe = this.mesh(
        "lighthouse-stripe",
        () => new THREE.CylinderGeometry(0.112, 0.125, 0.2, 8),
        red,
      );
      stripe.position.y = 0.72;
      const gallery = this.mesh(
        "lighthouse-gallery",
        () => new THREE.CylinderGeometry(0.2, 0.2, 0.045, 10),
        dark,
      );
      gallery.position.y = 1.12;
      const lamp = this.mesh(
        "lighthouse-lamp",
        () => new THREE.SphereGeometry(0.12, 8, 6),
        this.lighthouseLamps,
      );
      lamp.position.y = 1.22;
      const cap = this.mesh(
        "lighthouse-cap",
        () => new THREE.ConeGeometry(0.17, 0.15, 8),
        red,
      );
      cap.position.y = 1.36;
      light.add(plinth, tower, stripe, gallery, lamp, cap);
      const normal = this.findLandNormal(
        location.theta,
        location.y,
        ROAD_CLEARANCE + 0.55,
      );
      if (normal) this.attach(light, normal, 0.08, location.yaw);
    });
  }

  private buildWindFarm(random: SeededRandom) {
    const mastMaterial = this.standardMaterial("wind-mast", {
      color: 0xeef2f4,
      metalness: 0.5,
      roughness: 0.5,
    });
    const hubMaterial = this.standardMaterial("wind-hub", {
      color: 0xcbd5e0,
      roughness: 0.45,
      metalness: 0.45,
    });
    const bladeMaterial = this.standardMaterial("wind-blade", {
      color: 0xffffff,
      roughness: 0.5,
    });
    for (let i = 0; i < 7; i += 1) {
      const turbine = new THREE.Group();
      turbine.name = `wind-turbine-${i + 1}`;
      const base = this.mesh(
        "wind-base",
        () => new THREE.CylinderGeometry(0.1, 0.13, 0.18, 7),
        this.standardMaterial("wind-foundation", {
          color: 0xa5a49d,
          roughness: 0.9,
        }),
      );
      base.position.y = 0.03;
      const mast = this.mesh(
        "wind-mast-geo",
        () => new THREE.CylinderGeometry(0.03, 0.055, 0.95, 6),
        mastMaterial,
      );
      mast.position.y = 0.48;
      const hub = this.mesh(
        "wind-hub-geo",
        () => new THREE.SphereGeometry(0.06, 8, 6),
        hubMaterial,
      );
      hub.position.y = 0.95;
      const rotor = new THREE.Group();
      rotor.position.y = 0.95;
      for (let blade = 0; blade < 3; blade += 1) {
        const arm = this.unitBox(bladeMaterial);
        arm.scale.set(0.04, 0.55, 0.02);
        arm.position.y = 0.25;
        const pivot = new THREE.Group();
        pivot.rotation.z = (blade * Math.PI * 2) / 3;
        pivot.add(arm);
        rotor.add(pivot);
      }
      rotor.rotation.z = i * 0.2;
      this.windRotors.push(rotor);
      turbine.add(base, mast, hub, rotor);
      const normal = this.findLandNormal(
        3.5 + i * 0.08,
        0.26 + random.range(-0.03, 0.03),
        ROAD_CLEARANCE + 0.65,
      );
      if (normal) this.attach(turbine, normal, 0.08, random.range(0, 2));
    }
  }

  private buildGroundedStructures(random: SeededRandom) {
    const stone = this.standardMaterial("structure-stone", {
      color: 0x8c877c,
      roughness: 0.95,
      flatShading: true,
    });
    const observatory = new THREE.Group();
    observatory.name = "hill-observatory";
    this.addFoundation(observatory, 1.1, 0.85, 0x777267, 0.2);
    const observatoryBody = this.mesh(
      "observatory-body",
      () => new THREE.CylinderGeometry(0.38, 0.43, 0.42, 10),
      stone,
    );
    observatoryBody.position.y = 0.23;
    const dome = this.mesh(
      "observatory-dome",
      () => new THREE.SphereGeometry(0.39, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      this.standardMaterial("observatory-metal", {
        color: 0xd8dde0,
        metalness: 0.55,
        roughness: 0.4,
      }),
    );
    dome.position.y = 0.44;
    observatory.add(observatoryBody, dome);
    const observatoryNormal = this.findLandNormal(2.72, 0.48, ROAD_CLEARANCE + 0.75);
    if (observatoryNormal) this.attach(observatory, observatoryNormal, 0.08, 0.4);

    const waterTower = new THREE.Group();
    waterTower.name = "water-tower";
    const legMaterial = this.standardMaterial("water-tower-legs", {
      color: 0x58626b,
      metalness: 0.55,
      roughness: 0.5,
    });
    for (const x of [-0.12, 0.12]) {
      for (const z of [-0.12, 0.12]) {
        const leg = this.unitBox(legMaterial);
        leg.scale.set(0.025, 0.55, 0.025);
        leg.position.set(x, 0.29, z);
        waterTower.add(leg);
      }
    }
    const tank = this.mesh(
      "water-tank",
      () => new THREE.CylinderGeometry(0.25, 0.21, 0.38, 8),
      this.standardMaterial("water-tank-material", {
        color: 0x9fb2b8,
        metalness: 0.4,
        roughness: 0.55,
      }),
    );
    tank.position.y = 0.68;
    const footing = this.mesh(
      "water-tower-footing",
      () => new THREE.CylinderGeometry(0.3, 0.34, 0.15, 8),
      stone,
    );
    footing.position.y = 0.01;
    waterTower.add(footing, tank);
    const towerNormal = this.findLandNormal(0.15, 0.22, ROAD_CLEARANCE + 0.55);
    if (towerNormal) this.attach(waterTower, towerNormal, 0.06, 0.1);

    const village = new THREE.Group();
    village.name = "mountain-cabins";
    this.addFoundation(village, 1.45, 0.9, 0x746f61, 0.18);
    const cabinColors = [0x9a5b3c, 0x3f6f5c, 0xb17945];
    for (let i = 0; i < 6; i += 1) {
      this.addBuilding(
        village,
        -0.52 + (i % 3) * 0.52,
        -0.22 + Math.floor(i / 3) * 0.46,
        0.31,
        0.27,
        random.range(0.23, 0.34),
        this.standardMaterial(`cabin-${cabinColors[i % cabinColors.length]}`, {
          color: cabinColors[i % cabinColors.length],
          roughness: 0.94,
        }),
        true,
      );
    }
    const villageNormal = this.findLandNormal(5.98, 0.2, ROAD_CLEARANCE + 0.8);
    if (villageNormal) this.attach(village, villageNormal, 0.07, -0.35);

    const radio = new THREE.Group();
    radio.name = "radio-mast";
    const mast = this.mesh(
      "radio-mast-geo",
      () => new THREE.CylinderGeometry(0.018, 0.045, 1.25, 5),
      legMaterial,
    );
    mast.position.y = 0.6;
    const dish = this.mesh(
      "radio-dish",
      () => new THREE.SphereGeometry(0.25, 8, 5, 0, Math.PI * 2, 0, Math.PI / 3),
      this.standardMaterial("radio-dish-material", {
        color: 0xe1e5e5,
        metalness: 0.5,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    dish.position.set(0, 0.88, 0.12);
    dish.rotation.x = -0.7;
    const radioBase = this.mesh(
      "radio-base",
      () => new THREE.CylinderGeometry(0.2, 0.25, 0.2, 6),
      stone,
    );
    radio.add(mast, dish, radioBase);
    const radioNormal = this.findLandNormal(3.02, -0.18, ROAD_CLEARANCE + 0.55);
    if (radioNormal) this.attach(radio, radioNormal, 0.08, 0.8);
  }

  private createBoat(
    hullMaterial: THREE.Material,
    sailMaterial?: THREE.Material,
  ) {
    const boat = new THREE.Group();
    const hull = this.mesh(
      "boat-hull",
      () => new THREE.ConeGeometry(0.13, 0.55, 5),
      hullMaterial,
    );
    hull.rotation.x = Math.PI / 2;
    hull.rotation.z = Math.PI / 2;
    hull.scale.z = 0.62;
    hull.position.y = 0.06;
    boat.add(hull);
    if (sailMaterial) {
      const mast = this.mesh(
        "boat-mast",
        () => new THREE.CylinderGeometry(0.009, 0.012, 0.5, 5),
        this.standardMaterial("boat-mast-material", {
          color: 0x684d35,
          roughness: 0.9,
        }),
      );
      mast.position.y = 0.29;
      const sail = this.mesh(
        "boat-sail",
        () => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.44, 0, 0.3, 0, 0], 3),
          );
          geometry.computeVertexNormals();
          return geometry;
        },
        sailMaterial,
      );
      sail.position.y = 0.18;
      sail.position.x = 0.015;
      boat.add(mast, sail);
    } else {
      const cabin = this.unitBox(
        this.standardMaterial("workboat-cabin", {
          color: 0xe8e3d8,
          roughness: 0.65,
        }),
      );
      cabin.scale.set(0.16, 0.15, 0.18);
      cabin.position.set(0, 0.18, -0.04);
      boat.add(cabin);
    }
    return boat;
  }

  private buildWaterActivity(random: SeededRandom) {
    const hullMaterials = [0xc43d35, 0x285e8e, 0xf0a43a, 0x276749].map((color) =>
      this.standardMaterial(`boat-hull-${color}`, {
        color,
        roughness: 0.7,
        flatShading: true,
      }),
    );
    const sailMaterials = [0xfff7df, 0xf26b5b, 0xf2d45c].map((color) =>
      this.standardMaterial(`boat-sail-${color}`, {
        color,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    const boatLocations = [
      [0.92, -0.31],
      [1.04, -0.36],
      [1.16, -0.25],
      [5.12, -0.39],
      [5.28, -0.4],
      [4.72, 0.18],
      [2.1, -0.42],
      [3.85, -0.46],
    ] as const;
    boatLocations.forEach(([theta, y], index) => {
      const sailboat = index % 3 !== 0;
      const boat = this.createBoat(
        random.pick(hullMaterials),
        sailboat ? random.pick(sailMaterials) : undefined,
      );
      boat.name = sailboat ? `sailboat-${index + 1}` : `workboat-${index + 1}`;
      const normal = this.findOceanNormal(theta, y);
      this.attachOcean(boat, normal, 0.045, random.range(0, Math.PI * 2), {
        phase: random.range(0, Math.PI * 2),
        amplitude: random.range(0.012, 0.026),
      });
    });

    const buoyRed = this.standardMaterial("buoy-red", {
      color: 0xf04444,
      emissive: 0x8a0909,
      emissiveIntensity: 0.18,
      roughness: 0.6,
    });
    const buoyYellow = this.standardMaterial("buoy-yellow", {
      color: 0xf6c945,
      emissive: 0x6f4f00,
      emissiveIntensity: 0.15,
      roughness: 0.62,
    });
    for (let i = 0; i < 16; i += 1) {
      const theta = 0.72 + i * 0.31;
      const y = -0.34 + Math.sin(i * 1.7) * 0.14;
      const normal = this.findOceanNormal(theta, y);
      const buoy = new THREE.Group();
      buoy.name = `navigation-buoy-${i + 1}`;
      const body = this.mesh(
        "buoy-body",
        () => new THREE.CylinderGeometry(0.045, 0.075, 0.16, 6),
        i % 2 === 0 ? buoyRed : buoyYellow,
      );
      body.position.y = 0.055;
      const marker = this.mesh(
        "buoy-marker",
        () => new THREE.SphereGeometry(0.035, 6, 4),
        i % 2 === 0 ? buoyRed : buoyYellow,
      );
      marker.position.y = 0.17;
      buoy.add(body, marker);
      this.attachOcean(buoy, normal, 0.02, 0, {
        phase: random.range(0, Math.PI * 2),
        amplitude: random.range(0.01, 0.022),
      });
    }
  }

  update(elapsed: number, daylight = 1) {
    const night = 1 - THREE.MathUtils.clamp(daylight, 0, 1);
    this.lighthouseLamps.emissiveIntensity =
      0.35 + night * (2.2 + Math.sin(elapsed * 3.1) * 0.28);
    for (let i = 0; i < this.windRotors.length; i += 1) {
      this.windRotors[i]!.rotation.z =
        i * 0.2 + elapsed * (0.65 + (i % 3) * 0.09);
    }
    for (const prop of this.bobbingProps) {
      prop.object.position
        .copy(prop.normal)
        .multiplyScalar(
          prop.radius + Math.sin(elapsed * 1.45 + prop.phase) * prop.amplitude,
        );
    }
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(this.geometries.values());
    const materials = new Set<THREE.Material>(this.materials.values());
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.windRotors.length = 0;
    this.bobbingProps.length = 0;
    // Planet also traverses its group during disposal; clearing prevents a
    // second dispose pass over resources shared by hundreds of small props.
    this.group.clear();
  }
}
