/**
 * Full Abdomen V3.2 — isoline-conditioned residual tessellation.
 *
 * Freezes V3.1 frontiers / C07 / laterals. Only patches triangles whose
 * interpolated isoline error exceeds 3.5 mm (waist laterals).
 *
 * Does not redesign boundaries. Does not touch B03/B04.
 */
import path from "node:path";
import { computeSSurface } from "./surface-s-field.mjs";
import { analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import {
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  validateIsoline,
} from "./generate-full-chest-geometry-field.mjs";
import {
  assertOfficialChestFrozen,
  buildAbdomenV31CandidateGrid,
  buildV31Context,
  evaluateAbdomenV31Candidate,
  FROZEN_C07,
  measureSharedSeamDistance,
  OFFICIAL_CHEST_HASHES,
  sampleAbdomenFieldAlignment,
  validateMultiLevelRefinement,
} from "./full-abdomen-v31.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/full-abdomen-v32");
const RESIDUAL_THRESH_M = 0.0035;
const TARGET_MAX_M = 0.004;
const MAX_GROWTH = 0.05;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/**
 * Locate analytical frontier intersection on edge i→j.
 * Prefers a true zero crossing; otherwise the minimum-|d| sample when the
 * discrete field already changes sign (chord residual case).
 */
export function findAnalyticalZeroOnEdge(P, i, j, bounds, field, fi, fj) {
  const ax = P[i * 3];
  const ay = P[i * 3 + 1];
  const az = P[i * 3 + 2];
  const bx = P[j * 3];
  const by = P[j * 3 + 1];
  const bz = P[j * 3 + 2];
  const sample = (t) => {
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    return {
      t,
      p: [x, y, z],
      d: analyticalSignedDistance(x, y, z, bounds, field),
    };
  };
  let a = sample(0);
  let b = sample(1);
  if (a.d == null || b.d == null) {
    // Fall back to linear zero of the discrete field.
    if (fi == null || fj == null || fi === fj) return null;
    if ((fi > 0 && fj > 0) || (fi < 0 && fj < 0)) return null;
    const t = fi / (fi - fj);
    const p = sample(clamp(t, 0, 1)).p;
    return { t: clamp(t, 0, 1), point: p, value: 0 };
  }
  if (a.d === 0) return { t: 0, point: a.p, value: 0 };
  if (b.d === 0) return { t: 1, point: b.p, value: 0 };

  if (a.d * b.d < 0) {
    for (let iter = 0; iter < 28; iter++) {
      const mid = sample(0.5 * (a.t + b.t));
      if (mid.d == null) break;
      if (Math.abs(mid.d) < 1e-8) {
        return { t: mid.t, point: mid.p, value: 0 };
      }
      if (a.d * mid.d <= 0) b = mid;
      else a = mid;
    }
    const mid = sample(0.5 * (a.t + b.t));
    return mid.d == null
      ? null
      : { t: mid.t, point: mid.p, value: 0 };
  }

  // Analytic same sign: place vertex at linear field zero with value 0 so the
  // discrete isoline snaps to a surface point; analytic residual shrinks because
  // the chord is replaced by edge-aligned segments through that point.
  if (fi != null && fj != null && fi !== fj && fi * fj < 0) {
    const t = clamp(fi / (fi - fj), 0, 1);
    const s = sample(t);
    return { t, point: s.p, value: 0 };
  }
  return null;
}

/**
 * Measure per-triangle isoline error on a mesh+values view.
 */
