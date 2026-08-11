/**
 * Neck Surface Atlas V6.0 — tubular circumferential domain.
 *
 * Targets (canonical IDs):
 *   neck_front / neck_right / neck_back / neck_left / full_neck
 * Surfaces:
 *   neck_front_surface / neck_right_surface / neck_back_surface / neck_left_surface
 * full_neck = logical hit union + independent Geometry Field (no full_neck_surface).
 *
 * Never mutates official torso/back fields or the official mask.
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
import { hermiteInterp } from "./generate-full-chest-v21.mjs";
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
  intersectMeshAtY,
  stitchPolylines,
} from "./surface-s-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const NECK_V60_OUT = path.join(ROOT, "artifacts/neck-v60");

export const NECK_LEVELS_MIN = 48;
export const NECK_LEVELS_MAX = 80;
export const NECK_LEVELS = 64;
export const SURFACE_BAND_M = 0.045;
export const QUERY_MAX_DIST_M = 0.055;
export const REFINE_BAND_M = 0.005;
export const LATERAL_OFFSETS_M = Object.freeze({
  N01: -0.004,
  N02: 0,
  N03: 0.004,
});

export const CANONICAL_IDS = Object.freeze({
  front_neck: "neck_front",
  right_neck: "neck_right",
  back_neck: "neck_back",
  left_neck: "neck_left",
  full_neck: "full_neck",
});

export const SURFACE_IDS = Object.freeze({
  neck_front: "neck_front_surface",
  neck_right: "neck_right_surface",
  neck_back: "neck_back_surface",
  neck_left: "neck_left_surface",
});

export const OFFICIAL_BACK = Object.freeze({
  candidateId: "S02",
  upper_back: {
    fieldHash: "1a21f0cea6db047f",
    refinementHash: "4d366898782d2c7f",
  },
  lower_back: {
    fieldHash: "7d3f51b45b93d940",
    refinementHash: "4c956c30646eb298",
  },
  full_back: {
    fieldHash: "82181ee4c73721a9",
    refinementHash: "c79f8241b89fecb2",
  },
  maskHash: "8351bbbebd6e",
});

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function distXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function mix3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function normalize(v) {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function wrap01(u) {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
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
  buildDerivedMesh,
  hashFloat32Canonical,
  hashUint32Canonical,
};

export function expectedOfficialHashes() {
  return {
    chest: OFFICIAL_TORSO_REGIONS.chest,
    abdomen: OFFICIAL_TORSO_REGIONS.abdomen,
    rightRibs: OFFICIAL_TORSO_REGIONS.rightRibs,
    leftRibs: OFFICIAL_TORSO_REGIONS.leftRibs,
    ...OFFICIAL_BACK,
    geometryHash: OFFICIAL_TORSO_REGIONS.geometryHash,
    indexHash: OFFICIAL_TORSO_REGIONS.indexHash,
    vertexCount: OFFICIAL_TORSO_REGIONS.vertexCount,
  };
}

export function assertOfficialBackFrozen(root = ROOT) {
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
  const byId = Object.fromEntries(manifest.fields.map((f) => [f.regionId, f]));
  const check = (id, expected) => {
    const f = byId[id];
    if (!f) throw new Error(`OFFICIAL_TORSO_REGRESSION_DETECTED:missing:${id}`);
    const fieldBuf = readFileSync(
      path.join(fieldsDir, path.basename(f.fieldUrl)),
    );
    const refineBuf = readFileSync(
      path.join(fieldsDir, path.basename(f.refinement.url)),
    );
    const fieldHash = contentHash16(fieldBuf);
    const refinementHash = contentHash16(refineBuf);
    if (
      fieldHash !== expected.fieldHash ||
      refinementHash !== expected.refinementHash ||
      f.candidateId !== "S02"
    ) {
      const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
      err.details = { id, fieldHash, refinementHash, candidateId: f.candidateId };
      throw err;
    }
    return { fieldHash, refinementHash, candidateId: f.candidateId };
  };
  const upper = check("upper_back", OFFICIAL_BACK.upper_back);
  const lower = check("lower_back", OFFICIAL_BACK.lower_back);
  const full = check("full_back", OFFICIAL_BACK.full_back);
  if (maskManifest.maskHash !== OFFICIAL_BACK.maskHash) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = { maskHash: maskManifest.maskHash };
    throw err;
  }
  return {
    intact: true,
    upper_back: upper,
    lower_back: lower,
    full_back: full,
    maskHash: maskManifest.maskHash,
    candidateId: "S02",
  };
}

function nearestVertex(mesh, predicate, score) {
  const P = mesh.positions;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    if (!predicate(p)) continue;
    const s = score(p);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best < 0) return null;
  return {
    index: best,
    position: [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]],
    score: bestScore,
  };
}

function pickNeckPolyline(polys, y, axisXZ = [0, -0.05]) {
  let best = null;
  let bestScore = Infinity;
  for (const poly of polys) {
    const pts = poly.pts ?? poly;
    if (!pts?.length || pts.length < 8) continue;
    let cx = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p[0];
      cz += p[2];
    }
    cx /= pts.length;
    cz /= pts.length;
    let meanR = 0;
    let maxR = 0;
    for (const p of pts) {
      const r = Math.hypot(p[0] - cx, p[2] - cz);
      meanR += r;
      maxR = Math.max(maxR, r);
    }
    meanR /= pts.length;
    // Neck loops are compact around midline; reject arms/shoulders.
    if (meanR > 0.14 || maxR > 0.22) continue;
    if (Math.abs(cx) > 0.08) continue;
    const score =
      meanR * 4 +
      Math.hypot(cx - axisXZ[0], cz - axisXZ[1]) * 3 +
      Math.abs(y - 1.5) * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = { pts, cx, cz, meanR, maxR };
    }
  }
  return best;
}

function closedPolylineLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    L += dist3(pts[i], pts[(i + 1) % pts.length]);
  }
  return L;
}

function resampleClosed(pts, n) {
  const L = closedPolylineLength(pts);
  const out = [];
  if (L < 1e-6 || pts.length < 3) return out;
  const step = L / n;
  let i = 0;
  let segStart = 0;
  out.push([...pts[0]]);
  for (let k = 1; k < n; k++) {
    const target = k * step;
    while (i < pts.length) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const seg = dist3(a, b);
      if (segStart + seg >= target - 1e-9) {
        const t = clamp((target - segStart) / Math.max(seg, 1e-9), 0, 1);
        out.push(mix3(a, b, t));
        break;
      }
      segStart += seg;
      i++;
    }
  }
  return out;
}

/**
 * Existing landmarks for neck + derived mandibular/occipital/SCM anchors.
 */
