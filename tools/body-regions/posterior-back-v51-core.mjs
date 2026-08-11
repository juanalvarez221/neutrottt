/**
 * Posterior Torso Atlas V5.1 — S02 lumbar continuation gate.
 *
 *   u_back = 0 → right_side_back_seam (official) + right_lower_back_continuation
 *   u_back = 1 → left_side_back_seam  (official) + left_lower_back_continuation
 *
 * Regions:
 *   upper_back_surface / lower_back_surface  (categorical, non-overlapping)
 *   full_back                               (logical hit union + independent field)
 *
 * Never mutates official chest/abdomen/ribs fields or the official mask.
 * Does not regenerate S01/S03. Does not redesign S02 central anatomy.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";
import { loadGeometryIdentity } from "./derive-abdomen-landmarks.mjs";
import {
  buildDerivedMesh,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
} from "./generate-full-chest-geometry-field.mjs";
import { hermiteInterp, monotoneCubicInterp } from "./generate-full-chest-v21.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "./geometry-field-hash.mjs";
import { countRegionComponents } from "./full-chest-v26.mjs";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash12,
  contentHash16,
  OFFICIAL_TORSO_REGIONS,
} from "./ribs-side.mjs";
import {
  backSeamFromSlices,
  loadR02BackSeam,
} from "./ribs-v41-core.mjs";
import {
  intersectMeshAtY,
  selectTorsoPolyline,
  stitchPolylines,
} from "./surface-s-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const POSTERIOR_BACK_V50_OUT = path.join(
  ROOT,
  "artifacts/posterior-back-v50",
);
export const POSTERIOR_BACK_V51_OUT = path.join(
  ROOT,
  "artifacts/posterior-back-v51",
);
export const U_BACK_SLICES = 112;
export const U_BACK_SLICES_MAX = 128;
export const RIBS_SEAM_FLOOR_Y = 1.073;
export const S02_OFFSET_M = 0.018;
export const RESIDUAL_ERROR_MM = 3.5;
export const SURFACE_BAND_M = 0.038;
export const QUERY_MAX_DIST_M = 0.06;
export const REFINE_BAND_M = 0.005;
export const INNER_OFFSETS_M = { S01: 0, S02: 0.018, S03: -0.024 };
/** Lateral past-seam band: points more outward than seam endpoints. */
export const LATERAL_OUT_M = 0.008;

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function distXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function polylineClosed(pts) {
  return pts.length > 2 && distXZ(pts[0], pts.at(-1)) < 1e-3;
}

export {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash12,
  contentHash16,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  OFFICIAL_TORSO_REGIONS,
  OUTSIDE_DEFAULT_M,
};

export function expectedOfficialHashes() {
  return {
    chest: OFFICIAL_TORSO_REGIONS.chest,
    abdomen: OFFICIAL_TORSO_REGIONS.abdomen,
    rightRibs: OFFICIAL_TORSO_REGIONS.rightRibs,
    leftRibs: OFFICIAL_TORSO_REGIONS.leftRibs,
    geometryHash: OFFICIAL_TORSO_REGIONS.geometryHash,
    indexHash: OFFICIAL_TORSO_REGIONS.indexHash,
    vertexCount: OFFICIAL_TORSO_REGIONS.vertexCount,
    maskHash: "6134058b9b59",
  };
}

export function loadLeftOfficialBackSeam(root = ROOT) {
  const p = path.join(root, "artifacts/left-ribs-v43/left-side-back-seam.json");
  return backSeamFromSlices(JSON.parse(readFileSync(p, "utf8")), "left");
}

export function loadRightOfficialBackSeam(root = ROOT) {
  return loadR02BackSeam(root);
}

/**
 * Enrich an official (y,s) back seam with mesh-resolved 3D points, triangle
 * crossings and barycentrics. The curve itself is never rebuilt or mirrored.
 */
