import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export const LIMB_LATERALITY_IDS = ["izquierda", "derecha", "ambas"] as const;
export type LimbLateralityId = (typeof LIMB_LATERALITY_IDS)[number];

/** Solo izquierda/derecha — primer paso del brazo antes de más detalle. */
export const ARM_LATERALITY_SIDE_IDS = ["izquierda", "derecha"] as const;
export type ArmLateralitySideId = (typeof ARM_LATERALITY_SIDE_IDS)[number];

export const LIMB_LATERALITY_LABEL_KEYS: Record<LimbLateralityId, SiteCopyKey> = {
  izquierda: "quoteLimbLateralityLeft",
  derecha: "quoteLimbLateralityRight",
  ambas: "quoteLimbLateralityBoth",
};

export const LIMB_LATERALITY_DESC_KEYS: Record<LimbLateralityId, SiteCopyKey> = {
  izquierda: "quoteLimbLateralityLeftDesc",
  derecha: "quoteLimbLateralityRightDesc",
  ambas: "quoteLimbLateralityBothDesc",
};

/** Lado anatómico del cuerpo en el mapa (pierna/brazo del sujeto). */
export type BodyMapLaterality = "izquierda" | "derecha";

/**
 * Infiere lateralidad anatómica desde la posición horizontal (% `left`) de un hotspot.
 * Vista frontal = espejo: lo que ves a tu izquierda es la derecha del sujeto.
 * Vista posterior = orientación real: la izquierda del sujeto queda a la izquierda de la imagen.
 */
export function inferLateralityFromHorizontalPosition(
  leftPercent: number,
  view: "front" | "back",
): BodyMapLaterality {
  const onViewerLeft = leftPercent < 50;
  if (view === "front") {
    return onViewerLeft ? "derecha" : "izquierda";
  }
  return onViewerLeft ? "izquierda" : "derecha";
}

/** Extrae % `left` de una clase Tailwind (`left-[38.5%]`) e infiere lateralidad según la vista. */
export function inferLateralityFromClassName(
  className: string,
  view: "front" | "back",
): BodyMapLaterality | undefined {
  const match = /left-\[([\d.]+)%\]/.exec(className);
  if (!match) return undefined;
  return inferLateralityFromHorizontalPosition(parseFloat(match[1]), view);
}

export function isLimbLateralityId(value: string): value is LimbLateralityId {
  return (LIMB_LATERALITY_IDS as readonly string[]).includes(value);
}

export function isLateralitySpotActive(
  spot: BodyMapLaterality,
  selected: LimbLateralityId | null,
): boolean {
  if (!selected) return true;
  if (selected === "ambas") return true;
  return spot === selected;
}
