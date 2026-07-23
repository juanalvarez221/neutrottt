/**
 * PublicRegionHighlightModel — geometría visual de highlights públicos.
 * Independiente del InteractionModel (81 zonas / raycast).
 */

export const BODY_PUBLIC_REGIONS_MODEL_SRC =
  "/models/interaction/neutro_body_v1_public_regions.glb";

/** Mesh IDs en el GLB (sin prefijo public_). */
export const PUBLIC_HIGHLIGHT_REGION_IDS = [
  "left_pectoral_region",
  "right_pectoral_region",
  "full_abdomen_region",
  "left_ribs_region",
  "right_ribs_region",
  "upper_back_region",
  "lower_back_region",
  "right_shoulder_surface",
  "left_shoulder_surface",
  "right_biceps_surface",
  "left_biceps_surface",
  "right_triceps_surface",
  "left_triceps_surface",
  "right_forearm_inner_surface",
  "left_forearm_inner_surface",
  "right_forearm_outer_surface",
  "left_forearm_outer_surface",
  "right_elbow_transition",
  "left_elbow_transition",
  "right_wrist_transition",
  "left_wrist_transition",
  "right_hand_surface",
  "left_hand_surface",
  "right_thigh_front_surface",
  "right_thigh_back_surface",
  "right_thigh_inner_surface",
  "right_thigh_outer_surface",
  "left_thigh_front_surface",
  "left_thigh_back_surface",
  "left_thigh_inner_surface",
  "left_thigh_outer_surface",
  "right_knee_transition",
  "left_knee_transition",
  "right_shin_surface",
  "left_shin_surface",
  "right_calf_surface",
  "left_calf_surface",
  "right_ankle_transition",
  "left_ankle_transition",
  "right_foot_surface",
  "left_foot_surface",
  "head_top_surface",
  "head_left_surface",
  "head_right_surface",
  "head_back_surface",
  "neck_front_surface",
  "neck_back_surface",
  "neck_left_surface",
  "neck_right_surface",
  "left_hip_surface",
  "right_hip_surface",
  "left_glute_surface",
  "right_glute_surface",
] as const;

export type PublicHighlightRegionId =
  (typeof PUBLIC_HIGHLIGHT_REGION_IDS)[number];

const PUBLIC_HIGHLIGHT_SET: ReadonlySet<string> = new Set(
  PUBLIC_HIGHLIGHT_REGION_IDS,
);

export function isPublicHighlightRegionId(
  id: string,
): id is PublicHighlightRegionId {
  return PUBLIC_HIGHLIGHT_SET.has(id);
}

export function publicHighlightMeshName(id: PublicHighlightRegionId): string {
  return `public_${id}`;
}

/**
 * Target público → regiones del PublicRegionHighlightModel.
 * NO depende de AtomicBodyZoneId[].
 */
const TARGET_TO_PUBLIC_HIGHLIGHT: Readonly<
  Record<string, readonly PublicHighlightRegionId[]>
