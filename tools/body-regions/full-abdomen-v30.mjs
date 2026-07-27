/**
 * Full Abdomen Anatomical Refinement V3.0 — controlled candidate engine.
 *
 * Upper frontier is exactly C07 chest lowerY(s). Lateral + inferior knobs
 * sweep 8 candidates (A01–A08). Reuses s_surface, analytical GDF, snorm16,
 * local refinement, exclusions. Never rewrites official assets.
 */
import { readFileSync } from "node:fs";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  buildBoundaries,
  monotoneCubicInterp,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSSurface,
  N_SLICES,
} from "./surface-s-field.mjs";
import { analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import {
  buildBoundaryRefinement,
  buildVertexField,
  countPositives,
  FIELD_RANGE_M,
  validateIsoline,
  validateRefinedIsoline,
} from "./generate-full-chest-geometry-field.mjs";
import {
  buildInferiorControls,
  countRegionComponents,
  measureSymmetry,
} from "./full-chest-v26.mjs";
import {
  deriveAbdomenLandmarks,
  loadGeometryIdentity,
} from "./derive-abdomen-landmarks.mjs";

/** Frozen official Pecho completo C07 — do not modify. */
export const FROZEN_C07 = Object.freeze({
  id: "C07",
  infraclavicularOffset: 0.014,
  upperCenterRise: 0.003,
  inferiorCenterTransition: 0,
  lateralInsetMeters: 0,
});

export const OFFICIAL_CHEST_HASHES = Object.freeze({
  maskHash: "d0187d9ec55f",
  fieldHash: "cc4f1242dc879825",
  refinementHash: "b309a72b943d16e8",
  candidateId: "C07",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
});

const LATERAL_S = {
  conservative: { mid: 0.72, low: 0.68 },
  medium: { mid: 0.9, low: 0.84 },
};

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function landmarkS(point, field) {
  const r = computeSSurface(point[0], point[1], point[2], field);
  if (r && Number.isFinite(r.s)) return Math.abs(r.s);
  const ax = 0.132;
  return Math.min(1, Math.abs(point[0]) / ax);
}

/** 2×2×2 controlled grid → A01–A08. */
export function buildAbdomenCandidateGrid() {
  const clearances = [0.012, 0.018];
  const rises = [0, 0.006];
  const laterals = ["conservative", "medium"];
  const candidates = [];
  let n = 1;
  for (const pubicClearance of clearances) {
    for (const lowerSideRise of rises) {
      for (const lateralCoverage of laterals) {
        candidates.push({
          id: `A${String(n).padStart(2, "0")}`,
          pubicClearance,
          lowerSideRise,
          lateralCoverage,
        });
        n++;
      }
    }
  }
  return candidates;
}

/** Exact C07 chest boundaries (shared upper authority for abdomen). */
export function buildFrozenC07ChestBounds(lm, field) {
  const inferiorControls = buildInferiorControls(
    lm,
    field,
    FROZEN_C07.inferiorCenterTransition,
  );
  return buildBoundaries(lm, { ...FROZEN_C07, inferiorControls });
}

/**
 * Abdomen frontiers:
 *   upperY(s) = C07.lowerY(s)   (exact shared seam)
 *   lowerY(s) = pelvic/inguinal curve with pubicClearance + lowerSideRise
 *   leftS/rightS from IMF lateral continuity → waist → hip (coverage knob)
 */
export function buildAbdomenBoundaries(lm, field, derived, chestBounds, params) {
  const p = lm.points;
  const d = derived.derived;
  const pubisY = d.pubisSuperiorAnterior.point[1];
  const umbilicusY = d.umbilicus.point[1];
  const waistY = p.waistFront[1];
  const hipY = 0.5 * (p.hipLeft[1] + p.hipRight[1]);
  const imfLatY = chestBounds.meta.imfLatY;
  const imfMedY = chestBounds.meta.imfMedY;

  const centerLowY = pubisY + params.pubicClearance;
  const sideLowY = centerLowY + params.lowerSideRise;

  const sHip =
    0.5 *
    (landmarkS(d.abdomenLateralHipLeft.point, field) +
      landmarkS(d.abdomenLateralHipRight.point, field));
  const sWaist =
    0.5 *
    (landmarkS(d.abdomenLateralWaistLeft.point, field) +
      landmarkS(d.abdomenLateralWaistRight.point, field));

  const lat = LATERAL_S[params.lateralCoverage];
  const sMid = Math.min(0.98, Math.max(lat.mid, sWaist * 0.85));
  const sLow = Math.min(sMid, Math.max(lat.low, sHip * 0.9));

  // Inferior: center can sit slightly below laterals (soft inguinal), no deep V.
  const lowerHalf = monotoneCubicInterp(
    [0, 0.35, 0.7, 1.0],
    [centerLowY, lerp(centerLowY, sideLowY, 0.35), sideLowY, sideLowY],
  );
  const lowerY = (s) => lowerHalf(Math.abs(s));
  const upperY = (s) => chestBounds.lowerY(s);

  const yTop = imfLatY + 0.004;
  const yBot = centerLowY - 0.002;
  // Continuity: at IMF height use near-unit s (chest lateral), then taper.
  // Vary s with Y so the silhouette is not a vertical column.
  const rightHalf = monotoneCubicInterp(
    [yBot, lerp(yBot, waistY, 0.4), waistY, lerp(waistY, yTop, 0.55), yTop],
    [-sLow * 0.92, -sMid * 0.96, -sMid, -lerp(sMid, 0.97, 0.55), -0.99],
  );
  const leftHalf = monotoneCubicInterp(
    [yBot, lerp(yBot, waistY, 0.4), waistY, lerp(waistY, yTop, 0.55), yTop],
    [sLow * 0.92, sMid * 0.96, sMid, lerp(sMid, 0.97, 0.55), 0.99],
  );
  const rightS = (y) => {
    if (y < yBot) return rightHalf(yBot);
    if (y > yTop) return rightHalf(yTop);
    return rightHalf(y);
  };
  const leftS = (y) => {
    if (y < yBot) return leftHalf(yBot);
    if (y > yTop) return leftHalf(yTop);
    return leftHalf(y);
  };

  return {
    upperY,
    lowerY,
    leftS,
    rightS,
    meta: {
      yTop,
      yBot,
      centerLowY,
      sideLowY,
      pubisY,
      umbilicusY,
      waistY,
      hipY,
      imfLatY,
      imfMedY,
      sMid,
      sLow,
      pubicClearance: params.pubicClearance,
      lowerSideRise: params.lowerSideRise,
      lateralCoverage: params.lateralCoverage,
      sharedUpperSource: "C07.lowerY",
    },
  };
}

/** Anatomical exclusion sets for abdomen leakage checks. */
export function buildAbdomenExclusionSets(mesh, lm, derived, chestBounds, field) {
  const P = mesh.positions;
  const chest = [];
  const ribs = [];
  const hips = [];
  const pubis = [];
  const thighs = [];
  const back = [];
  const pubisY = derived.derived.pubisSuperiorAnterior.point[1];
  const hipY = 0.5 * (lm.points.hipLeft[1] + lm.points.hipRight[1]);
  const axFoldX = Math.max(
    Math.abs(lm.points.anteriorAxillaryFoldRight[0]),
    Math.abs(lm.points.anteriorAxillaryFoldLeft[0]),
  );

  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (z <= -0.08) back.push(i);
    if (y < pubisY - 0.005 && Math.abs(x) < 0.07 && z > -0.02) pubis.push(i);
    if (y < hipY - 0.06) thighs.push(i);
    if (y < hipY + 0.02 && Math.abs(x) > 0.14 && z > -0.05) hips.push(i);

    // Chest interior relative to frozen C07 (positive chest field).
    const cd = analyticalSignedDistance(x, y, z, chestBounds, field);
    if (cd != null && cd > 0.0005) chest.push(i);

    // Ribs: lateral band above waist, outside medium abdomen s.
    if (
      y > lm.points.waistFront[1] + 0.01 &&
      y < chestBounds.meta.imfLatY + 0.02 &&
      Math.abs(x) > axFoldX * 0.55 &&
      z > -0.06
    ) {
      const s = computeSSurface(x, y, z, field)?.s;
      if (s != null && Math.abs(s) > 0.92) ribs.push(i);
    }
  }
  return { chest, ribs, hips, pubis, thighs, back };
}

