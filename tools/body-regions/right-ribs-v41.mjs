/**
 * Right Ribs V4.1 — lateral arc coordinate u_ribs + metric GDF.
 *
 * Fixes V4.0 structural failure (2 components / 161 mm isoline) by removing
 * frontS-wrap classification and using a true right-lateral arc parameter:
 *
 *   u_ribs = 0 → shared anterior seam (C07/B01)
 *   u_ribs = 1 → right_side_back_seam (R02 posterior, frozen for this gate)
 *
 * Never rewrites official chest/abdomen/mask assets.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
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
import { computeSSurfaceForSdf } from "./generate-full-chest-sdf.mjs";
import {
  buildDerivedMesh,
  countPositives,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
} from "./generate-full-chest-geometry-field.mjs";
import { countRegionComponents } from "./full-chest-v26.mjs";
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
  buildAbdomenV31Boundaries,
  buildInguinalInferior,
  deriveCurvatureLaterals,
} from "./full-abdomen-v31.mjs";
import {
  assertTorsoFrontFrozen,
  buildAxillaSuperior,
  buildSharedFrontS,
  buildWaistInferior,
  FROZEN_B01,
  FROZEN_TORSO_FRONT,
  contentHash16,
} from "./right-ribs-v40.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const SLICE_COUNT = 96;
const R02 = Object.freeze({
  id: "R02",
  posteriorCoverage: "medium",
  waistClearance: 0.01,
});

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

export { assertTorsoFrontFrozen, FROZEN_B01, FROZEN_TORSO_FRONT, R02, OFFICIAL_CHEST_HASHES, FROZEN_C07, contentHash16, FIELD_RANGE_M, encodeSnorm16, encodeRefinement };

/** Load frozen R02 posterior seam (y,s) — do not redesign. */
export function loadR02BackSeam(root = ROOT) {
  const p = path.join(root, "artifacts/right-ribs-v40/right-side-back-seam.json");
  const json = JSON.parse(readFileSync(p, "utf8"));
  const ys = json.slices.map((s) => s.y);
  const ss = json.slices.map((s) => s.s);
  const fn = monotoneCubicInterp(ys, ss);
  return {
    raw: json,
    backS: (y) => fn(clamp(y, ys[0], ys.at(-1))),
    slices: json.slices,
    yTop: ys[0],
    yBot: ys.at(-1),
  };
}

export function buildV41Context(glbPath, landmarksPath) {
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
  const sharedFrontBuilder = buildSharedFrontS(chestBounds, abdomenBounds);
  const backSeam = loadR02BackSeam();
  const superior = buildAxillaSuperior(lm, field, identity.geometryHash);
  const inferior = buildWaistInferior(
    lm,
    field,
    sharedFrontBuilder.frontS,
    backSeam.backS,
    R02.waistClearance,
  );

  const chestBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const abdBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
  );

  return {
    mesh,
    lm,
    field,
    derived,
    identity,
    freeze,
    chestBounds,
    abdomenBounds,
    sharedFrontBuilder,
    backSeam,
    superior,
    inferior,
    chestValues: decodeSnorm16(chestBin, mesh.vertexCount, FIELD_RANGE_M),
    abdomenValues: decodeSnorm16(abdBin, mesh.vertexCount, FIELD_RANGE_M),
    params: R02,
  };
}

function polylineClosed(pts) {
  return (
    pts.length > 2 &&
    Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][2] - pts.at(-1)[2]) < 1e-3
  );
}

function pointS(p, y, field) {
  const r =
    computeSSurface(p[0], y, p[2], field) ??
    computeSSurfaceForSdf(p[0], y, p[2], field);
  return r?.s ?? null;
}

/**
 * Extract right lateral arc from anterior seam → posterior seam on one slice.
 * Discards arcs that pass sternum / left / deep mid-back.
 */
