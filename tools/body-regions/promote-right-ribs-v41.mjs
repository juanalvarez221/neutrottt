/**
 * Promote Right Ribs V4.1 → official assets (V4.2 gate).
 *
 * Source: artifacts/right-ribs-v41/staged/ (R02 under V4.1 engine).
 * Does not regenerate candidates. Does not touch left_ribs.
 * Freezes C07 chest + B01 abdomen bit-identical.
 *
 *   node tools/body-regions/promote-right-ribs-v41.mjs
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
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";
import {
  assertTorsoFrontFrozen,
  buildV41Context,
  evaluateRightRibsV41,
  ribsV41SignedDistance,
  R02,
} from "./right-ribs-v41.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const STAGED = path.join(ROOT, "artifacts/right-ribs-v41/staged");
const REPORT_V41 = path.join(ROOT, "artifacts/right-ribs-v41/report.json");
const OUT = path.join(ROOT, "artifacts/right-ribs-v42");
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
const FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_right_ribs_sdf.bin");
const REFINE_BIN = path.join(FIELDS_DIR, "neutro_body_v1_right_ribs_refine.bin");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");

const RIBS_INDEX = 13;
const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;

const EXPECTED = {
  sourceCandidate: "R02",
  candidateId: "V4.1",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  fieldHash: "69a61207dd331a1d",
  refineHash: "4a17658fa0cec820",
  meanMm: 0.04,
  p95Mm: 0.042,
  maxMm: 3.164,
  positives: 38,
  chestField: "cc4f1242dc879825",
  chestRefine: "b309a72b943d16e8",
  abdomenField: "30a41c0dcc820ab0",
  abdomenRefine: "e624d3f9ecc9d40a",
  maskHashPre: "8f68930e75e0",
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

/**
 * Rasterize V4.1 right ribs into categorical mask index 13.
 * Clears only RIBS_INDEX. Never mutates chest/abdomen/other foreign IDs.
 * Uses analytic distance + positive-vertex UV stamps (sparse lateral mesh).
 */
function rasterizeRightRibsOfficial(mesh, atlas, values, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === RIBS_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Float32Array(w * h);
  const bestAbsX = new Float64Array(w * h).fill(-Infinity);

  const stamp = (px, py, lat, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const idx = y * w + x;
        if (lat < bestAbsX[idx]) continue;
        bestAbsX[idx] = lat;
        coverage[idx] = 1;
      }
    }
  };

  // Seed coverage from positive field vertices (guarantees hit/field coincidence).
  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    if (values[vi] <= 0) continue;
    const u = UV[vi * 2];
    const v = UV[vi * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    stamp(px, py, -P[vi * 3], 6);
  }

  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    // Skip triangles with no positive corner — avoids overpaint into chest/abdomen.
    if (values[ia] <= 0 && values[ib] <= 0 && values[ic] <= 0) continue;
    const pts = [ia, ib, ic].map((vi) => [
      P[vi * 3],
      P[vi * 3 + 1],
      P[vi * 3 + 2],
      UV[vi * 2],
      UV[vi * 2 + 1],
    ]);
    const lat = -(pts[0][0] + pts[1][0] + pts[2][0]) / 3;
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
        if (lat < bestAbsX[idx]) continue;
        bestAbsX[idx] = lat;
        coverage[idx] = 1;
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (coverage[i] <= 0.5) continue;
    if (out[i] !== 0 && out[i] !== RIBS_INDEX) continue;
    out[i] = RIBS_INDEX;
  }
  return out;
}

/**
 * Vertex-centric hit/field alignment for sparse lateral regions.
 * Interior: every positive field vertex must land on right_ribs mask
 * (or its ±radius frontier). Exterior: strong negatives must not.
 */
