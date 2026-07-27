/**
 * Full Chest Geometry Distance Field V2.5 — per-vertex signed distance sidecar.
 *
 * Visual authority only. Anatomy (V2.2 frontiers + s_surface) is frozen; the
 * categorical ID mask keeps selection/routing/integrity. Nothing is committed
 * and the official mask is never rewritten.
 *
 *   node tools/body-regions/generate-full-chest-geometry-field.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData, parseGlb, readAccessor } from "../body-mask/glb.mjs";
import {
  buildBoundaries,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import { buildSurfaceSField, N_SLICES } from "./surface-s-field.mjs";
import { analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import { computeSSurface } from "./surface-s-field.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "./geometry-field-hash.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/full-chest-v25");
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const REGION_ID = "full_chest";

/** snorm16 range: ±20 mm. Distances are clamped after being measured. */
export const FIELD_RANGE_M = 0.02;
/** Safe exterior value for vertices outside the anterior torso domain. */
export const OUTSIDE_DEFAULT_M = -0.02;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

/**
 * Signed distance in meters from the frozen V2.2 frontiers.
 *
 * Frozen V2.4 analytical authority: continuous V2.2 frontiers, never a
 * distance transform over the categorical mask.
 */
export function signedDistanceMeters(x, y, z, bounds, field) {
  return analyticalSignedDistance(x, y, z, bounds, field);
}

/**
 * Smoothness guard for refinement.
 *
 * Inside the anterior arc the frozen V2.2 parameterization resolves directly
 * and the field is smooth, so subdividing there strictly improves the isoline.
 * Past the axillary endpoints only the piecewise exterior extension is
 * available; adding analytical midpoints there would fight the coarse vertices
 * instead of helping, so those triangles stay linear.
 */
export function strictlyResolved(x, y, z, field) {
  return computeSSurface(x, y, z, field) != null;
}

/** Non-chest anatomical guards used to prove the field never leaks. */
export function buildExclusionSets(mesh, lm) {
  const p = lm.points;
  const axFoldX = Math.max(
    Math.abs(p.anteriorAxillaryFoldRight[0]),
    Math.abs(p.anteriorAxillaryFoldLeft[0]),
  );
  const lateralLimit = axFoldX + 0.02;
  const backZ = -0.08;
  const neckY = Math.max(p.clavicleRight[1], p.clavicleLeft[1]) + 0.03;

  const armRight = [];
  const armLeft = [];
  const back = [];
  const neck = [];
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (x <= -lateralLimit) armRight.push(i);
    if (x >= lateralLimit) armLeft.push(i);
    if (z <= backZ) back.push(i);
    if (y >= neckY) neck.push(i);
  }
  return {
    armRight,
    armLeft,
    back,
    neck,
    thresholds: { lateralLimit, backZ, neckY },
  };
}

/**
 * Signed distance in meters for every vertex of the runtime geometry.
 * Positive inside full_chest, 0 at the frontier, negative outside.
 */
export function buildVertexField(mesh, bounds, field) {
  const values = new Float32Array(mesh.vertexCount);
  const P = mesh.positions;
  let inDomain = 0;
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const sd = signedDistanceMeters(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      bounds,
      field,
    );
    if (sd == null) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    inDomain++;
    const v = clamp(sd, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return { values, stats: { inDomain, positives } };
}

/** Force non-chest anatomy to a safe exterior value. */
export function enforceExclusions(values, sets) {
  const leaks = { armRight: 0, armLeft: 0, back: 0, neck: 0 };
  for (const key of ["armRight", "armLeft", "back", "neck"]) {
    for (const i of sets[key]) {
      if (values[i] > 0) leaks[key]++;
      if (values[i] > OUTSIDE_DEFAULT_M) values[i] = OUTSIDE_DEFAULT_M;
    }
  }
  return leaks;
}

export function countPositives(values, indices) {
  let n = 0;
  for (const i of indices) if (values[i] > 0) n++;
  return n;
}

// --- encodings -------------------------------------------------------------

export function encodeSnorm16(values, range = FIELD_RANGE_M) {
  const out = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const t = clamp(values[i] / range, -1, 1);
    out.writeInt16LE(Math.round(t * 32767), i * 2);
  }
  return out;
}

export function decodeSnorm16(buffer, count, range = FIELD_RANGE_M) {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = (buffer.readInt16LE(i * 2) / 32767) * range;
  }
  return out;
}

function floatToHalf(value) {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exponent = ((x >>> 23) & 0xff) - 112;
  let mantissa = x & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa |= 0x800000;
    const shift = 14 - exponent;
    return sign | (mantissa >> shift);
  }
  if (exponent >= 0x1f) return sign | 0x7c00;
  return sign | (exponent << 10) | (mantissa >> 13);
}

