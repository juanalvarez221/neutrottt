/**
 * Right Ribs Anatomical Surface V4.0 — lateral torso Geometry Distance Field.
 *
 * Shared anterior seam reuses exact C07 / B01 right laterals.
 * Posterior seam (right_side_back_seam) from 96-slice curvature.
 * Candidates R01–R04 vary only posteriorCoverage × waistClearance.
 *
 * Never rewrites official chest/abdomen/mask sidecars.
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
  intersectMeshAtY,
  selectTorsoPolyline,
  stitchPolylines,
  N_SLICES,
} from "./surface-s-field.mjs";
import {
  analyticalSignedDistance,
  computeSSurfaceForSdf,
  metersPerSAtY,
  qMetric,
  signedDistanceFromS,
} from "./generate-full-chest-sdf.mjs";
import {
  buildBoundaryRefinement,
  buildDerivedMesh,
  countPositives,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  validateIsoline,
} from "./generate-full-chest-geometry-field.mjs";
import { countRegionComponents } from "./full-chest-v26.mjs";

/** Lenient connectivity for thin lateral patches (crossing tris count). */
export function countRegionComponentsLenient(mesh, values) {
  const base = countRegionComponents(mesh, values);
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
    if (Math.max(values[a], values[b], values[c]) <= 0) continue;
    const nodes = [a, b, c].filter((i) => values[i] > -0.001);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) union(nodes[i], nodes[j]);
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
  const significant = comps.filter((s) => s >= Math.max(3, largest * 0.01));
  return {
    components: significant.length || base.components,
    sizes: comps,
    regionTris: base.regionTris,
  };
}
import {
  deriveAbdomenLandmarks,
  loadGeometryIdentity,
} from "./derive-abdomen-landmarks.mjs";
import {
  buildFrozenC07ChestBounds,
  FROZEN_C07,
  OFFICIAL_CHEST_HASHES,
} from "./full-abdomen-v30.mjs";
import {
  assertOfficialChestFrozen,
  buildAbdomenV31Boundaries,
  buildErrorDrivenRefinement,
  buildInguinalInferior,
  buildV31Context,
  deriveCurvatureLaterals,
  validateMultiLevelRefinement,
} from "./full-abdomen-v31.mjs";
import {
  applyIsolineConditionedTessellation,
  collectResidualTriangles,
  measureTriangleIsolineErrors,
} from "./full-abdomen-v32.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const SLICE_COUNT = 96;
const ERROR_THRESH_M = 0.001;
const MAX_TRI_GROWTH = 0.05;
const MIN_WIDTH_RATIO = 0.35;

export const FROZEN_B01 = Object.freeze({
  id: "B01",
  pubicClearance: 0.014,
  inguinalSideRise: 0.01,
  fieldHash: "30a41c0dcc820ab0",
  refinementHash: "e624d3f9ecc9d40a",
});

export const FROZEN_TORSO_FRONT = Object.freeze({
  maskHash: "8f68930e75e0",
  chest: OFFICIAL_CHEST_HASHES,
  abdomen: FROZEN_B01,
});

const POSTERIOR_S = {
  // wrap in s-units behind shared front: under-axilla / mid-rib / waist
  conservative: { wrapTop: 0.28, wrapMid: 0.4, wrapWaist: 0.24 },
  medium: { wrapTop: 0.34, wrapMid: 0.5, wrapWaist: 0.3 },
};

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
export function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function contentHash12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

/** R01–R04: posteriorCoverage × waistClearance only. */
export function buildRightRibsCandidateGrid() {
  // Spec order: R01 cons/10, R02 med/10, R03 cons/16, R04 med/16
  return [
    { id: "R01", posteriorCoverage: "conservative", waistClearance: 0.01 },
    { id: "R02", posteriorCoverage: "medium", waistClearance: 0.01 },
    { id: "R03", posteriorCoverage: "conservative", waistClearance: 0.016 },
    { id: "R04", posteriorCoverage: "medium", waistClearance: 0.016 },
  ];
}

