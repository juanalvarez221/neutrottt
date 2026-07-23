/**
 * Framing escalable por región/lado — no hardcodea 81 cámaras.
 *
 * Estrategia:
 * 1. Mapear atomic → bodySection (head|upperBody|arms|torso|pelvis|legs|feet)
 * 2. Aplicar offset de target según section + side
 * 3. Elegir azimuth suave (front/side) según laterality
 * 4. Acercar distancia moderadamente (nunca agresivo)
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
  head: 0.62,
  upperBody: 0.72,
  arms: 0.7,
  torso: 0.85,
  pelvis: 0.78,
  legs: 0.75,
  feet: 0.65,
};

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
    side === "left" ? -0.18 * baseDist : side === "right" ? 0.18 * baseDist : 0;

  const target = new Vector3(bx + xOff, by + yOff, bz);
  const dist = baseDist * SECTION_DIST_SCALE[section];

  // Azimuth: prefer front, lean slightly toward the active side
  const yaw =
    side === "left" ? -0.35 : side === "right" ? 0.35 : 0;
  // Head/back zones lean toward posterior when name suggests back
  const pitchBoost = section === "head" ? 0.08 : 0;
  const backBias =
    atomicId.includes("_back") || atomicId.includes("nuca") ? Math.PI * 0.55 : 0;

  const angle = yaw + backBias;
  const elev = 0.12 + pitchBoost;
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