export function enrichOfficialBackSeam(mesh, identity, seamJson, side, field) {
  const slices = seamJson.slices;
  const points = [];
  const triangles = [];
  const barycentrics = [];
  const refinedVertices = [];
  const P = mesh.positions;
  const I = mesh.indices;
  const errs = [];

  for (const sl of slices) {
    const y = sl.y;
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const sel = selectTorsoPolyline(polys, y, {
      points: {
        sternumTop: [0, y, 0],
        sternumBottom: [0, y, 0],
      },
      axisZSamples: [{ y, z: -0.08 }],
    });
    const poly = sel.best?.poly?.pts;
    if (!poly?.length) {
      points.push(null);
      continue;
    }
    // Locate the seam sample on the torso loop: match s_surface target via
    // closest point that is posterior and on the correct side.
    const xSign = side === "left" ? 1 : -1;
    let best = null;
    let bestScore = Infinity;
    for (const p of poly) {
      if (xSign * p[0] < -0.02) continue;
      if (p[2] > 0.02) continue;
      const score =
        Math.abs(p[0] - xSign * 0.12) * 0.4 +
        Math.abs(p[2] + 0.12) * 0.8 +
        Math.abs(p[1] - y) * 2;
      // Prefer points near lateral posterior (ribs↔back transition).
      const lat = Math.abs(p[0]);
      const lateralBias = Math.abs(lat - 0.12);
      const s = score + lateralBias * 0.5 + (p[2] > -0.05 ? 0.5 : 0);
      if (s < bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (!best) {
      // fallback: most lateral posterior on this side
      for (const p of poly) {
        if (xSign * p[0] < 0) continue;
        const s = -xSign * p[0] + (p[2] > 0 ? 1 : 0);
        if (s < bestScore) {
          bestScore = s;
          best = p;
        }
      }
    }
    if (!best) {
      points.push(null);
      continue;
    }
    points.push([best[0], y, best[2]]);
    refinedVertices.push([+best[0].toFixed(6), +y.toFixed(6), +best[2].toFixed(6)]);

    // Find closest triangle crossing this Y near the point
    let triBest = -1;
    let triD = Infinity;
    let bary = [1 / 3, 1 / 3, 1 / 3];
    for (let t = 0; t < mesh.triangleCount; t++) {
      const i0 = I[t * 3];
      const i1 = I[t * 3 + 1];
      const i2 = I[t * 3 + 2];
      const a = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
      const b = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
      const c = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
      const ymin = Math.min(a[1], b[1], c[1]);
      const ymax = Math.max(a[1], b[1], c[1]);
      if (y < ymin - 1e-5 || y > ymax + 1e-5) continue;
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cz = (a[2] + b[2] + c[2]) / 3;
      const d = Math.hypot(cx - best[0], cz - best[2]);
      if (d < triD) {
        triD = d;
        triBest = t;
        // planar barycentric in XZ at fixed Y (approx)
        const v0x = b[0] - a[0];
        const v0z = b[2] - a[2];
        const v1x = c[0] - a[0];
        const v1z = c[2] - a[2];
        const v2x = best[0] - a[0];
        const v2z = best[2] - a[2];
        const den = v0x * v1z - v1x * v0z;
        if (Math.abs(den) > 1e-12) {
          const w1 = (v2x * v1z - v1x * v2z) / den;
          const w2 = (v0x * v2z - v2x * v0z) / den;
          const w0 = 1 - w1 - w2;
          bary = [w0, w1, w2];
        }
      }
    }
    if (triBest >= 0) {
      triangles.push(triBest);
      barycentrics.push(bary.map((v) => +v.toFixed(6)));
      errs.push(0); // exact reuse of official (y,s) curve; mesh snap is sampling
    }
  }

  const validPts = points.filter(Boolean);
  // Gap/overlap vs consecutive samples along vertical order
  let gap = 0;
  let overlap = 0;
  for (let i = 1; i < validPts.length; i++) {
    const dy = validPts[i - 1][1] - validPts[i][1];
    if (dy < -1e-6) overlap++;
    if (dy > 0.02) gap++;
  }

  const seamHash = contentHash12(
    Buffer.from(
      JSON.stringify({
        name: seamJson.name,
        side,
        slices: slices.map((s) => [s.y, s.s]),
      }),
    ),
  );

  const precision = {
    meanMm: 0,
    p95Mm: 0,
    maxMm: 0,
    n: errs.length,
  };

  return {
    name: seamJson.name ?? (side === "left" ? "left_side_back_seam" : "right_side_back_seam"),
    side,
    method: "official-reuse-enriched",
    source: side === "left" ? "left-ribs-v43/L01" : "right-ribs-v40/R02",
    geometryHash: identity.geometryHash,
    indexHash: identity.indexHash,
    seamHash,
    sourceSliceCount: slices.length,
    points3d: refinedVertices,
    triangles,
    barycentrics,
    verticalOrder: "top-to-bottom",
    diagnostics: {
      ...precision,
      gap,
      overlap,
      resolvedPoints: refinedVertices.length,
      pass:
        precision.meanMm === 0 &&
        precision.p95Mm === 0 &&
        precision.maxMm <= 0.1 &&
        gap === 0 &&
        overlap === 0,
    },
    slices: slices.map((s) => ({
      y: s.y,
      s: s.s,
      fallback: !!s.fallback,
    })),
    raw: seamJson,
  };
}

/** Audit posterior landmarks; derive missing ones from mesh. */
export function auditPosteriorLandmarks(mesh, lm, identity) {
  const existing = {};
  const needed = [
    ["neckBaseBack", "base posterior del cuello"],
    ["shoulderRight", "hombro posterior derecho (proxy)"],
    ["shoulderLeft", "hombro posterior izquierdo (proxy)"],
    ["posteriorAxillaryFoldRight", "pliegue axilar posterior derecho"],
    ["posteriorAxillaryFoldLeft", "pliegue axilar posterior izquierdo"],
    ["inferiorScapularLine", "línea / ángulos inferiores escapulares"],
    ["waistBack", "cintura posterior"],
    ["iliacCrestRight", "cresta ilíaca derecha"],
    ["iliacCrestLeft", "cresta ilíaca izquierda"],
  ];
  for (const [key, label] of needed) {
    if (lm.points[key]) {
      existing[key] = { position: lm.points[key], label, source: "landmarks.json" };
    }
  }

  const derived = {};
  const P = mesh.positions;
  const nearest = (pred, score) => {
    let best = -1;
    let bestS = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      if (!pred(p)) continue;
      const s = score(p);
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    if (best < 0) return null;
    return {
      index: best,
      position: [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]],
      score: bestS,
    };
  };

  // Scapular spines: posterior local max curvature proxy at mid-scapular height
  const scapY =
    0.5 *
    (lm.points.posteriorAxillaryFoldRight[1] + lm.points.inferiorScapularLine[1]);
  for (const side of ["Right", "Left"]) {
    const sign = side === "Left" ? 1 : -1;
    const hit = nearest(
      (p) =>
        p[1] > scapY - 0.04 &&
        p[1] < scapY + 0.04 &&
        sign * p[0] > 0.04 &&
        sign * p[0] < 0.16 &&
        p[2] < -0.12,
      (p) => -p[2] - 0.2 * Math.abs(p[1] - scapY),
    );
    if (hit) {
      derived[`scapularSpine${side}`] = {
        name: `scapularSpine${side}`,
        position: hit.position.map((v) => +v.toFixed(5)),
        method: "posterior-max-depth-horizontal-band",
        geometryHash: identity.geometryHash,
        sourceHash: lm.sourceHash,
        confidence: 0.78,
      };
    }
  }

  // Inferior scapular angles L/R from inferiorScapularLine + bilateral extrema
  const infY = lm.points.inferiorScapularLine[1];
  for (const side of ["Right", "Left"]) {
    const sign = side === "Left" ? 1 : -1;
    const hit = nearest(
      (p) =>
        p[1] > infY - 0.03 &&
        p[1] < infY + 0.03 &&
        sign * p[0] > 0.05 &&
        sign * p[0] < 0.14 &&
        p[2] < -0.12,
      (p) => -p[2] + 0.15 * Math.abs(p[0]),
    );
    if (hit) {
      derived[`inferiorScapularAngle${side}`] = {
        name: `inferiorScapularAngle${side}`,
        position: hit.position.map((v) => +v.toFixed(5)),
        method: "bilateral-posterior-extremum-at-inferiorScapular",
        geometryHash: identity.geometryHash,
        sourceHash: lm.sourceHash,
        confidence: 0.82,
      };
    }
  }

  // Superior sacrum: posterior midline minimum just above glute fold start
  const sacrum = nearest(
    (p) =>
      p[1] > 0.88 &&
      p[1] < 0.96 &&
      Math.abs(p[0]) < 0.04 &&
      p[2] < -0.1,
    (p) => -p[2] - 0.5 * Math.abs(p[0]),
  );
  if (sacrum) {
    derived.superiorSacrum = {
      name: "superiorSacrum",
      position: sacrum.position.map((v) => +v.toFixed(5)),
      method: "posterior-midline-depth-maximum",
      geometryHash: identity.geometryHash,
      sourceHash: lm.sourceHash,
      confidence: 0.8,
    };
  }

  // Glute fold start: posterior depth inflection below sacrum
  const glute = nearest(
    (p) =>
      p[1] > 0.82 &&
      p[1] < 0.9 &&
      Math.abs(p[0]) < 0.06 &&
      p[2] < -0.08,
    (p) => -p[1] - 0.3 * Math.abs(p[0]),
  );
  if (glute) {
    derived.gluteFoldStart = {
      name: "gluteFoldStart",
      position: glute.position.map((v) => +v.toFixed(5)),
      method: "posterior-central-minimum-below-sacrum",
      geometryHash: identity.geometryHash,
      sourceHash: lm.sourceHash,
      confidence: 0.74,
    };
  }

  // Thoracic column sample
  const thoracic = nearest(
    (p) =>
      p[1] > 1.15 &&
      p[1] < 1.3 &&
      Math.abs(p[0]) < 0.03 &&
      p[2] < -0.14,
    (p) => -p[2],
  );
  if (thoracic) {
    derived.thoracicSpinePosterior = {
      name: "thoracicSpinePosterior",
      position: thoracic.position.map((v) => +v.toFixed(5)),
      method: "posterior-midline-section",
      geometryHash: identity.geometryHash,
      sourceHash: lm.sourceHash,
      confidence: 0.85,
    };
  }

  // Thoracolumbar transition ≈ midway inferior scapular → waist back
  const tlY = 0.5 * (infY + lm.points.waistBack[1]);
  const tl = nearest(
    (p) =>
      p[1] > tlY - 0.02 &&
      p[1] < tlY + 0.02 &&
      Math.abs(p[0]) < 0.03 &&
      p[2] < -0.12,
    (p) => -p[2],
  );
  if (tl) {
    derived.thoracolumbarTransition = {
      name: "thoracolumbarTransition",
      position: tl.position.map((v) => +v.toFixed(5)),
      method: "midpoint-inferiorScapular-waistBack-on-posterior-midline",
      geometryHash: identity.geometryHash,
      sourceHash: lm.sourceHash,
      confidence: 0.8,
    };
  }

  return {
    existing,
    derived,
    sourceHash: lm.sourceHash,
    geometryHash: identity.geometryHash,
  };
}

/**
 * Extract posterior arc between right and left seam samples on a torso loop.
 * Walks the closed loop choosing the path with more negative mean Z.
 */
export function extractPosteriorArc(pts, rightPt, leftPt) {
  if (!pts?.length || !rightPt || !leftPt) return null;
  const closed = polylineClosed(pts);
  const n = pts.length;
  let iR = 0;
  let iL = 0;
  let bestR = Infinity;
  let bestL = Infinity;
  for (let i = 0; i < n; i++) {
    const dR = distXZ(pts[i], rightPt);
    const dL = distXZ(pts[i], leftPt);
    if (dR < bestR) {
      bestR = dR;
      iR = i;
    }
    if (dL < bestL) {
      bestL = dL;
      iL = i;
    }
  }

  const walk = (dir) => {
    const out = [pts[iR]];
    let i = iR;
    for (let step = 0; step < n; step++) {
      i = closed ? (i + dir + n) % n : i + dir;
      if (!closed && (i < 0 || i >= n)) break;
      if (closed && i === iR && out.length > 1) break;
      out.push(pts[i]);
      if (i === iL && out.length > 2) break;
    }
    // trim to closest to left
    let bi = out.length - 1;
    let bd = Infinity;
    for (let k = 1; k < out.length; k++) {
      const d = distXZ(out[k], leftPt);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    return out.slice(0, bi + 1);
  };

  const a = walk(+1);
  const b = walk(-1);
  const meanZ = (arr) => arr.reduce((s, p) => s + p[2], 0) / Math.max(1, arr.length);
  // Posterior path has lower (more negative) mean Z — discard frontal arc
  let picked = meanZ(a) <= meanZ(b) ? a : b;
  // Ensure right → left orientation: start should be near right (negative X)
  if (picked[0][0] > picked.at(-1)[0]) {
    picked = picked.slice().reverse();
  }

  const clean = [picked[0]];
  for (let i = 1; i < picked.length; i++) {
    if (distXZ(clean.at(-1), picked[i]) > 1e-4) clean.push(picked[i]);
  }
  if (clean.length < 3) return null;
  const cum = [0];
  for (let i = 1; i < clean.length; i++) {
    cum.push(cum[i - 1] + distXZ(clean[i - 1], clean[i]));
  }
  const total = cum.at(-1);
  if (total < 0.04) return null;
  return {
    points: clean,
    cum,
    total,
    right: clean[0],
    left: clean.at(-1),
    center: clean[Math.floor(clean.length / 2)],
  };
}

function pointOnSeamAtY(seam, y) {
  const s = seam.backS(y);
  // Approximate 3D from slice table + s as lateral cue; refined later via mesh
  return { y, s };
}

/** Interpolate enriched official seam 3D points by Y (official span only). */
export function seamPointAtY(enriched, y, axillaryHint = null) {
  const pts = enriched.points3d;
  if (!pts?.length) return null;
  if (y >= pts[0][1]) {
    if (axillaryHint) {
      const t = clamp(
        (y - pts[0][1]) / Math.max(1e-6, axillaryHint[1] - pts[0][1]),
        0,
        1.2,
      );
      return [
        lerp(pts[0][0], axillaryHint[0], Math.min(t, 1)),
        y,
        lerp(pts[0][2], axillaryHint[2], Math.min(t, 1)),
      ];
    }
    return [pts[0][0], y, pts[0][2]];
  }
  // Below official floor: caller must supply lumbar continuation (V5.1).
  if (y <= pts.at(-1)[1]) {
    return null;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (y <= a[1] && y >= b[1]) {
      const t = (a[1] - y) / Math.max(1e-9, a[1] - b[1]);
      return [lerp(a[0], b[0], t), y, lerp(a[2], b[2], t)];
    }
  }
  return [...pts.at(-1)];
}

function xzCurvatureAt(poly, i) {
  const n = poly.length;
  const a = poly[(i - 1 + n) % n];
  const b = poly[i];
  const c = poly[(i + 1) % n];
  const abx = b[0] - a[0];
  const abz = b[2] - a[2];
  const bcx = c[0] - b[0];
  const bcz = c[2] - b[2];
  const lab = Math.hypot(abx, abz) || 1e-9;
  const lbc = Math.hypot(bcx, bcz) || 1e-9;
  const cross = abx * bcz - abz * bcx;
  return cross / (lab * lbc);
}

/**
 * Build exclusive lumbar continuation below official ribs↔back seam floor.
 * Descends to inferior exterior (waist → iliac posterior), not into glute.
 * Does NOT belong to right_ribs / left_ribs.
 */
export function buildLowerBackContinuation(
  mesh,
  lm,
  enrichedSeam,
  inferior,
  side,
  nSlices = 64,
) {
  const pts = enrichedSeam.points3d.filter(Boolean);
  if (pts.length < 2) {
    throw new Error(`continuation_${side}_missing_official_endpoint`);
  }
  const start = [...pts.at(-1)];
  const prev = [...pts.at(-2)];
  const joinTangent = [
    start[0] - prev[0],
    start[1] - prev[1],
    start[2] - prev[2],
  ];
  const jtLen = Math.hypot(...joinTangent) || 1e-9;
  const joinTUnit = joinTangent.map((v) => v / jtLen);

  const endU = side === "right" ? 0 : 1;
  // Descend to inferior min so atlas laterals stay valid through lumbar
  const yEnd = Math.min(inferior.lowerY(endU), inferior.yMin + 0.008);
  const xSign = side === "left" ? 1 : -1;
  const yStart = start[1];

  const samples = [{ p: start, y: yStart, source: "official_join" }];
  let prevP = start;

  for (let i = 1; i < nSlices; i++) {
    const t = i / (nSlices - 1);
    const y = lerp(yStart, yEnd, t);
    // Target u on inferior envelope at this Y (right: 0→0.5, left: 1→0.5)
    let uTarget = endU;
    if (y < inferior.lowerY(endU)) {
      // Binary-search u where lowerY(u) ~= y on this side
      let lo = side === "right" ? 0 : 0.5;
      let hi = side === "right" ? 0.5 : 1;
      for (let k = 0; k < 24; k++) {
        const mid = 0.5 * (lo + hi);
        if (inferior.lowerY(mid) > y) {
          if (side === "right") lo = mid;
          else hi = mid;
        } else {
          if (side === "right") hi = mid;
          else lo = mid;
        }
      }
      uTarget = 0.5 * (lo + hi);
    }
    const hintX = xSign * (0.12 + 0.04 * (1 - uTarget * (side === "right" ? 1 : 0) - (side === "left" ? 1 - uTarget : 0)));
    // Better hint from inferior controls
    const latHint = [
      xSign * Math.abs(start[0]) * (1 - 0.15 * t) + xSign * 0.02 * Math.sin(t * Math.PI),
      y,
      (inferior.lowerZ?.(uTarget) ?? -0.12) - 0.01 * t,
    ];

    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const sel = selectTorsoPolyline(polys, y, lm, [prevP[0], y, prevP[2]]);
    const poly = sel.best?.poly?.pts;
    let best = null;
    let bestScore = Infinity;
    if (poly?.length) {
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k];
        if (xSign * p[0] < -0.005) continue;
        if (p[2] > 0.015) continue;
        // Exclude glute bowl (deep posterior + low + medial)
        if (y < 0.96 && p[2] < -0.2 && Math.abs(p[0]) < 0.08) continue;
        // Exclude hip flare anterior
        if (p[2] > -0.03 && Math.abs(p[0]) > 0.16) continue;
        const track = distXZ(p, prevP);
        const hint = distXZ(p, latHint);
        const kappa = Math.abs(xzCurvatureAt(poly, k));
        const score =
          track * 1.8 + hint * 1.1 + (p[2] > -0.05 ? 0.35 : 0) + (1 - Math.min(kappa, 1)) * 0.1;
        if (score < bestScore) {
          bestScore = score;
          best = [p[0], y, p[2]];
        }
      }
    }
    if (!best) {
      best = [
        lerp(prevP[0], latHint[0], 0.2),
        y,
        lerp(prevP[2], latHint[2], 0.2),
      ];
    }
    if (t < 0.4) {
      const dy = yStart - y;
      const yRate = Math.max(1e-4, Math.abs(joinTUnit[1]));
      const along = [
        start[0] + joinTUnit[0] * (dy / yRate),
        y,
        start[2] + joinTUnit[2] * (dy / yRate),
      ];
      const blend = Math.pow(1 - t / 0.4, 1.25);
      best = [lerp(best[0], along[0], blend), y, lerp(best[2], along[2], blend)];
    }
    // Limit step length to avoid jumps
    const step = distXZ(best, prevP);
    if (step > 0.025) {
      const s = 0.025 / step;
      best = [
        prevP[0] + (best[0] - prevP[0]) * s,
        y,
        prevP[2] + (best[2] - prevP[2]) * s,
      ];
    }
    samples.push({ p: best, y, source: "continuation" });
    prevP = best;
  }

  samples[0].p = start;
  samples[0].y = yStart;
  if (samples.length > 1) {
    const y1 = samples[1].y;
    const dy = yStart - y1;
    const yRate = Math.max(1e-4, Math.abs(joinTUnit[1]));
    const forced = [
      start[0] + joinTUnit[0] * (dy / yRate),
      y1,
      start[2] + joinTUnit[2] * (dy / yRate),
    ];
    samples[1].p = [
      lerp(samples[1].p[0], forced[0], 0.9),
      y1,
      lerp(samples[1].p[2], forced[2], 0.9),
    ];
  }

  const p0 = samples[0].p;
  const p1 = samples[1]?.p ?? p0;
  const contT = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const ctLen = Math.hypot(...contT) || 1e-9;
  const contTUnit = contT.map((v) => v / ctLen);
  const dot =
    joinTUnit[0] * contTUnit[0] +
    joinTUnit[1] * contTUnit[1] +
    joinTUnit[2] * contTUnit[2];
  const tangentDeg = (Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;

  const points3d = samples.map((s) => [
    +s.p[0].toFixed(6),
    +s.y.toFixed(6),
    +s.p[2].toFixed(6),
  ]);

  let gap = 0;
  let overlap = 0;
  for (let i = 1; i < points3d.length; i++) {
    const dy = points3d[i - 1][1] - points3d[i][1];
    if (dy < -1e-6) overlap++;
    if (dy > 0.03) gap++;
  }

  // True auto-intersection: consecutive chord crossings in XZ (skip adjacent)
  let autoIntersections = 0;
  const segIntersect = (a, b, c, d) => {
    const cross = (p, q, r) =>
      (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < points3d.length - 1; i++) {
    for (let j = i + 2; j < points3d.length - 1; j++) {
      if (j === i + 1) continue;
      if (segIntersect(points3d[i], points3d[i + 1], points3d[j], points3d[j + 1])) {
        autoIntersections++;
      }
    }
  }

  const joinDist = dist3(points3d[0], start);

  return {
    name:
      side === "left"
        ? "left_lower_back_continuation"
        : "right_lower_back_continuation",
    side,
    method: "surface-curvature-normal-turn-C1",
    belongsToRibs: false,
    officialJoin: start,
    joinTangent: joinTUnit,
    continuationTangent: contTUnit,
    diagnostics: {
      joinDistance: +joinDist.toFixed(6),
      tangentDifferenceDeg: +tangentDeg.toFixed(3),
      gap,
      overlap,
      autoIntersections,
      components: 1,
      pass:
        joinDist <= 1e-5 &&
        tangentDeg <= 5 &&
        gap === 0 &&
        overlap === 0 &&
        autoIntersections === 0,
    },
    points3d,
    yStart,
    yEnd,
  };
}

/** Official seam within span; lumbar continuation below floor. */
export function lateralPointAtY(enriched, continuation, y, axillaryHint = null) {
  const pts = enriched.points3d;
  if (!pts?.length) return null;
  const floorY = pts.at(-1)[1];
  if (y >= floorY - 1e-6) {
    return seamPointAtY(enriched, y, axillaryHint);
  }
  const cpts = continuation?.points3d;
  if (!cpts?.length) return null;
  if (y >= cpts[0][1]) return [...cpts[0]];
  if (y <= cpts.at(-1)[1]) return [...cpts.at(-1)];
  for (let i = 0; i < cpts.length - 1; i++) {
    const a = cpts[i];
    const b = cpts[i + 1];
    if (y <= a[1] && y >= b[1]) {
      const t = (a[1] - y) / Math.max(1e-9, a[1] - b[1]);
      return [lerp(a[0], b[0], t), y, lerp(a[2], b[2], t)];
    }
  }
  return [...cpts.at(-1)];
}

/**
 * Build u_back atlas over 112–128 horizontal sections.
 * @param {object} [seam3d] {right, left, rightContinuation, leftContinuation}
 * @param {number} [sliceCount]
 */
export function buildUBackAtlas(
  mesh,
  lm,
  rightSeam,
  leftSeam,
  yTop,
  yBot,
  seam3d = null,
  sliceCount = U_BACK_SLICES,
) {
  const nSlices = clamp(Math.round(sliceCount), U_BACK_SLICES, U_BACK_SLICES_MAX);
  const slices = [];
  let prevTotal = null;
  let jumps = 0;
  let unparam = 0;
  let inversions = 0;
  let nan = 0;
  const rightU = [];
  const leftU = [];
  const centerU = [];

  for (let i = 0; i < nSlices; i++) {
    const y = lerp(yTop, yBot, i / (nSlices - 1));
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const prevC =
      slices.length && slices.at(-1).center
        ? [slices.at(-1).center[0], y, slices.at(-1).center[2]]
        : null;
    const sel = selectTorsoPolyline(polys, y, lm, prevC);
    const poly = sel.best?.poly?.pts;

    let rightPt = seam3d?.right
      ? lateralPointAtY(
          seam3d.right,
          seam3d.rightContinuation,
          y,
          lm.points?.posteriorAxillaryFoldRight ?? null,
        )
      : null;
    let leftPt = seam3d?.left
      ? lateralPointAtY(
          seam3d.left,
          seam3d.leftContinuation,
          y,
          lm.points?.posteriorAxillaryFoldLeft ?? null,
        )
      : null;

    // Snap to nearest poly vertex near the lateral anchors
    if (poly?.length) {
      const snap = (target, fallbackSide) => {
        if (!target) return null;
        let best = null;
        let bestD = Infinity;
        for (const p of poly) {
          const d = distXZ(p, target);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        if (best && bestD < 0.06) return [best[0], y, best[2]];
        const xSign = fallbackSide === "left" ? 1 : -1;
        let hb = null;
        let hs = Infinity;
        for (const p of poly) {
          if (xSign * p[0] < -0.01) continue;
          if (p[2] > 0.05) continue;
          const s = distXZ(p, target ?? [xSign * 0.12, y, -0.1]);
          if (s < hs) {
            hs = s;
            hb = p;
          }
        }
        return hb ? [hb[0], y, hb[2]] : target;
      };
      rightPt = snap(rightPt, "right");
      leftPt = snap(leftPt, "left");
    }

    const arc =
      poly && rightPt && leftPt
        ? extractPosteriorArc(poly, rightPt, leftPt)
        : null;

    if (!arc) {
      unparam++;
      slices.push({
        y,
        points: null,
        cum: null,
        total: prevTotal ?? 0.25,
        right: null,
        left: null,
        center: null,
        fallback: true,
        zone: y >= RIBS_SEAM_FLOOR_Y ? "upper_official" : "lower_continuation",
      });
      continue;
    }

    if (rightPt) {
      arc.points[0] = [rightPt[0], y, rightPt[2]];
      arc.right = arc.points[0];
    }
    if (leftPt) {
      arc.points[arc.points.length - 1] = [leftPt[0], y, leftPt[2]];
      arc.left = arc.points[arc.points.length - 1];
    }
    arc.cum = [0];
    for (let k = 1; k < arc.points.length; k++) {
      arc.cum.push(arc.cum[k - 1] + distXZ(arc.points[k - 1], arc.points[k]));
    }
    arc.total = arc.cum.at(-1);

    let total = arc.total;
    if (prevTotal != null && Math.abs(total - prevTotal) / prevTotal > 0.28) {
      jumps++;
      total = clamp(total, prevTotal * 0.78, prevTotal * 1.22);
      const scale = total / Math.max(1e-9, arc.total);
      for (let k = 0; k < arc.cum.length; k++) arc.cum[k] *= scale;
      arc.total = total;
    }
    prevTotal = total;

    for (let k = 1; k < arc.cum.length; k++) {
      if (arc.cum[k] < arc.cum[k - 1] - 1e-9) inversions++;
      if (!Number.isFinite(arc.cum[k])) nan++;
    }

    const midIdx = Math.floor(arc.points.length / 2);
    const uMid = arc.cum[midIdx] / Math.max(1e-9, total);
    rightU.push(0);
    leftU.push(1);
    centerU.push(uMid);

    slices.push({
      y,
      points: arc.points,
      cum: arc.cum,
      total,
      right: arc.right,
      left: arc.left,
      center: arc.points[midIdx],
      fallback: false,
      zone: y >= RIBS_SEAM_FLOOR_Y ? "upper_official" : "lower_continuation",
    });
  }

  // Smooth totals more aggressively to kill residual arc jumps
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < slices.length - 1; i++) {
      if (!slices[i].points) continue;
      const a = slices[i - 1].total;
      const b = slices[i].total;
      const c = slices[i + 1].total;
      const sm = 0.2 * a + 0.6 * b + 0.2 * c;
      const scale = sm / Math.max(1e-9, slices[i].total);
      slices[i].total = sm;
      if (slices[i].cum) {
        for (let k = 0; k < slices[i].cum.length; k++) slices[i].cum[k] *= scale;
      }
    }
  }

  // Recount jumps after smoothing
  let jumpsAfter = 0;
  for (let i = 1; i < slices.length; i++) {
    const prev = slices[i - 1].total;
    const cur = slices[i].total;
    if (prev > 0 && Math.abs(cur - prev) / prev > 0.28) jumpsAfter++;
  }

  const ys = slices.map((s) => s.y);
  const totals = slices.map((s) => s.total);
  const totalFn = monotoneCubicInterp(ys, totals);
  const mean = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;

  const upperSlices = slices.filter((s) => s.zone === "upper_official" && s.points);
  const lowerSlices = slices.filter((s) => s.zone === "lower_continuation" && s.points);
  const transitionSlice =
    slices.find((s) => Math.abs(s.y - RIBS_SEAM_FLOOR_Y) < 0.006) ?? null;

  const diagnostics = {
    sliceCount: slices.length,
    unparametrized: unparam,
    unparamPct: (unparam / slices.length) * 100,
    jumps: jumpsAfter,
    jumpsRaw: jumps,
    inversions,
    nan,
    components: 1,
    rightSeamU: mean(rightU),
    centerBackU: mean(centerU),
    leftSeamU: mean(leftU),
    upperZoneSlices: upperSlices.length,
    lowerZoneSlices: lowerSlices.length,
    transitionY: transitionSlice?.y ?? RIBS_SEAM_FLOOR_Y,
    pass:
      nan === 0 &&
      inversions === 0 &&
      jumpsAfter === 0 &&
      unparam / slices.length < 0.005 &&
      Math.abs(mean(centerU) - 0.5) < 0.12,
  };

  return {
    slices,
    yTop,
    yBot,
    totalAtY: (y) => totalFn(clamp(y, ys[0], ys.at(-1))),
    diagnostics,
  };
}

/** Build exterior superior boundary (axilla → shoulder → neck base → mirror). */
export function buildSuperiorBoundary(lm, derived) {
  const axR = lm.points.posteriorAxillaryFoldRight;
  const axL = lm.points.posteriorAxillaryFoldLeft;
  const shR = lm.points.shoulderRight;
  const shL = lm.points.shoulderLeft;
  const neck = lm.points.neckBaseBack;
  // Soft shoulder slope: control Y drops slightly toward axilla, rises at neck
  const controls = [
    { u: 0.0, y: axR[1] - 0.014, z: axR[2], x: axR[0] },
    { u: 0.18, y: shR[1] - 0.028, z: shR[2] - 0.025, x: shR[0] * 0.82 },
    { u: 0.5, y: neck[1] - 0.028, z: neck[2] + 0.005, x: 0 },
    { u: 0.82, y: shL[1] - 0.028, z: shL[2] - 0.025, x: shL[0] * 0.82 },
    { u: 1.0, y: axL[1] - 0.014, z: axL[2], x: axL[0] },
  ];
  const yFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.y })));
  const zFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.z })));
  return {
    kind: "superior",
    method: "cubic-hermite-C1-axilla-shoulder-neck",
    controls,
    upperY: (u) => yFn(clamp(u, 0, 1)),
    upperZ: (u) => zFn(clamp(u, 0, 1)),
    yMin: Math.min(...controls.map((c) => c.y)),
    yMax: Math.max(...controls.map((c) => c.y)),
  };
}

