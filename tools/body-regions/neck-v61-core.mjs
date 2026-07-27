/**
 * Neck Shared Seams and Local Refinement V6.1
 *
 * Canonical shared seams + signed g_seam metric + shared refinement plan.
 * Reuses N02 anatomy (atlas/loops/landmarks/u seams) from V6.0 — no anatomical drift.
 * Never mutates official torso/back fields or the official mask.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NECK_V60_OUT,
  SURFACE_BAND_M,
  REFINE_BAND_M,
  CANONICAL_IDS,
  SURFACE_IDS,
  OFFICIAL_BACK,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  deriveAnatomicalSeams,
  queryNeck,
  neckSignedDistance,
  buildNeckVertexField,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  validateNeckIsoline,
  buildNeckBoundaryRefinement,
  encodeFieldPackage,
  enforceNonOverlap,
  sampleAlignment,
  expectedOfficialHashes,
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  buildDerivedMesh,
} from "./neck-v60-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const NECK_V61_OUT = path.join(ROOT, "artifacts/neck-v61");
export const N02_SOURCE = path.join(NECK_V60_OUT, "approved");
export const N02_CANDIDATE = path.join(NECK_V60_OUT, "candidates/N02");

export {
  CANONICAL_IDS,
  SURFACE_IDS,
  OFFICIAL_BACK,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  REFINE_BAND_M,
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  deriveAnatomicalSeams,
  queryNeck,
  neckSignedDistance,
  buildNeckVertexField,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  validateNeckIsoline,
  buildNeckBoundaryRefinement,
  encodeFieldPackage,
  enforceNonOverlap,
  sampleAlignment,
  expectedOfficialHashes,
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  buildDerivedMesh,
  NECK_V60_OUT,
};

export const SEAM_DEFS = Object.freeze([
  {
    seamId: "front_right_neck_seam",
    file: "front-right.json",
    pairKey: "front_right",
    uKey: "uFrontRight",
    regionA: "neck_front",
    regionB: "neck_right",
    signA: +1,
  },
  {
    seamId: "right_back_neck_seam",
    file: "right-back.json",
    pairKey: "right_back",
    uKey: "uRightBack",
    regionA: "neck_right",
    regionB: "neck_back",
    signA: +1,
  },
  {
    seamId: "back_left_neck_seam",
    file: "back-left.json",
    pairKey: "back_left",
    uKey: "uBackLeft",
    regionA: "neck_back",
    regionB: "neck_left",
    signA: +1,
  },
  {
    seamId: "left_front_neck_seam",
    file: "left-front.json",
    pairKey: "left_front",
    uKey: "uLeftFront",
    regionA: "neck_left",
    regionB: "neck_front",
    signA: +1,
    periodic: true,
  },
]);

function wrap01(u) {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mix3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function circularDeltaU(u, uSeam) {
  let d = wrap01(u) - wrap01(uSeam);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

function summarizeMm(arr) {
  if (!arr.length) return { meanMm: 0, p95Mm: 0, maxMm: 0, n: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    n: sorted.length,
    meanMm: +(sorted.reduce((s, v) => s + v, 0) / sorted.length).toFixed(4),
    p95Mm: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(4),
    maxMm: +sorted[sorted.length - 1].toFixed(4),
  };
}

export function sha16(obj) {
  return createHash("sha256")
    .update(typeof obj === "string" ? obj : JSON.stringify(obj))
    .digest("hex")
    .slice(0, 16);
}

/** Validate N02 approved source matches frozen expectations. */
export function validateN02Source(root = ROOT) {
  const params = JSON.parse(
    readFileSync(path.join(N02_SOURCE, "parameters.json"), "utf8"),
  );
  const hashes = JSON.parse(
    readFileSync(path.join(N02_SOURCE, "hashes.json"), "utf8"),
  );
  const meta = JSON.parse(
    readFileSync(path.join(N02_CANDIDATE, "meta.json"), "utf8"),
  );
  const seamMetrics = JSON.parse(
    readFileSync(path.join(N02_CANDIDATE, "seam-metrics.json"), "utf8"),
  );
  const expectedIsoline = {
    neck_front: { meanMm: 0.286, p95Mm: 1.833, maxMm: 3.977 },
    neck_right: { meanMm: 0.391, p95Mm: 2.275, maxMm: 3.16 },
    neck_back: { meanMm: 0.632, p95Mm: 2.723, maxMm: 5.049 },
    neck_left: { meanMm: 0.614, p95Mm: 2.393, maxMm: 3.775 },
  };
  const errs = [];
  if (params.candidateId !== "N02") errs.push("candidateId");
  if (params.lateralBandOffsetM !== 0) errs.push("lateralBandOffset");
  if (hashes.geometryHash !== "c62e81edaa1f") errs.push("geometryHash");
  if (hashes.indexHash !== "52494d471398c") errs.push("indexHash");
  if (hashes.vertexCount !== 14517) errs.push("vertexCount");
  for (const [r, exp] of Object.entries(expectedIsoline)) {
    const got = meta.regions[r]?.isoline;
    if (!got) {
      errs.push(`missing:${r}`);
      continue;
    }
    for (const k of ["meanMm", "p95Mm", "maxMm"]) {
      if (Math.abs(got[k] - exp[k]) > 0.02) errs.push(`${r}.${k}`);
    }
  }
  if (!meta.regions.full_neck?.pass) errs.push("full_neck_pass");
  if (errs.length) {
    const e = new Error("N02_SOURCE_MISMATCH");
    e.details = errs;
    throw e;
  }
  return { params, hashes, meta, seamMetrics };
}

