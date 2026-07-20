import * as THREE from "three";
import { ROAD_CLEARANCE } from "../config";
import { orientationFromFrame, tangentNorth } from "../math/SphericalMath";
import type { Planet } from "./Planet";
import { SeededRandom } from "./Noise";

/**
 * Landmark districts around the planet — port, city, beach, airport, farms,
 * lighthouse, and wind belt. Placed with hard road clearance so nothing sits
 * on the racing line.
 */
export class WorldScenery {
  readonly group = new THREE.Group();
  private readonly planet: Planet;

  constructor(planet: Planet) {
    this.planet = planet;
    this.group.name = "world-scenery";
    const random = new SeededRandom(planet.seed + 900);
    this.buildPort(random);
    this.buildCity(random);
    this.buildBeach(random);
    this.buildAirport(random);
    this.buildCountryside(random);
    this.buildLighthouse(random);
    this.buildWindFarm(random);
  }

  private placeNormal(
    theta: number,
    y: number,
    minClearance = ROAD_CLEARANCE,
  ): THREE.Vector3 | null {
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const normal = new THREE.Vector3(
      Math.cos(theta) * radial,
      y,
      Math.sin(theta) * radial,
    ).normalize();
    if (this.planet.terrainHeight(normal) < 0.04) return null;
    if (this.planet.nearestRoadDistance(normal) < minClearance) return null;
    return normal;
  }

  private attach(
    object: THREE.Object3D,
    normal: THREE.Vector3,
    height: number,
    yaw = 0,
  ) {
    const forward = tangentNorth(normal).applyAxisAngle(normal, yaw);
    object.position.copy(normal).multiplyScalar(
      this.planet.surfaceRadiusAt(normal) + height,
    );
    object.quaternion.copy(orientationFromFrame(normal, forward));
    this.group.add(object);
  }