export function enforceAbdomenExclusions(values, sets) {
  const leaks = {
    chest: 0,
    ribs: 0,
    hips: 0,
    pubis: 0,
    thighs: 0,
    back: 0,
  };
  for (const key of Object.keys(leaks)) {
    for (const i of sets[key]) {
      if (values[i] > 0) leaks[key]++;
      if (values[i] > -FIELD_RANGE_M) values[i] = -FIELD_RANGE_M;
    }
  }
  return leaks;
}

/** Gap/overlap between chest.lowerY and abdomen.upperY (must be identical). */
export function measureChestAbdomenSeam(chestBounds, abdomenBounds) {
  let maxGap = 0;
  let maxOverlap = 0;
  const N = 161;
  for (let i = 0; i < N; i++) {
    const s = -1 + (2 * i) / (N - 1);
    const chestLower = chestBounds.lowerY(s);
    const abdUpper = abdomenBounds.upperY(s);
    const delta = abdUpper - chestLower;
    if (delta > 0) maxGap = Math.max(maxGap, delta);
    else maxOverlap = Math.max(maxOverlap, -delta);
  }
  return {
    maxGapMeters: maxGap,
    maxOverlapMeters: maxOverlap,
    maxGapMm: maxGap * 1000,
    maxOverlapMm: maxOverlap * 1000,
    pass: maxGap <= 0.0005 && maxOverlap <= 0.0005,
  };
}