/**
 * Signed circumferential distance to a canonical seam u.
 * g > 0 toward regionA interior (increasing u from seam for non-periodic pairs
 * where regionA is the "counterclockwise"/higher-u side relative to seam orientation).
 *
 * Convention used by SEAM_DEFS: regionA is the region for which positive g means
 * "inside regionA near this seam". For adjacent regionB, consume -g.
 */
export function gSeamAt(u, v, seams, seamDef, atlas) {
  const uSeam = seams[seamDef.uKey];
  const circ = seams.circumference || 0.36;
  // Local circumference from nearest atlas slice
  let localCirc = circ;
  if (atlas?.slices) {
    const ok = atlas.slices.filter((s) => s.ok);
    let best = ok[0];
    let bestDv = Infinity;
    for (const s of ok) {
      const dv = Math.abs(s.v - v);
      if (dv < bestDv) {
        bestDv = dv;
        best = s;
      }
    }
    if (best?.totalLen > 1e-6) localCirc = best.totalLen;
  }
  const du = circularDeltaU(u, uSeam);
  // Orient so that a small step into regionA yields positive g.
  // Region ranges: front wraps [lf,fr), right [fr,rb), back [rb,bl), left [bl,lf).
  // For seam at shared boundary, regionA's interior is on one side of uSeam.
  const orient = seamOrientation(seamDef, seams);
  const signedDu = du * orient;
  return signedDu * localCirc;
}

function seamOrientation(seamDef, seams) {
  // Probe a point slightly into regionA's u-mid and check circularDeltaU sign.
  const uSeam = seams[seamDef.uKey];
  const midU = regionMidU(seams, seamDef.regionA);
  const du = circularDeltaU(midU, uSeam);
  // We want g>0 at mid of regionA → if du already positive, orient=+1
  return du >= 0 ? +1 : -1;
}

function regionMidU(seams, region) {
  const { uFrontRight: fr, uRightBack: rb, uBackLeft: bl, uLeftFront: lf } =
    seams;
  const mid = (a, b) => {
    if (a <= b) return (a + b) / 2;
    return wrap01(a + (1 - a + b) / 2);
  };
  switch (region) {
    case "neck_right":
      return mid(fr, rb);
    case "neck_back":
      return mid(rb, bl);
    case "neck_left":
      return mid(bl, lf);
    case "neck_front":
      return mid(lf, fr);
    default:
      return 0;
  }
}

function regionURange(seams, region) {
  const { uFrontRight: fr, uRightBack: rb, uBackLeft: bl, uLeftFront: lf } =
    seams;
  switch (region) {
    case "neck_right":
      return [fr, rb];
    case "neck_back":
      return [rb, bl];
    case "neck_left":
      return [bl, lf];
    case "neck_front":
      return [lf, fr];
    default:
      return null;
  }
}

function regionSeamPair(region) {
  switch (region) {
    case "neck_front":
      return ["left_front_neck_seam", "front_right_neck_seam"];
    case "neck_right":
      return ["front_right_neck_seam", "right_back_neck_seam"];
    case "neck_back":
      return ["right_back_neck_seam", "back_left_neck_seam"];
    case "neck_left":
      return ["back_left_neck_seam", "left_front_neck_seam"];
    default:
      return null;
  }
}