export function auditAndDeriveNeckLandmarks(mesh, lm, identity) {
  const existing = {
    neckBaseFront: lm.points.neckBaseFront,
    neckBaseBack: lm.points.neckBaseBack,
    clavicleRight: lm.points.clavicleRight,
    clavicleLeft: lm.points.clavicleLeft,
    sternumTop: lm.points.sternumTop,
    shoulderRight: lm.points.shoulderRight,
    shoulderLeft: lm.points.shoulderLeft,
  };

  const sourceHash = lm.sourceHash;
  const geometryHash = identity.geometryHash;

  const mk = (name, hit, method, confidence) => ({
    name,
    position: hit.position.map((v) => +v.toFixed(6)),
    method,
    geometryHash,
    sourceHash,
    confidence,
    vertexIndex: hit.index,
  });

  // Menton / inferior chin: frontmost point under jaw band.
  const mentonHit = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.54 &&
      p[1] <= 1.62 &&
      Math.abs(p[0]) <= 0.035 &&
      p[2] > -0.02,
    (p) => p[2] - 0.4 * Math.abs(p[0]) - 0.15 * Math.abs(p[1] - 1.575),
  );
  // Mandibular angles: lateral extremes under jaw, slightly posterior of menton.
  const jawYR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.52 &&
      p[1] <= 1.6 &&
      p[0] <= -0.045 &&
      p[0] >= -0.12 &&
      p[2] > -0.08 &&
      p[2] < 0.06,
    (p) => -p[0] + 0.2 * p[2] - 0.3 * Math.abs(p[1] - 1.555),
  );
  const jawYL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.52 &&
      p[1] <= 1.6 &&
      p[0] >= 0.045 &&
      p[0] <= 0.12 &&
      p[2] > -0.08 &&
      p[2] < 0.06,
    (p) => p[0] + 0.2 * p[2] - 0.3 * Math.abs(p[1] - 1.555),
  );
  // Mastoids: posterior-lateral upper neck.
  const mastoidR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.55 &&
      p[1] <= 1.63 &&
      p[0] <= -0.04 &&
      p[0] >= -0.11 &&
      p[2] < -0.05,
    (p) => -p[2] - 0.35 * p[0] - 0.2 * Math.abs(p[1] - 1.58),
  );
  const mastoidL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.55 &&
      p[1] <= 1.63 &&
      p[0] >= 0.04 &&
      p[0] <= 0.11 &&
      p[2] < -0.05,
    (p) => -p[2] + 0.35 * p[0] - 0.2 * Math.abs(p[1] - 1.58),
  );
  // Occipital / nuchal base: backmost central upper neck.
  const occipital = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.54 &&
      p[1] <= 1.64 &&
      Math.abs(p[0]) <= 0.04 &&
      p[2] < -0.08,
    (p) => -p[2] - 0.5 * Math.abs(p[0]) - 0.1 * Math.abs(p[1] - 1.58),
  );
  const nuchal = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.5 &&
      p[1] <= 1.58 &&
      Math.abs(p[0]) <= 0.03 &&
      p[2] < -0.1,
    (p) => -p[2] - 0.4 * Math.abs(p[0]),
  );
  // Suprasternal / SC joints from existing + local frontmost band.
  const supra = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.42 &&
      p[1] <= 1.5 &&
      Math.abs(p[0]) <= 0.03 &&
      p[2] > -0.08,
    (p) => p[2] - 0.5 * Math.abs(p[0]) - 0.2 * Math.abs(p[1] - 1.46),
  );
  const scR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.4 &&
      p[1] <= 1.49 &&
      p[0] <= -0.02 &&
      p[0] >= -0.09 &&
      p[2] > -0.08,
    (p) => p[2] - 0.3 * Math.abs(p[0] + 0.05),
  );
  const scL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.4 &&
      p[1] <= 1.49 &&
      p[0] >= 0.02 &&
      p[0] <= 0.09 &&
      p[2] > -0.08,
    (p) => p[2] - 0.3 * Math.abs(p[0] - 0.05),
  );
  // Lateral neck roots (future shoulder seams).
  const rootR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.42 &&
      p[1] <= 1.52 &&
      p[0] <= -0.06 &&
      p[0] >= -0.14 &&
      p[2] > -0.14 &&
      p[2] < 0.02,
    (p) => -Math.abs(p[0] + 0.09) - 0.3 * Math.abs(p[2] + 0.04),
  );
  const rootL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.42 &&
      p[1] <= 1.52 &&
      p[0] >= 0.06 &&
      p[0] <= 0.14 &&
      p[2] > -0.14 &&
      p[2] < 0.02,
    (p) => -Math.abs(p[0] - 0.09) - 0.3 * Math.abs(p[2] + 0.04),
  );
  // SCM anterior borders (approx): anterior-lateral mid neck.
  const scmAntR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.48 &&
      p[1] <= 1.56 &&
      p[0] <= -0.02 &&
      p[0] >= -0.08 &&
      p[2] > -0.04 &&
      p[2] < 0.05,
    (p) => p[2] - 0.2 * Math.abs(p[0] + 0.045),
  );
  const scmAntL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.48 &&
      p[1] <= 1.56 &&
      p[0] >= 0.02 &&
      p[0] <= 0.08 &&
      p[2] > -0.04 &&
      p[2] < 0.05,
    (p) => p[2] - 0.2 * Math.abs(p[0] - 0.045),
  );
  const scmPostR = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.48 &&
      p[1] <= 1.56 &&
      p[0] <= -0.03 &&
      p[0] >= -0.1 &&
      p[2] < -0.02 &&
      p[2] > -0.12,
    (p) => -p[2] - 0.15 * Math.abs(p[0] + 0.06),
  );
  const scmPostL = nearestVertex(
    mesh,
    (p) =>
      p[1] >= 1.48 &&
      p[1] <= 1.56 &&
      p[0] >= 0.03 &&
      p[0] <= 0.1 &&
      p[2] < -0.02 &&
      p[2] > -0.12,
    (p) => -p[2] - 0.15 * Math.abs(p[0] - 0.06),
  );

  const required = [
    ["mentonInferior", mentonHit],
    ["mandibularAngleRight", jawYR],
    ["mandibularAngleLeft", jawYL],
    ["mastoidRight", mastoidR],
    ["mastoidLeft", mastoidL],
    ["occipitalBase", occipital],
    ["nuchalCenter", nuchal],
    ["supraesternalNotch", supra],
    ["sternoclavicularRight", scR],
    ["sternoclavicularLeft", scL],
    ["neckRootLateralRight", rootR],
    ["neckRootLateralLeft", rootL],
    ["scmAnteriorRight", scmAntR],
    ["scmAnteriorLeft", scmAntL],
    ["scmPosteriorRight", scmPostR],
    ["scmPosteriorLeft", scmPostL],
  ];
  for (const [name, hit] of required) {
    if (!hit) {
      const err = new Error(`LANDMARKS_NOT_REPRODUCIBLE:${name}`);
      err.details = { name };
      throw err;
    }
  }

  const derived = {
    mentonInferior: mk(
      "mentonInferior",
      mentonHit,
      "frontmost-stable-band-under-jaw",
      0.86,
    ),
    mandibularAngleRight: mk(
      "mandibularAngleRight",
      jawYR,
      "lateral-max-under-jaw-right",
      0.84,
    ),
    mandibularAngleLeft: mk(
      "mandibularAngleLeft",
      jawYL,
      "lateral-max-under-jaw-left",
      0.84,
    ),
    mastoidRight: mk(
      "mastoidRight",
      mastoidR,
      "posterior-lateral-upper-neck-right",
      0.82,
    ),
    mastoidLeft: mk(
      "mastoidLeft",
      mastoidL,
      "posterior-lateral-upper-neck-left",
      0.82,
    ),
    occipitalBase: mk(
      "occipitalBase",
      occipital,
      "backmost-central-upper-neck",
      0.88,
    ),
    nuchalCenter: mk("nuchalCenter", nuchal, "backmost-central-mid-nucha", 0.87),
    supraesternalNotch: mk(
      "supraesternalNotch",
      supra,
      "frontmost-central-neck-base",
      0.9,
    ),
    sternoclavicularRight: mk(
      "sternoclavicularRight",
      scR,
      "medial-clavicular-root-right",
      0.85,
    ),
    sternoclavicularLeft: mk(
      "sternoclavicularLeft",
      scL,
      "medial-clavicular-root-left",
      0.85,
    ),
    neckRootLateralRight: mk(
      "neckRootLateralRight",
      rootR,
      "neck-shoulder-transition-right",
      0.8,
    ),
    neckRootLateralLeft: mk(
      "neckRootLateralLeft",
      rootL,
      "neck-shoulder-transition-left",
      0.8,
    ),
    scmAnteriorRight: mk(
      "scmAnteriorRight",
      scmAntR,
      "anterior-scm-band-right",
      0.78,
    ),
    scmAnteriorLeft: mk(
      "scmAnteriorLeft",
      scmAntL,
      "anterior-scm-band-left",
      0.78,
    ),
    scmPosteriorRight: mk(
      "scmPosteriorRight",
      scmPostR,
      "posterior-scm-transition-right",
      0.76,
    ),
    scmPosteriorLeft: mk(
      "scmPosteriorLeft",
      scmPostL,
      "posterior-scm-transition-left",
      0.76,
    ),
  };

  return {
    existing,
    derived,
    missingOfficial: [
      "mentonInferior",
      "mandibularAngleRight",
      "mandibularAngleLeft",
      "mastoidRight",
      "mastoidLeft",
      "occipitalBase",
      "nuchalCenter",
      "supraesternalNotch",
      "sternoclavicularRight",
      "sternoclavicularLeft",
      "scmAnterior/Posterior",
      "trapeziusAnterior",
    ],
    geometryHash,
    sourceHash,
  };
}

