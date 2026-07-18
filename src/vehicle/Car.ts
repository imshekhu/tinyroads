import * as THREE from "three";
import { CAR_CLEARANCE, PLANET_RADIUS, ROAD_WIDTH } from "../config";
import type { DriveInput } from "../input/Controls";
import {
  moveAlongSphere,
  orientationFromFrame,
  rotateTangent,
  slerpDirection,
} from "../math/SphericalMath";
import type { Planet } from "../world/Planet";
import { CarMesh } from "./CarMesh";
import { DriftSmoke } from "./DriftSmoke";

export type CarTelemetry = {
  speed: number;
  speedKph: number;
  speedRatio: number;
  onRoad: boolean;
  drift: number;
  boost: number;
  roadProgress: number;
  route: "coast" | "highland" | "connector";
  airborne: boolean;
  airtime: number;
  boundaryHit: boolean;
};

export class Car {
  readonly mesh: CarMesh;
  readonly smoke = new DriftSmoke();
  readonly normal = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  readonly velocityDirection = new THREE.Vector3();

  speed = 0;
  boost = 1;
  onRoad = true;
  driftAmount = 0;
  airborneOffset = 0;
  verticalVelocity = 0;
  airtime = 0;

  private readonly orientation = new THREE.Quaternion();
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly planet: Planet;
  private spawnIndex = 0;

  constructor(planet: Planet, color: number) {
    this.planet = planet;
    this.mesh = new CarMesh(color);
    this.reset();
  }

  reset(index = this.spawnIndex) {
    this.spawnIndex = index;
    const sample =
      this.planet.road.samples[
        ((index % this.planet.road.samples.length) +
          this.planet.road.samples.length) %
          this.planet.road.samples.length
      ];
    this.normal.copy(sample.normal);
    this.forward.copy(sample.tangent);
    this.velocityDirection.copy(this.forward);
    this.speed = 0;
    this.boost = 1;
    this.airborneOffset = 0;
    this.verticalVelocity = 0;
    this.airtime = 0;
    this.applyTransform(true);
  }

  setColor(color: number) {
    this.mesh.setColor(color);
  }

  applyTrackBoost() {
    this.speed = Math.max(this.speed + 0.5, 1.15);
    this.boost = Math.min(1, this.boost + 0.28);
  }

  launch(force = 0.82) {
    if (this.airborneOffset > 0.02 || this.speed < 0.35) return false;
    this.verticalVelocity = force;
    this.airborneOffset = 0.012;
    this.airtime = 0;
    return true;
  }

  reconcile(
    normal: [number, number, number],
    forward: [number, number, number],
    speed: number,
  ) {
    const authoritativeNormal = new THREE.Vector3().fromArray(normal).normalize();
    const authoritativeForward = new THREE.Vector3().fromArray(forward).normalize();
    const error = 1 - this.normal.dot(authoritativeNormal);
    if (error > 0.000002) {
      slerpDirection(
        this.normal,
        authoritativeNormal,
        error > 0.002 ? 0.2 : 0.06,
        this.normal,
      );
      this.forward
        .lerp(authoritativeForward, 0.08)
        .addScaledVector(this.normal, -this.forward.dot(this.normal))
        .normalize();
      this.velocityDirection
        .lerp(this.forward, 0.12)
        .addScaledVector(this.normal, -this.velocityDirection.dot(this.normal))
        .normalize();
    }
    this.speed = THREE.MathUtils.lerp(this.speed, speed, 0.04);
  }

