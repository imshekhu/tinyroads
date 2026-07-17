import * as THREE from "three";

type Puff = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

export class DriftSmoke {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private cursor = 0;
  private spawnAccumulator = 0;

  constructor() {
    const geometry = new THREE.IcosahedronGeometry(0.045, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xe9dfcb,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    for (let index = 0; index < 32; index += 1) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
      });
    }
  }

  update(
    delta: number,
    position: THREE.Vector3,
    up: THREE.Vector3,
    backward: THREE.Vector3,
    intensity: number,
    offRoad: boolean,
  ) {
    this.spawnAccumulator += intensity * delta * 24;
    while (this.spawnAccumulator >= 1) {
      this.spawn(position, up, backward, offRoad);
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
      puff.mesh.position.addScaledVector(up, delta * 0.012);
      const progress = 1 - puff.life / puff.maxLife;
      puff.mesh.scale.setScalar(0.6 + progress * 2.4);
      const material = puff.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.sin(progress * Math.PI) * 0.3;
    }
  }

  private spawn(
    position: THREE.Vector3,
    up: THREE.Vector3,
    backward: THREE.Vector3,
    offRoad: boolean,
  ) {
    const puff = this.puffs[this.cursor];
    this.cursor = (this.cursor + 1) % this.puffs.length;
    puff.life = offRoad ? 1.25 : 0.78;
    puff.maxLife = puff.life;
    puff.mesh.visible = true;
    puff.mesh.position
      .copy(position)
      .addScaledVector(backward, 0.14)
      .addScaledVector(up, 0.025);
    puff.mesh.scale.setScalar(0.5);
    puff.velocity
      .copy(backward)
      .multiplyScalar(0.05 + Math.random() * 0.04)
      .addScaledVector(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
        ),
        1,
      );
    const material = puff.mesh.material as THREE.MeshBasicMaterial;
    material.color.setHex(offRoad ? 0xc9a975 : 0xe8e2d7);
  }

  dispose() {
    for (const puff of this.puffs) {
      puff.mesh.geometry.dispose();
      (puff.mesh.material as THREE.Material).dispose();
    }
  }
}