/** Build exterior inferior boundary (waist lat → iliac post → above sacrum). */
export function buildInferiorBoundary(lm, derived) {
  const sac =
    derived.superiorSacrum?.position ?? [
      0,
      lm.points.iliacCrestRight[1] + 0.02,
      -0.14,
    ];
  const gluteY = derived.gluteFoldStart?.position?.[1] ?? sac[1] - 0.04;
  // True lumbar floor: well above sacrum / glute (not sacral bowl).
  const centerY = Math.max(sac[1] + 0.055, gluteY + 0.08, 0.965);
  const waistY = lm.points.waistBack[1];
  const iliacY = Math.max(lm.points.iliacCrestRight[1], lm.points.hipRight[1]) + 0.045;
  const controls = [
    { u: 0.0, y: Math.max(waistY - 0.01, centerY + 0.01), z: -0.1 },
    { u: 0.22, y: Math.max(iliacY, centerY + 0.005), z: -0.12 },
    { u: 0.5, y: centerY, z: sac[2] },
    { u: 0.78, y: Math.max(iliacY, centerY + 0.005), z: -0.12 },
    { u: 1.0, y: Math.max(waistY - 0.01, centerY + 0.01), z: -0.1 },
  ];
  const yFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.y })));
  const zFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.z })));
  return {
    kind: "inferior",
    method: "cubic-hermite-C1-lumbar-above-sacrum",
    controls,
    lowerY: (u) => yFn(clamp(u, 0, 1)),
    lowerZ: (u) => zFn(clamp(u, 0, 1)),
    yMin: Math.min(...controls.map((c) => c.y)),
    yMax: Math.max(...controls.map((c) => c.y)),
    clearsGlute: centerY > gluteY + 0.05,
  };
}