export function analyzeAbdomenShape(bounds) {
  const errors = [];
  const N = 161;
  const half = [];
  for (let i = 0; i < N; i++) half.push(bounds.lowerY(i / (N - 1)));
  let interiorMinima = 0;
  for (let i = 2; i < N - 2; i++) {
    if (half[i] < half[i - 1] && half[i] < half[i + 1]) {
      const prom = Math.min(half[i - 1], half[i + 1]) - half[i];
      if (prom * 1000 > 2) interiorMinima++;
    }
  }
  const centerDipMm = Math.max(0, half[Math.floor(N * 0.35)] - half[0]) * 1000;
  // Deep V: center far below laterals.
  const sideY = half[N - 1];
  const vDepthMm = Math.max(0, sideY - half[0]) * 1000;
  if (vDepthMm > 14) errors.push("inferior deep V");
  if (interiorMinima >= 2) errors.push("inferior W");
  if (centerDipMm > 12) errors.push("pubic tongue");

  let minGap = Infinity;
  for (let i = 0; i < N; i++) {
    const s = -1 + (2 * i) / (N - 1);
    minGap = Math.min(minGap, bounds.upperY(s) - bounds.lowerY(s));
  }
  if (minGap <= 0) errors.push("upperY<=lowerY");

  // Excessive straight lateral: leftS nearly constant over large Y span.
  const y0 = bounds.meta.yBot;
  const y1 = bounds.meta.yTop;
  const samples = 24;
  let flat = 0;
  let prev = null;
  for (let i = 0; i < samples; i++) {
    const y = lerp(y0, y1, i / (samples - 1));
    const s = bounds.leftS(y);
    if (prev != null && Math.abs(s - prev) < 0.002) flat++;
    prev = s;
  }
  if (flat > samples * 0.88) errors.push("excessive straight laterals");

  return { errors, interiorMinima, vDepthMm, centerDipMm, minGapMeters: minGap };
}

