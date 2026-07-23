/**
 * Targets de selección comercial y anatómica para el selector 3D.
 * No modifica las 81 zonas atómicas; solo agrupa IDs existentes.
 */

import {
  BACK_TORSO_GROUP,
  BODY_ZONE_GROUPS_BY_ID,
  BODY_ZONES_BY_ID,
  FRONT_TORSO_GROUP,
  FULL_ABDOMEN_GROUP,
  FULL_CHEST_GROUP,
  FULL_FACE_GROUP,
  FULL_FLANKS_GROUP,
  FULL_HEAD_GROUP,
  FULL_NECK_GROUP,
  FULL_RIBS_GROUP,
  FULL_SCALP_GROUP,
  FULL_TORSO_GROUP,
  LEFT_FULL_ARM_GROUP,
  LEFT_FULL_LEG_GROUP,
  LOWER_BACK_GROUP,
  MID_BACK_GROUP,
  RIGHT_FULL_ARM_GROUP,
  RIGHT_FULL_LEG_GROUP,
  UPPER_BACK_GROUP,
} from "@/widgets/body-3d/domain/bodyZones";
import { isAtomicZone, isParentZone } from "@/widgets/body-3d/domain/bodyZoneTypes";
import type { SelectionTarget } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

/** Manga completa: hombro → muñeca. NO incluye mano (decisión comercial). */
const RIGHT_FULL_SLEEVE_MEMBERS = [
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
] as const;

const LEFT_FULL_SLEEVE_MEMBERS = [
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
] as const;

/**
 * Media manga superior: hombro + brazo + codo.
 * El codo se comparte con la media inferior para continuidad de manga.
 */
const RIGHT_UPPER_HALF_SLEEVE_MEMBERS = [
  "right_shoulder",
  "right_upper_arm_front",
  "right_upper_arm_back",
  "right_upper_arm_inner",
  "right_upper_arm_outer",
  "right_elbow",
] as const;

const LEFT_UPPER_HALF_SLEEVE_MEMBERS = [
  "left_shoulder",
  "left_upper_arm_front",
  "left_upper_arm_back",
  "left_upper_arm_inner",
  "left_upper_arm_outer",
  "left_elbow",
] as const;

/**
 * Media manga inferior: codo + antebrazo + muñeca.
 * Incluye codo a propósito (solape con upper half sleeve).
 */
const RIGHT_LOWER_HALF_SLEEVE_MEMBERS = [
  "right_elbow",
  "right_forearm_front",
  "right_forearm_back",
  "right_forearm_inner",
  "right_forearm_outer",
  "right_wrist",
] as const;

const LEFT_LOWER_HALF_SLEEVE_MEMBERS = [
  "left_elbow",
  "left_forearm_front",
  "left_forearm_back",
  "left_forearm_inner",
  "left_forearm_outer",
  "left_wrist",
] as const;

function commercial(
  id: string,
  label: string,
  memberIds: readonly string[],
): SelectionTarget {
  return { id, kind: "commercial", label, memberIds };
}

function anatomical(
  id: string,
  label: string,
  memberIds: readonly string[],
): SelectionTarget {
  return { id, kind: "anatomical", label, memberIds };
}

/** Targets comerciales explícitos (tatuaje). */
export const COMMERCIAL_SELECTION_TARGETS: readonly SelectionTarget[] = [
  commercial("right_full_sleeve", "Manga completa derecha", RIGHT_FULL_SLEEVE_MEMBERS),
  commercial("left_full_sleeve", "Manga completa izquierda", LEFT_FULL_SLEEVE_MEMBERS),
  commercial(
    "right_upper_half_sleeve",
    "Media manga superior derecha",
    RIGHT_UPPER_HALF_SLEEVE_MEMBERS,
  ),
  commercial(
    "left_upper_half_sleeve",
    "Media manga superior izquierda",
    LEFT_UPPER_HALF_SLEEVE_MEMBERS,
  ),
  commercial(
    "right_lower_half_sleeve",
    "Media manga inferior derecha",
    RIGHT_LOWER_HALF_SLEEVE_MEMBERS,
  ),
  commercial(
    "left_lower_half_sleeve",
    "Media manga inferior izquierda",
    LEFT_LOWER_HALF_SLEEVE_MEMBERS,
  ),
  commercial("full_back", "Espalda completa", BACK_TORSO_GROUP.zoneIds),
] as const;

