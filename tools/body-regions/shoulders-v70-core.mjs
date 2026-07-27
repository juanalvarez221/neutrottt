/**
 * Shoulders V7.0 — bilateral Geometry Distance Field engine.
 *
 * The shoulder cap is the deltoid skin patch that sits between the frozen
 * neck / full_chest / upper_back frontiers and an oblique arm-insertion cut
 * near the deltoid tuberosity. Every wall re-uses an already-official field:
 *
 *   - neck_right / neck_left  (N02, frozen)      → medial-superior wall
 *   - full_chest              (C07, frozen)      → anterior wall
 *   - upper_back              (S02, frozen)      → posterior wall
 *   - arm insertion plane     (derived here)     → inferior/distal wall
 *
 * The three official walls are consumed twice: once as a coarse per-vertex
 * gate (`neighbor field <= 0`) and once as a continuous seam polyline
 * (`extractOfficialSeamSegment`) extracted from that same field's zero
 * isoline, restricted to the neighbourhood of the shoulder. The polyline
 * gives sub-vertex precision near the frontier; the gate resolves the sign
 * far from it. Nothing here rewrites an official field, refinement or mask.
 *
 * BodySide = "right" | "left". Never mirrors vertices / fields / sidecars
 * between sides — every side is derived from its own real geometry.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";
import { loadGeometryIdentity } from "./derive-abdomen-landmarks.mjs";
import {
  decodeSnorm16,
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
} from "./generate-full-chest-geometry-field.mjs";
import { countRegionComponents } from "./full-chest-v26.mjs";
import {
  buildIndependentDerivedMesh,
  encodeIndependentFieldPackage,
  encodeIndependentRefinement,
  INDEP_ENCODING,
  MAX_ADAPTIVE_ROUNDS,
  ERROR_THRESHOLD_M,
  HARD_BUDGET_FRAC,
  SOFT_BUDGET_FRAC,
  T_QUANT,
  auditIndependentTopology,
} from "./neck-v63-core.mjs";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  OFFICIAL_NECK,
  PIPELINE_VERSION,
  SOURCE_GATE,
  SHOULDERS_V70_OUT,
  assertOfficialBodyFrozen,
  contentHash16,
  getShoulderSideConfig,
  loadOfficialField,
  sha16,
  sidePoint,
} from "./shoulders-side.mjs";

/** @typedef {"right"|"left"} BodySide */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const ANATOMY_SOURCE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions.json",
);

export {
  loadMeshData,
  loadGeometryIdentity,
  decodeSnorm16,
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
  countRegionComponents,
  buildIndependentDerivedMesh,
  encodeIndependentFieldPackage,
  encodeIndependentRefinement,
  INDEP_ENCODING,
  MAX_ADAPTIVE_ROUNDS,
  ERROR_THRESHOLD_M,
  HARD_BUDGET_FRAC,
  SOFT_BUDGET_FRAC,
  T_QUANT,
  auditIndependentTopology,
  CANDIDATES,
  GEOMETRY_IDENTITY,
  OFFICIAL_NECK,
  PIPELINE_VERSION,
  SOURCE_GATE,
  SHOULDERS_V70_OUT,
  assertOfficialBodyFrozen,
  contentHash16,
  getShoulderSideConfig,
  loadOfficialField,
  sha16,
  sidePoint,
};

/** Refinement band around the frontier (§ neck/ribs precedent). */
export const REFINE_BAND_M = 0.005;
/** On-surface band for positive membership near the deltoid cap edges. */
export const SURFACE_BAND_M = 0.028;
/** Circumferential sections used when a real arm cross-section is thin. */
export const SECTION_COUNT = 96;
/** Deltoid insertion as a fraction of acromion→elbow arm length. */
export const DELTOID_INSERTION_T = 0.34;
/** Packaged (sdf + refine) byte budget for a single side. */
export const PKG_BUDGET_BYTES = 45 * 1024;

// --- small vector helpers ---------------------------------------------------

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a) {
  const l = norm(a) || 1;
  return scale(a, 1 / l);
}
function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function mid3(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
function distPointSegment3(p, a, b) {
  const ab = sub(b, a);
  const ab2 = dot(ab, ab) || 1e-12;
  const t = clamp(dot(sub(p, a), ab) / ab2, 0, 1);
  return dist3(p, add(a, scale(ab, t)));
}
function planeSignedDist(p, planePoint, planeNormal) {
  return dot(sub(p, planePoint), planeNormal);
}
function isSaturatedField(v) {
  return Math.abs(v) >= FIELD_RANGE_M - 1e-6;
}

// --- geometry identity guard -------------------------------------------------

/** GEOMETRY_IDENTITY must match c62e81edaa1f / 52494d471398c / 14517. */
export function assertShoulderGeometryFrozen(identity) {
  const ok =
    identity.geometryHash === GEOMETRY_IDENTITY.geometryHash &&
    identity.indexHash === GEOMETRY_IDENTITY.indexHash &&
    identity.vertexCount === GEOMETRY_IDENTITY.vertexCount;
  if (!ok) {
    const err = new Error("SHOULDER_GEOMETRY_IDENTITY_MISMATCH");
    err.details = { identity, expected: GEOMETRY_IDENTITY };
    throw err;
  }
  return true;
}

// --- spatial index for coarse per-vertex neighbor-field lookups -------------

function buildVertexGrid(mesh, cellSize = 0.025) {
  const grid = new Map();
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const key = cellKey(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], cellSize);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return { grid, cellSize };
}

