/**
 * Full Chest Anatomical Refinement V2.6 — controlled candidate engine.
 *
 * Sweeps only three anatomical knobs on top of the frozen V2.5 Geometry
 * Distance Field pipeline (boundaries → per-vertex signed distance → local
 * refinement). s_surface, laterality, exclusions, shader, encoding and cache
 * are all inherited unchanged. Nothing here rewrites the official mask, the
 * official sidecar, or the GLB.
 */
import { readFileSync } from "node:fs";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  buildBoundaries,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSSurface,
  N_SLICES,
} from "./surface-s-field.mjs";
import { metersPerSAtY, analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import {
  buildBoundaryRefinement,
  buildExclusionSets,
  buildVertexField,
  countPositives,
  enforceExclusions,
  FIELD_RANGE_M,
  validateIsoline,
  validateRefinedIsoline,
} from "./generate-full-chest-geometry-field.mjs";

/** The 8 controlled candidates (§7). Lateral is frozen at V2.2 (inset 0). */
export function buildCandidateGrid() {
  const infra = [0.01, 0.014];
  const rise = [0, 0.003];
  const transition = [0, 0.002];
  const candidates = [];
  let n = 1;
  for (const infraclavicularOffset of infra) {
    for (const upperCenterRise of rise) {
      for (const inferiorCenterTransition of transition) {
        candidates.push({
          id: `C${String(n).padStart(2, "0")}`,
          infraclavicularOffset,
          upperCenterRise,
          inferiorCenterTransition,
          lateralInsetMeters: 0,
        });
        n++;
      }
    }
  }
  return candidates;
}

function triangleArea(p, a, b, c) {
  const abx = p[b * 3] - p[a * 3];
  const aby = p[b * 3 + 1] - p[a * 3 + 1];
  const abz = p[b * 3 + 2] - p[a * 3 + 2];
  const acx = p[c * 3] - p[a * 3];
  const acy = p[c * 3 + 1] - p[a * 3 + 1];
  const acz = p[c * 3 + 2] - p[a * 3 + 2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

/** Connected components of the region (triangles touching the interior). */
export function countRegionComponents(mesh, values) {
  const I = mesh.indices;
  const parent = new Int32Array(mesh.vertexCount).map((_, i) => i);
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
  const inRegion = (i) => values[i] > 0;
  let regionTris = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    // A triangle belongs to the region if it is interior or crosses the
    // frontier (max value positive). This keeps the visible patch connected.
    if (Math.max(values[a], values[b], values[c]) <= 0) continue;
    regionTris++;
    if (inRegion(a) || inRegion(b) || inRegion(c)) {
      if (inRegion(a) && inRegion(b)) union(a, b);
      if (inRegion(b) && inRegion(c)) union(b, c);
      if (inRegion(c) && inRegion(a)) union(c, a);
    }
  }
  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const comps = [...sizes.values()].sort((x, y) => y - x);
  const largest = comps[0] ?? 0;
  // Ignore speckle < 1% of the largest patch (numerical border slivers).
  const significant = comps.filter((s) => s >= Math.max(3, largest * 0.01));
  return { components: significant.length, sizes: comps, regionTris };
}

/** Positive-region area split left/right for symmetry (§8, §14). */
export function measureSymmetry(mesh, values) {
  const P = mesh.positions;
  const I = mesh.indices;
  let left = 0;
  let right = 0;
  let total = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const inside =
      (values[a] > 0 ? 1 : 0) +
      (values[b] > 0 ? 1 : 0) +
      (values[c] > 0 ? 1 : 0);
    if (inside === 0) continue;
    const area = triangleArea(P, a, b, c) * (inside / 3);
    total += area;
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    if (cx >= 0) left += area;
    else right += area;
  }
  const denom = left + right || 1e-9;
  return {
    leftAreaM2: left,
    rightAreaM2: right,
    totalAreaM2: total,
    symmetryPct: (Math.abs(left - right) / denom) * 100,
  };
}

/** Signed distance (m) at a landmark point; abs = proximity to frontier. */
function landmarkDistance(point, bounds, field) {
  const d = analyticalSignedDistance(point[0], point[1], point[2], bounds, field);
  return d == null ? null : d;
}

/** Frontier-shape checks in parameter space (§8). */
export function analyzeBoundaryShape(bounds, imfMedY) {
  const errors = [];
  const N = 161;
  let maxSlopeJump = 0;
  let prevSlope = null;
  let minLowerGapUpper = Infinity;
  // Sample the half curve on |s| in [0,1].
  const half = [];
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    half.push(bounds.lowerY(s));
  }
  for (let i = 0; i < N; i++) {
    const s = -1 + (2 * i) / (N - 1);
    minLowerGapUpper = Math.min(minLowerGapUpper, bounds.upperY(s) - bounds.lowerY(s));
    if (i > 0) {
      const sPrev = -1 + (2 * (i - 1)) / (N - 1);
      const slope =
        (bounds.lowerY(s) - bounds.lowerY(sPrev)) / (s - sPrev);
      if (prevSlope != null) {
        maxSlopeJump = Math.max(maxSlopeJump, Math.abs(slope - prevSlope));
      }
      prevSlope = slope;
    }
  }

  // Interior local minima of the inferior curve (W has ≥ 2 with prominence).
  let interiorMinima = 0;
  for (let i = 2; i < N - 2; i++) {
    if (half[i] < half[i - 1] && half[i] < half[i + 1]) {
      const prom =
        Math.min(half[i - 1], half[i + 1]) - half[i];
      if (prom * 1000 > 1) interiorMinima++;
    }
  }
  // V / tongue toward the epigastrium: the center dipping below the medial IMF.
  const centerDipBelowMedialMm = Math.max(0, imfMedY - bounds.lowerY(0)) * 1000;

  const u0 = bounds.upperY(0);
  const uNeighbor = Math.max(bounds.upperY(-0.15), bounds.upperY(0.15));
  const upperLocalMinMm = Math.max(0, uNeighbor - u0) * 1000;
  if (minLowerGapUpper <= 0) errors.push("upperY<=lowerY");
  if (upperLocalMinMm > 0.5) errors.push("upper local min at s=0");
  if (interiorMinima >= 2) errors.push("deep inferior W");
  if (centerDipBelowMedialMm > 2) errors.push("inferior V/tongue");
  if (maxSlopeJump > 2.5) errors.push("abrupt lower slope");
  return {
    minUpperLowerGapMeters: minLowerGapUpper,
    upperLocalMinMm,
    interiorMinima,
    centerDipBelowMedialMm,
    maxSlopeJump,
    lowerCenterY: bounds.lowerY(0),
    lowerLateralY: bounds.lowerY(1),
    errors,
  };
}