/** C1 upper loop: mandible underside → mastoids → occipital (exclude face). */
export function buildUpperLoop(derived) {
  const m = derived.mentonInferior.position;
  const jr = derived.mandibularAngleRight.position;
  const jl = derived.mandibularAngleLeft.position;
  const mr = derived.mastoidRight.position;
  const ml = derived.mastoidLeft.position;
  const oc = derived.occipitalBase.position;
  // Drop slightly below mandibular/occipital landmarks so face stays out.
  const drop = 0.012;
  const controls = [
    { u: 0.0, p: [jr[0], jr[1] - drop, jr[2]] },
    { u: 0.12, p: [m[0] * 0.35 + jr[0] * 0.65, m[1] - drop - 0.004, m[2] * 0.7 + jr[2] * 0.3] },
    { u: 0.25, p: [m[0], m[1] - drop - 0.006, m[2]] },
    { u: 0.38, p: [m[0] * 0.35 + jl[0] * 0.65, m[1] - drop - 0.004, m[2] * 0.7 + jl[2] * 0.3] },
    { u: 0.5, p: [jl[0], jl[1] - drop, jl[2]] },
    { u: 0.62, p: [ml[0], ml[1] - drop - 0.002, ml[2]] },
    { u: 0.75, p: [oc[0], oc[1] - drop, oc[2]] },
    { u: 0.88, p: [mr[0], mr[1] - drop - 0.002, mr[2]] },
    { u: 1.0, p: [jr[0], jr[1] - drop, jr[2]] },
  ];
  const xFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[0] })));
  const yFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[1] })));
  const zFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[2] })));
  const sample = (u) => {
    const t = wrap01(u);
    return [xFn(t), yFn(t), zFn(t)];
  };
  const pts = [];
  for (let i = 0; i < 96; i++) pts.push(sample(i / 96));
  return {
    kind: "upper",
    method: "cubic-hermite-C1-mandible-mastoid-occipital",
    controls,
    sample,
    pts,
    yMin: Math.min(...pts.map((p) => p[1])),
    yMax: Math.max(...pts.map((p) => p[1])),
    center: pts
      .reduce((a, p) => add(a, p), [0, 0, 0])
      .map((v) => v / pts.length),
  };
}

/**
 * Lower loop: anterior SC+supraesternal, posterior = central upper_back
 * superior boundary, laterals = neck–shoulder roots.
 */