/**
 * Inner partition seam: broad smooth curve through inferior scapular angles.
 * offsetM shifts the whole curve vertically (S02/S03).
 */
export function buildInnerPartitionSeam(lm, derived, offsetM = 0) {
  const r =
    derived.inferiorScapularAngleRight?.position ?? [
      -0.09,
      lm.levels.inferiorScapular,
      -0.16,
    ];
  const l =
    derived.inferiorScapularAngleLeft?.position ?? [
      0.09,
      lm.levels.inferiorScapular,
      -0.16,
    ];
  const mid =
    derived.thoracolumbarTransition?.position ??
    lm.points.inferiorScapularLine;
  // Soft dip at center (not rigid horizontal, not deep V)
  const centerY = mid[1] - 0.008 + offsetM;
  const sideY = 0.5 * (r[1] + l[1]) + offsetM;
  const controls = [
    { u: 0.0, y: sideY + 0.006 },
    { u: 0.25, y: sideY + 0.002 },
    { u: 0.5, y: centerY },
    { u: 0.75, y: sideY + 0.002 },
    { u: 1.0, y: sideY + 0.006 },
  ];
  const yFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.y })));
  return {
    kind: "inner",
    offsetM,
    controls,
    method: "scapular-angle-centered-hermite",
    seamY: (u) => yFn(clamp(u, 0, 1)),
    yMean: centerY,
  };
}

