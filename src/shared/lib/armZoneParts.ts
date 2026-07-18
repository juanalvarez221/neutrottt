import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import type { ZoneId } from "@/shared/lib/quoteZones";
import {
  isLateralitySpotActive,
  isLimbLateralityId,
  type BodyMapLaterality,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";

export const ARM_FACE_SCOPE_IDS = ["externa", "interna", "ambas"] as const;
export type ArmFaceScopeId = (typeof ARM_FACE_SCOPE_IDS)[number];

export const ARM_SIDE_IDS = ["externa", "interna"] as const;
export type ArmSideId = (typeof ARM_SIDE_IDS)[number];

export type ArmSelection = {
  laterality?: LimbLateralityId;
  faceScope?: ArmFaceScopeId;
  part?: ArmPartId | null;
};

export const ARM_PIECE_PART_IDS = [
  "hombro",
  "bicep",
  "tricep",
  "antebrazo",
  "mano",
] as const;

export type ArmPiecePartId = (typeof ARM_PIECE_PART_IDS)[number];

export const ARM_COVERAGE_PART_IDS = [
  "manga_completa",
  "codo_hombro",
  "codo_mano",
] as const;

export type ArmCoveragePartId = (typeof ARM_COVERAGE_PART_IDS)[number];

export const ARM_PART_IDS = [...ARM_PIECE_PART_IDS, ...ARM_COVERAGE_PART_IDS] as const;

export type ArmPartId = (typeof ARM_PART_IDS)[number];

export const ARM_SIDE_LABEL_KEYS: Record<ArmSideId, SiteCopyKey> = {
  externa: "quoteArmSideOuter",
  interna: "quoteArmSideInner",
};

export const ARM_FACE_SCOPE_LABEL_KEYS: Record<ArmFaceScopeId, SiteCopyKey> = {
  externa: "quoteArmSideOuter",
  interna: "quoteArmSideInner",
  ambas: "quoteArmFaceBoth",
};

export const ARM_FACE_SCOPE_DESC_KEYS: Record<ArmFaceScopeId, SiteCopyKey> = {
  externa: "quoteArmFaceOuterDesc",
  interna: "quoteArmFaceInnerDesc",
  ambas: "quoteArmFaceBothDesc",
};

export const ARM_PART_LABEL_KEYS: Record<ArmPartId, SiteCopyKey> = {
  hombro: "quoteZoneShoulder",
  bicep: "quoteZoneBicep",
  tricep: "quoteZoneTricep",
  antebrazo: "quoteZoneForearm",
  mano: "quoteArmPartHand",
  manga_completa: "quoteArmPartFullSleeve",
  codo_hombro: "quoteArmPartElbowShoulder",
  codo_mano: "quoteArmPartElbowHand",
};

export const ARM_DETAIL_IMAGE: Record<ArmSideId, string> = {
  externa: "/body/arm-outer-detail.png",
  interna: "/body/arm-inner-detail.png",
};

export const ARM_OUTER_DETAIL_HOTSPOTS: { id: ArmPiecePartId; className: string }[] = [
  {
    id: "hombro",
    className: "left-[4.5%] top-[30%] h-[28%] w-[14%] rounded-[30%]",
  },
  {
    id: "bicep",
    className: "left-[18%] top-[29%] h-[17%] w-[20%] rounded-[999px]",
  },
  {
    id: "tricep",
    className: "left-[18%] top-[48%] h-[16%] w-[20%] rounded-[999px]",
  },
  {
    id: "antebrazo",
    className: "left-[40%] top-[31%] h-[26%] w-[28%] rounded-[999px]",
  },
  {
    id: "mano",
    className: "left-[70%] top-[33%] h-[24%] w-[22%] rounded-[20%]",
  },
];

export const ARM_INNER_DETAIL_HOTSPOTS: { id: ArmPiecePartId; className: string }[] = [
  {
    id: "hombro",
    className: "left-[36%] top-[5%] h-[14%] w-[28%] rounded-[24%]",
  },
  {
    id: "bicep",
    className: "left-[31%] top-[21%] h-[18%] w-[26%] rounded-[999px]",
  },
  {
    id: "tricep",
    className: "left-[20%] top-[21%] h-[20%] w-[20%] rounded-[999px]",
  },
  {
    id: "antebrazo",
    className: "left-[26%] top-[41%] h-[28%] w-[27%] rounded-[999px]",
  },
  {
    id: "mano",
    className: "left-[23%] top-[69%] h-[20%] w-[30%] rounded-[20%]",
  },
];

export function getArmDetailHotspots(face: ArmSideId) {
  return face === "interna" ? ARM_INNER_DETAIL_HOTSPOTS : ARM_OUTER_DETAIL_HOTSPOTS;
}

export function getArmVisibleFaces(faceScope: ArmFaceScopeId): ArmSideId[] {
  if (faceScope === "ambas") return ["externa", "interna"];
  return [faceScope];
}

export function isArmFaceScopeId(value: string): value is ArmFaceScopeId {
  return (ARM_FACE_SCOPE_IDS as readonly string[]).includes(value);
}

const COVERAGE_PIECES: Record<ArmCoveragePartId, readonly ArmPiecePartId[]> = {
  manga_completa: ARM_PIECE_PART_IDS,
  codo_hombro: ["hombro", "bicep", "tricep"],
  codo_mano: ["antebrazo", "mano"],
};

const PIECE_BODY_REGIONS: Record<
  ArmPiecePartId,
  { front: ZoneId[]; back: ZoneId[] }
> = {
  hombro: { front: ["hombro"], back: ["hombro"] },
  bicep: { front: ["bicep"], back: [] },
  tricep: { front: [], back: ["tricep"] },
  antebrazo: { front: ["antebrazo"], back: ["antebrazo"] },
  mano: { front: ["antebrazo"], back: ["antebrazo"] },
};

export function isArmSideId(value: string): value is ArmSideId {
  return (ARM_SIDE_IDS as readonly string[]).includes(value);
}

export function isArmPartId(value: string): value is ArmPartId {
  return (ARM_PART_IDS as readonly string[]).includes(value);
}

export function getActiveArmPieceParts(part: ArmPartId | null): ArmPiecePartId[] {
  if (!part) return [];

  if ((ARM_COVERAGE_PART_IDS as readonly string[]).includes(part)) {
    return [...COVERAGE_PIECES[part as ArmCoveragePartId]];
  }

  return [part as ArmPiecePartId];
}

export function isArmDetailHotspotActive(
  hotspotId: ArmPiecePartId,
  selectedPart: ArmPartId | null,
): boolean {
  if (!selectedPart) return false;
  return getActiveArmPieceParts(selectedPart).includes(hotspotId);
}

export function isArmBodyMapSpotActive(
  mapSide: "front" | "back",
  spotId: ZoneId,
  spotLaterality: BodyMapLaterality | undefined,
  selection: ArmSelection | null,
): boolean {
  if (!selection?.part) return false;

  const pieces = getActiveArmPieceParts(selection.part);
  const matches = pieces.some((piece) => PIECE_BODY_REGIONS[piece][mapSide].includes(spotId));

  if (!matches) return false;

  if (selection.faceScope === "interna" && piecePrefersOuterFace(selection.part, spotId)) {
    return false;
  }

  if (selection.faceScope === "externa" && piecePrefersInnerFace(selection.part, spotId)) {
    return false;
  }

  if (spotLaterality && selection.laterality) {
    return isLateralitySpotActive(spotLaterality, selection.laterality);
  }

  return true;
}

function piecePrefersOuterFace(part: ArmPartId, spotId: ZoneId): boolean {
  return part === "bicep" && spotId === "tricep";
}

function piecePrefersInnerFace(part: ArmPartId, spotId: ZoneId): boolean {
  return part === "tricep" && spotId === "bicep";
}

export function inferArmSideFromBodySpot(spotId: ZoneId, mapSide: "front" | "back"): ArmSideId {
  if (mapSide === "back" && spotId === "tricep") return "interna";
  if (mapSide === "front" && spotId === "bicep") return "externa";
  if (mapSide === "front" && spotId === "antebrazo") return "interna";
  return "externa";
}

export function inferArmPartFromBodySpot(spotId: ZoneId): ArmPartId | null {
  if (spotId === "hombro") return "hombro";
  if (spotId === "bicep") return "bicep";
  if (spotId === "tricep") return "tricep";
  if (spotId === "antebrazo") return "antebrazo";
  return null;
}

export function inferArmSelectionFromBodySpot(
  spotId: ZoneId,
  mapSide: "front" | "back",
  spotLaterality: BodyMapLaterality,
): ArmSelection | null {
  const part = inferArmPartFromBodySpot(spotId);

  if (!part) return null;

  return {
    laterality: spotLaterality,
    faceScope: inferArmSideFromBodySpot(spotId, mapSide),
    part,
  };
}

/** Sugiere parte y cara del brazo desde el mapa, sin fijar lateralidad (el usuario la confirma). */
export function inferArmSelectionHintFromBodySpot(
  spotId: ZoneId,
  mapSide: "front" | "back",
): ArmSelection | null {
  const part = inferArmPartFromBodySpot(spotId);
  if (!part) return null;

  return {
    faceScope: inferArmSideFromBodySpot(spotId, mapSide),
    part,
  };
}

export function migrateArmSelectionFromDraft(draft: {
  armLaterality?: string;
  armFaceScope?: string;
  armPart?: string;
  armSide?: string;
}): ArmSelection | null {
  if (draft.armPart && isArmPartId(draft.armPart)) {
    const laterality =
      draft.armLaterality && isLimbLateralityId(draft.armLaterality)
        ? draft.armLaterality
        : "ambas";

    const faceScope =
      draft.armFaceScope && isArmFaceScopeId(draft.armFaceScope)
        ? draft.armFaceScope
        : draft.armSide && isArmSideId(draft.armSide)
          ? draft.armSide
          : "externa";

    return {
      laterality,
      faceScope,
      part: draft.armPart,
    };
  }

  return null;
}

export function isArmSelectionComplete(
  selection: ArmSelection | null,
): selection is ArmSelection & { part: ArmPartId } {
  return Boolean(selection?.laterality && selection?.faceScope && selection?.part);
}

export function isArmRelatedBodySpot(spotId: ZoneId): boolean {
  return ["hombro", "bicep", "tricep", "antebrazo"].includes(spotId);
}