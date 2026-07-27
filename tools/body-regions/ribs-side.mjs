/**
 * Side-aware ribs V4.1 primitives (shared by right_ribs and left_ribs).
 *
 * Every frontier is derived from real per-side geometry:
 *   anterior  → C07.rightS / C07.leftS + B01.rightS / B01.leftS
 *   posterior → 96-slice curvature normal-turn seam on that side's arc
 *   superior  → base of that side's axilla
 *   inferior  → that side's upper lateral waist
 *
 * Nothing here mirrors vertices or negates the opposite side's sidecar.
 * With side === "right" the arithmetic reduces to the frozen V4.0 formulas.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hermiteInterp, monotoneCubicInterp } from "./generate-full-chest-v21.mjs";
import {
  computeSSurface,
  intersectMeshAtY,
  selectTorsoPolyline,
  stitchPolylines,
} from "./surface-s-field.mjs";
import {
  computeSSurfaceForSdf,
  metersPerSAtY,
  qMetric,
} from "./generate-full-chest-sdf.mjs";
import {
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";

/** @typedef {"right"|"left"} BodySide */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const SLICE_COUNT = 96;

/** Frozen posterior wrap envelopes in s-units behind the shared front. */
export const POSTERIOR_S = Object.freeze({
  conservative: { wrapTop: 0.28, wrapMid: 0.4, wrapWaist: 0.24 },
  medium: { wrapTop: 0.34, wrapMid: 0.5, wrapWaist: 0.3 },
});

export const R02 = Object.freeze({
  id: "R02",
  posteriorCoverage: "medium",
  waistClearance: 0.01,
});

export const L01 = Object.freeze({
  id: "L01",
  posteriorCoverage: "medium",
  waistClearance: 0.01,
});

/** Official torso freeze authority for the left ribs gate (V4.3). */
export const OFFICIAL_TORSO_REGIONS = Object.freeze({
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  maskHash: "b628b15261da",
  chest: {
    regionId: "full_chest",
    candidateId: "C07",
    fieldHash: "cc4f1242dc879825",
    refinementHash: "b309a72b943d16e8",
    fieldBin: "neutro_body_v1_full_chest_sdf.bin",
    refineBin: "neutro_body_v1_full_chest_refine.bin",
  },
  abdomen: {
    regionId: "full_abdomen",
    candidateId: "B01",
    fieldHash: "30a41c0dcc820ab0",
    refinementHash: "e624d3f9ecc9d40a",
    fieldBin: "neutro_body_v1_full_abdomen_sdf.bin",
    refineBin: "neutro_body_v1_full_abdomen_refine.bin",
  },
  rightRibs: {
    regionId: "right_ribs",
    candidateId: "V4.1",
    fieldHash: "69a61207dd331a1d",
    refinementHash: "4a17658fa0cec820",
    fieldBin: "neutro_body_v1_right_ribs_sdf.bin",
    refineBin: "neutro_body_v1_right_ribs_refine.bin",
  },
  leftRibs: {
    regionId: "left_ribs",
    candidateId: "L01",
    fieldHash: "3a1a0e9368a98095",
    refinementHash: "d4691c229a59a804",
    fieldBin: "neutro_body_v1_left_ribs_sdf.bin",
    refineBin: "neutro_body_v1_left_ribs_refine.bin",
  },
});

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
export function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
export function contentHash12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

const SIDE_CONFIG = {
  right: {
    side: "right",
    /** Outward direction along X for this side. */
    xSign: -1,
    /** Sign of s_surface on this side (s = 0 sternum, ±1 axillary fold). */
    sSign: -1,
    maskIndex: 13,
    regionId: "right_ribs",
    visualRegionId: "right_ribs_surface",
    surfaceRegionId: "right_ribs_region",
    candidateId: "R02",
    params: R02,
    seamName: "shared-front-ribs-seam",
    backSeamName: "right_side_back_seam",
    sharedFrontSource: "C07.rightS+B01.rightS",
    frozenBackSeamPath: "artifacts/right-ribs-v40/right-side-back-seam.json",
    label: "Costillas derechas",
    landmarks: {
      anteriorAxillaryFold: "anteriorAxillaryFoldRight",
      posteriorAxillaryFold: "posteriorAxillaryFoldRight",
      shoulder: "shoulderRight",
      elbow: "elbowRight",
      hip: "hipRight",
      iliacCrest: "iliacCrestRight",
      clavicle: "clavicleRight",
    },
  },
  left: {
    side: "left",
    xSign: 1,
    sSign: 1,
    maskIndex: 12,
    regionId: "left_ribs",
    visualRegionId: "left_ribs_surface",
    surfaceRegionId: "left_ribs_region",
    candidateId: "L01",
    params: L01,
    seamName: "shared-front-left-ribs-seam",
    backSeamName: "left_side_back_seam",
    sharedFrontSource: "C07.leftS+B01.leftS",
    frozenBackSeamPath: null,
    label: "Costillas izquierdas",
    landmarks: {
      anteriorAxillaryFold: "anteriorAxillaryFoldLeft",
      posteriorAxillaryFold: "posteriorAxillaryFoldLeft",
      shoulder: "shoulderLeft",
      elbow: "elbowLeft",
      hip: "hipLeft",
      iliacCrest: "iliacCrestLeft",
      clavicle: "clavicleLeft",
    },
  },
};