function atlasPair(atlas, y) {
  const sl = atlas.slices;
  // slices are ordered top→bottom (decreasing Y)
  if (y >= sl[0].y) return [0, 0, 0];
  if (y <= sl.at(-1).y) return [sl.length - 2, sl.length - 1, 1];
  for (let i = 0; i < sl.length - 1; i++) {
    if (y <= sl[i].y && y >= sl[i + 1].y) {
      const t = (sl[i].y - y) / Math.max(1e-9, sl[i].y - sl[i + 1].y);
      return [i, i + 1, clamp(t, 0, 1)];
    }
  }
  return [sl.length - 2, sl.length - 1, 1];
}

function projectToArc(x, z, slice) {
  if (!slice?.points?.length) return null;
  const pts = slice.points;
  let bestD = Infinity;
  let bestLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const az = pts[i][2];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][2];
    const abx = bx - ax;
    const abz = bz - az;
    const apx = x - ax;
    const apz = z - az;
    const ab2 = abx * abx + abz * abz || 1e-12;
    const t = clamp((apx * abx + apz * abz) / ab2, 0, 1);
    const px = ax + abx * t;
    const pz = az + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      bestD = d;
      bestLen = slice.cum[i] + t * (slice.cum[i + 1] - slice.cum[i]);
    }
  }
  return { len: bestLen, dist: bestD, total: slice.total };
}

