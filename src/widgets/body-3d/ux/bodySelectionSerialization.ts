/**
 * Serialización conceptual para integración futura en cotización.
 * Guarda targets conceptuales — no expande a atomics en el payload.
 * Forma canónica: regionId (+ cobertura opcional vía token `regionId@coverage`).
 */

import { resolveSelectedAtomicZoneIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";
import type { SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import {
  parseBodyPlacementToken,
  serializeBodyPlacement,
  type BodyPlacementSelection,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";

export type BodySelectionTargetId = SelectionTargetId;

export type ConceptualBodySelectionPayload = {
  selectedBodyTargets: BodySelectionTargetId[];
  selectedBodyPlacements: BodyPlacementSelection[];
};

export type BodySelectionIntegrationSnapshot = {
  selectedBodyTargets: BodySelectionTargetId[];
  selectedBodyPlacements: BodyPlacementSelection[];
  resolvedAtomicZoneIds: string[];
  selectionCount: number;
};

export function tokensToPlacements(
  tokens: readonly BodySelectionTargetId[],
): BodyPlacementSelection[] {
  const out: BodyPlacementSelection[] = [];
  for (const token of tokens) {
    const parsed = parseBodyPlacementToken(token);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function placementsToTokens(
  placements: readonly BodyPlacementSelection[],
): BodySelectionTargetId[] {
  return placements.map(serializeBodyPlacement);
}

/** Payload conceptual listo para persistir / enviar al backend. */
export function serializeConceptualBodySelection(
  selectedTargetIds: readonly BodySelectionTargetId[],
): ConceptualBodySelectionPayload {
  const selectedBodyTargets = [...selectedTargetIds];
  return {
    selectedBodyTargets,
    selectedBodyPlacements: tokensToPlacements(selectedBodyTargets),
  };
}

/** Snapshot de laboratorio / integración (conceptuales + atomics derivados). */
export function buildBodySelectionSnapshot(
  selectedTargetIds: readonly BodySelectionTargetId[],
): BodySelectionIntegrationSnapshot {
  return {
    selectedBodyTargets: [...selectedTargetIds],
    selectedBodyPlacements: tokensToPlacements(selectedTargetIds),
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