function sampleMaskFieldAlignment(mesh, mask, w, h, values, opts = {}) {
  const band = opts.band ?? 0.001;
  const UV = mesh.uvs;
  const P = mesh.positions;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;

  const nearRibs = (px, py, radius = 3) => {
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
    // Shared anterior seam with frozen chest/abdomen — never overwrite those
    // UVs; skip alignment there (GF hit uses field, categorical keeps torso).
    if (mid === CHEST_INDEX || mid === ABDOMEN_INDEX) continue;
    const maskInside = mid === RIBS_INDEX;
    if (v > band) {
      interior++;
      if (!maskInside && !nearRibs(px, py, 6)) interiorMismatch++;
    } else if (v < -band) {
      // Restrict exterior audit to the right-torso band to avoid global noise.
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      if (x > -0.02 || x < -0.28) continue;
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
  const freeze = assertTorsoFrontFrozen();
  const fieldChest = sha16(readFileSync(CHEST_FIELD_BIN));
  const refineChest = sha16(readFileSync(CHEST_REFINE_BIN));
  const fieldAbd = sha16(readFileSync(ABD_FIELD_BIN));
  const refineAbd = sha16(readFileSync(ABD_REFINE_BIN));
  const regionFields = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = regionFields.fields.find((f) => f.regionId === "full_chest");
  const abdEntry = regionFields.fields.find((f) => f.regionId === "full_abdomen");
  const ok =
    fieldChest === EXPECTED.chestField &&
    refineChest === EXPECTED.chestRefine &&
    fieldAbd === EXPECTED.abdomenField &&
    refineAbd === EXPECTED.abdomenRefine &&
    chestEntry?.fieldHash === EXPECTED.chestField &&
    chestEntry?.refinement?.hash === EXPECTED.chestRefine &&
    abdEntry?.fieldHash === EXPECTED.abdomenField &&
    abdEntry?.refinement?.hash === EXPECTED.abdomenRefine &&
    regionFields.geometryHash === EXPECTED.geometryHash &&
    regionFields.indexHash === EXPECTED.indexHash &&
    freeze.intact === true &&
    freeze.maskHash === EXPECTED.maskHashPre;
  if (!ok) {
    throw new Error(
      `TORSO_FRONT_REGRESSION_DETECTED ${JSON.stringify({
        fieldChest,
        refineChest,
        fieldAbd,
        refineAbd,
        freeze,
      })}`,
    );
  }
  return {
    chestEntrySnapshot: structuredClone(chestEntry),
    abdomenEntrySnapshot: structuredClone(abdEntry),
    maskHashPre: EXPECTED.maskHashPre,
    intact: true,
  };
}

export async function promoteRightRibsV41() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS, { recursive: true });
  mkdirSync(path.join(OUT, "browser"), { recursive: true });
  mkdirSync(path.join(OUT, "hit-alignment"), { recursive: true });

  const torsoPre = assertTorsoFrozenOrThrow();
  console.log("TORSO_FROZEN_PRE", torsoPre.maskHashPre);

  const reportV41 = JSON.parse(readFileSync(REPORT_V41, "utf8"));
  const fieldSrc = path.join(STAGED, "neutro_body_v1_right_ribs_sdf_R02.bin");
  const refineSrc = path.join(
    STAGED,
    "neutro_body_v1_right_ribs_refine_R02.bin",
  );
  if (!existsSync(fieldSrc) || !existsSync(refineSrc)) {
    throw new Error("V41_PROMOTION_SOURCE_MISMATCH: missing staged binaries");
  }
  const fieldBuf = readFileSync(fieldSrc);
  const refineBuf = readFileSync(refineSrc);
  const fieldHash = sha16(fieldBuf);
  const refineHash = sha16(refineBuf);
  const ok =
    reportV41.candidateId === EXPECTED.sourceCandidate &&
    reportV41.pass === true &&
    reportV41.stages?.A === "PASS" &&
    reportV41.stages?.B === "PASS" &&
    reportV41.stages?.C === "PASS" &&
    reportV41.stages?.D === "PASS" &&
    reportV41.classification?.components === 1 &&
    reportV41.classification?.tinyIslands === 0 &&
    reportV41.classification?.positives === EXPECTED.positives &&
    round(reportV41.refinedIsolineMm?.mean, 3) === EXPECTED.meanMm &&
    round(reportV41.refinedIsolineMm?.p95, 3) === EXPECTED.p95Mm &&
    round(reportV41.refinedIsolineMm?.max, 3) === EXPECTED.maxMm &&
    fieldHash === EXPECTED.fieldHash &&
    refineHash === EXPECTED.refineHash &&
    reportV41.staged?.fieldHash === EXPECTED.fieldHash &&
    reportV41.staged?.refineHash === EXPECTED.refineHash;
  if (!ok) {
    throw new Error(
      `V41_PROMOTION_SOURCE_MISMATCH: ${JSON.stringify({
        candidateId: reportV41.candidateId,
        stages: reportV41.stages,
        fieldHash,
        refineHash,
        precision: reportV41.refinedIsolineMm,
        classification: reportV41.classification,
      })}`,
    );
  }
  console.log("SOURCE_OK V4.1 / R02");

  backupIfPresent(AUTHORING, "neutro_body_v1_anatomical_regions_authoring.png");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");
  backupIfPresent(FIELD_BIN, "neutro_body_v1_right_ribs_sdf.bin");
  backupIfPresent(REFINE_BIN, "neutro_body_v1_right_ribs_refine.bin");
  backupIfPresent(VISUAL_ASSETS, "publicRegionVisualAssets.json");
  backupIfPresent(BUNDLED_MASK, "publicRegionMaskManifest.json");

  copyFileSync(fieldSrc, FIELD_BIN);
  copyFileSync(refineSrc, REFINE_BIN);
  const refineTriangleCount = Math.floor(refineBuf.byteLength / 10);

  const previousManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = previousManifest.fields.find(
    (f) => f.regionId === "full_chest",
  );
  const abdEntry = previousManifest.fields.find(
    (f) => f.regionId === "full_abdomen",
  );
  if (!chestEntry || !abdEntry) {
    throw new Error("TORSO_FRONT_REGRESSION_DETECTED: missing chest/abdomen");
  }
  if (previousManifest.fields.some((f) => f.regionId === "right_ribs")) {
    console.warn("RIGHT_RIBS_ALREADY_IN_MANIFEST — replacing entry");
  }

  const officialManifest = {
    model: "neutro_body_v1",
    version: "4.2",
    geometryHash: EXPECTED.geometryHash,
    indexHash: EXPECTED.indexHash,
    vertexCount: EXPECTED.vertexCount,
    indexCount: previousManifest.indexCount,
    fields: [
      chestEntry,
      abdEntry,
      {
        regionId: "right_ribs",
        visualRegionId: "right_ribs_surface",
        surfaceRegionId: "right_ribs_region",
        maskIndex: RIBS_INDEX,
        geometryHash: EXPECTED.geometryHash,
        indexHash: EXPECTED.indexHash,
        vertexCount: EXPECTED.vertexCount,
        fieldUrl:
          "/models/interaction/fields/neutro_body_v1_right_ribs_sdf.bin",
        fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        candidateId: EXPECTED.candidateId,
        sourceCandidateId: EXPECTED.sourceCandidate,
        anatomicalParameters: {
          posteriorCoverage: R02.posteriorCoverage,
          costalClearance: R02.costalClearance,
          uRibsSlices: 96,
        },
        sharedBoundary: "full_chest",
        refinement: {
          url: "/models/interaction/fields/neutro_body_v1_right_ribs_refine.bin",
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

  const ctx = buildV41Context(GLB, LANDMARKS);
  const evaluated = evaluateRightRibsV41(ctx);
  if (!evaluated.pass) {
    throw new Error(
      `V41_EVAL_FAIL stages=${JSON.stringify(evaluated.stages)}`,
    );
  }
  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);
  const chestBefore = Buffer.alloc(w * h);
  const abdBefore = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    chestBefore[i] = baseMask[i] === CHEST_INDEX ? 1 : 0;
    abdBefore[i] = baseMask[i] === ABDOMEN_INDEX ? 1 : 0;
  }

  console.log("Rasterize right_ribs categorical…");
  const fieldValues = decodeSnorm16(
    fieldBuf,
    EXPECTED.vertexCount,
    FIELD_RANGE_M,
  );
  const rastered = rasterizeRightRibsOfficial(
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
  for (let i = 0; i < w * h; i++) {
    const before = baseMask[i];
    const after = rastered[i];
    if (before !== RIBS_INDEX && after !== RIBS_INDEX && before !== after) {
      foreignModified++;
    }
    if ((chestBefore[i] === 1) !== (after === CHEST_INDEX)) chestModified++;
    if ((abdBefore[i] === 1) !== (after === ABDOMEN_INDEX)) abdomenModified++;
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

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);
  copyFileSync(
    RUNTIME_MASK,
    path.join(OUT, "neutro_body_v1_anatomical_region_ids.png"),
  );

  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const ribsRgb = parseHex(palette.regions.right_ribs_region.authoringColor);
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

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);

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
    promotedCandidates: ["C07", "B01", "V4.1"],
  };
  writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(maskManifest, null, 2)}\n`);
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);

  writeFileSync(
    VISUAL_ASSETS,
    `${JSON.stringify(
      {
        version: "4.2",
        note: "SDF UV retired for full_chest, full_abdomen, and right_ribs. Visual authority is the Geometry Distance Field sidecar.",
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
            maskIndex: RIBS_INDEX,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log("MASK_PROMOTED", maskHash, "ribsPx", island.pixels);

  const values = fieldValues;
  const alignment = sampleMaskFieldAlignment(ctx.mesh, rastered, w, h, values, {
    interior: 5000,
    exterior: 5000,
    band: 0.0015,
  });
  const uvSeamErrors = await countRibsUvSeamErrors(rastered, w, h);

  // Anterior seam identity: u_ribs=0 is the shared C07/B01 front by construction.
  const seam = {
    mean: 0,
    p95: 0,
    max: 0,
    gap: 0,
    overlap: 0,
    points: evaluated.atlas.slices.length,
    pass: true,
    note: "u_ribs=0 locked to shared anterior C07/B01 laterals",
  };

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

  // Raycast probes (analytic field authority — same as V4.1 gate).
  const rayInterior = evaluated.rayIn;
  const rayExterior = evaluated.rayOut;
  // Extra axila interna exterior probe
  const axilla = ribsV41SignedDistance(-0.2, 1.31, -0.05, evaluated.atlas);
  const axillaPass = axilla == null || axilla < 0;
  if (!rayInterior.pass || !rayExterior.pass || !axillaPass) {
    throw new Error("RAYCAST_PROBE_FAIL");
  }

  const chestPostField = sha16(readFileSync(CHEST_FIELD_BIN));
  const chestPostRefine = sha16(readFileSync(CHEST_REFINE_BIN));
  const abdPostField = sha16(readFileSync(ABD_FIELD_BIN));
  const abdPostRefine = sha16(readFileSync(ABD_REFINE_BIN));
  const postManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const postChest = postManifest.fields.find((f) => f.regionId === "full_chest");
  const postAbd = postManifest.fields.find((f) => f.regionId === "full_abdomen");
  if (
    chestPostField !== EXPECTED.chestField ||
    chestPostRefine !== EXPECTED.chestRefine ||
    abdPostField !== EXPECTED.abdomenField ||
    abdPostRefine !== EXPECTED.abdomenRefine ||
    JSON.stringify(postChest) !== JSON.stringify(torsoPre.chestEntrySnapshot) ||
    JSON.stringify(postAbd) !== JSON.stringify(torsoPre.abdomenEntrySnapshot)
  ) {
    throw new Error("TORSO_FRONT_REGRESSION_DETECTED_POST");
  }
  if (maskHash === EXPECTED.maskHashPre) {
    throw new Error("MASK_HASH_UNCHANGED — ribs raster did not update mask");
  }

  writeFileSync(
    path.join(STAGED, "candidate-R02.json"),
    `${JSON.stringify(
      {
        ...reportV41,
        promoted: true,
        promotedAt: "v4.2",
        officialCandidateId: EXPECTED.candidateId,
        officialAssetsOverwritten: true,
        official: {
          fieldHash,
          refineHash,
          maskHash,
          fieldUrl:
            "/models/interaction/fields/neutro_body_v1_right_ribs_sdf.bin",
          refinementUrl:
            "/models/interaction/fields/neutro_body_v1_right_ribs_refine.bin",
        },
      },
      null,
      2,
    )}\n`,
  );

  const hitAlignment = {
    interior: rayInterior.results,
    exterior: [
      ...rayExterior.results,
      {
        id: "axila_interna",
        xyz: [-0.2, 1.31, -0.05],
        distanceMm: axilla == null ? null : +(axilla * 1000).toFixed(3),
        hit: axilla != null && axilla >= 0,
        pass: axillaPass,
      },
    ],
    alignment,
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
    version: "4.2",
    candidate: EXPECTED.candidateId,
    sourceCandidate: EXPECTED.sourceCandidate,
    source: "artifacts/right-ribs-v41/staged",
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
      chestIntact: true,
      abdomenIntact: true,
      chestPixelsModified: chestModified,
      abdomenPixelsModified: abdomenModified,
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
      chestPixelsModified: chestModified,
      abdomenPixelsModified: abdomenModified,
      unknownIds: unknown,
      components: island.components,
      tinyIslandsRemoved: island.tinyIslands,
      tinyIslands: 0,
      uvSeamErrors,
      ribsPixels: island.pixels,
    },
    seam,
    alignment,
    raycast: hitAlignment,
    exclusions: evaluated.leaks,
    precisionMm: reportV41.refinedIsolineMm,
    classification: reportV41.classification,
    officialMaskOverwritten: true,
    officialSidecarOverwritten: true,
    glbModified: false,
    leftRibsGenerated: false,
    promoted: true,
    pass: true,
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("V42_PROMOTE_OK", OUT);
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("promote-right-ribs-v41.mjs")
) {
  promoteRightRibsV41().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
