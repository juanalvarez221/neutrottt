import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { HEAD_PART_LABEL_KEYS, isHeadPartId, type HeadPartId } from "@/shared/lib/headZoneParts";
import { BACK_PART_LABEL_KEYS, normalizeBackPartId } from "@/shared/lib/backZoneParts";
import {
  ARM_FACE_SCOPE_LABEL_KEYS,
  ARM_PART_LABEL_KEYS,
  isArmFaceScopeId,
  isArmPartId,
  migrateArmSelectionFromDraft,
  type ArmPartId,
} from "@/shared/lib/armZoneParts";
import {
  LEG_EXTENT_LABEL_KEYS,
  LEG_FACE_SCOPE_LABEL_KEYS,
  isLegExtentId,
  isLegFaceScopeId,
  migrateLegSelectionFromDraft,
} from "@/shared/lib/legZoneParts";
import { isLimbLateralityId, LIMB_LATERALITY_LABEL_KEYS } from "@/shared/lib/limbLaterality";

export type ZoneId =
  | "brazo"
  | "brazo_completo"
  | "manga_externa"
  | "manga_interna"
  | "cabeza"
  | "bicep"
  | "tricep"
  | "antebrazo"
  | "hombro"
  | "pecho"
  | "abdomen"
  | "espalda"
  | "pierna"
  | "gluteo"
  | "otro";

export const ARM_ZONES = ["brazo"] as const;
export type ArmZoneId = (typeof ARM_ZONES)[number];

export const POPULAR_ZONES: ZoneId[] = [
  "brazo",
  "cabeza",
  "espalda",
  "pecho",
  "abdomen",
  "pierna",
  "gluteo",
];

export const ALL_ZONES: ZoneId[] = [
  ...ARM_ZONES,
  "brazo_completo",
  "manga_externa",
  "manga_interna",
  "bicep",
  "tricep",
  "antebrazo",
  "hombro",
  ...POPULAR_ZONES.filter((z) => z !== "brazo"),
  "otro",
];

export const ZONE_LABEL_KEYS: Record<ZoneId, SiteCopyKey> = {
  brazo: "quoteZoneArm",
  brazo_completo: "quoteZoneFullArm",
  manga_externa: "quoteZoneOuterSleeve",
  manga_interna: "quoteZoneInnerSleeve",
  cabeza: "quoteZoneHead",
  bicep: "quoteZoneBicep",
  tricep: "quoteZoneTricep",
  antebrazo: "quoteZoneForearm",
  hombro: "quoteZoneShoulder",
  pecho: "quoteZoneChest",
  abdomen: "quoteZoneAbdomen",
  espalda: "quoteZoneBack",
  pierna: "quoteZoneLeg",
  gluteo: "quoteZoneGlute",
  otro: "quoteZoneOther",
};

export const ARM_ZONE_DESC_KEYS = {
  brazo: "quoteZoneArmDesc",
} as const satisfies Record<ArmZoneId, SiteCopyKey>;

export type ZoneRefinement = {
  headPart?: string;
  backPart?: string;
  armLaterality?: string;
  armFaceScope?: string;
  armPart?: string;
  legLaterality?: string;
  legFaceScope?: string;
  legExtent?: string;
};

const LEGACY_ZONE_MAP: Record<string, ZoneId> = {
  brazo: "brazo",
};

export function normalizeZoneId(value: string): ZoneId {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (LEGACY_ZONE_MAP[normalized]) return LEGACY_ZONE_MAP[normalized];
  if (ALL_ZONES.includes(normalized as ZoneId)) return normalized as ZoneId;
  return "brazo";
}

export function isSpotHighlighted(selected: ZoneId, spotId: ZoneId): boolean {
  if (selected === spotId) return true;
  if (selected === "brazo_completo") {
    return ["bicep", "tricep", "antebrazo", "hombro"].includes(spotId);
  }
  if (selected === "manga_externa") {
    return ["bicep", "antebrazo", "hombro"].includes(spotId);
  }
  if (selected === "manga_interna") {
    return ["tricep", "antebrazo"].includes(spotId);
  }
  return false;
}

export function formatZoneDisplay(
  zone: string,
  zoneOther: string | undefined,
  t: (key: SiteCopyKey) => string,
  refinement: ZoneRefinement = {},
): string {
  const id = normalizeZoneId(zone);
  if (id === "otro") {
    const custom = zoneOther?.trim();
    return custom || t("quoteZoneOther");
  }
  const base = t(ZONE_LABEL_KEYS[id]);
  const {
    headPart,
    backPart,
    armLaterality,
    armFaceScope,
    armPart,
    legLaterality,
    legFaceScope,
    legExtent,
  } = refinement;

  if (id === "cabeza" && headPart && isHeadPartId(headPart)) {
    return `${base} — ${t(HEAD_PART_LABEL_KEYS[headPart as HeadPartId])}`;
  }
  if (id === "espalda" && backPart) {
    const normalized = normalizeBackPartId(backPart);
    if (normalized) {
      return `${base} — ${t(BACK_PART_LABEL_KEYS[normalized])}`;
    }
  }
  if (id === "brazo") {
    const parts: string[] = [base];
    if (armLaterality && isLimbLateralityId(armLaterality)) {
      parts.push(t(LIMB_LATERALITY_LABEL_KEYS[armLaterality]));
    }
    if (armFaceScope && isArmFaceScopeId(armFaceScope)) {
      parts.push(t(ARM_FACE_SCOPE_LABEL_KEYS[armFaceScope]));
    }
    if (armPart && isArmPartId(armPart)) {
      parts.push(t(ARM_PART_LABEL_KEYS[armPart as ArmPartId]));
    }
    return parts.length > 1 ? parts.join(" — ") : base;
  }
  if (id === "pierna") {
    const parts: string[] = [base];
    if (legLaterality && isLimbLateralityId(legLaterality)) {
      parts.push(t(LIMB_LATERALITY_LABEL_KEYS[legLaterality]));
    }
    if (legFaceScope && isLegFaceScopeId(legFaceScope)) {
      parts.push(t(LEG_FACE_SCOPE_LABEL_KEYS[legFaceScope]));
    }
    if (legExtent && isLegExtentId(legExtent)) {
      parts.push(t(LEG_EXTENT_LABEL_KEYS[legExtent]));
    }
    return parts.length > 1 ? parts.join(" — ") : base;
  }
  return base;
}

export function getZoneRefinementFromDraft(draft: {
  headPart?: string;
  backPart?: string;
  armLaterality?: string;
  armFaceScope?: string;
  armPart?: string;
  legLaterality?: string;
  legFaceScope?: string;
  legExtent?: string;
  armSide?: string;
  legSide?: string;
  legPart?: string;
} | null | undefined): ZoneRefinement {
  if (!draft) return {};

  const arm = migrateArmSelectionFromDraft(draft);
  const leg = migrateLegSelectionFromDraft(draft);

  return {
    headPart: draft.headPart,
    backPart: draft.backPart,
    armLaterality: arm?.laterality ?? draft.armLaterality,
    armFaceScope: arm?.faceScope ?? draft.armFaceScope ?? draft.armSide,
    armPart: arm?.part ?? draft.armPart ?? undefined,
    legLaterality: leg?.laterality ?? draft.legLaterality,
    legFaceScope: leg?.faceScope ?? draft.legFaceScope ?? draft.legSide,
    legExtent: leg?.extent ?? draft.legExtent,
  };
}