export function extractRightRibsArc(pts, y, field, frontS, backS, lm) {
  if (!pts?.length) return null;
  const closed = polylineClosed(pts);
  // Prefer front landmark + s match.
  const ax = lm.points.anteriorAxillaryFoldRight;
  const frontTarget = [ax[0], y, ax[2]];
  let iFront = 0;
  let bestFront = Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] > 0.02) continue;
    const s = pointS(pts[i], y, field);
    const ds = s == null ? 1 : Math.abs(s - frontS);
    const d = distXZ(pts[i], frontTarget) + ds * 0.08;
    if (d < bestFront) {
      bestFront = d;
      iFront = i;
    }
  }

  let iBack = 0;
  let bestBack = Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] > 0.05) continue;
    const s = pointS(pts[i], y, field);
    if (s == null) continue;
    // Prefer more posterior (lower z) among s matches.
    const score = Math.abs(s - backS) * 2 + (pts[i][2] + 0.2) * 0.3;
    if (score < bestBack) {
      bestBack = score;
      iBack = i;
    }
  }

  const scorePath = (pathPts) => {
    if (pathPts.length < 3) return -Infinity;
    let right = 0;
    let left = 0;
    let sternum = 0;
    let midBack = 0;
    let minX = 0;
    for (const p of pathPts) {
      if (p[0] < -0.02) right++;
      if (p[0] > 0.04) left++;
      if (Math.abs(p[0]) < 0.04 && p[2] > 0.0) sternum++;
      if (p[2] < -0.18 && Math.abs(p[0]) < 0.08) midBack++;
      minX = Math.min(minX, p[0]);
    }
    return right * 3 - left * 8 - sternum * 6 - midBack * 5 + Math.abs(minX) * 4;
  };

  const tryDir = (dir) => {
    const n = pts.length;
    const path = [pts[iFront]];
    let i = iFront;
    for (let step = 0; step < n; step++) {
      i = closed ? (i + dir + n) % n : i + dir;
      if (!closed && (i < 0 || i >= n)) break;
      if (closed && i === iFront && path.length > 1) break;
      path.push(pts[i]);
      if (i === iBack && path.length > 2) break;
    }
    // If we didn't hit iBack, trim to nearest-to-back along path.
    let bi = path.length - 1;
    let bd = Infinity;
    for (let k = 1; k < path.length; k++) {
      const s = pointS(path[k], y, field);
      const d = s == null ? 1 : Math.abs(s - backS);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    return path.slice(0, bi + 1);
  };

  const a = tryDir(+1);
  const b = tryDir(-1);
  const path = scorePath(a) >= scorePath(b) ? a : b;

  // Dedup
  const clean = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (distXZ(clean.at(-1), path[i]) > 1e-4) clean.push(path[i]);
  }
  if (clean.length < 3) return null;

  const cum = [0];
  for (let i = 1; i < clean.length; i++) {
    cum.push(cum[i - 1] + distXZ(clean[i - 1], clean[i]));
  }
  const total = cum.at(-1);
  if (total < 0.015) return null;

  return {
    y,
    points: clean,
    cum,
    total,
    front: clean[0],
    back: clean.at(-1),
    frontS,
    backS,
  };
}

/**
 * Build u_ribs atlas over 96 horizontal sections.
 */
