/**
 * Targets públicos de selección corporal (producción).
 * Fuente única: bodyPublicSelectionCatalog.
 * Las 81 atómicas siguen siendo hit-detection.
 */

import {
  BODY_PUBLIC_SELECTION_CATALOG,
  BODY_PUBLIC_SELECTION_CATALOG_BY_ID,
  getPublicCatalogEntry,
  isPublicSelectableBodyTarget,
  PUBLIC_PRODUCT_FLAGS,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
  type PublicBodySelectionTargetId,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import type { SelectionTarget } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

export {
  isPublicSelectableBodyTarget,
  PUBLIC_PRODUCT_FLAGS,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
  type PublicBodySelectionTargetId,
};

export const PUBLIC_SELECTION_TARGETS: readonly SelectionTarget[] =
  BODY_PUBLIC_SELECTION_CATALOG.filter(
    (e) => e.publicSelectable || e.id === "full_face",
  ).map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.shortLabel,
    memberIds: e.memberIds,
  }));

/** Compuestos / overrides derivados del catálogo (compat tests). */
export const PUBLIC_COMPOSITE_SELECTION_TARGETS: readonly SelectionTarget[] =
  PUBLIC_SELECTION_TARGETS.filter(
    (t) =>
      t.memberIds.length > 1 ||
      t.id.endsWith("_region") ||
      t.id.endsWith("_large") ||
      t.id.startsWith("full_"),
  );

export const PUBLIC_EXISTING_TARGET_OVERRIDES: readonly SelectionTarget[] =
  PUBLIC_SELECTION_TARGETS.filter((t) =>
    [
      "right_upper_arm",
      "left_upper_arm",
      "right_forearm",
      "left_forearm",
      "right_thigh",
      "left_thigh",
      "right_lower_leg",
      "left_lower_leg",
      "right_full_leg",
      "left_full_leg",
      "full_chest",
      "full_abdomen",
      "full_face",
      "full_neck",
      "full_head",
      "full_glutes",
      "full_back",
      "right_full_sleeve",
      "left_full_sleeve",
    ].includes(t.id),
  );

export const PUBLIC_ATOMIC_SELECTABLE_IDS = PUBLIC_SELECTION_TARGETS.filter(
  (t) => t.memberIds.length === 1 && t.memberIds[0] === t.id,
).map((t) => t.id) as readonly string[];

export const PUBLIC_SELECTION_TARGETS_BY_ID: Readonly<
  Record<string, SelectionTarget>
> = Object.fromEntries(PUBLIC_SELECTION_TARGETS.map((t) => [t.id, t]));

export function getPublicSelectionTarget(
  id: string,
): SelectionTarget | undefined {
  return PUBLIC_SELECTION_TARGETS_BY_ID[id];
}

/** Garantiza que todo target público tenga metadata profesional. */
export function listPublicTargetsMissingMeta(): string[] {
  return PUBLIC_SELECTION_TARGETS.map((t) => t.id).filter(
    (id) => !BODY_PUBLIC_SELECTION_CATALOG_BY_ID[id],
  );
}

export function getCatalogMemberIds(id: string): readonly string[] {
  return getPublicCatalogEntry(id)?.memberIds ?? [];
}
