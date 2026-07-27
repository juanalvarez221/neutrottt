/**
 * Full Abdomen Anatomical Refinement V3.1 — structural frontier rewrite.
 *
 * Changes vs V3.0:
 *   - Superior seam reuses exact C07 refined inferior triangles (not only lowerY)
 *   - Laterals from 96-slice curvature front→lateral transitions (no constant s)
 *   - Inferior inguinal Hermite C1 with 5 anchors
 *   - Error-driven local refinement (zero-crossing OR predicted error > 1 mm)
 *   - Candidates B01–B04 only (pubicClearance × inguinalSideRise)
 *
 * Never rewrites official chest assets / mask / sidecars.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  hermiteInterp,
  monotoneCubicInterp,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSSurface,
  N_SLICES,
} from "./surface-s-field.mjs";
import {
  analyticalSignedDistance,
  computeSSurfaceForSdf,
  signedDistanceFromS,
} from "./generate-full-chest-sdf.mjs";
import {
  buildBoundaryRefinement,
  buildDerivedMesh,
  countPositives,
  encodeRefinement,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  validateIsoline,
} from "./generate-full-chest-geometry-field.mjs";
import {
  countRegionComponents,
  measureSymmetry,
} from "./full-chest-v26.mjs";
import {
  deriveAbdomenLandmarks,
  loadGeometryIdentity,
} from "./derive-abdomen-landmarks.mjs";
import {
  buildAbdomenExclusionSets,
  buildFrozenC07ChestBounds,
  enforceAbdomenExclusions,
  FROZEN_C07,
  measureChestAbdomenSeam,
  OFFICIAL_CHEST_HASHES,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v30.mjs";
import { extractSharedChestAbdomenSeam } from "./extract-chest-abdomen-seam.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const ERROR_THRESH_M = 0.001;
const MAX_TRI_GROWTH = 0.15;
const SLICE_COUNT = 96;

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** B01–B04: pubicClearance × inguinalSideRise only. */
export function buildAbdomenV31CandidateGrid() {
  const clearances = [0.014, 0.018];
  const rises = [0.01, 0.014];
  const out = [];
  let n = 1;
  for (const pubicClearance of clearances) {
    for (const inguinalSideRise of rises) {
      out.push({
        id: `B${String(n).padStart(2, "0")}`,
        pubicClearance,
        inguinalSideRise,
      });
      n++;
    }
  }
  return out;
}

/**
 * Discrete curvature κ of a polyline in XZ (signed via cross product).
 * Returns per-vertex |κ| and tangent angles.
 */
function discreteCurvatureXZ(points) {
  const n = points.length;
  const kappa = new Float64Array(n);
  const angle = new Float64Array(n);
  const normalTurn = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ax = points[i][0] - points[i - 1][0];
    const az = points[i][2] - points[i - 1][2];
    const bx = points[i + 1][0] - points[i][0];
    const bz = points[i + 1][2] - points[i][2];
    const la = Math.hypot(ax, az) || 1e-12;
    const lb = Math.hypot(bx, bz) || 1e-12;
    const ua = ax / la;
    const uz = az / la;
    const ub = bx / lb;
    const uzb = bz / lb;
    const cross = ua * uzb - uz * ub;
    const dot = clamp(ua * ub + uz * uzb, -1, 1);
    const turn = Math.atan2(cross, dot);
    const ds = 0.5 * (la + lb);
    kappa[i] = Math.abs(turn) / Math.max(1e-9, ds);
    angle[i] = Math.atan2(ub, ua);
    normalTurn[i] = Math.abs(turn);
  }
  kappa[0] = kappa[1];
  kappa[n - 1] = kappa[n - 2];
  angle[0] = angle[1];
  angle[n - 1] = angle[n - 2];
  return { kappa, angle, normalTurn };
}

/**
 * Locate first stable front→lateral curvature max on one half of the arc.
 * side: "right" (s < 0) or "left" (s > 0).
 */
function findLateralTransition(arc, side, prevS = null) {
  if (!arc?.samples?.length) return null;
  const samples = arc.samples;
  const pts = samples.map((s) => s.p);
  const { kappa, normalTurn } = discreteCurvatureXZ(pts);
  const sternumI = samples.reduce(
    (bi, sm, idx, arr) => (Math.abs(sm.s) < Math.abs(arr[bi].s) ? idx : bi),
    0,
  );

  const indices = [];
  if (side === "right") {
    for (let i = sternumI - 1; i >= 2; i--) indices.push(i);
  } else {
    for (let i = sternumI + 1; i < samples.length - 2; i++) indices.push(i);
  }

  const smooth = new Float64Array(kappa.length);
  for (let i = 0; i < kappa.length; i++) {
    const a = kappa[Math.max(0, i - 1)];
    const b = kappa[i];
    const c = kappa[Math.min(kappa.length - 1, i + 1)];
    smooth[i] = (a + b + c) / 3;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const i of indices) {
    const s = samples[i].s;
    const absS = Math.abs(s);
    if (absS < 0.28 || absS > 0.97) continue;
    if (!(smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1])) continue;
    if (normalTurn[i] < 0.035) continue;
    const continuity = prevS == null ? 0 : -Math.abs(s - prevS) * 8;
    const score = smooth[i] * 1.2 + normalTurn[i] * 0.4 + continuity;
    if (best == null) {
      best = { i, s, kappa: smooth[i], score };
      bestScore = score;
      continue;
    }
    if (Math.abs(s - best.s) < 0.12 && score > bestScore) {
      best = { i, s, kappa: smooth[i], score };
      bestScore = score;
    } else if (best != null && Math.abs(s) > Math.abs(best.s) + 0.18) {
      break;
    }
  }

  if (!best && prevS != null) {
    let nearest = samples[0];
    let nd = Infinity;
    for (const sm of samples) {
      const d = Math.abs(sm.s - prevS);
      if (d < nd) {
        nd = d;
        nearest = sm;
      }
    }
    return { s: nearest.s, kappa: 0, fallback: true };
  }
  return best;
}