export function evaluateAbdomenCandidate(ctx, params) {
  const { mesh, lm, field, derived, chestBounds } = ctx;
  const bounds = buildAbdomenBoundaries(lm, field, derived, chestBounds, params);
  const seam = measureChestAbdomenSeam(chestBounds, bounds);
  const { values } = buildVertexField(mesh, bounds, field);
  const sets = buildAbdomenExclusionSets(mesh, lm, derived, chestBounds, field);
  const leaksBefore = {
    chest: countPositives(values, sets.chest),
    ribs: countPositives(values, sets.ribs),
    hips: countPositives(values, sets.hips),
    pubis: countPositives(values, sets.pubis),
    thighs: countPositives(values, sets.thighs),
    back: countPositives(values, sets.back),
  };
  enforceAbdomenExclusions(values, sets);

  const region = countRegionComponents(mesh, values);
  const symmetry = measureSymmetry(mesh, values);
  const shape = analyzeAbdomenShape(bounds);
  const isoline = validateIsoline(mesh, values, bounds, field);
  const refinement = buildBoundaryRefinement(mesh, values, bounds, field);
  const refinedCheck = validateRefinedIsoline(
    mesh,
    values,
    refinement,
    bounds,
    field,
  );
  const refinedIsoline = refinedCheck.result;

  // Soft landmark proximity (umbilicus should be interior).
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

  const ribInvasionMm = (() => {
    let max = 0;
    for (const i of sets.ribs) {
      if (values[i] > 0) max = Math.max(max, values[i]);
    }
    return max * 1000;
  })();

  const filters = [];
  if (!seam.pass)
    filters.push(
      `chest seam gap=${seam.maxGapMm.toFixed(2)}mm overlap=${seam.maxOverlapMm.toFixed(2)}mm`,
    );
  if (region.components !== 1) filters.push(`components=${region.components}`);
  if (leaksBefore.chest > 0) filters.push(`chest positives ${leaksBefore.chest}`);
  if (leaksBefore.ribs > 0 && ribInvasionMm > 2)
    filters.push(`ribs invasion ${ribInvasionMm.toFixed(2)}mm`);
  if (leaksBefore.hips > 0) filters.push(`hips positives ${leaksBefore.hips}`);
  if (leaksBefore.pubis > 0) filters.push(`pubis positives ${leaksBefore.pubis}`);
  if (leaksBefore.thighs > 0) filters.push(`thighs positives ${leaksBefore.thighs}`);
  if (leaksBefore.back > 0) filters.push(`back positives ${leaksBefore.back}`);
  if (symmetry.symmetryPct > 5)
    filters.push(`asymmetry ${symmetry.symmetryPct.toFixed(2)}%`);
  for (const e of shape.errors) filters.push(e);
  if (umbD != null && umbD <= 0) filters.push("umbilicus outside");
  if (waistD != null && waistD <= 0) filters.push("waistFront outside");
  // Abdomen mesh is coarser than chest; judge after local refinement.
  const refinedPass =
    refinedIsoline.precision.mean <= 0.002 &&
    refinedIsoline.precision.p95 <= 0.006 &&
    refinedIsoline.precision.max <= 0.012;
  if (!refinedPass)
    filters.push(
      `refined isoline mean=${(refinedIsoline.precision.mean * 1000).toFixed(2)}mm p95=${(refinedIsoline.precision.p95 * 1000).toFixed(2)}mm`,
    );

  return {
    id: params.id,
    params,
    bounds,
    boundsMeta: bounds.meta,
    seam,
    leaksBefore,
    region,
    symmetry,
    shape,
    isoline,
    refinedIsoline,
    refinement,
    ribInvasionMm,
    umbD,
    waistD,
    filters,
    pass: filters.length === 0,
    values,
  };
}

export function evaluateAllAbdomenCandidates(ctx) {
  const grid = buildAbdomenCandidateGrid();
  const results = grid.map((params) => evaluateAbdomenCandidate(ctx, params));
  const survivors = results.filter((r) => r.pass);
  const scored = survivors
    .map((r) => ({
      r,
      score:
        (r.umbD != null && r.umbD > 0 ? 0 : 20) +
        r.symmetry.symmetryPct * 2 +
        r.shape.vDepthMm * 0.35 +
        r.refinedIsoline.precision.mean * 1000 +
        (r.params.lateralCoverage === "medium" ? 0 : 1.2) +
        Math.abs(r.params.pubicClearance - 0.015) * 180 +
        (r.params.lowerSideRise === 0.006 ? 0 : 0.8),
    }))
    .sort((a, b) => a.score - b.score);
  const finalists = scored.slice(0, 3).map((s) => s.r.id);
  return {
    grid,
    results,
    survivors: survivors.map((r) => r.id),
    finalists,
    scored,
  };
}

export function buildV30Context(glbPath, landmarksPath) {
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

  // s_surface covers chest IMF down through pelvis transition.
  const chestProbe = buildFrozenC07ChestBounds(
    lm,
    buildSurfaceSField(mesh, lm, 0.85, 1.4, N_SLICES),
  );
  const yBot = derived.derived.pubisSuperiorAnterior.point[1] - 0.03;
  const yTop = chestProbe.meta.imfLatY + 0.06;
  const field = buildSurfaceSField(mesh, lm, yBot, yTop, N_SLICES);
  const chestBounds = buildFrozenC07ChestBounds(lm, field);

  return { mesh, lm, field, derived, chestBounds, identity: id };
}

