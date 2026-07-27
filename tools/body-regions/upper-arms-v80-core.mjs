/**
 * Upper Arms V8.0 — bilateral Geometry Distance Field engine.
 *
 * Each side is partitioned into:
 *   - biceps_surface  (anterior)
 *   - triceps_surface (posterior)
 * Logical upper_arm uses an independent field over the full tube between
 * the frozen shoulder–upper-arm seam (V7.0) and a new upper-arm–forearm seam.
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
  deriveShoulderLandmarks,
  buildUpperArmSeam,
  keepLargestPositiveComponent,
  measureSurfaceMetrics,
  assertShoulderGeometryFrozen,
  DELTOID_INSERTION_T,
  SECTION_COUNT,
  REFINE_BAND_M,
} from "./shoulders-v70-core.mjs";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  SOURCE_GATE,
  UPPER_ARMS_V80_OUT,
  OFFICIAL_SHOULDERS,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  contentHash16,
  getUpperArmSideConfig,
  getUpperArmTargetConfig,
  loadOfficialField,
  sha16,
  sidePoint,
} from "./upper-arms-side.mjs";

/** @typedef {"right"|"left"} BodySide */
/** @typedef {"biceps"|"triceps"|"upper_arm"} ArmTargetKind */

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
const SHOULDER_SEAMS = path.join(ROOT, "artifacts/shoulders-v70/shared-seams");

export const SURFACE_BAND_M = 0.022;
export const PKG_BUDGET_BYTES = 45 * 1024;
/** Distal elbow seam as fraction of acromion→elbow (near cubital fold). */
export const FOREARM_SEAM_T = 0.94;
export const ATLAS_SECTIONS = 120;

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
  UPPER_ARMS_V80_OUT,
  OFFICIAL_SHOULDERS,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  contentHash16,
  getUpperArmSideConfig,
  getUpperArmTargetConfig,
  loadOfficialField,
  sha16,
  sidePoint,
  keepLargestPositiveComponent,
  measureSurfaceMetrics,
  REFINE_BAND_M,
  DELTOID_INSERTION_T,
  SECTION_COUNT,
};

// --- vector helpers -------------------------------------------------------

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
    if (best >= 0 && r >= 1) break;
  }
  return best;
}

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}
function quantizeT(t) {
  return Math.max(0, Math.min(T_QUANT, Math.round(t * T_QUANT)));
}
function dequantizeT(q) {
  return q / T_QUANT;
}

// --- landmarks + axis -----------------------------------------------------

/**
 * Derive arm landmarks without mirroring vertex data — left uses left
 * landmarks / skeleton; diagnostic symmetry only.
 */
export function deriveUpperArmLandmarks(side, lm, identity, anatomy) {
  assertShoulderGeometryFrozen(identity);
  const derived = deriveShoulderLandmarks(side, lm, identity, anatomy);
  const elbowLm = sidePoint(lm, side, "elbow");
  const wrist = lm.points[side === "right" ? "wristRight" : "wristLeft"];

  // Medial = toward torso in the plane ⊥ arm axis (side-aware, no mirror).
  let medialDir = sub(
    derived.towardTorso,
    scale(derived.armAxis, dot(derived.towardTorso, derived.armAxis)),
  );
  if (norm(medialDir) < 1e-4) medialDir = derived.frameU;
  medialDir = normalize(medialDir);
  const lateralDir = scale(medialDir, -1);
  // Anterior = world +Z projected onto plane ⊥ arm axis (stable both sides).
  const worldFwd = [0, 0, 1];
  let anteriorDir = sub(worldFwd, scale(derived.armAxis, dot(worldFwd, derived.armAxis)));
  if (norm(anteriorDir) < 1e-4) anteriorDir = cross(derived.armAxis, medialDir);
  anteriorDir = normalize(anteriorDir);
  const posteriorDir = scale(anteriorDir, -1);
  const epR = derived.radiusElbow * 0.95;

  const epicondyleMedial = add(derived.elbow, scale(medialDir, epR));
  const epicondyleLateral = add(derived.elbow, scale(lateralDir, epR));
  const olecranon = add(derived.elbow, scale(posteriorDir, epR * 0.85));
  const cubitalFossa = add(derived.elbow, scale(anteriorDir, epR * 0.55));

  return {
    ...derived,
    elbowLm,
    wrist: wrist ? [...wrist] : null,
    medialDir,
    lateralDir,
    anteriorDir,
    posteriorDir,
    epicondyleMedial,
    epicondyleLateral,
    olecranon,
    cubitalFossa,
    glenohumeral: derived.shoulder,
    method: "humeral-axis-cross-section",
    confidence: 0.86,
  };
}

