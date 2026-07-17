import * as THREE from "three";

type WheelAssembly = {
  pivot: THREE.Group;
  wheel: THREE.Mesh;
};

export class CarMesh {
  readonly group = new THREE.Group();
  readonly bodyMaterial: THREE.MeshStandardMaterial;

  private readonly visual = new THREE.Group();
  private readonly wheels: WheelAssembly[] = [];
  private readonly frontWheels: WheelAssembly[] = [];
  private wheelRotation = 0;

  constructor(color: number) {
    this.group.name = "player-car";
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.08,
      flatShading: true,
    });
    this.group.add(this.visual);
    this.buildBody();
    this.buildWheels();
    this.group.scale.setScalar(0.72);
  }

  private addMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale?: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.visual.add(mesh);
    return mesh;
  }

  private buildBody() {
    const cream = new THREE.MeshStandardMaterial({
      color: 0xffefd1,
      roughness: 0.72,
      flatShading: true,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x8fd1df,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x24272b,
      roughness: 0.65,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xe7e2d6,
      roughness: 0.3,
      metalness: 0.5,
    });
    const headlight = new THREE.MeshBasicMaterial({ color: 0xfff4b0 });
    const taillight = new THREE.MeshBasicMaterial({ color: 0xf24b45 });

    const chassis = this.addMesh(
      new THREE.BoxGeometry(0.38, 0.13, 0.62, 2, 1, 2),
      this.bodyMaterial,
      [0, 0.11, 0],
    );
    chassis.geometry.rotateX(0.015);

    this.addMesh(
      new THREE.BoxGeometry(0.33, 0.08, 0.22),
      this.bodyMaterial,
      [0, 0.19, 0.18],
    );
    this.addMesh(
      new THREE.BoxGeometry(0.3, 0.17, 0.25),
      cream,
      [0, 0.235, -0.07],
    );

    const windshield = this.addMesh(
      new THREE.BoxGeometry(0.25, 0.11, 0.012),
      glass,
      [0, 0.275, 0.061],
    );
    windshield.rotation.x = -0.19;
    const rearWindow = this.addMesh(
      new THREE.BoxGeometry(0.245, 0.1, 0.012),
      glass,
      [0, 0.27, -0.196],
    );
    rearWindow.rotation.x = 0.16;

    this.addMesh(
      new THREE.BoxGeometry(0.012, 0.1, 0.15),
      glass,
      [-0.157, 0.265, -0.06],
    );
    this.addMesh(
      new THREE.BoxGeometry(0.012, 0.1, 0.15),
      glass,
      [0.157, 0.265, -0.06],
    );

    this.addMesh(
      new THREE.BoxGeometry(0.42, 0.035, 0.07),
      chrome,
      [0, 0.07, 0.322],
    );
    this.addMesh(
      new THREE.BoxGeometry(0.42, 0.035, 0.06),
      chrome,
      [0, 0.075, -0.31],
    );

    for (const x of [-0.12, 0.12]) {
      this.addMesh(
        new THREE.BoxGeometry(0.07, 0.045, 0.012),
        headlight,
        [x, 0.15, 0.318],
      );
      this.addMesh(
        new THREE.BoxGeometry(0.065, 0.04, 0.012),
        taillight,
        [x, 0.145, -0.316],
      );
    }

    this.addMesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.12, 8),
      dark,
      [0, 0.325, -0.08],
    );
    const driverHead = this.addMesh(
      new THREE.SphereGeometry(0.055, 10, 7),
      new THREE.MeshStandardMaterial({
        color: 0xf0bd91,
        roughness: 0.9,
        flatShading: true,
      }),
      [0, 0.415, -0.07],
    );
    driverHead.scale.y = 1.08;

    const scarf = this.addMesh(
      new THREE.BoxGeometry(0.035, 0.012, 0.18),
      new THREE.MeshStandardMaterial({
        color: 0xf4c547,
        roughness: 0.9,
      }),
      [0.03, 0.38, -0.2],
    );
    scarf.rotation.y = -0.18;
  }

  private buildWheels() {
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x202225,
      roughness: 0.92,
    });
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5d7b8,
      roughness: 0.38,
      metalness: 0.25,
    });

    for (const z of [-0.2, 0.2]) {
      for (const x of [-0.205, 0.205]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.07, z);
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.071, 0.071, 0.055, 12),
          tireMaterial,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        pivot.add(wheel);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.032, 0.058, 10),
          hubMaterial,
        );
        hub.rotation.z = Math.PI / 2;
        wheel.add(hub);
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
    this.wheelRotation += speed * delta * 5.8;
    for (const assembly of this.wheels) {
      assembly.wheel.rotation.x = this.wheelRotation;
    }
    for (const assembly of this.frontWheels) {
      assembly.pivot.rotation.y = -steering * 0.45;
    }
    this.visual.rotation.z = THREE.MathUtils.lerp(
      this.visual.rotation.z,
      -steering * Math.min(Math.abs(speed), 1) * 0.07,
      1 - Math.exp(-delta * 8),
    );
    this.visual.rotation.y = THREE.MathUtils.lerp(
      this.visual.rotation.y,
      -drift * 0.16,
      1 - Math.exp(-delta * 7),
    );
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