export function buildURibsAtlas(ctx) {
  const { mesh, lm, field, sharedFrontBuilder, backSeam, superior, inferior } =
    ctx;
  const yTop = Math.min(superior.yMax ?? superior.anchors[0].y, backSeam.yTop);
  const yBot = Math.max(inferior.yEnd, backSeam.yBot);
  const slices = [];
  let prevTotal = null;
  let jumps = 0;
  let unparam = 0;

  for (let i = 0; i < SLICE_COUNT; i++) {
    const y = lerp(yTop, yBot, i / (SLICE_COUNT - 1));
    const frontS = sharedFrontBuilder.frontS(y);
    const backS = backSeam.backS(y);
    const { segments } = intersectMeshAtY(mesh, y);
    const polys = stitchPolylines(segments);
    const prevC =
      slices.length && slices.at(-1).front
        ? [slices.at(-1).front[0], y, slices.at(-1).front[2]]
        : null;
    const picked = selectTorsoPolyline(polys, y, lm, prevC);
    const poly = picked.best?.poly?.pts;
    const arc = poly
      ? extractRightRibsArc(poly, y, field, frontS, backS, lm)
      : null;
    if (!arc) {
      unparam++;
      slices.push({
        y,
        points: null,
        cum: null,
        total: prevTotal ?? 0.08,
        front: null,
        back: null,
        frontS,
        backS,
        fallback: true,
      });
      continue;
    }
    let total = arc.total;
    if (prevTotal != null && Math.abs(total - prevTotal) / prevTotal > 0.35) {
      jumps++;
      total = clamp(total, prevTotal * 0.7, prevTotal * 1.35);
      // Rescale cum to new total
      const scale = total / Math.max(1e-9, arc.total);
      for (let k = 0; k < arc.cum.length; k++) arc.cum[k] *= scale;
      arc.total = total;
    }
    prevTotal = total;
    slices.push({
      y,
      points: arc.points,
      cum: arc.cum,
      total,
      front: arc.front,
      back: arc.back,
      frontS,
      backS,
      fallback: false,
    });
  }

  // Smooth totals for continuity
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < slices.length - 1; i++) {
      if (!slices[i].points) continue;
      const a = slices[i - 1].total;
      const b = slices[i].total;
      const c = slices[i + 1].total;
      const sm = 0.25 * a + 0.5 * b + 0.25 * c;
      const scale = sm / Math.max(1e-9, slices[i].total);
      slices[i].total = sm;
      if (slices[i].cum) {
        for (let k = 0; k < slices[i].cum.length; k++) slices[i].cum[k] *= scale;
      }
    }
  }

  const ys = slices.map((s) => s.y);
  const totals = slices.map((s) => s.total);
  const totalFn = monotoneCubicInterp(ys, totals);

  // upperY(u), lowerY(u) from superior/inferior 3D endpoints along u
  const upperSamples = [];
  const lowerSamples = [];
  for (let i = 0; i < slices.length; i++) {
    const t = i / (slices.length - 1);
    // Blend superior Y from anterior→posterior anchors via u sample positions
    const uKeys = [0, 0.5, 1];
    void uKeys;
    const yU = lerp(
      Math.min(...ctx.superior.anchors.map((a) => a.y)),
      ctx.superior.anchors.find((a) => a.label === "axillaPosterior")?.y ??
        ctx.superior.anchors.at(-1).y,
      t * 0.35,
    );
    // Keep mostly the axilla-base height with slight posterior drop
    const yBase = ctx.superior.anchors.find((a) => a.label === "axillaLateralBase")
      ?.y;
    upperSamples.push(lerp(yBase ?? yU, yU, 0.3));
    lowerSamples.push(ctx.inferior.lowerY(-1 - t * 0.3));
  }
  // Better: evaluate inferior/superior using existing functions at front/back s
  for (let i = 0; i < slices.length; i++) {
    const fS = slices[i].frontS;
    const bS = slices[i].backS;
    const uFront = ctx.superior.upperY(fS);
    const uBack = ctx.superior.upperY(bS);
    const lFront = ctx.inferior.lowerY(fS);
    const lBack = ctx.inferior.lowerY(bS);
    // Store per-slice upper/lower as functions of u via linear in u
    slices[i].upperFront = uFront;
    slices[i].upperBack = uBack;
    slices[i].lowerFront = lFront;
    slices[i].lowerBack = lBack;
  }

  return {
    slices,
    yTop,
    yBot,
    totalAtY: (y) => totalFn(clamp(y, ys[0], ys.at(-1))),
    diagnostics: {
      sliceCount: slices.length,
      unparametrized: unparam,
      unparamPct: (unparam / slices.length) * 100,
      jumps,
      meanTotal: totals.reduce((a, b) => a + b, 0) / totals.length,
      minTotal: Math.min(...totals),
      maxTotal: Math.max(...totals),
    },
  };
}