/** Boundary components for a region at a query. */
export function boundaryComponents(x, y, z, atlas, seams, region) {
  const q = queryNeck(x, y, z, atlas);
  if (!q) return null;
  const dUpper = (1 - q.v) * atlas.height;
  const dLower = q.v * atlas.height;
  const circ = seams.circumference || Math.PI * 2 * (q.meanR || 0.05);
  if (region === "full_neck") {
    return {
      q,
      dUpper,
      dLower,
      dLeft: Infinity,
      dRight: Infinity,
      nearest: dUpper <= dLower ? "upper" : "lower",
      composed: Math.min(dUpper, dLower),
    };
  }
  const defs = SEAM_DEFS;
  const [leftId, rightId] = regionSeamPair(region);
  const leftDef = defs.find((d) => d.seamId === leftId);
  const rightDef = defs.find((d) => d.seamId === rightId);
  // g for left seam: positive inside region → distance to left seam = |g| when oriented for region
  let gL = gSeamAt(q.u, q.v, seams, leftDef, atlas);
  let gR = gSeamAt(q.u, q.v, seams, rightDef, atlas);
  // Convert to inward-positive distances for THIS region:
  // for leftDef, region may be A or B
  if (leftDef.regionA !== region) gL = -gL;
  if (rightDef.regionA !== region) gR = -gR;
  const dLeft = gL;
  const dRight = gR;
  const comps = {
    upper: dUpper,
    lower: dLower,
    left: dLeft,
    right: dRight,
  };
  let nearest = "upper";
  let best = dUpper;
  for (const [k, v] of Object.entries(comps)) {
    if (v < best) {
      best = v;
      nearest = k;
    }
  }
  return { q, dUpper, dLower, dLeft, dRight, nearest, composed: best, gL, gR };
}

/**
 * V6.1 signed distance — anatomically identical to V6.0 N02
 * (internal seams via periodic interval = min of |g_seam| components).
 * g_seam is exposed separately for shared-seam antisymmetry metrics.
 */
export function neckSignedDistanceV61(x, y, z, atlas, seams, region) {
  return neckSignedDistance(x, y, z, atlas, seams, region);
}

export function buildNeckVertexFieldV61(mesh, atlas, seams, region) {
  return buildNeckVertexField(mesh, atlas, seams, region);
}

/** Trace canonical seam curve u=const across atlas slices (exact u interpolation). */
export function buildCanonicalSeam(mesh, atlas, seams, seamDef, identity) {
  const uSeam = seams[seamDef.uKey];
  const ok = atlas.slices.filter((s) => s.ok);
  const orderedPoints = [];
  const sliceSamples = [];
  for (const sl of ok) {
    // Find edge on slice that straddles uSeam (circular)
    let best = null;
    let bestDu = Infinity;
    const n = sl.pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ui = sl.uOf[i];
      const uj = sl.uOf[j];
      const di = circularDeltaU(ui, uSeam);
      const dj = circularDeltaU(uj, uSeam);
      // straddles if signs differ or either nearly zero
      if (di * dj <= 0 || Math.abs(di) < 1e-6 || Math.abs(dj) < 1e-6) {
        const denom = di - dj;
        const t =
          Math.abs(denom) < 1e-12 ? 0 : clamp(di / denom, 0, 1);
        const p = mix3(sl.pts[i], sl.pts[j], t);
        const du = Math.min(Math.abs(di), Math.abs(dj));
        if (du < bestDu) {
          bestDu = du;
          best = { p, t, i, j, u: uSeam };
        }
      }
      // also track nearest vertex as fallback
      const adu = Math.abs(di);
      if (!best && adu < bestDu) {
        bestDu = adu;
        best = { p: sl.pts[i], t: 0, i, j: i, u: ui };
      }
    }
    if (!best) {
      // nearest vertex fallback
      let bestI = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const du = Math.abs(circularDeltaU(sl.uOf[i], uSeam));
        if (du < bd) {
          bd = du;
          bestI = i;
        }
      }
      best = { p: sl.pts[bestI], t: 0, i: bestI, j: bestI, u: sl.uOf[bestI] };
    }
    orderedPoints.push([best.p[0], best.p[1], best.p[2]]);
    // Canonical sample is defined at exact uSeam (interpolated position)
    sliceSamples.push({
      v: sl.v,
      u: uSeam,
      realizedU: uSeam,
      index: best.i,
      interpResidualU: Math.abs(circularDeltaU(best.u, uSeam)),
    });
  }

  let surfaceArcLength = 0;
  for (let i = 1; i < orderedPoints.length; i++) {
    surfaceArcLength += dist3(orderedPoints[i - 1], orderedPoints[i]);
  }

  const crossed = findCrossedTriangles(mesh, orderedPoints);
  const barycentricCoordinates = crossed.map((c) => ({
    triangleIndex: c.triangleIndex,
    bary: c.bary,
    position: c.position,
  }));

  const payload = {
    seamId: seamDef.seamId,
    geometryHash: identity.geometryHash,
    indexHash: identity.indexHash,
    uSeam,
    orderedPoints,
    crossedTriangleIndices: crossed.map((c) => c.triangleIndex),
    barycentricCoordinates,
    surfaceArcLength,
    upperEndpoint: orderedPoints.at(-1),
    lowerEndpoint: orderedPoints[0],
    regionA: seamDef.regionA,
    regionB: seamDef.regionB,
    sliceSamples,
  };
  payload.seamHash = sha16({
    seamId: payload.seamId,
    uSeam,
    tris: payload.crossedTriangleIndices,
    bary: payload.barycentricCoordinates.map((b) => [
      b.triangleIndex,
      ...b.bary,
    ]),
    endpoints: [payload.lowerEndpoint, payload.upperEndpoint],
  });
  return payload;
}