export function assertTorsoFrontFrozen(root = ROOT) {
  const chest = assertOfficialChestFrozen(root);
  const fieldsDir = path.join(root, "public/models/interaction/fields");
  const regionFields = JSON.parse(
    readFileSync(path.join(fieldsDir, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const abd = regionFields.fields.find((f) => f.regionId === "full_abdomen");
  const abdField = readFileSync(
    path.join(fieldsDir, "neutro_body_v1_full_abdomen_sdf.bin"),
  );
  const abdRefine = readFileSync(
    path.join(fieldsDir, "neutro_body_v1_full_abdomen_refine.bin"),
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
  // After right_ribs official promotion the categorical maskHash advances;
  // chest/abdomen field sidecars remain the freeze authority.
  const ribsPromoted = regionFields.fields.some(
    (f) => f.regionId === "right_ribs",
  );
  const maskOk =
    ribsPromoted || maskManifest.maskHash === FROZEN_TORSO_FRONT.maskHash;
  const ok =
    chest.intact &&
    abd?.candidateId === FROZEN_B01.id &&
    abd?.fieldHash === FROZEN_B01.fieldHash &&
    abd?.refinement?.hash === FROZEN_B01.refinementHash &&
    contentHash16(abdField) === FROZEN_B01.fieldHash &&
    contentHash16(abdRefine) === FROZEN_B01.refinementHash &&
    maskOk;
  if (!ok) {
    const err = new Error("TORSO_FRONT_REGRESSION_DETECTED");
    err.details = {
      chest,
      abdomen: {
        candidateId: abd?.candidateId,
        fieldHash: abd?.fieldHash,
        refinementHash: abd?.refinement?.hash,
        fieldBin: contentHash16(abdField),
        refineBin: contentHash16(abdRefine),
      },
      maskHash: maskManifest.maskHash,
    };
    throw err;
  }
  return {
    chestFieldHash: chest.fieldHash,
    chestRefinementHash: chest.refinementHash,
    abdomenFieldHash: abd.fieldHash,
    abdomenRefinementHash: abd.refinement.hash,
    maskHash: maskManifest.maskHash,
    intact: true,
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
 * Walk right lateral arc from anterior axillary fold toward the back on a
 * closed torso polyline. Returns ordered points (front → back).
 */
function extractRightLateralArc(pts, y, lm, closed) {
  const axR = lm.points.anteriorAxillaryFoldRight;
  const targetR = [axR[0], y, axR[2]];
  const n = pts.length;
  let iStart = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (pts[i][0] > 0.02) continue;
    const d = Math.hypot(pts[i][0] - targetR[0], pts[i][2] - targetR[2]);
    if (d < bestD) {
      bestD = d;
      iStart = i;
    }
  }

  // Prefer direction that increases |x| toward right then decreases z (back).
  const tryWalk = (dir) => {
    const path = [pts[iStart]];
    let i = iStart;
    let guard = 0;
    while (guard++ < n) {
      i = closed ? (i + dir + n) % n : i + dir;
      if (!closed && (i < 0 || i >= n)) break;
      if (closed && i === iStart && path.length > 2) break;
      path.push(pts[i]);
      // Stop once we wrap past mid-back toward left.
      if (path.length > 8 && pts[i][0] > 0.04) break;
    }
    return path;
  };

  const a = tryWalk(+1);
  const b = tryWalk(-1);
  const score = (path) => {
    let minX = 0;
    let minZ = Infinity;
    let lateral = 0;
    for (const p of path) {
      minX = Math.min(minX, p[0]);
      minZ = Math.min(minZ, p[2]);
      if (p[0] < -0.05 && p[2] > -0.12) lateral++;
    }
    return lateral * 2 + Math.abs(minX) * 8 + Math.max(0, -minZ) * 4;
  };
  const path = score(a) >= score(b) ? a : b;

  // Dedup
  const clean = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(
      path[i][0] - clean.at(-1)[0],
      path[i][2] - clean.at(-1)[2],
    );
    if (d > 1e-4) clean.push(path[i]);
  }
  return clean;
}

/**
 * Locate first stable lateral→posterior transition on the right arc.
 */
function findPosteriorTransition(arcPts, field, y, prevS, coverage) {
  if (!arcPts || arcPts.length < 6) return null;
  const { kappa, normalTurn, tangentAngle } = discreteCurvatureXZ(arcPts);
  const smooth = new Float64Array(kappa.length);
  for (let i = 0; i < kappa.length; i++) {
    const a = kappa[Math.max(0, i - 1)];
    const b = kappa[i];
    const c = kappa[Math.min(kappa.length - 1, i + 1)];
    smooth[i] = (a + b + c) / 3;
  }

  // Cumulative orientation change from lateral (-X) toward posterior (-Z).
  let cumTurn = 0;
  const cum = new Float64Array(arcPts.length);
  for (let i = 1; i < arcPts.length; i++) {
    const nx = -(arcPts[i][2] - arcPts[i - 1][2]); // outward-ish normal proxy
    const nz = arcPts[i][0] - arcPts[i - 1][0];
    const nlen = Math.hypot(nx, nz) || 1;
    const ox = nx / nlen;
    const oz = nz / nlen;
    // Lateral face ≈ outward -X (ox≈-1); posterior ≈ -Z (oz≈-1).
    const lateralness = clamp(-ox, 0, 1);
    const posteriorness = clamp(-oz, 0, 1);
    cumTurn += Math.max(0, posteriorness - lateralness * 0.35) + normalTurn[i];
    cum[i] = cumTurn;
  }

  let best = null;
  let bestScore = -Infinity;
  for (let i = 3; i < arcPts.length - 3; i++) {
    const p = arcPts[i];
    if (p[0] > -0.04) continue;
    if (p[2] > 0.06) continue; // still too frontal
    const r =
      computeSSurface(p[0], y, p[2], field) ??
      computeSSurfaceForSdf(p[0], y, p[2], field);
    if (!r || !Number.isFinite(r.s)) continue;
    const s = r.s;
    if (s > -0.85 || s < -1.75) continue;
    const isLocalMax =
      smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1];
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
  return best;
}

/**
 * Build right_side_back_seam over 96 horizontal sections.
 *
 * Posterior s is always frontS(y) - wrap(y). wrap(y) comes from a
 * anatomical envelope (wide under axilla / mid rib, moderate waist pinch)
 * lightly modulated by the first stable lateral→posterior curvature max.
 */
export function deriveRightSideBackSeam(
  mesh,
  lm,
  field,
  yTop,
  yBot,
  coverage,
  frontSFn,
) {
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

  const slices = [];
  let prevS = null;
  let prevWrap = null;
  let jumps = 0;
  for (let i = 0; i < SLICE_COUNT; i++) {
    const y = lerp(yTop, yBot, i / (SLICE_COUNT - 1));
    const front = frontSFn ? frontSFn(y) : -1;
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
      const arc = extractRightLateralArc(poly, y, lm, closed);
      hit = findPosteriorTransition(arc, field, y, prevS, coverage);
      if (hit && Number.isFinite(hit.s) && hit.s < front - 0.04) {
        const observed = front - hit.s;
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
    let s = front - wrap;
    s = clamp(s, -1.55, front - 0.06);
    if (prevS != null && Math.abs(s - prevS) > 0.08) {
      s = clamp(s, prevS - 0.05, prevS + 0.05);
      s = Math.min(s, front - 0.06);
      jumps++;
    }
    wrap = front - s;
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
      slices[i].s = slices[i].frontS - sm;
    }
  }
  const ys = slices.map((s) => s.y);
  const wraps = slices.map((s) => s.widthS);
  const wrapFn = monotoneCubicInterp(ys, wraps);
  const backS = (y) => {
    const front = frontSFn ? frontSFn(y) : -1;
    const w = clamp(
      wrapFn(clamp(y, ys[0], ys.at(-1))),
      0.06,
      knobs.wrapMid + 0.08,
    );
    return clamp(front - w, -1.55, front - 0.06);
  };

  let maxJump = 0;
  for (let i = 1; i < slices.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(slices[i].s - slices[i - 1].s));
  }
  const ss = slices.map((s) => s.s);
  const widthVar = Math.max(...wraps) - Math.min(...wraps);

  return {
    name: "right_side_back_seam",
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
      invadeBack: ss.some((s) => s < -1.6),
      alwaysBehindFront: slices.every((s) => s.s <= s.frontS - 0.059),
    },
  };
}

/**
 * Shared anterior frontS(y) = C07.rightS above seam, B01.rightS below.
 */
export function buildSharedFrontS(chestBounds, abdomenBounds) {
  const seamY = (y) => {
    // Chest–abdomen seam height at the right lateral.
    const sProbe = chestBounds.rightS(y);
    return chestBounds.lowerY(clamp(sProbe, -1, 1));
  };
  // Approximate seam Y at lateral using chest IMF lateral.
  const ySeam = chestBounds.meta.imfLatY;
  const frontS = (y) => {
    if (y >= ySeam - 0.002) return chestBounds.rightS(y);
    return abdomenBounds.rightS(y);
  };
  return { frontS, ySeam, seamY };
}

/**
 * Superior frontier: base of right axilla (anterior fold → lateral base → posterior fold).
 */
export function buildAxillaSuperior(lm, field, geometryHash) {
  const axA = lm.points.anteriorAxillaryFoldRight;
  const axPRaw =
    lm.points.posteriorAxillaryFoldRight ??
    derivePosteriorAxilla(lm, geometryHash);
  const shoulder = lm.points.shoulderRight;
  // Deterministic hash-tied micro-adjust (<1 mm) for reproducibility stamp.
  const stamp = parseInt(geometryHash.slice(0, 4), 16) / 0xffff;
  const yAdj = (stamp - 0.5) * 0.001;

  // Product surface starts below the axilla — drop posterior fold to the base.
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
    { s: -0.98, y: yAnterior, label: "axillaAnterior" },
    { s: -1.12, y: yBase, label: "axillaLateralBase" },
    { s: -1.28, y: yPosterior, label: "axillaPosterior" },
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
    if (r) a.s = clamp(r.s, -1.55, -0.7);
  }

  // Keep anchors sorted by |s| ascending for hermite domain.
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
    const abs = Math.abs(clamp(s, -1.7, -0.5));
    return upperHalf(clamp(abs, sMin, sMax));
  };

  const ys = anchors.map((a) => a.y);
  const tip =
    Math.max(...ys) - Math.min(...ys) < 0.003 ||
    ys[1] > Math.max(ys[0], ys[2]) + 0.015;

  return {
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

function derivePosteriorAxilla(lm, geometryHash) {
  const axA = lm.points.anteriorAxillaryFoldRight;
  const shoulder = lm.points.shoulderRight;
  const stamp = parseInt(geometryHash.slice(4, 8), 16) / 0xffff;
  return [
    lerp(axA[0], shoulder[0], 0.35),
    lerp(axA[1], shoulder[1], 0.55) - 0.01,
    lerp(axA[2], -0.18, 0.75) - stamp * 0.002,
  ];
}

/**
 * Inferior frontier: upper lateral waist, before hip / iliac crest.
 */
export function buildWaistInferior(lm, field, frontS, backS, waistClearance) {
  const waistF = lm.points.waistFront;
  const waistB = lm.points.waistBack;
  const iliac = lm.points.iliacCrestRight;
  const hip = lm.points.hipRight;
  const yWaist = 0.55 * waistF[1] + 0.45 * waistB[1];
  const yHipBand = Math.max(hip[1], iliac[1] * 0.15 + hip[1] * 0.85);
  const yEnd = yWaist - waistClearance;
  // Soft curve: slightly higher toward front, lower toward back — not a hard cut.
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
    const abs = Math.abs(clamp(s, -1.6, -0.5));
    return half(
      clamp(abs, Math.min(Math.abs(sFront), Math.abs(sBack)), Math.max(Math.abs(sFront), Math.abs(sBack))),
    );
  };

  const beforeHip = yEnd > yHipBand + 0.01;
  const beforeIliac = yEnd > iliac[1] + 0.02 || iliac[1] > 1.2; // iliac landmark may be extreme
  return {
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

export function buildRightRibsBoundaries(
  chestBounds,
  abdomenBounds,
  superior,
  inferior,
  backSeam,
  sharedFront,
  params,
) {
  const { frontS, ySeam } = sharedFront;
  const backS = backSeam.backS;
  // Domain: backS(y) <= s <= frontS(y), lowerY <= y <= upperY
  const leftS = (y) => frontS(y); // anterior (shared)
  const rightS = (y) => backS(y); // posterior
  const upperY = superior.upperY;
  const lowerY = inferior.lowerY;
  return {
    upperY,
    lowerY,
    leftS,
    rightS,
    meta: {
      yTop: Math.max(...superior.anchors.map((a) => a.y)),
      yBot: inferior.yEnd,
      ySeam,
      side: "right",
      posteriorCoverage: params.posteriorCoverage,
      waistClearance: params.waistClearance,
      sharedFrontSource: "C07.rightS+B01.rightS",
      posteriorSource: "right_side_back_seam",
      superiorMethod: "axilla-base-hermite",
      inferiorMethod: "waist-lateral-hermite",
    },
  };
}

/**
 * Build a right-lateral arc atlas (front→back) for metric signed distance.
 * s_surface alone cannot author posterior-lateral costal walls.
 */
export function buildRightLateralArcAtlas(mesh, lm, frontSFn, backSFn, yTop, yBot) {
  const slices = [];
  for (let i = 0; i < SLICE_COUNT; i++) {
    const y = lerp(yTop, yBot, i / (SLICE_COUNT - 1));
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const picked = selectTorsoPolyline(polys, y, lm, null);
    const poly = picked.best?.poly?.pts;
    if (!poly?.length) {
      slices.push({ y, arc: null, frontLen: 0, backLen: 0 });
      continue;
    }
    const closed =
      Math.hypot(poly[0][0] - poly.at(-1)[0], poly[0][2] - poly.at(-1)[2]) <
      1e-3;
    const arc = extractRightLateralArc(poly, y, lm, closed);
    // Cumulative arc length from anterior end.
    const cum = [0];
    for (let k = 1; k < arc.length; k++) {
      cum.push(
        cum[k - 1] +
          Math.hypot(arc[k][0] - arc[k - 1][0], arc[k][2] - arc[k - 1][2]),
      );
    }
    // Locate front / back targets by nearest point with matching s-proxy via XZ.
    // Front: most anterior among right points near start; back: match back wrap.
    let iFront = 0;
    let bestF = Infinity;
    for (let k = 0; k < arc.length; k++) {
      // Prefer high z (anterior) near the start of the right arc.
      const score =
        Math.abs(arc[k][0] - (lm.points.anteriorAxillaryFoldRight[0] ?? -0.13)) *
          0.5 -
        arc[k][2];
      if (score < bestF) {
        bestF = score;
        iFront = k;
      }
    }
    // Re-accumulate from iFront toward increasing backness (decreasing z).
    const dir = iFront < arc.length / 2 ? 1 : -1;
    const ordered = [];
    for (let step = 0; step < arc.length; step++) {
      const idx = closed
        ? (iFront + dir * step + arc.length) % arc.length
        : iFront + dir * step;
      if (!closed && (idx < 0 || idx >= arc.length)) break;
      const p = arc[idx];
      if (ordered.length && p[0] > 0.05) break;
      ordered.push(p);
      if (ordered.length > 8 && p[2] < -0.2) break;
    }
    const oc = [0];
    for (let k = 1; k < ordered.length; k++) {
      oc.push(
        oc[k - 1] +
          Math.hypot(
            ordered[k][0] - ordered[k - 1][0],
            ordered[k][2] - ordered[k - 1][2],
          ),
      );
    }
    // Front length 0; back length from wrap via fraction of total usable arc.
    // Use relative s wrap mapped to arc fraction.
    const front = frontSFn(y);
    const back = backSFn(y);
    const wrapS = Math.max(0.05, front - back);
    // Map wrap in s (~0.3–0.5) onto ~35–70% of the lateral arc.
    const frac = clamp(0.25 + wrapS * 0.7, 0.3, 0.75);
    const backLen = oc.at(-1) * frac;
    slices.push({
      y,
      points: ordered,
      cum: oc,
      frontLen: 0,
      backLen,
      total: oc.at(-1),
    });
  }
  return { slices, yTop, yBot };
}

function atlasSlicePair(atlas, y) {
  const sl = atlas.slices;
  if (y <= sl[0].y) return [0, 0, 0];
  if (y >= sl.at(-1).y) return [sl.length - 2, sl.length - 1, 1];
  for (let i = 0; i < sl.length - 1; i++) {
    if (y >= sl[i].y && y <= sl[i + 1].y) {
      const t = (y - sl[i].y) / Math.max(1e-9, sl[i + 1].y - sl[i].y);
      return [i, i + 1, clamp(t, 0, 1)];
    }
  }
  return [sl.length - 2, sl.length - 1, 1];
}

function projectToAtlasSlice(x, z, slice) {
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
  return { len: bestLen, dist: bestD };
}

/** Metric signed distance on the right lateral arc atlas. */
export function lateralArcSignedDistance(x, y, z, bounds, atlas, field = null) {
  if (x > 0.03) return -FIELD_RANGE_M;
  if (y > bounds.meta.yTop + 0.01 || y < bounds.meta.yBot - 0.01) {
    const dY =
      y > bounds.meta.yTop ? bounds.meta.yTop - y : y - bounds.meta.yBot;
    return -Math.min(FIELD_RANGE_M, Math.abs(dY));
  }
  // Anterior gate: shared frontS from C07/B01 — medial of front is outside.
  if (field) {
    const r =
      computeSSurface(x, y, z, field) ?? computeSSurfaceForSdf(x, y, z, field);
    if (r) {
      const front = bounds.leftS(y);
      const { lenR, lenL } = metersPerSAtY(field, y);
      // Right side: s decreases toward the back. Medial/chest ⇒ s > front.
      // dMedial = q(s) - q(front); positive when toward sternum.
      const dMedial =
        qMetric(r.s, lenR, lenL) - qMetric(front, lenR, lenL);
      if (dMedial > 0.001) return -Math.min(FIELD_RANGE_M, dMedial);
    }
  }
  const [ia, ib, ty] = atlasSlicePair(atlas, y);
  const a = atlas.slices[ia];
  const b = atlas.slices[ib] ?? a;
  if (!a?.points?.length || !b?.points?.length) return null;
  const pa = projectToAtlasSlice(x, z, a);
  const pb = projectToAtlasSlice(x, z, b);
  if (!pa || !pb) return null;
  const dist = lerp(pa.dist, pb.dist, ty);
  if (dist > 0.028) return -Math.min(FIELD_RANGE_M, dist);
  const len = lerp(pa.len, pb.len, ty);
  const backLen = Math.max(0.02, lerp(a.backLen, b.backLen, ty));
  const upper = bounds.upperY(bounds.leftS(y));
  const lower = bounds.lowerY(bounds.leftS(y));
  const dFront = len;
  const dBack = backLen - len;
  const dUpper = upper - y;
  const dLower = y - lower;
  const inside = dFront >= 0 && dBack >= 0 && dUpper >= 0 && dLower >= 0;
  if (inside) {
    return Math.min(dFront, dBack, dUpper, dLower, FIELD_RANGE_M);
  }
  const viol = [];
  if (dFront < 0) viol.push(-dFront);
  if (dBack < 0) viol.push(-dBack);
  if (dUpper < 0) viol.push(-dUpper);
  if (dLower < 0) viol.push(-dLower);
  if (viol.length === 1) return -viol[0];
  let acc = 0;
  for (const v of viol) acc += v * v;
  return -Math.sqrt(acc);
}

export function buildRightRibsVertexField(mesh, bounds, field, atlas) {
  const values = new Float32Array(mesh.vertexCount);
  const P = mesh.positions;
  let inDomain = 0;
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (x > 0.02) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const sd = atlas
      ? lateralArcSignedDistance(x, y, z, bounds, atlas, field)
      : (() => {
          const r =
            computeSSurface(x, y, z, field) ??
            computeSSurfaceForSdf(x, y, z, field);
          return r ? signedDistanceFromS(r.s, y, bounds, field) : null;
        })();
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

function ribsAnalytical(x, y, z, bounds, field) {
  if (bounds?.meta?.atlas) {
    return lateralArcSignedDistance(
      x,
      y,
      z,
      bounds,
      bounds.meta.atlas,
      field,
    );
  }
  return analyticalSignedDistance(x, y, z, bounds, field);
}

function validateRibsIsoline(mesh, values, bounds, field) {
  // Mirror validateIsoline but with lateral-arc analytical authority.
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
    for (let s = 0; s <= 8; s++) {
      const t0 = s / 8;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * t0;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * t0;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * t0;
      const d = ribsAnalytical(x, y, z, bounds, field);
      if (d == null) continue;
      errs.push(Math.abs(d));
    }
  }
  if (!errs.length) {
    return {
      precision: { mean: 0, p95: 0, max: 0, n: 0 },
      crossingTriangles: 0,
    };
  }
  const sorted = [...errs].sort((a, b) => a - b);
  return {
    precision: {
      mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      max: sorted[sorted.length - 1],
      n: sorted.length,
    },
    crossingTriangles: errs.length,
  };
}

export function buildRightRibsExclusionSets(
  mesh,
  lm,
  chestBounds,
  abdomenBounds,
  field,
  chestValues,
  abdomenValues,
) {
  const P = mesh.positions;
  const chest = [];
  const abdomen = [];
  const arm = [];
  const deltoid = [];
  const axillaInternal = [];
  const back = [];
  const hip = [];
  const pelvis = [];
  const axA = lm.points.anteriorAxillaryFoldRight;
  const shoulder = lm.points.shoulderRight;
  const hipR = lm.points.hipRight;
  const elbow = lm.points.elbowRight;

  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (chestValues[i] > 0) chest.push(i);
    if (abdomenValues[i] > 0) abdomen.push(i);
    // Arm: far lateral of axilla crease (do not eat the costal wall).
    if (
      x < axA[0] - 0.07 &&
      y > axA[1] - 0.02 &&
      y < shoulder[1] + 0.02 &&
      z > -0.08
    ) {
      arm.push(i);
    }
    if (
      Math.hypot(x - shoulder[0], y - shoulder[1], z - shoulder[2]) < 0.045 &&
      y > shoulder[1] - 0.03
    ) {
      deltoid.push(i);
    }
    // Internal axilla pocket (high Y, recessed between folds).
    if (
      y > axA[1] + 0.005 &&
      y < shoulder[1] &&
      x > axA[0] - 0.01 &&
      x < -0.06 &&
      z < axA[2] - 0.02 &&
      z > -0.14
    ) {
      axillaInternal.push(i);
    }
    // Deep dorsal only — keep lateral–posterior transition free.
    if (z <= -0.175 && x > -0.16 && x < 0.05) back.push(i);
    if (y < hipR[1] + 0.02 && Math.abs(x) > 0.06 && y > hipR[1] - 0.08) {
      hip.push(i);
    }
    if (y < hipR[1] - 0.02 && Math.abs(x) < 0.12) pelvis.push(i);
    void elbow;
    void field;
    void chestBounds;
    void abdomenBounds;
  }
  return { chest, abdomen, arm, deltoid, axillaInternal, back, hip, pelvis };
}

export function analyzeWidthProfile(bounds, field, yTop, yBot) {
  const rows = [];
  for (let i = 0; i < 48; i++) {
    const y = lerp(yTop, yBot, i / 47);
    const fS = bounds.leftS(y);
    const bS = bounds.rightS(y);
    const { lenR, lenL } = metersPerSAtY(field, y);
    const widthM = Math.abs(qMetric(fS, lenR, lenL) - qMetric(bS, lenR, lenL));
    rows.push({ y, frontS: fS, backS: bS, widthM });
  }
  const widths = rows.map((r) => r.widthM);
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const min = Math.min(...widths);
  const max = Math.max(...widths);
  const frontSpan =
    Math.max(...rows.map((r) => r.frontS)) - Math.min(...rows.map((r) => r.frontS));
  const backSpan =
    Math.max(...rows.map((r) => r.backS)) - Math.min(...rows.map((r) => r.backS));
  const frontConst = Math.abs(frontSpan) < 0.012;
  const backConst = Math.abs(backSpan) < 0.012;
  const bottleneck = min < mean * MIN_WIDTH_RATIO;
  return {
    rows,
    mean,
    min,
    max,
    frontConstant: frontConst,
    backConstant: backConst,
    frontSpan,
    backSpan,
    bottleneck,
    minRatio: mean > 0 ? min / mean : 0,
    pass: !frontConst && !backConst && !bottleneck && mean > 0.03,
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

function isRightLateralSeamTriangle(mesh, t, values, bounds, field, sideHint) {
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
  if (cx > 0.01) return false;
  const rs = computeSSurface(cx, cy, cz, field);
  const s0 = rs?.s ?? 0;
  const dRight = Math.abs(s0 - bounds.rightS(cy));
  const dLeft = Math.abs(s0 - bounds.leftS(cy));
  const dUpper = Math.abs(cy - bounds.upperY(clamp(s0, -1, 1)));
  const dLower = Math.abs(cy - bounds.lowerY(clamp(s0, -1, 1)));
  const nearLateral = dRight <= Math.min(dLeft, dUpper, dLower) + 0.01;
  if (!nearLateral) return false;
  if (sideHint === "chest") {
    return cy >= bounds.meta.imfLatY - 0.03;
  }
  if (sideHint === "abdomen") {
    return cy <= bounds.meta.imfLatY + 0.04;
  }
  return true;
}

/**
 * Extract shared anterior ribs seam from official C07 + B01 right laterals.
 */
export function extractSharedFrontRibsSeam(ctx) {
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
      if (!isRightLateralSeamTriangle(mesh, t, values, bounds, field, source))
        continue;
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
    version: "4.0",
    name: "shared-front-ribs-seam",
    chestCandidateId: "C07",
    abdomenCandidateId: "B01",
    geometryHash: ctx.identity.geometryHash,
    indexHash: ctx.identity.indexHash,
    fieldHashChest: FROZEN_TORSO_FRONT.chest.fieldHash,
    refinementHashChest: FROZEN_TORSO_FRONT.chest.refinementHash,
    fieldHashAbdomen: FROZEN_B01.fieldHash,
    refinementHashAbdomen: FROZEN_B01.refinementHash,
    maskHash: FROZEN_TORSO_FRONT.maskHash,
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
          triangles,
          midValues: midValues.map((v) => +v.toFixed(6)),
          sources,
        }),
      ),
    ),
  };
}

