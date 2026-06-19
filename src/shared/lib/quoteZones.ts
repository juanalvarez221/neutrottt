import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type ZoneId =
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

export const ARM_ZONES = ["brazo_completo", "manga_externa", "manga_interna"] as const;
export type ArmZoneId = (typeof ARM_ZONES)[number];

export const POPULAR_ZONES: ZoneId[] = [
  "cabeza",
  "hombro",
  "espalda",
  "pecho",
  "abdomen",
  "bicep",
  "tricep",
  "antebrazo",
  "pierna",
  "gluteo",
];

export const ALL_ZONES: ZoneId[] = [...ARM_ZONES, ...POPULAR_ZONES, "otro"];

export const ZONE_LABEL_KEYS: Record<ZoneId, SiteCopyKey> = {
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
  brazo_completo: "quoteZoneFullArmDesc",
  manga_externa: "quoteZoneOuterSleeveDesc",
  manga_interna: "quoteZoneInnerSleeveDesc",
} as const satisfies Record<ArmZoneId, SiteCopyKey>;

const LEGACY_ZONE_MAP: Record<string, ZoneId> = {
  brazo: "brazo_completo",
};

export function normalizeZoneId(value: string): ZoneId {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (LEGACY_ZONE_MAP[normalized]) return LEGACY_ZONE_MAP[normalized];
  if (ALL_ZONES.includes(normalized as ZoneId)) return normalized as ZoneId;
  return "brazo_completo";
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
): string {
  const id = normalizeZoneId(zone);
  if (id === "otro") {
    const custom = zoneOther?.trim();
    return custom || t("quoteZoneOther");
  }
  return t(ZONE_LABEL_KEYS[id]);
}