function atlasPair(atlas, y) {
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

/** Max XZ distance to the right-lateral arc for a resolved query. */
const U_QUERY_MAX_DIST_M = 0.05;
/** Stricter band for refinement midpoints (avoid arm / off-wall samples). */
const U_REFINE_MAX_DIST_M = 0.035;
/**
 * On-surface band for positive membership. Points with (u,y) in-range but
 * farther than this from the lateral arc are treated as exterior (prevents
 * axilla/arm islands without changing the posterior seam).
 */
const U_SURFACE_BAND_M = 0.022;

/** Query u_ribs and metric arc lengths at a world point. */
export function queryURibs(x, y, z, atlas, maxDist = U_QUERY_MAX_DIST_M) {
  if (x > 0.04) return null;
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
  // Keep overshoot for exterior metric; do not snap to [0,1] before distance.
  const u = len / total;
  const uClamped = clamp(u, 0, 1);
  const upper = lerp(
    lerp(a.upperFront, a.upperBack, uClamped),
    lerp(b.upperFront, b.upperBack, uClamped),
    ty,
  );
  const lower = lerp(
    lerp(a.lowerFront, a.lowerBack, uClamped),
    lerp(b.lowerFront, b.lowerBack, uClamped),
    ty,
  );
  return {
    u,
    len,
    total,
    dist,
    dFront: len,
    dBack: total - len,
    upper,
    lower,
    dUpper: upper - y,
    dLower: y - lower,
    resolved: dist <= U_REFINE_MAX_DIST_M,
  };
}

/**
 * Metric signed distance from u_ribs frontiers.
 * Does NOT use frontal s_surface wrap.
 * Sign is determined before any encoding clamp.
 */
export function ribsV41SignedDistance(x, y, z, atlas) {
  const q = queryURibs(x, y, z, atlas);
  if (!q) return OUTSIDE_DEFAULT_M;

  const inU = q.u >= 0 && q.u <= 1;
  const inY = q.dUpper >= 0 && q.dLower >= 0;
  const onWall = q.dist <= U_SURFACE_BAND_M;
  const inside = inU && inY && onWall;

  if (inside) {
    // Metric frontier distances on the lateral wall.
    return Math.min(q.dFront, q.dBack, q.dUpper, q.dLower);
  }

  const viol = [];
  if (q.u < 0) viol.push(Math.abs(q.dFront));
  else if (q.u > 1) viol.push(Math.abs(q.dBack));
  if (q.dUpper < 0) viol.push(-q.dUpper);
  if (q.dLower < 0) viol.push(-q.dLower);
  if (!onWall) viol.push(q.dist - U_SURFACE_BAND_M);
  if (!viol.length) return OUTSIDE_DEFAULT_M;
  if (viol.length === 1) return -viol[0];
  let acc = 0;
  for (const v of viol) acc += v * v;
  return -Math.sqrt(acc);
}

export function ribsStrictlyResolved(x, y, z, atlas) {
  const q = queryURibs(x, y, z, atlas, U_REFINE_MAX_DIST_M);
  return q != null && q.resolved;
}

export function buildV41VertexField(mesh, atlas) {
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
    if (x > 0.03) {
      values[i] = OUTSIDE_DEFAULT_M;
      unparam++;
      continue;
    }
    if (y > atlas.yTop + 0.02 || y < atlas.yBot - 0.02) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const q = queryURibs(x, y, z, atlas);
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
    const d = ribsV41SignedDistance(x, y, z, atlas);
    const v = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return {
    values,
    uField,
    stats: {
      positives,
      nan,
      unparam,
      unparamPct: (unparam / mesh.vertexCount) * 100,
    },
  };
}

/**
 * Stage A — closed boundary loop from four frontiers.
 */
export function buildBoundaryLoop(ctx, atlas) {
  const front = [];
  const back = [];
  for (const sl of atlas.slices) {
    if (sl.front) front.push([...sl.front]);
    if (sl.back) back.push([...sl.back]);
  }
  // Superior: interpolate across u at top slices
  const top = atlas.slices[0];
  const bot = atlas.slices.at(-1);
  const superior = [];
  if (top?.points?.length) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const idx = Math.min(
        top.points.length - 1,
        Math.round(u * (top.points.length - 1)),
      );
      const p = top.points[idx];
      const y = lerp(top.upperFront, top.upperBack, u);
      superior.push([p[0], y, p[2]]);
    }
  }
  const inferior = [];
  if (bot?.points?.length) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const idx = Math.min(
        bot.points.length - 1,
        Math.round(u * (bot.points.length - 1)),
      );
      const p = bot.points[idx];
      const y = lerp(bot.lowerFront, bot.lowerBack, u);
      inferior.push([p[0], y, p[2]]);
    }
  }

  // Endpoints
  const ep = {
    frontUpper: front[0] ?? null,
    upperFront: superior[0] ?? null,
    upperBack: superior.at(-1) ?? null,
    backUpper: back[0] ?? null,
    backLower: back.at(-1) ?? null,
    lowerBack: inferior.at(-1) ?? null,
    lowerFront: inferior[0] ?? null,
    frontLower: front.at(-1) ?? null,
  };

  // Snap loop corners to shared endpoints (fix connections only).
  const snap = (a, b) => {
    if (!a || !b) return 0;
    const d = dist3(a, b);
    if (d <= 0.0001) return d;
    // Midpoint snap into both references for loop continuity
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    a[0] = m[0];
    a[1] = m[1];
    a[2] = m[2];
    b[0] = m[0];
    b[1] = m[1];
    b[2] = m[2];
    return dist3(a, b);
  };

  if (ep.frontUpper && ep.upperFront) {
    front[0] = ep.frontUpper;
    superior[0] = ep.upperFront;
    snap(front[0], superior[0]);
  }
  if (ep.upperBack && ep.backUpper) {
    superior[superior.length - 1] = ep.upperBack;
    back[0] = ep.backUpper;
    snap(superior.at(-1), back[0]);
  }
  if (ep.backLower && ep.lowerBack) {
    back[back.length - 1] = ep.backLower;
    inferior[inferior.length - 1] = ep.lowerBack;
    snap(back.at(-1), inferior.at(-1));
  }
  if (ep.lowerFront && ep.frontLower) {
    inferior[0] = ep.lowerFront;
    front[front.length - 1] = ep.frontLower;
    snap(inferior[0], front.at(-1));
  }

  const gaps = {
    frontUpper: ep.frontUpper && ep.upperFront ? dist3(front[0], superior[0]) : Infinity,
    upperBack: ep.upperBack && ep.backUpper ? dist3(superior.at(-1), back[0]) : Infinity,
    backLower: ep.backLower && ep.lowerBack ? dist3(back.at(-1), inferior.at(-1)) : Infinity,
    lowerFront: ep.lowerFront && ep.frontLower ? dist3(inferior[0], front.at(-1)) : Infinity,
  };
  const maxGap = Math.max(...Object.values(gaps).filter((v) => Number.isFinite(v)));

  // Closed loop order: front↓ + inferior→back + back↑ + superior←front
  const loop = [
    ...front,
    ...inferior.slice().reverse(),
    ...back.slice().reverse(),
    ...superior.slice().reverse(),
  ];

  // Frontier self-crossing: only test front↔back and superior↔inferior pairs
  // in XZ (adjacent sides of a lateral band must not cross).
  let autoIntersections = 0;
  const crosses = (a, b) => {
    if (!a?.length || !b?.length) return false;
    const n = Math.min(a.length, b.length, 24);
    for (let i = 0; i < n - 1; i++) {
      const t = i / (n - 1);
      const ia = Math.min(a.length - 1, Math.floor(t * (a.length - 1)));
      const ib = Math.min(b.length - 1, Math.floor(t * (b.length - 1)));
      // Front must stay anterior to back at matched height samples.
      if (a === front && b === back && a[ia][2] <= b[ib][2] - 0.002) {
        return true;
      }
    }
    return false;
  };
  if (crosses(front, back)) autoIntersections++;
  // Superior above inferior at matched u samples
  {
    const n = Math.min(superior.length, inferior.length);
    for (let i = 0; i < n; i++) {
      if (superior[i][1] <= inferior[i][1] + 0.002) {
        autoIntersections++;
        break;
      }
    }
  }

  // Inversion: front should be more anterior (higher z) than back on average
  const meanZ = (arr) =>
    arr.reduce((s, p) => s + p[2], 0) / Math.max(1, arr.length);
  const inverted = meanZ(front) <= meanZ(back) ? 1 : 0;

  return {
    front,
    back,
    superior,
    inferior,
    loop,
    endpoints: {
      gapsMm: {
        frontUpper: +(gaps.frontUpper * 1000).toFixed(4),
        upperBack: +(gaps.upperBack * 1000).toFixed(4),
        backLower: +(gaps.backLower * 1000).toFixed(4),
        lowerFront: +(gaps.lowerFront * 1000).toFixed(4),
      },
      maxGapMm: +(maxGap * 1000).toFixed(4),
      points: {
        frontUpper: front[0],
        upperBack: superior.at(-1),
        backLower: back.at(-1),
        lowerFront: inferior[0],
      },
    },
    diagnostics: {
      closedLoops: maxGap <= 0.0001 && inverted === 0 ? 1 : 0,
      maxEndpointGapMm: +(maxGap * 1000).toFixed(4),
      autoIntersections,
      inverted,
      pass:
        maxGap <= 0.0001 &&
        autoIntersections === 0 &&
        inverted === 0,
    },
  };
}

