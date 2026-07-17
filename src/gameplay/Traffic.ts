import * as THREE from "three";
import { orientationFromFrame, slerpDirection } from "../math/SphericalMath";
import type { RoadNetwork, RoadSample } from "../world/RoadNetwork";

type TrafficCar = {
  group: THREE.Group;
  route: RoadSample[];
  progress: number;
  speed: number;
  laneOffset: number;
};

export class Traffic {
  readonly group = new THREE.Group();
  private readonly cars: TrafficCar[] = [];

  constructor(road: RoadNetwork) {
    this.group.name = "tiny-traffic";
    const colors = [
      0x4ec6e2, 0xf7c948, 0x9d75de, 0x51b875, 0xff7650, 0xf2ede2,
    ];
    for (let index = 0; index < 7; index += 1) {
      const route = index < 4 ? road.samples : road.highlandSamples;
      const car = this.buildCar(colors[index % colors.length]);
      car.scale.setScalar(0.44);
      this.group.add(car);
      this.cars.push({
        group: car,
        route,
        progress: (index / 7 + 0.13) % 1,
        speed: 0.0055 + (index % 3) * 0.0011,
        laneOffset: index % 2 === 0 ? -0.07 : 0.07,
      });
    }
  }

  private buildCar(color: number) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.11, 0.5),
      bodyMaterial,
    );
    body.position.y = 0.09;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.11, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xa8deea,
        roughness: 0.2,
      }),
    );
    cabin.position.set(0, 0.18, -0.03);
    group.add(body, cabin);

    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x24272a,
      roughness: 0.9,
    });
    for (const z of [-0.16, 0.16]) {
      for (const x of [-0.165, 0.165]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.035, 10),
          tireMaterial,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.05, z);
        group.add(wheel);
      }
    }
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    return group;
  }

  update(delta: number, elapsed: number) {
    for (const car of this.cars) {
      car.progress = (car.progress + car.speed * delta * 60) % 1;
      const scaled = car.progress * car.route.length;
      const index = Math.floor(scaled) % car.route.length;
      const nextIndex = (index + 1) % car.route.length;
      const alpha = scaled - Math.floor(scaled);
      const current = car.route[index];
      const next = car.route[nextIndex];
      const normal = slerpDirection(current.normal, next.normal, alpha);
      const tangent = current.tangent.clone().lerp(next.tangent, alpha);
      tangent
        .addScaledVector(normal, -tangent.dot(normal))
        .normalize();
      const right = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      car.group.position
        .copy(current.position)
        .lerp(next.position, alpha)
        .addScaledVector(normal, 0.07 + Math.sin(elapsed * 4 + index) * 0.002)
        .addScaledVector(right, car.laneOffset);
      car.group.quaternion.copy(orientationFromFrame(normal, tangent));
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