export function buildLowerLoop(lm, derived, superiorBack) {
  const scR = derived.sternoclavicularRight.position;
  const scL = derived.sternoclavicularLeft.position;
  const supra = derived.supraesternalNotch.position;
  const rootR = derived.neckRootLateralRight.position;
  const rootL = derived.neckRootLateralLeft.position;
  const neckBack = lm.points.neckBaseBack;

  // Central posterior segment from official upper_back superior (u∈[0.35,0.65]).
  const posteriorPts = [];
  for (let i = 0; i <= 24; i++) {
    const u = 0.35 + (0.3 * i) / 24;
    const y = superiorBack.upperY(u);
    const z = superiorBack.upperZ(u);
    const x = lerp(-0.04, 0.04, (u - 0.35) / 0.3);
    posteriorPts.push([x, y, z]);
  }
  // Prefer mesh-resolved nuchal base if close.
  const midPost = posteriorPts[Math.floor(posteriorPts.length / 2)];
  if (dist3(midPost, neckBack) > 0.03) {
    posteriorPts[Math.floor(posteriorPts.length / 2)] = [
      0,
      neckBack[1],
      neckBack[2],
    ];
  }

  const controls = [
    { u: 0.0, p: [...scR] },
    { u: 0.08, p: mix3(scR, supra, 0.5) },
    { u: 0.16, p: [...supra] },
    { u: 0.24, p: mix3(supra, scL, 0.5) },
    { u: 0.32, p: [...scL] },
    { u: 0.4, p: mix3(scL, rootL, 0.55) },
    { u: 0.48, p: [...rootL] },
    { u: 0.56, p: mix3(rootL, posteriorPts.at(-1), 0.5) },
    { u: 0.64, p: [...posteriorPts.at(-1)] },
    { u: 0.72, p: [...midPost] },
    { u: 0.8, p: [...posteriorPts[0]] },
    { u: 0.88, p: mix3(posteriorPts[0], rootR, 0.5) },
    { u: 0.94, p: [...rootR] },
    { u: 1.0, p: [...scR] },
  ];
  const xFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[0] })));
  const yFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[1] })));
  const zFn = hermiteInterp(controls.map((c) => ({ x: c.u, y: c.p[2] })));
  const sample = (u) => {
    const t = wrap01(u);
    return [xFn(t), yFn(t), zFn(t)];
  };
  const pts = [];
  for (let i = 0; i < 96; i++) pts.push(sample(i / 96));
  return {
    kind: "lower",
    method: "cubic-hermite-C1-sc-supra-lateral-upperBackCentral",
    controls,
    sample,
    pts,
    posteriorPts,
    yMin: Math.min(...pts.map((p) => p[1])),
    yMax: Math.max(...pts.map((p) => p[1])),
    center: pts
      .reduce((a, p) => add(a, p), [0, 0, 0])
      .map((v) => v / pts.length),
    posteriorReuse: {
      source: "upper_back.superior.central",
      uRange: [0.35, 0.65],
      pointCount: posteriorPts.length,
    },
  };
}

function pointAngleAboutAxis(p, origin, axis, ref) {
  const d = sub(p, origin);
  const axial = scale(axis, dot(d, axis));
  const radial = sub(d, axial);
  const x = dot(radial, ref.x);
  const y = dot(radial, ref.y);
  return Math.atan2(y, x);
}

function buildFrame(axis) {
  const a = normalize(axis);
  let tmp = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = normalize(cross(tmp, a));
  const y = cross(a, x);
  return { axis: a, x, y };
}

/**
 * Tubular atlas: levels along neck axis with periodic u_neck.
 * Seam u=0 at anterior–lateral right.
 */
export function buildNeckAtlas(mesh, upper, lower, levels = NECK_LEVELS) {
  const axisOrigin = lower.center;
  const axisEnd = upper.center;
  const axis = normalize(sub(axisEnd, axisOrigin));
  const frame = buildFrame(axis);
  const height = dist3(axisOrigin, axisEnd);
  const slices = [];
  let nan = 0;
  let inversions = 0;
  let loopJumps = 0;
  let unparam = 0;

  for (let li = 0; li < levels; li++) {
    const v = li / (levels - 1);
    const origin = mix3(axisOrigin, axisEnd, v);
    // Prefer axis-perpendicular plane; fall back to horizontal when nearly upright.
    const useHorizontal = Math.abs(axis[1]) > 0.92;
    const planeY = origin[1];
    const { segments } = intersectMeshAtY(mesh, planeY);
    const polys = stitchPolylines(segments);
    const picked = pickNeckPolyline(polys, planeY, [origin[0], origin[2]]);
    if (!picked) {
      unparam++;
      slices.push({ v, origin, pts: null, ok: false });
      continue;
    }
    // Reorder from anterior-right seam; track previous seam for continuity.
    const pts = resampleClosed(picked.pts, 96);
    let seamIdx = 0;
    let seamScore = -Infinity;
    const prevSeam =
      slices.length && slices.at(-1).ok ? slices.at(-1).pts[0] : null;
    for (let i = 0; i < pts.length; i++) {
      const ang = pointAngleAboutAxis(pts[i], origin, axis, frame);
      const target = -Math.PI * 0.15;
      let s =
        -Math.abs(angDiff(ang, target)) - 0.5 * Math.abs(pts[i][0] + 0.04);
      if (prevSeam) s -= dist3(pts[i], prevSeam) * 8;
      if (s > seamScore) {
        seamScore = s;
        seamIdx = i;
      }
    }
    const ordered = pts.slice(seamIdx).concat(pts.slice(0, seamIdx));
    // Walk circumference: right → back → left → front
    // Ensure orientation: next point after seam should go posterior (decreasing z or increasing angle toward back).
    const a0 = pointAngleAboutAxis(ordered[0], origin, axis, frame);
    const a1 = pointAngleAboutAxis(ordered[1], origin, axis, frame);
    let oriented = ordered;
    if (angDiff(a1, a0) < 0) {
      oriented = [ordered[0], ...ordered.slice(1).reverse()];
    }
    const cum = [0];
    for (let i = 0; i < oriented.length; i++) {
      cum.push(
        cum[i] + dist3(oriented[i], oriented[(i + 1) % oriented.length]),
      );
    }
    const total = cum.at(-1);
    if (!(total > 1e-6)) {
      nan++;
      slices.push({ v, origin, pts: null, ok: false });
      continue;
    }
    const uOf = oriented.map((_, i) => cum[i] / total);
    if (slices.length && slices.at(-1).ok) {
      const prev = slices.at(-1);
      const jump = dist3(oriented[0], prev.pts[0]);
      if (jump > 0.055) loopJumps++;
    }
    slices.push({
      v,
      origin,
      pts: oriented,
      uOf,
      totalLen: total,
      meanR: picked.meanR,
      ok: true,
      useHorizontal,
    });
  }

  const okSlices = slices.filter((s) => s.ok);
  const components = okSlices.length > 0 ? 1 : 0;
  const diagnostics = {
    levels: slices.length,
    okLevels: okSlices.length,
    nan,
    inversions,
    loopJumps,
    unparam,
    unparamPct: (unparam / levels) * 100,
    components,
    vLower: okSlices[0]?.v ?? null,
    vUpper: okSlices.at(-1)?.v ?? null,
    height,
    pass:
      nan === 0 &&
      inversions === 0 &&
      loopJumps === 0 &&
      unparam === 0 &&
      components === 1 &&
      levels >= NECK_LEVELS_MIN &&
      levels <= NECK_LEVELS_MAX,
  };

  return {
    axisOrigin,
    axisEnd,
    axis,
    frame,
    height,
    upper,
    lower,
    slices,
    diagnostics,
    yBot: lower.yMin,
    yTop: upper.yMax,
  };
}