/** Anatomical metrics for the report (§14), all SI + mm/%. */
export function computeMetrics(mesh, lm, bounds, field, values, symmetry) {
  const p = lm.points;
  const apexY = 0.5 * (p.breastApexLeft[1] + p.breastApexRight[1]);
  const { lenR, lenL } = metersPerSAtY(field, apexY);
  const widthSurfaceM = lenR + lenL; // arc from right fold → sternum → left fold
  const heightCentralM = bounds.upperY(0) - bounds.lowerY(0);
  const heightLateralM = bounds.upperY(0.85) - bounds.lowerY(0.85);

  // Perimeter = length of interpolated zero isoline.
  let perimeterM = 0;
  {
    const P = mesh.positions;
    const I = mesh.indices;
    for (let t = 0; t < mesh.triangleCount; t++) {
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const fa = values[a];
      const fb = values[b];
      const fc = values[c];
      if (Math.min(fa, fb, fc) > 0 || Math.max(fa, fb, fc) < 0) continue;
      const pts = [];
      const edges = [
        [a, fa, b, fb],
        [b, fb, c, fc],
        [c, fc, a, fa],
      ];
      for (const [i, di, j, dj] of edges) {
        if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
        const k = di / (di - dj);
        pts.push([
          P[i * 3] + (P[j * 3] - P[i * 3]) * k,
          P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k,
          P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k,
        ]);
      }
      if (pts.length >= 2) {
        perimeterM += Math.hypot(
          pts[0][0] - pts[1][0],
          pts[0][1] - pts[1][1],
          pts[0][2] - pts[1][2],
        );
      }
    }
  }

  const imfIds = [
    "inframammaryMedialLeft",
    "inframammaryMedialRight",
    "inframammaryLateralLeft",
    "inframammaryLateralRight",
  ];
  const imfDistancesMm = imfIds
    .map((id) => landmarkDistance(p[id], bounds, field))
    .filter((d) => d != null)
    .map((d) => Math.abs(d) * 1000);
  const axIds = ["anteriorAxillaryFoldLeft", "anteriorAxillaryFoldRight"];
  const axDistancesMm = axIds
    .map((id) => landmarkDistance(p[id], bounds, field))
    .filter((d) => d != null)
    .map((d) => Math.abs(d) * 1000);
  const clavicleDistanceMm = bounds.meta.infraclavicularOffset * 1000;

  const meanMm = (arr) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  return {
    widthSurfaceM,
    heightCentralM,
    heightLateralM,
    areaM2: symmetry.totalAreaM2,
    perimeterM,
    symmetryPct: symmetry.symmetryPct,
    distanceToClavicleMm: clavicleDistanceMm,
    distanceToImfMeanMm: meanMm(imfDistancesMm),
    distanceToImfMaxMm: imfDistancesMm.length ? Math.max(...imfDistancesMm) : null,
    distanceToAxillaMeanMm: meanMm(axDistancesMm),
    distanceToAxillaMaxMm: axDistancesMm.length ? Math.max(...axDistancesMm) : null,
  };
}