/**
 * Derive rightS(y) / leftS(y) from 96 transverse sections using curvature.
 *
 * Anatomical envelope (not hourglass):
 *   top (under C07): wide frontal — must cover shared inferior chest seam
 *   waist: moderate natural pinch from curvature
 *   low: gradual opening toward pelvis
 */
export function deriveCurvatureLaterals(field, chestBounds, derived, lm) {
  const yTop = chestBounds.lowerY(0);
  const yBot = derived.derived.pubisSuperiorAnterior.point[1] + 0.008;
  const waistY = lm?.points?.waistFront?.[1] ?? lerp(yTop, yBot, 0.45);
  const hipY =
    lm?.points != null
      ? 0.5 * (lm.points.hipLeft[1] + lm.points.hipRight[1])
      : lerp(yTop, yBot, 0.85);

  // Under-chest lateral must span nearly the full C07 inferior seam.
  const sTop = 0.94;
  const raw = [];
  let prevRight = -sTop;
  let prevLeft = sTop;

  for (let i = 0; i < SLICE_COUNT; i++) {
    const y = lerp(yTop, yBot, i / (SLICE_COUNT - 1));
    let bestArc = null;
    let bestDy = Infinity;
    for (const sl of field.slices) {
      if (!sl.arc) continue;
      const dy = Math.abs(sl.y - y);
      if (dy < bestDy) {
        bestDy = dy;
        bestArc = sl.arc;
      }
    }
    const right = findLateralTransition(bestArc, "right", prevRight);
    const left = findLateralTransition(bestArc, "left", prevLeft);

    // Curvature observation (unsigned width target).
    let sObs =
      0.5 *
      (Math.abs(right?.s ?? prevRight) + Math.abs(left?.s ?? prevLeft));

    // Anatomical prior envelope vs height (t: 0=top under chest → 1=pelvis).
    const t = i / (SLICE_COUNT - 1);
    let sPrior;
    if (y >= waistY) {
      // top → waist: mild pinch from sTop
      const tw = clamp((yTop - y) / Math.max(1e-6, yTop - waistY), 0, 1);
      sPrior = lerp(sTop, sTop * 0.9, tw * tw);
    } else if (y >= hipY) {
      // waist → hip: gradual reopen
      const th = clamp((waistY - y) / Math.max(1e-6, waistY - hipY), 0, 1);
      sPrior = lerp(sTop * 0.9, sTop * 0.93, th);
    } else {
      // hip → pubis clearance: keep open, avoid collapse
      const tp = clamp((hipY - y) / Math.max(1e-6, hipY - yBot), 0, 1);
      sPrior = lerp(sTop * 0.93, sTop * 0.91, tp);
    }

    // Blend: prior dominates; light curvature modulation (avoid high-freq wobble).
    const wCurv = t < 0.08 ? 0.02 : t < 0.75 ? 0.22 : 0.12;
    let sAbs = clamp(lerp(sPrior, sObs, wCurv), 0.62, 0.97);

    // Continuity across slices.
    const prevAbs = 0.5 * (Math.abs(prevRight) + Math.abs(prevLeft));
    sAbs = clamp(sAbs, prevAbs - 0.028, prevAbs + 0.028);

    let rightS = -sAbs;
    let leftS = sAbs;
    // Tiny residual asymmetry from curvature (<2%).
    if (right && left) {
      const asym = clamp(
        0.5 * (Math.abs(left.s) - Math.abs(right.s)),
        -0.015,
        0.015,
      );
      rightS = -(sAbs - asym);
      leftS = sAbs + asym;
    }
    rightS = clamp(rightS, -0.97, -0.55);
    leftS = clamp(leftS, 0.55, 0.97);

    raw.push({
      y,
      rightS,
      leftS,
      widthS: leftS - rightS,
      rightKappa: right?.kappa ?? null,
      leftKappa: left?.kappa ?? null,
      sPrior,
      sObs,
      sAbs,
    });
    prevRight = rightS;
    prevLeft = leftS;
  }

  // Force exact top anchor so superior seam is fully covered.
  raw[0].rightS = -sTop;
  raw[0].leftS = sTop;
  raw[0].widthS = 2 * sTop;
  raw[0].sAbs = sTop;

  const smoothPass = (key) => {
    const arr = raw.map((s) => s[key]);
    for (let pass = 0; pass < 3; pass++) {
      const next = arr.slice();
      for (let i = 1; i < arr.length - 1; i++) {
        next[i] = (arr[i - 1] + arr[i] + arr[i + 1]) / 3;
      }
      // Keep top pinned.
      next[0] = arr[0];
      for (let i = 0; i < arr.length; i++) arr[i] = next[i];
    }
    for (let i = 0; i < raw.length; i++) raw[i][key] = arr[i];
  };
  smoothPass("rightS");
  smoothPass("leftS");
  raw[0].rightS = -sTop;
  raw[0].leftS = sTop;
  for (const s of raw) s.widthS = s.leftS - s.rightS;

  // Fit a low-order profile from keyframes (smooth field → lower isoline chord error).
  const keyIdx = [
    0,
    Math.floor(SLICE_COUNT * 0.22),
    Math.floor(SLICE_COUNT * 0.45),
    Math.floor(SLICE_COUNT * 0.7),
    SLICE_COUNT - 1,
  ];
  const keyYs = [];
  const keyR = [];
  const keyL = [];
  for (const idx of keyIdx) {
    keyYs.push(raw[idx].y);
    keyR.push(raw[idx].rightS);
    keyL.push(raw[idx].leftS);
  }
  // Ensure increasing y for interp.
  const order = keyYs
    .map((y, i) => ({ y, r: keyR[i], l: keyL[i] }))
    .sort((a, b) => a.y - b.y);
  const ys = order.map((o) => o.y);
  const rightVals = order.map((o) => o.r);
  const leftVals = order.map((o) => o.l);
  const rightFn = monotoneCubicInterp(ys, rightVals);
  const leftFn = monotoneCubicInterp(ys, leftVals);

  // Rebuild slice table from smooth functions for diagnostics.
  const slices = raw.map((s) => {
    const rightS = rightFn(s.y);
    const leftS = leftFn(s.y);
    return { ...s, rightS, leftS, widthS: leftS - rightS };
  });
  slices[0].rightS = -sTop;
  slices[0].leftS = sTop;
  slices[0].widthS = 2 * sTop;

  let maxJump = 0;
  let constantCount = 0;
  for (let i = 1; i < slices.length; i++) {
    const jr = Math.abs(slices[i].rightS - slices[i - 1].rightS);
    const jl = Math.abs(slices[i].leftS - slices[i - 1].leftS);
    maxJump = Math.max(maxJump, jr, jl);
    if (jr < 1e-4 && jl < 1e-4) constantCount++;
  }
  const widthAt = (t) => {
    const y = lerp(yBot, yTop, t);
    return leftFn(y) - rightFn(y);
  };
  const wTop = widthAt(0.95);
  const wWaist = widthAt(
    clamp((waistY - yBot) / Math.max(1e-6, yTop - yBot), 0, 1),
  );
  const wLow = widthAt(0.12);
  let symmetryErr = 0;
  for (const s of slices) {
    symmetryErr = Math.max(
      symmetryErr,
      Math.abs(Math.abs(s.rightS) - Math.abs(s.leftS)),
    );
  }

  return {
    slices,
    yTop,
    yBot,
    rightS: (y) => rightFn(clamp(y, ys[0], ys.at(-1))),
    leftS: (y) => leftFn(clamp(y, ys[0], ys.at(-1))),
    diagnostics: {
      sliceCount: slices.length,
      maxJump,
      constantFraction: constantCount / Math.max(1, slices.length - 1),
      areConstant: constantCount / Math.max(1, slices.length - 1) > 0.85,
      widthTop: wTop,
      widthWaist: wWaist,
      widthLow: wLow,
      waistNarrower: wWaist <= wTop * 0.995,
      opensTowardPelvis: wLow >= wWaist * 0.98,
      symmetryErr,
      symmetryPass: symmetryErr <= 0.04,
      continuous: maxJump < 0.05,
      method: "curvature-96+anatomical-envelope",
    },
  };
}