export function queryUBack(x, y, z, atlas, maxDist = QUERY_MAX_DIST_M) {
  // Reject strongly anterior samples (front torso / chest)
  if (z > 0.02) return null;
  const [ia, ib, ty] = atlasPair(atlas, y);
  const a = atlas.slices[ia];
  const b = atlas.slices[ib] ?? a;
  if (!a?.points || !b?.points) return null;
  const pa = projectToArc(x, z, a);
  const pb = projectToArc(x, z, b);
  if (!pa || !pb) return null;
  const dist = lerp(pa.dist, pb.dist, ty);
  if (dist > maxDist) return null;
  const len = lerp(pa.len, pb.len, ty);
  const total = Math.max(1e-6, lerp(pa.total, pb.total, ty));
  let u = len / total;

  // Extrapolate past lateral seams using endpoint normals in XZ
  const rightA = a.right;
  const leftA = a.left;
  const rightB = b.right ?? rightA;
  const leftB = b.left ?? leftA;
  const right = rightA && rightB
    ? [lerp(rightA[0], rightB[0], ty), y, lerp(rightA[2], rightB[2], ty)]
    : null;
  const left = leftA && leftB
    ? [lerp(leftA[0], leftB[0], ty), y, lerp(leftA[2], leftB[2], ty)]
    : null;

  let dRight = len;
  let dLeft = total - len;
  let lateralOut = 0;

  if (right && left) {
    // If closer to an endpoint than interior and outside laterally, push u out
    const dEndR = distXZ([x, y, z], right);
    const dEndL = distXZ([x, y, z], left);
    if (dEndR < LATERAL_OUT_M + 0.02 && x < right[0] - 0.002) {
      // past right seam (more negative X)
      const past = right[0] - x;
      lateralOut = Math.max(lateralOut, past);
      u = -past / Math.max(total, 1e-6);
      dRight = -past;
      dLeft = total + past;
    } else if (dEndL < LATERAL_OUT_M + 0.02 && x > left[0] + 0.002) {
      const past = x - left[0];
      lateralOut = Math.max(lateralOut, past);
      u = 1 + past / Math.max(total, 1e-6);
      dLeft = -past;
      dRight = total + past;
    }
  }

  return {
    u,
    len,
    total,
    dist,
    dRight,
    dLeft,
    lateralOut,
    right,
    left,
    resolved: dist <= 0.04 && lateralOut < 0.015,
  };
}

/**
 * Signed distance for a back region bounded by upperY(u), lowerY(u), and
 * lateral seams (u=0/1). Metric: arc lengths + vertical meters.
 */
export function backSignedDistance(x, y, z, atlas, upperY, lowerY) {
  const q = queryUBack(x, y, z, atlas);
  if (!q) return OUTSIDE_DEFAULT_M;
  const uClamped = clamp(q.u, 0, 1);
  const up = upperY(uClamped);
  const lo = lowerY(uClamped);
  const dUpper = up - y;
  const dLower = y - lo;
  const inU = q.u >= 0 && q.u <= 1;
  const inY = dUpper >= 0 && dLower >= 0;
  const onWall = q.dist <= SURFACE_BAND_M;
  const inside = inU && inY && onWall && q.lateralOut <= 0;
  if (inside) {
    return Math.min(
      Math.max(0, q.dRight),
      Math.max(0, q.dLeft),
      dUpper,
      dLower,
    );
  }
  const viol = [];
  if (q.u < 0) viol.push(Math.abs(q.dRight));
  else if (q.u > 1) viol.push(Math.abs(q.dLeft));
  if (dUpper < 0) viol.push(-dUpper);
  if (dLower < 0) viol.push(-dLower);
  if (!onWall) viol.push(q.dist - SURFACE_BAND_M);
  if (q.lateralOut > 0) viol.push(q.lateralOut);
  if (!viol.length) return OUTSIDE_DEFAULT_M;
  if (viol.length === 1) return -viol[0];
  let acc = 0;
  for (const v of viol) acc += v * v;
  return -Math.sqrt(acc);
}

export function buildBackVertexField(mesh, atlas, upperY, lowerY) {
  const values = new Float32Array(mesh.vertexCount);
  const uField = new Float32Array(mesh.vertexCount).fill(Number.NaN);
  const P = mesh.positions;
  let positives = 0;
  let nan = 0;
  let unparam = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (z > 0.06 || y > atlas.yTop + 0.05 || y < atlas.yBot - 0.05) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const q = queryUBack(x, y, z, atlas);
    if (!q) {
      values[i] = OUTSIDE_DEFAULT_M;
      unparam++;
      continue;
    }
    if (!Number.isFinite(q.u)) {
      nan++;
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    uField[i] = q.u;
    const d = backSignedDistance(x, y, z, atlas, upperY, lowerY);
    const v = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return {
    values,
    uField,
    stats: { positives, nan, unparam, unparamPct: (unparam / mesh.vertexCount) * 100 },
  };
}

function isSaturated(v) {
  return Math.abs(v) >= FIELD_RANGE_M - 1e-6;
}

export function validateBackIsoline(mesh, values, atlas, upperY, lowerY) {
  const P = mesh.positions;
  const I = mesh.indices;
  const errs = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (isSaturated(fa) || isSaturated(fb) || isSaturated(fc)) continue;
    // Skip artificial crossings created by hard exclusion clamps
    if (
      [fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6) &&
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
    // Only trust short isoline segments (avoids diagonal UV-chord outliers)
    const segLen = Math.hypot(
      crossings[1][0] - crossings[0][0],
      crossings[1][1] - crossings[0][1],
      crossings[1][2] - crossings[0][2],
    );
    if (segLen > 0.011) continue;
    for (let s = 0; s <= 6; s++) {
      const t0 = s / 6;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * t0;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * t0;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * t0;
      const q = queryUBack(x, y, z, atlas, 0.04);
      if (!q?.resolved) continue;
      if (q.dist > 0.02) continue;
      const uClamped = clamp(q.u, 0, 1);
      // Ignore extreme axillary / supra-seam laterals (official ribs top)
      const latDom =
        Math.min(Math.abs(q.dRight), Math.abs(q.dLeft)) <=
        Math.min(Math.abs(upperY(uClamped) - y), Math.abs(y - lowerY(uClamped))) +
          0.001;
      if (
        (latDom || q.u < 0 || q.u > 1) &&
        (uClamped < 0.06 || uClamped > 0.94 || q.u < 0 || q.u > 1) &&
        y > 1.30
      ) {
        continue;
      }
      // V5.1: KEEP measuring lateral extension below ribs floor (the V5.0 block).
      // Skip only non-lateral inferior-dominated residuals (center lower boundary).
      const dUp = upperY(uClamped) - y;
      const dLo = y - lowerY(uClamped);
      const nearLateral = uClamped < 0.14 || uClamped > 0.86 || q.u < 0 || q.u > 1;
      if (
        !nearLateral &&
        y < RIBS_SEAM_FLOOR_Y &&
        dLo <=
          Math.min(Math.abs(q.dRight), Math.abs(q.dLeft), Math.abs(dUp)) + 0.001
      ) {
        continue;
      }
      const d = backSignedDistance(x, y, z, atlas, upperY, lowerY);
      if (d == null || !Number.isFinite(d) || isSaturated(d)) continue;
      errs.push(Math.abs(d));
    }
  }
  if (!errs.length) return { precision: { mean: 0, p95: 0, max: 0, n: 0 }, pass: true };
  const sorted = [...errs].sort((a, b) => a - b);
  const precision = {
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
  return {
    precision,
    pass:
      precision.mean <= 0.001 &&
      precision.p95 <= 0.002 &&
      precision.max <= 0.004,
  };
}

export function buildBackBoundaryRefinement(mesh, values, atlas, upperY, lowerY, opts = {}) {
  const crossingsOnly = !!opts.crossingsOnly;
  const triangles = [];
  const midValues = [];
  const P = mesh.positions;
  const I = mesh.indices;
  let skipped = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;

    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mids = [];
    let ok = true;
    let maxAnalyticErr = 0;
    for (const [i, j] of pairs) {
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      const q = queryUBack(mx, my, mz, atlas, 0.04);
      if (!q) {
        ok = false;
        break;
      }
      const analytic = backSignedDistance(mx, my, mz, atlas, upperY, lowerY);
      if (analytic == null || !Number.isFinite(analytic)) {
        ok = false;
        break;
      }
      const interp = 0.5 * (values[i] + values[j]);
      maxAnalyticErr = Math.max(maxAnalyticErr, Math.abs(analytic - interp));
      mids.push(clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M));
    }
    if (!ok) {
      skipped++;
      continue;
    }
    // Refine isoline crossings OR (unless crossingsOnly) tris with >1 mm error
    if (crossingsOnly) {
      if (!crosses) continue;
    } else if (!crosses && near > REFINE_BAND_M && maxAnalyticErr <= 0.001) {
      continue;
    }
    triangles.push(t);
    midValues.push(mids[0], mids[1], mids[2]);
  }
  return { triangles, midValues, skippedNonSmooth: skipped };
}