  private buildPort(random: SeededRandom) {
    const dock = new THREE.Group();
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.9 }),
    );
    dock.add(plank);
    for (let i = 0; i < 4; i += 1) {
      const crane = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.9, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xe85d04, metalness: 0.4 }),
      );
      crane.position.set(-0.6 + i * 0.4, 0.5, 0.1);
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xffba08 }),
      );
      arm.position.set(0.25, 0.4, 0);
      crane.add(arm);
      dock.add(crane);
    }
    for (let i = 0; i < 6; i += 1) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.28),
        new THREE.MeshStandardMaterial({
          color: random.pick([0x0081a7, 0xf07167, 0x00afb9, 0xfdfcdc]),
        }),
      );
      box.position.set(-0.7 + i * 0.28, 0.14, -0.12);
      dock.add(box);
    }
    const normal = this.placeNormal(0.9, -0.22, ROAD_CLEARANCE + 0.4);
    if (normal) this.attach(dock, normal, 0.05, 0.4);
  }

  private buildCity(random: SeededRandom) {
    const city = new THREE.Group();
    for (let i = 0; i < 18; i += 1) {
      const h = random.range(0.35, 1.4);
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(random.range(0.18, 0.32), h, random.range(0.18, 0.3)),
        new THREE.MeshStandardMaterial({
          color: random.pick([0x4a5568, 0x718096, 0x2d3748, 0xa0aec0]),
          metalness: 0.35,
          roughness: 0.45,
        }),
      );
      tower.position.set(
        (i % 6) * 0.38 - 1,
        h * 0.5,
        Math.floor(i / 6) * 0.4 - 0.4,
      );
      city.add(tower);
    }
    const normal = this.placeNormal(4.3, -0.02, ROAD_CLEARANCE + 0.5);
    if (normal) this.attach(city, normal, 0.02, 1.1);
  }

  private buildBeach(random: SeededRandom) {
    const beach = new THREE.Group();
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.35, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xe9d8a6, roughness: 1 }),
    );
    sand.position.y = 0.02;
    beach.add(sand);
    for (let i = 0; i < 5; i += 1) {
      const umbrella = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5),
        new THREE.MeshStandardMaterial({ color: 0xf8f1e3 }),
      );
      pole.position.y = 0.18;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.1, 8),
        new THREE.MeshStandardMaterial({
          color: random.pick([0xff6b6b, 0x4ecdc4, 0xffe66d]),
        }),
      );
      canopy.position.y = 0.38;
      umbrella.add(pole, canopy);
      umbrella.position.set(-0.5 + i * 0.28, 0, 0.2);
      beach.add(umbrella);
    }
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.06, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x9c6644 }),
    );
    pier.position.set(0.7, 0.05, 0.5);
    beach.add(pier);
    const normal = this.placeNormal(5.2, -0.3, ROAD_CLEARANCE + 0.3);
    if (normal) this.attach(beach, normal, 0.02, 0.2);
  }

  private buildAirport(_random: SeededRandom) {
    const airport = new THREE.Group();
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.04, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.85 }),
    );
    airport.add(runway);
    for (let i = 0; i < 10; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.045, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xf7f7f7 }),
      );
      stripe.position.set(0, 0.01, -1.4 + i * 0.3);
      airport.add(stripe);
    }
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.28, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xdce3eb, metalness: 0.2 }),
    );
    terminal.position.set(0.7, 0.16, -0.8);
    airport.add(terminal);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    tower.position.set(0.95, 0.4, -0.5);
    airport.add(tower);
    const normal = this.placeNormal(2.2, 0.05, ROAD_CLEARANCE + 0.8);
    if (normal) this.attach(airport, normal, 0.03, -0.5);
  }

  private buildCountryside(random: SeededRandom) {
    const farm = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const field = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 0.55),
        new THREE.MeshStandardMaterial({
          color: random.pick([0x90be6d, 0xf9c74f, 0x43aa8b]),
        }),
      );
      field.position.set(i * 0.2 - 0.2, 0.02, i * 0.15);
      farm.add(field);
    }
    const barn = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.28, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xc1121f }),
    );
    barn.position.set(-0.5, 0.16, -0.3);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: 0x6c757d, flatShading: true }),
    );
    roof.position.set(-0.5, 0.36, -0.3);
    roof.rotation.y = Math.PI / 4;
    farm.add(barn, roof);
    const normal = this.placeNormal(1.4, 0.18, ROAD_CLEARANCE + 0.4);
    if (normal) this.attach(farm, normal, 0.02, 0.7);
  }

  private buildLighthouse(_random: SeededRandom) {
    const light = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8f9fa }),
    );
    tower.position.y = 0.55;
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xe63946 }),
    );
    stripe.position.y = 0.7;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffe066,
        emissive: 0xffc300,
        emissiveIntensity: 0.8,
      }),
    );
    lamp.position.y = 1.15;
    light.add(tower, stripe, lamp);
    const normal = this.placeNormal(5.6, -0.34, ROAD_CLEARANCE + 0.2);
    if (normal) this.attach(light, normal, 0.02, 0);
  }

  private buildWindFarm(random: SeededRandom) {
    for (let i = 0; i < 7; i += 1) {
      const turbine = new THREE.Group();
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, 0.95, 6),
        new THREE.MeshStandardMaterial({ color: 0xeef2f4, metalness: 0.5 }),
      );
      mast.position.y = 0.48;
      const hub = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e0 }),
      );
      hub.position.y = 0.95;
      for (let blade = 0; blade < 3; blade += 1) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.55, 0.02),
          new THREE.MeshStandardMaterial({ color: 0xffffff }),
        );
        arm.position.y = 0.25;
        const pivot = new THREE.Group();
        pivot.position.y = 0.95;
        pivot.rotation.z = (blade * Math.PI * 2) / 3 + i * 0.2;
        pivot.add(arm);
        turbine.add(pivot);
      }
      turbine.add(mast, hub);
      const normal = this.placeNormal(
        3.5 + i * 0.08,
        0.26 + random.range(-0.03, 0.03),
        ROAD_CLEARANCE + 0.5,
      );
      if (normal) this.attach(turbine, normal, 0.02, random.range(0, 2));
    }
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
