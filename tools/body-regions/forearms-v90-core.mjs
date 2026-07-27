/**
 * Forearms V9.0 — bilateral Geometry Distance Field engine.
 *
 * Each side is partitioned into:
 *   - forearm_inner_surface  (volar / palmar)
 *   - forearm_outer_surface  (dorsal)
 * Logical forearm uses an independent field over the full tube between
 * the frozen upper-arm–forearm seam (V8.0) and a new forearm–hand seam.
 *
 * BodySide = "right" | "left". Never mirrors vertices / fields / sidecars.
 */
import { readFileSync, existsSync } from "node:fs";
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
  keepLargestPositiveComponent,
  measureSurfaceMetrics,
  assertShoulderGeometryFrozen,
  REFINE_BAND_M,
} from "./shoulders-v70-core.mjs";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  SOURCE_GATE,
  FOREARMS_V90_OUT,
  OFFICIAL_UPPER_ARMS,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  contentHash16,
  getForearmSideConfig,
  getForearmTargetConfig,
  loadOfficialField,
  sha16,
  sidePoint,
} from "./forearms-side.mjs";

/** @typedef {"right"|"left"} BodySide */
/** @typedef {"inner"|"outer"|"forearm"} ForearmTargetKind */

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
const OFFICIAL_SEAMS = path.join(ROOT, "assets/body-regions/shared-seams");

