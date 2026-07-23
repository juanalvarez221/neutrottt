/**
 * Framing escalable por región/lado — no hardcodea 81 cámaras.
 *
 * Estrategia:
 * 1. Mapear atomic → bodySection (head|upperBody|arms|torso|pelvis|legs|feet)
 * 2. Aplicar offset de target según section + side
 * 3. Elegir azimuth suave (front/side) según laterality
 * 4. Acercar distancia moderadamente con límites globales
 *
 * Límites globales (Paso 34):
 * - MIN_FOCUS_DIST_SCALE / MAX_FOCUS_DIST_SCALE respecto a framing.distance
 * - MAX_YAW_DELTA radianos (nunca rotar de más)
 */

import { Vector3 } from "three";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
import { BODY_ZONES_BY_ID } from "@/widgets/body-3d/domain/bodyZones";

export type BodySection =
  | "head"
  | "upperBody"
  | "arms"
  | "torso"
  | "pelvis"
  | "legs"
  | "feet";

export type CameraFocusPose = {
  position: Vector3;
  target: Vector3;
};

/** Distancia mínima relativa al cuerpo completo (nunca zoom excesivo). */
export const MIN_FOCUS_DIST_SCALE = 0.58;
/** Distancia máxima relativa (sigue viéndose contexto corporal). */
export const MAX_FOCUS_DIST_SCALE = 0.92;
/** Yaw automático máximo en radianes (~20°). */
export const MAX_YAW_DELTA = 0.35;
/** Bias posterior máximo (espalda/nuca) — moderado, no 180°. */
export const MAX_BACK_BIAS = Math.PI * 0.42;

function sectionForAtomic(atomicId: string): BodySection {
  if (
    atomicId.includes("neck") ||
    atomicId.includes("face") ||
    atomicId.includes("head_") ||
    atomicId.includes("_ear")
  ) {
    return "head";
  }
  if (atomicId.includes("shoulder") || atomicId.includes("scapula")) {
    return "upperBody";
  }
  if (
    atomicId.includes("upper_arm") ||
    atomicId.includes("forearm") ||
    atomicId.includes("elbow") ||
    atomicId.includes("wrist") ||
    atomicId.includes("hand")
  ) {
    return "arms";
  }
  if (
    atomicId.includes("hip") ||
    atomicId.includes("glute") ||
    atomicId.includes("sacrum")
  ) {
    return "pelvis";
  }
  if (atomicId.includes("foot") || atomicId.includes("ankle")) {
    return "feet";
  }
  if (
    atomicId.includes("thigh") ||
    atomicId.includes("knee") ||
    atomicId.includes("lower_leg")
  ) {
    return "legs";
  }
  return "torso";
}

const SECTION_Y: Record<BodySection, number> = {
  head: 0.38,
  upperBody: 0.22,
  arms: 0.12,
  torso: 0.02,
  pelvis: -0.12,
  legs: -0.28,
  feet: -0.42,
};

const SECTION_DIST_SCALE: Record<BodySection, number> = {
  head: 0.68,
  upperBody: 0.74,
  arms: 0.72,
  torso: 0.86,
  pelvis: 0.8,
  legs: 0.76,
  feet: 0.7,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Pose de cámara suave para enfocar una zona atómica activa.
 * El usuario sigue pudiendo orbitar inmediatamente después.
 */
export function getCameraFocusForAtomicZone(
  atomicId: string,
  framing: BodyCameraFraming,
): CameraFocusPose {
  const zone = BODY_ZONES_BY_ID[atomicId];
  const section = sectionForAtomic(atomicId);
  const side = zone?.side ?? "center";

  const [bx, by, bz] = framing.target;
  const baseDist = framing.distance;

  const yOff = SECTION_Y[section] * baseDist * 0.35;
  const xOff =
    side === "left" ? -0.16 * baseDist : side === "right" ? 0.16 * baseDist : 0;

  const target = new Vector3(bx + xOff, by + yOff, bz);
  const dist =
    baseDist *
    clamp(
      SECTION_DIST_SCALE[section],
      MIN_FOCUS_DIST_SCALE,
      MAX_FOCUS_DIST_SCALE,
    );

  const yawRaw = side === "left" ? -0.32 : side === "right" ? 0.32 : 0;
  const yaw = clamp(yawRaw, -MAX_YAW_DELTA, MAX_YAW_DELTA);

  const pitchBoost = section === "head" ? 0.06 : 0;
  const backBiasRaw =
    atomicId.includes("_back") ||
    atomicId.includes("nuca") ||
    atomicId.includes("head_back")
      ? MAX_BACK_BIAS
      : 0;

  const angle = yaw + backBiasRaw;
  const elev = 0.1 + pitchBoost;
  const position = new Vector3(
    target.x + Math.sin(angle) * dist,
    target.y + elev * dist,
    target.z + Math.cos(angle) * dist,
  );

  return { position, target };
}

export function getFullBodyCameraPose(
  framing: BodyCameraFraming,
): CameraFocusPose {
  const [tx, ty, tz] = framing.target;
  return {
    position: new Vector3(tx, ty, tz + framing.distance),
    target: new Vector3(tx, ty, tz),
  };
}

/** Distancia de focus relativa al cuerpo completo (para tests). */
export function getFocusDistanceScale(
  atomicId: string,
  framing: BodyCameraFraming,
): number {
  const pose = getCameraFocusForAtomicZone(atomicId, framing);
  return pose.position.distanceTo(pose.target) / framing.distance;
}