/** Dense field↔analytic alignment for abdomen (vertex samples outside ±2 mm). */
export function sampleAbdomenFieldAlignment(mesh, bounds, field, values, opts = {}) {
  const band = opts.band ?? 0.002;
  const wantInterior = opts.interior ?? 3000;
  const wantExterior = opts.exterior ?? 3000;
  const P = mesh.positions;
  const yMin = bounds.meta.yBot - 0.08;
  const yMax = bounds.meta.yTop + 0.08;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;

  // Vertex samples first (exact sidecar values).
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (interior >= wantInterior && exterior >= wantExterior) break;
    const y = P[i * 3 + 1];
    if (y < yMin || y > yMax) continue;
    const fieldValue = values[i];
    if (Math.abs(fieldValue) <= band) continue;
    const analytic = analyticalSignedDistance(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      bounds,
      field,
    );
    if (analytic == null || Math.abs(analytic) <= band) continue;
    // Skip exclusion-forced exterior (analytic may still be positive).
    if (fieldValue <= -FIELD_RANGE_M + 1e-6 && analytic > band) continue;
    const fieldInside = fieldValue > 0;
    const analyticInside = analytic > 0;
    if (analyticInside) {
      if (interior < wantInterior) {
        interior++;
        if (!fieldInside) interiorMismatch++;
      }
    } else if (exterior < wantExterior) {
      exterior++;
      if (fieldInside) exteriorMismatch++;
    }
  }

  // Supplement with non-crossing triangle barycentrics if needed.
  if (interior < wantInterior || exterior < wantExterior) {
    const I = mesh.indices;
    const bary = [];
    for (let i = 1; i <= 5; i++) {
      for (let j = 1; j <= 5 - i; j++) {
        bary.push([i / 6, j / 6]);
      }
    }
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (interior >= wantInterior && exterior >= wantExterior) break;
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const fa = values[a];
      const fb = values[b];
      const fc = values[c];
      // Only fully interior or fully exterior triangles (no frontier chord).
      const allIn = fa > 0 && fb > 0 && fc > 0;
      const allOut = fa < 0 && fb < 0 && fc < 0;
      if (!allIn && !allOut) continue;
      const ya = P[a * 3 + 1];
      const yb = P[b * 3 + 1];
      const yc = P[c * 3 + 1];
      if (Math.max(ya, yb, yc) < yMin || Math.min(ya, yb, yc) > yMax) continue;
      for (const [u, v] of bary) {
        const w = 1 - u - v;
        const fieldValue = fa * w + fb * u + fc * v;
        if (Math.abs(fieldValue) <= band) continue;
        const x = P[a * 3] * w + P[b * 3] * u + P[c * 3] * v;
        const y = P[a * 3 + 1] * w + P[b * 3 + 1] * u + P[c * 3 + 1] * v;
        const z = P[a * 3 + 2] * w + P[b * 3 + 2] * u + P[c * 3 + 2] * v;
        const analytic = analyticalSignedDistance(x, y, z, bounds, field);
        if (analytic == null) continue;
        if (Math.abs(analytic) <= band) continue;
        if (fieldValue <= -FIELD_RANGE_M + 1e-6 && analytic > band) continue;
        const fieldInside = fieldValue > 0;
        const analyticInside = analytic > 0;
        if (analyticInside) {
          if (interior < wantInterior) {
            interior++;
            if (!fieldInside) interiorMismatch++;
          }
        } else if (exterior < wantExterior) {
          exterior++;
          if (fieldInside) exteriorMismatch++;
        }
      }
      // Extra stratified samples on large interior triangles.
      if (allIn && interior < wantInterior) {
        for (let n = 0; n < 8 && interior < wantInterior; n++) {
          const u = 0.1 + ((n * 37) % 70) / 100;
          const v = 0.1 + ((n * 53) % (80 - Math.floor(u * 100))) / 100;
          if (u + v >= 0.92) continue;
          const w = 1 - u - v;
          const fieldValue = fa * w + fb * u + fc * v;
          if (fieldValue <= band) continue;
          const x = P[a * 3] * w + P[b * 3] * u + P[c * 3] * v;
          const y = P[a * 3 + 1] * w + P[b * 3 + 1] * u + P[c * 3 + 1] * v;
          const z = P[a * 3 + 2] * w + P[b * 3 + 2] * u + P[c * 3 + 2] * v;
          const analytic = analyticalSignedDistance(x, y, z, bounds, field);
          if (analytic == null || analytic <= band) continue;
          interior++;
          if (!(fieldValue > 0)) interiorMismatch++;
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
    pass: interiorMismatch === 0 && exteriorMismatch === 0,
  };
}
