import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export const BACK_PART_IDS = ["espalda_alta", "lumbar"] as const;

export type BackPartId = (typeof BACK_PART_IDS)[number];

export type BackDetailHotspot = {
  id: BackPartId;
  className: string;
};

export const BACK_PART_LABEL_KEYS: Record<BackPartId, SiteCopyKey> = {
  espalda_alta: "quoteBackPartUpper",
  lumbar: "quoteBackPartLower",
};

/** IDs antiguos del cotizador, se mapean a alta o baja. */
const LEGACY_BACK_PART_MAP: Record<string, BackPartId> = {
  trapecios: "espalda_alta",
  escapula_izquierda: "espalda_alta",
  escapula_derecha: "espalda_alta",
  columna: "espalda_alta",
  espalda_media: "espalda_alta",
};

export const BACK_DETAIL_IMAGE = "/body/back-detail.png";

export const BACK_DETAIL_HOTSPOTS: BackDetailHotspot[] = [
  {
    id: "espalda_alta",
    className: "left-[12%] top-[9%] h-[42%] w-[76%] rounded-[24%]",
  },
  {
    id: "lumbar",
    className: "left-[16%] top-[51%] h-[30%] w-[68%] rounded-[22%]",
  },
];

export function isBackPartId(value: string): value is BackPartId {
  return (BACK_PART_IDS as readonly string[]).includes(value);
}

export function normalizeBackPartId(value: string): BackPartId | null {
  if (isBackPartId(value)) return value;
  return LEGACY_BACK_PART_MAP[value] ?? null;
}