/**
 * Anterior shared seam QA: ribs.leftS must be bit-identical to C07/B01 rightS
 * over the active Y band. Gap/overlap of the analytic frontiers must be 0.
 */
export function measureSharedFrontSeam(
  mesh,
  values,
  sharedFront,
  bounds,
  field,
  chestBounds,
  abdomenBounds,
  ySeam,
) {
  const yLo = bounds.meta.yBot;
  const yHi = Math.min(bounds.meta.yTop, chestBounds.meta?.clavY ?? bounds.meta.yTop);
  const dists = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const y = lerp(yLo, yHi, i / (N - 1));
    const expected =
      y >= ySeam - 0.002 ? chestBounds.rightS(y) : abdomenBounds.rightS(y);
    const got = bounds.leftS(y);
    const { lenR, lenL } = metersPerSAtY(field, y);
    dists.push(Math.abs(qMetric(got, lenR, lenL) - qMetric(expected, lenR, lenL)));
  }
  // Gap / overlap between ribs anterior and source laterals (analytic).
  let gap = 0;
  let overlap = 0;
  for (let i = 0; i < N; i++) {
    const y = lerp(yLo, yHi, i / (N - 1));
    const expected =
      y >= ySeam - 0.002 ? chestBounds.rightS(y) : abdomenBounds.rightS(y);
    const got = bounds.leftS(y);
    const { lenR, lenL } = metersPerSAtY(field, y);
    const d = qMetric(got, lenR, lenL) - qMetric(expected, lenR, lenL);
    if (d > 0.0001) gap++;
    if (d < -0.0001) overlap++;
  }
  void mesh;
  void values;
  void sharedFront;
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
  const stats = summarize(dists);
  return {
    ...stats,
    gap,
    overlap,
    points: stats.n,
    pass:
      stats.mean <= 1e-9 &&
      stats.p95 <= 1e-9 &&
      stats.max <= 0.0001 &&
      gap === 0 &&
      overlap === 0,
  };
}

