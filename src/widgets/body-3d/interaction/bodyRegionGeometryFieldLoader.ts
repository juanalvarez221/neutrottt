/**
 * Loader for per-vertex region distance fields.
 * Any failure degrades to the categorical highlight; it never breaks selection.
 */
import {
  BODY_REGION_GEOMETRY_FIELDS_MANIFEST_URL,
  buildRegionGeometryFieldSrc,
  decodeRegionFieldRefinement,
  decodeRegionGeometryField,
  expectedSidecarBytes,
  findRegionGeometryFieldEntry,
  validateGeometryIdentity,
  type GeometryIdentity,
  type RegionFieldRefinement,
  type RegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";

export type RegionGeometryFieldResult =
  | {
      status: "ok";
      values: Float32Array;
      refinement: RegionFieldRefinement | null;
      entry: RegionGeometryFieldEntry;
    }
  | { status: "unavailable" }
  | { status: "mismatch"; reason: string }
  | { status: "error"; reason: string };

type LoaderStats = {
  manifestFetches: number;
  fieldFetches: number;
  cacheHits: number;
};

const fieldCache = new Map<string, Float32Array>();
const refinementCache = new Map<string, RegionFieldRefinement>();
let manifestPromise: Promise<RegionGeometryFieldManifest> | null = null;
const stats: LoaderStats = {
  manifestFetches: 0,
  fieldFetches: 0,
  cacheHits: 0,
};

export function getRegionGeometryFieldStats(): Readonly<LoaderStats> {
  return { ...stats };
}

export function clearRegionGeometryFieldCache() {
  fieldCache.clear();
  refinementCache.clear();
  manifestPromise = null;
  stats.manifestFetches = 0;
  stats.fieldFetches = 0;
  stats.cacheHits = 0;
}

async function loadManifest(): Promise<RegionGeometryFieldManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      stats.manifestFetches += 1;
      const response = await fetch(BODY_REGION_GEOMETRY_FIELDS_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`manifest ${response.status}`);
      }
      return (await response.json()) as RegionGeometryFieldManifest;
    })().catch((error) => {
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

/**
 * Resolve the signed distance field (meters per vertex) for a region.
 * Cached by fieldHash so repeated selections do not re-download.
 */
export async function loadRegionGeometryField(
  regionId: string,
  geometry: GeometryIdentity,
): Promise<RegionGeometryFieldResult> {
  let manifest: RegionGeometryFieldManifest;
  try {
    manifest = await loadManifest();
  } catch (error) {
    return { status: "error", reason: `manifest: ${String(error)}` };
  }

  const entry = findRegionGeometryFieldEntry(manifest, regionId);
  if (!entry) return { status: "unavailable" };

  const validation = validateGeometryIdentity(entry, geometry);
  if (!validation.ok) return { status: "mismatch", reason: validation.reason };

  const cached = fieldCache.get(entry.fieldHash);
  if (cached) {
    stats.cacheHits += 1;
    return {
      status: "ok",
      values: cached,
      refinement: await loadRefinement(entry),
      entry,
    };
  }

  try {
    stats.fieldFetches += 1;
    const response = await fetch(
      buildRegionGeometryFieldSrc(entry.fieldUrl, entry.fieldHash),
    );
    if (!response.ok) {
      return { status: "error", reason: `sidecar ${response.status}` };
    }
    const buffer = await response.arrayBuffer();
    const expected = expectedSidecarBytes(entry);
    if (buffer.byteLength < expected) {
      return {
        status: "error",
        reason: `sidecar truncated ${buffer.byteLength} < ${expected}`,
      };
    }
    const values = decodeRegionGeometryField(buffer, entry);
    fieldCache.set(entry.fieldHash, values);
    return {
      status: "ok",
      values,
      refinement: await loadRefinement(entry),
      entry,
    };
  } catch (error) {
    return { status: "error", reason: `sidecar: ${String(error)}` };
  }
}

/** Optional companion sidecar; a failure only costs frontier sharpness. */
async function loadRefinement(
  entry: RegionGeometryFieldEntry,
): Promise<RegionFieldRefinement | null> {
  const source = entry.refinement;
  if (!source) return null;
  const cached = refinementCache.get(source.hash);
  if (cached) {
    stats.cacheHits += 1;
    return cached;
  }
  try {
    stats.fieldFetches += 1;
    const response = await fetch(
      buildRegionGeometryFieldSrc(source.url, source.hash),
    );
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const refinement = decodeRegionFieldRefinement(
      buffer,
      entry.distanceRangeMeters,
    );
    refinementCache.set(source.hash, refinement);
    return refinement;
  } catch {
    return null;
  }
}
