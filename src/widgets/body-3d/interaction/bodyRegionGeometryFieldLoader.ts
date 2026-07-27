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

/** Micro-stage timings for a single loadRegionGeometryField call (ms). */
export type RegionGeometryFieldLoadStages = {
  manifestMs: number;
  lookupMs: number;
  validateMs: number;
  fieldFetchMs: number;
  decodeMs: number;
  refineFetchMs: number;
  refineDecodeMs: number;
  cacheHit: boolean;
};

export type RegionGeometryFieldResult =
  | {
      status: "ok";
      values: Float32Array;
      refinement: RegionFieldRefinement | null;
      entry: RegionGeometryFieldEntry;
      stages: RegionGeometryFieldLoadStages;
    }
  | { status: "unavailable"; stages?: RegionGeometryFieldLoadStages }
  | {
      status: "mismatch";
      reason: string;
      stages?: RegionGeometryFieldLoadStages;
    }
  | { status: "error"; reason: string; stages?: RegionGeometryFieldLoadStages };

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

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function emptyStages(
  partial: Partial<RegionGeometryFieldLoadStages> = {},
): RegionGeometryFieldLoadStages {
  return {
    manifestMs: 0,
    lookupMs: 0,
    validateMs: 0,
    fieldFetchMs: 0,
    decodeMs: 0,
    refineFetchMs: 0,
    refineDecodeMs: 0,
    cacheHit: false,
    ...partial,
  };
}

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

/**
 * Composite cache key for field + geometry identity (memoized validation reuse).
 */
export function regionFieldCacheKey(
  entry: RegionGeometryFieldEntry,
): string {
  return [
    entry.geometryHash,
    entry.indexHash,
    entry.fieldHash,
    entry.refinement?.hash ?? "",
  ].join(":");
}

async function loadManifest(): Promise<{
  manifest: RegionGeometryFieldManifest;
  ms: number;
}> {
  const t0 = nowMs();
  if (!manifestPromise) {
    manifestPromise = (async () => {
      stats.manifestFetches += 1;
      if (typeof performance !== "undefined") {
        performance.mark("neutro-field-manifest-start");
      }
      const response = await fetch(BODY_REGION_GEOMETRY_FIELDS_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`manifest ${response.status}`);
      }
      const json = (await response.json()) as RegionGeometryFieldManifest;
      if (typeof performance !== "undefined") {
        performance.mark("neutro-field-manifest-end");
        try {
          performance.measure(
            "neutro-field-manifest",
            "neutro-field-manifest-start",
            "neutro-field-manifest-end",
          );
        } catch {
          /* ignore */
        }
      }
      return json;
    })().catch((error) => {
      manifestPromise = null;
      throw error;
    });
  }
  const manifest = await manifestPromise;
  return { manifest, ms: nowMs() - t0 };
}

type RefineLoad = {
  refinement: RegionFieldRefinement | null;
  fetchMs: number;
  decodeMs: number;
};

/** Optional companion sidecar; a failure only costs frontier sharpness. */
async function loadRefinement(
  entry: RegionGeometryFieldEntry,
): Promise<RefineLoad> {
  const source = entry.refinement;
  if (!source) {
    return { refinement: null, fetchMs: 0, decodeMs: 0 };
  }
  const cached = refinementCache.get(source.hash);
  if (cached) {
    stats.cacheHits += 1;
    return { refinement: cached, fetchMs: 0, decodeMs: 0 };
  }
  const tFetch = nowMs();
  try {
    stats.fieldFetches += 1;
    const response = await fetch(
      buildRegionGeometryFieldSrc(source.url, source.hash),
    );
    const fetchMs = nowMs() - tFetch;
    if (!response.ok) return { refinement: null, fetchMs, decodeMs: 0 };
    const buffer = await response.arrayBuffer();
    const tDecode = nowMs();
    const refinement = decodeRegionFieldRefinement(
      buffer,
      entry.distanceRangeMeters,
      source.encoding ?? "u32-snorm16x3",
    );
    refinementCache.set(source.hash, refinement);
    return { refinement, fetchMs, decodeMs: nowMs() - tDecode };
  } catch {
    return { refinement: null, fetchMs: nowMs() - tFetch, decodeMs: 0 };
  }
}

/**
 * Resolve the signed distance field (meters per vertex) for a region.
 * Cached by fieldHash so repeated selections do not re-download/decode.
 */