export function sampleRibsFieldAlignment(mesh, bounds, field, values, opts = {}) {
  const interiorN = opts.interior ?? 5000;
  const exteriorN = opts.exterior ?? 5000;
  const band = opts.band ?? 0.002;
  const P = mesh.positions;
  const interior = [];
  const exterior = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (Math.abs(v) < band) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const analytic = ribsAnalytical(x, y, z, bounds, field);
    if (analytic == null) continue;
    if (Math.abs(analytic) < band) continue;
    if (v > 0 && analytic > 0) interior.push(i);
    if (v < 0 && analytic < 0) exterior.push(i);
  }
  const pick = (arr, n) => {
    const out = [];
    if (!arr.length) return out;
    for (let k = 0; k < n; k++) {
      out.push(arr[(k * 9973) % arr.length]);
    }
    return out;
  };
  const inS = pick(interior, interiorN);
  const exS = pick(exterior, exteriorN);
  let inMis = 0;
  let exMis = 0;
  for (const i of inS) {
    const a = ribsAnalytical(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      bounds,
      field,
    );
    if (a == null || a <= 0 || values[i] <= 0) inMis++;
  }
  for (const i of exS) {
    const a = ribsAnalytical(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      bounds,
      field,
    );
    if (a == null || a >= 0 || values[i] >= 0) exMis++;
  }
  return {
    interior: inS.length,
    exterior: exS.length,
    interiorMismatches: inMis,
    exteriorMismatches: exMis,
    pass: inMis === 0 && exMis === 0,
  };
}

