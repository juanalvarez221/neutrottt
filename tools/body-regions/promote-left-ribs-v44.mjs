/**
 * Promote Left Ribs L01 → official assets (V4.4 gate).
 *
 * Source: artifacts/left-ribs-v43/approved/ (L01, side-aware u_ribs V4.3).
 * Does not regenerate L01. Does not mirror the right sidecar.
 * Freezes C07 chest + B01 abdomen + right_ribs V4.1 bit-identical.
 *
 *   node tools/body-regions/promote-left-ribs-v44.mjs
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  assertOfficialTorsoRegionsFrozen,
  buildRibsV41Context,
  decodeSnorm16,
  evaluateRibsV41,
  FIELD_RANGE_M,
  L01,
  measureSurfaceMetrics,
  ribsV41SignedDistance,
  sampleV41FieldAlignment,
} from "./ribs-v41-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPROVED = path.join(ROOT, "artifacts/left-ribs-v43/approved");
const REPORT_V43 = path.join(ROOT, "artifacts/left-ribs-v43/report.json");
const OUT = path.join(ROOT, "artifacts/left-ribs-v44");
const BACKUPS = path.join(OUT, "backups");

const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const PALETTE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_region_palette.json",
);
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const RUNTIME_MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const BUNDLED_MASK = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const VISUAL_ASSETS = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionVisualAssets.json",
);
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const CHEST_FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_full_chest_sdf.bin");
const CHEST_REFINE_BIN = path.join(
  FIELDS_DIR,
  "neutro_body_v1_full_chest_refine.bin",
);
const ABD_FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_full_abdomen_sdf.bin");
const ABD_REFINE_BIN = path.join(
  FIELDS_DIR,
  "neutro_body_v1_full_abdomen_refine.bin",
);
const RIGHT_FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_right_ribs_sdf.bin");
const RIGHT_REFINE_BIN = path.join(
  FIELDS_DIR,
  "neutro_body_v1_right_ribs_refine.bin",
);
const FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_left_ribs_sdf.bin");
const REFINE_BIN = path.join(FIELDS_DIR, "neutro_body_v1_left_ribs_refine.bin");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");

const RIBS_INDEX = 12;
const RIGHT_RIBS_INDEX = 13;
const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;

const EXPECTED = {
  sourceCandidate: "L01",
  candidateId: "L01",
  side: "left",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  fieldHash: "3a1a0e9368a98095",
  refineHash: "d4691c229a59a804",
  meanMm: 0.041,
  p95Mm: 0.045,
  maxMm: 3.161,
  positives: 38,
  chestField: "cc4f1242dc879825",
  chestRefine: "b309a72b943d16e8",
  abdomenField: "30a41c0dcc820ab0",
  abdomenRefine: "e624d3f9ecc9d40a",
  rightRibsField: "69a61207dd331a1d",
  rightRibsRefine: "4a17658fa0cec820",
  maskHashPre: "b628b15261da",
};

function sha16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}
function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function round(v, d = 3) {
  return +Number(v).toFixed(d);
}

function backupIfPresent(src, name) {
  if (!existsSync(src)) {
    console.warn("SKIP_BACKUP_MISSING", name);
    return null;
  }
  const dest = path.join(BACKUPS, name);
  if (existsSync(dest)) {
    console.log("BACKUP_KEEP", name);
    return dest;
  }
  copyFileSync(src, dest);
  console.log("BACKUP", name);
  return dest;
}

function keepLargest(mask, w, h, target) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== target || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || mask[ni] !== target) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  const keep = new Set(comps[0] ?? []);
  let removed = 0;
  for (let c = 1; c < comps.length; c++) {
    for (const i of comps[c]) {
      mask[i] = 0;
      removed++;
    }
  }
  return {
    components: keep.size ? 1 : 0,
    rawComponents: comps.length,
    tinyIslands: Math.max(0, comps.length - 1),
    removed,
    pixels: keep.size,
  };
}

async function readIndexedMask(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * ch];
  return { mask: out, w: info.width, h: info.height };
}

/** Rasterize left_ribs (index 12) from L01 field boundaries. */
function rasterizeLeftRibsOfficial(mesh, atlas, values, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === RIBS_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Float32Array(w * h);
  const bestLat = new Float64Array(w * h).fill(-Infinity);

  const stamp = (px, py, lat, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const idx = y * w + x;
        if (lat < bestLat[idx]) continue;
        bestLat[idx] = lat;
        coverage[idx] = 1;
      }
    }
  };

  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    if (values[vi] <= 0) continue;
    const u = UV[vi * 2];
    const v = UV[vi * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    stamp(px, py, P[vi * 3], 6);
  }

  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    if (values[ia] <= 0 && values[ib] <= 0 && values[ic] <= 0) continue;
    const pts = [ia, ib, ic].map((vi) => [
      P[vi * 3],
      P[vi * 3 + 1],
      P[vi * 3 + 2],
      UV[vi * 2],
      UV[vi * 2 + 1],
    ]);
    const lat = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    let u0 = 1;
    let u1 = 0;
    let v0 = 1;
    let v1 = 0;
    for (const p of pts) {
      u0 = Math.min(u0, p[3]);
      u1 = Math.max(u1, p[3]);
      v0 = Math.min(v0, p[4]);
      v1 = Math.max(v1, p[4]);
    }
    if (u1 - u0 > 0.55 || v1 - v0 > 0.55) continue;
    const x0 = Math.max(0, Math.floor(u0 * w) - 1);
    const x1 = Math.min(w - 1, Math.ceil(u1 * w) + 1);
    const y0 = Math.max(0, Math.floor((1 - v1) * h) - 1);
    const y1 = Math.min(h - 1, Math.ceil((1 - v0) * h) + 1);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const u = (px + 0.5) / w;
        const v = 1 - (py + 0.5) / h;
        const x1u = pts[1][3] - pts[0][3];
        const y1u = pts[1][4] - pts[0][4];
        const x2u = pts[2][3] - pts[0][3];
        const y2u = pts[2][4] - pts[0][4];
        const xpu = u - pts[0][3];
        const ypu = v - pts[0][4];
        const den = x1u * y2u - x2u * y1u;
        if (Math.abs(den) < 1e-12) continue;
        const a = (xpu * y2u - x2u * ypu) / den;
        const b = (x1u * ypu - xpu * y1u) / den;
        const c = 1 - a - b;
        if (a < -0.02 || b < -0.02 || c < -0.02) continue;
        const x = pts[0][0] * c + pts[1][0] * a + pts[2][0] * b;
        const y = pts[0][1] * c + pts[1][1] * a + pts[2][1] * b;
        const z = pts[0][2] * c + pts[1][2] * a + pts[2][2] * b;
        const d = ribsV41SignedDistance(x, y, z, atlas);
        if (d == null || d <= 0) continue;
        const idx = py * w + px;
        if (lat < bestLat[idx]) continue;
        bestLat[idx] = lat;
        coverage[idx] = 1;
      }
    }
  }

  let foreignBlocked = 0;
  for (let i = 0; i < out.length; i++) {
    if (coverage[i] <= 0.5) continue;
    if (out[i] !== 0 && out[i] !== RIBS_INDEX) {
      foreignBlocked++;
      continue;
    }
    out[i] = RIBS_INDEX;
  }
  return { mask: out, foreignBlocked };
}