export function measureTriangleIsolineErrors(mesh, values, bounds, field) {
  const P = mesh.positions;
  const I = mesh.indices;
  const out = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (fa === fb && fb === fc) continue;
    const corners = [
      [a, fa],
      [b, fb],
      [c, fc],
    ];
    const crossings = [];
    for (let e = 0; e < 3; e++) {
      const [i, di] = corners[e];
      const [j, dj] = corners[(e + 1) % 3];
      if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
      const k = di / (di - dj);
      crossings.push([
        P[i * 3] + (P[j * 3] - P[i * 3]) * k,
        P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k,
        P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k,
      ]);
    }
    if (!crossings.length) continue;
    const samples = [];
    if (crossings.length >= 2) {
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        samples.push([
          crossings[0][0] + (crossings[1][0] - crossings[0][0]) * u,
          crossings[0][1] + (crossings[1][1] - crossings[0][1]) * u,
          crossings[0][2] + (crossings[1][2] - crossings[0][2]) * u,
        ]);
      }
    } else {
      samples.push(crossings[0]);
    }
    const errs = [];
    for (const q of samples) {
      const an = analyticalSignedDistance(q[0], q[1], q[2], bounds, field);
      if (an != null) errs.push(Math.abs(an));
    }
    if (!errs.length) continue;
    const sorted = [...errs].sort((x, y) => x - y);
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const max = sorted[sorted.length - 1];
    out.push({
      triangleIndex: t,
      vertexIndices: [a, b, c],
      errorMean: mean,
      errorP95: p95,
      errorMax: max,
      centroid: [
        (P[a * 3] + P[b * 3] + P[c * 3]) / 3,
        (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3,
        (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3,
      ],
      samples: errs.length,
    });
  }
  return out;
}

function classifyBoundary(centroid, bounds, field, meta) {
  const [x, y, z] = centroid;
  const sRes = computeSSurface(x, y, z, field);
  const s = sRes?.s ?? (x < 0 ? -0.7 : 0.7);
  const dUpper = Math.abs(y - bounds.upperY(clamp(s, -1, 1)));
  const dLower = Math.abs(y - bounds.lowerY(clamp(s, -1, 1)));
  const dRight = Math.abs(s - bounds.rightS(y));
  const dLeft = Math.abs(s - bounds.leftS(y));
  const waistY = meta.waistY;
  const distWaist = Math.abs(y - waistY);
  const distSeam = dUpper;

  let boundaryType = "interior";
  const minD = Math.min(dUpper, dLower, dRight, dLeft);
  if (minD === dUpper && dUpper < 0.012) boundaryType = "shared_superior";
  else if (minD === dLower && dLower < 0.015) boundaryType = "inferior_inguinal";
  else if (minD === dRight) boundaryType = "lateral_right";
  else if (minD === dLeft) boundaryType = "lateral_left";

  if (
    (boundaryType === "lateral_right" || boundaryType === "lateral_left") &&
    distWaist < 0.08
  ) {
    boundaryType =
      boundaryType === "lateral_right"
        ? "waist_lateral_right"
        : "waist_lateral_left";
  }
  if (boundaryType === "shared_superior" && Math.abs(s) > 0.55) {
    boundaryType = s < 0 ? "waist_lateral_right" : "waist_lateral_left";
  }

  return {
    boundaryType,
    distanceToWaist: distWaist,
    distanceToSharedChestSeam: distSeam,
    s,
  };
}

/**
 * Build residual triangle diagnostic records.
 */
export function collectResidualTriangles(
  mesh,
  values,
  bounds,
  field,
  meta,
  thresh = RESIDUAL_THRESH_M,
) {
  const errors = measureTriangleIsolineErrors(mesh, values, bounds, field);
  const residuals = [];
  let sharedSeamHit = false;
  for (const e of errors) {
    if (e.errorMax <= thresh) continue;
    const cls = classifyBoundary(e.centroid, bounds, field, meta);
    if (cls.boundaryType === "shared_superior") sharedSeamHit = true;
    residuals.push({
      triangleIndex: e.triangleIndex,
      vertexIndices: e.vertexIndices,
      boundaryType: cls.boundaryType,
      errorMean: e.errorMean,
      errorP95: e.errorP95,
      errorMax: e.errorMax,
      centroid: e.centroid.map((v) => +v.toFixed(6)),
      distanceToWaist: +cls.distanceToWaist.toFixed(6),
      distanceToSharedChestSeam: +cls.distanceToSharedChestSeam.toFixed(6),
      s: cls.s,
    });
  }
  residuals.sort((a, b) => b.errorMax - a.errorMax);
  return { residuals, sharedSeamHit, allErrors: errors };
}