/** Proximal shoulder–upper-arm seam: reuse V7.0 plane + rebuild dense loop. */
export function buildProximalShoulderSeam(mesh, derived, offsetM = 0) {
  const seam = buildUpperArmSeam(mesh, derived, offsetM);
  const artifactPath = path.join(
    SHOULDER_SEAMS,
    `${derived.side}-shoulder-upper-arm.json`,
  );
  let sourceHash = null;
  if (existsSync(artifactPath)) {
    const raw = readFileSync(artifactPath, "utf8");
    sourceHash = sha16(raw);
    const meta = JSON.parse(raw);
    // Prefer V7.0 plane parameters when present (exact shared wall).
    if (meta.insertionPoint && meta.planeNormal) {
      seam.insertionPoint = meta.insertionPoint;
      seam.planeNormal = meta.planeNormal;
      seam.t = meta.t ?? seam.t;
      seam.radius = meta.radiusM ?? seam.radius;
      seam.insertionDist = meta.insertionDistM ?? seam.insertionDist;
      seam.fromV70 = true;
    }
  }
  const seamHash = sha16({
    side: seam.side,
    insertionPoint: seam.insertionPoint,
    planeNormal: seam.planeNormal,
    t: seam.t,
    points: seam.points?.length,
  });
  return { ...seam, seamHash, sourceHash, seamId: `${derived.side}_shoulder_upper_arm` };
}

/** Distal upper-arm–forearm seam near cubital fold / olecranon. */
export function buildDistalForearmSeam(mesh, derived) {
  const insertionDist = clamp(
    derived.armLength * FOREARM_SEAM_T,
    derived.armLength * 0.75,
    derived.armLength * 0.99,
  );
  // Oblique: slightly higher posterior (olecranon) / lower anterior (cubital).
  const OBLIQUE = 0.18;
  const insertionPoint = add(derived.acromion, scale(derived.armAxis, insertionDist));
  const planeNormal = normalize(
    add(derived.armAxis, scale(derived.posteriorDir, OBLIQUE)),
  );
  const t = insertionDist / derived.armLength;
  const radius = derived.radiusAt(t);

  // Rebuild via same slice path as proximal by temporarily swapping params.
  const proxy = {
    ...derived,
    armLength: derived.armLength,
  };
  // Manual plane slice using buildUpperArmSeam with offset to reach FOREARM_SEAM_T
  const offsetM =
    insertionDist - derived.armLength * DELTOID_INSERTION_T;
  const seam = buildUpperArmSeam(mesh, proxy, offsetM);
  // Override plane to anatomical elbow bias
  seam.insertionPoint = insertionPoint;
  seam.planeNormal = planeNormal;
  seam.t = t;
  seam.radius = radius;
  seam.insertionDist = insertionDist;
  // Re-slice with elbow plane for accurate loop
  const rebuilt = rebuildSeamFromPlane(mesh, derived, insertionPoint, planeNormal, radius);
  const points = rebuilt.points.length >= 8 ? rebuilt.points : seam.points;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + dist3(points[i - 1], points[i]));
  }
  const total = (cum.at(-1) ?? 0) + (points.length ? dist3(points.at(-1), points[0]) : 0);
  const seamHash = sha16({
    side: derived.side,
    insertionPoint,
    planeNormal,
    t,
    n: points.length,
  });
  return {
    side: derived.side,
    seamId: `${derived.side}_upper_arm_forearm`,
    insertionPoint,
    planeNormal,
    axisPoint: derived.acromion,
    axisDir: derived.armAxis,
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
  };
}