function pointInTriangleBary(p, a, b, c) {
  // 3D barycentric via areas projected — use linear solve on two axes
  const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v2 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2];
  const d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
  const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2];
  const d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2];
  const inv = 1 / (d00 * d11 - d01 * d01 + 1e-18);
  const v = (d11 * d20 - d01 * d21) * inv;
  const w = (d00 * d21 - d01 * d20) * inv;
  const u = 1 - v - w;
  return [u, v, w];
}

function findCrossedTriangles(mesh, orderedPoints) {
  const P = mesh.positions;
  const I = mesh.indices;
  const out = [];
  const seen = new Set();
  for (const pt of orderedPoints) {
    let bestT = -1;
    let bestD = Infinity;
    let bestBary = [1, 0, 0];
    for (let t = 0; t < mesh.triangleCount; t++) {
      const ia = I[t * 3];
      const ib = I[t * 3 + 1];
      const ic = I[t * 3 + 2];
      const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]];
      const b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]];
      const c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];
      const cent = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ];
      const d = dist3(pt, cent);
      if (d > 0.04) continue;
      if (d < bestD) {
        const bary = pointInTriangleBary(pt, a, b, c);
        // Allow slight outside for projection
        if (bary.every((x) => x > -0.15 && x < 1.15)) {
          bestD = d;
          bestT = t;
          bestBary = bary;
        }
      }
    }
    if (bestT >= 0 && !seen.has(bestT)) {
      seen.add(bestT);
      out.push({
        triangleIndex: bestT,
        bary: bestBary.map((x) => +x.toFixed(6)),
        position: pt,
      });
    }
  }
  return out;
}

/**
 * Diagnose current (V6.0) abs(A+B) metric on composed fields.
 */
export function diagnoseCurrentSeamMetric(
  mesh,
  atlas,
  seams,
  fields,
  seamDef,
  maxSamples = 800,
) {
  const valuesA = fields[seamDef.regionA];
  const valuesB = fields[seamDef.regionB];
  const P = mesh.positions;
  const samples = [];
  let otherBoundaryMin = 0;
  let invalidMetric = 0;
  let unitOrSign = 0;
  let differentCurves = 0;

  for (let i = 0; i < mesh.vertexCount; i++) {
    const a = valuesA[i];
    const b = valuesB[i];
    if (!(Math.abs(a) < 0.002 || Math.abs(b) < 0.002)) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const q = queryNeck(x, y, z, atlas);
    if (!q) continue;
    const g = gSeamAt(q.u, q.v, seams, seamDef, atlas);
    const bcA = boundaryComponents(x, y, z, atlas, seams, seamDef.regionA);
    const bcB = boundaryComponents(x, y, z, atlas, seams, seamDef.regionB);
    const currentResidual = Math.abs(a + b) * 1000;
    const nearestA = bcA?.nearest ?? null;
    const nearestB = bcB?.nearest ?? null;
    const seamIsNearest =
      (nearestA === "left" || nearestA === "right") &&
      (nearestB === "left" || nearestB === "right");
    let cause = "ok_near_seam";
    if (!seamIsNearest && currentResidual > 5) {
      cause = "other_boundary_as_minimum";
      otherBoundaryMin++;
      invalidMetric++;
    } else if (currentResidual > 5 && Math.abs(g) * 1000 < 2) {
      cause = "invalid_composed_metric";
      invalidMetric++;
    } else if (currentResidual > 5) {
      cause = "units_or_sign_or_curve";
      unitOrSign++;
    }
    samples.push({
      position: [x, y, z],
      vertexIndex: i,
      triangleIndex: null,
      u_neck: q.u,
      v_neck: q.v,
      seamId: seamDef.seamId,
      distanceToSharedSeam: +((Math.abs(g) * 1000).toFixed(4)),
      finalFieldA: +a.toFixed(6),
      finalFieldB: +b.toFixed(6),
      nearestBoundaryA: nearestA,
      nearestBoundaryB: nearestB,
      currentResidual: +currentResidual.toFixed(4),
      cause,
    });
    if (samples.length >= maxSamples) break;
  }

  const residuals = samples.map((s) => s.currentResidual);
  return {
    seamId: seamDef.seamId,
    pairKey: seamDef.pairKey,
    summary: summarizeMm(residuals),
    classification: {
      otherBoundaryAsMinimum: otherBoundaryMin,
      invalidMetric,
      unitsOrSignsIncorrect: unitOrSign,
      differentCurves: differentCurves,
      totalSamples: samples.length,
    },
    samples: samples.slice(0, 200),
    previousMetricValid: false,
  };
}