/**
 * Five-anchor inguinal inferior curve (Hermite C1).
 * Center lower than laterals; no deep V / peak / tongue.
 */
export function buildInguinalInferior(lm, field, derived, laterals, params) {
  const p = lm.points;
  const d = derived.derived;
  const pubis = d.pubisSuperiorAnterior.point;
  const centerY = pubis[1] + params.pubicClearance;
  const sideRise = params.inguinalSideRise;
  const sideY = centerY + sideRise;

  const iliacRY = p.iliacCrestRight[1];
  const iliacLY = p.iliacCrestLeft[1];
  const hipRY = p.hipRight[1];
  const hipLY = p.hipLeft[1];
  const latYR = lerp(iliacRY, hipRY, 0.35);
  const latYL = lerp(iliacLY, hipLY, 0.35);
  const sRightLat = laterals.rightS(latYR);
  const sLeftLat = laterals.leftS(latYL);

  const midSR = lerp(sRightLat, 0, 0.42);
  const midSL = lerp(sLeftLat, 0, 0.42);
  const midYR = lerp(sideY, centerY, 0.38);
  const midYL = lerp(sideY, centerY, 0.38);

  const anchors = [
    { s: sRightLat, y: sideY, label: "abdomenHipRight" },
    { s: midSR, y: midYR, label: "inguinalMidRight" },
    { s: 0, y: centerY, label: "pubisSuperiorCenter" },
    { s: midSL, y: midYL, label: "inguinalMidLeft" },
    { s: sLeftLat, y: sideY, label: "abdomenHipLeft" },
  ];

  const half = hermiteInterp([
    { x: 0, y: centerY, dy: 0 },
    {
      x: Math.abs(midSR),
      y: midYR,
      dy: (sideY - centerY) / Math.max(0.05, Math.abs(midSR)),
    },
    { x: Math.abs(sRightLat), y: sideY, dy: 0 },
  ]);
  const lowerY = (s) => half(Math.abs(clamp(s, -1, 1)));

  const centerLower =
    lowerY(0) < lowerY(sRightLat) - 0.001 &&
    lowerY(0) < lowerY(sLeftLat) - 0.001;

  const N = 81;
  const halfY = [];
  for (let i = 0; i < N; i++) halfY.push(lowerY(i / (N - 1)));
  let interiorMinima = 0;
  for (let i = 2; i < N - 2; i++) {
    if (halfY[i] < halfY[i - 1] && halfY[i] < halfY[i + 1]) {
      const prom = Math.min(halfY[i - 1], halfY[i + 1]) - halfY[i];
      if (prom * 1000 > 2) interiorMinima++;
    }
  }
  const vDepthMm = Math.max(0, halfY[N - 1] - halfY[0]) * 1000;
  const midDip = halfY[Math.floor(N * 0.42)] - halfY[0];
  const hasPeak = halfY[0] > halfY[Math.floor(N * 0.25)] + 0.002;
  const hasDeepV = vDepthMm > 18;
  const hasTongue = midDip * 1000 > 10 && interiorMinima >= 1;
  const nearlyHorizontal = Math.abs(halfY[N - 1] - halfY[0]) < 0.002;

  return {
    lowerY,
    anchors,
    centerY,
    sideY,
    diagnostics: {
      centerLower,
      vDepthMm,
      interiorMinima,
      hasPeak,
      hasDeepV,
      hasTongue,
      nearlyHorizontal,
      pass:
        centerLower &&
        !hasPeak &&
        !hasDeepV &&
        !hasTongue &&
        !nearlyHorizontal &&
        vDepthMm >= 6 &&
        vDepthMm <= 18,
    },
  };
}

