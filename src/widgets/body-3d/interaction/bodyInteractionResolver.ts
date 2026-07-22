/**
 * Resuelve opciones contextuales ordenadas: específica → amplia.
 */

import {
  resolveTargetToAtomicZoneIds,
  SELECTION_TARGETS_BY_ID,
} from "@/widgets/body-3d/domain/bodySelectionTargets";
import { BODY_ZONES_BY_ID } from "@/widgets/body-3d/domain/bodyZones";
import { isAtomicZone } from "@/widgets/body-3d/domain/bodyZoneTypes";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

type Candidate = {
  targetId: string;
  kind: ContextualSelectionOption["kind"];
  shortLabel: string;
  /** Ranking: lower = more specific. */
  rank: number;
};

function atomicSet(targetId: string): Set<string> {
  return new Set(resolveTargetToAtomicZoneIds(targetId));
}

function containsAtomic(targetId: string, atomicId: string): boolean {
  return atomicSet(targetId).has(atomicId);
}

/**
 * Opciones de selección para una zona atómica bajo el puntero.
 * Orden: más específica → más amplia. Sin opciones irrelevantes.
 */
export function getSelectionOptionsForAtomicZone(
  atomicZoneId: string,
): ContextualSelectionOption[] {
  const zone = BODY_ZONES_BY_ID[atomicZoneId];
  if (!zone || !isAtomicZone(zone)) return [];

  const parentId =
    zone.parentId ??
    (atomicZoneId.match(
      /^(right|left)_(upper_arm|forearm|thigh|lower_leg)_(front|back|inner|outer)$/,
    )
      ? atomicZoneId.replace(/_(front|back|inner|outer)$/, "")
      : undefined);

  const candidates: Candidate[] = [
    {
      targetId: atomicZoneId,
      kind: "atomic",
      shortLabel: "Esta cara",
      rank: 0,
    },
  ];

  if (parentId && BODY_ZONES_BY_ID[parentId]) {
    candidates.push({
      targetId: parentId,
      kind: "anatomical",
      shortLabel: getSelectionDisplayLabel(parentId)
        .replace(/\s+completo$/i, "")
        .trim(),
      rank: 10,
    });
  }

  const side = zone.side === "center" ? null : zone.side;

  if (side === "right" || side === "left") {
    const sleeveFull = `${side}_full_sleeve`;
    const sleeveUpper = `${side}_upper_half_sleeve`;
    const sleeveLower = `${side}_lower_half_sleeve`;
    const fullArm = `${side}_full_arm`;
    const fullLeg = `${side}_full_leg`;

    if (
      SELECTION_TARGETS_BY_ID[sleeveLower] &&
      containsAtomic(sleeveLower, atomicZoneId)
    ) {
      candidates.push({
        targetId: sleeveLower,
        kind: "commercial",
        shortLabel: "Media manga inferior",
        rank: 20,
      });
    }
    if (
      SELECTION_TARGETS_BY_ID[sleeveUpper] &&
      containsAtomic(sleeveUpper, atomicZoneId)
    ) {
      candidates.push({
        targetId: sleeveUpper,
        kind: "commercial",
        shortLabel: "Media manga superior",
        rank: 21,
      });
    }
    if (
      SELECTION_TARGETS_BY_ID[sleeveFull] &&
      containsAtomic(sleeveFull, atomicZoneId)
    ) {
      candidates.push({
        targetId: sleeveFull,
        kind: "commercial",
        shortLabel: "Manga completa",
        rank: 30,
      });
    }
    if (containsAtomic(fullArm, atomicZoneId)) {
      candidates.push({
        targetId: fullArm,
        kind: "anatomical",
        shortLabel: "Brazo completo",
        rank: 40,
      });
    }
    if (containsAtomic(fullLeg, atomicZoneId)) {
      candidates.push({
        targetId: fullLeg,
        kind: "anatomical",
        shortLabel: "Pierna completa",
        rank: 40,
      });
    }
  }

  const torsoHeadCandidates: Array<{
    id: string;
    short: string;
    rank: number;
  }> = [
    { id: "full_chest", short: "Pecho completo", rank: 10 },
    { id: "full_abdomen", short: "Abdomen completo", rank: 10 },
    { id: "full_ribs", short: "Costillas", rank: 10 },
    { id: "full_flanks", short: "Costados", rank: 10 },
    { id: "upper_back", short: "Espalda superior", rank: 10 },
    { id: "mid_back", short: "Espalda media", rank: 10 },
    { id: "lower_back", short: "Espalda baja", rank: 10 },
    { id: "front_torso", short: "Torso frontal", rank: 20 },
    { id: "full_back", short: "Espalda completa", rank: 20 },
    { id: "back_torso", short: "Torso posterior", rank: 21 },
    { id: "full_torso", short: "Torso completo", rank: 30 },
    { id: "full_neck", short: "Cuello completo", rank: 10 },
    { id: "full_face", short: "Rostro completo", rank: 10 },
    { id: "full_scalp", short: "Cuero cabelludo", rank: 10 },
    { id: "full_head", short: "Cabeza completa", rank: 20 },
  ];

  for (const c of torsoHeadCandidates) {
    if (!containsAtomic(c.id, atomicZoneId)) continue;
    if (c.id === "back_torso" && containsAtomic("full_back", atomicZoneId)) {
      continue;
    }
    candidates.push({
      targetId: c.id,
      kind: SELECTION_TARGETS_BY_ID[c.id]?.kind ?? "anatomical",
      shortLabel: c.short,
      rank: c.rank,
    });
  }

  const byId = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = byId.get(c.targetId);
    if (!prev || c.rank < prev.rank) byId.set(c.targetId, c);
  }

  return [...byId.values()]
    .sort((a, b) => a.rank - b.rank || a.targetId.localeCompare(b.targetId))
    .map((c) => ({
      targetId: c.targetId,
      kind: c.kind,
      label: getSelectionDisplayLabel(c.targetId),
      shortLabel: c.shortLabel,
    }));
}