> = {
  // Espalda
  full_back: ["upper_back_region", "lower_back_region"],
  upper_back_large: ["upper_back_region"],
  lower_back_large: ["lower_back_region"],

  // Pecho / torso
  full_chest: ["left_pectoral_region", "right_pectoral_region"],
  left_chest: ["left_pectoral_region"],
  right_chest: ["right_pectoral_region"],
  full_abdomen: ["full_abdomen_region"],
  left_ribs: ["left_ribs_region"],
  right_ribs: ["right_ribs_region"],

  // Brazos
  right_shoulder: ["right_shoulder_surface"],
  left_shoulder: ["left_shoulder_surface"],
  right_biceps_region: ["right_biceps_surface"],
  left_biceps_region: ["left_biceps_surface"],
  right_triceps_region: ["right_triceps_surface"],
  left_triceps_region: ["left_triceps_surface"],
  right_forearm_inner_region: ["right_forearm_inner_surface"],
  left_forearm_inner_region: ["left_forearm_inner_surface"],
  right_forearm_outer_region: ["right_forearm_outer_surface"],
  left_forearm_outer_region: ["left_forearm_outer_surface"],
  right_upper_arm: [
    "right_biceps_surface",
    "right_triceps_surface",
    "right_elbow_transition",
  ],
  left_upper_arm: [
    "left_biceps_surface",
    "left_triceps_surface",
    "left_elbow_transition",
  ],
  right_forearm: [
    "right_forearm_inner_surface",
    "right_forearm_outer_surface",
    "right_wrist_transition",
  ],
  left_forearm: [
    "left_forearm_inner_surface",
    "left_forearm_outer_surface",
    "left_wrist_transition",
  ],
  right_full_sleeve: [
    "right_shoulder_surface",
    "right_biceps_surface",
    "right_triceps_surface",
    "right_forearm_inner_surface",
    "right_forearm_outer_surface",
    "right_elbow_transition",
    "right_wrist_transition",
  ],
  left_full_sleeve: [
    "left_shoulder_surface",
    "left_biceps_surface",
    "left_triceps_surface",
    "left_forearm_inner_surface",
    "left_forearm_outer_surface",
    "left_elbow_transition",
    "left_wrist_transition",
  ],
  right_upper_half_sleeve: [
    "right_shoulder_surface",
    "right_biceps_surface",
    "right_triceps_surface",
    "right_elbow_transition",
  ],
  left_upper_half_sleeve: [
    "left_shoulder_surface",
    "left_biceps_surface",
    "left_triceps_surface",
    "left_elbow_transition",
  ],
  right_lower_half_sleeve: [
    "right_forearm_inner_surface",
    "right_forearm_outer_surface",
    "right_elbow_transition",
    "right_wrist_transition",
  ],
  left_lower_half_sleeve: [
    "left_forearm_inner_surface",
    "left_forearm_outer_surface",
    "left_elbow_transition",
    "left_wrist_transition",
  ],
  right_hand: ["right_hand_surface"],
  left_hand: ["left_hand_surface"],

  // Piernas
  right_thigh_front: ["right_thigh_front_surface"],
  right_thigh_back: ["right_thigh_back_surface"],
  right_thigh_inner: ["right_thigh_inner_surface"],
  right_thigh_outer: ["right_thigh_outer_surface"],
  left_thigh_front: ["left_thigh_front_surface"],
  left_thigh_back: ["left_thigh_back_surface"],
  left_thigh_inner: ["left_thigh_inner_surface"],
  left_thigh_outer: ["left_thigh_outer_surface"],
  right_thigh: [
    "right_thigh_front_surface",
    "right_thigh_back_surface",
    "right_thigh_inner_surface",
    "right_thigh_outer_surface",
  ],
  left_thigh: [
    "left_thigh_front_surface",
    "left_thigh_back_surface",
    "left_thigh_inner_surface",
    "left_thigh_outer_surface",
  ],
  right_lower_leg_front: ["right_shin_surface"],
  left_lower_leg_front: ["left_shin_surface"],
  right_lower_leg_back: ["right_calf_surface"],
  left_lower_leg_back: ["left_calf_surface"],
  right_lower_leg: [
    "right_shin_surface",
    "right_calf_surface",
    "right_ankle_transition",
  ],
  left_lower_leg: [
    "left_shin_surface",
    "left_calf_surface",
    "left_ankle_transition",
  ],
  right_full_leg: [
    "right_thigh_front_surface",
    "right_thigh_back_surface",
    "right_thigh_inner_surface",
    "right_thigh_outer_surface",
    "right_knee_transition",
    "right_shin_surface",
    "right_calf_surface",
    "right_ankle_transition",
    "right_foot_surface",
  ],
  left_full_leg: [
    "left_thigh_front_surface",
    "left_thigh_back_surface",
    "left_thigh_inner_surface",
    "left_thigh_outer_surface",
    "left_knee_transition",
    "left_shin_surface",
    "left_calf_surface",
    "left_ankle_transition",
    "left_foot_surface",
  ],
  right_foot: ["right_foot_surface"],
  left_foot: ["left_foot_surface"],

  // Cabeza / cuello
  head_top: ["head_top_surface"],
  head_back: ["head_back_surface"],
  head_left_region: ["head_left_surface"],
  head_right_region: ["head_right_surface"],
  full_scalp: [
    "head_top_surface",
    "head_back_surface",
    "head_left_surface",
    "head_right_surface",
  ],
  // Rostro no seleccionable: highlight = cuero cabelludo
  full_head: [
    "head_top_surface",
    "head_back_surface",
    "head_left_surface",
    "head_right_surface",
  ],
  neck_front: ["neck_front_surface"],
  neck_back: ["neck_back_surface"],
  neck_left: ["neck_left_surface"],
  neck_right: ["neck_right_surface"],
  full_neck: [
    "neck_front_surface",
    "neck_back_surface",
    "neck_left_surface",
    "neck_right_surface",
  ],

  // Cadera / glúteos
  left_hip: ["left_hip_surface"],
  right_hip: ["right_hip_surface"],
  left_glute: ["left_glute_surface"],
  right_glute: ["right_glute_surface"],
  full_glutes: ["left_glute_surface", "right_glute_surface"],
};

export function resolvePublicTargetHighlightRegions(
  targetId: string,
): readonly PublicHighlightRegionId[] {
  return TARGET_TO_PUBLIC_HIGHLIGHT[targetId] ?? [];
}

export function resolvePublicTargetsHighlightRegions(
  targetIds: readonly string[],
): PublicHighlightRegionId[] {
  const out: PublicHighlightRegionId[] = [];
  const seen = new Set<string>();
  for (const id of targetIds) {
    for (const region of resolvePublicTargetHighlightRegions(id)) {
      if (seen.has(region)) continue;
      seen.add(region);
      out.push(region);
    }
  }
  return out;
}

export function listTargetsMissingPublicHighlight(
  targetIds: readonly string[],
): string[] {
  return targetIds.filter(
    (id) => resolvePublicTargetHighlightRegions(id).length === 0,
  );
}