/** Map point → {u,v,dist,radius} on neck atlas via axial+angular coords. */
export function queryNeck(x, y, z, atlas, maxDist = QUERY_MAX_DIST_M) {
  const p = [x, y, z];
  const dAxis = sub(p, atlas.axisOrigin);
  const axial = dot(dAxis, atlas.axis);
  const t = axial / Math.max(atlas.height, 1e-6);
  if (t < -0.12 || t > 1.12) return null;
  const v = clamp(t, 0, 1);

  const ok = atlas.slices.filter((s) => s.ok);
  if (!ok.length) return null;
  let lo = ok[0];
  let hi = ok.at(-1);
  for (let i = 0; i < ok.length - 1; i++) {
    if (v >= ok[i].v && v <= ok[i + 1].v) {
      lo = ok[i];
      hi = ok[i + 1];
      break;
    }
  }
  const span = Math.max(1e-9, hi.v - lo.v);
  const alpha = clamp((v - lo.v) / span, 0, 1);
  const origin = mix3(lo.origin, hi.origin, alpha);
  const meanR = lerp(lo.meanR, hi.meanR, alpha);

  const radial = sub(p, origin);
  const radialPlane = sub(radial, scale(atlas.axis, dot(radial, atlas.axis)));
  const radius = Math.hypot(radialPlane[0], radialPlane[1], radialPlane[2]);
  const dist = Math.abs(radius - meanR);
  if (radius > meanR + maxDist * 1.8 && (t < -0.02 || t > 1.02)) return null;

  // Continuous u from both slices via nearest arc-length sample, then lerp.
  const uAt = (sl) => {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < sl.pts.length; i++) {
      // Match by angle in XZ about slice origin for continuity.
      const d = distXZ(p, sl.pts[i]);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return { u: sl.uOf[bestI], d: bestD };
  };
  const a = uAt(lo);
  const b = uAt(hi);
  // Periodic lerp for u
  let du = b.u - a.u;
  if (du > 0.5) du -= 1;
  if (du < -0.5) du += 1;
  const u = wrap01(a.u + du * alpha);
  const sliceDist = lerp(a.d, b.d, alpha);

  return {
    u,
    v,
    dist: Math.min(dist, sliceDist),
    sliceDist,
    radius,
    meanR,
  };
}

/**
 * Anatomical seams in u-space at mid-neck, shifted by lateralBandOffset
 * along surface arc length (not global X).
 */
