import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  isLimbLateralityId,
  isLateralitySpotActive,
  type BodyMapLaterality,
  type LimbLateralityId,
} from "@/shared/lib/limbLaterality";

export const LEG_FACE_SCOPE_IDS = ["anterior", "posterior", "ambas"] as const;
export type LegFaceScopeId = (typeof LEG_FACE_SCOPE_IDS)[number];

export const LEG_EXTENT_IDS = ["muslo", "pierna_baja", "completa"] as const;
export type LegExtentId = (typeof LEG_EXTENT_IDS)[number];

export const LEG_PART_IDS = [
  "muslo_anterior",
  "pierna_anterior",
  "muslo_posterior",
  "pierna_posterior",
] as const;

export type LegPartId = (typeof LEG_PART_IDS)[number];

export type LegSelection = {
  laterality: LimbLateralityId;
  faceScope: LegFaceScopeId;
  extent: LegExtentId;
};

export type LegDetailHotspot = {
  id: LegPartId;
  laterality: BodyMapLaterality;
  className: string;
};

export const LEG_FACE_SCOPE_LABEL_KEYS: Record<LegFaceScopeId, SiteCopyKey> = {
  anterior: "quoteLegFaceAnterior",
  posterior: "quoteLegFacePosterior",
  ambas: "quoteLegFaceBoth",
};

export const LEG_FACE_SCOPE_DESC_KEYS: Record<LegFaceScopeId, SiteCopyKey> = {
  anterior: "quoteLegFaceAnteriorDesc",
  posterior: "quoteLegFacePosteriorDesc",
  ambas: "quoteLegFaceBothDesc",
};

export const LEG_EXTENT_LABEL_KEYS: Record<LegExtentId, SiteCopyKey> = {
  muslo: "quoteLegExtentThigh",
  pierna_baja: "quoteLegExtentLower",
  completa: "quoteLegExtentFull",
};

export const LEG_EXTENT_DESC_KEYS: Record<LegExtentId, SiteCopyKey> = {
  muslo: "quoteLegExtentThighDesc",
  pierna_baja: "quoteLegExtentLowerDesc",
  completa: "quoteLegExtentFullDesc",
};

export const LEG_PART_LABEL_KEYS: Record<LegPartId, SiteCopyKey> = {
  muslo_anterior: "quoteLegPartAnteriorThigh",
  pierna_anterior: "quoteLegPartAnteriorLower",
  muslo_posterior: "quoteLegPartPosteriorThigh",
  pierna_posterior: "quoteLegPartPosteriorLower",
};

export const LEG_DETAIL_IMAGE: Record<"anterior" | "posterior", string> = {
  anterior: "/body/leg-anterior-detail.png",
  posterior: "/body/leg-posterior-detail.png",
};

export const LEG_ANTERIOR_DETAIL_HOTSPOTS: LegDetailHotspot[] = [
  {
    id: "muslo_anterior",
    laterality: "derecha",
    className: "left-[35%] top-[6%] h-[39%] w-[30%] rounded-[24%]",
  },
  {
    id: "pierna_anterior",
    laterality: "derecha",
    className: "left-[38%] top-[45%] h-[46%] w-[24%] rounded-[22%]",
  },
  {
    id: "muslo_anterior",
    laterality: "izquierda",
    className: "left-[35%] top-[6%] h-[39%] w-[30%] rounded-[24%]",
  },
  {
    id: "pierna_anterior",
    laterality: "izquierda",
    className: "left-[38%] top-[45%] h-[46%] w-[24%] rounded-[22%]",
  },
];

export const LEG_POSTERIOR_DETAIL_HOTSPOTS: LegDetailHotspot[] = [
  {
    id: "muslo_posterior",
    laterality: "izquierda",
    className: "left-[35%] top-[6%] h-[39%] w-[30%] rounded-[24%]",
  },
  {
    id: "pierna_posterior",
    laterality: "izquierda",
    className: "left-[38%] top-[45%] h-[46%] w-[24%] rounded-[22%]",
  },
  {
    id: "muslo_posterior",
    laterality: "derecha",
    className: "left-[35%] top-[6%] h-[39%] w-[30%] rounded-[24%]",
  },
  {
    id: "pierna_posterior",
    laterality: "derecha",
    className: "left-[38%] top-[45%] h-[46%] w-[24%] rounded-[22%]",
  },
];

const THIGH_PARTS: Record<"anterior" | "posterior", LegPartId> = {
  anterior: "muslo_anterior",
  posterior: "muslo_posterior",
};

const LOWER_PARTS: Record<"anterior" | "posterior", LegPartId> = {
  anterior: "pierna_anterior",
  posterior: "pierna_posterior",
};

export function getLegDetailHotspots(face: "anterior" | "posterior") {
  return face === "posterior" ? LEG_POSTERIOR_DETAIL_HOTSPOTS : LEG_ANTERIOR_DETAIL_HOTSPOTS;
}

export function getLegVisibleFaces(faceScope: LegFaceScopeId): ("anterior" | "posterior")[] {
  if (faceScope === "ambas") return ["anterior", "posterior"];
  return [faceScope];
}