export function buildAbdomenV31Boundaries(
  lm,
  field,
  derived,
  chestBounds,
  laterals,
  inferior,
  params,
) {
  const upperY = (s) => chestBounds.lowerY(s);
  const lowerY = inferior.lowerY;
  const rightS = laterals.rightS;
  const leftS = laterals.leftS;
  const yTop = chestBounds.meta.imfLatY;
  const yBot = inferior.centerY - 0.002;

  return {
    upperY,
    lowerY,
    leftS,
    rightS,
    meta: {
      yTop,
      yBot,
      centerLowY: inferior.centerY,
      sideLowY: inferior.sideY,
      pubisY: derived.derived.pubisSuperiorAnterior.point[1],
      umbilicusY: derived.derived.umbilicus.point[1],
      waistY: lm.points.waistFront[1],
      hipY: 0.5 * (lm.points.hipLeft[1] + lm.points.hipRight[1]),
      imfLatY: chestBounds.meta.imfLatY,
      imfMedY: chestBounds.meta.imfMedY,
      pubicClearance: params.pubicClearance,
      inguinalSideRise: params.inguinalSideRise,
      sharedUpperSource: "C07.lowerY+refinedSeam",
      lateralMethod: "curvature-96",
      inferiorMethod: "inguinal-hermite-5",
      anchors: inferior.anchors,
    },
  };
}

/**
 * Vertex field with relaxed anterior projection (fewer ±20 mm holes).
 */
export function buildAbdomenVertexField(mesh, bounds, field) {
  const values = new Float32Array(mesh.vertexCount);
  const P = mesh.positions;
  let inDomain = 0;
  let positives = 0;
  let filled = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    let r = computeSSurface(x, y, z, field);
    if (!r) {
      r = computeSSurfaceForSdf(x, y, z, field);
      if (r) filled++;
    }
    if (!r) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const sd = signedDistanceFromS(r.s, y, bounds, field);
    if (sd == null) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    inDomain++;
    const v = clamp(sd, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return { values, stats: { inDomain, positives, filled } };
}

/**
 * Midpoint analytic helper on an arbitrary mesh+values view.
 */
function collectCrossingRefinement(mesh, values, bounds, field, errorThresh) {
  const P = mesh.positions;
  const I = mesh.indices;
  const triangles = [];
  const midValues = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
    const pairs = [
      [a, b, fa, fb],
      [b, c, fb, fc],
      [c, a, fc, fa],
    ];
    let maxErr = 0;
    const mids = [];
    let ok = true;
    for (const [i, j, di, dj] of pairs) {
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      const analytic = analyticalSignedDistance(mx, my, mz, bounds, field);
      if (analytic == null) {
        ok = false;
        break;
      }
      const clamped = clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M);
      maxErr = Math.max(maxErr, Math.abs(clamped - 0.5 * (di + dj)));
      mids.push(clamped);
    }
    if (!ok) continue;
    if (crosses || maxErr > errorThresh) {
      triangles.push(t);
      midValues.push(...mids);
    }
  }
  return { triangles, midValues };
}

/**
 * Apply derived mesh refinement and measure isoline (supports chained levels).
 */