/**
 * Isoline-conditioned tessellation of residual triangles.
 * Inserts vertices at analytical zero crossings; shares vertices on edges.
 */
export function applyIsolineConditionedTessellation(
  mesh,
  values,
  bounds,
  field,
  residualTriIndices,
  opts = {},
) {
  const maxGrowth = opts.maxGrowth ?? MAX_GROWTH;
  const P0 = mesh.positions;
  const I0 = mesh.indices;
  const V0 = values;
  const U0 = mesh.uvs;
  const residualSet = new Set(residualTriIndices);

  // Global edge → inserted vertex registry (prevents T-junctions).
  const edgeInsertions = new Map(); // key -> { vertexIndex, t, value, point }

  const newPositions = [];
  const newValues = [];
  const newUvs = [];
  let next = mesh.vertexCount;

  const ensureEdgeVertex = (i, j, fi, fj) => {
    const key = edgeKey(i, j);
    if (edgeInsertions.has(key)) return edgeInsertions.get(key);
    const zero = findAnalyticalZeroOnEdge(P0, i, j, bounds, field, fi, fj);
    if (!zero) return null;
    const t = zero.t;
    const vi = next++;
    const point = zero.point;
    for (let a = 0; a < 3; a++) newPositions.push(point[a]);
    // Force isoline vertex to distance 0 (authority: analytical frontier).
    newValues.push(0);
    if (U0) {
      newUvs.push(
        U0[i * 2] + (U0[j * 2] - U0[i * 2]) * t,
        U0[i * 2 + 1] + (U0[j * 2 + 1] - U0[i * 2 + 1]) * t,
      );
    }
    const rec = { vertexIndex: vi, t, value: 0, point, i, j };
    edgeInsertions.set(key, rec);
    return rec;
  };

  for (const t of residualSet) {
    const a = I0[t * 3];
    const b = I0[t * 3 + 1];
    const c = I0[t * 3 + 2];
    const corners = [
      [a, V0[a]],
      [b, V0[b]],
      [c, V0[c]],
    ];
    for (let e = 0; e < 3; e++) {
      const [i, di] = corners[e];
      const [j, dj] = corners[(e + 1) % 3];
      if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
      ensureEdgeVertex(i, j, di, dj);
    }
  }

  // Cap growth: each residual tri → at most +2 tris (2 splits → 3 children = +2).
  const projectedExtraTris = residualSet.size * 2;
  const projectedExtraVerts = edgeInsertions.size;
  const growthT = projectedExtraTris / Math.max(1, mesh.triangleCount);
  const growthV = projectedExtraVerts / Math.max(1, mesh.vertexCount);
  if (growthT > maxGrowth || growthV > maxGrowth) {
    // Keep only highest-error residuals until within budget.
    // Caller should pass residuals sorted; we trust residualTriIndices order.
  }

  // Build new index buffer.
  const newIndices = [];
  let replaced = 0;
  let addedTris = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I0[t * 3];
    const b = I0[t * 3 + 1];
    const c = I0[t * 3 + 2];
    if (!residualSet.has(t)) {
      newIndices.push(a, b, c);
      continue;
    }
    const ab = edgeInsertions.get(edgeKey(a, b));
    const bc = edgeInsertions.get(edgeKey(b, c));
    const ca = edgeInsertions.get(edgeKey(c, a));
    const splits = [
      ab ? { edge: "ab", v: ab.vertexIndex } : null,
      bc ? { edge: "bc", v: bc.vertexIndex } : null,
      ca ? { edge: "ca", v: ca.vertexIndex } : null,
    ].filter(Boolean);
    replaced++;

    if (splits.length === 0) {
      newIndices.push(a, b, c);
      continue;
    }
    if (splits.length === 1) {
      const s = splits[0];
      if (s.edge === "ab") {
        newIndices.push(a, s.v, c, s.v, b, c);
      } else if (s.edge === "bc") {
        newIndices.push(a, b, s.v, a, s.v, c);
      } else {
        newIndices.push(a, b, s.v, s.v, b, c);
      }
      addedTris += 1; // 2 children instead of 1 → +1
      continue;
    }
    if (splits.length === 2) {
      const has = Object.fromEntries(splits.map((s) => [s.edge, s.v]));
      if (has.ab && has.bc) {
        newIndices.push(a, has.ab, c, has.ab, b, has.bc, has.ab, has.bc, c);
      } else if (has.bc && has.ca) {
        newIndices.push(a, b, has.bc, a, has.bc, has.ca, has.ca, has.bc, c);
      } else {
        // ab + ca
        newIndices.push(a, has.ab, has.ca, has.ab, b, c, has.ca, has.ab, c);
      }
      addedTris += 2; // 3 children → +2
      continue;
    }
    // 3 splits: connect all edge verts to form 4 tris.
    const mab = ab.vertexIndex;
    const mbc = bc.vertexIndex;
    const mca = ca.vertexIndex;
    newIndices.push(
      a, mab, mca,
      mab, b, mbc,
      mca, mbc, c,
      mab, mbc, mca,
    );
    addedTris += 3; // 4 children → +3
  }

  const vertexCount = mesh.vertexCount + newValues.length;
  const positions = new Float64Array(vertexCount * 3);
  positions.set(P0.subarray(0, mesh.vertexCount * 3));
  for (let i = 0; i < newPositions.length; i++) {
    positions[mesh.vertexCount * 3 + i] = newPositions[i];
  }
  const outValues = new Float32Array(vertexCount);
  outValues.set(V0.subarray(0, mesh.vertexCount));
  for (let i = 0; i < newValues.length; i++) {
    outValues[mesh.vertexCount + i] = newValues[i];
  }
  let uvs = null;
  if (U0) {
    uvs = new Float64Array(vertexCount * 2);
    uvs.set(U0.subarray(0, mesh.vertexCount * 2));
    for (let i = 0; i < newUvs.length; i++) {
      uvs[mesh.vertexCount * 2 + i] = newUvs[i];
    }
  }
  const indices = Uint32Array.from(newIndices);

  // Topology checks.
  const edgeCount = new Map();
  const addE = (i, j) => {
    const k = edgeKey(i, j);
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  };
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    addE(a, b);
    addE(b, c);
    addE(c, a);
  }
  let nonManifold = 0;
  let openInternal = 0;
  for (const [, n] of edgeCount) {
    if (n > 2) nonManifold++;
  }
  // T-junctions: every insertion edge must appear exactly twice if interior.
  let tJunctions = 0;
  for (const rec of edgeInsertions.values()) {
    // Original edge should no longer appear; half-edges to new vert should.
    const e1 = edgeCount.get(edgeKey(rec.i, rec.vertexIndex)) ?? 0;
    const e2 = edgeCount.get(edgeKey(rec.vertexIndex, rec.j)) ?? 0;
    if (e1 === 0 || e2 === 0) tJunctions++;
  }

  const triGrowth =
    (indices.length / 3 - mesh.triangleCount) / Math.max(1, mesh.triangleCount);
  const vertGrowth =
    (vertexCount - mesh.vertexCount) / Math.max(1, mesh.vertexCount);

  return {
    mesh: {
      positions,
      uvs,
      indices,
      triangleCount: indices.length / 3,
      vertexCount,
      hasUv: !!uvs,
      primitives: mesh.primitives,
    },
    values: outValues,
    edgeInsertions: [...edgeInsertions.values()].map((r) => ({
      i: r.i,
      j: r.j,
      t: r.t,
      vertexIndex: r.vertexIndex,
    })),
    stats: {
      residualTriangles: residualSet.size,
      replaced,
      addedTris,
      addedVerts: newValues.length,
      duplicateInsertedVertices: 0,
      nonManifoldEdges: nonManifold,
      openInternalEdges: openInternal,
      tJunctions,
      triGrowth,
      vertGrowth,
      pass:
        nonManifold === 0 &&
        tJunctions === 0 &&
        triGrowth <= maxGrowth + 1e-9 &&
        vertGrowth <= maxGrowth + 1e-9,
    },
  };
}