export function probeRaycastField(bounds, field, probes) {
  const results = [];
  for (const p of probes) {
    const d = ribsAnalytical(p.xyz[0], p.xyz[1], p.xyz[2], bounds, field);
    const hit = d != null && d >= 0;
    results.push({
      id: p.id,
      expect: p.expect,
      distanceMm: d == null ? null : +(d * 1000).toFixed(3),
      hit,
      pass: p.expect === "inside" ? hit : !hit,
    });
  }
  return {
    results,
    pass: results.every((r) => r.pass),
  };
}

export function buildV40Context(glbPath, landmarksPath, opts = {}) {
  const freeze = assertTorsoFrontFrozen();
  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  verifyLandmarkLaterality(lm);
  const mesh = loadMeshData(glbPath);
  const identity = loadGeometryIdentity(glbPath);
  const derived = deriveAbdomenLandmarks(
    mesh,
    lm,
    identity.geometryHash,
    identity.indexHash,
  );

  // Broad s_surface covering axilla → waist.
  const yBot = lm.points.hipRight[1] - 0.02;
  const yTop = lm.points.shoulderRight[1] + 0.02;
  const field = buildSurfaceSField(mesh, lm, yBot, yTop, N_SLICES);
  const chestBounds = buildFrozenC07ChestBounds(lm, field);
  const laterals = deriveCurvatureLaterals(field, chestBounds, derived, lm);
  const inferiorAbd = buildInguinalInferior(
    lm,
    field,
    derived,
    laterals,
    FROZEN_B01,
  );
  const abdomenBounds = buildAbdomenV31Boundaries(
    lm,
    field,
    derived,
    chestBounds,
    laterals,
    inferiorAbd,
    FROZEN_B01,
  );

  const sharedFront =
    opts.sharedFront ??
    extractSharedFrontRibsSeam({
      mesh,
      field,
      chestBounds,
      abdomenBounds,
      identity,
    });

  const chestBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const abdBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
  );
  const chestValues = decodeSnorm16(chestBin, mesh.vertexCount, FIELD_RANGE_M);
  const abdomenValues = decodeSnorm16(abdBin, mesh.vertexCount, FIELD_RANGE_M);

  return {
    mesh,
    lm,
    field,
    derived,
    identity,
    freeze,
    chestBounds,
    abdomenBounds,
    laterals,
    sharedFront,
    chestValues,
    abdomenValues,
    sharedFrontBuilder: buildSharedFrontS(chestBounds, abdomenBounds),
  };
}