function halfToFloat(half) {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (mantissa + 1024) * 2 ** (exponent - 25);
}

export function encodeFloat16(values) {
  const out = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    out.writeUInt16LE(floatToHalf(values[i]), i * 2);
  }
  return out;
}

export function encodeFloat32(values) {
  const out = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) out.writeFloatLE(values[i], i * 4);
  return out;
}

/** Max round-trip error, restricted to the visually relevant band. */
function encodingError(values, decoded, bandMeters = 0.005) {
  let maxAll = 0;
  let maxBand = 0;
  for (let i = 0; i < values.length; i++) {
    const e = Math.abs(values[i] - decoded[i]);
    if (e > maxAll) maxAll = e;
    if (Math.abs(values[i]) <= bandMeters && e > maxBand) maxBand = e;
  }
  return { maxAll, maxBand };
}

// --- validation ------------------------------------------------------------

/**
 * Isoline of the interpolated (per-triangle linear) field vs the analytical
 * V2.2 frontier, plus triangle density audit on crossed triangles.
 */
export function validateIsoline(mesh, values, bounds, field) {
  const errors = [];
  const worst = [];
  const edgeLengths = [];
  let crossed = 0;
  let signChange = 0;
  let ambiguous = 0;
  const P = mesh.positions;
  const I = mesh.indices;

  const vertex = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];

  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    const min = Math.min(fa, fb, fc);
    const max = Math.max(fa, fb, fc);
    if (min > 0 || max < 0) continue;
    signChange++;
    if (min === max) {
      ambiguous++;
      continue;
    }
    crossed++;

    const pa = vertex(a);
    const pb = vertex(b);
    const pc = vertex(c);
    edgeLengths.push(
      Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]),
      Math.hypot(pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]),
      Math.hypot(pa[0] - pc[0], pa[1] - pc[1], pa[2] - pc[2]),
    );

    const edges = [
      [pa, fa, pb, fb],
      [pb, fb, pc, fc],
      [pc, fc, pa, fa],
    ];
    const crossings = [];
    for (const [p0, d0, p1, d1] of edges) {
      if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) continue;
      if (d0 === d1) continue;
      const k = d0 / (d0 - d1);
      if (!Number.isFinite(k) || k < 0 || k > 1) continue;
      crossings.push([
        p0[0] + (p1[0] - p0[0]) * k,
        p0[1] + (p1[1] - p0[1]) * k,
        p0[2] + (p1[2] - p0[2]) * k,
      ]);
    }
    if (crossings.length === 0) {
      ambiguous++;
      continue;
    }

    // Sample the whole interpolated segment: crossing points sit on the
    // frontier by construction, chord sag in between is the real error.
    const samples = [];
    if (crossings.length >= 2) {
      const [q0, q1] = crossings;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        samples.push([
          q0[0] + (q1[0] - q0[0]) * t,
          q0[1] + (q1[1] - q0[1]) * t,
          q0[2] + (q1[2] - q0[2]) * t,
        ]);
      }
    } else {
      samples.push(crossings[0]);
    }
    for (const q of samples) {
      const analytic = signedDistanceMeters(q[0], q[1], q[2], bounds, field);
      if (analytic == null) continue;
      errors.push(Math.abs(analytic));
      worst.push({
        err: Math.abs(analytic),
        point: [+q[0].toFixed(4), +q[1].toFixed(4), +q[2].toFixed(4)],
        tri: t,
        vertexValues: [+fa.toFixed(5), +fb.toFixed(5), +fc.toFixed(5)],
      });
    }
  }

  const summarize = (arr) => {
    if (!arr.length) return { n: 0, mean: 0, p95: 0, max: 0 };
    const sorted = [...arr].sort((x, y) => x - y);
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return {
      n: sorted.length,
      mean,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      max: sorted[sorted.length - 1],
    };
  };

  const precision = summarize(errors);
  const density = summarize(edgeLengths);
  worst.sort((a, b) => b.err - a.err);
  return {
    precision,
    density,
    worst: worst.slice(0, 5),
    triangles: { crossed, signChange, ambiguous },
    pass:
      precision.mean <= 0.001 &&
      precision.p95 <= 0.002 &&
      precision.max <= 0.004,
  };
}

// --- local boundary refinement (§14) --------------------------------------

/** Refine band: triangles crossed by distance = 0 or within 5 mm of it. */
export const REFINE_BAND_METERS = 0.005;

