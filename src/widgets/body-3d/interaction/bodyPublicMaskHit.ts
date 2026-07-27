/**
 * Client-side categorical mask sampler.
 * Interaction-model UVs share the production atlas — sample R8 index → public target.
 */
"use client";

import {
  BODY_PUBLIC_REGION_MASK_MANIFEST,
  BODY_PUBLIC_REGION_MASK_SRC,
  getMaskIndexForRegionId,
} from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import { getPrimaryPublicSelectionTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { isPublicSelectableBodyTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  BODY_PUBLIC_SELECTION_CATALOG,
  type PublicBodySelectionTargetId,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";

type MaskRaster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

let rasterPromise: Promise<MaskRaster | null> | null = null;

function loadMaskRaster(): Promise<MaskRaster | null> {
  if (!rasterPromise) {
    rasterPromise = (async () => {
      try {
        const response = await fetch(BODY_PUBLIC_REGION_MASK_SRC);
        if (!response.ok) return null;
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();
        return {
          width: image.width,
          height: image.height,
          data: image.data,
        };
      } catch {
        return null;
      }
    })();
  }
  return rasterPromise;
}

/** Warm the mask decode so the first click is not cold. */
export function prefetchPublicRegionMaskRaster() {
  void loadMaskRaster();
}

/** Nearest-filter sample matching the runtime mask shader (floor, flipY). */
export function sampleMaskIndexAtUv(
  raster: MaskRaster,
  u: number,
  v: number,
): number {
  const px = Math.min(
    raster.width - 1,
    Math.max(0, Math.floor(u * raster.width)),
  );
  const py = Math.min(
    raster.height - 1,
    Math.max(0, Math.floor((1 - v) * raster.height)),
  );
  return raster.data[(py * raster.width + px) * 4] ?? 0;
}

const MASK_INDEX_TO_SURFACE: ReadonlyMap<number, string> = (() => {
  const map = new Map<number, string>();
  for (const [id, entry] of Object.entries(
    BODY_PUBLIC_REGION_MASK_MANIFEST.regions,
  )) {
    if (!map.has(entry.maskIndex)) map.set(entry.maskIndex, id);
  }
  return map;
})();

/** Prefer catalog public targets whose highlight region owns this mask index. */
const MASK_INDEX_TO_PUBLIC: ReadonlyMap<number, PublicBodySelectionTargetId> =
  (() => {
    const map = new Map<number, PublicBodySelectionTargetId>();
    for (const entry of BODY_PUBLIC_SELECTION_CATALOG) {
      if (!isPublicSelectableBodyTarget(entry.id)) continue;
      const regions = resolvePublicTargetHighlightRegions(entry.id);
      for (const regionId of regions) {
        const index = getMaskIndexForRegionId(regionId);
        if (index == null || map.has(index)) continue;
        map.set(index, entry.id as PublicBodySelectionTargetId);
      }
    }
    return map;
  })();

/**
 * Canonical routing atomic for a public target so existing option sheets keep working.
 */
const PUBLIC_TO_CANONICAL_ATOMIC: Readonly<Record<string, string>> = {
  full_chest: "sternum",
  full_abdomen: "upper_abdomen",
  left_ribs: "left_ribs",
  right_ribs: "right_ribs",
  upper_back_large: "upper_back_center",
  lower_back_large: "mid_back_center",
};

export function getPublicTargetForMaskIndex(
  maskIndex: number,
): PublicBodySelectionTargetId | null {
  if (maskIndex <= 0) return null;
  return MASK_INDEX_TO_PUBLIC.get(maskIndex) ?? null;
}

export function getSurfaceRegionIdForMaskIndex(
  maskIndex: number,
): string | null {
  if (maskIndex <= 0) return null;
  return MASK_INDEX_TO_SURFACE.get(maskIndex) ?? null;
}

export function canonicalAtomicForPublicTarget(
  publicTargetId: string,
): string | null {
  return PUBLIC_TO_CANONICAL_ATOMIC[publicTargetId] ?? null;
}

export type MaskResolvedHit = {
  maskIndex: number;
  surfaceRegionId: string | null;
  publicTargetId: PublicBodySelectionTargetId | null;
  /** Atomic to feed the existing premium option sheet. */
  effectiveAtomicId: string | null;
};

/**
 * Resolve public selection from interaction-mesh UV via the categorical mask.
 * Falls back to atomic routing when the mask is unavailable or empty.
 */
export async function resolvePublicHitFromUv(
  uv: { x: number; y: number } | null | undefined,
  atomicId: string | null,
): Promise<MaskResolvedHit> {
  const atomicPublic = atomicId
    ? getPrimaryPublicSelectionTarget(atomicId)
    : null;
  const fallback: MaskResolvedHit = {
    maskIndex: 0,
    surfaceRegionId: null,
    publicTargetId: atomicPublic,
    effectiveAtomicId: atomicId,
  };
  if (!uv) return fallback;

  const raster = await loadMaskRaster();
  if (!raster) return fallback;

  const maskIndex = sampleMaskIndexAtUv(raster, uv.x, uv.y);
  if (maskIndex <= 0) {
    // Unpainted atlas texel — categorical mask says non-selectable here.
    // Do not let oversized interaction meshes reclaim abdomen/chest.
    return {
      maskIndex: 0,
      surfaceRegionId: null,
      publicTargetId: null,
      effectiveAtomicId: atomicId,
    };
  }

  const publicTargetId = getPublicTargetForMaskIndex(maskIndex);
  if (!publicTargetId) {
    return {
      maskIndex,
      surfaceRegionId: getSurfaceRegionIdForMaskIndex(maskIndex),
      publicTargetId: atomicPublic,
      effectiveAtomicId: atomicId,
    };
  }

  const canonical = canonicalAtomicForPublicTarget(publicTargetId);
  return {
    maskIndex,
    surfaceRegionId: getSurfaceRegionIdForMaskIndex(maskIndex),
    publicTargetId,
    effectiveAtomicId: canonical ?? atomicId,
  };
}