export function getActiveLegParts(selection: LegSelection | null): LegPartId[] {
  if (!selection) return [];

  const faces = getLegVisibleFaces(selection.faceScope);
  const parts: LegPartId[] = [];

  for (const face of faces) {
    if (selection.extent === "muslo" || selection.extent === "completa") {
      parts.push(THIGH_PARTS[face]);
    }

    if (selection.extent === "pierna_baja" || selection.extent === "completa") {
      parts.push(LOWER_PARTS[face]);
    }
  }

  return parts;
}

export function isLegFaceScopeId(value: string): value is LegFaceScopeId {
  return (LEG_FACE_SCOPE_IDS as readonly string[]).includes(value);
}

export function isLegExtentId(value: string): value is LegExtentId {
  return (LEG_EXTENT_IDS as readonly string[]).includes(value);
}

export function isLegPartId(value: string): value is LegPartId {
  return (LEG_PART_IDS as readonly string[]).includes(value);
}

export function isLegDetailHotspotActive(
  hotspot: LegDetailHotspot,
  selection: LegSelection | null,
): boolean {
  if (!selection) return false;
  if (!isLateralitySpotActive(hotspot.laterality, selection.laterality)) return false;

  return getActiveLegParts(selection).includes(hotspot.id);
}

export function shouldShowLegDetailHotspot(
  hotspot: LegDetailHotspot,
  selection: LegSelection,
): boolean {
  if (selection.laterality === "ambas") return hotspot.laterality === "derecha";
  return isLateralitySpotActive(hotspot.laterality, selection.laterality);
}

export function isLegBodyMapSpotActive(
  mapSide: "front" | "back",
  spotLegPart: LegPartId | undefined,
  spotLaterality: BodyMapLaterality | undefined,
  selection: LegSelection | null,
): boolean {
  if (!selection || !spotLegPart) return false;
  if (!getActiveLegParts(selection).includes(spotLegPart)) return false;

  const isAnterior = spotLegPart === "muslo_anterior" || spotLegPart === "pierna_anterior";

  if (isAnterior && mapSide !== "front") return false;
  if (!isAnterior && mapSide !== "back") return false;

  if (spotLaterality) {
    return isLateralitySpotActive(spotLaterality, selection.laterality);
  }

  return true;
}

export function inferLegSelectionFromBodySpot(
  spotLegPart: LegPartId,
  spotLaterality: BodyMapLaterality,
): LegSelection {
  const faceScope: LegFaceScopeId =
    spotLegPart === "muslo_anterior" || spotLegPart === "pierna_anterior"
      ? "anterior"
      : "posterior";

  const extent: LegExtentId =
    spotLegPart === "muslo_anterior" || spotLegPart === "muslo_posterior"
      ? "muslo"
      : "pierna_baja";

  return {
    laterality: spotLaterality,
    faceScope,
    extent,
  };
}

export function inferLegSelectionFromPartClick(
  partId: LegPartId,
  current: LegSelection | null,
): LegSelection {
  const faceScope: LegFaceScopeId =
    partId === "muslo_anterior" || partId === "pierna_anterior"
      ? "anterior"
      : "posterior";

  const extent: LegExtentId =
    partId === "muslo_anterior" || partId === "muslo_posterior"
      ? "muslo"
      : "pierna_baja";

  return {
    laterality: current?.laterality ?? "ambas",
    faceScope,
    extent,
  };
}

export function migrateLegSelectionFromDraft(draft: {
  legLaterality?: string;
  legFaceScope?: string;
  legExtent?: string;
  legSide?: string;
  legPart?: string;
}): LegSelection | null {
  if (
    draft.legLaterality &&
    isLimbLateralityId(draft.legLaterality) &&
    draft.legFaceScope &&
    isLegFaceScopeId(draft.legFaceScope) &&
    draft.legExtent &&
    isLegExtentId(draft.legExtent)
  ) {
    return {
      laterality: draft.legLaterality,
      faceScope: draft.legFaceScope,
      extent: draft.legExtent,
    };
  }

  if (draft.legSide && isLegFaceScopeId(draft.legSide) && draft.legPart && isLegPartId(draft.legPart)) {
    const extent: LegExtentId =
      draft.legPart === "muslo_anterior" || draft.legPart === "muslo_posterior"
        ? "muslo"
        : "pierna_baja";

    return {
      laterality:
        draft.legLaterality && isLimbLateralityId(draft.legLaterality)
          ? draft.legLaterality
          : "ambas",
      faceScope: draft.legSide,
      extent,
    };
  }

  if (draft.legPart && isLegPartId(draft.legPart)) {
    const faceScope: LegFaceScopeId =
      draft.legPart === "muslo_anterior" || draft.legPart === "pierna_anterior"
        ? "anterior"
        : "posterior";

    const extent: LegExtentId =
      draft.legPart === "muslo_anterior" || draft.legPart === "muslo_posterior"
        ? "muslo"
        : "pierna_baja";

    return {
      laterality: "ambas",
      faceScope,
      extent,
    };
  }

  return null;
}

export function isLegSelectionComplete(selection: LegSelection | null): selection is LegSelection {
  return Boolean(selection?.laterality && selection?.faceScope && selection?.extent);
}