/**
 * One adaptive subdivision level restricted to the frontier band.
 * Midpoint positions come from barycentric interpolation (surface unchanged);
 * midpoint distances are evaluated analytically, which is what removes the
 * chord sag of the linear isoline.
 */
export function buildBoundaryRefinement(mesh, values, bounds, field) {
  const triangles = [];
  const midValues = [];
  let skippedNonSmooth = 0;
  const P = mesh.positions;
  const I = mesh.indices;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
    if (!crosses && near > REFINE_BAND_METERS) continue;

    const corners = [a, b, c];
    if (
      corners.some(
        (i) => !strictlyResolved(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], field),
      )
    ) {
      skippedNonSmooth++;
      continue;
    }

    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mids = [];
    let smooth = true;
    for (const [i, j] of pairs) {
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      if (!strictlyResolved(mx, my, mz, field)) {
        smooth = false;
        break;
      }
      const analytic = signedDistanceMeters(mx, my, mz, bounds, field);
      if (analytic == null) {
        smooth = false;
        break;
      }
      mids.push(clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M));
    }
    if (!smooth) {
      skippedNonSmooth++;
      continue;
    }
    triangles.push(t);
    midValues.push(mids[0], mids[1], mids[2]);
  }

  return { triangles, midValues, skippedNonSmooth };
}

export function encodeRefinement(refinement, range = FIELD_RANGE_M) {
  const out = Buffer.alloc(refinement.triangles.length * 10);
  for (let i = 0; i < refinement.triangles.length; i++) {
    out.writeUInt32LE(refinement.triangles[i], i * 10);
    for (let k = 0; k < 3; k++) {
      const t = clamp(refinement.midValues[i * 3 + k] / range, -1, 1);
      out.writeInt16LE(Math.round(t * 32767), i * 10 + 4 + k * 2);
    }
  }
  return out;
}

/**
 * Derived geometry with the refinement applied: original vertices are kept in
 * place (so the sidecar mapping stays valid) and three midpoint vertices are
 * appended per refined triangle. Positions/uvs/normals are barycentric, only
 * the distance values come from the analytical field.
 */
export function buildDerivedMesh(mesh, values, refinement, normals = null) {
  const extra = refinement.triangles.length * 3;
  const positions = new Float64Array((mesh.vertexCount + extra) * 3);
  positions.set(mesh.positions.subarray(0, mesh.vertexCount * 3));
  const uvs = new Float64Array((mesh.vertexCount + extra) * 2);
  uvs.set(mesh.uvs.subarray(0, mesh.vertexCount * 2));
  const derivedNormals = normals
    ? new Float64Array((mesh.vertexCount + extra) * 3)
    : null;
  if (derivedNormals) {
    derivedNormals.set(normals.subarray(0, mesh.vertexCount * 3));
  }
  const derivedValues = new Float32Array(mesh.vertexCount + extra);
  derivedValues.set(values.subarray(0, mesh.vertexCount));

  const refined = new Map();
  for (let i = 0; i < refinement.triangles.length; i++) {
    refined.set(refinement.triangles[i], i);
  }

  const indices = [];
  let next = mesh.vertexCount;
  const I = mesh.indices;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const slot = refined.get(t);
    if (slot === undefined) {
      indices.push(a, b, c);
      continue;
    }
    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mid = [];
    for (let k = 0; k < 3; k++) {
      const [i, j] = pairs[k];
      const v = next++;
      for (let axis = 0; axis < 3; axis++) {
        positions[v * 3 + axis] =
          (mesh.positions[i * 3 + axis] + mesh.positions[j * 3 + axis]) / 2;
        if (derivedNormals) {
          derivedNormals[v * 3 + axis] =
            (normals[i * 3 + axis] + normals[j * 3 + axis]) / 2;
        }
      }
      if (derivedNormals) {
        const nx = derivedNormals[v * 3];
        const ny = derivedNormals[v * 3 + 1];
        const nz = derivedNormals[v * 3 + 2];
        const len = Math.hypot(nx, ny, nz) || 1;
        derivedNormals[v * 3] = nx / len;
        derivedNormals[v * 3 + 1] = ny / len;
        derivedNormals[v * 3 + 2] = nz / len;
      }
      uvs[v * 2] = (mesh.uvs[i * 2] + mesh.uvs[j * 2]) / 2;
      uvs[v * 2 + 1] = (mesh.uvs[i * 2 + 1] + mesh.uvs[j * 2 + 1]) / 2;
      derivedValues[v] = refinement.midValues[slot * 3 + k];
      mid.push(v);
    }
    indices.push(
      a, mid[0], mid[2],
      mid[0], b, mid[1],
      mid[2], mid[1], c,
      mid[0], mid[1], mid[2],
    );
  }

  const indexArray = Uint32Array.from(indices);
  return {
    mesh: {
      positions,
      uvs,
      indices: indexArray,
      triangleCount: indexArray.length / 3,
      vertexCount: mesh.vertexCount + extra,
      hasUv: true,
      primitives: mesh.primitives,
    },
    values: derivedValues,
    normals: derivedNormals,
  };
}

