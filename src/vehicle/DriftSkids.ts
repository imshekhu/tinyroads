import * as THREE from "three";
import { orientationFromFrame } from "../math/SphericalMath";

type Mark = {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
};

/**
 * Short-lived rubber skid patches left under the rear tires during drifts.
 */
export class DriftSkids {
  readonly group = new THREE.Group();
  private readonly marks: Mark[] = [];
  private cursor = 0;
  private spawnAccumulator = 0;
  private readonly geometry = new THREE.PlaneGeometry(0.055, 0.16);

  constructor() {
    this.group.name = "drift-skid-marks";
    for (let index = 0; index < 96; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x1a1816,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.marks.push({ mesh, life: 0, maxLife: 1 });
    }
  }

  update(
    delta: number,
    position: THREE.Vector3,
    up: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    intensity: number,
    airborne: boolean,
  ) {
    if (!airborne && intensity > 0.12) {
      this.spawnAccumulator += intensity * delta * 28;
      while (this.spawnAccumulator >= 1) {
        this.spawn(position, up, forward, right, -1, intensity);
        this.spawn(position, up, forward, right, 1, intensity);
        this.spawnAccumulator -= 1;
      }
    }

    for (const mark of this.marks) {
      if (mark.life <= 0) continue;
      mark.life -= delta;
      if (mark.life <= 0) {
        mark.mesh.visible = false;
        continue;
      }
      const progress = 1 - mark.life / mark.maxLife;
      const material = mark.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = (1 - progress) * 0.55;
      mark.mesh.scale.x = 1 + progress * 0.35;
      mark.mesh.scale.y = 1 + progress * 0.8;
    }
  }

  private spawn(
    position: THREE.Vector3,
    up: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    side: number,
    intensity: number,
  ) {
    const mark = this.marks[this.cursor];
    this.cursor = (this.cursor + 1) % this.marks.length;
    mark.life = 3.8 + intensity * 1.4;
    mark.maxLife = mark.life;
    mark.mesh.visible = true;
    mark.mesh.position
      .copy(position)
      .addScaledVector(forward, -0.1)
      .addScaledVector(right, side * 0.075)
      .addScaledVector(up, 0.012);
    mark.mesh.quaternion.copy(orientationFromFrame(up, forward));
    mark.mesh.rotateX(-Math.PI / 2);
    mark.mesh.scale.set(1, 1, 1);
    const material = mark.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.5 + intensity * 0.25;
    material.color.setRGB(0.08, 0.07, 0.06);
  }

  dispose() {
    this.geometry.dispose();
    for (const mark of this.marks) {
      (mark.mesh.material as THREE.Material).dispose();
    }
  }
}