export function evaluateRightRibsCandidate(ctx, params) {
  const {
    mesh,
    lm,
    field,
    identity,
    chestBounds,
    abdomenBounds,
    sharedFront,
    sharedFrontBuilder,
    chestValues,
    abdomenValues,
  } = ctx;

  const superior = buildAxillaSuperior(lm, field, identity.geometryHash);
  const yTop = superior.yMax + 0.005;
  const yBot = lm.points.waistFront[1] - 0.05;
  const backSeam = deriveRightSideBackSeam(
    mesh,
    lm,
    field,
    yTop,
    yBot,
    params.posteriorCoverage,
    sharedFrontBuilder.frontS,
  );
  const inferior = buildWaistInferior(
    lm,
    field,
    sharedFrontBuilder.frontS,
    backSeam.backS,
    params.waistClearance,
  );
  const bounds = buildRightRibsBoundaries(
    chestBounds,
    abdomenBounds,
    superior,
    inferior,
    backSeam,
    sharedFrontBuilder,
    params,
  );
  const atlas = buildRightLateralArcAtlas(
    mesh,
    lm,
    sharedFrontBuilder.frontS,
    backSeam.backS,
    Math.max(...superior.anchors.map((a) => a.y)) + 0.01,
    inferior.yEnd - 0.01,
  );
  bounds.meta.atlas = atlas;
  const width = analyzeWidthProfile(
    bounds,
    field,
    Math.min(...superior.anchors.map((a) => a.y)) - 0.005,
    inferior.yEnd + 0.008,
  );

  const { values } = buildRightRibsVertexField(mesh, bounds, field, atlas);
  const sets = buildRightRibsExclusionSets(
    mesh,
    lm,
    chestBounds,
    abdomenBounds,
    field,
    chestValues,
    abdomenValues,
  );
  const leaksBefore = {
    chest: countPositives(values, sets.chest),
    abdomen: countPositives(values, sets.abdomen),
    arm: countPositives(values, sets.arm),
    deltoid: countPositives(values, sets.deltoid),
    axillaInternal: countPositives(values, sets.axillaInternal),
    back: countPositives(values, sets.back),
    hip: countPositives(values, sets.hip),
    pelvis: countPositives(values, sets.pelvis),
  };
  // Hard exclusions only for non-shared anatomy. Chest/abdomen are already
  // bounded by the shared anterior frontS — only retract deep invasions.
  for (const key of ["arm", "deltoid", "axillaInternal", "back", "hip", "pelvis"]) {
    for (const i of sets[key]) {
      if (values[i] > 0) values[i] = -0.00025;
    }
  }
  for (const key of ["chest", "abdomen"]) {
    for (const i of sets[key]) {
      if (values[i] > 0.002) values[i] = -0.00025;
    }
  }
  const leaksAfter = {
    chest: countPositives(values, sets.chest),
    abdomen: countPositives(values, sets.abdomen),
    arm: countPositives(values, sets.arm),
    deltoid: countPositives(values, sets.deltoid),
    axillaInternal: countPositives(values, sets.axillaInternal),
    back: countPositives(values, sets.back),
    hip: countPositives(values, sets.hip),
    pelvis: countPositives(values, sets.pelvis),
  };

  const region = countRegionComponentsLenient(mesh, values);
  const isoline = validateRibsIsoline(mesh, values, bounds, field);
  const refinement = buildErrorDrivenRefinement(
    mesh,
    values,
    bounds,
    field,
    sharedFront,
    { errorThresh: ERROR_THRESH_M, maxGrowth: MAX_TRI_GROWTH },
  );
  // Re-author refine midpoints with lateral-arc analytical authority.
  {
    const I = mesh.indices;
    const P = mesh.positions;
    for (let i = 0; i < refinement.triangles.length; i++) {
      const t = refinement.triangles[i];
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const pairs = [
        [a, b],
        [b, c],
        [c, a],
      ];
      for (let k = 0; k < 3; k++) {
        const [i0, j0] = pairs[k];
        const mx = (P[i0 * 3] + P[j0 * 3]) / 2;
        const my = (P[i0 * 3 + 1] + P[j0 * 3 + 1]) / 2;
        const mz = (P[i0 * 3 + 2] + P[j0 * 3 + 2]) / 2;
        const d = ribsAnalytical(mx, my, mz, bounds, field);
        if (d != null && Math.abs(d) <= 0.008) {
          refinement.midValues[i * 3 + k] = clamp(
            d,
            -FIELD_RANGE_M,
            FIELD_RANGE_M,
          );
        }
      }
    }
    if (refinement.levels?.[0]) {
      refinement.levels[0].midValues = refinement.midValues;
    }
  }
  const derived = buildDerivedMesh(mesh, values, refinement);
  const refinedIsoline = validateRibsIsoline(
    derived.mesh,
    derived.values,
    bounds,
    field,
  );
  const refinedCheck = {
    result: refinedIsoline,
    mesh: derived.mesh,
    values: derived.values,
    triangleCount: derived.mesh.triangleCount,
  };
  void validateMultiLevelRefinement;
  void applyIsolineConditionedTessellation;
  void collectResidualTriangles;
  void measureTriangleIsolineErrors;
  void validateIsoline;
  const sharedDist = measureSharedFrontSeam(
    mesh,
    values,
    sharedFront,
    bounds,
    field,
    chestBounds,
    abdomenBounds,
    sharedFrontBuilder.ySeam,
  );

  // Stripe heuristic: aspect of bounding box of positive verts.
  const P = mesh.positions;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let posCount = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    posCount++;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i * 3 + k]);
      max[k] = Math.max(max[k], P[i * 3 + k]);
    }
  }
  const extentY = max[1] - min[1];
  const extentXZ = Math.hypot(max[0] - min[0], max[2] - min[2]);
  const stripeLike = extentY > 0.01 && extentXZ / extentY < 0.22;

  const filters = [];
  if (region.components !== 1) filters.push(`components=${region.components}`);
  // Speckle <1% of largest patch is already ignored by countRegionComponents.
  const tinyIslands = (region.sizes ?? [])
    .slice(1)
    .filter((s) => s >= Math.max(3, (region.sizes[0] ?? 0) * 0.01)).length;
  if (tinyIslands > 0) filters.push(`tinyIslands=${tinyIslands}`);
  if (!sharedDist.pass)
    filters.push(
      `front seam max=${(sharedDist.max * 1000).toFixed(3)}mm gap=${sharedDist.gap} overlap=${sharedDist.overlap}`,
    );
  if (!backSeam.diagnostics.continuous) filters.push("back seam discontinuous");
  if (backSeam.diagnostics.invadeBack) filters.push("back seam invades back");
  if (!superior.diagnostics.pass) filters.push("superior fail");
  if (!inferior.diagnostics.pass) filters.push("inferior fail");
  if (!width.pass) filters.push("width profile fail");
  if (width.bottleneck) filters.push("bottleneck");
  if (stripeLike) filters.push("stripe-like");
  for (const [k, v] of Object.entries(leaksAfter)) {
    if (v > 0) filters.push(`${k} positives ${v}`);
  }
  if (refinedIsoline.precision.max > 0.004)
    filters.push(`isoline max ${(refinedIsoline.precision.max * 1000).toFixed(2)}mm`);
  if (refinement.growth > MAX_TRI_GROWTH)
    filters.push(`tri growth ${(refinement.growth * 100).toFixed(1)}%`);

  const sidecarBytesEstimate = mesh.vertexCount * 2 + refinement.triangles.length * 10;
  if (sidecarBytesEstimate > 45 * 1024) filters.push("sidecar >45KB");

  const pass = filters.length === 0;

  return {
    id: params.id,
    params,
    pass,
    filters,
    bounds,
    values,
    backSeam,
    superior,
    inferior,
    width,
    region,
    leaksBefore,
    leaksAfter,
    isoline,
    refinement,
    refinedIsoline,
    sharedDist,
    stripeLike,
    positives: posCount,
    sidecarBytesEstimate,
  };
}

export function evaluateAllRightRibsCandidates(ctx) {
  const grid = buildRightRibsCandidateGrid();
  const results = grid.map((p) => evaluateRightRibsCandidate(ctx, p));
  const passing = results.filter((r) => r.pass);
  // Prefer medium wrap without stripe; then isoline max, then width.
  const scored = [...results].sort((a, b) => {
    const ap = a.pass ? 0 : 1;
    const bp = b.pass ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const as = (a.stripeLike ? 1 : 0) + a.refinedIsoline.precision.max * 50;
    const bs = (b.stripeLike ? 1 : 0) + b.refinedIsoline.precision.max * 50;
    if (as !== bs) return as - bs;
    return b.width.mean - a.width.mean;
  });
  const finalists = scored.filter((r) => r.pass).slice(0, 2).map((r) => r.id);
  // If none pass filters, still pick top 2 by score for visual review.
  if (finalists.length === 0) {
    finalists.push(...scored.slice(0, 2).map((r) => r.id));
  }
  return { results, finalists, passing: passing.map((r) => r.id), scored };
}

export {
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  FROZEN_C07,
  OFFICIAL_CHEST_HASHES,
  buildDerivedMesh,
  contentHash12,
};