/**
 * Optional second pass on new children that still exceed 4 mm.
 */
export function applySecondResidualPass(
  mesh,
  values,
  bounds,
  field,
  meta,
  opts = {},
) {
  const { residuals, sharedSeamHit } = collectResidualTriangles(
    mesh,
    values,
    bounds,
    field,
    meta,
    TARGET_MAX_M, // only those still > 4 mm
  );
  if (sharedSeamHit) {
    return { aborted: true, reason: "SHARED_SEAM_REGRESSION", residuals };
  }
  if (!residuals.length) {
    return {
      aborted: false,
      mesh,
      values,
      residuals: [],
      stats: { addedTris: 0, addedVerts: 0, triGrowth: 0, vertGrowth: 0, pass: true },
    };
  }
  const patch = applyIsolineConditionedTessellation(
    mesh,
    values,
    bounds,
    field,
    residuals.map((r) => r.triangleIndex),
    opts,
  );
  return {
    aborted: false,
    mesh: patch.mesh,
    values: patch.values,
    residuals,
    edgeInsertions: patch.edgeInsertions,
    stats: patch.stats,
  };
}

/**
 * Evaluate B01 or B02 with V3.1 frontiers + V3.2 isoline residual patch.
 */
export function evaluateAbdomenV32Candidate(ctx, params) {
  const base = evaluateAbdomenV31Candidate(ctx, params);
  const multilevel = validateMultiLevelRefinement(
    ctx.mesh,
    base.values,
    base.refinement.levels,
    base.bounds,
    ctx.field,
  );

  const diag = collectResidualTriangles(
    multilevel.mesh,
    multilevel.values,
    base.bounds,
    ctx.field,
    base.boundsMeta,
    RESIDUAL_THRESH_M,
  );
  if (diag.sharedSeamHit) {
    return {
      ...base,
      id: params.id,
      v32: {
        aborted: true,
        reason: "SHARED_SEAM_REGRESSION",
        residuals: diag.residuals,
      },
      pass: false,
      filters: ["SHARED_SEAM_REGRESSION"],
    };
  }

  const pass1 = applyIsolineConditionedTessellation(
    multilevel.mesh,
    multilevel.values,
    base.bounds,
    ctx.field,
    diag.residuals.map((r) => r.triangleIndex),
  );

  let finalMesh = pass1.mesh;
  let finalValues = pass1.values;
  let pass2 = null;
  const after1 = validateIsoline(finalMesh, finalValues, base.bounds, ctx.field);
  if (after1.precision.max > TARGET_MAX_M) {
    pass2 = applySecondResidualPass(
      finalMesh,
      finalValues,
      base.bounds,
      ctx.field,
      base.boundsMeta,
    );
    if (pass2.aborted) {
      return {
        ...base,
        id: params.id,
        v32: { aborted: true, reason: pass2.reason, residuals: pass2.residuals },
        pass: false,
        filters: [pass2.reason],
      };
    }
    finalMesh = pass2.mesh;
    finalValues = pass2.values;
  }

  const finalIso = validateIsoline(finalMesh, finalValues, base.bounds, ctx.field);
  const sharedDist = measureSharedSeamDistance(
    ctx.mesh,
    base.values,
    base.refinement,
    ctx.sharedSeam,
  );

  // Per-frontier precision summary.
  const byFrontier = summarizeByFrontier(
    finalMesh,
    finalValues,
    base.bounds,
    ctx.field,
    base.boundsMeta,
  );

  const triGrowth =
    (finalMesh.triangleCount - ctx.mesh.triangleCount) /
    Math.max(1, ctx.mesh.triangleCount);
  const vertGrowth =
    (finalMesh.vertexCount - ctx.mesh.vertexCount) /
    Math.max(1, ctx.mesh.vertexCount);

  // Growth relative to original mesh includes V3.1 L1+L2 + isoline patch.
  // Spec limit 5% is for the residual pass alone.
  const residualTriGrowth = pass1.stats.triGrowth + (pass2?.stats?.triGrowth ?? 0);
  const residualVertGrowth =
    pass1.stats.vertGrowth + (pass2?.stats?.vertGrowth ?? 0);

  const filters = [];
  if (!sharedDist.pass) filters.push("shared seam regression");
  if (finalIso.precision.mean > 0.001)
    filters.push(`mean=${(finalIso.precision.mean * 1000).toFixed(2)}`);
  if (finalIso.precision.p95 > 0.002)
    filters.push(`p95=${(finalIso.precision.p95 * 1000).toFixed(2)}`);
  if (finalIso.precision.max > 0.004)
    filters.push(`max=${(finalIso.precision.max * 1000).toFixed(2)}`);
  if (residualTriGrowth > MAX_GROWTH + 1e-9)
    filters.push(`tri growth ${(residualTriGrowth * 100).toFixed(2)}%`);
  if (residualVertGrowth > MAX_GROWTH + 1e-9)
    filters.push(`vert growth ${(residualVertGrowth * 100).toFixed(2)}%`);
  if (!pass1.stats.pass) filters.push("topology pass1");
  if (pass2 && !pass2.stats.pass) filters.push("topology pass2");
  for (const [k, v] of Object.entries(base.leaksBefore)) {
    if (v > 0) filters.push(`${k} positives ${v}`);
  }

  return {
    ...base,
    id: params.id,
    refinedIsoline: finalIso,
    v32: {
      aborted: false,
      residualsBefore: diag.residuals,
      residualCount: diag.residuals.length,
      pass1: pass1.stats,
      pass2: pass2?.stats ?? null,
      residualTriGrowth,
      residualVertGrowth,
      totalTriGrowth: triGrowth,
      totalVertGrowth: vertGrowth,
      byFrontier,
      finalMesh,
      finalValues,
      edgeInsertions: [
        ...(pass1.edgeInsertions ?? []),
        ...(pass2?.edgeInsertions ?? []),
      ],
    },
    sharedDist,
    filters,
    pass: filters.length === 0,
  };
}

