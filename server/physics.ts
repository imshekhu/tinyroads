import * as THREE from "three";
import type {
  NetworkDriveInput,
  NetworkPlayerState,
} from "../shared/protocol";

export type ServerPlayer = {
  state: NetworkPlayerState;
  input: NetworkDriveInput;
  lastScoreAt: number;
};

const idleInput: NetworkDriveInput = {
  sequence: 0,
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: false,
  boost: false,
  clientTime: 0,
};

export function createServerPlayer(
  id: string,
  name: string,
  color: number,
  spawnOffset: number,
): ServerPlayer {
  const theta = spawnOffset * 0.018;
  const normal = new THREE.Vector3(
    Math.cos(theta),
    0.028 + spawnOffset * 0.002,
    Math.sin(theta),
  ).normalize();
  const forward = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta))
    .addScaledVector(normal, -normal.dot(new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta))))
    .normalize();
  return {
    state: {
      id,
      name,
      color,
      normal: normal.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
      speed: 0,
      lastInputSequence: 0,
      score: 0,
    },
    input: { ...idleInput },
    lastScoreAt: 0,
  };
}

export function simulatePlayer(player: ServerPlayer, delta: number) {
  const input = player.input;
  const state = player.state;
  let speed = state.speed;
  const maxSpeed = input.boost ? 2.72 : 2.08;

  if (input.throttle > 0) speed += 1.78 * input.throttle * delta;
  if (input.brake > 0) {
    speed =
      speed > 0
        ? Math.max(0, speed - 2.45 * input.brake * delta)
        : Math.max(-0.42, speed - 0.72 * input.brake * delta);
  }
  if (input.throttle === 0 && input.brake === 0) {
    const drag = 0.16 * delta;
    speed =
      Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
  }
  if (input.handbrake) speed *= Math.exp(-delta * 0.45);
  speed = THREE.MathUtils.clamp(speed, -0.42, maxSpeed);

  const normal = new THREE.Vector3().fromArray(state.normal);
  const forward = new THREE.Vector3().fromArray(state.forward);
  const speedRatio = Math.min(1, Math.abs(speed) / 2.08);
  const turn =
    -input.steering *
    (0.35 + speedRatio * 0.9) *
    (input.handbrake ? 1.3 : 1) *
    Math.sign(speed || 1) *
    delta;
  forward
    .applyAxisAngle(normal, turn)
    .addScaledVector(normal, -forward.dot(normal))
    .normalize();

  if (Math.abs(speed) > 0.0001) {
    const axis = new THREE.Vector3().crossVectors(normal, forward).normalize();
    const movement = new THREE.Quaternion().setFromAxisAngle(
      axis,
      (speed * delta) / 6,
    );
    normal.applyQuaternion(movement).normalize();
    forward
      .applyQuaternion(movement)
      .addScaledVector(normal, -forward.dot(normal))
      .normalize();
  }

  state.normal = normal.toArray() as [number, number, number];
  state.forward = forward.toArray() as [number, number, number];
  state.speed = speed;
  state.lastInputSequence = input.sequence;
}