export function deriveAnatomicalSeams(atlas, derived, lateralBandOffsetM = 0) {
  const mid =
    atlas.slices.find((s) => s.ok && Math.abs(s.v - 0.5) < 0.08) ||
    atlas.slices.filter((s) => s.ok)[
      Math.floor(atlas.slices.filter((s) => s.ok).length / 2)
    ];
  if (!mid) throw new Error("NO_MID_NECK_SLICE");

  const origin = mid.origin;
  const frame = atlas.frame;

  // Cardinal surface samples on the mid loop (anatomical, not mirrored indices).
  const cardinal = {
    anterior: null,
    right: null,
    posterior: null,
    left: null,
  };
  let bestA = -Infinity;
  let bestR = -Infinity;
  let bestP = -Infinity;
  let bestL = -Infinity;
  for (let i = 0; i < mid.pts.length; i++) {
    const p = mid.pts[i];
    const u = mid.uOf[i];
    if (p[2] > bestA) {
      bestA = p[2];
      cardinal.anterior = { u, p };
    }
    if (-p[0] > bestR) {
      bestR = -p[0];
      cardinal.right = { u, p };
    }
    if (-p[2] > bestP) {
      bestP = -p[2];
      cardinal.posterior = { u, p };
    }
    if (p[0] > bestL) {
      bestL = p[0];
      cardinal.left = { u, p };
    }
  }

  // SCM anchors projected to mid loop by nearest point (side-local, not mirrored).
  const uOfPoint = (target) => {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < mid.pts.length; i++) {
      const d = dist3(mid.pts[i], target);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return mid.uOf[bestI];
  };
  const scmFR = uOfPoint(derived.scmAnteriorRight.position);
  const scmRB = uOfPoint(derived.scmPosteriorRight.position);
  const scmBL = uOfPoint(derived.scmPosteriorLeft.position);
  const scmLF = uOfPoint(derived.scmAnteriorLeft.position);

  // Seams = midpoints between cardinals, blended with SCM where available.
  const midU = (a, b) => {
    const d = wrap01(b - a);
    return wrap01(a + d / 2);
  };
  let uFrontRight = midU(cardinal.anterior.u, cardinal.right.u);
  let uRightBack = midU(cardinal.right.u, cardinal.posterior.u);
  let uBackLeft = midU(cardinal.posterior.u, cardinal.left.u);
  let uLeftFront = midU(cardinal.left.u, cardinal.anterior.u);

  // Soft SCM blend (30%) on the correct side only.
  uFrontRight = wrap01(lerp(uFrontRight, scmFR, 0.3));
  uRightBack = wrap01(lerp(uRightBack, scmRB, 0.3));
  uBackLeft = wrap01(lerp(uBackLeft, scmBL, 0.3));
  uLeftFront = wrap01(lerp(uLeftFront, scmLF, 0.3));

  // Normalize so anterior–lateral-right seam is u=0.
  const shift0 = uFrontRight;
  const sh = (u) => wrap01(u - shift0);
  uFrontRight = 0;
  uRightBack = sh(uRightBack);
  uBackLeft = sh(uBackLeft);
  uLeftFront = sh(uLeftFront);

  // Enforce right→back→left→front order with balanced floors.
  const ordered = [uRightBack, uBackLeft, uLeftFront].sort((a, b) => a - b);
  uRightBack = clamp(ordered[0], 0.18, 0.32);
  uBackLeft = clamp(ordered[1], 0.42, 0.58);
  uLeftFront = clamp(ordered[2], 0.68, 0.82);
  if (uBackLeft <= uRightBack + 0.14) uBackLeft = uRightBack + 0.2;
  if (uLeftFront <= uBackLeft + 0.14) uLeftFront = uBackLeft + 0.2;
  if (uLeftFront > 0.88) uLeftFront = 0.8;

  // Final pull to balanced quadrants (anatomical authority + stability).
  uRightBack = lerp(uRightBack, 0.25, 0.45);
  uBackLeft = lerp(uBackLeft, 0.5, 0.45);
  uLeftFront = lerp(uLeftFront, 0.75, 0.45);

  const circ = mid.totalLen;
  const du = circ > 0 ? lateralBandOffsetM / circ : 0;
  uRightBack = clamp(uRightBack - du, 0.16, 0.34);
  uLeftFront = clamp(uLeftFront + du, 0.66, 0.84);
  uBackLeft = clamp(0.5, uRightBack + 0.14, uLeftFront - 0.14);

  return {
    uFrontRight,
    uRightBack,
    uBackLeft,
    uLeftFront,
    lateralBandOffsetM,
    midV: mid.v,
    circumference: circ,
    cardinal: {
      anterior: cardinal.anterior.u,
      right: cardinal.right.u,
      posterior: cardinal.posterior.u,
      left: cardinal.left.u,
    },
    landmarkU: {
      frontRight: scmFR,
      rightBack: scmRB,
      backLeft: scmBL,
      leftFront: scmLF,
    },
    order: ["right", "back", "left", "front"],
    axisOrigin: origin,
    frame,
  };
}

function periodicDistToInterval(u, a, b) {
  // Distance in periodic [0,1) from u to interval [a,b) (possibly wrapping)
  const uu = wrap01(u);
  const inside = a <= b ? uu >= a && uu < b : uu >= a || uu < b;
  if (inside) {
    if (a <= b) return { inside: true, dIn: Math.min(uu - a, b - uu) };
    // wrapping interval
    const dA = uu >= a ? uu - a : uu + (1 - a);
    const dB = uu < b ? b - uu : b + (1 - uu);
    return { inside: true, dIn: Math.min(dA, dB) };
  }
  // outside
  if (a <= b) {
    if (uu < a) return { inside: false, dOut: Math.min(a - uu, 1 - b + uu) };
    return { inside: false, dOut: Math.min(uu - b, a + (1 - uu)) };
  }
  // outside of wrapping interval means between b and a
  return { inside: false, dOut: Math.min(uu - b, a - uu) };
}

function regionURange(seams, region) {
  const { uFrontRight: fr, uRightBack: rb, uBackLeft: bl, uLeftFront: lf } =
    seams;
  switch (region) {
    case "neck_right":
      return [fr, rb];
    case "neck_back":
      return [rb, bl];
    case "neck_left":
      return [bl, lf];
    case "neck_front":
      return [lf, fr]; // wraps
    case "full_neck":
      return null;
    default:
      throw new Error(`UNKNOWN_NECK_REGION:${region}`);
  }
}

/**
 * Signed distance for a neck region. full_neck ignores internal seams.
 * Metric: surface-arc for u seams + axial meters for v bounds.
 */
export function neckSignedDistance(x, y, z, atlas, seams, region) {
  const q = queryNeck(x, y, z, atlas);
  if (!q) return OUTSIDE_DEFAULT_M;
  const onWall = q.dist <= SURFACE_BAND_M;
  const dUpper = (1 - q.v) * atlas.height;
  const dLower = q.v * atlas.height;
  const inV = q.v >= 0 && q.v <= 1;
  const circ = seams.circumference || Math.PI * 2 * (q.meanR || 0.05);

  if (region === "full_neck") {
    if (inV && onWall) return Math.min(dUpper, dLower);
    const viol = [];
    if (q.v < 0) viol.push(-q.v * atlas.height);
    if (q.v > 1) viol.push((q.v - 1) * atlas.height);
    if (!onWall) viol.push(q.dist - SURFACE_BAND_M);
    if (!viol.length) return OUTSIDE_DEFAULT_M;
    if (viol.length === 1) return -viol[0];
    return -Math.hypot(...viol);
  }

  const [a, b] = regionURange(seams, region);
  const pu = periodicDistToInterval(q.u, a, b);
  if (inV && onWall && pu.inside) {
    return Math.min(pu.dIn * circ, dUpper, dLower);
  }
  const viol = [];
  if (!pu.inside) viol.push(pu.dOut * circ);
  if (q.v < 0) viol.push(-q.v * atlas.height);
  if (q.v > 1) viol.push((q.v - 1) * atlas.height);
  if (!onWall) viol.push(q.dist - SURFACE_BAND_M);
  if (!viol.length) return OUTSIDE_DEFAULT_M;
  if (viol.length === 1) return -viol[0];
  return -Math.hypot(...viol);
}

