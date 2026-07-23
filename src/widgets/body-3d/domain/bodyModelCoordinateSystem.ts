/**
 * Único contrato de orientación del BodyVisual en runtime (glTF / Three.js).
 *
 * Verificado sobre `neutro_body_v1.glb`:
 * - UP = +Y (pies en Y≈0, cabeza en Y≈1.73)
 * - FORWARD (frente anatómico) = +Z (nariz / pecho con normales +Z)
 * - BACK = −Z (occipucio / dorsal con normales −Z)
 * - LEFT anatómico = +X
 * - RIGHT anatómico = −X
 *
 * Blender fuente: frente −Y, up +Z → remapeo glTF (−Y→+Z, Z→+Y).
 * No duplicar signos de orientación fuera de este módulo.
 */

import { Vector3 } from "three";

/** Frente anatómico del modelo en espacio mundo de la escena. */
export const MODEL_FORWARD = Object.freeze(new Vector3(0, 0, 1));
/** Espalda anatómica. */
export const MODEL_BACK = Object.freeze(new Vector3(0, 0, -1));
/** Arriba (pies → cabeza). */
export const MODEL_UP = Object.freeze(new Vector3(0, 1, 0));
/** Izquierda anatómica del sujeto. */
export const MODEL_LEFT = Object.freeze(new Vector3(1, 0, 0));
/** Derecha anatómica del sujeto. */
export const MODEL_RIGHT = Object.freeze(new Vector3(-1, 0, 0));

export type CanonicalBodyView =
  | "FRONT"
  | "BACK"
  | "LEFT"
  | "RIGHT"
  | "FRONT_LEFT"
  | "FRONT_RIGHT"
  | "BACK_LEFT"
  | "BACK_RIGHT";

/**
 * Azimuth (rad) desde MODEL_FORWARD (+Z).
 * Posición cámara = target + (sin(az), elev, cos(az)) * dist
 * → FRONT +Z, BACK −Z, LEFT anatómico +X, RIGHT anatómico −X.
 */
export function resolveCanonicalAzimuth(view: CanonicalBodyView): number {
  switch (view) {
    case "FRONT":
      return 0;
    case "BACK":
      return Math.PI;
    case "LEFT":
      return Math.PI / 2;
    case "RIGHT":
      return -Math.PI / 2;
    case "FRONT_LEFT":
      return Math.PI / 4;
    case "FRONT_RIGHT":
      return -Math.PI / 4;
    case "BACK_LEFT":
      return (3 * Math.PI) / 4;
    case "BACK_RIGHT":
      return (-3 * Math.PI) / 4;
  }
}

export function azimuthForCanonicalView(view: CanonicalBodyView): number {
  return resolveCanonicalAzimuth(view);
}

/** Dirección horizontal unitaria target → cámara para una vista canónica. */
export function cameraDirectionForCanonicalView(
  view: CanonicalBodyView,
): Vector3 {
  const az = resolveCanonicalAzimuth(view);
  return new Vector3(Math.sin(az), 0, Math.cos(az)).normalize();
}

/** Vector horizontal cámara→origen proyectado; hemisferio respecto a un eje. */
export function horizontalOffsetFromTarget(
  cameraPosition: Vector3,
  target: Vector3,
): Vector3 {
  const offset = new Vector3().subVectors(cameraPosition, target);
  offset.y = 0;
  if (offset.lengthSq() < 1e-12) {
    return MODEL_FORWARD.clone();
  }
  return offset.normalize();
}

/**
 * Dot product en el plano horizontal entre la dirección cámara-desde-target
 * y un eje anatómico (forward/back/left/right).
 */
export function viewHemisphereScore(
  cameraPosition: Vector3,
  target: Vector3,
  axis: Vector3,
): number {
  return horizontalOffsetFromTarget(cameraPosition, target).dot(axis);
}

