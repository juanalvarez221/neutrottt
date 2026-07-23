/**
 * Routing: AtomicBodyZoneId → PublicBodySelectionTargetId + opciones contextuales.
 * Las atómicas pequeñas (codo, muñeca, etc.) son routing-only.
 */

import {
  getPublicSelectionTarget,
  isPublicSelectableBodyTarget,
  PUBLIC_PRODUCT_FLAGS,
  PUBLIC_SELECTION_TARGETS_BY_ID,
  type PublicBodySelectionTargetId,
} from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  getPublicFullLabel,
  getPublicShortLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import { BODY_ZONES_BY_ID } from "@/widgets/body-3d/domain/bodyZones";
import { isAtomicZone } from "@/widgets/body-3d/domain/bodyZoneTypes";
import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

/** Copy discreto al tocar una superficie no seleccionable (rostro). */
export const NON_SELECTABLE_SURFACE_NOTICE =
  "Selecciona otra zona de la cabeza.";

/** Atómicas que nunca se persisten; solo enrutan a regiones grandes. */
export const ROUTING_ONLY_ATOMIC_ZONE_IDS: ReadonlySet<string> = new Set([
  "right_elbow",
  "left_elbow",
  "right_wrist",
  "left_wrist",
  "right_knee",
  "left_knee",
  "right_ankle",
  "left_ankle",
  "sternum",
  "sacrum",
  "left_ear",
  "right_ear",
  "upper_abdomen",
  "lower_abdomen",
  // face_left / face_right → NON_SELECTABLE_SURFACE cuando faceSelectable=false
  "head_left_side",
  "head_right_side",
  "right_upper_arm_front",
  "right_upper_arm_back",
  "right_upper_arm_inner",
  "right_upper_arm_outer",
  "left_upper_arm_front",
  "left_upper_arm_back",
  "left_upper_arm_inner",
  "left_upper_arm_outer",
  "right_forearm_front",
  "right_forearm_back",
  "right_forearm_inner",
  "right_forearm_outer",
  "left_forearm_front",
  "left_forearm_back",
  "left_forearm_inner",
  "left_forearm_outer",
  "right_lower_leg_inner",
  "right_lower_leg_outer",
  "left_lower_leg_inner",
  "left_lower_leg_outer",
  "left_scapula",
  "right_scapula",
  "upper_back_center",
  "left_mid_back",
  "right_mid_back",
  "mid_back_center",
  "left_lower_back",
  "right_lower_back",
  "lower_back_center",
  "left_flank",
  "right_flank",
]);

/** Superficies detectables pero no seleccionables (salvo feature flag). */
export const NON_SELECTABLE_SURFACE_ATOMIC_IDS: ReadonlySet<string> = new Set([
  "face_left",
  "face_right",
]);

export type AtomicInteractionBehavior =
  | "public_selectable_route"
  | "routing_only"
  | "non_selectable_surface";

export function isRoutingOnlyAtomicZone(atomicId: string): boolean {
  return ROUTING_ONLY_ATOMIC_ZONE_IDS.has(atomicId);
}

export function isNonSelectableSurfaceAtomic(
  atomicId: string,
  flags: { faceSelectable: boolean } = PUBLIC_PRODUCT_FLAGS,
): boolean {
  if (!NON_SELECTABLE_SURFACE_ATOMIC_IDS.has(atomicId)) return false;
  // Cuando faceSelectable=true, el rostro deja de ser non-selectable.
  if (
    (atomicId === "face_left" || atomicId === "face_right") &&
    flags.faceSelectable
  ) {
    return false;
  }
  return true;
}

/**
 * Comportamiento definido para cada atomic (81/81).
 * No exige que todas terminen en un target seleccionable.
 */
export function getAtomicInteractionBehavior(
  atomicId: string,
  flags: { faceSelectable: boolean } = PUBLIC_PRODUCT_FLAGS,
): AtomicInteractionBehavior | null {
  const zone = BODY_ZONES_BY_ID[atomicId];
  if (!zone || !isAtomicZone(zone)) return null;

  if (isNonSelectableSurfaceAtomic(atomicId, flags)) {
    return "non_selectable_surface";
  }
  if (ROUTING_ONLY_ATOMIC_ZONE_IDS.has(atomicId)) {
    return "routing_only";
  }
  if (ATOMIC_PUBLIC_ROUTES[atomicId]) {
    return "public_selectable_route";
  }
  return null;
}

