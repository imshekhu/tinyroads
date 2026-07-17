import * as THREE from "three";

const fallbackNorth = new THREE.Vector3(0, 0, -1);
const worldNorth = new THREE.Vector3(0, 1, 0);
const moveQuaternion = new THREE.Quaternion();

export type TangentFrame = {
  up: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
};

export function tangentNorth(
  normal: THREE.Vector3,
  target = new THREE.Vector3(),
) {
  target.copy(worldNorth).addScaledVector(normal, -worldNorth.dot(normal));
  if (target.lengthSq() < 0.0001) {
    target
      .copy(fallbackNorth)
      .addScaledVector(normal, -fallbackNorth.dot(normal));
  }
  return target.normalize();
}

export function frameFromForward(
  normal: THREE.Vector3,
  forward: THREE.Vector3,
): TangentFrame {
  const up = normal.clone().normalize();
  const tangentForward = forward
    .clone()
    .addScaledVector(up, -forward.dot(up))
    .normalize();
  const right = new THREE.Vector3().crossVectors(up, tangentForward).normalize();
  return { up, forward: tangentForward, right };
}

export function orientationFromFrame(
  normal: THREE.Vector3,
  forward: THREE.Vector3,
  target = new THREE.Quaternion(),
) {
  const frame = frameFromForward(normal, forward);
  const matrix = new THREE.Matrix4().makeBasis(
    frame.right,
    frame.up,
    frame.forward,
  );
  return target.setFromRotationMatrix(matrix);
}

export function rotateTangent(
  vector: THREE.Vector3,
  normal: THREE.Vector3,
  radians: number,
) {
  return vector
    .applyAxisAngle(normal, radians)
    .addScaledVector(normal, -vector.dot(normal))
    .normalize();
}

export function moveAlongSphere(
  normal: THREE.Vector3,
  tangent: THREE.Vector3,
  arcRadians: number,
) {
  const axis = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  moveQuaternion.setFromAxisAngle(axis, arcRadians);
  normal.applyQuaternion(moveQuaternion).normalize();
  tangent
    .applyQuaternion(moveQuaternion)
    .addScaledVector(normal, -tangent.dot(normal))
    .normalize();
}

export function angularDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
}

export function slerpDirection(
  from: THREE.Vector3,
  to: THREE.Vector3,
  alpha: number,
  target = new THREE.Vector3(),
) {
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 0.00001) return target.copy(to);

  const sin = Math.sin(angle);
  const a = Math.sin((1 - alpha) * angle) / sin;
  const b = Math.sin(alpha * angle) / sin;
  return target.copy(from).multiplyScalar(a).addScaledVector(to, b).normalize();
}