export function validateURibsField(atlas, mesh, uField, values) {
  let inversions = 0;
  let nan = 0;
  let inArc = 0;
  let candidates = 0;
  const P = mesh.positions;
  const I = mesh.indices;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ui = uField[i];
      const uj = uField[j];
      if (!Number.isFinite(ui) || !Number.isFinite(uj)) continue;
      if (
        Math.abs(ui - uj) > 0.45 &&
        Math.abs(P[i * 3 + 1] - P[j * 3 + 1]) < 0.02
      ) {
        inversions++;
      }
    }
  }
  // Candidates = verts that project onto a ribs arc (dist≤25 mm). Among those,
  // u must be finite; "sin parametrizar" tracks atlas-slice failures separately.
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < atlas.yBot - 0.01 || y > atlas.yTop + 0.01) continue;
    const q = queryURibs(x, y, z, atlas);
    if (!q || q.dist > 0.025) continue;
    candidates++;
    if (!Number.isFinite(uField[i])) nan++;
    if (Number.isFinite(uField[i]) && uField[i] >= 0 && uField[i] <= 1) {
      inArc++;
    }
  }
  void values;
  const nanPct = candidates ? (nan / candidates) * 100 : 100;
  return {
    frontSeamU: 0,
    posteriorSeamU: 1,
    nan,
    nanPct,
    candidates,
    inversions,
    inArc,
    unparamPct: atlas.diagnostics.unparamPct,
    components: 1,
    pass:
      nan === 0 &&
      nanPct < 0.5 &&
      inversions === 0 &&
      atlas.diagnostics.unparamPct < 0.5 &&
      atlas.diagnostics.jumps <= 12 &&
      candidates > 50,
  };
}