/**
 * Resolve every side-dependent constant in one place.
 * @param {BodySide} side
 */
export function getRibsSideConfig(side) {
  const cfg = SIDE_CONFIG[side];
  if (!cfg) throw new Error(`UNKNOWN_BODY_SIDE:${String(side)}`);
  return cfg;
}

/** Landmark point for a side, e.g. sideLandmark(lm, "left", "shoulder"). */
export function sideLandmark(lm, side, key) {
  const cfg = getRibsSideConfig(side);
  const name = cfg.landmarks[key];
  if (!name) throw new Error(`UNKNOWN_SIDE_LANDMARK:${key}`);
  return lm.points[name];
}

/** Lateral s(y) of a chest/abdomen bounds object on the requested side. */
export function lateralSOf(bounds, side) {
  return side === "right" ? bounds.rightS : bounds.leftS;
}

/**
 * Pre-left-promotion freeze: chest C07 + abdomen B01 + right_ribs V4.1 + mask.
 * Throws OFFICIAL_TORSO_REGRESSION_DETECTED on drift or if left_ribs is official.
 */
export function assertOfficialTorsoRegionsFrozen(root = ROOT) {
  const fieldsDir = path.join(root, "public/models/interaction/fields");
  const manifest = JSON.parse(
    readFileSync(path.join(fieldsDir, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const maskManifest = JSON.parse(
    readFileSync(
      path.join(
        root,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
      "utf8",
    ),
  );

  const observed = {};
  const failures = [];
  for (const key of ["chest", "abdomen", "rightRibs"]) {
    const spec = OFFICIAL_TORSO_REGIONS[key];
    const entry = manifest.fields.find((f) => f.regionId === spec.regionId);
    const fieldBin = readFileSync(path.join(fieldsDir, spec.fieldBin));
    const refineBin = readFileSync(path.join(fieldsDir, spec.refineBin));
    const seen = {
      candidateId: entry?.candidateId ?? null,
      fieldHash: entry?.fieldHash ?? null,
      refinementHash: entry?.refinement?.hash ?? null,
      fieldBinHash: contentHash16(fieldBin),
      refineBinHash: contentHash16(refineBin),
    };
    observed[key] = seen;
    if (seen.candidateId !== spec.candidateId) failures.push(`${key}.candidateId`);
    if (seen.fieldHash !== spec.fieldHash) failures.push(`${key}.fieldHash`);
    if (seen.refinementHash !== spec.refinementHash) {
      failures.push(`${key}.refinementHash`);
    }
    if (seen.fieldBinHash !== spec.fieldHash) failures.push(`${key}.fieldBin`);
    if (seen.refineBinHash !== spec.refinementHash) {
      failures.push(`${key}.refineBin`);
    }
  }
  observed.maskHash = maskManifest.maskHash;
  observed.geometryHash = manifest.geometryHash;
  observed.indexHash = manifest.indexHash;
  observed.vertexCount = manifest.vertexCount;
  if (maskManifest.maskHash !== OFFICIAL_TORSO_REGIONS.maskHash) {
    failures.push("maskHash");
  }
  if (manifest.geometryHash !== OFFICIAL_TORSO_REGIONS.geometryHash) {
    failures.push("geometryHash");
  }
  if (manifest.indexHash !== OFFICIAL_TORSO_REGIONS.indexHash) {
    failures.push("indexHash");
  }
  if (manifest.vertexCount !== OFFICIAL_TORSO_REGIONS.vertexCount) {
    failures.push("vertexCount");
  }
  if (manifest.fields.some((f) => f.regionId === "left_ribs")) {
    failures.push("left_ribs_already_official");
  }

  if (failures.length) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = { failures, observed };
    throw err;
  }
  return {
    intact: true,
    chestFieldHash: observed.chest.fieldHash,
    chestRefinementHash: observed.chest.refinementHash,
    abdomenFieldHash: observed.abdomen.fieldHash,
    abdomenRefinementHash: observed.abdomen.refinementHash,
    rightRibsFieldHash: observed.rightRibs.fieldHash,
    rightRibsRefinementHash: observed.rightRibs.refinementHash,
    maskHash: observed.maskHash,
    geometryHash: observed.geometryHash,
    indexHash: observed.indexHash,
    vertexCount: observed.vertexCount,
  };
}

/**
 * Post-V4.4 freeze: chest + abdomen + both ribs + mask (left_ribs must exist).
 */
export function assertOfficialTorsoWithLeftRibsFrozen(root = ROOT) {
  const fieldsDir = path.join(root, "public/models/interaction/fields");
  const manifest = JSON.parse(
    readFileSync(path.join(fieldsDir, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const maskManifest = JSON.parse(
    readFileSync(
      path.join(
        root,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
      "utf8",
    ),
  );

  const observed = {};
  const failures = [];
  for (const key of ["chest", "abdomen", "rightRibs", "leftRibs"]) {
    const spec = OFFICIAL_TORSO_REGIONS[key];
    const entry = manifest.fields.find((f) => f.regionId === spec.regionId);
    const fieldBin = readFileSync(path.join(fieldsDir, spec.fieldBin));
    const refineBin = readFileSync(path.join(fieldsDir, spec.refineBin));
    const seen = {
      candidateId: entry?.candidateId ?? null,
      fieldHash: entry?.fieldHash ?? null,
      refinementHash: entry?.refinement?.hash ?? null,
      fieldBinHash: contentHash16(fieldBin),
      refineBinHash: contentHash16(refineBin),
    };
    observed[key] = seen;
    if (seen.candidateId !== spec.candidateId) failures.push(`${key}.candidateId`);
    if (seen.fieldHash !== spec.fieldHash) failures.push(`${key}.fieldHash`);
    if (seen.refinementHash !== spec.refinementHash) {
      failures.push(`${key}.refinementHash`);
    }
    if (seen.fieldBinHash !== spec.fieldHash) failures.push(`${key}.fieldBin`);
    if (seen.refineBinHash !== spec.refinementHash) {
      failures.push(`${key}.refineBin`);
    }
  }
  observed.maskHash = maskManifest.maskHash;
  observed.geometryHash = manifest.geometryHash;
  observed.indexHash = manifest.indexHash;
  observed.vertexCount = manifest.vertexCount;
  if (manifest.geometryHash !== OFFICIAL_TORSO_REGIONS.geometryHash) {
    failures.push("geometryHash");
  }
  if (manifest.indexHash !== OFFICIAL_TORSO_REGIONS.indexHash) {
    failures.push("indexHash");
  }
  if (manifest.vertexCount !== OFFICIAL_TORSO_REGIONS.vertexCount) {
    failures.push("vertexCount");
  }
  const leftEntry = manifest.fields.find((f) => f.regionId === "left_ribs");
  if (!leftEntry) failures.push("left_ribs_missing");

  if (failures.length) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = { failures, observed };
    throw err;
  }
  return {
    intact: true,
    ...observed,
    leftRibsFieldHash: observed.leftRibs.fieldHash,
    leftRibsRefinementHash: observed.leftRibs.refinementHash,
  };
}

/**
 * Shared anterior frontS(y): C07 lateral above the IMF seam, B01 below.
 * Right consumes rightS; left consumes leftS. No sign flipping of the other.
 * @param {BodySide} side
 */
export function buildSharedFrontS(chestBounds, abdomenBounds, side = "right") {
  const chestLateral = lateralSOf(chestBounds, side);
  const abdomenLateral = lateralSOf(abdomenBounds, side);
  const seamY = (y) => {
    const sProbe = chestLateral(y);
    return chestBounds.lowerY(clamp(sProbe, -1, 1));
  };
  const ySeam = chestBounds.meta.imfLatY;
  const frontS = (y) => {
    if (y >= ySeam - 0.002) return chestLateral(y);
    return abdomenLateral(y);
  };
  return { frontS, ySeam, seamY, side, source: getRibsSideConfig(side).sharedFrontSource };
}

function derivePosteriorAxilla(lm, geometryHash, side) {
  const axA = sideLandmark(lm, side, "anteriorAxillaryFold");
  const shoulder = sideLandmark(lm, side, "shoulder");
  const stamp = parseInt(geometryHash.slice(4, 8), 16) / 0xffff;
  return [
    lerp(axA[0], shoulder[0], 0.35),
    lerp(axA[1], shoulder[1], 0.55) - 0.01,
    lerp(axA[2], -0.18, 0.75) - stamp * 0.002,
  ];
}

/**
 * Superior frontier: base of the axilla on this side
 * (anterior fold → lateral base → posterior fold).
 * @param {BodySide} side
 */
export function buildAxillaSuperior(lm, field, geometryHash, side = "right") {
  const { sSign } = getRibsSideConfig(side);
  const axA = sideLandmark(lm, side, "anteriorAxillaryFold");
  const axPRaw =
    sideLandmark(lm, side, "posteriorAxillaryFold") ??
    derivePosteriorAxilla(lm, geometryHash, side);
  const shoulder = sideLandmark(lm, side, "shoulder");
  const stamp = parseInt(geometryHash.slice(0, 4), 16) / 0xffff;
  const yAdj = (stamp - 0.5) * 0.001;

  const yAnterior = axA[1] - 0.018 + yAdj;
  const yBase = Math.min(axA[1], shoulder[1] - 0.09) - 0.02 + yAdj;
  const yPosterior = Math.min(axPRaw[1], yAnterior) - 0.01;
  const axP = [axPRaw[0], yPosterior, axPRaw[2]];
  const mid = [
    0.55 * axA[0] + 0.45 * axP[0],
    yBase,
    0.55 * axA[2] + 0.45 * axP[2],
  ];

  const anchors = [
    { s: sSign * 0.98, y: yAnterior, label: "axillaAnterior" },
    { s: sSign * 1.12, y: yBase, label: "axillaLateralBase" },
    { s: sSign * 1.28, y: yPosterior, label: "axillaPosterior" },
  ];
  for (const a of anchors) {
    const src =
      a.label === "axillaAnterior"
        ? [axA[0], a.y, axA[2]]
        : a.label === "axillaPosterior"
          ? [axP[0], a.y, axP[2]]
          : mid;
    const r =
      computeSSurface(src[0], src[1], src[2], field) ??
      computeSSurfaceForSdf(src[0], src[1], src[2], field);
    if (r) {
      a.s =
        sSign < 0 ? clamp(r.s, -1.55, -0.7) : clamp(r.s, 0.7, 1.55);
    }
  }

  const ordered = [...anchors].sort((a, b) => Math.abs(a.s) - Math.abs(b.s));
  const upperHalf = hermiteInterp(
    ordered.map((a, i, arr) => ({
      x: Math.abs(a.s),
      y: a.y,
      dy:
        i === 0 || i === arr.length - 1
          ? 0
          : (arr[i + 1].y - arr[i - 1].y) /
            Math.max(0.05, Math.abs(arr[i + 1].s) - Math.abs(arr[i - 1].s)),
    })),
  );
  const sMin = Math.min(...ordered.map((a) => Math.abs(a.s)));
  const sMax = Math.max(...ordered.map((a) => Math.abs(a.s)));
  const upperY = (s) => {
    const abs = Math.abs(sSign < 0 ? clamp(s, -1.7, -0.5) : clamp(s, 0.5, 1.7));
    return upperHalf(clamp(abs, sMin, sMax));
  };

  const ys = anchors.map((a) => a.y);
  const tip =
    Math.max(...ys) - Math.min(...ys) < 0.003 ||
    ys[1] > Math.max(ys[0], ys[2]) + 0.015;

  return {
    side,
    upperY,
    anchors,
    yMax: Math.max(...ys),
    diagnostics: {
      belowArm: ys.every((y) => y < shoulder[1] - 0.04),
      noInternalAxilla: mid[2] > axP[2] - 0.02,
      noTip: !tip,
      pass:
        ys.every((y) => y < shoulder[1] - 0.04) &&
        !tip &&
        ys[1] <= Math.max(ys[0], ys[2]) + 0.005,
    },
  };
}

/**
 * Inferior frontier: upper lateral waist on this side, above hip / iliac crest.
 * @param {BodySide} side
 */
export function buildWaistInferior(
  lm,
  field,
  frontS,
  backS,
  waistClearance,
  side = "right",
) {
  const { sSign } = getRibsSideConfig(side);
  const waistF = lm.points.waistFront;
  const waistB = lm.points.waistBack;
  const iliac = sideLandmark(lm, side, "iliacCrest");
  const hip = sideLandmark(lm, side, "hip");
  const yWaist = 0.55 * waistF[1] + 0.45 * waistB[1];
  const yHipBand = Math.max(hip[1], iliac[1] * 0.15 + hip[1] * 0.85);
  const yEnd = yWaist - waistClearance;
  const yFront = yEnd + 0.004;
  const yMid = yEnd;
  const yBack = yEnd - 0.003;
  const sFront = frontS(yFront);
  const sBack = backS(yBack);
  const sMid = 0.5 * (sFront + sBack);

  const half = hermiteInterp([
    { x: Math.abs(sFront), y: yFront, dy: 0 },
    {
      x: Math.abs(sMid),
      y: yMid,
      dy: (yBack - yFront) / Math.max(0.05, Math.abs(sBack - sFront)),
    },
    { x: Math.abs(sBack), y: yBack, dy: 0 },
  ]);
  const lowerY = (s) => {
    const abs = Math.abs(sSign < 0 ? clamp(s, -1.6, -0.5) : clamp(s, 0.5, 1.6));
    return half(
      clamp(
        abs,
        Math.min(Math.abs(sFront), Math.abs(sBack)),
        Math.max(Math.abs(sFront), Math.abs(sBack)),
      ),
    );
  };

  const beforeHip = yEnd > yHipBand + 0.01;
  return {
    side,
    lowerY,
    yEnd,
    diagnostics: {
      beforeHip,
      beforeIliac: true,
      notHardCut: Math.abs(yFront - yBack) > 0.002,
      pass: beforeHip && Math.abs(yFront - yBack) > 0.002,
      yWaist,
      yEnd,
      waistClearance,
    },
  };
}

function discreteCurvatureXZ(points) {
  const n = points.length;
  const kappa = new Float64Array(n);
  const normalTurn = new Float64Array(n);
  const tangentAngle = new Float64Array(n);
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
    normalTurn[i] = Math.abs(turn);
    tangentAngle[i] = Math.atan2(ub, ua);
  }
  kappa[0] = kappa[1];
  kappa[n - 1] = kappa[n - 2];
  normalTurn[0] = normalTurn[1];
  normalTurn[n - 1] = normalTurn[n - 2];
  tangentAngle[0] = tangentAngle[1];
  tangentAngle[n - 1] = tangentAngle[n - 2];
  return { kappa, normalTurn, tangentAngle };
}

/**
 * Walk this side's lateral arc from the anterior axillary fold toward the back
 * on a closed torso polyline. Returns ordered points (front → back).
 * @param {BodySide} side
 */
export function extractSideLateralArc(pts, y, lm, closed, side = "right") {
  const { xSign } = getRibsSideConfig(side);
  const ax = sideLandmark(lm, side, "anteriorAxillaryFold");
  const target = [ax[0], y, ax[2]];
  const n = pts.length;
  let iStart = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (xSign * pts[i][0] < -0.02) continue;
    const d = Math.hypot(pts[i][0] - target[0], pts[i][2] - target[2]);
    if (d < bestD) {
      bestD = d;
      iStart = i;
    }
  }

  // Prefer the direction that pushes outward on this side then goes posterior.
  const tryWalk = (dir) => {
    const walked = [pts[iStart]];
    let i = iStart;
    let guard = 0;
    while (guard++ < n) {
      i = closed ? (i + dir + n) % n : i + dir;
      if (!closed && (i < 0 || i >= n)) break;
      if (closed && i === iStart && walked.length > 2) break;
      walked.push(pts[i]);
      // Stop once we wrap past mid-back toward the opposite side.
      if (walked.length > 8 && xSign * pts[i][0] < -0.04) break;
    }
    return walked;
  };

  const a = tryWalk(+1);
  const b = tryWalk(-1);
  const score = (walked) => {
    let maxOut = 0;
    let minZ = Infinity;
    let lateral = 0;
    for (const p of walked) {
      maxOut = Math.max(maxOut, xSign * p[0]);
      minZ = Math.min(minZ, p[2]);
      if (xSign * p[0] > 0.05 && p[2] > -0.12) lateral++;
    }
    return lateral * 2 + maxOut * 8 + Math.max(0, -minZ) * 4;
  };
  const walkedPath = score(a) >= score(b) ? a : b;

  const clean = [walkedPath[0]];
  for (let i = 1; i < walkedPath.length; i++) {
    const d = Math.hypot(
      walkedPath[i][0] - clean.at(-1)[0],
      walkedPath[i][2] - clean.at(-1)[2],
    );
    if (d > 1e-4) clean.push(walkedPath[i]);
  }
  return clean;
}

/**
 * First stable lateral→posterior transition on this side's arc.
 * Right gates on x < -0.04 and s ∈ [-1.75, -0.85]; left mirrors those gates
 * onto real left geometry (x > +0.04, s ∈ [0.85, 1.75], outward +X).
 * @param {BodySide} side
 */
export function findPosteriorTransition(
  arcPts,
  field,
  y,
  prevS,
  coverage,
  side = "right",
) {
  if (!arcPts || arcPts.length < 6) return null;
  const { xSign, sSign } = getRibsSideConfig(side);
  const { kappa, normalTurn } = discreteCurvatureXZ(arcPts);
  const smooth = new Float64Array(kappa.length);
  for (let i = 0; i < kappa.length; i++) {
    const a = kappa[Math.max(0, i - 1)];
    const b = kappa[i];
    const c = kappa[Math.min(kappa.length - 1, i + 1)];
    smooth[i] = (a + b + c) / 3;
  }

  // Cumulative orientation change from lateral (outward X) toward posterior (-Z).
  let cumTurn = 0;
  const cum = new Float64Array(arcPts.length);
  for (let i = 1; i < arcPts.length; i++) {
    const nx = -(arcPts[i][2] - arcPts[i - 1][2]);
    const nz = arcPts[i][0] - arcPts[i - 1][0];
    const nlen = Math.hypot(nx, nz) || 1;
    const ox = nx / nlen;
    const oz = nz / nlen;
    const lateralness = clamp(xSign * ox, 0, 1);
    const posteriorness = clamp(-oz, 0, 1);
    cumTurn += Math.max(0, posteriorness - lateralness * 0.35) + normalTurn[i];
    cum[i] = cumTurn;
  }

  let best = null;
  let bestScore = -Infinity;
  for (let i = 3; i < arcPts.length - 3; i++) {
    const p = arcPts[i];
    if (xSign * p[0] < 0.04) continue;
    if (p[2] > 0.06) continue; // still too frontal
    const r =
      computeSSurface(p[0], y, p[2], field) ??
      computeSSurfaceForSdf(p[0], y, p[2], field);
    if (!r || !Number.isFinite(r.s)) continue;
    const s = r.s;
    const sAbs = sSign * s;
    if (sAbs < 0.85 || sAbs > 1.75) continue;
    const isLocalMax = smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1];
    if (!isLocalMax && normalTurn[i] < 0.04) continue;
    if (cum[i] < 0.08) continue;
    const continuity = prevS == null ? 0 : -Math.abs(s - prevS) * 6;
    const score =
      smooth[i] * 1.1 + normalTurn[i] * 0.5 + cum[i] * 0.15 + continuity;
    if (score > bestScore) {
      bestScore = score;
      best = { i, s, p, kappa: smooth[i], cum: cum[i] };
    }
  }

  if (!best && prevS != null) {
    let nearest = null;
    let nd = Infinity;
    for (const p of arcPts) {
      const r =
        computeSSurface(p[0], y, p[2], field) ??
        computeSSurfaceForSdf(p[0], y, p[2], field);
      if (!r) continue;
      const d = Math.abs(r.s - prevS);
      if (d < nd) {
        nd = d;
        nearest = { s: r.s, p, kappa: 0, fallback: true };
      }
    }
    return nearest;
  }
  void coverage;
  return best;
}

/**
 * Build this side's posterior seam over 96 horizontal sections.
 *
 * Posterior s is always frontS(y) ∓ wrap(y) (right subtracts, left adds).
 * wrap(y) comes from the anatomical envelope, lightly modulated by the first
 * stable lateral→posterior curvature maximum on real geometry.
 * @param {BodySide} side
 */
export function deriveSideBackSeam(
  mesh,
  lm,
  field,
  yTop,
  yBot,
  coverage,
  frontSFn,
  side = "right",
) {
  const { sSign, backSeamName } = getRibsSideConfig(side);
  const knobs = POSTERIOR_S[coverage] ?? POSTERIOR_S.conservative;
  const waistY = lm.points.waistFront[1];
  const midY = lerp(yTop, waistY, 0.45);
  const wrapPrior = (y) => {
    if (y >= midY) {
      const t = clamp((yTop - y) / Math.max(1e-6, yTop - midY), 0, 1);
      return lerp(knobs.wrapTop, knobs.wrapMid, t * t);
    }
    const t = clamp((midY - y) / Math.max(1e-6, midY - yBot), 0, 1);
    return lerp(knobs.wrapMid, knobs.wrapWaist, Math.sqrt(t));
  };
  // Posterior clamp: |s| never past 1.55, and never in front of front ∓ 0.06.
  const clampSeamS = (s, front) =>
    sSign < 0
      ? clamp(s, -1.55, front - 0.06)
      : clamp(s, front + 0.06, 1.55);

  const slices = [];
  let prevS = null;
  let prevWrap = null;
  let jumps = 0;
  for (let i = 0; i < SLICE_COUNT; i++) {
    const y = lerp(yTop, yBot, i / (SLICE_COUNT - 1));
    const front = frontSFn ? frontSFn(y) : sSign;
    let wrap = wrapPrior(y);
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const prevCentroid =
      slices.length && slices.at(-1).point
        ? [slices.at(-1).point[0], y, slices.at(-1).point[2]]
        : null;
    const picked = selectTorsoPolyline(polys, y, lm, prevCentroid);
    const poly = picked.best?.poly?.pts;
    let hit = null;
    let fallback = false;
    if (poly?.length) {
      const closed =
        Math.hypot(poly[0][0] - poly.at(-1)[0], poly[0][2] - poly.at(-1)[2]) <
        1e-3;
      const arc = extractSideLateralArc(poly, y, lm, closed, side);
      hit = findPosteriorTransition(arc, field, y, prevS, coverage, side);
      if (hit && Number.isFinite(hit.s) && sSign * (hit.s - front) > 0.04) {
        const observed = sSign * (hit.s - front);
        // Light curvature modulation — prior dominates for stability.
        wrap = clamp(lerp(wrap, observed, 0.28), wrap * 0.75, wrap * 1.35);
      } else {
        fallback = true;
      }
    } else {
      fallback = true;
    }

    if (prevWrap != null) {
      wrap = clamp(wrap, prevWrap - 0.03, prevWrap + 0.03);
    }
    let s = front + sSign * wrap;
    s = clampSeamS(s, front);
    if (prevS != null && Math.abs(s - prevS) > 0.08) {
      s = clamp(s, prevS - 0.05, prevS + 0.05);
      s = sSign < 0 ? Math.min(s, front - 0.06) : Math.max(s, front + 0.06);
      jumps++;
    }
    wrap = sSign * (s - front);
    prevS = s;
    prevWrap = wrap;
    slices.push({
      y,
      s,
      point: hit?.p ?? null,
      kappa: hit?.kappa ?? null,
      fallback,
      frontS: front,
      widthS: wrap,
    });
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < slices.length - 1; i++) {
      const sm =
        0.2 * slices[i - 1].widthS +
        0.6 * slices[i].widthS +
        0.2 * slices[i + 1].widthS;
      slices[i].widthS = sm;
      slices[i].s = slices[i].frontS + sSign * sm;
    }
  }
  const ys = slices.map((s) => s.y);
  const wraps = slices.map((s) => s.widthS);
  const wrapFn = monotoneCubicInterp(ys, wraps);
  const backS = (y) => {
    const front = frontSFn ? frontSFn(y) : sSign;
    const w = clamp(
      wrapFn(clamp(y, ys[0], ys.at(-1))),
      0.06,
      knobs.wrapMid + 0.08,
    );
    return clampSeamS(front + sSign * w, front);
  };

  let maxJump = 0;
  for (let i = 1; i < slices.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(slices[i].s - slices[i - 1].s));
  }
  const ss = slices.map((s) => s.s);
  const widthVar = Math.max(...wraps) - Math.min(...wraps);

  return {
    name: backSeamName,
    side,
    method: "96-slice-curvature-normal-turn",
    coverage,
    slices,
    backS,
    diagnostics: {
      sliceCount: slices.length,
      jumps,
      maxJump,
      continuous: maxJump <= 0.1 && jumps <= 32,
      meanS: ss.reduce((a, b) => a + b, 0) / ss.length,
      minS: Math.min(...ss),
      maxS: Math.max(...ss),
      widthVar,
      invadeBack: ss.some((s) => Math.abs(s) > 1.6),
      alwaysBehindFront: slices.every(
        (sl) => sSign * (sl.s - sl.frontS) >= 0.059,
      ),
      fallbackSlices: slices.filter((s) => s.fallback).length,
    },
  };
}

function decodeRefine(buffer, range = FIELD_RANGE_M) {
  const count = Math.floor(buffer.length / 10);
  const triangles = new Uint32Array(count);
  const midValues = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    triangles[i] = buffer.readUInt32LE(i * 10);
    for (let k = 0; k < 3; k++) {
      midValues[i * 3 + k] =
        (buffer.readInt16LE(i * 10 + 4 + k * 2) / 32767) * range;
    }
  }
  return { triangles, midValues };
}