/** Barycentric-interpolated per-vertex field at a triangle sample. */
function interpField(values, a, b, c, w, u, v) {
  return values[a] * w + values[b] * u + values[c] * v;
}

/**
 * §12 highlight ⇄ hit-area coincidence. The Geometry Field authority is the
 * GPU-interpolated per-vertex value (what the shader shows); the temp
 * categorical selectable area comes from the SAME analytic frontiers
 * (analyticalSignedDistance > 0), which is what the categorical mask encodes in
 * the promotion gate. Points inside a ±2 mm dead-band of the field are excluded.
 */
export function sampleHitAlignment(mesh, lm, bounds, field, values, opts = {}) {
  const band = opts.band ?? 0.002;
  const wantInterior = opts.interior ?? 2000;
  const wantExterior = opts.exterior ?? 2000;
  const P = mesh.positions;
  const I = mesh.indices;
  const yMin = bounds.meta.yBot - 0.06;
  const yMax = bounds.meta.yTop + 0.06;

  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;
  const mismatches = [];

  const bary = [
    [0.25, 0.25],
    [0.5, 0.25],
    [0.25, 0.5],
    [0.34, 0.34],
    [0.6, 0.2],
  ];
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (interior >= wantInterior && exterior >= wantExterior) break;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const ya = P[a * 3 + 1];
    const yb = P[b * 3 + 1];
    const yc = P[c * 3 + 1];
    if (Math.max(ya, yb, yc) < yMin || Math.min(ya, yb, yc) > yMax) continue;
    for (const [u, v] of bary) {
      const w = 1 - u - v;
      const fieldValue = interpField(values, a, b, c, w, u, v);
      if (Math.abs(fieldValue) <= band) continue; // field dead-band
      const x = P[a * 3] * w + P[b * 3] * u + P[c * 3] * v;
      const y = P[a * 3 + 1] * w + P[b * 3 + 1] * u + P[c * 3 + 1] * v;
      const z = P[a * 3 + 2] * w + P[b * 3 + 2] * u + P[c * 3 + 2] * v;
      const analytic = analyticalSignedDistance(x, y, z, bounds, field);
      // §12: the ±band is measured on the true frontier distance. A point whose
      // analytic distance is inside the band is on the frontier → excluded.
      if (analytic != null && Math.abs(analytic) <= band) continue;
      const maskInside = analytic != null && analytic > 0;
      if (fieldValue > band) {
        if (interior >= wantInterior) continue;
        interior++;
        if (!maskInside) {
          interiorMismatch++;
          if (mismatches.length < 20)
            mismatches.push({ kind: "interior", p: [x, y, z], fieldValue, analytic });
        }
      } else {
        if (exterior >= wantExterior) continue;
        exterior++;
        if (maskInside) {
          exteriorMismatch++;
          if (mismatches.length < 20)
            mismatches.push({ kind: "exterior", p: [x, y, z], fieldValue, analytic });
        }
      }
    }
  }
  return {
    interior,
    exterior,
    interiorMismatch,
    exteriorMismatch,
    bandMeters: band,
    mismatches,
  };
}

