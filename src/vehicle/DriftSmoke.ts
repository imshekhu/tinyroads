import * as THREE from "three";

type Puff = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: number;
};

/**
 * Tire smoke + rubber dust. Spawns from both rear corners with lateral kick
 * so drifts read as sliding rubber instead of a single blob behind the car.
 */
export class DriftSmoke {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private cursor = 0;
  private spawnAccumulator = 0;
  private readonly sharedGeometry = new THREE.SphereGeometry(0.05, 8, 6);

  constructor() {
    for (let index = 0; index < 72; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd8d2c6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.puffs.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        spin: 0,
      });
    }
  }

  update(
    delta: number,
    position: THREE.Vector3,
    up: THREE.Vector3,
    backward: THREE.Vector3,
    right: THREE.Vector3,
    intensity: number,
    offRoad: boolean,
  ) {
    const rate = intensity * (offRoad ? 38 : 52);
    this.spawnAccumulator += rate * delta;
    while (this.spawnAccumulator >= 1) {
      const side = this.spawnAccumulator % 2 < 1 ? -1 : 1;
      this.spawn(position, up, backward, right, side, intensity, offRoad);
      this.spawnAccumulator -= 1;
    }

    for (const puff of this.puffs) {
      if (puff.life <= 0) continue;
      puff.life -= delta;
      if (puff.life <= 0) {
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.position.addScaledVector(puff.velocity, delta);
      puff.mesh.position.addScaledVector(up, delta * 0.04);
      puff.velocity.multiplyScalar(Math.exp(-delta * 1.8));
      puff.mesh.rotation.y += puff.spin * delta;
      const progress = 1 - puff.life / puff.maxLife;
      const swell = 0.55 + progress * 2.8;
      puff.mesh.scale.set(swell * 1.35, swell * 0.75, swell * 1.35);
      const material = puff.mesh.material as THREE.MeshBasicMaterial;
      // Peak early, hang as a soft haze, then fade — reads as tire smoke.
      const envelope =
        progress < 0.18
          ? progress / 0.18
          : Math.max(0, 1 - (progress - 0.18) / 0.82);
      material.opacity = envelope * (offRoad ? 0.42 : 0.55) * Math.min(1, intensity + 0.25);
    }
  }

  private spawn(
    position: THREE.Vector3,
    up: THREE.Vector3,
    backward: THREE.Vector3,
    right: THREE.Vector3,
    side: number,
    intensity: number,
    offRoad: boolean,
  ) {
    const puff = this.puffs[this.cursor];
    this.cursor = (this.cursor + 1) % this.puffs.length;
    puff.life = offRoad ? 1.05 : 0.85 + intensity * 0.35;
    puff.maxLife = puff.life;
    puff.spin = (Math.random() - 0.5) * 4;
    puff.mesh.visible = true;
    puff.mesh.position
      .copy(position)
      .addScaledVector(backward, 0.12 + Math.random() * 0.04)
      .addScaledVector(right, side * (0.07 + Math.random() * 0.03))
      .addScaledVector(up, 0.018);
    puff.mesh.scale.setScalar(0.45);
    puff.velocity
      .copy(backward)
      .multiplyScalar(0.08 + Math.random() * 0.1)
      .addScaledVector(right, side * (0.12 + Math.random() * 0.16) * intensity)
      .addScaledVector(up, 0.02 + Math.random() * 0.05);
    const material = puff.mesh.material as THREE.MeshBasicMaterial;
    if (offRoad) {
      material.color.setHex(0xb89562);
    } else {
      // Hot rubber: darker gray with a slight warm tint when intense.
      const heat = Math.min(1, intensity);
      material.color.setRGB(
        0.72 - heat * 0.22,
        0.7 - heat * 0.2,
        0.66 - heat * 0.16,
      );
    }
  }

  dispose() {
    this.sharedGeometry.dispose();
    for (const puff of this.puffs) {
      (puff.mesh.material as THREE.Material).dispose();
    }
  }
}