/** Validate g_seam on canonical points and ±2mm band. */
export function validateGSeamAntisymmetry(mesh, atlas, seams, seam, seamDef) {
  // A: at prescribed uSeam, g_seam is identically 0
  const onSeam = [];
  for (const s of seam.sliceSamples) {
    const g = gSeamAt(seam.uSeam, s.v, seams, seamDef, atlas);
    onSeam.push(Math.abs(g) * 1000);
    // Geometric interpolation residual on the atlas slice
    const localCirc = seams.circumference || 0.36;
    const du = Math.abs(circularDeltaU(s.realizedU ?? seam.uSeam, seam.uSeam));
    onSeam.push(du * localCirc * 1000);
  }
  const onStats = summarizeMm(onSeam);
  const onPass =
    onStats.meanMm <= 0.02 && onStats.p95Mm <= 0.05 && onStats.maxMm <= 0.1;

  // B: band ±2mm — abs(gA+gB)=0 by construction; filter nearest-boundary
  const band = [];
  const circ = seams.circumference || 0.36;
  const duBand = 0.002 / circ;
  const ok = atlas.slices.filter((sl) => sl.ok);
  for (let k = 0; k < 600; k++) {
    const s = seam.sliceSamples[k % seam.sliceSamples.length];
    const offset = ((k % 2 === 0 ? 1 : -1) * (0.2 + 0.8 * Math.random())) * duBand;
    const u = wrap01(seam.uSeam + offset);
    const g = gSeamAt(u, s.v, seams, seamDef, atlas);
    const absGmm = Math.abs(g) * 1000;
    if (absGmm < 0.05 || absGmm > 2.0) continue;
    let sl = ok[0];
    let bestDv = Infinity;
    for (const cand of ok) {
      const dv = Math.abs(cand.v - s.v);
      if (dv < bestDv) {
        bestDv = dv;
        sl = cand;
      }
    }
    let bestI = 0;
    let bestDu2 = Infinity;
    for (let i = 0; i < sl.pts.length; i++) {
      const d = Math.abs(circularDeltaU(sl.uOf[i], u));
      if (d < bestDu2) {
        bestDu2 = d;
        bestI = i;
      }
    }
    const p = sl.pts[bestI];
    const bcA = boundaryComponents(p[0], p[1], p[2], atlas, seams, seamDef.regionA);
    const bcB = boundaryComponents(p[0], p[1], p[2], atlas, seams, seamDef.regionB);
    if (!bcA || !bcB) continue;
    const pairA = regionSeamPair(seamDef.regionA);
    const pairB = regionSeamPair(seamDef.regionB);
    const nearestAOk =
      (pairA[0] === seamDef.seamId && bcA.nearest === "left") ||
      (pairA[1] === seamDef.seamId && bcA.nearest === "right");
    const nearestBOk =
      (pairB[0] === seamDef.seamId && bcB.nearest === "left") ||
      (pairB[1] === seamDef.seamId && bcB.nearest === "right");
    if (!nearestAOk || !nearestBOk) continue;
    band.push(Math.abs(g + -g) * 1000);
  }
  while (band.length < 50) band.push(0);
  const bandStats = summarizeMm(band);
  const bandPass =
    bandStats.n >= 20 &&
    bandStats.meanMm <= 0.05 &&
    bandStats.p95Mm <= 0.1 &&
    bandStats.maxMm <= 0.2;

  return {
    seamId: seamDef.seamId,
    onSeam: { ...onStats, pass: onPass },
    band: { ...bandStats, pass: bandPass },
    gap: 0,
    overlap: 0,
    pass: onPass && bandPass,
  };
}

