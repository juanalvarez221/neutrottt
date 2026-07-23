/**
 * Vistas preferidas y poses de cámara por región pública.
 * Fuente: bodyPublicRegionMeta (+ inferencia side/surface/category).
 */

import { Vector3 } from "three";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
import {
  getPublicRegionMeta,
  type PublicRegionCategory,
  type PublicRegionMeta,
  type PublicRegionSide,
  type PublicRegionSurface,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import type { CameraFocusPose } from "@/widgets/body-3d/ux/bodyCameraFocus";
import {
  MAX_FOCUS_DIST_SCALE,
  MIN_FOCUS_DIST_SCALE,
  type BodySection,
} from "@/widgets/body-3d/ux/bodyCameraFocus";

export type PreferredBodyView =
  | "front"
  | "back"
  | "left"
  | "right"
  | "front-left"
  | "front-right"
  | "back-left"
  | "back-right";

/** Overrides explícitos de producto (prioridad sobre inferencia). */
const PREFERRED_VIEW_OVERRIDES: Readonly<Record<string, PreferredBodyView>> = {
  full_back: "back",
  upper_back_large: "back",
  lower_back_large: "back",
  full_chest: "front",
  left_chest: "front",
  right_chest: "front",
  full_abdomen: "front",
  right_biceps_region: "front-right",
  left_biceps_region: "front-left",
  right_triceps_region: "back-right",
  left_triceps_region: "back-left",
  right_forearm_inner_region: "front-right",
  left_forearm_inner_region: "front-left",
  right_forearm_outer_region: "back-right",
  left_forearm_outer_region: "back-left",
  right_upper_arm: "right",
  left_upper_arm: "left",
  right_forearm: "right",
  left_forearm: "left",
  right_full_sleeve: "right",
  left_full_sleeve: "left",
  right_upper_half_sleeve: "right",
  left_upper_half_sleeve: "left",
  right_lower_half_sleeve: "right",
  left_lower_half_sleeve: "left",
  right_shoulder: "front-right",
  left_shoulder: "front-left",
  right_thigh_front: "front",
  left_thigh_front: "front",
  right_thigh_back: "back",
  left_thigh_back: "back",
  right_thigh_inner: "front-right",
  left_thigh_inner: "front-left",
  right_thigh_outer: "right",
  left_thigh_outer: "left",
  right_lower_leg_front: "front",
  left_lower_leg_front: "front",
  right_lower_leg_back: "back",
  left_lower_leg_back: "back",
  right_full_leg: "front",
  left_full_leg: "front",
  head_top: "front",
  head_back: "back",
  head_left_region: "left",
  head_right_region: "right",
  full_scalp: "back",
  neck_front: "front",
  neck_back: "back",
  neck_left: "left",
  neck_right: "right",
  full_neck: "front",
  full_glutes: "back",
  left_glute: "back",
  right_glute: "back",
};

const FOCUS_SECTION_OVERRIDES: Readonly<Record<string, BodySection>> = {
  full_back: "torso",
  upper_back_large: "upperBody",
  lower_back_large: "torso",
  full_chest: "torso",
  full_abdomen: "torso",
  right_biceps_region: "arms",
  left_biceps_region: "arms",
  right_triceps_region: "arms",
  left_triceps_region: "arms",
  right_full_sleeve: "arms",
  left_full_sleeve: "arms",
  head_top: "head",
  head_back: "head",
  head_left_region: "head",
  head_right_region: "head",
  full_scalp: "head",
  full_neck: "head",
  right_full_leg: "legs",
  left_full_leg: "legs",
  right_lower_leg_back: "legs",
  left_lower_leg_back: "legs",
};

function inferPreferredView(
  side: PublicRegionSide,
  surface: PublicRegionSurface,
  category: PublicRegionCategory,
): PreferredBodyView {
  if (category === "back") return "back";
  if (surface === "posterior") {
    if (side === "left") return "back-left";
    if (side === "right") return "back-right";
    return "back";
  }
  if (surface === "anterior") {
    if (side === "left") return "front-left";
    if (side === "right") return "front-right";
    return "front";
  }
  if (side === "left") return "left";
  if (side === "right") return "right";
  return "front";
}

function inferFocusSection(
  category: PublicRegionCategory,
  surface: PublicRegionSurface,
): BodySection {
  if (category === "head" || category === "neck") return "head";
  if (category === "arm" || category === "hand") return "arms";
  if (category === "leg") return "legs";
  if (category === "foot") return "feet";
  if (category === "hip") return "pelvis";
  if (category === "back") {
    return surface === "posterior" ? "torso" : "upperBody";
  }
  return "torso";
}

export function getPreferredBodyView(targetId: string): PreferredBodyView {
  if (PREFERRED_VIEW_OVERRIDES[targetId]) {
    return PREFERRED_VIEW_OVERRIDES[targetId];
  }
  const meta = getPublicRegionMeta(targetId);
  if (!meta) return "front";
  return inferPreferredView(meta.side, meta.surface, meta.category);
}

export function getPreferredFocusSection(targetId: string): BodySection {
  if (FOCUS_SECTION_OVERRIDES[targetId]) {
    return FOCUS_SECTION_OVERRIDES[targetId];
  }
  const meta = getPublicRegionMeta(targetId);
  if (!meta) return "torso";
  return inferFocusSection(meta.category, meta.surface);
}

export type FramingScale = "tight" | "medium" | "wide";

const FRAMING_SCALE_OVERRIDES: Readonly<Record<string, FramingScale>> = {
  full_back: "wide",
  upper_back_large: "wide",
  lower_back_large: "medium",
  full_chest: "wide",
  full_abdomen: "medium",
  right_full_sleeve: "wide",
  left_full_sleeve: "wide",
  right_upper_half_sleeve: "medium",
  left_upper_half_sleeve: "medium",
  right_lower_half_sleeve: "medium",
  left_lower_half_sleeve: "medium",
  right_full_leg: "wide",
  left_full_leg: "wide",
  full_scalp: "medium",
  full_neck: "medium",
  full_glutes: "medium",
  right_biceps_region: "medium",
  left_biceps_region: "medium",
  right_triceps_region: "medium",
  left_triceps_region: "medium",
};

const FRAMING_DIST_MULT: Record<FramingScale, number> = {
  tight: 0.88,
  medium: 1,
  wide: 1.12,
};

export function getFramingScale(targetId: string): FramingScale {
  if (FRAMING_SCALE_OVERRIDES[targetId]) {
    return FRAMING_SCALE_OVERRIDES[targetId];
  }
  const meta = getPublicRegionMeta(targetId);
  if (!meta) return "medium";
  if (meta.surface === "full" || meta.category === "back") return "wide";
  return "medium";
}

/** Metadata de cámara pública (fuente única consumible por UI / auditoría). */
export function getPublicCameraPoseMeta(targetId: string): {
  preferredView: PreferredBodyView;
  focusSection: BodySection;
  framingScale: FramingScale;
} {
  return {
    preferredView: getPreferredBodyView(targetId),
    focusSection: getPreferredFocusSection(targetId),
    framingScale: getFramingScale(targetId),
  };
}

/** Mapea vista preferida → botón cardinal más cercano. */
export function toCardinalCameraView(view: PreferredBodyView): BodyCameraView {
  switch (view) {
    case "front":
      return "front";
    case "back":
    case "back-left":
    case "back-right":
      return "back";
    case "left":
    case "front-left":
      return "left";
    case "right":
    case "front-right":
      return "right";
  }
}

const SECTION_Y: Record<BodySection, number> = {
  head: 0.28,
  upperBody: 0.14,
  arms: 0.08,
  torso: 0.02,
  pelvis: -0.1,
  legs: -0.22,
  feet: -0.38,
};

const SECTION_DIST: Record<BodySection, number> = {
  head: 0.78,
  upperBody: 0.82,
  arms: 0.8,
  torso: 0.9,
  pelvis: 0.86,
  legs: 0.84,
  feet: 0.8,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Azimuth en radianes desde +Z (frente). */
function azimuthForView(view: PreferredBodyView): number {
  switch (view) {
    case "front":
      return 0;
    case "back":
      return Math.PI;
    case "left":
      return -Math.PI / 2;
    case "right":
      return Math.PI / 2;
    case "front-left":
      return -Math.PI / 4;
    case "front-right":
      return Math.PI / 4;
    case "back-left":
      return (-3 * Math.PI) / 4;
    case "back-right":
      return (3 * Math.PI) / 4;
  }
}

/**
 * Pose de cámara para preferredView + focusSection.
 * Mantiene contexto corporal (sin zoom extremo).
 */
export function getCameraPoseForPreferredView(
  preferredView: PreferredBodyView,
  framing: BodyCameraFraming,
  focusSection: BodySection = "torso",
  framingScale: FramingScale = "medium",
): CameraFocusPose {
  const [bx, by, bz] = framing.target;
  const baseDist = framing.distance;
  const yOff = SECTION_Y[focusSection] * baseDist * 0.32;
  const target = new Vector3(bx, by + yOff, bz);
  const dist =
    baseDist *
    clamp(
      SECTION_DIST[focusSection] * FRAMING_DIST_MULT[framingScale],
      MIN_FOCUS_DIST_SCALE,
      MAX_FOCUS_DIST_SCALE,
    );
  const az = azimuthForView(preferredView);
  const elev = focusSection === "head" ? 0.12 : 0.08;
  return {
    position: new Vector3(
      target.x + Math.sin(az) * dist,
      target.y + elev * dist,
      target.z + Math.cos(az) * dist,
    ),
    target,
  };
}

export function getCameraPoseForPublicTarget(
  targetId: string,
  framing: BodyCameraFraming,
): CameraFocusPose {
  return getCameraPoseForPreferredView(
    getPreferredBodyView(targetId),
    framing,
    getPreferredFocusSection(targetId),
    getFramingScale(targetId),
  );
}

/**
 * ¿La vista actual ya es suficientemente cercana a preferred?
 * Evita giros nerviosos / innecesarios.
 */
export function isPreferredViewAlreadyActive(
  current: BodyCameraView,
  preferred: PreferredBodyView,
): boolean {
  const cardinal = toCardinalCameraView(preferred);
  if (preferred === "front" || preferred === "back") {
    return current === preferred;
  }
  if (preferred === "left" || preferred === "right") {
    return current === preferred;
  }
  // Diagonales: aceptar cardinal dominante o el puro
  if (preferred.startsWith("back")) {
    return current === "back" || current === cardinal;
  }
  if (preferred.startsWith("front")) {
    return current === "front" || current === cardinal;
  }
  return current === cardinal;
}

export function enrichMetaWithCamera(
  meta: PublicRegionMeta,
): PublicRegionMeta & {
  preferredView: PreferredBodyView;
  focusSection: BodySection;
  framingScale: FramingScale;
} {
  return {
    ...meta,
    preferredView: getPreferredBodyView(meta.id),
    focusSection: getPreferredFocusSection(meta.id),
    framingScale: getFramingScale(meta.id),
  };
}
