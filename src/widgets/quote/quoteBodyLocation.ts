/**
 * Adaptadores de ubicación corporal para el cotizador.
 * Separados del motor 3D — no contaminan bodySelectionEngine.
 */

import type { QuoteDraft } from "@/shared/lib/quoteDraft";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  formatZoneDisplay,
  getZoneRefinementFromDraft,
} from "@/shared/lib/quoteZones";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";
import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";

/** Sentinel legacy: pasos que aún leen `zone` como string. */
export const BODY_3D_ZONE_SENTINEL = "otro" as const;

export function normalizeQuoteBodyTargets(
  targets: readonly BodySelectionTargetId[],
): BodySelectionTargetId[] {
  return normalizeSelectedTargetIds(targets);
}

export function formatBodyTargetsDisplay(
  targets: readonly BodySelectionTargetId[],
): string {
  if (targets.length === 0) return "";
  return targets.map((id) => getSelectionDisplayLabel(id)).join(" · ");
}

/**
 * Label humano para resumen / payload.
 * Preferencia: selectedBodyTargets conceptuales → legacy zone/refinements.
 */
export function formatQuoteLocationLabel(
  draft: QuoteDraft | null | undefined,
  t: (key: SiteCopyKey) => string,
  fallback?: { zone?: string; zoneOther?: string },
): string {
  const targets = draft?.selectedBodyTargets;
  if (targets && targets.length > 0) {
    return formatBodyTargetsDisplay(targets);
  }

  const zone = fallback?.zone ?? draft?.zone ?? "";
  const zoneOther = fallback?.zoneOther ?? draft?.zoneOther;
  if (!zone) return "";

  return formatZoneDisplay(
    zone,
    zoneOther,
    t,
    getZoneRefinementFromDraft(draft ?? {}),
  );
}

/** ¿Hay ubicación lista para Continuar en modo 3D? */
export function isBody3DLocationComplete(
  targets: readonly BodySelectionTargetId[],
): boolean {
  return targets.length > 0;
}

/**
 * Campos a persistir en QuoteDraft al continuar desde el selector 3D.
 * Conserva conceptual targets; rellena zone/zoneOther para compatibilidad.
 */
export function buildBody3DDraftFields(
  targets: readonly BodySelectionTargetId[],
): Pick<QuoteDraft, "selectedBodyTargets" | "zone" | "zoneOther"> {
  const normalized = normalizeQuoteBodyTargets(targets);
  const labels = formatBodyTargetsDisplay(normalized);
  return {
    selectedBodyTargets: normalized,
    zone: BODY_3D_ZONE_SENTINEL,
    zoneOther: labels || undefined,
  };
}

export function readBodyTargetsFromDraft(
  draft: QuoteDraft | null | undefined,
): BodySelectionTargetId[] {
  if (!draft?.selectedBodyTargets) return [];
  return normalizeQuoteBodyTargets(draft.selectedBodyTargets);
}
