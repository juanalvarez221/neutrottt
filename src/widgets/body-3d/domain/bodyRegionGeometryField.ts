/**
 * Per-vertex region distance fields (visual authority only).
 *
 * The categorical ID mask remains the authority for selection, routing and
 * persistence. These sidecars only drive the anti-aliased highlight edge.
 */
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "@/widgets/body-3d/domain/bodyRegionGeometryFieldHash";

export const BODY_REGION_GEOMETRY_FIELDS_MANIFEST_URL =
  "/models/interaction/fields/neutro_body_v1_region_fields.json";

export type RegionGeometryFieldEncoding = "float32" | "float16" | "snorm16";

/**
 * One adaptive subdivision level restricted to the frontier band. Midpoint
 * distances are analytical, which is what removes the chord sag of a linear
 * isoline on coarse triangles.
 */
export type RegionFieldRefinementSource = {
  url: string;
  hash: string;
  triangleCount: number;
  bandMeters: number;
  encoding: "u32-snorm16x3";
};

export type RegionFieldRefinement = {
  triangles: Uint32Array;
  midValues: Float32Array;
};

export type RegionGeometryFieldEntry = {
  regionId: string;
  surfaceRegionId?: string;
  /** Public visual alias (e.g. full_abdomen_surface). */
  visualRegionId?: string;
  maskIndex?: number;
  geometryHash: string;
  indexHash: string;
  vertexCount: number;
  fieldUrl: string;
  fieldHash: string;
  encoding: RegionGeometryFieldEncoding;
  distanceRangeMeters: number;
  refinement?: RegionFieldRefinementSource;
  /** Promoted anatomical candidate (e.g. C07 / B01). Diagnostics only. */
  candidateId?: string;
  anatomicalParameters?:
    | {
        infraclavicularOffsetMm: number;
        upperCenterRiseMm: number;
        inferiorCenterTransitionMm: number;
        lateralInsetMm: number;
      }
    | {
        pubicClearance: number;
        inguinalSideRise: number;
      };
  /** Shared isoline neighbour (e.g. full_chest for abdomen). */
  sharedBoundary?: string;
};

export type RegionGeometryFieldManifest = {
  model: string;
  version: string;
  geometryHash: string;
  indexHash: string;
  vertexCount: number;
  indexCount: number;
  fields: readonly RegionGeometryFieldEntry[];
};

/** Minimal geometry view so the checks stay testable without three.js. */
export type GeometryIdentity = {
  positions: ArrayLike<number>;
  indices: ArrayLike<number> | null;
  vertexCount: number;
};

export const GEOMETRY_FIELD_MISMATCH = "GEOMETRY_FIELD_MISMATCH";

/** Content-versioned sidecar URL; a new fieldHash must change the string. */
export function buildRegionGeometryFieldSrc(
  fieldUrl: string,
  fieldHash: string,
): string {
  const base = fieldUrl.split("?")[0] ?? fieldUrl;
  return `${base}?v=${fieldHash}`;
}

export function findRegionGeometryFieldEntry(
  manifest: RegionGeometryFieldManifest,
  regionId: string,
): RegionGeometryFieldEntry | null {
  for (const entry of manifest.fields) {
    if (
      entry.regionId === regionId ||
      entry.surfaceRegionId === regionId ||
      entry.visualRegionId === regionId
    ) {
      return entry;
    }
  }
  return null;
}

export type GeometryFieldValidation =
  | { ok: true }
  | { ok: false; reason: string };

/** Hashing the whole geometry costs ~50 ms, so keep it per attribute buffer. */
const hashCache = new WeakMap<object, string>();

function cachedHash(
  values: ArrayLike<number>,
  compute: (values: ArrayLike<number>) => string,
): string {
  const key = values as unknown as object;
  const cached = hashCache.get(key);
  if (cached) return cached;
  const hash = compute(values);
  hashCache.set(key, hash);
  return hash;
}

/**
 * Vertex order guard. Any mismatch must fall back to the categorical path
 * instead of silently reordering vertices.
 */
export function validateGeometryIdentity(
  entry: RegionGeometryFieldEntry,
  geometry: GeometryIdentity,
): GeometryFieldValidation {
  if (geometry.vertexCount !== entry.vertexCount) {
    return {
      ok: false,
      reason: `${GEOMETRY_FIELD_MISMATCH}: vertexCount ${geometry.vertexCount} != ${entry.vertexCount}`,
    };
  }
  if (geometry.positions.length !== entry.vertexCount * 3) {
    return {
      ok: false,
      reason: `${GEOMETRY_FIELD_MISMATCH}: position length ${geometry.positions.length}`,
    };
  }
  const geometryHash = cachedHash(geometry.positions, hashFloat32Canonical);
  if (geometryHash !== entry.geometryHash) {
    return {
      ok: false,
      reason: `${GEOMETRY_FIELD_MISMATCH}: geometryHash ${geometryHash} != ${entry.geometryHash}`,
    };
  }
  if (geometry.indices) {
    const indexHash = cachedHash(geometry.indices, hashUint32Canonical);
    if (indexHash !== entry.indexHash) {
      return {
        ok: false,
        reason: `${GEOMETRY_FIELD_MISMATCH}: indexHash ${indexHash} != ${entry.indexHash}`,
      };
    }
  }
  return { ok: true };
}

function halfToFloat(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (mantissa + 1024) * 2 ** (exponent - 25);
}

/** Decode a sidecar payload into signed meters per vertex. */
export function decodeRegionGeometryField(
  buffer: ArrayBuffer,
  entry: RegionGeometryFieldEntry,
): Float32Array {
  const view = new DataView(buffer);
  const out = new Float32Array(entry.vertexCount);
  const range = entry.distanceRangeMeters;

  if (entry.encoding === "float32") {
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
  }
  if (entry.encoding === "float16") {
    for (let i = 0; i < out.length; i++) {
      out[i] = halfToFloat(view.getUint16(i * 2, true));
    }
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = (view.getInt16(i * 2, true) / 32767) * range;
  }
  return out;
}

/** Records of 4-byte triangle index + three snorm16 midpoint distances. */
export const REFINEMENT_RECORD_BYTES = 10;

export function decodeRegionFieldRefinement(
  buffer: ArrayBuffer,
  rangeMeters: number,
): RegionFieldRefinement {
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / REFINEMENT_RECORD_BYTES);
  const triangles = new Uint32Array(count);
  const midValues = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const base = i * REFINEMENT_RECORD_BYTES;
    triangles[i] = view.getUint32(base, true);
    for (let k = 0; k < 3; k++) {
      midValues[i * 3 + k] =
        (view.getInt16(base + 4 + k * 2, true) / 32767) * rangeMeters;
    }
  }
  return { triangles, midValues };
}

export function expectedSidecarBytes(entry: RegionGeometryFieldEntry): number {
  return entry.encoding === "float32"
    ? entry.vertexCount * 4
    : entry.vertexCount * 2;
}