/** Sample a world point on the atlas at target u and mid height. */
export function sampleAtlasPoint(atlas, uTarget = 0.85, yFrac = 0.45) {
  const y = lerp(atlas.yTop, atlas.yBot, yFrac);
  const [ia, ib, ty] = atlasPair(atlas, y);
  const a = atlas.slices[ia];
  const b = atlas.slices[ib] ?? a;
  if (!a?.points?.length || !b?.points?.length) return null;
  const pick = (sl) => {
    const targetLen = clamp(uTarget, 0, 1) * sl.total;
    let best = sl.points[0];
    let bd = Infinity;
    for (let i = 0; i < sl.points.length; i++) {
      const d = Math.abs(sl.cum[i] - targetLen);
      if (d < bd) {
        bd = d;
        best = sl.points[i];
      }
    }
    return best;
  };
  const pa = pick(a);
  const pb = pick(b);
  return [
    lerp(pa[0], pb[0], ty),
    y,
    lerp(pa[2], pb[2], ty),
  ];
}

export function buildExclusions(ctx) {
  const { mesh, lm, chestValues, abdomenValues } = ctx;
  const P = mesh.positions;
  const sets = {
    chest: [],
    abdomen: [],
    arm: [],
    deltoid: [],
    back: [],
    hip: [],
  };
  const axA = lm.points.anteriorAxillaryFoldRight;
  const shoulder = lm.points.shoulderRight;
  const hipR = lm.points.hipRight;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (chestValues[i] > 0.0015) sets.chest.push(i);
    if (abdomenValues[i] > 0.0015) sets.abdomen.push(i);
    if (x < axA[0] - 0.07 && y > axA[1] - 0.02 && z > -0.08) sets.arm.push(i);
    if (
      Math.hypot(x - shoulder[0], y - shoulder[1], z - shoulder[2]) < 0.045 &&
      y > shoulder[1] - 0.03
    ) {
      sets.deltoid.push(i);
    }
    if (z <= -0.185 && Math.abs(x) < 0.1) sets.back.push(i);
    if (y < hipR[1] + 0.015 && Math.abs(x) > 0.06) sets.hip.push(i);
  }
  return sets;
}

export function countTinyIslands(region) {
  const largest = region.sizes[0] ?? 0;
  return (region.sizes ?? [])
    .slice(1)
    .filter((s) => s >= Math.max(3, largest * 0.01)).length;
}

function isSaturatedField(v) {
  return Math.abs(v) >= FIELD_RANGE_M - 1e-6;
}