function rebuildSeamFromPlane(mesh, derived, planePoint, planeNormal, radius) {
  const P = mesh.positions;
  const I = mesh.indices;
  const maxRadius = radius * 2.0 + 0.02;
  const axial = dot(sub(planePoint, derived.acromion), derived.armAxis);
  const axialWindow = Math.max(0.04, radius * 1.3);
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
    const ax = pts.map((p) => dot(sub(p, derived.acromion), derived.armAxis));
    if (Math.max(...ax) < axial - axialWindow || Math.min(...ax) > axial + axialWindow) {
      continue;
    }
    const rad = pts.map((p) => norm(cross(sub(p, derived.acromion), derived.armAxis)));
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
  // Greedy chain (inline compact version)
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
    // Order by angle around plane
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

/**
 * Longitudinal medial/lateral biceps–triceps seams connecting proximal→distal.
 */
export function buildBicepsTricepsSeams(derived, proximal, distal, bicepsBandOffsetMm) {
  const offsetRad =
    (bicepsBandOffsetMm / 1000) / Math.max(0.02, (proximal.radius + distal.radius) / 2);
  // Medial at toward-torso angle; lateral opposite. Offset widens/narrows biceps.
  const medialBase = Math.atan2(
    dot(derived.medialDir, derived.frameV),
    dot(derived.medialDir, derived.frameU),
  );
  const lateralBase = wrapPi(medialBase + Math.PI);
  const medialAngle = wrapPi(medialBase - offsetRad);
  const lateralAngle = wrapPi(lateralBase + offsetRad);

  const sampleSeam = (angle, seamId) => {
    const points = [];
    const n = ATLAS_SECTIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const along = lerp(proximal.insertionDist, distal.insertionDist, t);
      const center = add(derived.acromion, scale(derived.armAxis, along));
      const r = derived.radiusAt(along / derived.armLength) * 1.02;
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
      seamHash: sha16({ seamId, angle, n: points.length, offset: bicepsBandOffsetMm }),
    };
  };

  return {
    medial: sampleSeam(medialAngle, `${derived.side}_medial_biceps_triceps`),
    lateral: sampleSeam(lateralAngle, `${derived.side}_lateral_biceps_triceps`),
    medialAngle,
    lateralAngle,
    offsetRad,
  };
}

// --- tubular atlas --------------------------------------------------------

