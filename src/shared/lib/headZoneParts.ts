import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export const HEAD_PART_IDS = [
  "cuero_cabelludo",
  "frente",
  "sien",
  "lateral_derecho",
  "lateral_izquierdo",
  "detras_oreja",
  "nuca",
] as const;

export type HeadPartId = (typeof HEAD_PART_IDS)[number];

export type HeadDetailHotspot = {
  id: HeadPartId;
  className: string;
};

export const HEAD_PART_LABEL_KEYS: Record<HeadPartId, SiteCopyKey> = {
  cuero_cabelludo: "quoteHeadPartScalp",
  frente: "quoteHeadPartForehead",
  sien: "quoteHeadPartTemple",
  lateral_derecho: "quoteHeadPartRight",
  lateral_izquierdo: "quoteHeadPartLeft",
  detras_oreja: "quoteHeadPartBehindEar",
  nuca: "quoteHeadPartNape",
};

export const HEAD_PART_DETAIL_VIEW_LABEL_KEYS: Record<HeadPartId, SiteCopyKey> = {
  cuero_cabelludo: "quoteHeadPartScalpViewLabel",
  frente: "quoteHeadPartScalpViewLabel",
  sien: "quoteHeadPartScalpViewLabel",
  lateral_derecho: "quoteHeadPartRightViewLabel",
  lateral_izquierdo: "quoteHeadPartLeftViewLabel",
  detras_oreja: "quoteHeadPartRightViewLabel",
  nuca: "quoteHeadPartNapeViewLabel",
};

export const HEAD_PART_DETAIL_VIEW_ALT_KEYS: Record<HeadPartId, SiteCopyKey> = {
  cuero_cabelludo: "quoteHeadPartScalpViewAlt",
  frente: "quoteHeadPartScalpViewAlt",
  sien: "quoteHeadPartScalpViewAlt",
  lateral_derecho: "quoteHeadPartRightViewAlt",
  lateral_izquierdo: "quoteHeadPartLeftViewAlt",
  detras_oreja: "quoteHeadPartRightViewAlt",
  nuca: "quoteHeadPartNapeViewAlt",
};

const HEAD_TOP_DETAIL_IMAGE = "/body/head-top-profile.png";
const HEAD_BACK_DETAIL_IMAGE = "/body/head-back-profile.png";
const HEAD_RIGHT_DETAIL_IMAGE = "/body/head-right-profile.png";
const HEAD_LEFT_DETAIL_IMAGE = "/body/head-left-profile.png";

export function isHeadPartId(value: string): value is HeadPartId {
  return (HEAD_PART_IDS as readonly string[]).includes(value);
}

/**
 * Elegimos la vista más anatómicamente coherente:
 * - cuero cabelludo / frente / sien => vista superior
 * - lateral derecho => vista lateral derecha
 * - lateral izquierdo => vista lateral izquierda
 * - detrás de la oreja => vista lateral derecha (referencia clara retroauricular)
 * - nuca => vista posterior
 */
export function getHeadReferenceImage(part: HeadPartId | null): string {
  if (!part) return HEAD_TOP_DETAIL_IMAGE;

  switch (part) {
    case "cuero_cabelludo":
    case "frente":
    case "sien":
      return HEAD_TOP_DETAIL_IMAGE;

    case "lateral_derecho":
      return HEAD_RIGHT_DETAIL_IMAGE;

    case "lateral_izquierdo":
      return HEAD_LEFT_DETAIL_IMAGE;

    case "detras_oreja":
      return HEAD_RIGHT_DETAIL_IMAGE;

    case "nuca":
      return HEAD_BACK_DETAIL_IMAGE;

    default:
      return HEAD_TOP_DETAIL_IMAGE;
  }
}

/**
 * VISTA SUPERIOR
 * Ajuste anatómico:
 * - cuero cabelludo = bóveda craneal / parte alta
 * - frente = franja frontal inferior, no tan arriba
 * - sien = zonas laterales frontotemporales
 */
