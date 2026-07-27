/**
 * Public region visual assets (SDF overlays) — independent of categorical mask.
 */
import visualAssetsManifest from "@/widgets/body-3d/domain/generated/publicRegionVisualAssets.json";

export type PublicRegionVisualAsset = {
  regionId: string;
  surfaceRegionId?: string;
  maskIndex: number;
  sdfUrl?: string;
  sdfHash?: string;
  sdfRangeMeters?: number;
  sdfEncoding?: string;
  sdfZero?: number;
};

export type PublicRegionVisualAssetsManifest = {
  version: string;
  assets: readonly PublicRegionVisualAsset[];
};

export const BODY_PUBLIC_REGION_VISUAL_ASSETS_MANIFEST =
  visualAssetsManifest as PublicRegionVisualAssetsManifest;

const BY_REGION = new Map(
  BODY_PUBLIC_REGION_VISUAL_ASSETS_MANIFEST.assets.map((a) => [a.regionId, a]),
);
const BY_SURFACE = new Map(
  BODY_PUBLIC_REGION_VISUAL_ASSETS_MANIFEST.assets
    .filter((a) => a.surfaceRegionId)
    .map((a) => [a.surfaceRegionId!, a]),
);

export function getPublicRegionVisualAsset(
  regionId: string,
): PublicRegionVisualAsset | null {
  return BY_REGION.get(regionId) ?? BY_SURFACE.get(regionId) ?? null;
}

/** Versioned SDF URL; hash change must change the string. */
export function buildPublicRegionSdfSrc(
  sdfUrl: string,
  sdfHash: string,
): string {
  const base = sdfUrl.split("?")[0] ?? sdfUrl;
  return `${base}?v=${sdfHash}`;
}

export function getPublicRegionSdfSrc(regionId: string): string | null {
  const asset = getPublicRegionVisualAsset(regionId);
  if (!asset?.sdfUrl || !asset.sdfHash || asset.sdfHash === "pending") {
    return null;
  }
  return buildPublicRegionSdfSrc(asset.sdfUrl, asset.sdfHash);
}

export function regionIdsWithSdf(
  ids: readonly string[],
): PublicRegionVisualAsset | null {
  for (const id of ids) {
    const asset = getPublicRegionVisualAsset(id);
    if (asset?.sdfUrl && asset.sdfHash) return asset;
  }
  return null;
}