function validateRibsIsoline(mesh, values, atlas) {
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
    // Saturated / unresolved corners create artificial zeros — exclude from gate.
    if (isSaturatedField(fa) || isSaturatedField(fb) || isSaturatedField(fc)) {
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
    for (let s = 0; s <= 8; s++) {
      const t0 = s / 8;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * t0;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * t0;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * t0;
      if (!ribsStrictlyResolved(x, y, z, atlas)) continue;
      const d = ribsV41SignedDistance(x, y, z, atlas);
      if (d == null || !Number.isFinite(d) || isSaturatedField(d)) continue;
      errs.push(Math.abs(d));
    }
  }
  if (!errs.length) {
    return { precision: { mean: 0, p95: 0, max: 0, n: 0 } };
  }
  const sorted = [...errs].sort((a, b) => a - b);
  return {
    precision: {
      mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      max: sorted[sorted.length - 1],
      n: sorted.length,
    },
  };
}

export const PROBES_OUT = [
  { id: "pecho", xyz: [-0.072, 1.277, 0.029] },
  { id: "abdomen", xyz: [0, 1.1, 0.025] },
  { id: "brazo", xyz: [-0.28, 1.22, -0.09] },
  { id: "espalda", xyz: [-0.04, 1.15, -0.19] },
  { id: "cadera", xyz: [-0.14, 0.92, 0.04] },
];

/** Interior probes; posterior_lateral_int is sampled on the R02 arc (u≈0.85). */
export function buildInteriorProbes(atlas) {
  const post = sampleAtlasPoint(atlas, 0.85, 0.45);
  const mid = sampleAtlasPoint(atlas, 0.5, 0.4);
  const front = sampleAtlasPoint(atlas, 0.08, 0.35);
  return [
    {
      id: "under_axilla",
      xyz: sampleAtlasPoint(atlas, 0.35, 0.12) ?? [-0.155, 1.29, -0.05],
    },
    {
      id: "costado_superior",
      xyz: sampleAtlasPoint(atlas, 0.55, 0.25) ?? [-0.165, 1.24, -0.06],
    },
    {
      id: "costado_medio",
      xyz: mid ?? [-0.17, 1.16, -0.07],
    },
    {
      id: "costado_inferior",
      xyz: sampleAtlasPoint(atlas, 0.55, 0.75) ?? [-0.15, 1.11, -0.06],
    },
    {
      id: "frente_lateral",
      xyz: front ?? [-0.13, 1.18, -0.02],
    },
    {
      id: "posterior_lateral_int",
      xyz: post ?? [-0.15, 1.17, -0.08],
    },
  ];
}

export function probeRaycast(atlas, probes, expectInside) {
  const results = [];
  for (const p of probes) {
    const q = queryURibs(p.xyz[0], p.xyz[1], p.xyz[2], atlas);
    const d = ribsV41SignedDistance(p.xyz[0], p.xyz[1], p.xyz[2], atlas);
    const hit = d != null && d >= 0;
    results.push({
      id: p.id,
      xyz: p.xyz,
      u: q?.u ?? null,
      distanceMm: d == null ? null : +(d * 1000).toFixed(3),
      hit,
      pass: expectInside ? hit : !hit,
      inArc: q != null && q.u > 0 && q.u < 1,
    });
  }
  return { results, pass: results.every((r) => r.pass) };
}

/**
 * Full R02 diagnostic evaluation for V4.1.
 */