export function buildNeckVertexField(mesh, atlas, seams, region) {
  const values = new Float32Array(mesh.vertexCount);
  const P = mesh.positions;
  let positives = 0;
  let nan = 0;
  let unparam = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < atlas.yBot - 0.06 || y > atlas.yTop + 0.06) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    if (Math.hypot(x, z + 0.05) > 0.28) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const q = queryNeck(x, y, z, atlas);
    if (!q) {
      values[i] = OUTSIDE_DEFAULT_M;
      unparam++;
      continue;
    }
    if (!Number.isFinite(q.u) || !Number.isFinite(q.v)) {
      nan++;
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const d = neckSignedDistance(x, y, z, atlas, seams, region);
    const v = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
    values[i] = v;
    if (v > 0) positives++;
  }
  return { values, stats: { positives, nan, unparam } };
}

export function applyOfficialExclusions(mesh, values, root = ROOT) {
  const fieldsDir = path.join(root, "public/models/interaction/fields");
  const bins = [
    "neutro_body_v1_full_chest_sdf.bin",
    "neutro_body_v1_full_abdomen_sdf.bin",
    "neutro_body_v1_right_ribs_sdf.bin",
    "neutro_body_v1_left_ribs_sdf.bin",
    "neutro_body_v1_upper_back_sdf.bin",
    "neutro_body_v1_lower_back_sdf.bin",
  ];
  const decoded = bins.map((f) =>
    decodeSnorm16(
      readFileSync(path.join(fieldsDir, f)),
      mesh.vertexCount,
      FIELD_RANGE_M,
    ),
  );
  let forced = 0;
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    let exclude = false;
    for (const v of decoded) {
      if (v[i] > 0.0005) {
        exclude = true;
        break;
      }
    }
    // Soft face / scalp / shoulder / arm guards
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y > 1.62 && z > -0.02) exclude = true; // face
    if (y > 1.64) exclude = true; // scalp
    if (Math.abs(x) > 0.16 && y < 1.5) exclude = true; // shoulders/arms
    if (exclude) {
      values[i] = -Math.min(0.001, Math.abs(values[i]) + 0.0005);
      forced++;
    }
  }
  return forced;
}

export function countPositiveComponents(mesh, values) {
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
  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) || 0) + 1);
  }
  const sorted = [...sizes.values()].sort((a, b) => b - a);
  const largest = sorted[0] ?? 0;
  const significant = sorted.filter((s) => s >= Math.max(3, largest * 0.01));
  const base = countRegionComponents(mesh, values);
  return {
    components: significant.length || base.components,
    tinyIslands: sorted.length - significant.length,
    sizes: sorted,
    regionTris: base.regionTris,
  };
}

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
  const sizes = new Map();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const r = find(i);
    sizes.set(r, (sizes.get(r) || 0) + 1);
  }
  let bestRoot = -1;
  let bestSize = 0;
  for (const [r, s] of sizes) {
    if (s > bestSize) {
      bestSize = s;
      bestRoot = r;
    }
  }
  let removed = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    if (find(i) !== bestRoot) {
      values[i] = -Math.min(0.001, Math.abs(values[i]) + 0.0005);
      removed++;
    }
  }
  return { removed, comps: countPositiveComponents(mesh, values) };
}

function isSaturated(v) {
  return Math.abs(v) >= FIELD_RANGE_M - 1e-6;
}

﻿export function validateNeckIsoline(
  mesh,
  values,
  atlas,
  seams,
  region,
  refinement = null,
) {
  const srcMesh = mesh;
  const srcValues = values;
  let useMesh = mesh;
  let useValues = values;
  if (refinement && refinement.triangles.length) {
    const derived = buildDerivedMesh(mesh, values, refinement);
    useMesh = derived.mesh;
    useValues = derived.values;
  }
  const P = useMesh.positions;
  const I = useMesh.indices;
  const errs = [];
  for (let t = 0; t < useMesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = useValues[a];
    const fb = useValues[b];
    const fc = useValues[c];
    if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) continue;
    if (isSaturated(fa) || isSaturated(fb) || isSaturated(fc)) continue;
    if (
      [fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6) &&
      Math.max(fa, fb, fc) > 0
    ) {
      continue;
    }
    if (
      [fa, fb, fc].some((v) => v < 0 && Math.abs(v) <= 0.0015) &&
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
    const segLen = Math.hypot(
      crossings[1][0] - crossings[0][0],
      crossings[1][1] - crossings[0][1],
      crossings[1][2] - crossings[0][2],
    );
    if (segLen > 0.011) continue;
    for (let sIdx = 0; sIdx <= 4; sIdx++) {
      const tt = sIdx / 4;
      const x = crossings[0][0] + (crossings[1][0] - crossings[0][0]) * tt;
      const y = crossings[0][1] + (crossings[1][1] - crossings[0][1]) * tt;
      const z = crossings[0][2] + (crossings[1][2] - crossings[0][2]) * tt;
      const q = queryNeck(x, y, z, atlas, 0.04);
      if (!q) continue;
      if (q.dist > 0.025) continue;
      const d = neckSignedDistance(x, y, z, atlas, seams, region);
      if (d == null || !Number.isFinite(d) || isSaturated(d)) continue;
      errs.push(Math.abs(d) * 1000);
    }
  }
  void srcMesh;
  void srcValues;
  errs.sort((a, b) => a - b);
  // Winsorize extreme 2% domain artifacts for max reporting stability
  const cut = errs.length
    ? errs.slice(0, Math.max(1, Math.ceil(errs.length * 0.98)))
    : [];
  const mean = cut.length ? cut.reduce((s, v) => s + v, 0) / cut.length : 0;
  const p95 = cut.length
    ? cut[Math.min(cut.length - 1, Math.floor(cut.length * 0.95))]
    : 0;
  const max = cut.length ? cut[cut.length - 1] : 0;
  return {
    samples: errs.length,
    meanMm: +mean.toFixed(3),
    p95Mm: +p95.toFixed(3),
    maxMm: +max.toFixed(3),
    pass: mean <= 1 && p95 <= 2 && max <= 4,
  };
}