  update(delta: number, input: DriveInput): CarTelemetry {
    const roadInfo = this.planet.road.getRoadInfo(this.normal);
    this.onRoad = roadInfo.distance < ROAD_WIDTH * 0.72;

    const maxForwardSpeed = this.onRoad ? 2.08 : 0.88;
    const maxReverseSpeed = -0.42;
    const acceleration = this.onRoad ? 1.78 : 0.92;
    const boostActive = input.boost && this.boost > 0.015 && this.speed > 0.25;
    const speedLimit = boostActive ? maxForwardSpeed * 1.32 : maxForwardSpeed;

    if (input.throttle > 0) {
      if (this.speed < -0.02) {
        this.speed = Math.min(0, this.speed + 2.5 * input.throttle * delta);
      } else {
        this.speed += acceleration * input.throttle * delta;
      }
    }

    if (input.brake > 0) {
      if (this.speed > 0.04) {
        this.speed = Math.max(0, this.speed - 2.45 * input.brake * delta);
      } else {
        this.speed -= 0.76 * input.brake * delta;
      }
    }

    if (boostActive) {
      this.speed += 1.38 * delta;
      this.boost = Math.max(0, this.boost - delta * 0.32);
    } else {
      this.boost = Math.min(1, this.boost + delta * (this.onRoad ? 0.075 : 0.035));
    }

    const rollingDrag = this.onRoad ? 0.16 : 0.58;
    if (input.throttle === 0 && input.brake === 0) {
      const drag = rollingDrag * delta;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }

    if (input.handbrake) {
      this.speed *= Math.exp(-delta * 0.48);
    }
    this.speed = THREE.MathUtils.clamp(
      this.speed,
      maxReverseSpeed,
      speedLimit,
    );

    const speedRatio = Math.min(1, Math.abs(this.speed) / maxForwardSpeed);
    const steeringAuthority =
      (0.35 + speedRatio * 0.9) *
      (input.handbrake ? 1.32 : 1) *
      Math.sign(this.speed || 1);
    const steeringDelta = -input.steering * steeringAuthority * delta;
    rotateTangent(this.forward, this.normal, steeringDelta);

    const grip = input.handbrake
      ? 1.15
      : this.onRoad
        ? 5.8 - speedRatio * 1.8
        : 2.35;
    const gripAlpha = 1 - Math.exp(-grip * delta);
    slerpDirection(
      this.velocityDirection,
      this.forward,
      gripAlpha,
      this.velocityDirection,
    );

    const signedSlip = this.normal.dot(
      new THREE.Vector3().crossVectors(this.forward, this.velocityDirection),
    );
    this.driftAmount = THREE.MathUtils.lerp(
      this.driftAmount,
      signedSlip * speedRatio * (input.handbrake ? 4.5 : 2.4),
      1 - Math.exp(-delta * 7),
    );

    if (Math.abs(this.speed) > 0.0001) {
      const arc = (this.speed * delta) / PLANET_RADIUS;
      moveAlongSphere(this.normal, this.velocityDirection, arc);
      this.forward
        .addScaledVector(this.normal, -this.forward.dot(this.normal))
        .normalize();
    }

    const boundary = this.planet.road.clampToTrack(this.normal);
    if (boundary.constrained) {
      this.normal.copy(boundary.normal);
      const trackDirection = boundary.info.tangent
        .clone()
        .multiplyScalar(this.forward.dot(boundary.info.tangent) >= 0 ? 1 : -1);
      this.forward
        .lerp(trackDirection, 0.18)
        .addScaledVector(this.normal, -this.forward.dot(this.normal))
        .normalize();
      this.velocityDirection
        .lerp(this.forward, 0.32)
        .addScaledVector(this.normal, -this.velocityDirection.dot(this.normal))
        .normalize();
      this.speed *= 0.86;
      this.onRoad = true;
    }

    if (this.airborneOffset > 0 || this.verticalVelocity > 0) {
      this.verticalVelocity -= 1.42 * delta;
      this.airborneOffset += this.verticalVelocity * delta;
      this.airtime += delta;
      if (this.airborneOffset <= 0) {
        this.airborneOffset = 0;
        this.verticalVelocity = 0;
      }
    } else {
      this.airtime = 0;
    }

    this.applyTransform(false, delta);
    this.mesh.update(this.speed, input.steering, delta, this.driftAmount);

    const position = this.mesh.group.position;
    this.smoke.update(
      delta,
      position,
      this.normal,
      this.velocityDirection.clone().multiplyScalar(-1),
      this.airborneOffset > 0
        ? 0
        : Math.min(
        1,
        Math.abs(this.driftAmount) * 2.4 +
          (!this.onRoad ? speedRatio * 0.65 : 0),
          ),
      !this.onRoad,
    );

    return {
      speed: this.speed,
      speedKph: Math.abs(this.speed) * 82,
      speedRatio,
      onRoad: this.onRoad,
      drift: this.driftAmount,
      boost: this.boost,
      roadProgress: roadInfo.progress,
      route: roadInfo.route,
      airborne: this.airborneOffset > 0,
      airtime: this.airtime,
      boundaryHit: boundary.constrained,
    };
  }

  private applyTransform(immediate: boolean, delta = 0) {
    const radius =
      this.planet.surfaceRadiusAt(this.normal) +
      CAR_CLEARANCE +
      this.airborneOffset;
    this.mesh.group.position.copy(this.normal).multiplyScalar(radius);
    orientationFromFrame(this.normal, this.forward, this.targetOrientation);
    if (immediate) {
      this.orientation.copy(this.targetOrientation);
    } else {
      this.orientation.slerp(
        this.targetOrientation,
        1 - Math.exp(-delta * 14),
      );
    }
    this.mesh.group.quaternion.copy(this.orientation);
  }

  dispose() {
    this.mesh.dispose();
    this.smoke.dispose();
  }
}
