import * as THREE from "three";
import type { Car, CarTelemetry } from "../vehicle/Car";

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly car: Car;
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly smoothedLookTarget = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly compactView: boolean;
  private shake = 0;

  constructor(camera: THREE.PerspectiveCamera, car: Car) {
    this.camera = camera;
    this.car = car;
    this.compactView = window.innerWidth < 760;
  }

  snap() {
    const position = this.car.mesh.group.position;
    this.camera.position
      .copy(position)
      .addScaledVector(this.car.normal, this.compactView ? 0.7 : 0.62)
      .addScaledVector(this.car.forward, this.compactView ? -1.28 : -1.05);
    this.smoothedLookTarget
      .copy(position)
      .addScaledVector(this.car.forward, 0.42)
      .addScaledVector(this.car.normal, 0.09);
    this.camera.up.copy(this.car.normal);
    this.camera.lookAt(this.smoothedLookTarget);
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(delta: number, telemetry: CarTelemetry) {
    const carPosition = this.car.mesh.group.position;
    const distance =
      (this.compactView ? 1.18 : 0.92) + telemetry.speedRatio * 0.34;
    const height =
      (this.compactView ? 0.58 : 0.47) + telemetry.speedRatio * 0.12;
    this.right
      .crossVectors(this.car.normal, this.car.forward)
      .normalize();

    this.desiredPosition
      .copy(carPosition)
      .addScaledVector(this.car.forward, -distance)
      .addScaledVector(this.car.normal, height)
      .addScaledVector(this.right, telemetry.drift * 0.08);

    const positionAlpha = 1 - Math.exp(-delta * 7.5);
    this.camera.position.lerp(this.desiredPosition, positionAlpha);

    this.lookTarget
      .copy(carPosition)
      .addScaledVector(this.car.forward, 0.48 + telemetry.speedRatio * 0.42)
      .addScaledVector(this.car.normal, 0.08);
    this.smoothedLookTarget.lerp(
      this.lookTarget,
      1 - Math.exp(-delta * 9),
    );
    this.camera.up.lerp(this.car.normal, 1 - Math.exp(-delta * 12)).normalize();

    this.shake *= Math.exp(-delta * 5);
    if (this.shake > 0.001) {
      const strength = this.shake * this.shake * 0.022;
      this.camera.position
        .addScaledVector(this.right, (Math.random() - 0.5) * strength)
        .addScaledVector(this.car.normal, (Math.random() - 0.5) * strength);
    }

    this.camera.lookAt(this.smoothedLookTarget);
    const targetFov = 59 + telemetry.speedRatio * 18;
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      targetFov,
      1 - Math.exp(-delta * 4),
    );
    this.camera.updateProjectionMatrix();
  }
}