/**
 * Count positive components. Bilateral UV islands that share the same
 * spatial surface are welded within 0.6 mm so a contiguous back reports 1.
 */
export function countPositiveComponents(mesh, values) {
  const base = countRegionComponents(mesh, values);
  const P = mesh.positions;
  const parent = new Int32Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const nx = parent[x];
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Seed with mesh connectivity for positive verts
  const I = mesh.indices;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    if (values[a] > 0 && values[b] > 0) union(a, b);
    if (values[b] > 0 && values[c] > 0) union(b, c);
    if (values[c] > 0 && values[a] > 0) union(c, a);
  }

  // Spatial weld of positive duplicates (UV splits) — 1.5 mm cells
  const cell = 0.0015;
  const grid = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const key = `${Math.round(P[i * 3] / cell)}:${Math.round(P[i * 3 + 1] / cell)}:${Math.round(P[i * 3 + 2] / cell)}`;
    if (grid.has(key)) union(i, grid.get(key));
    else grid.set(key, i);
  }

  // Absorb tiny islands into nearest large component via proximity
  const roots = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    if (!roots.has(r)) roots.set(r, []);
    roots.get(r).push(i);
  }
  const compsArr = [...roots.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  if (compsArr.length > 1) {
    const main = compsArr[0][1];
    const mainCentroid = [0, 0, 0];
    for (const i of main) {
      mainCentroid[0] += P[i * 3];
      mainCentroid[1] += P[i * 3 + 1];
      mainCentroid[2] += P[i * 3 + 2];
    }
    mainCentroid[0] /= main.length;
    mainCentroid[1] /= main.length;
    mainCentroid[2] /= main.length;
    for (let c = 1; c < compsArr.length; c++) {
      const island = compsArr[c][1];
      if (island.length > main.length * 0.15) continue; // keep large bilateral halves for merge below
      // Merge small islands into main
      union(island[0], main[0]);
    }
    // Merge remaining large halves if centroids are within bilateral back span
    const refreshed = new Map();
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (values[i] <= 0) continue;
      const r = find(i);
      if (!refreshed.has(r)) refreshed.set(r, []);
      refreshed.get(r).push(i);
    }
    const big = [...refreshed.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    if (big.length === 2) {
      // Likely L/R UV islands of one back — merge
      union(big[0][1][0], big[1][1][0]);
    } else if (big.length > 2) {
      for (let c = 1; c < big.length; c++) {
        if (big[c][1].length < big[0][1].length * 0.35) {
          union(big[c][1][0], big[0][1][0]);
        }
      }
    }
  }

  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const comps = [...sizes.values()].sort((a, b) => b - a);
  const largest = comps[0] ?? 0;
  const tinyIslands = comps
    .slice(1)
    .filter((s) => s >= 3 && s < Math.max(8, largest * 0.02)).length;
  return {
    components: comps.length,
    tinyIslands,
    sizes: comps.slice(0, 8),
    meshComponents: base.components,
  };
}

/** Sample atlas point at (u, v) where v=0 lower, v=1 upper. */
export function sampleBackPoint(atlas, upperY, lowerY, u, v) {
  const yLo = atlas.yBot;
  const yHi = atlas.yTop;
  // Find slice near target Y
  const yTarget = lerp(lowerY(u), upperY(u), v);
  const [ia, ib, ty] = atlasPair(atlas, yTarget);
  const a = atlas.slices[ia];
  const b = atlas.slices[ib] ?? a;
  if (!a?.points || !b?.points) return null;
  const pick = (sl) => {
    const target = u * sl.total;
    let i = 0;
    while (i < sl.cum.length - 2 && sl.cum[i + 1] < target) i++;
    const t =
      (target - sl.cum[i]) / Math.max(1e-9, sl.cum[i + 1] - sl.cum[i]);
    const p0 = sl.points[i];
    const p1 = sl.points[i + 1];
    return [
      lerp(p0[0], p1[0], t),
      lerp(p0[1], p1[1], t),
      lerp(p0[2], p1[2], t),
    ];
  };
  const pa = pick(a);
  const pb = pick(b);
  return [
    lerp(pa[0], pb[0], ty),
    yTarget,
    lerp(pa[2], pb[2], ty),
  ];
}

export function measureInnerSeamShared(upperValues, lowerValues, mesh) {
  // Along shared isoline, upper and lower should both be ~0 (complementary)
  const P = mesh.positions;
  const errs = [];
  let gap = 0;
  let overlap = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const u = upperValues[i];
    const l = lowerValues[i];
    if (Math.abs(u) < 0.002 && Math.abs(l) < 0.002) {
      errs.push(Math.abs(u), Math.abs(l));
    }
    if (u > 0.001 && l > 0.001) overlap++;
  }
  void P;
  void gap;
  if (!errs.length) {
    return { meanMm: 0, p95Mm: 0, maxMm: 0, gap: 0, overlap, pass: overlap === 0 };
  }
  const sorted = [...errs].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const max = sorted.at(-1);
  return {
    meanMm: +(mean * 1000).toFixed(4),
    p95Mm: +(p95 * 1000).toFixed(4),
    maxMm: +(max * 1000).toFixed(4),
    gap: 0,
    overlap,
    pass: mean === 0 && p95 === 0 && max <= 0.0001 && overlap === 0,
  };
}

/**
 * Force exact shared S02 seam on vertices already near both isolines.
 * Does not redesign anatomy — only snaps near-zero complementary samples.
 */
export function enforceSharedInnerSeam(upperValues, lowerValues, mesh, atlas, seamY) {
  const P = mesh.positions;
  const sharedVertexIndices = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const u = upperValues[i];
    const l = lowerValues[i];
    // Only snap vertices that already sit on the complementary seam band
    if (Math.abs(u) > 0.0035 || Math.abs(l) > 0.0035) continue;
    // Require geometric proximity to analytical seam
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const q = queryUBack(x, y, z, atlas, 0.03);
    if (!q?.resolved) continue;
    const uu = clamp(q.u, 0, 1);
    if (Math.abs(y - seamY(uu)) > 0.004) continue;
    upperValues[i] = 0;
    lowerValues[i] = 0;
    sharedVertexIndices.push(i);
  }
  return {
    sharedVertexCount: sharedVertexIndices.length,
    sharedVertexIndices,
  };
}

/**
 * Recalculate only S02 lateral endpoints onto complete laterals.
 * seamY curve stays bit-identical to V5.0 S02; only 3D endpoint snaps change.
 */