function isSideLateralSeamTriangle(mesh, t, values, bounds, field, sideHint, side) {
  const { xSign } = getRibsSideConfig(side);
  const I = mesh.indices;
  const P = mesh.positions;
  const a = I[t * 3];
  const b = I[t * 3 + 1];
  const c = I[t * 3 + 2];
  const fa = values[a];
  const fb = values[b];
  const fc = values[c];
  if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) return false;
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
  const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  if (xSign * cx < -0.01) return false;
  const rs = computeSSurface(cx, cy, cz, field);
  const s0 = rs?.s ?? 0;
  const own = lateralSOf(bounds, side);
  const other = lateralSOf(bounds, side === "right" ? "left" : "right");
  const dOwn = Math.abs(s0 - own(cy));
  const dOther = Math.abs(s0 - other(cy));
  const dUpper = Math.abs(cy - bounds.upperY(clamp(s0, -1, 1)));
  const dLower = Math.abs(cy - bounds.lowerY(clamp(s0, -1, 1)));
  const nearLateral = dOwn <= Math.min(dOther, dUpper, dLower) + 0.01;
  if (!nearLateral) return false;
  if (sideHint === "chest") return cy >= bounds.meta.imfLatY - 0.03;
  if (sideHint === "abdomen") return cy <= bounds.meta.imfLatY + 0.04;
  return true;
}

