import * as THREE from "three";
import type { NetworkPlayerState } from "../../shared/protocol";
import { orientationFromFrame, slerpDirection } from "../math/SphericalMath";
import type { Planet } from "../world/Planet";

type RemoteCar = {
  group: THREE.Group;
  currentNormal: THREE.Vector3;
  targetNormal: THREE.Vector3;
  currentForward: THREE.Vector3;
  targetForward: THREE.Vector3;
  lastSeen: number;
};

export class RemoteCars {
  readonly group = new THREE.Group();
  private readonly cars = new Map<string, RemoteCar>();
  private readonly planet: Planet;

  constructor(planet: Planet) {
    this.planet = planet;
    this.group.name = "remote-player-cars";
  }

  applySnapshot(players: NetworkPlayerState[], localId: string | null) {
    const now = performance.now();
    for (const player of players) {
      if (player.id === localId) continue;
      let remote = this.cars.get(player.id);
      const normal = new THREE.Vector3().fromArray(player.normal).normalize();
      const forward = new THREE.Vector3().fromArray(player.forward).normalize();
      if (!remote) {
        const group = this.buildCar(player.color);
        remote = {
          group,
          currentNormal: normal.clone(),
          targetNormal: normal.clone(),
          currentForward: forward.clone(),
          targetForward: forward.clone(),
          lastSeen: now,
        };
        this.cars.set(player.id, remote);
        this.group.add(group);
      }
      remote.targetNormal.copy(normal);
      remote.targetForward.copy(forward);
      remote.lastSeen = now;
    }

    for (const [id, remote] of this.cars) {
      if (now - remote.lastSeen > 3_000) {
        this.remove(id);
      }
    }
  }

  private buildCar(color: number) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.1, 0.5),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.44,
        metalness: 0.12,
      }),
    );
    body.position.y = 0.08;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.1, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x8ed8e8,
        roughness: 0.18,
      }),
    );
    cabin.position.set(0, 0.17, -0.03);
    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.012, 6, 20),
      new THREE.MeshBasicMaterial({ color }),
    );
    beacon.position.y = 0.38;
    beacon.rotation.x = Math.PI / 2;
    group.add(body, cabin, beacon);
    group.scale.setScalar(0.56);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    return group;
  }

  update(delta: number) {
    const alpha = 1 - Math.exp(-delta * 12);
    for (const remote of this.cars.values()) {
      slerpDirection(
        remote.currentNormal,
        remote.targetNormal,
        alpha,
        remote.currentNormal,
      );
      remote.currentForward
        .lerp(remote.targetForward, alpha)
        .addScaledVector(
          remote.currentNormal,
          -remote.currentForward.dot(remote.currentNormal),
        )
        .normalize();
      remote.group.position
        .copy(remote.currentNormal)
        .multiplyScalar(
          this.planet.surfaceRadiusAt(remote.currentNormal) + 0.09,
        );
      remote.group.quaternion.copy(
        orientationFromFrame(remote.currentNormal, remote.currentForward),
      );
    }
  }

  remove(id: string) {
    const remote = this.cars.get(id);
    if (!remote) return;
    this.group.remove(remote.group);
    remote.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.cars.delete(id);
  }

  get count() {
    return this.cars.size;
  }

  dispose() {
    for (const id of [...this.cars.keys()]) this.remove(id);
  }
}