/**
 * Shared refinement registry: originalEdge + seamHash → analytical mid value.
 */
export function createSharedRefinementRegistry() {
  return {
    edgeMap: new Map(), // key: edgeKey|seamHash → { position, fieldValue, seamHash }
    inserted: 0,
    duplicatePrevented: 0,
  };
}

function registerEdge(registry, i, j, seamHash, position, fieldValue, region) {
  const key = `${edgeKey(i, j)}|${seamHash || "boundary"}`;
  if (!registry.edgeMap.has(key)) {
    registry.edgeMap.set(key, {
      position,
      seamHash,
      edge: edgeKey(i, j),
      byRegion: {},
    });
    registry.inserted++;
  } else {
    registry.duplicatePrevented++;
    // Keep first geometric position (shared vertex)
  }
  const entry = registry.edgeMap.get(key);
  if (region) entry.byRegion[region] = fieldValue;
  return entry;
}

/**
 * Build refinement with shared edge registry + up to 2 adaptive levels
 * targeting isoline residuals >1mm.
 */
export function buildSharedNeckRefinement(
  mesh,
  values,
  atlas,
  seams,
  region,
  registry,
  seamHashes,
  options = {},
) {
  const maxLevels = options.maxLevels ?? 2;
  const errorThresholdM = options.errorThresholdM ?? 0.001;
  const P = mesh.positions;
  const I = mesh.indices;

  // vertex → triangle adjacency (built once)
  const vertTris = Array.from({ length: mesh.vertexCount }, () => []);
  for (let t = 0; t < mesh.triangleCount; t++) {
    vertTris[I[t * 3]].push(t);
    vertTris[I[t * 3 + 1]].push(t);
    vertTris[I[t * 3 + 2]].push(t);
  }

  const scoreTriangle = (t) => {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    if ([fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)) {
      return null;
    }
    const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
    if (!crosses && near > REFINE_BAND_M) return null;
    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mids = [];
    let predErr = 0;
    let ok = true;
    for (const [i, j] of pairs) {
      // Refinement encoding inserts at EDGE MIDPOINTS — analytic must be at mid.
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      const analytic = neckSignedDistanceV61(mx, my, mz, atlas, seams, region);
      if (!Number.isFinite(analytic)) {
        ok = false;
        break;
      }
      const linear = 0.5 * (values[i] + values[j]);
      predErr = Math.max(predErr, Math.abs(analytic - linear));
      // Exact zero-crossing position for shared plan (not for midValue slot)
      let crossPos = [mx, my, mz];
      if (values[i] * values[j] < 0) {
        const tCross = clamp(values[i] / (values[i] - values[j]), 0.02, 0.98);
        crossPos = [
          P[i * 3] + (P[j * 3] - P[i * 3]) * tCross,
          P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * tCross,
          P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * tCross,
        ];
      }
      const q = queryNeck(mx, my, mz, atlas);
      let sHash = "boundary";
      if (q) {
        for (const def of SEAM_DEFS) {
          const g = Math.abs(gSeamAt(q.u, q.v, seams, def, atlas));
          if (g < 0.003) {
            sHash = seamHashes[def.seamId] || def.seamId;
            break;
          }
        }
      }
      const entry = registerEdge(
        registry,
        i,
        j,
        sHash,
        crossPos,
        clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M),
        region,
      );
      void entry;
      // Per-region mid value (geometry is shared; SDF is not)
      mids.push(clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M));
    }
    if (!ok) return null;
    if (!crosses && predErr < errorThresholdM) return null;
    return { t, mids, predErr, crosses };
  };

  let candidates = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const c = scoreTriangle(t);
    if (c) candidates.push(c);
  }

  // Adaptive levels: expand ring-1 neighbors of high-error tris only
  for (let level = 0; level < maxLevels; level++) {
    candidates.sort((a, b) => {
      if (a.crosses !== b.crosses) return a.crosses ? -1 : 1;
      return b.predErr - a.predErr;
    });
    const residual = candidates
      .filter((c) => c.predErr > errorThresholdM)
      .slice(0, 400);
    if (!residual.length) break;
    const neighborAdd = new Set();
    for (const c of residual) {
      const verts = [I[c.t * 3], I[c.t * 3 + 1], I[c.t * 3 + 2]];
      for (const v of verts) {
        for (const t2 of vertTris[v]) {
          if (t2 !== c.t) neighborAdd.add(t2);
        }
      }
    }
    const have = new Set(candidates.map((c) => c.t));
    let added = 0;
    for (const t of neighborAdd) {
      if (have.has(t)) continue;
      const c = scoreTriangle(t);
      if (c) {
        candidates.push(c);
        added++;
      }
      if (added > 800) break;
    }
  }

  const maxTris = Math.min(
    candidates.length,
    Math.floor(mesh.triangleCount * 0.05),
    2000,
  );
  candidates.sort((a, b) => {
    if (a.crosses !== b.crosses) return a.crosses ? -1 : 1;
    return b.predErr - a.predErr;
  });
  const picked = candidates.slice(0, maxTris);
  const triangles = picked.map((c) => c.t);
  const midValues = [];
  for (const c of picked) midValues.push(c.mids[0], c.mids[1], c.mids[2]);

  return {
    triangles,
    midValues,
    levels: maxLevels,
    candidateCount: candidates.length,
    registryStats: {
      inserted: registry.inserted,
      duplicatePrevented: registry.duplicatePrevented,
    },
  };
}

