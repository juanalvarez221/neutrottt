/**
 * Serialización conceptual para integración futura en cotización.
 * Guarda targets conceptuales — no expande a atomics en el payload.
 */

import { resolveSelectedAtomicZoneIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";
import type { SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

export type BodySelectionTargetId = SelectionTargetId;

export type ConceptualBodySelectionPayload = {
  selectedBodyTargets: BodySelectionTargetId[];
};

export type BodySelectionIntegrationSnapshot = {
  selectedBodyTargets: BodySelectionTargetId[];
  resolvedAtomicZoneIds: string[];
  selectionCount: number;
};

/** Payload conceptual listo para persistir / enviar al backend. */
export function serializeConceptualBodySelection(
  selectedTargetIds: readonly BodySelectionTargetId[],
): ConceptualBodySelectionPayload {
  return {
    selectedBodyTargets: [...selectedTargetIds],
  };
}

/** Snapshot de laboratorio / integración (conceptuales + atomics derivados). */
export function buildBodySelectionSnapshot(
  selectedTargetIds: readonly BodySelectionTargetId[],
): BodySelectionIntegrationSnapshot {
  return {
    selectedBodyTargets: [...selectedTargetIds],
    resolvedAtomicZoneIds: [
      ...resolveSelectedAtomicZoneIds(selectedTargetIds),
    ],
    selectionCount: selectedTargetIds.length,
  };
}

export function getConceptualSelectionCount(
  selectedTargetIds: readonly BodySelectionTargetId[],
): number {
  return selectedTargetIds.length;
}