/** Nearest mesh vertex to a 3D target (what a click snaps to). */
function nearestVertex(mesh, x, y, z) {
  const P = mesh.positions;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const d =
      (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Anatomical click probes (§13). Each target snaps to the nearest surface
 * vertex and reads the per-vertex Geometry Field, exactly like a runtime click
 * resolving to the closest surface point. Interior must be > 0, exterior <= 0.
 */
export function buildHitProbes(mesh, lm, bounds, field, values) {
  const p = lm.points;
  const clavY = 0.5 * (p.clavicleLeft[1] + p.clavicleRight[1]);
  const infra = clavY - bounds.meta.infraclavicularOffset - 0.02;
  const apexY = 0.5 * (p.breastApexLeft[1] + p.breastApexRight[1]);
  const interior = {
    infraclavicularRight: [-0.06, infra, 0.03],
    infraclavicularLeft: [0.06, infra, 0.03],
    breastRight: p.breastApexRight,
    breastLeft: p.breastApexLeft,
    sternum: [0, 0.5 * (p.sternumTop[1] + p.sternumBottom[1]), 0.03],
    lateralRightInner: [p.anteriorAxillaryFoldRight[0] + 0.02, apexY, 0.0],
    lateralLeftInner: [p.anteriorAxillaryFoldLeft[0] - 0.02, apexY, 0.0],
  };
  const exterior = {
    neck: [0, clavY + 0.05, 0.0],
    shoulderRight: [p.shoulderRight[0] - 0.02, p.shoulderRight[1], p.shoulderRight[2]],
    shoulderLeft: [p.shoulderLeft[0] + 0.02, p.shoulderLeft[1], p.shoulderLeft[2]],
    ribsRight: [p.inframammaryLateralRight[0] - 0.02, p.inframammaryLateralRight[1] - 0.04, 0.0],
    ribsLeft: [p.inframammaryLateralLeft[0] + 0.02, p.inframammaryLateralLeft[1] - 0.04, 0.0],
    abdomen: [0, bounds.meta.imfMedY - 0.06, 0.03],
  };
  const evalOne = (pt) => {
    const vi = nearestVertex(mesh, pt[0], pt[1], pt[2]);
    return values[vi];
  };
  const interiorResults = {};
  const exteriorResults = {};
  let interiorPass = true;
  let exteriorPass = true;
  for (const [k, pt] of Object.entries(interior)) {
    const d = evalOne(pt);
    const ok = d > 0;
    interiorResults[k] = { fieldValue: d, resolvesChest: ok };
    if (!ok) interiorPass = false;
  }
  for (const [k, pt] of Object.entries(exterior)) {
    const d = evalOne(pt);
    const ok = d <= 0;
    exteriorResults[k] = { fieldValue: d, resolvesChest: !ok };
    if (!ok) exteriorPass = false;
  }
  return { interior, exterior, interiorResults, exteriorResults, interiorPass, exteriorPass };
}

/** Surface s of a landmark (arc-projected, cartesian fallback). */
function landmarkS(point, lm, field) {
  const r = computeSSurface(point[0], point[1], point[2], field);
  if (r && Number.isFinite(r.s)) return Math.abs(r.s);
  const axFoldX =
    0.5 *
    (Math.abs(lm.points.anteriorAxillaryFoldLeft[0]) +
      Math.abs(lm.points.anteriorAxillaryFoldRight[0]));
  return Math.abs(point[0]) / Math.max(1e-6, axFoldX);
}

/**
 * Inferior control points following the real IMF landmarks (§5): center →
 * medial IMF → lateral IMF → gentle rise toward the axillary fold. The only
 * free knob is the central transition above the medial IMF average.
 */
export function buildInferiorControls(lm, field, inferiorCenterTransition) {
  const p = lm.points;
  const imfMedY = 0.5 * (p.inframammaryMedialLeft[1] + p.inframammaryMedialRight[1]);
  const imfLatY = 0.5 * (p.inframammaryLateralLeft[1] + p.inframammaryLateralRight[1]);
  const axY = 0.5 * (p.anteriorAxillaryFoldLeft[1] + p.anteriorAxillaryFoldRight[1]);
  let sMed =
    0.5 *
    (landmarkS(p.inframammaryMedialLeft, lm, field) +
      landmarkS(p.inframammaryMedialRight, lm, field));
  let sLat =
    0.5 *
    (landmarkS(p.inframammaryLateralLeft, lm, field) +
      landmarkS(p.inframammaryLateralRight, lm, field));
  // Keep control abscissas strictly increasing and inside (0,1).
  sMed = Math.min(Math.max(sMed, 0.12), 0.42);
  sLat = Math.min(Math.max(sLat, sMed + 0.12), 0.82);
  return [
    { s: 0, y: imfMedY + inferiorCenterTransition },
    { s: sMed, y: imfMedY },
    { s: sLat, y: imfLatY },
    { s: 1.0, y: imfLatY + (axY - imfLatY) * 0.12 },
  ];
}

/** Evaluate a single candidate end-to-end on the frozen V2.5 pipeline. */
export function evaluateCandidate(mesh, lm, field, params) {
  const inferiorControls = buildInferiorControls(
    lm,
    field,
    params.inferiorCenterTransition,
  );
  const bounds = buildBoundaries(lm, { ...params, inferiorControls });
  const { values } = buildVertexField(mesh, bounds, field);
  const sets = buildExclusionSets(mesh, lm);
  const leaksBefore = {
    armRight: countPositives(values, sets.armRight),
    armLeft: countPositives(values, sets.armLeft),
    back: countPositives(values, sets.back),
    neck: countPositives(values, sets.neck),
  };
  enforceExclusions(values, sets);

  const imfMedY =
    0.5 *
    (lm.points.inframammaryMedialLeft[1] +
      lm.points.inframammaryMedialRight[1]);
  const shape = analyzeBoundaryShape(bounds, imfMedY);
  const region = countRegionComponents(mesh, values);
  const symmetry = measureSymmetry(mesh, values);
  const isoline = validateIsoline(mesh, values, bounds, field);
  const metrics = computeMetrics(mesh, lm, bounds, field, values, symmetry);

  // Abdominal invasion: how far the inferior frontier dips below the medial IMF.
  const abdominalInvasionMm =
    Math.max(0, bounds.meta.imfMedY - bounds.lowerY(0)) * 1000;

  const filters = [];
  if (region.components !== 1)
    filters.push(`components=${region.components}`);
  if (leaksBefore.armRight > 0) filters.push("arm-right positives");
  if (leaksBefore.armLeft > 0) filters.push("arm-left positives");
  if (leaksBefore.back > 0) filters.push("back positives");
  if (leaksBefore.neck > 0) filters.push("neck positives");
  if (symmetry.symmetryPct > 2) filters.push(`asymmetry ${symmetry.symmetryPct.toFixed(2)}%`);
  if (abdominalInvasionMm > 2)
    filters.push(`abdominal invasion ${abdominalInvasionMm.toFixed(2)}mm`);
  if ((metrics.distanceToImfMaxMm ?? 0) > 3)
    filters.push(`IMF distance ${metrics.distanceToImfMaxMm?.toFixed(2)}mm`);
  if ((metrics.distanceToAxillaMaxMm ?? 0) > 3)
    filters.push(`axilla distance ${metrics.distanceToAxillaMaxMm?.toFixed(2)}mm`);
  for (const e of shape.errors) filters.push(e);
  if (!isoline.pass)
    filters.push(
      `isoline mean=${(isoline.precision.mean * 1000).toFixed(2)}mm max=${(isoline.precision.max * 1000).toFixed(2)}mm`,
    );

  return {
    id: params.id,
    params,
    boundsMeta: bounds.meta,
    leaksBefore,
    region,
    symmetry,
    shape,
    isoline,
    metrics,
    abdominalInvasionMm,
    filters,
    pass: filters.length === 0,
    values,
    bounds,
  };
}

/**
 * Full V2.6 evaluation (no rendering). Shared by the generator and tests so a
 * single deterministic source of truth backs both.
 */
export function evaluateAllCandidates({ mesh, lm, field }) {
  const grid = buildCandidateGrid();
  const results = grid.map((params) => evaluateCandidate(mesh, lm, field, params));
  const survivors = results.filter((r) => r.pass);
  const scored = survivors
    .map((r) => ({
      r,
      score:
        (r.metrics.distanceToImfMeanMm ?? 99) +
        (r.metrics.distanceToAxillaMeanMm ?? 99) +
        r.symmetry.symmetryPct * 2 +
        r.shape.maxSlopeJump * 5 +
        r.isoline.precision.mean * 1000,
    }))
    .sort((a, b) => a.score - b.score);
  const finalists = scored.slice(0, 3).map((s) => s.r.id);
  return { grid, results, survivors: survivors.map((r) => r.id), finalists, scored };
}

/** Build the frozen mesh + landmarks + s_surface once (shared context). */
export function buildV26Context(glbPath, landmarksPath) {
  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  verifyLandmarkLaterality(lm);
  const mesh = loadMeshData(glbPath);
  const bounds0 = buildBoundaries(lm);
  const field = buildSurfaceSField(
    mesh,
    lm,
    bounds0.meta.yBot - 0.015,
    bounds0.meta.yTop + 0.04,
    N_SLICES,
  );
  return { mesh, lm, field };
}

export { computeSSurface, FIELD_RANGE_M, buildBoundaryRefinement, validateRefinedIsoline };
