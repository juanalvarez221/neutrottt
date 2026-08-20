/**
 * Interpolación orbital de cámara (esférica alrededor del look-at).
 * Un lerp lineal frente→espalda atraviesa el cuerpo y OrbitControls
 * reconstruye un azimuth inestable — por eso la vista no llegaba.
 */

import { Spherical, Vector3 } from "three";

export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const MIN_RADIUS = 0.12;
const ANGLE_EPS = 0.012;
const RADIUS_EPS = 0.01;
const LOOK_EPS = 0.008;

function sphericalFrom(position: Vector3, look: Vector3, out: Spherical): Spherical {
  out.setFromVector3(position.clone().sub(look));
  if (out.radius < MIN_RADIUS) out.radius = MIN_RADIUS;
  out.makeSafe();
  return out;
}

export function isOrbitStepSettled(
  currentPos: Vector3,
  currentLook: Vector3,
  targetPos: Vector3,
  targetLook: Vector3,
): boolean {
  const current = sphericalFrom(currentPos, currentLook, new Spherical());
  const destination = sphericalFrom(targetPos, targetLook, new Spherical());
  const angleDone =
    Math.abs(shortestAngleDelta(current.theta, destination.theta)) < ANGLE_EPS &&
    Math.abs(current.phi - destination.phi) < ANGLE_EPS;
  const radiusDone = Math.abs(current.radius - destination.radius) < RADIUS_EPS;
  const lookDone = currentLook.distanceTo(targetLook) < LOOK_EPS;
  return angleDone && radiusDone && lookDone;
}

/**
 * Un paso de órbita. Mutates `outPos` / `outLook`.
 * `alpha` en (0, 1] — smoothing exponencial típico ~0.08–0.2 por frame.
 */
export function stepOrbitCamera(
  currentPos: Vector3,
  currentLook: Vector3,
  targetPos: Vector3,
  targetLook: Vector3,
  alpha: number,
  outPos: Vector3,
  outLook: Vector3,
): boolean {
  const t = Math.min(1, Math.max(0, alpha));
  const current = sphericalFrom(currentPos, currentLook, new Spherical());
  const destination = sphericalFrom(targetPos, targetLook, new Spherical());

  current.theta += shortestAngleDelta(current.theta, destination.theta) * t;
  current.phi += (destination.phi - current.phi) * t;
  current.radius += (destination.radius - current.radius) * t;
  current.makeSafe();

  outLook.copy(currentLook).lerp(targetLook, t);
  outPos.setFromSpherical(current).add(outLook);

  return isOrbitStepSettled(outPos, outLook, targetPos, targetLook);
}