function cellKey(x, y, z, cellSize) {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}:${Math.floor(z / cellSize)}`;
}

function nearestVertexInGrid(index, mesh, x, y, z) {
  const P = mesh.positions;
  const cs = index.cellSize;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  const cz = Math.floor(z / cs);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
          const bucket = index.grid.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
          if (!bucket) continue;
          for (const vi of bucket) {
            const ddx = P[vi * 3] - x;
            const ddy = P[vi * 3 + 1] - y;
            const ddz = P[vi * 3 + 2] - z;
            const d = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d < bestD) {
              bestD = d;
              best = vi;
            }
          }
        }
      }
    }
    if (best >= 0 && r >= 1) break;
  }
  return best;
}

// --- landmark derivation ------------------------------------------------

/**
 * Derive the per-side arm axis and shoulder anchors used by every downstream
 * wall. Acromion / elbow come from `anatomy.skeleton.rightArm`, mirrored in
 * X for the left side; falls back to the landmark `shoulder` / `elbow` point
 * when the anatomical skeleton entry is missing.
 * @param {BodySide} side
 */
export function deriveShoulderLandmarks(side, lm, identity, anatomy) {
  assertShoulderGeometryFrozen(identity);
  const cfg = getShoulderSideConfig(side);
  const mirror = side === "left";
  const mirrorPt = (p) => (mirror ? [-p[0], p[1], p[2]] : [...p]);

  const rightArm = anatomy?.skeleton?.rightArm;
  const acromion = rightArm?.acromion
    ? mirrorPt(rightArm.acromion)
    : sidePoint(lm, side, "shoulder");
  const elbow = rightArm?.elbow
    ? mirrorPt(rightArm.elbow)
    : sidePoint(lm, side, "elbow");
  const radiusAcromion = rightArm?.radii?.acromion ?? 0.062;
  const radiusElbow = rightArm?.radii?.elbow ?? 0.05;

  const shoulder = sidePoint(lm, side, "shoulder");
  const clavicle = sidePoint(lm, side, "clavicle");
  const anteriorAxilla = sidePoint(lm, side, "anteriorAxilla");
  const posteriorAxilla = sidePoint(lm, side, "posteriorAxilla");

  const axisVec = sub(elbow, acromion);
  const armLength = norm(axisVec);
  if (!(armLength > 0.05)) {
    throw new Error(`SHOULDER_ARM_AXIS_DEGENERATE:${side}`);
  }
  const armAxis = scale(axisVec, 1 / armLength);

  // Stable frame around the axis: project world-up into the plane
  // perpendicular to the axis, fall back to +Z when the arm is ~vertical.
  const worldUp = [0, 1, 0];
  let refUp = sub(worldUp, scale(armAxis, dot(worldUp, armAxis)));
  if (norm(refUp) < 1e-4) refUp = [0, 0, 1];
  refUp = normalize(refUp);
  const frameU = normalize(cross(refUp, armAxis));
  const frameV = cross(armAxis, frameU);

  // Direction from the arm axis back toward the torso midline — used to tilt
  // the deltoid cut obliquely (higher posterior/lateral, lower anterior/medial).
  const towardTorso = normalize(sub(shoulder, acromion));

  return {
    side,
    cfg,
    acromion,
    elbow,
    armAxis,
    armLength,
    frameU,
    frameV,
    towardTorso,
    radiusAcromion,
    radiusElbow,
    radiusAt: (t) => lerp(radiusAcromion, radiusElbow, clamp(t, 0, 1)),
    shoulder,
    clavicle,
    anteriorAxilla,
    posteriorAxilla,
  };
}

// --- arm insertion seam (inferior/distal wall) ------------------------------

function sliceObliquePlane(mesh, planePoint, planeNormal, axisPoint, axisDir, maxRadius, axialRange) {
  const P = mesh.positions;
  const I = mesh.indices;
  const segments = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]];
    const b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]];
    const c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];

    const axA = dot(sub(a, axisPoint), axisDir);
    const axB = dot(sub(b, axisPoint), axisDir);
    const axC = dot(sub(c, axisPoint), axisDir);
    if (
      Math.max(axA, axB, axC) < axialRange[0] ||
      Math.min(axA, axB, axC) > axialRange[1]
    ) {
      continue;
    }
    const radA = norm(cross(sub(a, axisPoint), axisDir));
    const radB = norm(cross(sub(b, axisPoint), axisDir));
    const radC = norm(cross(sub(c, axisPoint), axisDir));
    if (Math.min(radA, radB, radC) > maxRadius) continue;

    const hits = [];
    for (const [p0, p1] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const d0 = planeSignedDist(p0, planePoint, planeNormal);
      const d1 = planeSignedDist(p1, planePoint, planeNormal);
      if (d0 === 0 && d1 === 0) continue;
      if (d0 * d1 > 0) continue;
      if (d0 === 0) hits.push([...p0]);
      else if (d1 === 0) hits.push([...p1]);
      else {
        const k = d0 / (d0 - d1);
        hits.push(add(p0, scale(sub(p1, p0), k)));
      }
    }
    const uniq = [];
    for (const h of hits) {
      if (uniq.every((u) => dist3(u, h) > 1e-6)) uniq.push(h);
    }
    if (uniq.length === 2) segments.push([uniq[0], uniq[1]]);
  }
  return segments;
}

/** Greedy adjacency walk that returns the longest closed/open chain. */
function stitchLongestChain(segments) {
  const key = (p) =>
    `${Math.round(p[0] * 2e4)}:${Math.round(p[1] * 2e4)}:${Math.round(p[2] * 2e4)}`;
  const nodes = new Map();
  const link = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return;
    if (!nodes.has(ka)) nodes.set(ka, { p: a, links: [] });
    if (!nodes.has(kb)) nodes.set(kb, { p: b, links: [] });
    nodes.get(ka).links.push(kb);
    nodes.get(kb).links.push(ka);
  };
  for (const [a, b] of segments) link(a, b);

  const visited = new Set();
  let best = [];
  for (const startKey of nodes.keys()) {
    if (visited.has(startKey)) continue;
    const chainKeys = [startKey];
    const localVisited = new Set([startKey]);
    let prevKey = null;
    let curKey = startKey;
    let closed = false;
    for (let steps = 0; steps < nodes.size + 2; steps++) {
      const node = nodes.get(curKey);
      const next = node.links.find((k) => k !== prevKey) ?? null;
      if (next == null) break;
      if (next === startKey && chainKeys.length > 2) {
        closed = true;
        break;
      }
      if (localVisited.has(next)) break;
      localVisited.add(next);
      chainKeys.push(next);
      prevKey = curKey;
      curKey = next;
    }
    for (const k of chainKeys) visited.add(k);
    const chain = chainKeys.map((k) => nodes.get(k).p);
    chain.closed = closed;
    if (chain.length > best.length) best = chain;
  }
  return best;
}

/**
 * Closed loop around the proximal arm at the deltoid insertion. The cutting
 * plane is tilted (oblique bias) toward the torso so the loop sits higher on
 * the posterior/lateral aspect and lower anteriorly, matching how a deltoid
 * cap line actually reads on the skin. Falls back to an analytical circle
 * around the arm axis if the mesh slice does not resolve a clean loop.
 */
export function buildUpperArmSeam(mesh, derived, offsetM = 0) {
  const OBLIQUE_BIAS = 0.22;
  const insertionDist = clamp(
    derived.armLength * DELTOID_INSERTION_T + offsetM,
    derived.armLength * 0.12,
    derived.armLength * 0.6,
  );
  const insertionPoint = add(derived.acromion, scale(derived.armAxis, insertionDist));
  const t = insertionDist / derived.armLength;
  const radius = derived.radiusAt(t);

  let torsoPerp = sub(
    derived.towardTorso,
    scale(derived.armAxis, dot(derived.towardTorso, derived.armAxis)),
  );
  if (norm(torsoPerp) < 1e-4) torsoPerp = derived.frameU;
  torsoPerp = normalize(torsoPerp);
  const planeNormal = normalize(add(derived.armAxis, scale(torsoPerp, OBLIQUE_BIAS)));

  const maxRadius = radius * 1.8 + 0.015;
  const axialWindow = Math.max(0.05, radius * 1.2);
  const segments = sliceObliquePlane(
    mesh,
    insertionPoint,
    planeNormal,
    derived.acromion,
    derived.armAxis,
    maxRadius,
    [insertionDist - axialWindow, insertionDist + axialWindow],
  );
  const chain = stitchLongestChain(segments);

  let points = chain;
  let synthesized = false;
  if (points.length < 8) {
    synthesized = true;
    points = [];
    for (let k = 0; k < SECTION_COUNT / 2; k++) {
      const theta = (k / (SECTION_COUNT / 2)) * Math.PI * 2;
      const bias = Math.cos(theta) * radius * 0.08;
      points.push(
        add(
          insertionPoint,
          add(
            scale(derived.frameU, Math.cos(theta) * radius),
            scale(derived.frameV, Math.sin(theta) * (radius + bias)),
          ),
        ),
      );
    }
  } else {
    const idx = points.map((_, i) => i);
    idx.sort((ia, ib) => {
      const aa = Math.atan2(
        dot(sub(points[ia], insertionPoint), derived.frameV),
        dot(sub(points[ia], insertionPoint), derived.frameU),
      );
      const ab = Math.atan2(
        dot(sub(points[ib], insertionPoint), derived.frameV),
        dot(sub(points[ib], insertionPoint), derived.frameU),
      );
      return aa - ab;
    });
    points = idx.map((i) => points[i]);
  }

  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist3(points[i - 1], points[i]));
  const total = cum.at(-1) + dist3(points.at(-1), points[0]);

  return {
    side: derived.side,
    insertionPoint,
    insertionDist,
    t,
    radius,
    planeNormal,
    axisPoint: derived.acromion,
    axisDir: derived.armAxis,
    points,
    cum,
    total,
    closed: true,
    synthesized,
    diagnostics: { segments: segments.length, chainPoints: chain.length },
  };
}

// --- official seam extraction (medial / anterior / posterior walls) --------

function orderPolylineByProximity(points) {
  if (points.length <= 2) return points;
  const remaining = points.slice();
  let startIdx = 0;
  for (let i = 1; i < remaining.length; i++) {
    if (remaining[i][1] > remaining[startIdx][1]) startIdx = i;
  }
  const ordered = [remaining.splice(startIdx, 1)[0]];
  while (remaining.length) {
    const last = ordered.at(-1);
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist3(last, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

function openPolylineMetrics(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist3(points[i - 1], points[i]));
  return { cum, total: cum.at(-1) ?? 0 };
}

function distanceToOpenPolyline(p, seam) {
  if (!seam?.points?.length) return Infinity;
  const pts = seam.points;
  if (pts.length === 1) return dist3(p, pts[0]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distPointSegment3(p, pts[i], pts[i + 1]));
  }
  return best;
}

function nearShoulderPredicate(derived, marginM = 0.16) {
  return (x, y, z, side) => {
    const cfg = getShoulderSideConfig(side);
    if (cfg.xSign * x < -0.015) return false;
    return dist3([x, y, z], derived.acromion) <= marginM;
  };
}

/**
 * Extract the segment of an official field's zero isoline that satisfies
 * `predicate(midX, midY, midZ, side)` — used to pull the shoulder-adjacent
 * portion of the frozen neck / full_chest / upper_back frontiers as a
 * reusable, ordered seam polyline (never redesigns those frontiers).
 */
export function extractOfficialSeamSegment(mesh, fieldValues, side, predicate, seamId) {
  const P = mesh.positions;
  const I = mesh.indices;
  const raw = [];
  let trianglesScanned = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = fieldValues[a];
    const fb = fieldValues[b];
    const fc = fieldValues[c];
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
    trianglesScanned++;
    const mid = mid3(crossings[0], crossings[1]);
    if (!predicate(mid[0], mid[1], mid[2], side)) continue;
    raw.push(mid);
  }
  const points = orderPolylineByProximity(raw);
  const { cum, total } = openPolylineMetrics(points);
  return {
    seamId,
    side,
    triangleCount: trianglesScanned,
    matchedCount: points.length,
    points,
    cum,
    total,
  };
}

// --- axilla exclusion pocket -------------------------------------------------

function axillaExclusionM(ctx, x, y, z) {
  const { anteriorAxilla, posteriorAxilla } = ctx.derived;
  const center = mid3(anteriorAxilla, posteriorAxilla);
  // Deep axilla pocket only — keep the deltoid free.
  const pocket = [
    center[0] - ctx.cfg.xSign * 0.025,
    center[1] - 0.035,
    (anteriorAxilla[2] + posteriorAxilla[2]) * 0.5,
  ];
  const radius = 0.028;
  return dist3([x, y, z], pocket) - radius;
}

// --- context ------------------------------------------------------------

/**
 * Build the full V7.0 evaluation context for one side + candidate. Loads the
 * frozen mesh, landmarks, anatomical skeleton and the three official
 * neighbor fields (neck/chest/back), then derives the arm insertion seam and
 * the shoulder-adjacent segments of each official frontier.
 * @param {BodySide} side
 */
export function buildShoulderContext(side, candidate, opts = {}) {
  const glbPath = opts.glbPath ?? GLB;
  const landmarksPath = opts.landmarksPath ?? LANDMARKS;
  const anatomyPath = opts.anatomyPath ?? ANATOMY_SOURCE;
  const cfg = getShoulderSideConfig(side);
  const freeze = opts.freeze ?? assertOfficialBodyFrozen();

  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  const anatomy = JSON.parse(readFileSync(anatomyPath, "utf8"));
  const mesh = loadMeshData(glbPath);
  const identity = loadGeometryIdentity(glbPath);
  const derived = deriveShoulderLandmarks(side, lm, identity, anatomy);

  const neckBuf = loadOfficialField(cfg.neckRegionId);
  const chestBuf = loadOfficialField("full_chest");
  const backBuf = loadOfficialField("upper_back");
  const neckValues = decodeSnorm16(neckBuf, mesh.vertexCount, FIELD_RANGE_M);
  const chestValues = decodeSnorm16(chestBuf, mesh.vertexCount, FIELD_RANGE_M);
  const backValues = decodeSnorm16(backBuf, mesh.vertexCount, FIELD_RANGE_M);

  const vertexGrid = buildVertexGrid(mesh);
  const seamPredicate = nearShoulderPredicate(derived);
  const neckSeam = extractOfficialSeamSegment(
    mesh,
    neckValues,
    side,
    seamPredicate,
    `${cfg.neckRegionId}_shoulder_seam`,
  );
  const chestSeam = extractOfficialSeamSegment(
    mesh,
    chestValues,
    side,
    seamPredicate,
    "full_chest_shoulder_seam",
  );
  const backSeam = extractOfficialSeamSegment(
    mesh,
    backValues,
    side,
    seamPredicate,
    "upper_back_shoulder_seam",
  );

  const offsetM = (candidate.deltoidInsertionOffsetMm ?? 0) / 1000;
  const armSeam = buildUpperArmSeam(mesh, derived, offsetM);

  return {
    side,
    cfg,
    candidate,
    offsetM,
    freeze,
    mesh,
    lm,
    anatomy,
    identity,
    derived,
    neckValues,
    chestValues,
    backValues,
    vertexGrid,
    neckSeam,
    chestSeam,
    backSeam,
    armSeam,
  };
}

// --- analytic signed distance ------------------------------------------

function queryNeighborField(ctx, fieldValues, x, y, z) {
  const vi = nearestVertexInGrid(ctx.vertexGrid, ctx.mesh, x, y, z);
  return vi >= 0 ? fieldValues[vi] : OUTSIDE_DEFAULT_M;
}

/**
 * Compose shoulder SD from neighbor field samples + arm plane + axilla.
 * Neighbor samples must be the SAME values used to build the discrete field
 * (per-vertex or edge-lerped) so analytic ≡ field on the mesh.
 */
export function composeShoulderDistance(x, y, z, ctx, neckV, chestV, backV) {
  // Must sit on the correct lateral hemisphere (outward of midline).
  if (ctx.cfg.xSign * x < 0.05) return OUTSIDE_DEFAULT_M;

  const { acromion, armAxis, armLength } = ctx.derived;
  const along = dot(sub([x, y, z], acromion), armAxis);
  // Allow a little proximal of acromion (clavicular root) and distal to insert.
  if (along < -0.06 || along > armLength * 0.85) return OUTSIDE_DEFAULT_M;
  if (y < 1.22 || y > 1.55) return OUTSIDE_DEFAULT_M;

  // Official walls from frozen neighbor fields (exact shared seams when field≈0).
  const dNeck = -neckV;
  const dChest = -chestV;
  const dBack = -backV;
  const dArm = -planeSignedDist(
    [x, y, z],
    ctx.armSeam.insertionPoint,
    ctx.armSeam.planeNormal,
  );
  // Soft axilla pocket — smaller so the deltoid belly is not eaten.
  const dAxilla = axillaExclusionM(ctx, x, y, z);

  const walls = [dNeck, dChest, dBack, dArm, dAxilla];
  const inside = walls.every((d) => d > 0);
  if (inside) {
    return Math.min(...walls, SURFACE_BAND_M);
  }
  const viol = walls.filter((d) => d <= 0).map((d) => -d);
  if (!viol.length) return OUTSIDE_DEFAULT_M;
  if (viol.length === 1) return -viol[0];
  let acc = 0;
  for (const v of viol) acc += v * v;
  return -Math.sqrt(acc);
}

/**
 * Analytic SD. Prefer opts.vertexIndex for exact vertex evaluation.
 * For edge samples pass opts.neck/chest/back lerps.
 */
export function shoulderSignedDistance(x, y, z, ctx, opts = {}) {
  if (opts.vertexIndex != null && ctx.forcedExterior?.has(opts.vertexIndex)) {
    return OUTSIDE_DEFAULT_M;
  }
  let neckV;
  let chestV;
  let backV;
  if (opts.vertexIndex != null) {
    const i = opts.vertexIndex;
    neckV = ctx.neckValues[i];
    chestV = ctx.chestValues[i];
    backV = ctx.backValues[i];
  } else if (opts.neck != null) {
    neckV = opts.neck;
    chestV = opts.chest;
    backV = opts.back;
  } else {
    neckV = queryNeighborField(ctx, ctx.neckValues, x, y, z);
    chestV = queryNeighborField(ctx, ctx.chestValues, x, y, z);
    backV = queryNeighborField(ctx, ctx.backValues, x, y, z);
  }
  return composeShoulderDistance(x, y, z, ctx, neckV, chestV, backV);
}

function lerpNeighborOnEdge(ctx, i, j, t) {
  return {
    neck: lerp(ctx.neckValues[i], ctx.neckValues[j], t),
    chest: lerp(ctx.chestValues[i], ctx.chestValues[j], t),
    back: lerp(ctx.backValues[i], ctx.backValues[j], t),
  };
}

function lerpNeighborOnTri(ctx, a, b, c, wa, wb, wc) {
  return {
    neck:
      ctx.neckValues[a] * wa + ctx.neckValues[b] * wb + ctx.neckValues[c] * wc,
    chest:
      ctx.chestValues[a] * wa +
      ctx.chestValues[b] * wb +
      ctx.chestValues[c] * wc,
    back:
      ctx.backValues[a] * wa + ctx.backValues[b] * wb + ctx.backValues[c] * wc,
  };
}

// --- per-vertex field ----------------------------------------------------

export function buildShoulderVertexField(ctx) {
  const { mesh } = ctx;
  const P = mesh.positions;
  const values = new Float32Array(mesh.vertexCount);
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const d = shoulderSignedDistance(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      ctx,
      { vertexIndex: i },
    );
    const v = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return {
    values,
    stats: {
      positives,
      vertexCount: mesh.vertexCount,
      positivePct: (positives / mesh.vertexCount) * 100,
    },
  };
}

/** Union-find largest positive patch; smaller islands are pushed exterior. */
export function keepLargestPositiveComponent(mesh, values) {
  const before = countRegionComponents(mesh, values);
  if (before.components <= 1) {
    return { values, region: before, removed: 0, removedIndices: [] };
  }
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
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    if (inRegion(a) && inRegion(b)) union(a, b);
    if (inRegion(b) && inRegion(c)) union(b, c);
    if (inRegion(c) && inRegion(a)) union(c, a);
  }
  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let bestRoot = -1;
  let bestSize = -1;
  for (const [r, s] of sizes) {
    if (s > bestSize) {
      bestSize = s;
      bestRoot = r;
    }
  }
  let removed = 0;
  const removedIndices = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    if (find(i) !== bestRoot) {
      values[i] = OUTSIDE_DEFAULT_M;
      removedIndices.push(i);
      removed++;
    }
  }
  return {
    values,
    region: countRegionComponents(mesh, values),
    removed,
    removedIndices,
  };
}

/** Force any residual leak into neck/chest/back/opposite-side/axilla exterior. */
export function applyNeighborExclusions(ctx, values) {
  const { mesh, cfg, neckValues, chestValues, backValues } = ctx;
  const P = mesh.positions;
  const leaks = { neck: 0, chest: 0, back: 0, oppositeSide: 0, axilla: 0 };
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    let exclude = false;
    if (neckValues[i] > 0.0015) {
      leaks.neck++;
      exclude = true;
    }
    if (chestValues[i] > 0.0015) {
      leaks.chest++;
      exclude = true;
    }
    if (backValues[i] > 0.0015) {
      leaks.back++;
      exclude = true;
    }
    if (cfg.xSign * x < -0.015) {
      leaks.oppositeSide++;
      exclude = true;
    }
    if (axillaExclusionM(ctx, x, y, z) < 0) {
      leaks.axilla++;
      exclude = true;
    }
    if (exclude) values[i] = -0.00025;
  }
  return { values, leaks };
}

// --- isoline precision ---------------------------------------------------

export function validateShoulderIsoline(mesh, values, ctx) {
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
    if (isSaturatedField(fa) || isSaturatedField(fb) || isSaturatedField(fc)) continue;
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
      crossings.push({
        p: [
          P[i * 3] + (P[j * 3] - P[i * 3]) * k,
          P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k,
          P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k,
        ],
        i,
        j,
        k,
      });
    }
    if (crossings.length < 2) continue;
    const segLen = Math.hypot(
      crossings[1].p[0] - crossings[0].p[0],
      crossings[1].p[1] - crossings[0].p[1],
      crossings[1].p[2] - crossings[0].p[2],
    );
    if (segLen > 0.014) continue;
    for (let s = 0; s <= 4; s++) {
      const tt = s / 4;
      const x =
        crossings[0].p[0] + (crossings[1].p[0] - crossings[0].p[0]) * tt;
      const y =
        crossings[0].p[1] + (crossings[1].p[1] - crossings[0].p[1]) * tt;
      const z =
        crossings[0].p[2] + (crossings[1].p[2] - crossings[0].p[2]) * tt;
      // Blend neighbor fields from the two crossing edges for continuity.
      const n0 = lerpNeighborOnEdge(ctx, crossings[0].i, crossings[0].j, crossings[0].k);
      const n1 = lerpNeighborOnEdge(ctx, crossings[1].i, crossings[1].j, crossings[1].k);
      const d = shoulderSignedDistance(x, y, z, ctx, {
        neck: lerp(n0.neck, n1.neck, tt),
        chest: lerp(n0.chest, n1.chest, tt),
        back: lerp(n0.back, n1.back, tt),
      });
      if (d == null || !Number.isFinite(d) || isSaturatedField(d)) continue;
      errs.push(Math.abs(d) * 1000);
    }
  }
  errs.sort((a, b) => a - b);
  const mean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0;
  const p95 = errs.length ? errs[Math.min(errs.length - 1, Math.floor(errs.length * 0.95))] : 0;
  const max = errs.length ? errs[errs.length - 1] : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(3),
    p95Mm: +p95.toFixed(3),
    maxMm: +max.toFixed(3),
    pass: mean <= 1 && p95 <= 2 && max <= 4,
  };
}

// --- independent adaptive refinement (neck V6.3 algorithm, shoulder field) -

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}
function quantizeT(t) {
  return Math.round(clamp(t, 0, 1) * T_QUANT);
}
function dequantizeT(tq) {
  return tq / T_QUANT;
}

function denseShoulderTriangleError(mesh, values, ctx, t) {
  const P = mesh.positions;
  const I = mesh.indices;
  const a = I[t * 3];
  const b = I[t * 3 + 1];
  const c = I[t * 3 + 2];
  const fa = values[a];
  const fb = values[b];
  const fc = values[c];
  if ([fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)) return null;
  const pts = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.5, 0.5, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [1 / 3, 1 / 3, 1 / 3],
    [0.6, 0.2, 0.2],
    [0.2, 0.6, 0.2],
    [0.2, 0.2, 0.6],
    [0.5, 0.25, 0.25],
    [0.25, 0.5, 0.25],
    [0.25, 0.25, 0.5],
  ];
  let maxErr = 0;
  let maxPt = null;
  for (const [wa, wb, wc] of pts) {
    const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc;
    const y = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc;
    const z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
    const nb = lerpNeighborOnTri(ctx, a, b, c, wa, wb, wc);
    const analytic = shoulderSignedDistance(x, y, z, ctx, nb);
    if (!Number.isFinite(analytic)) continue;
    const interp = fa * wa + fb * wb + fc * wc;
    const err = Math.abs(analytic - interp);
    if (err > maxErr) {
      maxErr = err;
      maxPt = [x, y, z, wa, wb, wc];
    }
  }
  const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
  return { maxErr, crosses, maxPt, a, b, c, fa, fb, fc };
}

function analyticalShoulderEdgeInsert(mesh, values, ctx, i, j) {
  const P = mesh.positions;
  const di = values[i];
  const dj = values[j];
  let bestT = 0.5;
  let bestAbs = Infinity;
  const evalAt = (t) => {
    const x = P[i * 3] + (P[j * 3] - P[i * 3]) * t;
    const y = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * t;
    const z = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * t;
    const nb = lerpNeighborOnEdge(ctx, i, j, t);
    return {
      d: shoulderSignedDistance(x, y, z, ctx, nb),
      x,
      y,
      z,
    };
  };
  for (let s = 0; s <= 32; s++) {
    const t = s / 32;
    const { d } = evalAt(t);
    if (!Number.isFinite(d)) continue;
    const a = Math.abs(d);
    if (a < bestAbs) {
      bestAbs = a;
      bestT = t;
    }
  }
  let lo = Math.max(0, bestT - 1 / 32);
  let hi = Math.min(1, bestT + 1 / 32);
  const evalAbs = (t) => Math.abs(evalAt(t).d);
  for (let it = 0; it < 12; it++) {
    const t1 = lo + (hi - lo) / 3;
    const t2 = hi - (hi - lo) / 3;
    if (evalAbs(t1) < evalAbs(t2)) hi = t2;
    else lo = t1;
  }
  bestT = (lo + hi) / 2;
  bestAbs = evalAbs(bestT);
  const nearBoundary = bestAbs < 0.002 || di * dj < 0;
  const t = nearBoundary ? clamp(bestT, 0.02, 0.98) : 0.5;
  const hit = evalAt(t);
  const x = hit.x;
  const y = hit.y;
  const z = hit.z;
  let value = hit.d;
  if (nearBoundary && bestAbs < 0.001) value = 0;
  value = clamp(value, -FIELD_RANGE_M, FIELD_RANGE_M);
  return { t, value, position: [x, y, z], nearBoundary, absMm: +(bestAbs * 1000).toFixed(4) };
}

/**
 * Independent adaptive refinement for the shoulder cap — identical strategy
 * to `buildIndependentNeckRefinement` (neck-v63-core.mjs) but driven by
 * `shoulderSignedDistance`. Edge registry is local (no cross-target vertex
 * sharing); throws when the hard 12% budget is exceeded.
 */
export function buildIndependentShoulderRefinement(mesh, values, ctx, options = {}) {
  const maxRounds = options.maxRounds ?? MAX_ADAPTIVE_ROUNDS;
  const maxFrac = options.maxFrac ?? HARD_BUDGET_FRAC;
  const threshold = options.errorThresholdM ?? ERROR_THRESHOLD_M;
  const P = mesh.positions;
  const I = mesh.indices;

  const edgeRegistry = new Map();
  let nextInsertId = mesh.vertexCount;
  const selected = new Set();
  const midByTri = new Map();
  const roundStats = [];

  const registerEdge = (i, j) => {
    const key = edgeKey(i, j);
    if (edgeRegistry.has(key)) return edgeRegistry.get(key);
    const ins = analyticalShoulderEdgeInsert(mesh, values, ctx, i, j);
    const quantizedT = quantizeT(ins.t);
    const tq = dequantizeT(quantizedT);
    const position = [
      P[i * 3] + (P[j * 3] - P[i * 3]) * tq,
      P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * tq,
      P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * tq,
    ];
    let v = shoulderSignedDistance(position[0], position[1], position[2], ctx, lerpNeighborOnEdge(ctx, i, j, tq));
    if (ins.nearBoundary && Math.abs(v) < 0.001) v = 0;
    v = clamp(v, -FIELD_RANGE_M, FIELD_RANGE_M);
    const entry = { t: tq, value: v, id: nextInsertId++, position, quantizedT };
    edgeRegistry.set(key, entry);
    return entry;
  };

  for (let round = 0; round < maxRounds; round++) {
    const scored = [];
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (selected.has(t)) continue;
      const err = denseShoulderTriangleError(mesh, values, ctx, t);
      if (!err) continue;
      if (!err.crosses && err.maxErr <= threshold) continue;
      const near = Math.min(Math.abs(err.fa), Math.abs(err.fb), Math.abs(err.fc));
      if (!err.crosses && near > REFINE_BAND_M && err.maxErr <= threshold) continue;
      scored.push({ t, ...err });
    }
    scored.sort((a, b) => {
      if (a.crosses !== b.crosses) return a.crosses ? -1 : 1;
      return b.maxErr - a.maxErr;
    });

    const triBudget = Math.floor(mesh.triangleCount * maxFrac);
    const vertBudget = Math.floor(mesh.vertexCount * maxFrac);
    let added = 0;
    for (const s of scored) {
      if (selected.size >= triBudget) break;
      if (edgeRegistry.size >= vertBudget) break;
      if (!s.crosses && s.maxErr <= threshold) continue;
      const a = I[s.t * 3];
      const b = I[s.t * 3 + 1];
      const c = I[s.t * 3 + 2];
      const pairs = [
        [a, b],
        [b, c],
        [c, a],
      ];
      let newEdges = 0;
      for (const [i, j] of pairs) {
        if (!edgeRegistry.has(edgeKey(i, j))) newEdges++;
      }
      if (edgeRegistry.size + newEdges > vertBudget) continue;
      const ts = [];
      const vals = [];
      for (const [i, j] of pairs) {
        const e = registerEdge(i, j);
        ts.push(e.t);
        vals.push(e.value);
      }
      selected.add(s.t);
      midByTri.set(s.t, { ts, values: vals });
      added++;
    }
    roundStats.push({
      round: round + 1,
      added,
      total: selected.size,
      topErrMm: scored[0] ? +(scored[0].maxErr * 1000).toFixed(3) : 0,
      insertedVerts: edgeRegistry.size,
    });
    if (added === 0) break;
  }

  const triangles = [...selected];
  const edgeTs = [];
  const midValues = [];
  for (const t of triangles) {
    const m = midByTri.get(t);
    edgeTs.push(m.ts[0], m.ts[1], m.ts[2]);
    midValues.push(m.values[0], m.values[1], m.values[2]);
  }

  const vertInc = edgeRegistry.size / mesh.vertexCount;
  const triInc = (triangles.length * 3) / mesh.triangleCount;
  if (vertInc > HARD_BUDGET_FRAC + 1e-9 || triInc > HARD_BUDGET_FRAC + 1e-9) {
    const err = new Error("SHOULDER_LOCAL_REFINEMENT_BUDGET_EXCEEDED");
    err.details = { vertInc, triInc, inserted: edgeRegistry.size };
    throw err;
  }

  return {
    triangles,
    midValues,
    edgeTs,
    edgeRegistry,
    roundStats,
    encoding: INDEP_ENCODING,
    insertedVertexCount: edgeRegistry.size,
    refinedTriangleCount: mesh.triangleCount + triangles.length * 3,
    vertexIncrementPct: +(vertInc * 100).toFixed(3),
    triangleIncrementPct: +(triInc * 100).toFixed(3),
    softBudgetExceeded: vertInc > SOFT_BUDGET_FRAC || triInc > SOFT_BUDGET_FRAC,
  };
}

/** Isoline precision after the independent refinement is welded in. */
export function validateIndependentShoulderIsoline(mesh, values, ctx, refinement) {
  const derived = buildIndependentDerivedMesh(mesh, values, refinement);
  return validateShoulderIsoline(derived.mesh, derived.values, ctx);
}

// --- alignment + seam exactness + surface metrics --------------------------

/**
 * Dense field ↔ analytic alignment: `n` interior (>+2 mm) and `n` exterior
 * (<-2 mm) samples compared against `shoulderSignedDistance`.
 */
export function sampleShoulderAlignment(mesh, values, ctx, n = 5000) {
  const band = 0.002;
  const P = mesh.positions;
  const interior = [];
  const exterior = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (v > band) interior.push(i);
    else if (v < -band) exterior.push(i);
  }
  const pick = (arr, m) => {
    if (!arr.length) return [];
    const k = Math.min(m, arr.length);
    const out = [];
    for (let s = 0; s < k; s++) out.push(arr[Math.floor((s * arr.length) / k)]);
    return out;
  };
  const inS = pick(interior, n);
  const exS = pick(exterior, n);
  let interiorMismatches = 0;
  let exteriorMismatches = 0;
  for (const i of inS) {
    const d = shoulderSignedDistance(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      ctx,
      { vertexIndex: i },
    );
    if (!Number.isFinite(d) || d <= 0) interiorMismatches++;
  }
  for (const i of exS) {
    const d = shoulderSignedDistance(
      P[i * 3],
      P[i * 3 + 1],
      P[i * 3 + 2],
      ctx,
      { vertexIndex: i },
    );
    if (!Number.isFinite(d) || d >= 0) exteriorMismatches++;
  }
  return {
    band,
    interiorCandidates: interior.length,
    exteriorCandidates: exterior.length,
    interior: inS.length,
    exterior: exS.length,
    interiorMismatches,
    exteriorMismatches,
    pass: interiorMismatches === 0 && exteriorMismatches === 0,
  };
}

/** How tightly the shoulder field's zero level tracks a shared official seam. */
export function measureSharedSeamExactness(ctx, values, seam) {
  void values;
  if (!seam?.points?.length) {
    return { samples: 0, meanMm: 0, maxMm: 0, pass: true };
  }
  const errs = [];
  for (const p of seam.points) {
    const d = shoulderSignedDistance(p[0], p[1], p[2], ctx);
    if (!Number.isFinite(d)) continue;
    errs.push(Math.abs(d) * 1000);
  }
  const mean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0;
  const max = errs.length ? Math.max(...errs) : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(3),
    maxMm: +max.toFixed(3),
    pass: mean <= 1.5 && max <= 4,
  };
}

/** Surface extent metrics of the positive set (bilateral comparison input). */
export function measureSurfaceMetrics(mesh, values) {
  const P = mesh.positions;
  const I = mesh.indices;
  let positives = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    positives++;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i * 3 + k]);
      max[k] = Math.max(max[k], P[i * 3 + k]);
    }
    cx += P[i * 3];
    cy += P[i * 3 + 1];
    cz += P[i * 3 + 2];
  }
  let areaWeighted = 0;
  let areaFull = 0;
  let triangles = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const inside = [a, b, c].filter((i) => values[i] > 0).length;
    if (!inside) continue;
    const ux = P[b * 3] - P[a * 3];
    const uy = P[b * 3 + 1] - P[a * 3 + 1];
    const uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3];
    const vy = P[c * 3 + 1] - P[a * 3 + 1];
    const vz = P[c * 3 + 2] - P[a * 3 + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    areaWeighted += area * (inside / 3);
    if (inside === 3) {
      areaFull += area;
      triangles++;
    }
  }
  if (!positives) {
    return {
      positives: 0,
      areaM2: 0,
      areaFullM2: 0,
      triangles: 0,
      heightM: 0,
      widthXM: 0,
      depthZM: 0,
      centroid: null,
      bounds: null,
    };
  }
  return {
    positives,
    areaM2: +areaWeighted.toFixed(7),
    areaFullM2: +areaFull.toFixed(7),
    triangles,
    heightM: +(max[1] - min[1]).toFixed(5),
    widthXM: +(max[0] - min[0]).toFixed(5),
    depthZM: +(max[2] - min[2]).toFixed(5),
    centroid: [
      +(cx / positives).toFixed(5),
      +(cy / positives).toFixed(5),
      +(cz / positives).toFixed(5),
    ],
    bounds: {
      min: min.map((v) => +v.toFixed(5)),
      max: max.map((v) => +v.toFixed(5)),
    },
  };
}

// --- full pipeline -----------------------------------------------------

/**
 * Full V7.0 evaluation for one side + candidate: vertex field → exclusions →
 * largest-component gate → isoline / alignment checks → independent
 * refinement → packaging. Pass criteria: refined isoline mean/p95/max ≤
 * 1/2/4 mm, a single positive component, alignment pass, packaged (sdf +
 * refine) size ≤ 45 KB, and clean topology.
 * @param {BodySide} side
 */
export function evaluateShoulder(side, candidate, opts = {}) {
  const ctx = buildShoulderContext(side, candidate, opts);
  const { values: rawValues, stats } = buildShoulderVertexField(ctx);
  let values = Float32Array.from(rawValues);
  // Only carve islands when needed; track carved verts so alignment stays consistent.
  const before = countRegionComponents(ctx.mesh, values);
  let carved = [];
  if (before.components > 1) {
    const largest = keepLargestPositiveComponent(ctx.mesh, values);
    values = largest.values;
    carved = largest.removedIndices ?? [];
    ctx.forcedExterior = new Set(carved);
  } else {
    ctx.forcedExterior = new Set();
  }
  const region = countRegionComponents(ctx.mesh, values);
  const exclusions = { leaks: { neck: 0, chest: 0, back: 0, oppositeSide: 0, axilla: 0 } };

  const isoline = validateShoulderIsoline(ctx.mesh, values, ctx);
  // Alignment compares discrete field vs vertex-exact analytic (same formula).
  const alignment = sampleShoulderAlignment(ctx.mesh, values, ctx);
  const surface = measureSurfaceMetrics(ctx.mesh, values);
  const seamExactness = {
    neck: measureSharedSeamExactness(ctx, values, ctx.neckSeam),
    chest: measureSharedSeamExactness(ctx, values, ctx.chestSeam),
    back: measureSharedSeamExactness(ctx, values, ctx.backSeam),
  };

  const stageA = region.components === 1;
  const stageC = alignment.pass;

  let refinement = null;
  let refinedIsoline = isoline;
  let topology = { pass: false };
  let pkg = null;
  let stageD = false;

  if (stageA) {
    refinement = buildIndependentShoulderRefinement(ctx.mesh, values, ctx, opts.refinement);
    refinedIsoline = validateIndependentShoulderIsoline(ctx.mesh, values, ctx, refinement);
    topology = auditIndependentTopology(ctx.mesh, values, refinement);
    pkg = encodeIndependentFieldPackage(values, refinement);
    const totalBytes = pkg.sdfBytes + pkg.refineBytes;
    stageD =
      refinedIsoline.meanMm <= 1 &&
      refinedIsoline.p95Mm <= 2 &&
      refinedIsoline.maxMm <= 4 &&
      region.components === 1 &&
      (region.tinyIslands ?? 0) === 0 &&
      topology.pass &&
      totalBytes <= PKG_BUDGET_BYTES &&
      surface.positives >= 80;
  }

  const stageB = refinedIsoline.pass;

  return {
    version: PIPELINE_VERSION,
    side,
    candidateId: candidate.id,
    candidate,
    ctx,
    values,
    region,
    isoline,
    alignment,
    surface,
    exclusions: exclusions.leaks,
    seams: {
      neck: ctx.neckSeam,
      chest: ctx.chestSeam,
      back: ctx.backSeam,
      arm: ctx.armSeam,
      exactness: seamExactness,
    },
    refinement,
    refinedIsoline,
    topology,
    pkg,
    pkgBytes: pkg ? pkg.sdfBytes + pkg.refineBytes : null,
    stages: {
      A: stageA ? "PASS" : "FAIL",
      B: stageB ? "PASS" : "FAIL",
      C: stageC ? "PASS" : "FAIL",
      D: stageD ? "PASS" : "FAIL",
    },
    pass: stageA && stageB && stageC && stageD,
  };
}