type RouteRule = {
  primary: PublicBodySelectionTargetId;
  /** Opciones adicionales (ampliar), en orden. */
  amplify?: readonly PublicBodySelectionTargetId[];
};

/**
 * Mapa explícito atomic → primary + amplificaciones.
 * Toda atomic de dominio debe tener entrada (validado en tests).
 */
const ATOMIC_PUBLIC_ROUTES: Record<string, RouteRule> = {
  // Hombros
  right_shoulder: {
    primary: "right_shoulder",
    amplify: ["right_upper_half_sleeve", "right_full_sleeve"],
  },
  left_shoulder: {
    primary: "left_shoulder",
    amplify: ["left_upper_half_sleeve", "left_full_sleeve"],
  },

  // Bíceps / tríceps
  right_upper_arm_front: {
    primary: "right_biceps_region",
    amplify: [
      "right_upper_arm",
      "right_upper_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_upper_arm_inner: {
    primary: "right_biceps_region",
    amplify: [
      "right_upper_arm",
      "right_upper_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_upper_arm_back: {
    primary: "right_triceps_region",
    amplify: [
      "right_upper_arm",
      "right_upper_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_upper_arm_outer: {
    primary: "right_triceps_region",
    amplify: [
      "right_upper_arm",
      "right_upper_half_sleeve",
      "right_full_sleeve",
    ],
  },
  left_upper_arm_front: {
    primary: "left_biceps_region",
    amplify: ["left_upper_arm", "left_upper_half_sleeve", "left_full_sleeve"],
  },
  left_upper_arm_inner: {
    primary: "left_biceps_region",
    amplify: ["left_upper_arm", "left_upper_half_sleeve", "left_full_sleeve"],
  },
  left_upper_arm_back: {
    primary: "left_triceps_region",
    amplify: ["left_upper_arm", "left_upper_half_sleeve", "left_full_sleeve"],
  },
  left_upper_arm_outer: {
    primary: "left_triceps_region",
    amplify: ["left_upper_arm", "left_upper_half_sleeve", "left_full_sleeve"],
  },

  // Codos (routing-only)
  right_elbow: {
    primary: "right_upper_arm",
    amplify: [
      "right_forearm",
      "right_upper_half_sleeve",
      "right_lower_half_sleeve",
      "right_full_sleeve",
    ],
  },
  left_elbow: {
    primary: "left_upper_arm",
    amplify: [
      "left_forearm",
      "left_upper_half_sleeve",
      "left_lower_half_sleeve",
      "left_full_sleeve",
    ],
  },

  // Antebrazo
  right_forearm_front: {
    primary: "right_forearm_inner_region",
    amplify: [
      "right_forearm",
      "right_lower_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_forearm_inner: {
    primary: "right_forearm_inner_region",
    amplify: [
      "right_forearm",
      "right_lower_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_forearm_back: {
    primary: "right_forearm_outer_region",
    amplify: [
      "right_forearm",
      "right_lower_half_sleeve",
      "right_full_sleeve",
    ],
  },
  right_forearm_outer: {
    primary: "right_forearm_outer_region",
    amplify: [
      "right_forearm",
      "right_lower_half_sleeve",
      "right_full_sleeve",
    ],
  },
  left_forearm_front: {
    primary: "left_forearm_inner_region",
    amplify: ["left_forearm", "left_lower_half_sleeve", "left_full_sleeve"],
  },
  left_forearm_inner: {
    primary: "left_forearm_inner_region",
    amplify: ["left_forearm", "left_lower_half_sleeve", "left_full_sleeve"],
  },
  left_forearm_back: {
    primary: "left_forearm_outer_region",
    amplify: ["left_forearm", "left_lower_half_sleeve", "left_full_sleeve"],
  },
  left_forearm_outer: {
    primary: "left_forearm_outer_region",
    amplify: ["left_forearm", "left_lower_half_sleeve", "left_full_sleeve"],
  },

  // Muñecas
  right_wrist: {
    primary: "right_forearm",
    amplify: [
      "right_lower_half_sleeve",
      "right_full_sleeve",
      "right_hand",
    ],
  },
  left_wrist: {
    primary: "left_forearm",
    amplify: ["left_lower_half_sleeve", "left_full_sleeve", "left_hand"],
  },

  // Manos
  right_hand: { primary: "right_hand" },
  left_hand: { primary: "left_hand" },

  // Pecho / abdomen / costillas / costados
  left_chest: {
    primary: "left_chest",
    amplify: ["full_chest"],
  },
  right_chest: {
    primary: "right_chest",
    amplify: ["full_chest"],
  },
  sternum: {
    primary: "full_chest",
  },
  upper_abdomen: { primary: "full_abdomen" },
  lower_abdomen: { primary: "full_abdomen" },
  left_ribs: {
    primary: "left_ribs",
    amplify: ["full_abdomen", "upper_back_large", "full_back"],
  },
  right_ribs: {
    primary: "right_ribs",
    amplify: ["full_abdomen", "upper_back_large", "full_back"],
  },
  // Flanks absorbed into ribs / abdomen / back — routing only
  left_flank: {
    primary: "left_ribs",
    amplify: ["full_abdomen", "lower_back_large"],
  },
  right_flank: {
    primary: "right_ribs",
    amplify: ["full_abdomen", "lower_back_large"],
  },

  // Espalda
  left_scapula: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  right_scapula: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  upper_back_center: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  left_mid_back: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  right_mid_back: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  mid_back_center: {
    primary: "upper_back_large",
    amplify: ["full_back"],
  },
  left_lower_back: {
    primary: "lower_back_large",
    amplify: ["full_back"],
  },
  right_lower_back: {
    primary: "lower_back_large",
    amplify: ["full_back"],
  },
  lower_back_center: {
    primary: "lower_back_large",
    amplify: ["full_back"],
  },
  sacrum: {
    primary: "lower_back_large",
    amplify: ["full_back", "full_glutes"],
  },

  // Cadera / glúteos
  left_hip: { primary: "left_hip" },
  right_hip: { primary: "right_hip" },
  left_glute: {
    primary: "left_glute",
    amplify: ["full_glutes"],
  },
  right_glute: {
    primary: "right_glute",
    amplify: ["full_glutes"],
  },

  // Muslo
  right_thigh_front: {
    primary: "right_thigh_front",
    amplify: ["right_thigh", "right_full_leg"],
  },
  right_thigh_back: {
    primary: "right_thigh_back",
    amplify: ["right_thigh", "right_full_leg"],
  },
  right_thigh_inner: {
    primary: "right_thigh_inner",
    amplify: ["right_thigh", "right_full_leg"],
  },
  right_thigh_outer: {
    primary: "right_thigh_outer",
    amplify: ["right_thigh", "right_full_leg"],
  },
  left_thigh_front: {
    primary: "left_thigh_front",
    amplify: ["left_thigh", "left_full_leg"],
  },
  left_thigh_back: {
    primary: "left_thigh_back",
    amplify: ["left_thigh", "left_full_leg"],
  },
  left_thigh_inner: {
    primary: "left_thigh_inner",
    amplify: ["left_thigh", "left_full_leg"],
  },
  left_thigh_outer: {
    primary: "left_thigh_outer",
    amplify: ["left_thigh", "left_full_leg"],
  },

  // Rodilla
  right_knee: {
    primary: "right_thigh",
    amplify: ["right_lower_leg", "right_full_leg"],
  },
  left_knee: {
    primary: "left_thigh",
    amplify: ["left_lower_leg", "left_full_leg"],
  },

  // Pierna inferior
  right_lower_leg_front: {
    primary: "right_lower_leg_front",
    amplify: ["right_lower_leg", "right_full_leg"],
  },
  right_lower_leg_back: {
    primary: "right_lower_leg_back",
    amplify: ["right_lower_leg", "right_full_leg"],
  },
  right_lower_leg_inner: {
    primary: "right_lower_leg",
    amplify: [
      "right_lower_leg_front",
      "right_lower_leg_back",
      "right_full_leg",
    ],
  },
  right_lower_leg_outer: {
    primary: "right_lower_leg",
    amplify: [
      "right_lower_leg_front",
      "right_lower_leg_back",
      "right_full_leg",
    ],
  },
  left_lower_leg_front: {
    primary: "left_lower_leg_front",
    amplify: ["left_lower_leg", "left_full_leg"],
  },
  left_lower_leg_back: {
    primary: "left_lower_leg_back",
    amplify: ["left_lower_leg", "left_full_leg"],
  },
  left_lower_leg_inner: {
    primary: "left_lower_leg",
    amplify: [
      "left_lower_leg_front",
      "left_lower_leg_back",
      "left_full_leg",
    ],
  },
  left_lower_leg_outer: {
    primary: "left_lower_leg",
    amplify: [
      "left_lower_leg_front",
      "left_lower_leg_back",
      "left_full_leg",
    ],
  },

  // Tobillo / pie
  right_ankle: {
    primary: "right_lower_leg",
    amplify: ["right_foot", "right_full_leg"],
  },
  left_ankle: {
    primary: "left_lower_leg",
    amplify: ["left_foot", "left_full_leg"],
  },
  right_foot: {
    primary: "right_foot",
    amplify: ["right_full_leg"],
  },
  left_foot: {
    primary: "left_foot",
    amplify: ["left_full_leg"],
  },

  // Cabeza / cuello / rostro
  head_top: {
    primary: "head_top",
    amplify: ["full_scalp", "full_head"],
  },
  head_back: {
    primary: "head_back",
    amplify: ["full_scalp", "full_head"],
  },
  head_left_side: {
    primary: "head_left_region",
    amplify: ["full_scalp", "full_head"],
  },
  head_right_side: {
    primary: "head_right_region",
    amplify: ["full_scalp", "full_head"],
  },
  left_ear: {
    primary: "head_left_region",
    amplify: ["full_scalp", "full_head"],
  },
  right_ear: {
    primary: "head_right_region",
    amplify: ["full_scalp", "full_head"],
  },
  face_left: {
    // Interno: full_face. Público solo si faceSelectable=true.
    primary: "full_face",
    amplify: ["full_scalp", "full_head"],
  },
  face_right: {
    primary: "full_face",
    amplify: ["full_scalp", "full_head"],
  },
  neck_front: {
    primary: "neck_front",
    amplify: ["full_neck"],
  },
  neck_back: {
    primary: "neck_back",
    amplify: ["full_neck"],
  },
  neck_left: {
    primary: "neck_left",
    amplify: ["full_neck"],
  },
  neck_right: {
    primary: "neck_right",
    amplify: ["full_neck"],
  },
};

/**
 * Primary public target para hover/highlight de región grande.
 * Superficies non-selectable (rostro con flag off) no resuelven target público.
 */
export function getPrimaryPublicSelectionTarget(
  atomicZoneId: string,
  flags: { faceSelectable: boolean } = PUBLIC_PRODUCT_FLAGS,
): PublicBodySelectionTargetId | null {
  if (isNonSelectableSurfaceAtomic(atomicZoneId, flags)) return null;
  const rule = ATOMIC_PUBLIC_ROUTES[atomicZoneId];
  if (!rule) return null;
  return rule.primary;
}

function optionFor(
  targetId: string,
  tier: ContextualSelectionOption["tier"],
  shortLabel?: string,
): ContextualSelectionOption | null {
  if (!isPublicSelectableBodyTarget(targetId)) return null;
  const target = getPublicSelectionTarget(targetId);
  if (!target) return null;
  return {
    targetId,
    kind: target.kind,
    label: getPublicFullLabel(targetId),
    shortLabel: shortLabel ?? getPublicShortLabel(targetId),
    tier,
  };
}

/**
 * Opciones contextuales de producción: primary + amplificar.
 * Sin “zona exacta” atómica.
 * Superficies non-selectable → sin opciones (no panel contradictorio).
 */
export function getPublicSelectionOptionsForAtomicZone(
  atomicZoneId: string,
  flags: { faceSelectable: boolean } = PUBLIC_PRODUCT_FLAGS,
): ContextualSelectionOption[] {
  const zone = BODY_ZONES_BY_ID[atomicZoneId];
  if (!zone || !isAtomicZone(zone)) return [];

  if (isNonSelectableSurfaceAtomic(atomicZoneId, flags)) return [];

  const rule = ATOMIC_PUBLIC_ROUTES[atomicZoneId];
  if (!rule) return [];

  const out: ContextualSelectionOption[] = [];
  const primary = optionFor(rule.primary, "primary");
  if (primary) {
    out.push(primary);
  }

  for (const id of rule.amplify ?? []) {
    if (id === rule.primary) continue;
    const opt = optionFor(id, "amplify");
    if (opt) out.push(opt);
  }

  // Dedup
  const seen = new Set<string>();
  return out.filter((o) => {
    if (seen.has(o.targetId)) return false;
    seen.add(o.targetId);
    return true;
  });
}

/**
 * Migra selecciones técnicas antiguas → targets públicos.
 */
export function upgradeBodySelectionToPublicTargets(
  targetIds: readonly string[],
): PublicBodySelectionTargetId[] {
  const out: string[] = [];

  for (const id of targetIds) {
    if (isPublicSelectableBodyTarget(id)) {
      out.push(id);
      continue;
    }

    // Atomic técnica → primary público
    const primary = getPrimaryPublicSelectionTarget(id);
    if (primary) {
      if (isPublicSelectableBodyTarget(primary)) {
        out.push(primary);
      }
      // Si el primary está oculto (p. ej. full_face), no persistir nada desde ese atomic.
      continue;
    }

    // Targets legacy anatómicos/comerciales no whitelisted
    const legacyMap: Record<string, string> = {
      upper_back: "upper_back_large",
      mid_back: "upper_back_large",
      lower_back: "lower_back_large",
      back_torso: "full_back",
      right_full_arm: "right_full_sleeve",
      left_full_arm: "left_full_sleeve",
      full_ribs: "left_ribs", // ambiguous — keep first? Better expand both
      full_flanks: "left_flank",
      front_torso: "full_chest",
      full_torso: "full_chest",
    };

    if (id === "full_ribs") {
      out.push("left_ribs", "right_ribs");
      continue;
    }
    if (id === "full_flanks") {
      out.push("left_ribs", "right_ribs");
      continue;
    }

    const mapped = legacyMap[id];
    if (mapped && isPublicSelectableBodyTarget(mapped)) {
      out.push(mapped);
      continue;
    }

    // Si el ID resuelve atomics, mapear cada atomic a primary
    const atomics = resolveTargetToAtomicZoneIds(id);
    if (atomics.length > 0) {
      for (const atomic of atomics) {
        const p = getPrimaryPublicSelectionTarget(atomic);
        if (p && isPublicSelectableBodyTarget(p)) out.push(p);
      }
    }
  }

  return [...new Set(out)];
}

export function filterToPublicSelectableTargets(
  targetIds: readonly string[],
): PublicBodySelectionTargetId[] {
  return targetIds.filter(isPublicSelectableBodyTarget);
}

/** Cobertura: todas las atómicas del dominio tienen ruta interna definida. */
export function listAtomicZonesMissingPublicRouting(): string[] {
  const missing: string[] = [];
  for (const zone of Object.values(BODY_ZONES_BY_ID)) {
    if (!isAtomicZone(zone)) continue;
    if (!ATOMIC_PUBLIC_ROUTES[zone.id]) missing.push(zone.id);
  }
  return missing.sort();
}

export function assertPublicRoutingCoverage(): {
  totalAtomics: number;
  routed: number;
  missing: string[];
} {
  const atomics = Object.values(BODY_ZONES_BY_ID).filter(isAtomicZone);
  const missing = listAtomicZonesMissingPublicRouting();
  return {
    totalAtomics: atomics.length,
    routed: atomics.length - missing.length,
    missing,
  };
}

/** Validación: 81/81 atómicas tienen comportamiento de interacción definido. */
export function assertDefinedInteractionBehavior(
  flags: { faceSelectable: boolean } = PUBLIC_PRODUCT_FLAGS,
): {
  totalAtomics: number;
  defined: number;
  missing: string[];
  byBehavior: Record<AtomicInteractionBehavior, number>;
} {
  const atomics = Object.values(BODY_ZONES_BY_ID).filter(isAtomicZone);
  const missing: string[] = [];
  const byBehavior: Record<AtomicInteractionBehavior, number> = {
    public_selectable_route: 0,
    routing_only: 0,
    non_selectable_surface: 0,
  };

  for (const zone of atomics) {
    const behavior = getAtomicInteractionBehavior(zone.id, flags);
    if (!behavior) {
      missing.push(zone.id);
      continue;
    }
    byBehavior[behavior] += 1;
  }

  return {
    totalAtomics: atomics.length,
    defined: atomics.length - missing.length,
    missing: missing.sort(),
    byBehavior,
  };
}

/** Expande highlight de hover/preview con resolución pública. */
export function resolvePublicHighlightAtomicIds(
  hoveredOrActiveAtomicId: string | null,
  previewTargetId: string | null,
): readonly string[] {
  if (previewTargetId && isPublicSelectableBodyTarget(previewTargetId)) {
    return resolveTargetToAtomicZoneIds(previewTargetId);
  }
  if (!hoveredOrActiveAtomicId) return [];
  if (isNonSelectableSurfaceAtomic(hoveredOrActiveAtomicId)) return [];
  const primary = getPrimaryPublicSelectionTarget(hoveredOrActiveAtomicId);
  if (!primary) return [];
  return resolveTargetToAtomicZoneIds(primary);
}

export function getPublicTargetLabel(id: string): string {
  return (
    PUBLIC_SELECTION_TARGETS_BY_ID[id]?.label ??
    getPublicSelectionTarget(id)?.label ??
    id
  );
}