/** Isoline error after applying the refinement, measured the same way. */
export function validateRefinedIsoline(mesh, values, refinement, bounds, field) {
  const derived = buildDerivedMesh(mesh, values, refinement);
  return {
    result: validateIsoline(derived.mesh, derived.values, bounds, field),
    triangleCount: derived.mesh.triangleCount,
    vertexCount: derived.mesh.vertexCount,
  };
}

// --- main ------------------------------------------------------------------

export async function generateFullChestGeometryField() {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  mkdirSync(FIELDS_DIR, { recursive: true });

  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  verifyLandmarkLaterality(lm);
  const bounds = buildBoundaries(lm);
  const mesh = loadMeshData(GLB);

  // Canonical geometry identity from the raw accessors (runtime attribute order).
  const gltf = parseGlb(GLB);
  const primitive = gltf.json.meshes[0].primitives[0];
  const posAccessor = readAccessor(gltf, primitive.attributes.POSITION);
  const idxAccessor = readAccessor(gltf, primitive.indices);
  const geometryHash = hashFloat32Canonical(posAccessor.data);
  const indexHash = hashUint32Canonical(idxAccessor.data);
  const vertexCount = posAccessor.count;
  if (vertexCount !== mesh.vertexCount) {
    throw new Error(
      `vertex order mismatch: accessor ${vertexCount} vs flattened ${mesh.vertexCount}`,
    );
  }

  console.log("Rebuild frozen V2.2 s_surface…");
  const field = buildSurfaceSField(
    mesh,
    lm,
    bounds.meta.yBot - 0.015,
    bounds.meta.yTop + 0.04,
    N_SLICES,
  );

  console.log("Per-vertex analytical distance…");
  const { values, stats } = buildVertexField(mesh, bounds, field);
  const sets = buildExclusionSets(mesh, lm);
  const leaksBefore = {
    armRight: countPositives(values, sets.armRight),
    armLeft: countPositives(values, sets.armLeft),
    back: countPositives(values, sets.back),
    neck: countPositives(values, sets.neck),
  };
  enforceExclusions(values, sets);
  const leaksAfter = {
    armRight: countPositives(values, sets.armRight),
    armLeft: countPositives(values, sets.armLeft),
    back: countPositives(values, sets.back),
    neck: countPositives(values, sets.neck),
  };

  let positives = 0;
  let negatives = 0;
  let nearBoundary = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) positives++;
    else negatives++;
    if (Math.abs(values[i]) <= 0.005) nearBoundary++;
  }

  console.log("Validate interpolated isoline…");
  const validation = validateIsoline(mesh, values, bounds, field);
  console.log("Precision", validation.precision, validation.triangles);

  console.log("Local boundary refinement…");
  const refinement = buildBoundaryRefinement(mesh, values, bounds, field);
  const refinedCheck = validateRefinedIsoline(
    mesh,
    values,
    refinement,
    bounds,
    field,
  );
  const refineCount = refinement.triangles.length;
  const derivedTriangles = mesh.triangleCount + 3 * refineCount;
  const derivedVertices = vertexCount + 3 * refineCount;
  const triangleIncrease = (3 * refineCount) / mesh.triangleCount;
  console.log(
    "Refined",
    refineCount,
    "tris (+" + (triangleIncrease * 100).toFixed(2) + "%)",
    refinedCheck.result.precision,
  );
  const refineBuffer = encodeRefinement(refinement);
  const refineFile = "neutro_body_v1_full_chest_refine.bin";
  writeFileSync(path.join(FIELDS_DIR, refineFile), refineBuffer);
  writeFileSync(path.join(OUT, refineFile), refineBuffer);
  const refineHash = createHash("sha256")
    .update(refineBuffer)
    .digest("hex")
    .slice(0, 16);

  // Encodings
  const bufF32 = encodeFloat32(values);
  const bufF16 = encodeFloat16(values);
  const bufS16 = encodeSnorm16(values);
  const decF32 = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) decF32[i] = bufF32.readFloatLE(i * 4);
  const decF16 = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    decF16[i] = halfToFloat(bufF16.readUInt16LE(i * 2));
  }
  const decS16 = decodeSnorm16(bufS16, values.length);

  const errF32 = encodingError(values, decF32);
  const errF16 = encodingError(values, decF16);
  const errS16 = encodingError(values, decS16);

  const snorm16Ok = errS16.maxBand <= 0.0005;
  const encoding = snorm16Ok ? "snorm16" : "float32";
  const payload = snorm16Ok ? bufS16 : bufF32;

  writeFileSync(path.join(OUT, "field-float32.bin"), bufF32);
  writeFileSync(path.join(OUT, "field-float16.bin"), bufF16);
  writeFileSync(path.join(OUT, "field-snorm16.bin"), bufS16);

  const fieldFile = "neutro_body_v1_full_chest_sdf.bin";
  const sidecarPath = path.join(FIELDS_DIR, fieldFile);
  writeFileSync(sidecarPath, payload);
  writeFileSync(path.join(OUT, fieldFile), payload);
  const fieldHash = createHash("sha256")
    .update(payload)
    .digest("hex")
    .slice(0, 16);

  const fieldUrl = `/models/interaction/fields/${fieldFile}`;
  const manifest = {
    model: "neutro_body_v1",
    version: "2.5",
    geometryHash,
    indexHash,
    vertexCount,
    indexCount: idxAccessor.count,
    fields: [
      {
        regionId: REGION_ID,
        surfaceRegionId: "full_chest_surface",
        maskIndex: 9,
        geometryHash,
        indexHash,
        vertexCount,
        fieldUrl,
        fieldHash,
        encoding,
        distanceRangeMeters: FIELD_RANGE_M,
        refinement: {
          url: `/models/interaction/fields/${refineFile}`,
          hash: refineHash,
          triangleCount: refineCount,
          bandMeters: REFINE_BAND_METERS,
          encoding: "u32-snorm16x3",
        },
      },
    ],
  };
  const manifestFile = "neutro_body_v1_region_fields.json";
  writeFileSync(
    path.join(FIELDS_DIR, manifestFile),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT, manifestFile),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const sidecarBytes = statSync(sidecarPath).size;
  const report = {
    version: "2.5",
    frozenFrom: "v2.2",
    regionId: REGION_ID,
    geometry: {
      geometryHash,
      indexHash,
      vertexCount,
      indexCount: idxAccessor.count,
      triangleCount: mesh.triangleCount,
    },
    fieldStats: {
      inDomain: stats.inDomain,
      positives,
      negatives,
      nearBoundary,
      outsideDefaultMeters: OUTSIDE_DEFAULT_M,
    },
    exclusions: {
      thresholds: sets.thresholds,
      counts: {
        armRight: sets.armRight.length,
        armLeft: sets.armLeft.length,
        back: sets.back.length,
        neck: sets.neck.length,
      },
      positivesBeforeEnforcement: leaksBefore,
      positivesAfterEnforcement: leaksAfter,
    },
    validation,
    refinement: {
      bandMeters: REFINE_BAND_METERS,
      subdivisionLevels: 1,
      refinedTriangles: refineCount,
      derivedTriangles,
      derivedVertices,
      triangleIncreasePct: triangleIncrease * 100,
      withinBudget: triangleIncrease < 0.15,
      bytes: refineBuffer.length,
      hash: refineHash,
      precision: refinedCheck.result.precision,
      density: refinedCheck.result.density,
      worst: refinedCheck.result.worst,
      triangles: refinedCheck.result.triangles,
      pass: refinedCheck.result.pass,
    },
    encodings: {
      float32: { bytes: bufF32.length, ...errF32 },
      float16: { bytes: bufF16.length, ...errF16 },
      snorm16: { bytes: bufS16.length, ...errS16 },
      chosen: encoding,
      reason: snorm16Ok
        ? "snorm16 boundary error <= 0.5 mm at ±20 mm range; smallest payload"
        : "snorm16 exceeded 0.5 mm boundary error; kept float32",
    },
    sidecar: {
      path: `public/models/interaction/fields/${fieldFile}`,
      bytes: sidecarBytes,
      url: `${fieldUrl}?v=${fieldHash}`,
      fieldHash,
    },
    officialMaskOverwritten: false,
    glbModified: false,
    elapsedMs: Date.now() - t0,
  };
  writeFileSync(
    path.join(OUT, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log("V25_OK", OUT);
  console.log("GEOMETRY_HASH", geometryHash);
  console.log("FIELD_HASH", fieldHash);
  console.log("ENCODING", encoding, sidecarBytes, "bytes");
  console.log("ISOLINE_PASS", validation.pass);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-geometry-field.mjs")) {
  generateFullChestGeometryField().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