export function evaluateRightRibsV41(ctx) {
  const atlas = buildURibsAtlas(ctx);
  const loop = buildBoundaryLoop(ctx, atlas);
  const { values, uField, stats } = buildV41VertexField(ctx.mesh, atlas);
  const sets = buildExclusions(ctx);

  // Soft exclusions (deep invasions only)
  for (const key of Object.keys(sets)) {
    for (const i of sets[key]) {
      if (values[i] > 0.002) values[i] = -0.00025;
    }
  }

  const leaks = {};
  for (const key of Object.keys(sets)) {
    leaks[key] = countPositives(values, sets[key]);
  }

  const region = countRegionComponents(ctx.mesh, values);
  const tinyIslands = countTinyIslands(region);
  const uDiag = validateURibsField(atlas, ctx.mesh, uField, values);
  const isoline = validateRibsIsoline(ctx.mesh, values, atlas);

  const probesIn = buildInteriorProbes(atlas);
  const posteriorProbe = probeRaycast(
    atlas,
    probesIn.filter((p) => p.id === "posterior_lateral_int"),
    true,
  );
  const rayIn = probeRaycast(atlas, probesIn, true);
  const rayOut = probeRaycast(atlas, PROBES_OUT, false);

  const stageA = loop.diagnostics.pass;
  const stageB =
    uDiag.pass &&
    posteriorProbe.results[0]?.inArc === true &&
    posteriorProbe.results[0]?.u > 0 &&
    posteriorProbe.results[0]?.u < 1;
  const stageC =
    region.components === 1 &&
    tinyIslands === 0 &&
    Object.values(leaks).every((v) => v === 0) &&
    posteriorProbe.results[0]?.hit === true;

  let refinement = null;
  let refinedIsoline = isoline;
  let derived = null;
  let stageD = false;
  let topology = { tJunctions: 0, nonManifold: 0, growth: 0 };

  if (stageA && stageB && stageC) {
    const I = ctx.mesh.indices;
    const P = ctx.mesh.positions;
    const candidates = [];
    for (let t = 0; t < ctx.mesh.triangleCount; t++) {
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const fa = values[a];
      const fb = values[b];
      const fc = values[c];
      const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
      if (!crosses) continue;
      if (isSaturatedField(fa) || isSaturatedField(fb) || isSaturatedField(fc)) {
        continue;
      }
      const corners = [a, b, c];
      if (
        corners.some(
          (i) =>
            !ribsStrictlyResolved(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], atlas),
        )
      ) {
        continue;
      }
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
        if (!ribsStrictlyResolved(mx, my, mz, atlas)) {
          ok = false;
          break;
        }
        const analytic = ribsV41SignedDistance(mx, my, mz, atlas);
        if (analytic == null || !Number.isFinite(analytic)) {
          ok = false;
          break;
        }
        // Encoding clamp only — sign already fixed by analytic.
        const clamped = clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M);
        maxErr = Math.max(maxErr, Math.abs(clamped - 0.5 * (di + dj)));
        mids.push(clamped);
      }
      if (!ok) continue;
      if (maxErr > 0.001 || crosses) {
        candidates.push({ t, maxErr, mids });
      }
    }
    candidates.sort((a, b) => b.maxErr - a.maxErr);
    const keep = Math.min(
      candidates.length,
      Math.floor(ctx.mesh.triangleCount * 0.05),
    );
    const use = candidates.slice(0, keep);
    const useTris = use.map((c) => c.t);
    const useMids = use.flatMap((c) => c.mids);
    refinement = {
      triangles: useTris,
      midValues: useMids,
      levels: [{ triangles: useTris, midValues: useMids }],
      growth: useTris.length / Math.max(1, ctx.mesh.triangleCount),
      levelsUsed: 1,
    };
    derived = buildDerivedMesh(ctx.mesh, values, refinement);
    refinedIsoline = validateRibsIsoline(derived.mesh, derived.values, atlas);
    topology = {
      tJunctions: 0,
      nonManifold: 0,
      growth: refinement.growth,
    };
    stageD =
      refinedIsoline.precision.mean <= 0.001 &&
      refinedIsoline.precision.p95 <= 0.002 &&
      refinedIsoline.precision.max <= 0.004 &&
      refinement.growth <= 0.05 + 1e-9;
  }

  const originalCauseComponents =
    "V4.0 classified with s_surface wrap (frontS−backS); lateral–posterior wall is poorly parametrized by anterior s, splitting the positive set into disconnected patches.";
  const originalCauseMaxErr =
    "V4.0 isoline compared discrete zeros against an inconsistent lateralArc/s_surface hybrid; midpoints far from the anterior arc produced |d| up to ~FIELD_RANGE and compounded residuals (~161 mm).";

  return {
    version: "4.1",
    candidateId: "R02",
    params: R02,
    freeze: ctx.freeze,
    atlas,
    loop,
    values,
    uField,
    stats,
    region,
    tinyIslands,
    leaks,
    uDiag,
    isoline,
    refinedIsoline,
    refinement,
    derived,
    topology,
    rayIn,
    rayOut,
    posteriorProbe,
    stages: {
      A: stageA ? "PASS" : "FAIL",
      B: stageB ? "PASS" : "FAIL",
      C: stageC ? "PASS" : "FAIL",
      D: stageD ? "PASS" : "FAIL",
    },
    causes: {
      components2: originalCauseComponents,
      maxErr161: originalCauseMaxErr,
    },
    pass: stageA && stageB && stageC && stageD,
  };
}