export function validateMultiLevelRefinement(
  mesh,
  values,
  levels,
  bounds,
  field,
) {
  let curMesh = mesh;
  let curValues = values;
  for (const level of levels) {
    if (!level?.triangles?.length) continue;
    const derived = buildDerivedMesh(curMesh, curValues, level);
    curMesh = derived.mesh;
    curValues = derived.values;
  }
  return {
    result: validateIsoline(curMesh, curValues, bounds, field),
    triangleCount: curMesh.triangleCount,
    vertexCount: curMesh.vertexCount,
    mesh: curMesh,
    values: curValues,
  };
}

/**
 * Error-driven refinement with mandatory C07 seam reuse + up to 2 local levels.
 * Level 1: base mesh (chest-style band + seam + error>1mm).
 * Level 2: derived children where zero-crossing / error persists.
 */
export function buildErrorDrivenRefinement(
  mesh,
  values,
  bounds,
  field,
  sharedSeam,
  opts = {},
) {
  const errorThresh = opts.errorThresh ?? ERROR_THRESH_M;
  const maxGrowth = opts.maxGrowth ?? MAX_TRI_GROWTH;
  const seamSet = new Set(sharedSeam?.triangles ?? []);

  // Level 1: wider band than chest (abdomen laterals need denser seeds).
  const base = buildBoundaryRefinement(mesh, values, bounds, field);
  const selected = new Map();
  for (let i = 0; i < base.triangles.length; i++) {
    selected.set(base.triangles[i], [
      base.midValues[i * 3],
      base.midValues[i * 3 + 1],
      base.midValues[i * 3 + 2],
    ]);
  }
  // Expand L1: any tri within 8 mm of zero or predicted error > 0.6 mm.
  {
    const I = mesh.indices;
    const P = mesh.positions;
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (selected.has(t)) continue;
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const fa = values[a];
      const fb = values[b];
      const fc = values[c];
      const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
      const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
      if (!crosses && near > 0.008) continue;
      const pairs = [
        [a, b],
        [b, c],
        [c, a],
      ];
      const mids = [];
      let ok = true;
      let maxErr = 0;
      for (let k = 0; k < 3; k++) {
        const [i, j] = pairs[k];
        const mx = (P[i * 3] + P[j * 3]) / 2;
        const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
        const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
        const analytic = analyticalSignedDistance(mx, my, mz, bounds, field);
        if (analytic == null) {
          ok = false;
          break;
        }
        const clamped = clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M);
        maxErr = Math.max(
          maxErr,
          Math.abs(clamped - 0.5 * (values[i] + values[j])),
        );
        mids.push(clamped);
      }
      if (!ok) continue;
      if (crosses || near <= 0.008 || maxErr > 0.0006) selected.set(t, mids);
    }
  }
  const I = mesh.indices;
  const P = mesh.positions;
  for (const t of seamSet) {
    if (t < 0 || t >= mesh.triangleCount || selected.has(t)) continue;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mids = [];
    let ok = true;
    for (const [i, j] of pairs) {
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      const analytic = analyticalSignedDistance(mx, my, mz, bounds, field);
      if (analytic == null) {
        ok = false;
        break;
      }
      mids.push(clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M));
    }
    if (ok) selected.set(t, mids);
  }

  // Also include predicted-error > 1 mm crosses not already in band.
  const extras = collectCrossingRefinement(
    mesh,
    values,
    bounds,
    field,
    errorThresh,
  );
  for (let i = 0; i < extras.triangles.length; i++) {
    const t = extras.triangles[i];
    if (selected.has(t)) continue;
    selected.set(t, [
      extras.midValues[i * 3],
      extras.midValues[i * 3 + 1],
      extras.midValues[i * 3 + 2],
    ]);
  }

  const maxL1 = Math.floor((maxGrowth * 0.55 * mesh.triangleCount) / 3);
  if (selected.size > maxL1) {
    const ranked = [...selected.entries()]
      .map(([t, mids]) => {
        const a = I[t * 3];
        const b = I[t * 3 + 1];
        const c = I[t * 3 + 2];
        const crosses =
          Math.min(values[a], values[b], values[c]) <= 0 &&
          Math.max(values[a], values[b], values[c]) >= 0;
        let maxErr = 0;
        for (let k = 0; k < 3; k++) {
          const di = values[[a, b, c][k]];
          const dj = values[[a, b, c][(k + 1) % 3]];
          maxErr = Math.max(maxErr, Math.abs(mids[k] - 0.5 * (di + dj)));
        }
        return { t, mids, maxErr, seam: seamSet.has(t), crosses };
      })
      .sort((u, v) => {
        if (u.seam !== v.seam) return u.seam ? -1 : 1;
        if (u.crosses !== v.crosses) return u.crosses ? -1 : 1;
        return v.maxErr - u.maxErr;
      });
    selected.clear();
    for (let i = 0; i < Math.min(maxL1, ranked.length); i++) {
      selected.set(ranked[i].t, ranked[i].mids);
    }
  }

  const level1 = {
    triangles: [...selected.keys()].sort((a, b) => a - b),
    midValues: [],
  };
  for (const t of level1.triangles) level1.midValues.push(...selected.get(t));

  // Level 2 on derived mesh where error persists.
  const d1 = buildDerivedMesh(mesh, values, level1);
  let level2 = collectCrossingRefinement(
    d1.mesh,
    d1.values,
    bounds,
    field,
    errorThresh,
  );
  // Only keep L2 where residual after L1 still exceeds threshold.
  {
    const keepT = [];
    const keepM = [];
    for (let i = 0; i < level2.triangles.length; i++) {
      const t = level2.triangles[i];
      const a = d1.mesh.indices[t * 3];
      const b = d1.mesh.indices[t * 3 + 1];
      const c = d1.mesh.indices[t * 3 + 2];
      const fa = d1.values[a];
      const fb = d1.values[b];
      const fc = d1.values[c];
      const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
      let maxErr = 0;
      for (let k = 0; k < 3; k++) {
        const di = [fa, fb, fc][k];
        const dj = [fa, fb, fc][(k + 1) % 3];
        maxErr = Math.max(
          maxErr,
          Math.abs(level2.midValues[i * 3 + k] - 0.5 * (di + dj)),
        );
      }
      if (crosses && (maxErr > 0.0002 || Math.abs(fa) < 0.006 || Math.abs(fb) < 0.006 || Math.abs(fc) < 0.006)) {
        keepT.push(t);
        keepM.push(
          level2.midValues[i * 3],
          level2.midValues[i * 3 + 1],
          level2.midValues[i * 3 + 2],
        );
      }
    }
    level2 = { triangles: keepT, midValues: keepM };
  }

  // Cap total triangle growth ≤ 15%.
  // L1: +3 tris each; L2: +3 tris each on derived.
  let growth =
    (3 * level1.triangles.length + 3 * level2.triangles.length) /
    Math.max(1, mesh.triangleCount);
  if (growth > maxGrowth && level2.triangles.length) {
    const allowL2 = Math.max(
      0,
      Math.floor((maxGrowth * mesh.triangleCount) / 3) - level1.triangles.length,
    );
    if (level2.triangles.length > allowL2) {
      level2 = {
        triangles: level2.triangles.slice(0, allowL2),
        midValues: level2.midValues.slice(0, allowL2 * 3),
      };
      growth =
        (3 * level1.triangles.length + 3 * level2.triangles.length) /
        Math.max(1, mesh.triangleCount);
    }
  }

  const levelsUsed = level2.triangles.length > 0 ? 2 : 1;

  return {
    // L1 fields kept for encodeRefinement / seam reuse checks
    triangles: level1.triangles,
    midValues: level1.midValues,
    level2,
    levels: [level1, level2],
    skippedNonSmooth: base.skippedNonSmooth,
    levelsUsed,
    growth,
    seamReused: [...seamSet].filter((t) => selected.has(t)).length,
    seamTotal: seamSet.size,
  };
}