/** Alias anatómicos / comerciales reutilizando groups existentes. */
export const ANATOMICAL_SELECTION_TARGETS: readonly SelectionTarget[] = [
  anatomical("right_upper_arm", "Brazo superior derecho", ["right_upper_arm"]),
  anatomical("left_upper_arm", "Brazo superior izquierdo", ["left_upper_arm"]),
  anatomical("right_forearm", "Antebrazo derecho completo", ["right_forearm"]),
  anatomical("left_forearm", "Antebrazo izquierdo completo", ["left_forearm"]),
  anatomical(RIGHT_FULL_ARM_GROUP.id, RIGHT_FULL_ARM_GROUP.label, [
    RIGHT_FULL_ARM_GROUP.id,
  ]),
  anatomical(LEFT_FULL_ARM_GROUP.id, LEFT_FULL_ARM_GROUP.label, [
    LEFT_FULL_ARM_GROUP.id,
  ]),
  anatomical("right_thigh", "Muslo derecho completo", ["right_thigh"]),
  anatomical("left_thigh", "Muslo izquierdo completo", ["left_thigh"]),
  anatomical("right_lower_leg", "Pierna derecha completa", [
    "right_lower_leg",
  ]),
  anatomical("left_lower_leg", "Pierna izquierda completa", [
    "left_lower_leg",
  ]),
  anatomical(RIGHT_FULL_LEG_GROUP.id, RIGHT_FULL_LEG_GROUP.label, [
    RIGHT_FULL_LEG_GROUP.id,
  ]),
  anatomical(LEFT_FULL_LEG_GROUP.id, LEFT_FULL_LEG_GROUP.label, [
    LEFT_FULL_LEG_GROUP.id,
  ]),
  anatomical(FULL_CHEST_GROUP.id, FULL_CHEST_GROUP.label, [FULL_CHEST_GROUP.id]),
  anatomical(FULL_ABDOMEN_GROUP.id, FULL_ABDOMEN_GROUP.label, [
    FULL_ABDOMEN_GROUP.id,
  ]),
  anatomical(FULL_RIBS_GROUP.id, FULL_RIBS_GROUP.label, [FULL_RIBS_GROUP.id]),
  anatomical(FULL_FLANKS_GROUP.id, FULL_FLANKS_GROUP.label, [
    FULL_FLANKS_GROUP.id,
  ]),
  anatomical(UPPER_BACK_GROUP.id, UPPER_BACK_GROUP.label, [UPPER_BACK_GROUP.id]),
  anatomical(MID_BACK_GROUP.id, MID_BACK_GROUP.label, [MID_BACK_GROUP.id]),
  anatomical(LOWER_BACK_GROUP.id, LOWER_BACK_GROUP.label, [LOWER_BACK_GROUP.id]),
  anatomical(FRONT_TORSO_GROUP.id, FRONT_TORSO_GROUP.label, [
    FRONT_TORSO_GROUP.id,
  ]),
  anatomical(BACK_TORSO_GROUP.id, BACK_TORSO_GROUP.label, [BACK_TORSO_GROUP.id]),
  anatomical(FULL_TORSO_GROUP.id, FULL_TORSO_GROUP.label, [FULL_TORSO_GROUP.id]),
  anatomical(FULL_NECK_GROUP.id, FULL_NECK_GROUP.label, [FULL_NECK_GROUP.id]),
  anatomical(FULL_FACE_GROUP.id, FULL_FACE_GROUP.label, [FULL_FACE_GROUP.id]),
  anatomical(FULL_SCALP_GROUP.id, FULL_SCALP_GROUP.label, [FULL_SCALP_GROUP.id]),
  anatomical(FULL_HEAD_GROUP.id, FULL_HEAD_GROUP.label, [FULL_HEAD_GROUP.id]),
] as const;

export const ALL_SELECTION_TARGETS: readonly SelectionTarget[] = [
  ...COMMERCIAL_SELECTION_TARGETS,
  ...ANATOMICAL_SELECTION_TARGETS,
] as const;

export const SELECTION_TARGETS_BY_ID: Readonly<
  Record<string, SelectionTarget>
> = Object.fromEntries(ALL_SELECTION_TARGETS.map((t) => [t.id, t]));

/**
 * Expande un target (atomic / parent / group / commercial) a atomic IDs únicos.
 */
export function resolveTargetToAtomicZoneIds(
  targetId: string,
): readonly string[] {
  const out = new Set<string>();
  const queue: string[] = [targetId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const zone = BODY_ZONES_BY_ID[id];
    if (zone && isAtomicZone(zone)) {
      out.add(id);
      continue;
    }
    if (zone && isParentZone(zone)) {
      queue.push(...zone.childIds);
      continue;
    }

    const group = BODY_ZONE_GROUPS_BY_ID[id];
    if (group) {
      queue.push(...group.zoneIds);
      continue;
    }

    const target = SELECTION_TARGETS_BY_ID[id];
    if (target) {
      queue.push(...target.memberIds);
      continue;
    }
  }

  return [...out].sort();
}

export function resolveTargetsToAtomicZoneIds(
  targetIds: readonly string[],
): readonly string[] {
  const out = new Set<string>();
  for (const id of targetIds) {
    for (const atomic of resolveTargetToAtomicZoneIds(id)) {
      out.add(atomic);
    }
  }
  return [...out].sort();
}

export function isFullSleeveExcludingHand(targetId: string): boolean {
  if (targetId !== "right_full_sleeve" && targetId !== "left_full_sleeve") {
    return false;
  }
  const atomics = resolveTargetToAtomicZoneIds(targetId);
  return !atomics.some((id) => id.endsWith("_hand"));
}
