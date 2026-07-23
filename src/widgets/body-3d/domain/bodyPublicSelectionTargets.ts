/**
 * Targets públicos de selección corporal (producción).
 * Labels: bodyPublicRegionMeta (fuente única).
 * Las 81 atómicas siguen siendo hit-detection.
 */

import {
  getPublicShortLabel,
  PUBLIC_REGION_META_BY_ID,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import type { SelectionTarget } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

function region(
  id: string,
  memberIds: readonly string[],
): SelectionTarget {
  const label = getPublicShortLabel(id);
  return { id, kind: "anatomical", label, memberIds };
}

function commercial(
  id: string,
  memberIds: readonly string[],
): SelectionTarget {
  const label = getPublicShortLabel(id);
  return { id, kind: "commercial", label, memberIds };
}

/**
 * Regiones compuestas.
 * memberIds = geometría de highlight (más precisa que la unión técnica bruta).
 * El routing atomic→target puede incluir atomics que no estén aquí.
 */
export const PUBLIC_COMPOSITE_SELECTION_TARGETS: readonly SelectionTarget[] = [
  // Bíceps: cara anterior (no envolver hacia atrás)
  region("right_biceps_region", ["right_upper_arm_front"]),
  region("left_biceps_region", ["left_upper_arm_front"]),
  // Tríceps: cara posterior
  region("right_triceps_region", ["right_upper_arm_back"]),
  region("left_triceps_region", ["left_upper_arm_back"]),
  region("right_forearm_inner_region", [
    "right_forearm_front",
    "right_forearm_inner",
  ]),
  region("left_forearm_inner_region", [
    "left_forearm_front",
    "left_forearm_inner",
  ]),
  region("right_forearm_outer_region", [
    "right_forearm_back",
    "right_forearm_outer",
  ]),
  region("left_forearm_outer_region", [
    "left_forearm_back",
    "left_forearm_outer",
  ]),
  region("upper_back_large", [
    "left_scapula",
    "right_scapula",
    "upper_back_center",
    "left_mid_back",
    "right_mid_back",
    "mid_back_center",
  ]),
  region("lower_back_large", [
    "left_lower_back",
    "right_lower_back",
    "lower_back_center",
    "sacrum",
  ]),
  region("head_left_region", ["head_left_side", "left_ear"]),
  region("head_right_region", ["head_right_side", "right_ear"]),
  region("full_scalp", [
    "head_top",
    "head_back",
    "head_left_side",
    "head_right_side",
    "left_ear",
    "right_ear",
  ]),
];

export const PUBLIC_EXISTING_TARGET_OVERRIDES: readonly SelectionTarget[] = [
  region("right_upper_arm", [
    "right_upper_arm_front",
    "right_upper_arm_back",
    "right_upper_arm_inner",
    "right_upper_arm_outer",
  ]),
  region("left_upper_arm", [
    "left_upper_arm_front",
    "left_upper_arm_back",
    "left_upper_arm_inner",
    "left_upper_arm_outer",
  ]),
  region("right_forearm", [
    "right_forearm_front",
    "right_forearm_back",
    "right_forearm_inner",
    "right_forearm_outer",
  ]),
  region("left_forearm", [
    "left_forearm_front",
    "left_forearm_back",
    "left_forearm_inner",
    "left_forearm_outer",
  ]),
  region("right_thigh", [
    "right_thigh_front",
    "right_thigh_back",
    "right_thigh_inner",
    "right_thigh_outer",
  ]),
  region("left_thigh", [
    "left_thigh_front",
    "left_thigh_back",
    "left_thigh_inner",
    "left_thigh_outer",
  ]),
  region("right_lower_leg", [
    "right_lower_leg_front",
    "right_lower_leg_back",
    "right_lower_leg_inner",
    "right_lower_leg_outer",
  ]),
  region("left_lower_leg", [
    "left_lower_leg_front",
    "left_lower_leg_back",
    "left_lower_leg_inner",
    "left_lower_leg_outer",
  ]),
  region("right_full_leg", [
    "right_thigh",
    "right_knee",
    "right_lower_leg",
    "right_ankle",
    "right_foot",
  ]),
  region("left_full_leg", [
    "left_thigh",
    "left_knee",
    "left_lower_leg",
    "left_ankle",
    "left_foot",
  ]),
  // Pecho: solo pectorales (sin esternón) → silueta menos rectangular / sin invadir abdomen
  region("full_chest", ["left_chest", "right_chest"]),
  region("full_abdomen", ["upper_abdomen", "lower_abdomen"]),
  region("full_face", ["face_left", "face_right"]),
  region("full_neck", ["neck_front", "neck_back", "neck_left", "neck_right"]),
  region("full_head", ["full_scalp", "full_face"]),
  region("full_glutes", ["left_glute", "right_glute"]),
  commercial("full_back", ["upper_back_large", "lower_back_large"]),
  commercial("right_full_sleeve", [
    "right_shoulder",
    "right_upper_arm_front",
    "right_upper_arm_back",
    "right_upper_arm_inner",
    "right_upper_arm_outer",
    "right_elbow",
    "right_forearm_front",
    "right_forearm_back",
    "right_forearm_inner",
    "right_forearm_outer",
    "right_wrist",
  ]),
  commercial("left_full_sleeve", [
    "left_shoulder",
    "left_upper_arm_front",
    "left_upper_arm_back",
    "left_upper_arm_inner",
    "left_upper_arm_outer",
    "left_elbow",
    "left_forearm_front",
    "left_forearm_back",
    "left_forearm_inner",
    "left_forearm_outer",
    "left_wrist",
  ]),
  commercial("right_upper_half_sleeve", [
    "right_shoulder",
    "right_upper_arm_front",
    "right_upper_arm_back",
    "right_upper_arm_inner",
    "right_upper_arm_outer",
    "right_elbow",
  ]),
  commercial("left_upper_half_sleeve", [
    "left_shoulder",
    "left_upper_arm_front",
    "left_upper_arm_back",
    "left_upper_arm_inner",
    "left_upper_arm_outer",
    "left_elbow",
  ]),
  commercial("right_lower_half_sleeve", [
    "right_elbow",
    "right_forearm_front",
    "right_forearm_back",
    "right_forearm_inner",
    "right_forearm_outer",
    "right_wrist",
  ]),
  commercial("left_lower_half_sleeve", [
    "left_elbow",
    "left_forearm_front",
    "left_forearm_back",
    "left_forearm_inner",
    "left_forearm_outer",
    "left_wrist",
  ]),
];

/** Atómicas seleccionables públicamente (labels vía meta). */
export const PUBLIC_ATOMIC_SELECTABLE_IDS = [
  "right_shoulder",
  "left_shoulder",
  "right_hand",
  "left_hand",
  "left_chest",
  "right_chest",
  "left_ribs",
  "right_ribs",
  "left_flank",
  "right_flank",
  "left_hip",
  "right_hip",
  "left_glute",
  "right_glute",
  "right_thigh_front",
  "right_thigh_back",
  "right_thigh_inner",
  "right_thigh_outer",
  "left_thigh_front",
  "left_thigh_back",
  "left_thigh_inner",
  "left_thigh_outer",
  "right_lower_leg_front",
  "right_lower_leg_back",
  "left_lower_leg_front",
  "left_lower_leg_back",
  "right_foot",
  "left_foot",
  "head_top",
  "head_back",
  "neck_front",
  "neck_back",
  "neck_left",
  "neck_right",
] as const;

const PUBLIC_ATOMIC_TARGETS: readonly SelectionTarget[] =
  PUBLIC_ATOMIC_SELECTABLE_IDS.map((id) => region(id, [id]));

export const PUBLIC_SELECTION_TARGETS: readonly SelectionTarget[] = [
  ...PUBLIC_COMPOSITE_SELECTION_TARGETS,
  ...PUBLIC_EXISTING_TARGET_OVERRIDES,
  ...PUBLIC_ATOMIC_TARGETS,
];

export const PUBLIC_SELECTION_TARGETS_BY_ID: Readonly<
  Record<string, SelectionTarget>
> = Object.fromEntries(PUBLIC_SELECTION_TARGETS.map((t) => [t.id, t]));

export const PUBLIC_PRODUCT_FLAGS = {
  faceSelectable: false,
};

export const PUBLIC_SELECTABLE_BODY_TARGET_IDS: ReadonlySet<string> = new Set(
  PUBLIC_SELECTION_TARGETS.map((t) => t.id).filter((id) => id !== "full_face"),
);

export type PublicBodySelectionTargetId = string;

export function isPublicSelectableBodyTarget(id: string): boolean {
  if (id === "full_face") return PUBLIC_PRODUCT_FLAGS.faceSelectable;
  return PUBLIC_SELECTABLE_BODY_TARGET_IDS.has(id);
}

export function getPublicSelectionTarget(
  id: string,
): SelectionTarget | undefined {
  return PUBLIC_SELECTION_TARGETS_BY_ID[id];
}

/** Garantiza que todo target público tenga metadata profesional. */
export function listPublicTargetsMissingMeta(): string[] {
  return PUBLIC_SELECTION_TARGETS.map((t) => t.id).filter(
    (id) => !PUBLIC_REGION_META_BY_ID[id],
  );
}