/** True si la cámara está en el hemisferio indicado (±cos(tol) ≈ tolerancia angular). */
export function isCameraInHemisphere(
  cameraPosition: Vector3,
  target: Vector3,
  axis: Vector3,
  toleranceDeg = 5,
): boolean {
  const minDot = Math.cos((toleranceDeg * Math.PI) / 180);
  return viewHemisphereScore(cameraPosition, target, axis) >= minDot;
}

/** True si está en el hemisferio posterior real (dot con MODEL_BACK ≥ 0, con tol). */
export function isCameraInPosteriorHemisphere(
  cameraPosition: Vector3,
  target: Vector3,
  toleranceDeg = 5,
): boolean {
  // Hemisferio: score > 0 respecto a BACK; canónico estricto usa toleranceDeg.
  const score = viewHemisphereScore(cameraPosition, target, MODEL_BACK);
  if (toleranceDeg >= 90) return score > 0;
  return score >= Math.cos((toleranceDeg * Math.PI) / 180);
}

export function isCameraInAnteriorHemisphere(
  cameraPosition: Vector3,
  target: Vector3,
  toleranceDeg = 5,
): boolean {
  const score = viewHemisphereScore(cameraPosition, target, MODEL_FORWARD);
  if (toleranceDeg >= 90) return score > 0;
  return score >= Math.cos((toleranceDeg * Math.PI) / 180);
}

/** Landmarks de auditoría runtime (espacio glTF ya cargado). */
export type RuntimeOrientationLandmarks = {
  /** Punto frontal inequívoco (nariz / pecho anterior). */
  frontSample: Vector3;
  /** Punto posterior inequívoco (occipucio / dorsal). */
  backSample: Vector3;
  /** Muestra anatómica izquierda. */
  leftSample: Vector3;
  /** Muestra anatómica derecha. */
  rightSample: Vector3;
};

/**
 * Infiere el forward runtime a partir de landmarks inequívocos.
 * frontSample debe estar más hacia el frente que backSample.
 */
export function inferRuntimeForwardAxis(
  landmarks: RuntimeOrientationLandmarks,
): Vector3 {
  const delta = new Vector3().subVectors(
    landmarks.frontSample,
    landmarks.backSample,
  );
  delta.y = 0;
  if (delta.lengthSq() < 1e-10) {
    return MODEL_FORWARD.clone();
  }
  return delta.normalize();
}

export function inferRuntimeLeftAxis(
  landmarks: RuntimeOrientationLandmarks,
): Vector3 {
  const delta = new Vector3().subVectors(
    landmarks.leftSample,
    landmarks.rightSample,
  );
  delta.y = 0;
  if (delta.lengthSq() < 1e-10) {
    return MODEL_LEFT.clone();
  }
  return delta.normalize();
}

export type RuntimeOrientationAudit = {
  runtimeForward: Vector3;
  runtimeBack: Vector3;
  runtimeLeft: Vector3;
  runtimeRight: Vector3;
  matchesContract: boolean;
  forwardDot: number;
  leftDot: number;
};

export function auditRuntimeOrientation(
  landmarks: RuntimeOrientationLandmarks,
  alignmentMinDot = 0.95,
): RuntimeOrientationAudit {
  const runtimeForward = inferRuntimeForwardAxis(landmarks);
  const runtimeBack = runtimeForward.clone().multiplyScalar(-1);
  const runtimeLeft = inferRuntimeLeftAxis(landmarks);
  const runtimeRight = runtimeLeft.clone().multiplyScalar(-1);
  const forwardDot = runtimeForward.dot(MODEL_FORWARD);
  const leftDot = runtimeLeft.dot(MODEL_LEFT);
  return {
    runtimeForward,
    runtimeBack,
    runtimeLeft,
    runtimeRight,
    matchesContract:
      forwardDot >= alignmentMinDot && leftDot >= alignmentMinDot,
    forwardDot,
    leftDot,
  };
}