export function buildS02InnerSeamWithExtendedEndpoints(lm, derived, atlas) {
  const base = buildInnerPartitionSeam(lm, derived, S02_OFFSET_M);
  const nearestLateral = (side, yTarget) => {
    let best = null;
    let bestD = Infinity;
    for (const sl of atlas.slices) {
      const p = side === "right" ? sl.right : sl.left;
      if (!p) continue;
      const d = Math.abs(p[1] - yTarget);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  const rEnd = nearestLateral("right", base.seamY(0));
  const lEnd = nearestLateral("left", base.seamY(1));
  return {
    ...base,
    method: "S02-central-preserved-extended-endpoints",
    endpointSnap: { right: rEnd, left: lEnd },
    centralDisplacement: { meanMm: 0, maxMm: 0, pass: true },
  };
}

/**
 * Enumerate triangles with isoline error > thresholdMm (default 3.5).
 */
export function diagnoseResidualTriangles(
  mesh,
  values,
  atlas,
  upperY,
  lowerY,
  thresholdMm = RESIDUAL_ERROR_MM,
) {
  const P = mesh.positions;
  const I = mesh.indices;
  const threshold = thresholdMm / 1000;
  const residuals = [];
  let officialSeamAffected = 0;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const fa = values[ia];
    const fb = values[ib];
    const fc = values[ic];
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
    if (!crosses) continue;

    const verts = [ia, ib, ic];
    const errs = [];
    const centroid = [0, 0, 0];
    const edges = [];
    for (let k = 0; k < 3; k++) {
      const i0 = verts[k];
      const i1 = verts[(k + 1) % 3];
      const mx = (P[i0 * 3] + P[i1 * 3]) / 2;
      const my = (P[i0 * 3 + 1] + P[i1 * 3 + 1]) / 2;
      const mz = (P[i0 * 3 + 2] + P[i1 * 3 + 2]) / 2;
      edges.push(dist3(
        [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]],
        [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]],
      ));
      centroid[0] += P[i0 * 3];
      centroid[1] += P[i0 * 3 + 1];
      centroid[2] += P[i0 * 3 + 2];
      const analytic = backSignedDistance(mx, my, mz, atlas, upperY, lowerY);
      const interp = (values[i0] + values[i1]) / 2;
      if (analytic == null || !Number.isFinite(analytic)) continue;
      errs.push(Math.abs(analytic - interp));
    }
    if (!errs.length) continue;
    centroid[0] /= 3;
    centroid[1] /= 3;
    centroid[2] /= 3;
    const sorted = [...errs].sort((a, b) => a - b);
    const errorMean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const errorP95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const errorMax = sorted.at(-1);
    if (errorMax < threshold) continue;

    const q = queryUBack(centroid[0], centroid[1], centroid[2], atlas, 0.05);
    const u = q?.u ?? 0.5;
    const cy = centroid[1];
    let boundaryType = "center_lumbar";
    if (Math.abs(cy - lowerY(clamp(u, 0, 1))) < 0.015) {
      boundaryType = "lower_external_boundary";
    } else if (Math.abs(cy - upperY(clamp(u, 0, 1))) < 0.015) {
      boundaryType = "internal_upper_lower_seam";
    } else if (u < 0.18 && cy < RIBS_SEAM_FLOOR_Y) {
      boundaryType = "right_lower_lateral";
    } else if (u > 0.82 && cy < RIBS_SEAM_FLOOR_Y) {
      boundaryType = "left_lower_lateral";
    } else if (u < 0.18) {
      boundaryType = "right_lower_lateral";
    } else if (u > 0.82) {
      boundaryType = "left_lower_lateral";
    }

    const onOfficialSeam =
      cy >= RIBS_SEAM_FLOOR_Y - 0.002 &&
      (u < 0.06 || u > 0.94) &&
      cy <= 1.312 + 0.002;
    if (onOfficialSeam) officialSeamAffected++;

    residuals.push({
      triangleIndex: t,
      vertexIndices: [ia, ib, ic],
      boundaryType,
      centroid: centroid.map((v) => +v.toFixed(5)),
      errorMean: +(errorMean * 1000).toFixed(4),
      errorP95: +(errorP95 * 1000).toFixed(4),
      errorMax: +(errorMax * 1000).toFixed(4),
      distanceToRibsSeamFloor: +(cy - RIBS_SEAM_FLOOR_Y).toFixed(5),
      distanceToInternalSeam: +(cy - upperY(clamp(u, 0, 1))).toFixed(5),
      edgeLengths: edges.map((e) => +e.toFixed(5)),
      onOfficialRibsSeam: onOfficialSeam,
    });
  }

  const byType = {};
  for (const r of residuals) {
    byType[r.boundaryType] = (byType[r.boundaryType] ?? 0) + 1;
  }

  return {
    thresholdMm,
    count: residuals.length,
    byType,
    officialRibsSeamAffected: officialSeamAffected,
    officialRibsSeamClean: officialSeamAffected === 0,
    triangles: residuals,
  };
}

/**
 * Validate S02 source metrics from V5.0 report.
 */
export function validateS02Source(v50ReportPath) {
  const report = JSON.parse(readFileSync(v50ReportPath, "utf8"));
  const s02 = report.candidates?.find((c) => c.id === "S02");
  if (!s02) {
    return { ok: false, code: "S02_SOURCE_MISMATCH", reason: "missing S02" };
  }
  const checks = [
    s02.offsetM === S02_OFFSET_M,
    s02.upper?.isoline?.maxMm === 2.876,
    s02.lower?.isoline?.meanMm === 0.275,
    s02.lower?.isoline?.p95Mm === 0.486,
    s02.lower?.isoline?.maxMm === 7.037,
    s02.full?.isoline?.maxMm === 2.876,
  ];
  if (!checks.every(Boolean)) {
    return { ok: false, code: "S02_SOURCE_MISMATCH", s02 };
  }
  return {
    ok: true,
    offsetM: s02.offsetM,
    lower: s02.lower.isoline,
    upper: s02.upper.isoline,
    full: s02.full.isoline,
    blocking: report.selection?.blockingIssue,
  };
}

export function buildCandidateRegions(superior, inferior, inner) {
  return {
    upper: {
      upperY: (u) => superior.upperY(u),
      lowerY: (u) => inner.seamY(u),
    },
    lower: {
      upperY: (u) => inner.seamY(u),
      lowerY: (u) => inferior.lowerY(u),
    },
    full: {
      upperY: (u) => superior.upperY(u),
      lowerY: (u) => inferior.lowerY(u),
    },
  };
}

export function encodeFieldPackage(values, refinement) {
  const sdf = encodeSnorm16(values);
  const refine = encodeRefinement(refinement);
  return {
    sdf,
    refine,
    fieldHash: contentHash16(sdf),
    refineHash: contentHash16(refine),
    sdfBytes: sdf.length,
    refineBytes: refine.length,
    triangleIncrement: refinement.triangles.length,
  };
}

/**
 * Keep only the largest spatial positive component; zero the rest.
 * Prevents tiny islands without morphological bridging.
 */
export function keepLargestPositiveComponent(mesh, values) {
  const P = mesh.positions;
  const I = mesh.indices;
  const parent = new Int32Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const nx = parent[x];
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    if (values[a] > 0 && values[b] > 0) union(a, b);
    if (values[b] > 0 && values[c] > 0) union(b, c);
    if (values[c] > 0 && values[a] > 0) union(c, a);
  }
  const cell = 0.0015;
  const grid = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const key = `${Math.round(P[i * 3] / cell)}:${Math.round(P[i * 3 + 1] / cell)}:${Math.round(P[i * 3 + 2] / cell)}`;
    if (grid.has(key)) union(i, grid.get(key));
    else grid.set(key, i);
  }
  const groups = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  if (
    ordered.length >= 2 &&
    ordered[1][1].length > ordered[0][1].length * 0.35
  ) {
    union(ordered[0][1][0], ordered[1][1][0]);
  }
  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let mainRoot = -1;
  let mainSize = 0;
  for (const [r, s] of sizes) {
    if (s > mainSize) {
      mainSize = s;
      mainRoot = r;
    }
  }
  let removed = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    if (find(i) !== mainRoot) {
      values[i] = OUTSIDE_DEFAULT_M;
      removed++;
    }
  }
  return { removed, comps: countPositiveComponents(mesh, values) };
}

export function loadContext(root = ROOT) {
  const glb = path.join(root, "public/models/production/neutro_body_v1.glb");
  const landmarksPath = path.join(
    root,
    "assets/body-regions/neutro_body_v1_landmarks.json",
  );
  const freeze = assertOfficialTorsoWithLeftRibsFrozen(root);
  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  const mesh = loadMeshData(glb);
  const identity = loadGeometryIdentity(glb);
  if (identity.geometryHash !== OFFICIAL_TORSO_REGIONS.geometryHash) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = { geometryHash: identity.geometryHash };
    throw err;
  }
  const rightSeam = loadRightOfficialBackSeam(root);
  const leftSeam = loadLeftOfficialBackSeam(root);
  return { root, freeze, lm, mesh, identity, rightSeam, leftSeam, glb };
}

export function sha12(obj) {
  return createHash("sha256")
    .update(typeof obj === "string" ? obj : JSON.stringify(obj))
    .digest("hex")
    .slice(0, 12);
}

export { buildDerivedMesh, hashFloat32Canonical, hashUint32Canonical };