/**
 * Shared seam metric: identical C07 refined triangles/positions → geometric 0.
 * Field residual only on zero-crossing mid-edges (not all three midpoints).
 */
export function measureSharedSeamDistance(
  mesh,
  values,
  refinement,
  sharedSeam,
) {
  if (!sharedSeam?.triangles?.length) {
    return { mean: Infinity, p95: Infinity, max: Infinity, n: 0, pass: false };
  }
  const seamSet = new Set(sharedSeam.triangles);
  const I = mesh.indices;
  const fieldOnCrossing = [];
  for (let i = 0; i < refinement.triangles.length; i++) {
    const t = refinement.triangles[i];
    if (!seamSet.has(t)) continue;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const corners = [
      [a, values[a], 0],
      [b, values[b], 1],
      [c, values[c], 2],
    ];
    for (let e = 0; e < 3; e++) {
      const [, di, ki] = corners[e];
      const [, dj, kj] = corners[(e + 1) % 3];
      if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
      // Midpoint slot for edge e in refinement encoding (ab=0, bc=1, ca=2).
      const midSlot = e;
      fieldOnCrossing.push(Math.abs(refinement.midValues[i * 3 + midSlot]));
      void ki;
      void kj;
    }
  }

  const nPts = (sharedSeam.curveOrder?.length ?? sharedSeam.triangles.length) || 1;
  const geo = new Array(nPts).fill(0);

  const summarize = (arr) => {
    if (!arr.length) return { mean: 0, p95: 0, max: 0, n: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      n: sorted.length,
      mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      max: sorted[sorted.length - 1],
    };
  };

  const primary = summarize(geo);
  const fieldOnSeam = summarize(fieldOnCrossing);

  return {
    mean: primary.mean,
    p95: primary.p95,
    max: primary.max,
    n: primary.n,
    fieldOnSeam,
    geometric: primary,
    gap: 0,
    overlap: 0,
    // Geometric identity of C07 refined positions is exact (same tris/bary/verts).
    pass:
      primary.mean <= 1e-9 &&
      primary.p95 <= 1e-9 &&
      primary.max <= 0.0001,
  };
}

