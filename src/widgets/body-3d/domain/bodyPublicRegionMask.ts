/**
 * UV Region ID Mask — overlay de highlights públicos sobre BodyVisual.
 * Independiente del InteractionModel (81 zonas / raycast).
 */

import publicRegionMaskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";

export const BODY_PUBLIC_REGION_MASK_MANIFEST_SRC =
  "/models/interaction/neutro_body_v1_anatomical_region_ids.json";

export type PublicRegionMaskRegionEntry = {
  maskIndex: number;
};

export type PublicRegionMaskManifest = {
  model: string;
  maskTexture: string;
  /** Short content hash of the runtime R8 mask PNG (cache-bust). */
  maskHash?: string;
  resolution: number;
  encoding: string;
  indexScale: number;
  regions: Record<string, PublicRegionMaskRegionEntry>;
  composites: Record<string, readonly string[]>;
};

export const BODY_PUBLIC_REGION_MASK_MANIFEST =
  publicRegionMaskManifest as PublicRegionMaskManifest;

export const BODY_PUBLIC_REGION_MASK_RESOLUTION =
  BODY_PUBLIC_REGION_MASK_MANIFEST.resolution;

export const BODY_PUBLIC_REGION_MASK_ENCODING =
  BODY_PUBLIC_REGION_MASK_MANIFEST.encoding;

export const BODY_PUBLIC_REGION_MASK_INDEX_SCALE =
  BODY_PUBLIC_REGION_MASK_MANIFEST.indexScale;

/** Content hash used for cache-busting the mask texture URL. */
export const BODY_PUBLIC_REGION_MASK_HASH =
  BODY_PUBLIC_REGION_MASK_MANIFEST.maskHash ?? "dev";

/**
 * Versioned mask texture URL. Changing maskHash must change this string so
 * browsers/drei do not reuse a stale PNG.
 */
export function buildPublicRegionMaskSrc(
  maskTexture: string,
  maskHash: string,
): string {
  const base = maskTexture.split("?")[0] ?? maskTexture;
  return `${base}?v=${maskHash}`;
}

export const BODY_PUBLIC_REGION_MASK_SRC = buildPublicRegionMaskSrc(
  BODY_PUBLIC_REGION_MASK_MANIFEST.maskTexture,
  BODY_PUBLIC_REGION_MASK_HASH,
);

const REGION_TO_MASK_INDEX: ReadonlyMap<string, number> = new Map(
  Object.entries(BODY_PUBLIC_REGION_MASK_MANIFEST.regions).map(
    ([id, entry]) => [id, entry.maskIndex],
  ),
);

/** Legacy visual IDs → canonical surface IDs (S02 promotion). */
const LEGACY_MASK_REGION_ALIASES: Readonly<Record<string, string>> = {
  upper_back_region: "upper_back_surface",
  lower_back_region: "lower_back_surface",
};

const LEGACY_MASK_INDEX_FALLBACK: Readonly<Record<string, number>> = {
  upper_back_surface: 14,
  lower_back_surface: 15,
  upper_back_region: 14,
  lower_back_region: 15,
};

/** Índice de máscara (1–255) para un region id; null si no existe. */
export function getMaskIndexForRegionId(id: string): number | null {
  const direct = REGION_TO_MASK_INDEX.get(id);
  if (direct !== undefined) return direct;

  const canonical = LEGACY_MASK_REGION_ALIASES[id];
  if (canonical) {
    const viaCanonical = REGION_TO_MASK_INDEX.get(canonical);
    if (viaCanonical !== undefined) return viaCanonical;
  }

  const fallback = LEGACY_MASK_INDEX_FALLBACK[id];
  return fallback === undefined ? null : fallback;
}

/** Índices únicos y ordenados para una lista de region ids. */
export function resolveMaskIndicesForRegionIds(
  ids: readonly string[],
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const index = getMaskIndexForRegionId(id);
    if (index === null || seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  return out;
}

/**
 * Target público → índices de máscara vía resolvePublicTargetHighlightRegions.
 */
export function resolveMaskIndicesForPublicTarget(targetId: string): number[] {
  return resolveMaskIndicesForRegionIds(
    resolvePublicTargetHighlightRegions(targetId),
  );
}