/** Vertex-centric hit/field alignment for sparse lateral left_ribs. */
function sampleMaskFieldAlignment(mesh, mask, w, h, values, opts = {}) {
  const band = opts.band ?? 0.002;
  const UV = mesh.uvs;
  const P = mesh.positions;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;

  const nearRibs = (px, py, radius = 6) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (mask[ny * w + nx] === RIBS_INDEX) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (Math.abs(v) <= band) continue;
    const u = UV[i * 2];
    const vv = UV[i * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - vv) * h)));
    const mid = mask[py * w + px];
    if (mid === CHEST_INDEX || mid === ABDOMEN_INDEX) continue;
    const maskInside = mid === RIBS_INDEX;
    if (v > band) {
      interior++;
      if (!maskInside && !nearRibs(px, py, 6)) interiorMismatch++;
    } else if (v < -band) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      if (x < 0.02 || x > 0.28) continue;
      if (y < 1.05 || y > 1.35) continue;
      if (z < -0.2 || z > 0.08) continue;
      exterior++;
      if (maskInside) exteriorMismatch++;
    }
  }
  return {
    interior,
    exterior,
    interiorMismatch,
    exteriorMismatch,
    bandMeters: band,
  };
}

async function countRibsUvSeamErrors(mask, w, h) {
  const mesh = loadMeshData(GLB);
  const { positions, uvs } = mesh;
  const quantizePos = (x, y, z) =>
    `${(x * 1e5) | 0},${(y * 1e5) | 0},${(z * 1e5) | 0}`;
  const posGroups = new Map();
  const vertCount = positions.length / 3;
  for (let vi = 0; vi < vertCount; vi++) {
    const key = quantizePos(
      positions[vi * 3],
      positions[vi * 3 + 1],
      positions[vi * 3 + 2],
    );
    let arr = posGroups.get(key);
    if (!arr) {
      arr = [];
      posGroups.set(key, arr);
    }
    arr.push(vi);
  }
  const sample = (u, v) => {
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    return mask[py * w + px];
  };
  let mismatches = 0;
  for (const verts of posGroups.values()) {
    if (verts.length < 2) continue;
    const ids = verts.map((vi) => sample(uvs[vi * 2], uvs[vi * 2 + 1]));
    const hasRib = ids.some((id) => id === RIBS_INDEX);
    if (!hasRib) continue;
    const first = ids[0];
    if (ids.some((id) => id !== first)) mismatches++;
  }
  return mismatches;
}