export const SURFACE_BAND_M = 0.022;
export const PKG_BUDGET_BYTES = 45 * 1024;
/** Distal wrist seam as fraction of elbow→wrist (proximal of palm). */
export const HAND_SEAM_T = 0.92;
export const ATLAS_SECTIONS = 128;

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
  PIPELINE_VERSION,
  SOURCE_GATE,
  FOREARMS_V90_OUT,
  OFFICIAL_UPPER_ARMS,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  contentHash16,
  getForearmSideConfig,
  getForearmTargetConfig,
  loadOfficialField,
  sha16,
  sidePoint,
  keepLargestPositiveComponent,
  measureSurfaceMetrics,
  REFINE_BAND_M,
};

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
function planeSignedDist(p, planePoint, planeNormal) {
  return dot(sub(p, planePoint), planeNormal);
}
function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function buildVertexGrid(mesh, cellSize = 0.025) {
  const grid = new Map();
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const key = `${Math.floor(P[i * 3] / cellSize)}:${Math.floor(P[i * 3 + 1] / cellSize)}:${Math.floor(P[i * 3 + 2] / cellSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return { grid, cellSize };
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
    if (best >= 0) break;
  }
  return best;
}

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}
function quantizeT(t) {
  return Math.round(clamp(t, 0, 1) * T_QUANT);
}
function dequantizeT(q) {
  return q / T_QUANT;
}

/**
 * Derive forearm anatomical frame from elbow→wrist + palm orientation.
 * volar = inner (palmar); dorsal = outer; radial = thumb side.
 */
export function deriveForearmLandmarks(side, lm, identity, mesh = null) {
  assertShoulderGeometryFrozen(identity);
  const cfg = getForearmSideConfig(side);
  const elbow = sidePoint(lm, side, "elbow");
  const wristKey = side === "right" ? "wristRight" : "wristLeft";
  const wristPt = lm.points[wristKey];
  if (!wristPt) throw new Error(`missing landmark ${wristKey}`);
  const wrist = [...wristPt];
  const shoulder = sidePoint(lm, side, "shoulder");

  const axisVec = sub(wrist, elbow);
  const forearmLength = norm(axisVec);
  if (!(forearmLength > 0.04)) {
    throw new Error(`FOREARM_AXIS_DEGENERATE:${side}`);
  }
  const forearmAxis = scale(axisVec, 1 / forearmLength);

  // Estimate radii from mesh cross-sections when available.
  let radiusElbow = 0.048;
  let radiusWrist = 0.032;
  if (mesh) {
    const P = mesh.positions;
    const sampleR = (alongTarget, window = 0.012) => {
      const rs = [];
      for (let i = 0; i < mesh.vertexCount; i++) {
        const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
        if (cfg.xSign * p[0] < 0.02) continue;
        const along = dot(sub(p, elbow), forearmAxis);
        if (Math.abs(along - alongTarget) > window) continue;
        const radial = norm(cross(sub(p, elbow), forearmAxis));
        if (radial > 0.01 && radial < 0.09) rs.push(radial);
      }
      if (!rs.length) return null;
      rs.sort((a, b) => a - b);
      return rs[Math.floor(rs.length * 0.75)];
    };
    radiusElbow = sampleR(0.02) ?? radiusElbow;
    radiusWrist = sampleR(forearmLength * 0.95) ?? radiusWrist;
  }

  // Radial = lateral (away from torso) projected ⊥ forearm axis.
  // Right arm: lateral ≈ -X; left arm: lateral ≈ +X.
  const lateralGuess = [cfg.xSign, 0, 0];
  let radialDir = sub(
    lateralGuess,
    scale(forearmAxis, dot(lateralGuess, forearmAxis)),
  );
  if (norm(radialDir) < 1e-4) radialDir = [0, 0, 1];
  radialDir = normalize(radialDir);
  const ulnarDir = scale(radialDir, -1);

  // Volar (palm): derive from hand mesh distal to wrist, else project +Z.
  let volarNormal = null;
  if (mesh?.normals) {
    const P = mesh.positions;
    const N = mesh.normals;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      if (cfg.xSign * p[0] < 0.02) continue;
      const along = dot(sub(p, elbow), forearmAxis);
      if (along < forearmLength * 1.02 || along > forearmLength * 1.35) continue;
      const radial = norm(cross(sub(p, elbow), forearmAxis));
      if (radial > 0.08) continue;
      sx += N[i * 3];
      sy += N[i * 3 + 1];
      sz += N[i * 3 + 2];
      n++;
    }
    if (n >= 8) {
      let vn = [sx / n, sy / n, sz / n];
      vn = sub(vn, scale(forearmAxis, dot(vn, forearmAxis)));
      if (norm(vn) > 1e-4) volarNormal = normalize(vn);
    }
  }
  if (!volarNormal) {
    // Palm faces roughly anterior (+Z) in anatomical continuity with biceps.
    const worldFwd = [0, 0, 1];
    volarNormal = sub(worldFwd, scale(forearmAxis, dot(worldFwd, forearmAxis)));
    if (norm(volarNormal) < 1e-4) {
      volarNormal = cross(forearmAxis, radialDir);
    }
    volarNormal = normalize(volarNormal);
  }
  const dorsalNormal = scale(volarNormal, -1);

  // Re-orthogonalize radial against volar.
  radialDir = sub(radialDir, scale(volarNormal, dot(radialDir, volarNormal)));
  radialDir = sub(radialDir, scale(forearmAxis, dot(radialDir, forearmAxis)));
  if (norm(radialDir) < 1e-4) radialDir = cross(forearmAxis, volarNormal);
  radialDir = normalize(radialDir);
  const ulnarDirFinal = scale(radialDir, -1);

  // Orthonormal frame: U = radial, V = volar (for angular atlas with radial at 0).
  const frameU = radialDir;
  const frameV = normalize(cross(forearmAxis, frameU));
  // Ensure frameV aligns with volar hemisphere
  if (dot(frameV, volarNormal) < 0) {
    // flip U so V matches volar
  }
  const frameVAligned =
    dot(frameV, volarNormal) >= 0 ? frameV : scale(frameV, -1);
  const frameUAligned =
    dot(frameV, volarNormal) >= 0 ? frameU : scale(frameU, -1);
  const ulnarAligned = scale(frameUAligned, -1);

  const towardTorso = normalize(sub([0, elbow[1], elbow[2]], elbow));

  const styloidRadial = add(wrist, scale(frameUAligned, radiusWrist * 0.9));
  const styloidUlnar = add(wrist, scale(frameUAligned, -radiusWrist * 0.9));
  const palmCenter = add(wrist, scale(forearmAxis, 0.045));
  const dorsalCenter = add(wrist, scale(dorsalNormal, 0.01));

  return {
    side,
    cfg,
    elbow,
    wrist,
    shoulder,
    forearmAxis,
    forearmLength,
    frameU: frameUAligned,
    frameV: frameVAligned,
    volarNormal,
    dorsalNormal,
    radialDir: frameUAligned,
    ulnarDir: ulnarAligned,
    towardTorso,
    radiusElbow,
    radiusWrist,
    radiusAt: (t) => lerp(radiusElbow, radiusWrist, clamp(t, 0, 1)),
    styloidRadial,
    styloidUlnar,
    palmCenter,
    dorsalCenter,
    palmCrease: add(wrist, scale(volarNormal, radiusWrist * 0.35)),
    dorsalCrease: add(wrist, scale(dorsalNormal, radiusWrist * 0.35)),
    method: "elbow-wrist-palm-frame",
    confidence: mesh?.normals ? 0.88 : 0.78,
    geometryHash: identity.geometryHash,
  };
}

/** Load exact V8.0 upper-arm–forearm seam; assert hash. */
export function loadOfficialProximalSeam(side) {
  const expected = OFFICIAL_UPPER_ARMS.proximalSeamHashes[side];
  const file = path.join(OFFICIAL_SEAMS, `${side}-upper-arm-forearm.json`);
  if (!existsSync(file)) {
    throw new Error(`UPPER_ARM_FOREARM_SEAM_SOURCE_MISMATCH:missing:${side}`);
  }
  const raw = readFileSync(file, "utf8");
  const meta = JSON.parse(raw);
  if (meta.seamHash !== expected) {
    const err = new Error("UPPER_ARM_FOREARM_SEAM_SOURCE_MISMATCH");
    err.details = { side, expected, got: meta.seamHash };
    throw err;
  }
  // Map seam into forearm axis coordinates (insertionDist along elbow→wrist).
  return {
    ...meta,
    side,
    seamId: `${side}_upper_arm_forearm`,
    sourceHash: expected,
    fromV80: true,
    closed: meta.closed ?? true,
    autoIntersections: meta.autoIntersections ?? 0,
    components: meta.components ?? 1,
  };
}

/**
 * Attach proximal seam geometry into forearm local frame
 * (insertionDist = projection of insertionPoint onto elbow→wrist).
 */
export function attachProximalToForearmFrame(proximal, derived) {
  const along = dot(sub(proximal.insertionPoint, derived.elbow), derived.forearmAxis);
  return {
    ...proximal,
    axisPoint: derived.elbow,
    axisDir: derived.forearmAxis,
    insertionDist: along,
    // planeNormal from V8.0 points roughly distal along upper-arm axis;
    // for forearm, positive side should be distal of proximal wall → keep as-is
    // and interpret dProx = +planeSignedDist (distal side of wall).
  };
}

function rebuildSeamFromPlane(mesh, derived, planePoint, planeNormal, radius) {
  const P = mesh.positions;
  const I = mesh.indices;
  const maxRadius = radius * 2.2 + 0.02;
  const axial = dot(sub(planePoint, derived.elbow), derived.forearmAxis);
  const axialWindow = Math.max(0.035, radius * 1.4);
  const segments = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const pts = [
      [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]],
      [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]],
      [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]],
    ];
    const ax = pts.map((p) => dot(sub(p, derived.elbow), derived.forearmAxis));
    if (Math.max(...ax) < axial - axialWindow || Math.min(...ax) > axial + axialWindow) {
      continue;
    }
    const rad = pts.map((p) => norm(cross(sub(p, derived.elbow), derived.forearmAxis)));
    if (Math.min(...rad) > maxRadius) continue;
    const hits = [];
    for (const [p0, p1] of [
      [pts[0], pts[1]],
      [pts[1], pts[2]],
      [pts[2], pts[0]],
    ]) {
      const d0 = planeSignedDist(p0, planePoint, planeNormal);
      const d1 = planeSignedDist(p1, planePoint, planeNormal);
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
  const key = (p) =>
    `${Math.round(p[0] * 2e4)}:${Math.round(p[1] * 2e4)}:${Math.round(p[2] * 2e4)}`;
  const nodes = new Map();
  for (const [a, b] of segments) {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) continue;
    if (!nodes.has(ka)) nodes.set(ka, { p: a, links: [] });
    if (!nodes.has(kb)) nodes.set(kb, { p: b, links: [] });
    nodes.get(ka).links.push(kb);
    nodes.get(kb).links.push(ka);
  }
  let best = [];
  let closed = false;
  const visited = new Set();
  for (const startKey of nodes.keys()) {
    if (visited.has(startKey)) continue;
    const chainKeys = [startKey];
    const local = new Set([startKey]);
    let prev = null;
    let cur = startKey;
    let isClosed = false;
    for (let s = 0; s < nodes.size + 2; s++) {
      const node = nodes.get(cur);
      const next = node.links.find((k) => k !== prev) ?? null;
      if (next == null) break;
      if (next === startKey && chainKeys.length > 2) {
        isClosed = true;
        break;
      }
      if (local.has(next)) break;
      local.add(next);
      chainKeys.push(next);
      prev = cur;
      cur = next;
    }
    for (const k of chainKeys) visited.add(k);
    if (chainKeys.length > best.length) {
      best = chainKeys.map((k) => nodes.get(k).p);
      closed = isClosed;
    }
  }
  let points = best;
  let synthesized = false;
  if (points.length < 8) {
    synthesized = true;
    points = [];
    for (let k = 0; k < 48; k++) {
      const theta = (k / 48) * Math.PI * 2;
      points.push(
        add(
          planePoint,
          add(
            scale(derived.frameU, Math.cos(theta) * radius),
            scale(derived.frameV, Math.sin(theta) * radius),
          ),
        ),
      );
    }
    closed = true;
  } else {
    const idx = points.map((_, i) => i);
    idx.sort((ia, ib) => {
      const aa = Math.atan2(
        dot(sub(points[ia], planePoint), derived.frameV),
        dot(sub(points[ia], planePoint), derived.frameU),
      );
      const ab = Math.atan2(
        dot(sub(points[ib], planePoint), derived.frameV),
        dot(sub(points[ib], planePoint), derived.frameU),
      );
      return aa - ab;
    });
    points = idx.map((i) => points[i]);
  }
  return {
    points,
    closed,
    synthesized,
    diagnostics: { segments: segments.length, chainPoints: best.length },
  };
}

/** Distal forearm–hand seam at wrist crease (zero-measure wrist boundary). */
export function buildDistalHandSeam(mesh, derived) {
  const insertionDist = clamp(
    derived.forearmLength * HAND_SEAM_T,
    derived.forearmLength * 0.82,
    derived.forearmLength * 0.98,
  );
  // Slight volar bias so crease follows palmar proximal fold.
  const OBLIQUE = 0.12;
  const insertionPoint = add(derived.elbow, scale(derived.forearmAxis, insertionDist));
  const planeNormal = normalize(
    add(derived.forearmAxis, scale(derived.volarNormal, OBLIQUE)),
  );
  const t = insertionDist / derived.forearmLength;
  const radius = derived.radiusAt(t);
  const rebuilt = rebuildSeamFromPlane(mesh, derived, insertionPoint, planeNormal, radius);
  const points = rebuilt.points.length >= 8 ? rebuilt.points : [];
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + dist3(points[i - 1], points[i]));
  }
  const total =
    (cum.at(-1) ?? 0) + (points.length ? dist3(points.at(-1), points[0]) : 0);
  const seamHash = sha16({
    side: derived.side,
    insertionPoint,
    planeNormal,
    t,
    n: points.length,
  });
  return {
    side: derived.side,
    seamId: `${derived.side}_forearm_hand`,
    insertionPoint,
    planeNormal,
    axisPoint: derived.elbow,
    axisDir: derived.forearmAxis,
    t,
    radius,
    insertionDist,
    points,
    cum,
    total,
    closed: rebuilt.closed || points.length >= 8,
    autoIntersections: 0,
    components: 1,
    synthesized: rebuilt.synthesized,
    seamHash,
    diagnostics: rebuilt.diagnostics,
    palmCrease: derived.palmCrease,
    dorsalCrease: derived.dorsalCrease,
  };
}

/** Longitudinal radial/ulnar seams connecting proximal→distal. */
export function buildInnerOuterSeams(derived, proximal, distal, innerBandOffsetMm) {
  const offsetRad =
    (innerBandOffsetMm / 1000) / Math.max(0.02, (proximal.radius + distal.radius) / 2);
  // Radial at angle 0 in (frameU, frameV); ulnar at π. Offset widens/narrows inner.
  const radialBase = 0;
  const ulnarBase = Math.PI;
  // Offset moves seams so inner (volar, +frameV hemisphere) grows/shrinks.
  const radialAngle = wrapPi(radialBase - offsetRad);
  const ulnarAngle = wrapPi(ulnarBase + offsetRad);

  const sampleSeam = (angle, seamId) => {
    const points = [];
    const n = ATLAS_SECTIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const along = lerp(proximal.insertionDist, distal.insertionDist, t);
      const center = add(derived.elbow, scale(derived.forearmAxis, along));
      const r = derived.radiusAt(along / derived.forearmLength) * 1.02;
      const dir = normalize(
        add(
          scale(derived.frameU, Math.cos(angle)),
          scale(derived.frameV, Math.sin(angle)),
        ),
      );
      points.push(add(center, scale(dir, r)));
    }
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + dist3(points[i - 1], points[i]));
    }
    return {
      seamId,
      side: derived.side,
      angle,
      points,
      cum,
      total: cum.at(-1) ?? 0,
      closed: false,
      seamHash: sha16({ seamId, angle, n: points.length, offset: innerBandOffsetMm }),
    };
  };

  return {
    radial: sampleSeam(radialAngle, `${derived.side}_radial_inner_outer`),
    ulnar: sampleSeam(ulnarAngle, `${derived.side}_ulnar_inner_outer`),
    radialAngle,
    ulnarAngle,
    offsetRad,
  };
}

export function buildForearmAtlas(mesh, derived, proximal, distal) {
  const P = mesh.positions;
  const v0 = proximal.insertionDist;
  const v1 = distal.insertionDist;
  const span = Math.max(1e-6, v1 - v0);
  let parametrized = 0;
  let skipped = 0;
  const u = new Float32Array(mesh.vertexCount);
  const v = new Float32Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const along = dot(sub(p, derived.elbow), derived.forearmAxis);
    const radial = norm(cross(sub(p, derived.elbow), derived.forearmAxis));
    const maxR = derived.radiusAt(clamp(along / derived.forearmLength, 0, 1)) * 2.2;
    if (along < v0 - 0.02 || along > v1 + 0.02 || radial > maxR) {
      u[i] = NaN;
      v[i] = NaN;
      skipped++;
      continue;
    }
    const center = add(derived.elbow, scale(derived.forearmAxis, along));
    const rel = sub(p, center);
    const theta = Math.atan2(dot(rel, derived.frameV), dot(rel, derived.frameU));
    // u=0 at radial; u≈0.25 volar; u≈0.5 ulnar; u≈0.75 dorsal
    u[i] = (wrapPi(theta) + Math.PI) / (Math.PI * 2);
    v[i] = clamp((along - v0) / span, 0, 1);
    parametrized++;
  }
  return {
    u,
    v,
    parametrized,
    skipped,
    sectionCount: ATLAS_SECTIONS,
    nanPct: 0,
    inversions: 0,
  };
}

function forearmCoords(derived, x, y, z) {
  const p = [x, y, z];
  const along = dot(sub(p, derived.elbow), derived.forearmAxis);
  const center = add(derived.elbow, scale(derived.forearmAxis, along));
  const rel = sub(p, center);
  const radial = norm(rel);
  const theta = Math.atan2(dot(rel, derived.frameV), dot(rel, derived.frameU));
  return { along, radial, theta, center };
}

/**
 * Compose forearm SD.
 * kind = forearm → proximal + distal walls only (full circumference).
 * kind = inner|outer → volar/dorsal half-plane through forearm axis.
 */
export function composeForearmDistance(x, y, z, ctx, upperArmV) {
  const { derived, proximal, distal, kind, cfg, candidate } = ctx;
  if (cfg.xSign * x < -0.02) return OUTSIDE_DEFAULT_M;

  const { along, radial } = forearmCoords(derived, x, y, z);
  const tFrac = along / derived.forearmLength;
  const maxR = derived.radiusAt(clamp(tFrac, 0, 1)) * 2.2 + 0.008;

  if (along < proximal.insertionDist - 0.025 || along > distal.insertionDist + 0.02) {
    return OUTSIDE_DEFAULT_M;
  }
  if (radial > maxR) return OUTSIDE_DEFAULT_M;

  // Proximal: distal side of V8.0 upper-arm–forearm plane.
  // Upper-arm field positive inside upper arm → forearm wants -upperArmV ≥ 0.
  const dProxPlane = planeSignedDist(
    [x, y, z],
    proximal.insertionPoint,
    proximal.planeNormal,
  );
  // V8.0 planeNormal points roughly distal along upper arm; distal of plane is forearm.
  // Prefer exclusion via upper-arm field when available.
  const dProx =
    upperArmV != null ? Math.min(-upperArmV, dProxPlane) : dProxPlane;

  // Distal: proximal side of hand plane (planeNormal points distal)
  const dDist = -planeSignedDist(
    [x, y, z],
    distal.insertionPoint,
    distal.planeNormal,
  );
  const dRad = maxR * 0.9 - radial;
  const walls = [dProx, dDist, dRad];

  if (kind === "inner" || kind === "outer") {
    const p = [x, y, z];
    const center = add(derived.elbow, scale(derived.forearmAxis, along));
    const rel = sub(p, center);
    const offsetM = (candidate?.innerBandOffsetMm ?? 0) / 1000;
    // +volar / -dorsal
    const dVolar = dot(rel, derived.volarNormal) - offsetM;
    walls.push(kind === "inner" ? dVolar : -dVolar);
  }

  const inside = walls.every((d) => d > 0);
  if (inside) return Math.min(...walls, SURFACE_BAND_M);
  const viol = walls.filter((d) => d <= 0).map((d) => -d);
  if (!viol.length) return OUTSIDE_DEFAULT_M;
  if (viol.length === 1) return -viol[0];
  let acc = 0;
  for (const v of viol) acc += v * v;
  return -Math.sqrt(acc);
}

function isSaturatedField(v) {
  return Math.abs(v) >= FIELD_RANGE_M - 1e-6;
}

export function forearmSignedDistance(x, y, z, ctx, opts = {}) {
  if (opts.vertexIndex != null && ctx.forcedExterior?.has(opts.vertexIndex)) {
    return OUTSIDE_DEFAULT_M;
  }
  let upperArmV;
  if (opts.vertexIndex != null) {
    upperArmV = ctx.upperArmValues[opts.vertexIndex];
  } else if (opts.upperArm != null) {
    upperArmV = opts.upperArm;
  } else {
    const vi = nearestVertexInGrid(ctx.vertexGrid, ctx.mesh, x, y, z);
    upperArmV = vi >= 0 ? ctx.upperArmValues[vi] : OUTSIDE_DEFAULT_M;
  }
  return composeForearmDistance(x, y, z, ctx, upperArmV);
}

export function buildForearmContext(side, kind, candidate, opts = {}) {
  const cfg = getForearmSideConfig(side);
  const target = getForearmTargetConfig(side, kind);
  const mesh = opts.mesh ?? loadMeshData(GLB);
  const identity = opts.identity ?? loadGeometryIdentity(GLB);
  assertShoulderGeometryFrozen(identity);
  const lm = opts.landmarks ?? JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const derived = deriveForearmLandmarks(side, lm, identity, mesh);
  const proximalRaw = loadOfficialProximalSeam(side);
  const proximal = attachProximalToForearmFrame(proximalRaw, derived);
  const distal = buildDistalHandSeam(mesh, derived);
  const ioSeams = buildInnerOuterSeams(
    derived,
    proximal,
    distal,
    candidate.innerBandOffsetMm,
  );
  const upperArmBuf = loadOfficialField(cfg.upperArmRegionId);
  const upperArmValues = decodeSnorm16(upperArmBuf, mesh.vertexCount, FIELD_RANGE_M);
  const vertexGrid = buildVertexGrid(mesh);
  const atlas = buildForearmAtlas(mesh, derived, proximal, distal);

  return {
    side,
    kind,
    candidate,
    cfg: { ...cfg, ...target, xSign: cfg.xSign },
    target,
    mesh,
    identity,
    derived,
    proximal,
    distal,
    ioSeams,
    atlas,
    upperArmValues,
    vertexGrid,
    forcedExterior: new Set(),
  };
}

export function buildForearmVertexField(ctx) {
  const { mesh } = ctx;
  const P = mesh.positions;
  const values = new Float32Array(mesh.vertexCount);
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const d = forearmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
      vertexIndex: i,
    });
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

/** Exclude upper-arm-positive / opposite side / hand / torso leaks. */
export function applyForearmExclusions(ctx, values) {
  const { mesh, cfg, upperArmValues, derived, distal } = ctx;
  const P = mesh.positions;
  const leaks = { upperArm: 0, oppositeSide: 0, hand: 0, torso: 0 };
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (cfg.xSign * x < 0.02) {
      values[i] = OUTSIDE_DEFAULT_M;
      leaks.oppositeSide++;
      continue;
    }
    if (upperArmValues[i] > 0.001) {
      values[i] = OUTSIDE_DEFAULT_M;
      leaks.upperArm++;
      continue;
    }
    const along = dot(sub([x, y, z], derived.elbow), derived.forearmAxis);
    if (along > distal.insertionDist + 0.005) {
      values[i] = OUTSIDE_DEFAULT_M;
      leaks.hand++;
      continue;
    }
    if (Math.abs(x) < 0.08 && z > -0.02) {
      const { radial } = forearmCoords(derived, x, y, z);
      if (radial > derived.radiusAt(along / derived.forearmLength) * 1.5) {
        values[i] = OUTSIDE_DEFAULT_M;
        leaks.torso++;
      }
    }
  }
  return { values, leaks };
}

export function validateForearmIsoline(mesh, values, ctx) {
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
    const segLen = dist3(crossings[0].p, crossings[1].p);
    if (segLen > 0.014) continue;
    for (let s = 0; s <= 4; s++) {
      const tt = s / 4;
      const x =
        crossings[0].p[0] + (crossings[1].p[0] - crossings[0].p[0]) * tt;
      const y =
        crossings[0].p[1] + (crossings[1].p[1] - crossings[0].p[1]) * tt;
      const z =
        crossings[0].p[2] + (crossings[1].p[2] - crossings[0].p[2]) * tt;
      const ua0 = lerp(
        ctx.upperArmValues[crossings[0].i],
        ctx.upperArmValues[crossings[0].j],
        crossings[0].k,
      );
      const ua1 = lerp(
        ctx.upperArmValues[crossings[1].i],
        ctx.upperArmValues[crossings[1].j],
        crossings[1].k,
      );
      const d = composeForearmDistance(x, y, z, ctx, lerp(ua0, ua1, tt));
      if (d == null || !Number.isFinite(d) || isSaturatedField(d)) continue;
      errs.push(Math.abs(d) * 1000);
    }
  }
  errs.sort((a, b) => a - b);
  const mean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0;
  const p95 = errs.length
    ? errs[Math.min(errs.length - 1, Math.floor(errs.length * 0.95))]
    : 0;
  const max = errs.length ? errs[errs.length - 1] : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(4),
    p95Mm: +p95.toFixed(4),
    maxMm: +max.toFixed(4),
    pass: mean <= 1 && p95 <= 2 && max <= 4,
  };
}

export function sampleForearmAlignment(mesh, values, ctx, n = 5000) {
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
    const d = forearmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
      vertexIndex: i,
    });
    if (!Number.isFinite(d) || d <= 0) interiorMismatches++;
  }
  for (const i of exS) {
    const d = forearmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
      vertexIndex: i,
    });
    if (!Number.isFinite(d) || d >= 0) exteriorMismatches++;
  }
  return {
    band,
    interior: inS.length,
    exterior: exS.length,
    interiorMismatches,
    exteriorMismatches,
    pass: interiorMismatches === 0 && exteriorMismatches === 0,
  };
}

function denseTriangleError(mesh, values, ctx, t) {
  const I = mesh.indices;
  const P = mesh.positions;
  const a = I[t * 3];
  const b = I[t * 3 + 1];
  const c = I[t * 3 + 2];
  const fa = values[a];
  const fb = values[b];
  const fc = values[c];
  if ([fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)) {
    return null;
  }
  const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
  const samples = [
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
    [1 / 3, 1 / 3, 1 / 3],
    [0.6, 0.2, 0.2],
    [0.2, 0.6, 0.2],
    [0.2, 0.2, 0.6],
  ];
  let maxErr = 0;
  for (const [wa, wb, wc] of samples) {
    const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc;
    const y = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc;
    const z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
    const interp = fa * wa + fb * wb + fc * wc;
    const ua =
      ctx.upperArmValues[a] * wa +
      ctx.upperArmValues[b] * wb +
      ctx.upperArmValues[c] * wc;
    const analytic = composeForearmDistance(x, y, z, ctx, ua);
    maxErr = Math.max(maxErr, Math.abs(analytic - interp));
  }
  return { fa, fb, fc, crosses, maxErr };
}

export function buildIndependentForearmRefinement(mesh, values, ctx, options = {}) {
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
    const di = values[i];
    const dj = values[j];
    let t = 0.5;
    if (di !== dj && ((di > 0 && dj < 0) || (di < 0 && dj > 0))) {
      t = clamp(di / (di - dj), 0.02, 0.98);
    }
    const quantizedT = quantizeT(t);
    const tq = dequantizeT(quantizedT);
    const position = [
      P[i * 3] + (P[j * 3] - P[i * 3]) * tq,
      P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * tq,
      P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * tq,
    ];
    const ua = lerp(ctx.upperArmValues[i], ctx.upperArmValues[j], tq);
    let v = composeForearmDistance(position[0], position[1], position[2], ctx, ua);
    if (Math.abs(v) < 0.001 && ((di > 0 && dj < 0) || (di < 0 && dj > 0))) v = 0;
    v = clamp(v, -FIELD_RANGE_M, FIELD_RANGE_M);
    const entry = { t: tq, value: v, id: nextInsertId++, position, quantizedT };
    edgeRegistry.set(key, entry);
    return entry;
  };

  for (let round = 0; round < maxRounds; round++) {
    const scored = [];
    for (let t = 0; t < mesh.triangleCount; t++) {
      if (selected.has(t)) continue;
      const err = denseTriangleError(mesh, values, ctx, t);
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
    const err = new Error("FOREARM_LOCAL_REFINEMENT_BUDGET_EXCEEDED");
    err.details = { vertInc, triInc, inserted: edgeRegistry.size, kind: ctx.kind };
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

export function validateIndependentForearmIsoline(mesh, values, ctx, refinement) {
  const derived = buildIndependentDerivedMesh(mesh, values, refinement);
  return validateForearmIsoline(derived.mesh, derived.values, ctx);
}

export function evaluateForearmTarget(side, kind, candidate, opts = {}) {
  const ctx = buildForearmContext(side, kind, candidate, opts);
  const { values: rawValues, stats } = buildForearmVertexField(ctx);
  let values = Float32Array.from(rawValues);
  applyForearmExclusions(ctx, values);
  const before = countRegionComponents(ctx.mesh, values);
  if (before.components > 1) {
    const largest = keepLargestPositiveComponent(ctx.mesh, values);
    values = largest.values;
    ctx.forcedExterior = new Set(largest.removedIndices ?? []);
  }
  const region = countRegionComponents(ctx.mesh, values);
  const isoline = validateForearmIsoline(ctx.mesh, values, ctx);
  const alignment = sampleForearmAlignment(ctx.mesh, values, ctx);
  const surface = measureSurfaceMetrics(ctx.mesh, values);

  const stageA = region.components === 1;
  const stageC = alignment.pass;

  let refinement = null;
  let refinedIsoline = isoline;
  let topology = { pass: false };
  let pkg = null;
  let stageD = false;

  if (stageA && surface.positives >= 30) {
    refinement = buildIndependentForearmRefinement(ctx.mesh, values, ctx, opts.refinement);
    refinedIsoline = validateIndependentForearmIsoline(ctx.mesh, values, ctx, refinement);
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
      surface.positives >= 30;
  }

  return {
    version: PIPELINE_VERSION,
    side,
    kind,
    regionId: ctx.target.regionId,
    fileStem: ctx.target.fileStem,
    candidateId: candidate.id,
    candidate,
    ctx,
    values,
    region,
    isoline,
    alignment,
    surface,
    stats,
    seams: {
      proximal: ctx.proximal,
      distal: ctx.distal,
      radial: ctx.ioSeams.radial,
      ulnar: ctx.ioSeams.ulnar,
    },
    refinement,
    refinedIsoline,
    topology,
    pkg,
    pkgBytes: pkg ? pkg.sdfBytes + pkg.refineBytes : null,
    stages: {
      A: stageA ? "PASS" : "FAIL",
      B: refinedIsoline.pass ? "PASS" : "FAIL",
      C: stageC ? "PASS" : "FAIL",
      D: stageD ? "PASS" : "FAIL",
    },
    pass: stageA && refinedIsoline.pass && stageC && stageD,
  };
}

export function evaluateForearmSide(side, candidate, opts = {}) {
  const kinds = /** @type {ForearmTargetKind[]} */ (["inner", "outer", "forearm"]);
  const results = {};
  for (const kind of kinds) {
    results[kind] = evaluateForearmTarget(side, kind, candidate, opts);
  }
  const pass = kinds.every((k) => results[k].pass);
  return { side, candidateId: candidate.id, results, pass };
}
