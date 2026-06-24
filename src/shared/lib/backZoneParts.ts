import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export const BACK_PART_IDS = [
  "trapecios",
  "escapula_izquierda",
  "escapula_derecha",
  "columna",
  "espalda_alta",
  "espalda_media",
  "lumbar",
] as const;

export type BackPartId = (typeof BACK_PART_IDS)[number];

export type BackDetailHotspot = {
  id: BackPartId;
  className: string;
};

export const BACK_PART_LABEL_KEYS: Record<BackPartId, SiteCopyKey> = {
  trapecios: "quoteBackPartTrapezius" as SiteCopyKey,
  escapula_izquierda: "quoteBackPartLeftScapula" as SiteCopyKey,
  escapula_derecha: "quoteBackPartRightScapula" as SiteCopyKey,
  columna: "quoteBackPartSpine" as SiteCopyKey,
  espalda_alta: "quoteBackPartUpper" as SiteCopyKey,
  espalda_media: "quoteBackPartMiddle" as SiteCopyKey,
  lumbar: "quoteBackPartLower" as SiteCopyKey,
};

export const BACK_DETAIL_IMAGE = "/body/back-detail.png";

export const BACK_DETAIL_HOTSPOTS: BackDetailHotspot[] = [
  {
    id: "trapecios",
    className: "left-[25%] top-[8%] h-[11%] w-[50%] rounded-[18%]",
  },
  {
    id: "escapula_izquierda",
    className: "left-[18%] top-[22%] h-[21%] w-[27%] rounded-[22%]",
  },
  {
    id: "escapula_derecha",
    className: "left-[55%] top-[22%] h-[21%] w-[27%] rounded-[22%]",
  },
  {
    id: "columna",
    className: "left-[47%] top-[18%] h-[53%] w-[6%] rounded-[999px]",
  },
  {
    id: "espalda_alta",
    className: "left-[21%] top-[18%] h-[22%] w-[58%] rounded-[20%]",
  },
  {
    id: "espalda_media",
    className: "left-[25%] top-[42%] h-[21%] w-[50%] rounded-[18%]",
  },
  {
    id: "lumbar",
    className: "left-[31%] top-[64%] h-[15%] w-[38%] rounded-[16%]",
  },
];

export function isBackPartId(value: string): value is BackPartId {
  return (BACK_PART_IDS as readonly string[]).includes(value);
}