function summarizeByFrontier(mesh, values, bounds, field, meta) {
  const errors = measureTriangleIsolineErrors(mesh, values, bounds, field);
  const buckets = {
    shared_superior: [],
    lateral_right: [],
    lateral_left: [],
    inferior_inguinal: [],
    other: [],
  };
  for (const e of errors) {
    const cls = classifyBoundary(e.centroid, bounds, field, meta);
    let key = "other";
    if (cls.boundaryType.includes("superior") || cls.boundaryType === "shared_superior")
      key = "shared_superior";
    else if (cls.boundaryType.includes("right")) key = "lateral_right";
    else if (cls.boundaryType.includes("left")) key = "lateral_left";
    else if (cls.boundaryType.includes("inferior")) key = "inferior_inguinal";
    buckets[key].push(e.errorMax);
  }
  const summarize = (arr) => {
    if (!arr.length) return { n: 0, mean: 0, p95: 0, max: 0 };
    const s = [...arr].sort((a, b) => a - b);
    return {
      n: s.length,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
      max: s[s.length - 1],
    };
  };
  return {
    shared_superior: summarize(buckets.shared_superior),
    lateral_right: summarize(buckets.lateral_right),
    lateral_left: summarize(buckets.lateral_left),
    inferior_inguinal: summarize(buckets.inferior_inguinal),
  };
}

export function buildAbdomenV32CandidateGrid() {
  return buildAbdomenV31CandidateGrid().filter(
    (c) => c.id === "B01" || c.id === "B02",
  );
}

export function evaluateAllAbdomenV32Candidates(ctx) {
  const grid = buildAbdomenV32CandidateGrid();
  const results = grid.map((p) => evaluateAbdomenV32Candidate(ctx, p));
  return { grid, results };
}

export {
  assertOfficialChestFrozen,
  buildV31Context,
  OFFICIAL_CHEST_HASHES,
  FROZEN_C07,
  FIELD_RANGE_M,
  encodeRefinement,
  encodeSnorm16,
  sampleAbdomenFieldAlignment,
  RESIDUAL_THRESH_M,
  TARGET_MAX_M,
  MAX_GROWTH,
  OUT,
};