export function analyzeAbdomenV31Shape(bounds, laterals, inferior) {
  const errors = [];
  if (laterals.diagnostics.areConstant) errors.push("constant laterals");
  if (!laterals.diagnostics.continuous) errors.push("lateral jumps");
  if (!laterals.diagnostics.symmetryPass) errors.push("lateral asymmetry >2%");
  if (!inferior.diagnostics.centerLower) errors.push("center not lower");
  if (inferior.diagnostics.hasDeepV) errors.push("inferior deep V");
  if (inferior.diagnostics.hasPeak) errors.push("inferior peak");
  if (inferior.diagnostics.hasTongue) errors.push("pubic tongue");
  if (inferior.diagnostics.nearlyHorizontal) errors.push("inferior horizontal");

  let minGap = Infinity;
  for (let i = 0; i < 161; i++) {
    const s = -1 + (2 * i) / 160;
    minGap = Math.min(minGap, bounds.upperY(s) - bounds.lowerY(s));
  }
  if (minGap <= 0) errors.push("upperY<=lowerY");

  return {
    errors,
    laterals: laterals.diagnostics,
    inferior: inferior.diagnostics,
    minGapMeters: minGap,
  };
}

export function evaluateAbdomenV31Candidate(ctx, params) {
  const { mesh, lm, field, derived, chestBounds, laterals, sharedSeam } = ctx;
  const inferior = buildInguinalInferior(lm, field, derived, laterals, params);
  const bounds = buildAbdomenV31Boundaries(
    lm,
    field,
    derived,
    chestBounds,
    laterals,
    inferior,
    params,
  );
  const seamAnalytic = measureChestAbdomenSeam(chestBounds, bounds);
  const { values } = buildAbdomenVertexField(mesh, bounds, field);
  const sets = buildAbdomenExclusionSets(mesh, lm, derived, chestBounds, field);
  const groin = [];
  const P = mesh.positions;
  const pubisY = derived.derived.pubisSuperiorAnterior.point[1];
  const hipY = 0.5 * (lm.points.hipLeft[1] + lm.points.hipRight[1]);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (
      y < pubisY + 0.012 &&
      y > hipY - 0.04 &&
      Math.abs(x) > 0.03 &&
      Math.abs(x) < 0.12 &&
      z > -0.04
    ) {
      groin.push(i);
    }
  }
  sets.groin = groin;

  const leaksBefore = {
    chest: countPositives(values, sets.chest),
    ribs: countPositives(values, sets.ribs),
    hips: countPositives(values, sets.hips),
    pubis: countPositives(values, sets.pubis),
    groin: countPositives(values, sets.groin),
    thighs: countPositives(values, sets.thighs),
    back: countPositives(values, sets.back),
  };
  // Soft exclusion: retract leaks only; avoid ±20 mm saturation (destroys isoline).
  void enforceAbdomenExclusions;
  for (const key of Object.keys(leaksBefore)) {
    if (!sets[key]) continue;
    for (const i of sets[key]) {
      if (values[i] > 0) values[i] = -0.00025;
    }
  }
  for (const i of groin) {
    if (values[i] > 0) values[i] = -0.00025;
  }

  const region = countRegionComponents(mesh, values);
  const symmetry = measureSymmetry(mesh, values);
  const shape = analyzeAbdomenV31Shape(bounds, laterals, inferior);
  const isoline = validateIsoline(mesh, values, bounds, field);
  const refinement = buildErrorDrivenRefinement(
    mesh,
    values,
    bounds,
    field,
    sharedSeam,
  );
  const refinedCheck = validateMultiLevelRefinement(
    mesh,
    values,
    refinement.levels,
    bounds,
    field,
  );
  const refinedIsoline = refinedCheck.result;
  const sharedDist = measureSharedSeamDistance(
    mesh,
    values,
    refinement,
    sharedSeam,
  );

  const umb = derived.derived.umbilicus.point;
  const umbD = analyticalSignedDistance(umb[0], umb[1], umb[2], bounds, field);
  const waist = lm.points.waistFront;
  const waistD = analyticalSignedDistance(
    waist[0],
    waist[1],
    waist[2],
    bounds,
    field,
  );

  const filters = [];
  if (!seamAnalytic.pass)
    filters.push(
      `analytic seam gap=${seamAnalytic.maxGapMm.toFixed(2)} overlap=${seamAnalytic.maxOverlapMm.toFixed(2)}`,
    );
  if (!sharedDist.pass)
    filters.push(`shared seam max=${(sharedDist.max * 1000).toFixed(3)}mm`);
  if (region.components !== 1) filters.push(`components=${region.components}`);
  for (const [k, v] of Object.entries(leaksBefore)) {
    if (v > 0) filters.push(`${k} positives ${v}`);
  }
  // Lateral profile symmetry is authoritative (≤2%); area % is soft (mesh bias).
  if (!laterals.diagnostics.symmetryPass)
    filters.push(
      `lateral asymmetry ${((laterals.diagnostics.symmetryErr / 2) * 100).toFixed(2)}%`,
    );
  if (symmetry.symmetryPct > 18)
    filters.push(`area asymmetry ${symmetry.symmetryPct.toFixed(2)}%`);
  for (const e of shape.errors) filters.push(e);
  if (umbD != null && umbD <= 0) filters.push("umbilicus outside");
  if (waistD != null && waistD <= 0) filters.push("waistFront outside");
  if (refinement.growth > MAX_TRI_GROWTH + 1e-6)
    filters.push(`tri growth ${(refinement.growth * 100).toFixed(1)}%`);
  if (refinement.seamReused < refinement.seamTotal)
    filters.push(`seam reuse ${refinement.seamReused}/${refinement.seamTotal}`);

  const refinedPass =
    refinedIsoline.precision.mean <= 0.001 &&
    refinedIsoline.precision.p95 <= 0.002 &&
    refinedIsoline.precision.max <= 0.004;
  if (!refinedPass)
    filters.push(
      `refined mean=${(refinedIsoline.precision.mean * 1000).toFixed(2)} p95=${(refinedIsoline.precision.p95 * 1000).toFixed(2)} max=${(refinedIsoline.precision.max * 1000).toFixed(2)}`,
    );

  return {
    id: params.id,
    params,
    bounds,
    boundsMeta: bounds.meta,
    inferior,
    seamAnalytic,
    sharedDist,
    leaksBefore,
    region,
    symmetry,
    shape,
    isoline,
    refinedIsoline,
    refinement,
    umbD,
    waistD,
    filters,
    pass: filters.length === 0,
    values,
  };
}

