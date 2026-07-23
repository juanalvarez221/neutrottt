/**
 * Framing escalable por región/lado — no hardcodea 81 cámaras.
 *
 * Las vistas posteriores usan el hemisferio BACK real del contrato
 * `bodyModelCoordinateSystem` — nunca un bias ~68°.
 */

import { Vector3 } from "three";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
import {
  resolveCanonicalAzimuth,
  type CanonicalBodyView,
} from "@/widgets/body-3d/domain/bodyModelCoordinateSystem";
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
export const MIN_FOCUS_DIST_SCALE = 0.62;
/** Distancia máxima relativa (sigue viéndose contexto corporal). */
export const MAX_FOCUS_DIST_SCALE = 0.92;

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
  head: 0.72,
  upperBody: 0.76,
  arms: 0.74,
  torso: 0.86,
  pelvis: 0.82,
  legs: 0.78,
  feet: 0.74,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isPosteriorAtomic(atomicId: string): boolean {
  return (
    atomicId.includes("_back") ||
    atomicId.includes("nuca") ||
    atomicId.includes("head_back") ||
    atomicId.includes("scapula") ||
    atomicId.includes("glute") ||
    atomicId.includes("triceps") ||
    atomicId.includes("calf") ||
    atomicId.includes("lower_leg_back") ||
    atomicId.includes("thigh_back")
  );
}

function canonicalViewForAtomic(atomicId: string): CanonicalBodyView {
  const zone = BODY_ZONES_BY_ID[atomicId];
  const side = zone?.side ?? "center";
  const posterior = isPosteriorAtomic(atomicId);

  if (posterior) {
    if (side === "left") return "BACK_LEFT";
    if (side === "right") return "BACK_RIGHT";
    return "BACK";
  }
  if (side === "left") return "FRONT_LEFT";
  if (side === "right") return "FRONT_RIGHT";
  return "FRONT";
}

/**
 * Pose de cámara para enfocar una zona atómica activa.
 * Vistas posteriores = BACK canónico real (no bias parcial).
 */
export function getCameraFocusForAtomicZone(
  atomicId: string,
  framing: BodyCameraFraming,
): CameraFocusPose {
  const section = sectionForAtomic(atomicId);
  const side = BODY_ZONES_BY_ID[atomicId]?.side ?? "center";

  const [bx, by, bz] = framing.target;
  const baseDist = framing.distance;

  const yOff = SECTION_Y[section] * baseDist * 0.35;
  const xOff =
    side === "left" ? 0.16 * baseDist : side === "right" ? -0.16 * baseDist : 0;

  const target = new Vector3(bx + xOff, by + yOff, bz);
  const dist =
    baseDist *
    clamp(
      SECTION_DIST_SCALE[section],
      MIN_FOCUS_DIST_SCALE,
      MAX_FOCUS_DIST_SCALE,
    );

  const az = resolveCanonicalAzimuth(canonicalViewForAtomic(atomicId));
  const pitchBoost = section === "head" ? 0.06 : 0;
  const elev = 0.1 + pitchBoost;
  const position = new Vector3(
    target.x + Math.sin(az) * dist,
    target.y + elev * dist,
    target.z + Math.cos(az) * dist,
  );

  return { position, target };
}

export function getFullBodyCameraPose(
  framing: BodyCameraFraming,
): CameraFocusPose {
  const [tx, ty, tz] = framing.target;
  const az = resolveCanonicalAzimuth("FRONT");
  return {
    position: new Vector3(
      tx + Math.sin(az) * framing.distance,
      ty,
      tz + Math.cos(az) * framing.distance,
    ),
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