export function buildArmAtlas(mesh, derived, proximal, distal) {
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
    const along = dot(sub(p, derived.acromion), derived.armAxis);
    const radial = norm(cross(sub(p, derived.acromion), derived.armAxis));
    const maxR = derived.radiusAt(clamp(along / derived.armLength, 0, 1)) * 2.2;
    if (along < v0 - 0.02 || along > v1 + 0.02 || radial > maxR) {
      u[i] = NaN;
      v[i] = NaN;
      skipped++;
      continue;
    }
    const center = add(derived.acromion, scale(derived.armAxis, along));
    const rel = sub(p, center);
    const theta = Math.atan2(dot(rel, derived.frameV), dot(rel, derived.frameU));
    u[i] = (wrapPi(theta) + Math.PI) / (Math.PI * 2); // [0,1)
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

// --- signed distance ------------------------------------------------------

function armCoords(derived, x, y, z) {
  const p = [x, y, z];
  const along = dot(sub(p, derived.acromion), derived.armAxis);
  const center = add(derived.acromion, scale(derived.armAxis, along));
  const rel = sub(p, center);
  const radial = norm(rel);
  const theta = Math.atan2(dot(rel, derived.frameV), dot(rel, derived.frameU));
  return { along, radial, theta, center };
}

/**
 * Compose upper-arm SD.
 * kind = upper_arm → proximal + distal walls only (full circumference).
 * kind = biceps|triceps → coronal plane through arm axis (anterior/posterior).
 */
export function composeUpperArmDistance(x, y, z, ctx, shoulderV) {
  const { derived, proximal, distal, kind, cfg, candidate } = ctx;
  if (cfg.xSign * x < -0.02) return OUTSIDE_DEFAULT_M;

  const { along, radial } = armCoords(derived, x, y, z);
  const tFrac = along / derived.armLength;
  const maxR = derived.radiusAt(clamp(tFrac, 0, 1)) * 2.2 + 0.008;

  // Coarse axial gate — only the upper-arm band
  if (along < proximal.insertionDist - 0.02 || along > distal.insertionDist + 0.02) {
    return OUTSIDE_DEFAULT_M;
  }
  if (radial > maxR) return OUTSIDE_DEFAULT_M;

  // Proximal wall: DISTAL side of the shoulder–arm plane (same wall as V7.0).
  // Shoulder field: positive inside shoulder → upper arm wants -shoulderV ≥ 0.
  const dProxPlane = planeSignedDist(
    [x, y, z],
    proximal.insertionPoint,
    proximal.planeNormal,
  );
  const dProx =
    shoulderV != null ? Math.min(-shoulderV, dProxPlane) : dProxPlane;
  // Distal: proximal side of elbow plane (planeNormal points distal)
  const dDist = -planeSignedDist(
    [x, y, z],
    distal.insertionPoint,
    distal.planeNormal,
  );
  // Soft radial containment (positive inside tube)
  const dRad = maxR * 0.9 - radial;

  const walls = [dProx, dDist, dRad];

  if (kind === "biceps" || kind === "triceps") {
    const p = [x, y, z];
    const center = add(derived.acromion, scale(derived.armAxis, along));
    const rel = sub(p, center);
    const offsetM = (candidate?.bicepsBandOffsetMm ?? 0) / 1000;
    // Signed distance to coronal mid-plane: +anterior / -posterior
    const dCoronal = dot(rel, derived.anteriorDir) - offsetM;
    walls.push(kind === "biceps" ? dCoronal : -dCoronal);
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

export function upperArmSignedDistance(x, y, z, ctx, opts = {}) {
  if (opts.vertexIndex != null && ctx.forcedExterior?.has(opts.vertexIndex)) {
    return OUTSIDE_DEFAULT_M;
  }
  let shoulderV;
  if (opts.vertexIndex != null) {
    shoulderV = ctx.shoulderValues[opts.vertexIndex];
  } else if (opts.shoulder != null) {
    shoulderV = opts.shoulder;
  } else {
    const vi = nearestVertexInGrid(ctx.vertexGrid, ctx.mesh, x, y, z);
    shoulderV = vi >= 0 ? ctx.shoulderValues[vi] : OUTSIDE_DEFAULT_M;
  }
  return composeUpperArmDistance(x, y, z, ctx, shoulderV);
}

export function buildUpperArmContext(side, kind, candidate, opts = {}) {
  const cfg = getUpperArmSideConfig(side);
  const target = getUpperArmTargetConfig(side, kind);
  const mesh = opts.mesh ?? loadMeshData(GLB);
  const identity = opts.identity ?? loadGeometryIdentity(GLB);
  assertShoulderGeometryFrozen(identity);
  const lm = opts.landmarks ?? JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const anatomy = opts.anatomy ?? JSON.parse(readFileSync(ANATOMY_SOURCE, "utf8"));
  const derived = deriveUpperArmLandmarks(side, lm, identity, anatomy);
  const proximal = buildProximalShoulderSeam(mesh, derived, 0);
  const distal = buildDistalForearmSeam(mesh, derived);
  const btSeams = buildBicepsTricepsSeams(
    derived,
    proximal,
    distal,
    candidate.bicepsBandOffsetMm,
  );
  const shoulderBuf = loadOfficialField(cfg.shoulderRegionId);
  const shoulderValues = decodeSnorm16(shoulderBuf, mesh.vertexCount, FIELD_RANGE_M);
  const vertexGrid = buildVertexGrid(mesh);
  const atlas = buildArmAtlas(mesh, derived, proximal, distal);

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
    btSeams,
    atlas,
    shoulderValues,
    vertexGrid,
    forcedExterior: new Set(),
  };
}

export function buildUpperArmVertexField(ctx) {
  const { mesh } = ctx;
  const P = mesh.positions;
  const values = new Float32Array(mesh.vertexCount);
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const d = upperArmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
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

/** Exclude shoulder-positive / opposite side / torso leaks. */
export function applyUpperArmExclusions(ctx, values) {
  const { mesh, cfg, shoulderValues } = ctx;
  const P = mesh.positions;
  const leaks = { shoulder: 0, oppositeSide: 0, torso: 0 };
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const x = P[i * 3];
    if (cfg.xSign * x < 0.02) {
      values[i] = OUTSIDE_DEFAULT_M;
      leaks.oppositeSide++;
      continue;
    }
    if (shoulderValues[i] > 0.001) {
      values[i] = OUTSIDE_DEFAULT_M;
      leaks.shoulder++;
      continue;
    }
    if (Math.abs(x) < 0.08 && P[i * 3 + 2] > -0.02) {
      // near midline torso
      const { radial, along } = armCoords(ctx.derived, x, P[i * 3 + 1], P[i * 3 + 2]);
      if (radial > ctx.derived.radiusAt(along / ctx.derived.armLength) * 1.5) {
        values[i] = OUTSIDE_DEFAULT_M;
        leaks.torso++;
      }
    }
  }
  return { values, leaks };
}

// --- isoline validation ---------------------------------------------------

export function validateUpperArmIsoline(mesh, values, ctx) {
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
      const sh0 = lerp(
        ctx.shoulderValues[crossings[0].i],
        ctx.shoulderValues[crossings[0].j],
        crossings[0].k,
      );
      const sh1 = lerp(
        ctx.shoulderValues[crossings[1].i],
        ctx.shoulderValues[crossings[1].j],
        crossings[1].k,
      );
      const d = composeUpperArmDistance(x, y, z, ctx, lerp(sh0, sh1, tt));
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

export function sampleUpperArmAlignment(mesh, values, ctx, n = 5000) {
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
    const d = upperArmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
      vertexIndex: i,
    });
    if (!Number.isFinite(d) || d <= 0) interiorMismatches++;
  }
  for (const i of exS) {
    const d = upperArmSignedDistance(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], ctx, {
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

// --- adaptive refinement --------------------------------------------------

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
    const sh =
      ctx.shoulderValues[a] * wa +
      ctx.shoulderValues[b] * wb +
      ctx.shoulderValues[c] * wc;
    const analytic = composeUpperArmDistance(x, y, z, ctx, sh);
    maxErr = Math.max(maxErr, Math.abs(analytic - interp));
  }
  return { fa, fb, fc, crosses, maxErr };
}

export function buildIndependentUpperArmRefinement(mesh, values, ctx, options = {}) {
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
    const sh = lerp(ctx.shoulderValues[i], ctx.shoulderValues[j], tq);
    let v = composeUpperArmDistance(position[0], position[1], position[2], ctx, sh);
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
    const err = new Error("UPPER_ARM_LOCAL_REFINEMENT_BUDGET_EXCEEDED");
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

export function validateIndependentUpperArmIsoline(mesh, values, ctx, refinement) {
  const derived = buildIndependentDerivedMesh(mesh, values, refinement);
  return validateUpperArmIsoline(derived.mesh, derived.values, ctx);
}

// --- evaluate one target --------------------------------------------------

export function evaluateUpperArmTarget(side, kind, candidate, opts = {}) {
  const ctx = buildUpperArmContext(side, kind, candidate, opts);
  const { values: rawValues, stats } = buildUpperArmVertexField(ctx);
  let values = Float32Array.from(rawValues);
  applyUpperArmExclusions(ctx, values);
  const before = countRegionComponents(ctx.mesh, values);
  if (before.components > 1) {
    const largest = keepLargestPositiveComponent(ctx.mesh, values);
    values = largest.values;
    ctx.forcedExterior = new Set(largest.removedIndices ?? []);
  }
  const region = countRegionComponents(ctx.mesh, values);
  const isoline = validateUpperArmIsoline(ctx.mesh, values, ctx);
  const alignment = sampleUpperArmAlignment(ctx.mesh, values, ctx);
  const surface = measureSurfaceMetrics(ctx.mesh, values);

  const stageA = region.components === 1;
  const stageC = alignment.pass;

  let refinement = null;
  let refinedIsoline = isoline;
  let topology = { pass: false };
  let pkg = null;
  let stageD = false;

  if (stageA && surface.positives >= 40) {
    refinement = buildIndependentUpperArmRefinement(ctx.mesh, values, ctx, opts.refinement);
    refinedIsoline = validateIndependentUpperArmIsoline(ctx.mesh, values, ctx, refinement);
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
      surface.positives >= 40;
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
      medial: ctx.btSeams.medial,
      lateral: ctx.btSeams.lateral,
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

/** Evaluate all 3 kinds for one side. */
export function evaluateUpperArmSide(side, candidate, opts = {}) {
  const kinds = /** @type {ArmTargetKind[]} */ (["biceps", "triceps", "upper_arm"]);
  const results = {};
  for (const kind of kinds) {
    results[kind] = evaluateUpperArmTarget(side, kind, candidate, opts);
  }
  const pass = kinds.every((k) => results[k].pass);
  return { side, candidateId: candidate.id, results, pass };
}