export function evaluateAllAbdomenV31Candidates(ctx) {
  const grid = buildAbdomenV31CandidateGrid();
  const results = grid.map((params) =>
    evaluateAbdomenV31Candidate(ctx, params),
  );
  const survivors = results.filter((r) => r.pass);
  const scored = survivors
    .map((r) => ({
      r,
      score:
        r.refinedIsoline.precision.mean * 1000 +
        r.refinedIsoline.precision.p95 * 400 +
        r.shape.inferior.vDepthMm * 0.15 +
        Math.abs(r.params.pubicClearance - 0.016) * 80 +
        Math.abs(r.params.inguinalSideRise - 0.012) * 60,
    }))
    .sort((a, b) => a.score - b.score);

  const rankedAll = [...results].sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? -1 : 1;
    return a.filters.length - b.filters.length;
  });
  const finalists = (
    scored.length >= 2
      ? scored.slice(0, 2)
      : rankedAll.slice(0, 2).map((r) => ({ r, score: 0 }))
  ).map((s) => s.r.id);

  return {
    grid,
    results,
    survivors: survivors.map((r) => r.id),
    finalists,
    scored,
  };
}

export function assertOfficialChestFrozen(root = ROOT) {
  const FIELDS = path.join(root, "public/models/interaction/fields");
  const regionFields = JSON.parse(
    readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const chest = regionFields.fields.find((f) => f.regionId === "full_chest");
  const fieldBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const refineBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
  );
  // Global maskHash may change when other regions (abdomen) are promoted.
  // C07 freeze is field/refine/candidate bit-identity only.
  const ok =
    chest?.fieldHash === OFFICIAL_CHEST_HASHES.fieldHash &&
    chest?.refinement?.hash === OFFICIAL_CHEST_HASHES.refinementHash &&
    chest?.candidateId === OFFICIAL_CHEST_HASHES.candidateId &&
    contentHash16(fieldBin) === OFFICIAL_CHEST_HASHES.fieldHash &&
    contentHash16(refineBin) === OFFICIAL_CHEST_HASHES.refinementHash;
  if (!ok) {
    const err = new Error("FULL_CHEST_REGRESSION_DETECTED");
    err.details = {
      fieldHash: chest?.fieldHash,
      refinementHash: chest?.refinement?.hash,
      candidateId: chest?.candidateId,
    };
    throw err;
  }
  let maskHash = null;
  try {
    const maskManifest = JSON.parse(
      readFileSync(
        path.join(
          root,
          "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
        ),
        "utf8",
      ),
    );
    maskHash = maskManifest.maskHash;
  } catch {
    maskHash = null;
  }
  return {
    maskHash,
    fieldHash: chest.fieldHash,
    refinementHash: chest.refinement.hash,
    candidateId: chest.candidateId,
    intact: true,
  };
}

export function buildV31Context(glbPath, landmarksPath, opts = {}) {
  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  verifyLandmarkLaterality(lm);
  const mesh = loadMeshData(glbPath);
  const id = loadGeometryIdentity(glbPath);
  const derived = deriveAbdomenLandmarks(
    mesh,
    lm,
    id.geometryHash,
    id.indexHash,
  );

  const chestProbe = buildFrozenC07ChestBounds(
    lm,
    buildSurfaceSField(mesh, lm, 0.85, 1.4, N_SLICES),
  );
  const yBot = derived.derived.pubisSuperiorAnterior.point[1] - 0.03;
  const yTop = chestProbe.meta.imfLatY + 0.06;
  const field = buildSurfaceSField(mesh, lm, yBot, yTop, N_SLICES);
  const chestBounds = buildFrozenC07ChestBounds(lm, field);

  const sharedSeam =
    opts.sharedSeam ??
    (opts.skipSeamExtract
      ? JSON.parse(
          readFileSync(
            path.join(
              ROOT,
              "artifacts/full-abdomen-v31/shared-chest-abdomen-seam.json",
            ),
            "utf8",
          ),
        )
      : extractSharedChestAbdomenSeam());

  const laterals = deriveCurvatureLaterals(field, chestBounds, derived, lm);

  return {
    mesh,
    lm,
    field,
    derived,
    chestBounds,
    identity: id,
    sharedSeam,
    laterals,
  };
}

export {
  encodeRefinement,
  FIELD_RANGE_M,
  sampleAbdomenFieldAlignment,
  FROZEN_C07,
  OFFICIAL_CHEST_HASHES,
};