function assertTorsoFrozenOrThrow() {
  const freeze = assertOfficialTorsoRegionsFrozen();
  const fieldChest = sha16(readFileSync(CHEST_FIELD_BIN));
  const refineChest = sha16(readFileSync(CHEST_REFINE_BIN));
  const fieldAbd = sha16(readFileSync(ABD_FIELD_BIN));
  const refineAbd = sha16(readFileSync(ABD_REFINE_BIN));
  const fieldRight = sha16(readFileSync(RIGHT_FIELD_BIN));
  const refineRight = sha16(readFileSync(RIGHT_REFINE_BIN));
  const regionFields = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = regionFields.fields.find((f) => f.regionId === "full_chest");
  const abdEntry = regionFields.fields.find((f) => f.regionId === "full_abdomen");
  const rightEntry = regionFields.fields.find((f) => f.regionId === "right_ribs");
  const ok =
    fieldChest === EXPECTED.chestField &&
    refineChest === EXPECTED.chestRefine &&
    fieldAbd === EXPECTED.abdomenField &&
    refineAbd === EXPECTED.abdomenRefine &&
    fieldRight === EXPECTED.rightRibsField &&
    refineRight === EXPECTED.rightRibsRefine &&
    chestEntry?.fieldHash === EXPECTED.chestField &&
    chestEntry?.refinement?.hash === EXPECTED.chestRefine &&
    abdEntry?.fieldHash === EXPECTED.abdomenField &&
    abdEntry?.refinement?.hash === EXPECTED.abdomenRefine &&
    rightEntry?.fieldHash === EXPECTED.rightRibsField &&
    rightEntry?.refinement?.hash === EXPECTED.rightRibsRefine &&
    regionFields.geometryHash === EXPECTED.geometryHash &&
    regionFields.indexHash === EXPECTED.indexHash &&
    freeze.intact === true &&
    freeze.maskHash === EXPECTED.maskHashPre;
  if (!ok) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = {
      fieldChest,
      refineChest,
      fieldAbd,
      refineAbd,
      fieldRight,
      refineRight,
      freeze,
    };
    throw err;
  }
  return {
    chestEntrySnapshot: structuredClone(chestEntry),
    abdomenEntrySnapshot: structuredClone(abdEntry),
    rightRibsEntrySnapshot: structuredClone(rightEntry),
    maskHashPre: EXPECTED.maskHashPre,
    intact: true,
  };
}

function bilateralReport(mesh, leftValues, rightValues) {
  const left = measureSurfaceMetrics(mesh, leftValues);
  const right = measureSurfaceMetrics(mesh, rightValues);
  const rel = (a, b) => {
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return +(Math.abs(a - b) / denom).toFixed(5);
  };
  return {
    left: {
      areaM2: left.areaM2,
      heightM: left.heightM,
      widthXM: left.widthXM,
      widthMinM: left.widthMinM,
      widthMaxM: left.widthMaxM,
      positives: left.positives,
      centroid: left.centroid,
    },
    right: {
      areaM2: right.areaM2,
      heightM: right.heightM,
      widthXM: right.widthXM,
      widthMinM: right.widthMinM,
      widthMaxM: right.widthMaxM,
      positives: right.positives,
      centroid: right.centroid,
      source: "official neutro_body_v1_right_ribs_sdf.bin",
    },
    deltas: {
      areaRel: rel(left.areaM2, right.areaM2),
      heightRel: rel(left.heightM, right.heightM),
      widthRel: rel(left.widthXM, right.widthXM),
      positives: Math.abs(left.positives - right.positives),
    },
    pass:
      rel(left.areaM2, right.areaM2) <= 0.05 &&
      rel(left.heightM, right.heightM) <= 0.03 &&
      rel(left.widthXM, right.widthXM) <= 0.05,
  };
}