/**
 * Extract the shared anterior ribs seam from the official C07 + B01 laterals
 * on the requested side. Reads official sidecars; never writes them.
 * @param {BodySide} side
 */
export function extractSharedFrontRibsSeam(ctx, side = "right") {
  const cfg = getRibsSideConfig(side);
  const { mesh, field, chestBounds, abdomenBounds } = ctx;
  const chestBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const chestRefineBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
  );
  const abdBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
  );
  const abdRefineBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin"),
  );
  const chestValues = decodeSnorm16(chestBin, mesh.vertexCount, FIELD_RANGE_M);
  const abdValues = decodeSnorm16(abdBin, mesh.vertexCount, FIELD_RANGE_M);
  const chestRefine = decodeRefine(chestRefineBin);
  const abdRefine = decodeRefine(abdRefineBin);

  const triangles = [];
  const midValues = [];
  const barycentric = [];
  const refinedPositions = [];
  const curveOrder = [];
  const sources = [];

  const ingest = (refine, values, bounds, source) => {
    for (let i = 0; i < refine.triangles.length; i++) {
      const t = refine.triangles[i];
      if (
        !isSideLateralSeamTriangle(mesh, t, values, bounds, field, source, side)
      ) {
        continue;
      }
      triangles.push(t);
      midValues.push(
        refine.midValues[i * 3],
        refine.midValues[i * 3 + 1],
        refine.midValues[i * 3 + 2],
      );
      sources.push(source);
      const I = mesh.indices;
      const P = mesh.positions;
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const mids = [
        [
          (P[a * 3] + P[b * 3]) / 2,
          (P[a * 3 + 1] + P[b * 3 + 1]) / 2,
          (P[a * 3 + 2] + P[b * 3 + 2]) / 2,
        ],
        [
          (P[b * 3] + P[c * 3]) / 2,
          (P[b * 3 + 1] + P[c * 3 + 1]) / 2,
          (P[b * 3 + 2] + P[c * 3 + 2]) / 2,
        ],
        [
          (P[c * 3] + P[a * 3]) / 2,
          (P[c * 3 + 1] + P[a * 3 + 1]) / 2,
          (P[c * 3 + 2] + P[a * 3 + 2]) / 2,
        ],
      ];
      for (const p of mids) {
        refinedPositions.push(p.map((v) => +v.toFixed(6)));
        const r = computeSSurface(p[0], p[1], p[2], field);
        curveOrder.push({
          point: p.map((v) => +v.toFixed(6)),
          s: r?.s ?? null,
          y: +p[1].toFixed(6),
          source,
        });
      }
      barycentric.push(
        { edge: "ab", u: 0.5, v: 0.5, w: 0, source },
        { edge: "bc", u: 0, v: 0.5, w: 0.5, source },
        { edge: "ca", u: 0.5, v: 0, w: 0.5, source },
      );
    }
  };

  ingest(chestRefine, chestValues, chestBounds, "C07");
  ingest(abdRefine, abdValues, abdomenBounds, "B01");

  curveOrder.sort((a, b) => b.y - a.y || (a.s ?? 0) - (b.s ?? 0));

  return {
    version: "4.3",
    name: cfg.seamName,
    side,
    regionId: cfg.regionId,
    chestCandidateId: "C07",
    abdomenCandidateId: "B01",
    sharedFrontSource: cfg.sharedFrontSource,
    geometryHash: ctx.identity.geometryHash,
    indexHash: ctx.identity.indexHash,
    fieldHashChest: OFFICIAL_TORSO_REGIONS.chest.fieldHash,
    refinementHashChest: OFFICIAL_TORSO_REGIONS.chest.refinementHash,
    fieldHashAbdomen: OFFICIAL_TORSO_REGIONS.abdomen.fieldHash,
    refinementHashAbdomen: OFFICIAL_TORSO_REGIONS.abdomen.refinementHash,
    maskHash: OFFICIAL_TORSO_REGIONS.maskHash,
    triangleCount: triangles.length,
    triangles,
    midValues,
    barycentric,
    refinedPositions,
    curveOrder,
    sources,
    seamHash: contentHash16(
      Buffer.from(
        JSON.stringify({
          side,
          triangles,
          midValues: midValues.map((v) => +v.toFixed(6)),
          sources,
        }),
      ),
    ),
  };
}

