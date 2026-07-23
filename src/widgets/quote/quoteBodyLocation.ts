/**
 * Adaptadores de ubicación corporal para el cotizador.
 * selectedBodyTargets es la fuente canónica.
 * zone / zoneOther solo salen del adapter legacy explícito.
 */

import type { QuoteDraft } from "@/shared/lib/quoteDraft";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  formatZoneDisplay,
  getZoneRefinementFromDraft,
} from "@/shared/lib/quoteZones";
import { upgradeBodySelectionToPublicTargets } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { isPublicSelectableBodyTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";
import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";

/** Sentinel legacy para pasos que aún exigen `zone` truthy. */
export const BODY_3D_ZONE_SENTINEL = "otro" as const;

export const BODY_TARGETS_QUERY_KEY = "bodyTargets";

export function normalizeQuoteBodyTargets(
  targets: readonly BodySelectionTargetId[],
): BodySelectionTargetId[] {
  const upgraded = upgradeBodySelectionToPublicTargets(targets).filter(
    isPublicSelectableBodyTarget,
  );
  return normalizeSelectedTargetIds(upgraded);
}

export function formatBodyTargetsDisplay(
  targets: readonly BodySelectionTargetId[],
): string {
  if (targets.length === 0) return "";
  return targets.map((id) => getSelectionDisplayLabel(id)).join(" · ");
}

export function hasCanonicalBodyTargets(
  draft: QuoteDraft | null | undefined,
): boolean {
  return (draft?.selectedBodyTargets?.length ?? 0) > 0;
}

/**
 * Label humano para resumen / payload.
 * Preferencia: selectedBodyTargets → legacy zone/refinements.
 */
export function formatQuoteLocationLabel(
  draft: QuoteDraft | null | undefined,
  t: (key: SiteCopyKey) => string,
  fallback?: { zone?: string; zoneOther?: string },
): string {
  if (hasCanonicalBodyTargets(draft)) {
    return formatBodyTargetsDisplay(draft!.selectedBodyTargets!);
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

export function isBody3DLocationComplete(
  targets: readonly BodySelectionTargetId[],
): boolean {
  return targets.length > 0;
}

/**
 * Única función de compatibilidad legacy.
 * Produce zone/zoneOther solo cuando hay targets reales.
 * No escribe basura con selección vacía.
 */
export function buildLegacyQuoteLocationFromBodyTargets(
  targets: readonly BodySelectionTargetId[],
): Pick<QuoteDraft, "selectedBodyTargets" | "zone" | "zoneOther"> {
  const normalized = normalizeQuoteBodyTargets(targets);
  if (normalized.length === 0) {
    return {
      selectedBodyTargets: [],
      zone: undefined,
      zoneOther: undefined,
    };
  }
  return {
    selectedBodyTargets: normalized,
    zone: BODY_3D_ZONE_SENTINEL,
    zoneOther: formatBodyTargetsDisplay(normalized),
  };
}

/** @deprecated alias — usar buildLegacyQuoteLocationFromBodyTargets */
export function buildBody3DDraftFields(
  targets: readonly BodySelectionTargetId[],
): Pick<QuoteDraft, "selectedBodyTargets" | "zone" | "zoneOther"> {
  return buildLegacyQuoteLocationFromBodyTargets(targets);
}

export function readBodyTargetsFromDraft(
  draft: QuoteDraft | null | undefined,
): BodySelectionTargetId[] {
  if (!draft?.selectedBodyTargets?.length) return [];
  return normalizeQuoteBodyTargets(draft.selectedBodyTargets);
}

/** Serializa IDs conceptuales estables para query (no labels). */
export function serializeBodyTargetsQuery(
  targets: readonly BodySelectionTargetId[],
): string {
  return normalizeQuoteBodyTargets(targets).join(",");
}

export function parseBodyTargetsQuery(
  raw: string | null | undefined,
): BodySelectionTargetId[] {
  if (!raw?.trim()) return [];
  return normalizeQuoteBodyTargets(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Query params de navegación post-ubicación 3D.
 * Preferencia: bodyTargets=IDs. zone=sentinel sin labels largos en URL.
 */
export function buildBody3DNavigationParams(
  size: string,
  targets: readonly BodySelectionTargetId[],
): URLSearchParams {
  const normalized = normalizeQuoteBodyTargets(targets);
  const params = new URLSearchParams();
  params.set("size", size);
  params.set("zone", BODY_3D_ZONE_SENTINEL);
  if (normalized.length > 0) {
    params.set(BODY_TARGETS_QUERY_KEY, serializeBodyTargetsQuery(normalized));
  }
  return params;
}

/** ¿El draft tiene ubicación lista para avanzar (3D o legacy)? */
export function draftHasLocation(draft: QuoteDraft | null | undefined): boolean {
  if (hasCanonicalBodyTargets(draft)) return true;
  return Boolean(draft?.zone);
}