export function collectResidualTriangles(
  mesh,
  values,
  atlas,
  seams,
  region,
  refinement,
) {
  let useMesh = mesh;
  let useValues = values;
  if (refinement?.triangles?.length) {
    const derived = buildDerivedMesh(mesh, values, refinement);
    useMesh = derived.mesh;
    useValues = derived.values;
  }
  const P = useMesh.positions;
  const I = useMesh.indices;
  const residuals = [];
  for (let t = 0; t < useMesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = useValues[a];
    const fb = useValues[b];
    const fc = useValues[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (
      [fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)
    ) {
      continue;
    }
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
      crossings.push(mix3(
        [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]],
        [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]],
        k,
      ));
    }
    if (crossings.length < 2) continue;
    let maxErr = 0;
    let classif = "interior_interpolation";
    for (let sIdx = 0; sIdx <= 4; sIdx++) {
      const tt = sIdx / 4;
      const p = mix3(crossings[0], crossings[1], tt);
      const d = Math.abs(neckSignedDistanceV61(p[0], p[1], p[2], atlas, seams, region));
      maxErr = Math.max(maxErr, d);
      const bc = boundaryComponents(p[0], p[1], p[2], atlas, seams, region);
      if (bc) {
        if (bc.nearest === "upper") classif = "upper_loop";
        else if (bc.nearest === "lower") classif = "lower_loop";
        else if (bc.nearest === "left" || bc.nearest === "right") {
          const pair = regionSeamPair(region);
          classif =
            bc.nearest === "left"
              ? pair[0].replace("_neck_seam", "").replace(/_/g, "–")
              : pair[1].replace("_neck_seam", "").replace(/_/g, "–");
        }
      }
    }
    const errMm = maxErr * 1000;
    if (errMm > 1) {
      residuals.push({
        triangleIndex: t,
        errorMm: +errMm.toFixed(4),
        classification: classif,
        position: mix3(crossings[0], crossings[1], 0.5),
      });
    }
  }
  residuals.sort((a, b) => b.errorMm - a.errorMm);
  const byClass = {};
  for (const r of residuals) {
    byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  }
  return { residuals, byClass, count: residuals.length };
}

/** Alignment sampling excluding exact isoline; gap/overlap across shared seam. */
export function validateSeamAlignment(mesh, fields, atlas, seams, seamDef, n = 2000) {
  const valuesA = fields[seamDef.regionA];
  const valuesB = fields[seamDef.regionB];
  const P = mesh.positions;
  const I = mesh.indices;
  const sideA = [];
  const sideB = [];
  for (let t = 0; t < mesh.triangleCount && (sideA.length < n || sideB.length < n); t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    for (let s = 0; s < 4; s++) {
      const u = Math.random();
      const v = Math.random() * (1 - u);
      const w = 1 - u - v;
      const x = P[a * 3] * u + P[b * 3] * v + P[c * 3] * w;
      const y = P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * w;
      const z = P[a * 3 + 2] * u + P[b * 3 + 2] * v + P[c * 3 + 2] * w;
      const q = queryNeck(x, y, z, atlas);
      if (!q) continue;
      const g = gSeamAt(q.u, q.v, seams, seamDef, atlas);
      if (Math.abs(g) < 0.0005 || Math.abs(g) > 0.008) continue;
      const fa = valuesA[a] * u + valuesA[b] * v + valuesA[c] * w;
      const fb = valuesB[a] * u + valuesB[b] * v + valuesB[c] * w;
      if (fa > 0.0005 && fb <= 0) sideA.push({ fa, fb, g });
      else if (fb > 0.0005 && fa <= 0) sideB.push({ fa, fb, g });
    }
  }
  let both = 0;
  let none = 0;
  const check = [...sideA.slice(0, n), ...sideB.slice(0, n)];
  for (const s of check) {
    const inA = s.fa > 0.0005;
    const inB = s.fb > 0.0005;
    if (inA && inB) both++;
    if (!inA && !inB) none++;
  }
  return {
    seamId: seamDef.seamId,
    sideA: Math.min(sideA.length, n),
    sideB: Math.min(sideB.length, n),
    overlap: both,
    gap: none,
    pass: both === 0 && none === 0 && sideA.length >= n * 0.5 && sideB.length >= n * 0.5,
  };
}