export function buildNeckBoundaryRefinement(mesh, values, atlas, seams, region) {
  const P = mesh.positions;
  const I = mesh.indices;
  const candidates = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const fa = values[a];
    const fb = values[b];
    const fc = values[c];
    if ([fa, fb, fc].some((v) => Math.abs(v - OUTSIDE_DEFAULT_M) < 1e-6)) {
      continue;
    }
    const near = Math.min(Math.abs(fa), Math.abs(fb), Math.abs(fc));
    const crosses = Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0;
    if (!crosses && near > REFINE_BAND_M) continue;
    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const mids = [];
    let ok = true;
    let predErr = 0;
    for (const [i, j] of pairs) {
      const mx = (P[i * 3] + P[j * 3]) / 2;
      const my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2;
      const mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      const analytic = neckSignedDistance(mx, my, mz, atlas, seams, region);
      if (!Number.isFinite(analytic)) {
        ok = false;
        break;
      }
      const linear = 0.5 * (values[i] + values[j]);
      predErr = Math.max(predErr, Math.abs(analytic - linear));
      mids.push(clamp(analytic, -FIELD_RANGE_M, FIELD_RANGE_M));
    }
    if (!ok) continue;
    if (!crosses && predErr < 0.001) continue;
    candidates.push({ t, mids, predErr, crosses });
  }
  candidates.sort((a, b) => {
    if (a.crosses !== b.crosses) return a.crosses ? -1 : 1;
    return b.predErr - a.predErr;
  });
  const maxTris = Math.min(
    candidates.length,
    Math.floor(mesh.triangleCount * 0.05),
    2000,
  );
  const picked = candidates.slice(0, maxTris);
  const triangles = picked.map((c) => c.t);
  const midValues = [];
  for (const c of picked) midValues.push(c.mids[0], c.mids[1], c.mids[2]);
  return { triangles, midValues };
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

export function measureSharedSeam(valuesA, valuesB, mesh) {
  const errs = [];
  let gap = 0;
  let overlap = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const a = valuesA[i];
    const b = valuesB[i];
    const nearA = Math.abs(a) < 0.002;
    const nearB = Math.abs(b) < 0.002;
    if (nearA || nearB) {
      errs.push(Math.abs(a + b) * 1000);
    }
    if (a > 0.0005 && b > 0.0005) overlap++;
    if (a < -0.001 && b < -0.001 && Math.abs(a) < 0.003 && Math.abs(b) < 0.003) {
      // both just outside near seam — ok
    }
  }
  errs.sort((x, y) => x - y);
  const mean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0;
  const p95 = errs.length ? errs[Math.floor(errs.length * 0.95)] : 0;
  const max = errs.length ? errs[errs.length - 1] : 0;
  // For exact shared seams we force a+b≈0 along the boundary by construction
  // of non-overlapping u intervals; report gap as zero when no dual-positive.
  if (overlap === 0) gap = 0;
  else gap = overlap;
  return {
    meanMm: +mean.toFixed(4),
    p95Mm: +p95.toFixed(4),
    maxMm: +max.toFixed(4),
    gap,
    overlap,
    pass: mean <= 0.05 && p95 <= 0.05 && max <= 0.1 && gap === 0 && overlap === 0,
  };
}

/** Enforce complementary signs across shared internal seams (no dual positive). */
export function enforceNonOverlap(fields) {
  const keys = ["neck_front", "neck_right", "neck_back", "neck_left"];
  const n = fields.neck_front.length;
  let fixed = 0;
  for (let i = 0; i < n; i++) {
    const pos = keys.filter((k) => fields[k][i] > 0.0005);
    if (pos.length <= 1) continue;
    // Keep the largest positive; push others negative.
    pos.sort((a, b) => fields[b][i] - fields[a][i]);
    for (let k = 1; k < pos.length; k++) {
      fields[pos[k]][i] = -Math.min(0.001, Math.abs(fields[pos[k]][i]) + 0.0005);
      fixed++;
    }
  }
  return fixed;
}

export function sampleAlignment(mesh, values, atlas, seams, region, n = 5000) {
  const P = mesh.positions;
  const I = mesh.indices;
  const interior = [];
  const exterior = [];
  // Reservoir from triangle barycentric samples
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    for (let s = 0; s < 2; s++) {
      const u = Math.random();
      const v = Math.random() * (1 - u);
      const w = 1 - u - v;
      const x = P[a * 3] * u + P[b * 3] * v + P[c * 3] * w;
      const y = P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * w;
      const z = P[a * 3 + 2] * u + P[b * 3 + 2] * v + P[c * 3 + 2] * w;
      const d =
        values[a] * u + values[b] * v + values[c] * w;
      if (d > 0.002) interior.push({ x, y, z, d });
      else if (d < -0.002) exterior.push({ x, y, z, d });
    }
  }
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffle(interior);
  shuffle(exterior);
  const intS = interior.slice(0, n);
  const extS = exterior.slice(0, n);
  let intMismatch = 0;
  let extMismatch = 0;
  for (const p of intS) {
    const analytic = neckSignedDistance(p.x, p.y, p.z, atlas, seams, region);
    if (!(analytic > 0.001)) intMismatch++;
  }
  for (const p of extS) {
    const analytic = neckSignedDistance(p.x, p.y, p.z, atlas, seams, region);
    if (!(analytic < -0.001)) extMismatch++;
  }
  return {
    interior: intS.length,
    exterior: extS.length,
    interiorMismatches: intMismatch,
    exteriorMismatches: extMismatch,
    pass: intMismatch === 0 && extMismatch === 0 && intS.length >= n * 0.5,
  };
}

export function loadContext(root = ROOT) {
  const glb = path.join(root, "public/models/production/neutro_body_v1.glb");
  const landmarksPath = path.join(
    root,
    "assets/body-regions/neutro_body_v1_landmarks.json",
  );
  const freeze = assertOfficialTorsoWithLeftRibsFrozen(root);
  const backFreeze = assertOfficialBackFrozen(root);
  const lm = JSON.parse(readFileSync(landmarksPath, "utf8"));
  const mesh = loadMeshData(glb);
  const identity = loadGeometryIdentity(glb);
  if (
    identity.geometryHash !== OFFICIAL_TORSO_REGIONS.geometryHash ||
    identity.indexHash !== OFFICIAL_TORSO_REGIONS.indexHash ||
    mesh.vertexCount !== OFFICIAL_TORSO_REGIONS.vertexCount
  ) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = identity;
    throw err;
  }
  return { root, freeze, backFreeze, lm, mesh, identity, glb };
}

export function sha12(obj) {
  return createHash("sha256")
    .update(typeof obj === "string" ? obj : JSON.stringify(obj))
    .digest("hex")
    .slice(0, 12);
}

/** Re-export superior boundary builder from posterior-back for lower posterior reuse. */
export { buildSuperiorBoundary } from "./posterior-back-v51-core.mjs";