export async function loadRegionGeometryField(
  regionId: string,
  geometry: GeometryIdentity,
): Promise<RegionGeometryFieldResult> {
  let manifest: RegionGeometryFieldManifest;
  let manifestMs = 0;
  try {
    const loaded = await loadManifest();
    manifest = loaded.manifest;
    manifestMs = loaded.ms;
  } catch (error) {
    return {
      status: "error",
      reason: `manifest: ${String(error)}`,
      stages: emptyStages({ manifestMs }),
    };
  }

  const tLookup = nowMs();
  const entry = findRegionGeometryFieldEntry(manifest, regionId);
  const lookupMs = nowMs() - tLookup;
  if (!entry) {
    return {
      status: "unavailable",
      stages: emptyStages({ manifestMs, lookupMs }),
    };
  }

  const tValidate = nowMs();
  if (typeof performance !== "undefined") {
    performance.mark("neutro-field-validate-start");
  }
  const validation = validateGeometryIdentity(entry, geometry);
  const validateMs = nowMs() - tValidate;
  if (typeof performance !== "undefined") {
    performance.mark("neutro-field-validate-end");
    try {
      performance.measure(
        "neutro-field-validate",
        "neutro-field-validate-start",
        "neutro-field-validate-end",
      );
    } catch {
      /* ignore */
    }
  }
  if (!validation.ok) {
    return {
      status: "mismatch",
      reason: validation.reason,
      stages: emptyStages({ manifestMs, lookupMs, validateMs }),
    };
  }

  const cached = fieldCache.get(entry.fieldHash);
  if (cached) {
    stats.cacheHits += 1;
    const refine = await loadRefinement(entry);
    return {
      status: "ok",
      values: cached,
      refinement: refine.refinement,
      entry,
      stages: emptyStages({
        manifestMs,
        lookupMs,
        validateMs,
        refineFetchMs: refine.fetchMs,
        refineDecodeMs: refine.decodeMs,
        cacheHit: true,
      }),
    };
  }

  try {
    stats.fieldFetches += 1;
    const tFetch = nowMs();
    if (typeof performance !== "undefined") {
      performance.mark("neutro-field-fetch-start");
    }
    const response = await fetch(
      buildRegionGeometryFieldSrc(entry.fieldUrl, entry.fieldHash),
    );
    const fieldFetchMs = nowMs() - tFetch;
    if (typeof performance !== "undefined") {
      performance.mark("neutro-field-fetch-end");
      try {
        performance.measure(
          "neutro-field-fetch",
          "neutro-field-fetch-start",
          "neutro-field-fetch-end",
        );
      } catch {
        /* ignore */
      }
    }
    if (!response.ok) {
      return {
        status: "error",
        reason: `sidecar ${response.status}`,
        stages: emptyStages({
          manifestMs,
          lookupMs,
          validateMs,
          fieldFetchMs,
        }),
      };
    }
    const buffer = await response.arrayBuffer();
    const expected = expectedSidecarBytes(entry);
    if (buffer.byteLength < expected) {
      return {
        status: "error",
        reason: `sidecar truncated ${buffer.byteLength} < ${expected}`,
        stages: emptyStages({
          manifestMs,
          lookupMs,
          validateMs,
          fieldFetchMs,
        }),
      };
    }
    const tDecode = nowMs();
    if (typeof performance !== "undefined") {
      performance.mark("neutro-field-decode-start");
    }
    const values = decodeRegionGeometryField(buffer, entry);
    const decodeMs = nowMs() - tDecode;
    if (typeof performance !== "undefined") {
      performance.mark("neutro-field-decode-end");
      try {
        performance.measure(
          "neutro-field-decode",
          "neutro-field-decode-start",
          "neutro-field-decode-end",
        );
      } catch {
        /* ignore */
      }
    }
    fieldCache.set(entry.fieldHash, values);
    const refine = await loadRefinement(entry);
    return {
      status: "ok",
      values,
      refinement: refine.refinement,
      entry,
      stages: emptyStages({
        manifestMs,
        lookupMs,
        validateMs,
        fieldFetchMs,
        decodeMs,
        refineFetchMs: refine.fetchMs,
        refineDecodeMs: refine.decodeMs,
        cacheHit: false,
      }),
    };
  } catch (error) {
    return {
      status: "error",
      reason: `sidecar: ${String(error)}`,
      stages: emptyStages({ manifestMs, lookupMs, validateMs }),
    };
  }
}

const NECK_PREFETCH_IDS = [
  "neck_front",
  "neck_right",
  "neck_back",
  "neck_left",
  "full_neck",
] as const;

/**
 * Idle prefetch of official neck geometry fields after the model is ready.
 * Warm hover/reselect should then hit the micro-cache (&lt;16 ms).
 */
export function prefetchNeckRegionGeometryFields(
  identity: GeometryIdentity,
): void {
  const run = () => {
    for (const id of NECK_PREFETCH_IDS) {
      void loadRegionGeometryField(id, identity).catch(() => {
        /* categorical fallback remains available */
      });
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}