const HEAD_TOP_DETAIL_HOTSPOTS: HeadDetailHotspot[] = [
  {
    id: "cuero_cabelludo",
    className: "left-[24%] top-[7%] h-[34%] w-[52%] rounded-[999px]",
  },
  {
    id: "frente",
    className: "left-[35%] top-[47.5%] h-[11%] w-[30%] rounded-[18%]",
  },
  {
    id: "sien",
    className: "left-[18.5%] top-[36.5%] h-[15.5%] w-[13.5%] rounded-[22%]",
  },
  {
    id: "sien",
    className: "left-[68%] top-[36.5%] h-[15.5%] w-[13.5%] rounded-[22%]",
  },
];

/**
 * VISTA LATERAL DERECHA
 * Ajuste anatómico:
 * - lateral_derecho = costado real del cráneo, evitando cara y cuello
 * - sien = delante de la oreja, zona temporofrontal
 * - detrás de la oreja = región retroauricular, no en la cara
 * - nuca = inserción posterior baja, sobre cuello posterior
 */
const HEAD_RIGHT_DETAIL_HOTSPOTS: HeadDetailHotspot[] = [
  {
    id: "lateral_derecho",
    className: "left-[29%] top-[10%] h-[48%] w-[42%] rounded-[34%]",
  },
  {
    id: "sien",
    className: "left-[59.5%] top-[30.5%] h-[13.5%] w-[11.5%] rounded-[20%]",
  },
  {
    id: "detras_oreja",
    className: "left-[35.5%] top-[33.5%] h-[18%] w-[11.5%] rounded-[18%]",
  },
  {
    id: "nuca",
    className: "left-[30%] top-[61.5%] h-[14%] w-[18%] rounded-[18%]",
  },
];

/**
 * VISTA LATERAL IZQUIERDA
 * Espejo anatómico de la lateral derecha.
 */
const HEAD_LEFT_DETAIL_HOTSPOTS: HeadDetailHotspot[] = [
  {
    id: "lateral_izquierdo",
    className: "left-[29%] top-[10%] h-[48%] w-[42%] rounded-[34%]",
  },
  {
    id: "sien",
    className: "left-[29%] top-[30.5%] h-[13.5%] w-[11.5%] rounded-[20%]",
  },
  {
    id: "detras_oreja",
    className: "left-[54%] top-[33.5%] h-[18%] w-[11.5%] rounded-[18%]",
  },
  {
    id: "nuca",
    className: "left-[53%] top-[61.5%] h-[14%] w-[18%] rounded-[18%]",
  },
];

/**
 * VISTA POSTERIOR
 * - cuero cabelludo = calota posterior
 * - nuca = parte media-baja posterior
 * - detrás de la oreja = regiones retroauriculares posteriores
 */
const HEAD_BACK_DETAIL_HOTSPOTS: HeadDetailHotspot[] = [
  {
    id: "cuero_cabelludo",
    className: "left-[23%] top-[8%] h-[35%] w-[54%] rounded-[999px]",
  },
  {
    id: "nuca",
    className: "left-[34.5%] top-[61.5%] h-[15.5%] w-[31%] rounded-[18%]",
  },
  {
    id: "detras_oreja",
    className: "left-[14.5%] top-[33.5%] h-[18%] w-[11.5%] rounded-[18%]",
  },
  {
    id: "detras_oreja",
    className: "left-[74%] top-[33.5%] h-[18%] w-[11.5%] rounded-[18%]",
  },
];

export function getHeadDetailHotspots(src: string): HeadDetailHotspot[] {
  if (src === HEAD_RIGHT_DETAIL_IMAGE) return HEAD_RIGHT_DETAIL_HOTSPOTS;
  if (src === HEAD_LEFT_DETAIL_IMAGE) return HEAD_LEFT_DETAIL_HOTSPOTS;
  if (src === HEAD_BACK_DETAIL_IMAGE) return HEAD_BACK_DETAIL_HOTSPOTS;
  return HEAD_TOP_DETAIL_HOTSPOTS;
}