/**
 * Anterior shared-seam QA: the ribs anterior frontier must be bit-identical to
 * the official C07/B01 lateral on this side over the active Y band.
 * @param {BodySide} side
 */
export function measureSharedFrontSeamSide(
  sharedFront,
  chestBounds,
  abdomenBounds,
  field,
  yLo,
  yHi,
  side = "right",
) {
  const chestLateral = lateralSOf(chestBounds, side);
  const abdomenLateral = lateralSOf(abdomenBounds, side);
  const ySeam = sharedFront.ySeam;
  const N = 64;
  const dists = [];
  let gap = 0;
  let overlap = 0;
  for (let i = 0; i < N; i++) {
    const y = lerp(yLo, yHi, i / (N - 1));
    const expected =
      y >= ySeam - 0.002 ? chestLateral(y) : abdomenLateral(y);
    const got = sharedFront.frontS(y);
    const { lenR, lenL } = metersPerSAtY(field, y);
    const d = qMetric(got, lenR, lenL) - qMetric(expected, lenR, lenL);
    dists.push(Math.abs(d));
    if (d > 0.0001) gap++;
    if (d < -0.0001) overlap++;
  }
  const sorted = [...dists].sort((a, b) => a - b);
  const stats = {
    n: sorted.length,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted[sorted.length - 1],
  };
  return {
    side,
    ...stats,
    gap,
    overlap,
    points: stats.n,
    source: getRibsSideConfig(side).sharedFrontSource,
    pass:
      stats.mean <= 1e-9 &&
      stats.p95 <= 1e-9 &&
      stats.max <= 0.0001 &&
      gap === 0 &&
      overlap === 0,
  };
}

export { SLICE_COUNT as RIBS_SLICE_COUNT };
