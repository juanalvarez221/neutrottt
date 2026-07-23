/**
 * Helpers de copy UX para el selector corporal premium.
 */

import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";

export type ZoneLabelParts = {
  /** Ej. "Antebrazo derecho" */
  region: string;
  /** Ej. "Cara externa" — null si no hay subtítulo */
  detail: string | null;
  /** Label completo */
  full: string;
};

/** Separa "Región · Detalle" en partes para panel / tooltip. */
export function splitZoneLabel(idOrLabel: string): ZoneLabelParts {
  const full = idOrLabel.includes("_")
    ? getSelectionDisplayLabel(idOrLabel)
    : idOrLabel;
  const sep = full.indexOf(" · ");
  if (sep === -1) {
    return { region: full, detail: null, full };
  }
  return {
    region: full.slice(0, sep).trim(),
    detail: full.slice(sep + 3).trim(),
    full,
  };
}

/** Short label natural para la opción exacta (cara / zona puntual). */
export function exactOptionShortLabel(atomicZoneId: string): string {
  const parts = splitZoneLabel(atomicZoneId);
  return parts.detail ?? parts.region;
}