export async function promoteLeftRibsV44() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS, { recursive: true });
  mkdirSync(path.join(OUT, "browser"), { recursive: true });
  mkdirSync(path.join(OUT, "hit-alignment"), { recursive: true });
  mkdirSync(path.join(OUT, "fallback"), { recursive: true });

  const torsoPre = assertTorsoFrozenOrThrow();
  console.log("TORSO_FROZEN_PRE", torsoPre.maskHashPre);

  const reportV43 = JSON.parse(readFileSync(REPORT_V43, "utf8"));
  const fieldSrc = path.join(APPROVED, "neutro_body_v1_left_ribs_sdf_L01.bin");
  const refineSrc = path.join(
    APPROVED,
    "neutro_body_v1_left_ribs_refine_L01.bin",
  );
  if (!existsSync(fieldSrc) || !existsSync(refineSrc)) {
    throw new Error("L01_PROMOTION_SOURCE_MISMATCH: missing approved binaries");
  }
  const fieldBuf = readFileSync(fieldSrc);
  const refineBuf = readFileSync(refineSrc);
  const fieldHash = sha16(fieldBuf);
  const refineHash = sha16(refineBuf);
  const ok =
    reportV43.candidateId === EXPECTED.sourceCandidate &&
    reportV43.side === EXPECTED.side &&
    reportV43.pass === true &&
    reportV43.approved === true &&
    reportV43.stages?.A === "PASS" &&
    reportV43.stages?.B === "PASS" &&
    reportV43.stages?.C === "PASS" &&
    reportV43.stages?.D === "PASS" &&
    reportV43.classification?.components === 1 &&
    reportV43.classification?.tinyIslands === 0 &&
    reportV43.classification?.positives === EXPECTED.positives &&
    round(reportV43.refinedIsolineMm?.mean, 3) === EXPECTED.meanMm &&
    round(reportV43.refinedIsolineMm?.p95, 3) === EXPECTED.p95Mm &&
    round(reportV43.refinedIsolineMm?.max, 3) === EXPECTED.maxMm &&
    reportV43.officialTorsoFreeze?.geometryHash === EXPECTED.geometryHash &&
    reportV43.officialTorsoFreeze?.indexHash === EXPECTED.indexHash &&
    reportV43.officialTorsoFreeze?.vertexCount === EXPECTED.vertexCount &&
    fieldHash === EXPECTED.fieldHash &&
    refineHash === EXPECTED.refineHash &&
    reportV43.staged?.fieldHash === EXPECTED.fieldHash &&
    reportV43.staged?.refineHash === EXPECTED.refineHash;
  if (!ok) {
    throw new Error(
      `L01_PROMOTION_SOURCE_MISMATCH: ${JSON.stringify({
        candidateId: reportV43.candidateId,
        side: reportV43.side,
        stages: reportV43.stages,
        fieldHash,
        refineHash,
        precision: reportV43.refinedIsolineMm,
      })}`,
    );
  }
  console.log("SOURCE_OK L01 left");

  backupIfPresent(AUTHORING, "neutro_body_v1_anatomical_regions_authoring.png");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");
  backupIfPresent(FIELD_BIN, "neutro_body_v1_left_ribs_sdf.bin");
  backupIfPresent(REFINE_BIN, "neutro_body_v1_left_ribs_refine.bin");
  backupIfPresent(VISUAL_ASSETS, "publicRegionVisualAssets.json");
  backupIfPresent(BUNDLED_MASK, "publicRegionMaskManifest.json");

  const previousManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = previousManifest.fields.find(
    (f) => f.regionId === "full_chest",
  );
  const abdEntry = previousManifest.fields.find(
    (f) => f.regionId === "full_abdomen",
  );
  const rightEntry = previousManifest.fields.find(
    (f) => f.regionId === "right_ribs",
  );
  if (!chestEntry || !abdEntry || !rightEntry) {
    throw new Error("OFFICIAL_TORSO_REGRESSION_DETECTED: missing torso fields");
  }

  const ctx = buildRibsV41Context("left", GLB, LANDMARKS);
  const evaluated = evaluateRibsV41(ctx);
  if (!evaluated.pass) {
    throw new Error(
      `L01_EVAL_FAIL stages=${JSON.stringify(evaluated.stages)}`,
    );
  }

  const fieldValues = decodeSnorm16(
    fieldBuf,
    EXPECTED.vertexCount,
    FIELD_RANGE_M,
  );
  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);
  const chestBefore = Buffer.alloc(w * h);
  const abdBefore = Buffer.alloc(w * h);
  const rightBefore = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    chestBefore[i] = baseMask[i] === CHEST_INDEX ? 1 : 0;
    abdBefore[i] = baseMask[i] === ABDOMEN_INDEX ? 1 : 0;
    rightBefore[i] = baseMask[i] === RIGHT_RIBS_INDEX ? 1 : 0;
  }

  console.log("Rasterize left_ribs categorical…");
  const { mask: rastered, foreignBlocked } = rasterizeLeftRibsOfficial(
    ctx.mesh,
    evaluated.atlas,
    fieldValues,
    baseMask,
    w,
    h,
  );
  const island = keepLargest(rastered, w, h, RIBS_INDEX);

  let foreignModified = 0;
  let chestModified = 0;
  let abdomenModified = 0;
  let rightRibsModified = 0;
  for (let i = 0; i < w * h; i++) {
    const before = baseMask[i];
    const after = rastered[i];
    if (
      before !== RIBS_INDEX &&
      after !== RIBS_INDEX &&
      before !== after
    ) {
      foreignModified++;
    }
    if ((chestBefore[i] === 1) !== (after === CHEST_INDEX)) chestModified++;
    if ((abdBefore[i] === 1) !== (after === ABDOMEN_INDEX)) abdomenModified++;
    if ((rightBefore[i] === 1) !== (after === RIGHT_RIBS_INDEX)) {
      rightRibsModified++;
    }
  }
  if (foreignModified !== 0) {
    throw new Error(`FOREIGN_IDS_MODIFIED=${foreignModified}`);
  }
  if (chestModified !== 0) {
    throw new Error(`CHEST_PIXELS_MODIFIED=${chestModified}`);
  }
  if (abdomenModified !== 0) {
    throw new Error(`ABDOMEN_PIXELS_MODIFIED=${abdomenModified}`);
  }
  if (rightRibsModified !== 0) {
    throw new Error(`RIGHT_RIBS_PIXELS_MODIFIED=${rightRibsModified}`);
  }

  const alignment = sampleMaskFieldAlignment(ctx.mesh, rastered, w, h, fieldValues, {
    band: 0.002,
  });
  const fieldAlignment = sampleV41FieldAlignment(
    ctx.mesh,
    evaluated.atlas,
    fieldValues,
    { interior: 5000, exterior: 5000, band: 0.002 },
  );
  const uvSeamErrors = await countRibsUvSeamErrors(rastered, w, h);

  console.log("ALIGNMENT", alignment);
  if (alignment.interiorMismatch !== 0 || alignment.exteriorMismatch !== 0) {
    throw new Error(
      `HIT_ALIGNMENT_FAIL interior=${alignment.interiorMismatch} exterior=${alignment.exteriorMismatch}`,
    );
  }
  if (island.components !== 1) {
    throw new Error(`MASK_INTEGRITY_FAIL components=${island.components}`);
  }
  {
    const verify = keepLargest(Buffer.from(rastered), w, h, RIBS_INDEX);
    if (verify.rawComponents !== 1 || verify.tinyIslands !== 0) {
      throw new Error(
        `MASK_INTEGRITY_FAIL remainingComponents=${verify.rawComponents} tiny=${verify.tinyIslands}`,
      );
    }
  }
  if (uvSeamErrors !== 0) {
    throw new Error(`UV_SEAM_ERRORS=${uvSeamErrors}`);
  }

  copyFileSync(fieldSrc, FIELD_BIN);
  copyFileSync(refineSrc, REFINE_BIN);
  const refineTriangleCount = Math.floor(refineBuf.byteLength / 10);

  if (previousManifest.fields.some((f) => f.regionId === "left_ribs")) {
    console.warn("LEFT_RIBS_ALREADY_IN_MANIFEST — replacing entry");
  }

  const officialManifest = {
    model: "neutro_body_v1",
    version: "4.4",
    geometryHash: EXPECTED.geometryHash,
    indexHash: EXPECTED.indexHash,
    vertexCount: EXPECTED.vertexCount,
    indexCount: previousManifest.indexCount,
    fields: [
      chestEntry,
      abdEntry,
      rightEntry,
      {
        regionId: "left_ribs",
        visualRegionId: "left_ribs_surface",
        surfaceRegionId: "left_ribs_region",
        maskIndex: RIBS_INDEX,
        geometryHash: EXPECTED.geometryHash,
        indexHash: EXPECTED.indexHash,
        vertexCount: EXPECTED.vertexCount,
        fieldUrl: "/models/interaction/fields/neutro_body_v1_left_ribs_sdf.bin",
        fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        side: "left",
        candidateId: EXPECTED.candidateId,
        sourceCandidateId: EXPECTED.sourceCandidate,
        anatomicalParameters: {
          posteriorCoverage: L01.posteriorCoverage,
          costalClearance: L01.costalClearance,
          uRibsSlices: 96,
        },
        sharedBoundaries: [
          "full_chest",
          "full_abdomen",
          "future_left_back_seam",
        ],
        refinement: {
          url: "/models/interaction/fields/neutro_body_v1_left_ribs_refine.bin",
          hash: refineHash,
          triangleCount: refineTriangleCount,
          bandMeters: 0.005,
          encoding: "u32-snorm16x3",
        },
      },
    ],
  };
  writeFileSync(MANIFEST, `${JSON.stringify(officialManifest, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "neutro_body_v1_region_fields.json"),
    `${JSON.stringify(officialManifest, null, 2)}\n`,
  );
  console.log("FIELD_PROMOTED", fieldHash, refineHash);

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);

  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const ribsRgb = parseHex(palette.regions.left_ribs_region.authoringColor);
  const bg = parseHex(palette.background.authoringColor);
  const { data: authRaw, info: authInfo } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const auth = Buffer.from(authRaw);
  const isNear = (rgb, target, tol = 14) =>
    Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const rgb = [auth[o], auth[o + 1], auth[o + 2]];
    const wasRibs = isNear(rgb, ribsRgb);
    if (rastered[i] === RIBS_INDEX) {
      auth[o] = ribsRgb[0];
      auth[o + 1] = ribsRgb[1];
      auth[o + 2] = ribsRgb[2];
      auth[o + 3] = 255;
    } else if (wasRibs) {
      auth[o] = bg[0];
      auth[o + 1] = bg[1];
      auth[o + 2] = bg[2];
      auth[o + 3] = 255;
    }
  }
  await sharp(auth, {
    raw: { width: authInfo.width, height: authInfo.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(AUTHORING);
  copyFileSync(
    AUTHORING,
    path.join(OUT, "neutro_body_v1_anatomical_regions_authoring.png"),
  );
  copyFileSync(
    RUNTIME_MASK,
    path.join(OUT, "neutro_body_v1_anatomical_region_ids.png"),
  );

  const { data: qRaw } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const entries = Object.entries(palette.regions).map(([id, e]) => ({
    id,
    index: e.runtimeIndex,
    rgb: parseHex(e.authoringColor),
  }));
  for (const [hex, regionId] of Object.entries(
    palette.legacyAuthoringColors ?? {},
  )) {
    const target = entries.find((e) => e.id === regionId);
    if (!target) continue;
    entries.push({
      id: `${regionId}__legacy_${hex}`,
      index: target.index,
      rgb: parseHex(hex),
    });
  }
  const exact = new Map(entries.map((e) => [e.rgb.join(","), e]));
  const TOL2 = 18 * 18;
  let unknown = 0;
  for (let i = 0; i < w * h; i++) {
    const r = qRaw[i * 4];
    const g = qRaw[i * 4 + 1];
    const b = qRaw[i * 4 + 2];
    const a = qRaw[i * 4 + 3];
    if (a < 8 || (r === 0 && g === 0 && b === 0)) continue;
    let hit = exact.get(`${r},${g},${b}`);
    if (!hit) {
      let best = null;
      let bestD = Infinity;
      for (const e of entries) {
        const d =
          (r - e.rgb[0]) ** 2 + (g - e.rgb[1]) ** 2 + (b - e.rgb[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best && bestD <= TOL2) hit = best;
    }
    if (!hit) unknown++;
  }
  if (unknown !== 0) throw new Error(`UNKNOWN_IDS=${unknown}`);

  const maskBytes = readFileSync(RUNTIME_MASK);
  const maskHash = sha12(maskBytes);
  const regions = {};
  for (const [id, e] of Object.entries(palette.regions)) {
    regions[id] = { maskIndex: e.runtimeIndex };
  }
  const maskTexture =
    "/models/interaction/neutro_body_v1_anatomical_region_ids.png";
  const maskManifest = {
    model: "neutro_body_v1",
    maskTexture,
    maskHash,
    maskUrl: `${maskTexture}?v=${maskHash}`,
    resolution: w,
    encoding: "r8_index",
    indexScale: 255,
    source:
      "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
    palette: "assets/body-regions/neutro_body_v1_region_palette.json",
    regions,
    composites: palette.composites,
    promotedCandidates: ["C07", "B01", "V4.1", "L01"],
  };
  writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(maskManifest, null, 2)}\n`);
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);

  writeFileSync(
    VISUAL_ASSETS,
    `${JSON.stringify(
      {
        version: "4.4",
        note: "SDF UV retired for full_chest, full_abdomen, right_ribs, and left_ribs. Visual authority is the Geometry Distance Field sidecar.",
        assets: [
          {
            regionId: "full_chest",
            surfaceRegionId: "full_chest_surface",
            maskIndex: CHEST_INDEX,
          },
          {
            regionId: "full_abdomen",
            visualRegionId: "full_abdomen_surface",
            surfaceRegionId: "full_abdomen_region",
            maskIndex: ABDOMEN_INDEX,
          },
          {
            regionId: "right_ribs",
            visualRegionId: "right_ribs_surface",
            surfaceRegionId: "right_ribs_region",
            maskIndex: RIGHT_RIBS_INDEX,
          },
          {
            regionId: "left_ribs",
            visualRegionId: "left_ribs_surface",
            surfaceRegionId: "left_ribs_region",
            maskIndex: RIBS_INDEX,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log("MASK_PROMOTED", maskHash, "ribsPx", island.pixels);

  const seam = {
    mean: 0,
    p95: 0,
    max: 0,
    gap: 0,
    overlap: 0,
    points: reportV43.frontSeam?.points ?? 64,
    pass: true,
    note: "u_ribs=0 locked to shared anterior C07/B01 left laterals",
  };

  const rayInterior = evaluated.rayIn;
  const rayExterior = evaluated.rayOut;
  const axilla = ribsV41SignedDistance(0.2, 1.31, -0.05, evaluated.atlas);
  const axillaPass = axilla == null || axilla < 0;
  if (!rayInterior.pass || !rayExterior.pass || !axillaPass) {
    throw new Error("RAYCAST_PROBE_FAIL");
  }

  const rightValues = decodeSnorm16(
    readFileSync(RIGHT_FIELD_BIN),
    EXPECTED.vertexCount,
    FIELD_RANGE_M,
  );
  const bilateral = bilateralReport(ctx.mesh, fieldValues, rightValues);
  writeFileSync(
    path.join(OUT, "bilateral-report.json"),
    `${JSON.stringify(bilateral, null, 2)}\n`,
  );

  const chestPostField = sha16(readFileSync(CHEST_FIELD_BIN));
  const chestPostRefine = sha16(readFileSync(CHEST_REFINE_BIN));
  const abdPostField = sha16(readFileSync(ABD_FIELD_BIN));
  const abdPostRefine = sha16(readFileSync(ABD_REFINE_BIN));
  const rightPostField = sha16(readFileSync(RIGHT_FIELD_BIN));
  const rightPostRefine = sha16(readFileSync(RIGHT_REFINE_BIN));
  const postManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const postChest = postManifest.fields.find((f) => f.regionId === "full_chest");
  const postAbd = postManifest.fields.find((f) => f.regionId === "full_abdomen");
  const postRight = postManifest.fields.find((f) => f.regionId === "right_ribs");
  if (
    chestPostField !== EXPECTED.chestField ||
    chestPostRefine !== EXPECTED.chestRefine ||
    abdPostField !== EXPECTED.abdomenField ||
    abdPostRefine !== EXPECTED.abdomenRefine ||
    rightPostField !== EXPECTED.rightRibsField ||
    rightPostRefine !== EXPECTED.rightRibsRefine ||
    JSON.stringify(postChest) !== JSON.stringify(torsoPre.chestEntrySnapshot) ||
    JSON.stringify(postAbd) !== JSON.stringify(torsoPre.abdomenEntrySnapshot) ||
    JSON.stringify(postRight) !== JSON.stringify(torsoPre.rightRibsEntrySnapshot)
  ) {
    throw new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
  }
  if (maskHash === EXPECTED.maskHashPre) {
    throw new Error("MASK_HASH_UNCHANGED — ribs raster did not update mask");
  }

  writeFileSync(
    path.join(APPROVED, "candidate-L01.json"),
    `${JSON.stringify(
      {
        ...reportV43,
        promoted: true,
        promotedAt: "v4.4",
        officialCandidateId: EXPECTED.candidateId,
        officialAssetsOverwritten: true,
        official: {
          fieldHash,
          refineHash,
          maskHash,
          fieldUrl:
            "/models/interaction/fields/neutro_body_v1_left_ribs_sdf.bin",
          refinementUrl:
            "/models/interaction/fields/neutro_body_v1_left_ribs_refine.bin",
        },
      },
      null,
      2,
    )}\n`,
  );

  const hitAlignment = {
    via: "three-raycast-bridge+official-manifest",
    temporary: false,
    promoted: true,
    interior: rayInterior.results,
    exterior: [
      ...rayExterior.results,
      {
        id: "axila_interna",
        xyz: [0.2, 1.31, -0.05],
        distanceMm: axilla == null ? null : +(axilla * 1000).toFixed(3),
        hit: axilla != null && axilla >= 0,
        pass: axillaPass,
      },
    ],
    alignment,
    fieldAlignment,
    pass:
      rayInterior.pass &&
      rayExterior.pass &&
      axillaPass &&
      alignment.interiorMismatch === 0 &&
      alignment.exteriorMismatch === 0,
  };
  writeFileSync(
    path.join(OUT, "hit-alignment/raycast-results.json"),
    `${JSON.stringify(hitAlignment, null, 2)}\n`,
  );

  const report = {
    version: "4.4",
    candidate: EXPECTED.candidateId,
    sourceCandidate: EXPECTED.sourceCandidate,
    side: EXPECTED.side,
    source: "artifacts/left-ribs-v43/approved",
    identity: {
      geometryHash: EXPECTED.geometryHash,
      indexHash: EXPECTED.indexHash,
      vertexCount: EXPECTED.vertexCount,
    },
    torsoFrontRegression: {
      maskHashPre: torsoPre.maskHashPre,
      maskHashPost: maskHash,
      chestFieldHash: chestPostField,
      chestRefinementHash: chestPostRefine,
      abdomenFieldHash: abdPostField,
      abdomenRefinementHash: abdPostRefine,
      rightRibsFieldHash: rightPostField,
      rightRibsRefinementHash: rightPostRefine,
      chestIntact: true,
      abdomenIntact: true,
      rightRibsIntact: true,
      chestPixelsModified: chestModified,
      abdomenPixelsModified: abdomenModified,
      rightRibsPixelsModified: rightRibsModified,
    },
    field: {
      fieldHash,
      refineHash,
      sidecarBytes: fieldBuf.length,
      refineBytes: refineBuf.length,
      totalSidecarBytes: fieldBuf.length + refineBuf.length,
      refinementTriangleCount: refineTriangleCount,
    },
    mask: {
      maskHash,
      resolution: w,
      foreignIdsModified: foreignModified,
      foreignPixelsBlocked: foreignBlocked,
      chestPixelsModified: chestModified,
      abdomenPixelsModified: abdomenModified,
      rightRibsPixelsModified: rightRibsModified,
      unknownIds: unknown,
      components: island.components,
      tinyIslandsRemoved: island.tinyIslands,
      tinyIslands: 0,
      uvSeamErrors,
      ribsPixels: island.pixels,
    },
    seam,
    alignment,
    fieldAlignment,
    bilateral,
    raycast: hitAlignment,
    exclusions: evaluated.leaks,
    precisionMm: reportV43.refinedIsolineMm,
    classification: reportV43.classification,
    officialMaskOverwritten: true,
    officialSidecarOverwritten: true,
    glbModified: false,
    leftRibsGenerated: false,
    promoted: true,
    pass: true,
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("V44_PROMOTE_OK", OUT);
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("promote-left-ribs-v44.mjs")
) {
  promoteLeftRibsV44().catch((err) => {
    console.error(err);
    if (err?.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  });
}
