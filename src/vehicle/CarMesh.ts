import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type WheelAssembly = {
  pivot: THREE.Group;
  wheel: THREE.Mesh;
};

export class CarMesh {
  readonly group = new THREE.Group();
  readonly bodyMaterial: THREE.MeshPhysicalMaterial;

  private readonly visual = new THREE.Group();
  private readonly wheels: WheelAssembly[] = [];
  private readonly frontWheels: WheelAssembly[] = [];
  private wheelRotation = 0;

  constructor(color: number) {
    this.group.name = "modern-player-car";
    this.bodyMaterial = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.24,
      metalness: 0.42,
      clearcoat: 0.8,
      clearcoatRoughness: 0.16,
    });
    this.group.add(this.visual);
    this.buildBody();
    this.buildWheels();
    this.group.scale.setScalar(0.38);
  }

  private addMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.visual.add(mesh);
    return mesh;
  }

  private buildBody() {
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x163b4c,
      roughness: 0.08,
      metalness: 0.15,
      transmission: 0.18,
      transparent: true,
      opacity: 0.9,
      clearcoat: 1,
    });
    const carbon = new THREE.MeshStandardMaterial({
      color: 0x171a1d,
      roughness: 0.32,
      metalness: 0.45,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xaeb8bb,
      roughness: 0.24,
      metalness: 0.82,
    });
    const headlight = new THREE.MeshBasicMaterial({ color: 0xe9fbff });
    const taillight = new THREE.MeshBasicMaterial({ color: 0xff3148 });

    this.addMesh(
      new RoundedBoxGeometry(0.34, 0.1, 0.66, 4, 0.045),
      this.bodyMaterial,
      [0, 0.105, 0],
    );
    const hood = this.addMesh(
      new RoundedBoxGeometry(0.31, 0.07, 0.28, 3, 0.035),
      this.bodyMaterial,
      [0, 0.165, 0.19],
    );
    hood.rotation.x = -0.035;

    const cabin = this.addMesh(
      new RoundedBoxGeometry(0.255, 0.13, 0.27, 4, 0.05),
      glass,
      [0, 0.225, -0.055],
    );
    cabin.scale.set(0.96, 1, 1);
    const roof = this.addMesh(
      new RoundedBoxGeometry(0.22, 0.028, 0.22, 3, 0.02),
      carbon,
      [0, 0.298, -0.062],
    );
    roof.rotation.x = 0.01;

    for (const x of [-0.145, 0.145]) {
      this.addMesh(
        new RoundedBoxGeometry(0.055, 0.025, 0.018, 2, 0.008),
        headlight,
        [x, 0.145, 0.329],
      );
      this.addMesh(
        new RoundedBoxGeometry(0.07, 0.022, 0.014, 2, 0.007),
        taillight,
        [x, 0.15, -0.331],
      );
    }

    this.addMesh(
      new RoundedBoxGeometry(0.36, 0.025, 0.05, 2, 0.008),
      carbon,
      [0, 0.07, 0.325],
    );
    this.addMesh(
      new RoundedBoxGeometry(0.37, 0.025, 0.055, 2, 0.008),
      carbon,
      [0, 0.07, -0.325],
    );
    for (const x of [-0.18, 0.18]) {
      this.addMesh(
        new RoundedBoxGeometry(0.025, 0.025, 0.5, 2, 0.008),
        carbon,
        [x, 0.065, -0.015],
      );
    }

    const spoiler = this.addMesh(
      new RoundedBoxGeometry(0.32, 0.018, 0.055, 2, 0.007),
      carbon,
      [0, 0.23, -0.32],
    );
    spoiler.rotation.x = -0.08;
    for (const x of [-0.11, 0.11]) {
      this.addMesh(
        new THREE.BoxGeometry(0.018, 0.09, 0.018),
        metal,
        [x, 0.185, -0.3],
      );
    }

    const headlamp = new THREE.SpotLight(
      0xeaf7ff,
      5.4,
      3.4,
      0.43,
      0.7,
      1.1,
    );
    headlamp.position.set(0, 0.14, 0.29);
    headlamp.target.position.set(0, 0.01, 2.2);
    headlamp.castShadow = false;
    this.visual.add(headlamp, headlamp.target);
  }

  private buildWheels() {
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x101214,
      roughness: 0.86,
    });
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8c2c5,
      roughness: 0.22,
      metalness: 0.88,
    });

    for (const z of [-0.215, 0.215]) {
      for (const x of [-0.19, 0.19]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.065, z);
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.068, 0.068, 0.047, 18),
          tireMaterial,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.038, 0.05, 10),
          rimMaterial,
        );
        rim.rotation.z = Math.PI / 2;
        wheel.add(rim);
        pivot.add(wheel);
        this.visual.add(pivot);
        const assembly = { pivot, wheel };
        this.wheels.push(assembly);
        if (z > 0) this.frontWheels.push(assembly);
      }
    }
  }

  setColor(color: number) {
    this.bodyMaterial.color.setHex(color);
  }

  update(speed: number, steering: number, delta: number, drift: number) {
    const slip = Math.min(1.35, Math.abs(drift));
    const speedFactor = Math.min(Math.abs(speed), 1.4);
    this.wheelRotation += speed * delta * (6.4 + slip * 1.8);
    for (const assembly of this.wheels) {
      assembly.wheel.rotation.x = this.wheelRotation;
    }
    for (const assembly of this.frontWheels) {
      assembly.pivot.rotation.y = -steering * (0.42 + slip * 0.12);
    }
    // Body rolls into the slide and yaws harder so drifts read clearly.
    this.visual.rotation.z = THREE.MathUtils.lerp(
      this.visual.rotation.z,
      -steering * speedFactor * 0.05 - Math.sign(drift || steering || 1) * slip * 0.08,
      1 - Math.exp(-delta * 10),
    );
    this.visual.rotation.y = THREE.MathUtils.lerp(
      this.visual.rotation.y,
      -drift * 0.28,
      1 - Math.exp(-delta * 9),
    );
    this.visual.rotation.x = THREE.MathUtils.lerp(
      this.visual.rotation.x,
      -slip * 0.035,
      1 - Math.exp(-delta * 8),
    );
    this.visual.position.y = THREE.MathUtils.lerp(
      this.visual.position.y,
      slip * 0.012,
      1 - Math.exp(-delta * 8),
    );
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