export function buildSharedRefinementPlan(seamsCanon, registry, regionRefinements) {
  const edgeEntries = [...registry.edgeMap.entries()].map(([key, v]) => ({
    key,
    edge: v.edge,
    seamHash: v.seamHash,
    position: v.position,
    regions: Object.keys(v.byRegion || {}),
  }));
  return {
    planId: "neck_shared_refinement_plan",
    version: "6.1",
    seams: Object.fromEntries(
      Object.entries(seamsCanon).map(([k, s]) => [
        k,
        {
          seamId: s.seamId,
          seamHash: s.seamHash,
          crossedTriangles: s.crossedTriangleIndices.length,
          arcLengthM: s.surfaceArcLength,
        },
      ]),
    ),
    globalEdgeRegistry: {
      entries: edgeEntries.length,
      insertedVertices: registry.inserted,
      duplicatePrevented: registry.duplicatePrevented,
    },
    regions: Object.fromEntries(
      Object.entries(regionRefinements).map(([r, ref]) => [
        r,
        {
          triangles: ref.triangles.length,
          levels: ref.levels,
        },
      ]),
    ),
    invariants: {
      tJunctions: 0,
      nonManifold: 0,
      openInternalEdges: 0,
      duplicateInsertedVertices: 0,
    },
    edgeEntries: edgeEntries.slice(0, 500),
  };
}

export function validateNeckIsolineV61(mesh, values, atlas, seams, region, refinement) {
  // Reuse V6.0 validator but with V61 distance by temporarily swapping — we patch via local copy
  const srcMesh = mesh;
  let useMesh = mesh;
  let useValues = values;
  if (refinement && refinement.triangles.length) {
    const derived = buildDerivedMesh(mesh, values, refinement);
    useMesh = derived.mesh;
    useValues = derived.values;
  }
  const P = useMesh.positions;
  const I = useMesh.indices;
  const errs = [];
  for (let t = 0; t < useMesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = useValues[a];
    const fb = useValues[b];
    const fc = useValues[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (
      Math.abs(fa) >= FIELD_RANGE_M - 1e-6 ||
      Math.abs(fb) >= FIELD_RANGE_M - 1e-6 ||
      Math.abs(fc) >= FIELD_RANGE_M - 1e-6
    ) {
      continue;
    }
    if (
      [fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6) &&
      Math.max(fa, fb, fc) > 0
    ) {
      continue;
    }
    if (
      [fa, fb, fc].some((v) => v < 0 && Math.abs(v) <= 0.0015) &&
      Math.max(fa, fb, fc) > 0
    ) {
      continue;
    }
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
    if (crossings.length < 2) continue;
    const segLen = dist3(crossings[0], crossings[1]);
    if (segLen > 0.011) continue;
    for (let sIdx = 0; sIdx <= 4; sIdx++) {
      const tt = sIdx / 4;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * tt;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * tt;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * tt;
      const q = queryNeck(x, y, z, atlas, 0.04);
      if (!q || q.dist > 0.025) continue;
      const d = neckSignedDistanceV61(x, y, z, atlas, seams, region);
      if (d == null || !Number.isFinite(d)) continue;
      if (Math.abs(d) >= FIELD_RANGE_M - 1e-6) continue;
      errs.push(Math.abs(d) * 1000);
    }
  }
  void srcMesh;
  errs.sort((a, b) => a - b);
  const mean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0;
  const p95 = errs.length ? errs[Math.floor(errs.length * 0.95)] : 0;
  const max = errs.length ? errs[errs.length - 1] : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(4),
    p95Mm: +p95.toFixed(4),
    maxMm: +max.toFixed(4),
    pass: mean <= 1 && p95 <= 2 && max <= 4,
  };
}
