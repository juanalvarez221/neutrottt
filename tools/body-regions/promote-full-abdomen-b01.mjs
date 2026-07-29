/**
 * Promote Full Abdomen B01 → official assets (V3.3).
 *
 * Source: artifacts/full-abdomen-v32/approved/ (frozen). Does not recalculate
 * anatomy. Does not overwrite backups. Does not commit. Does not touch C07.
 *
 *   node tools/body-regions/promote-full-abdomen-b01.mjs
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
import { analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import {
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";
import {
  buildAbdomenV31CandidateGrid,
  buildV31Context,
  evaluateAbdomenV31Candidate,
  measureSharedSeamDistance,
  OFFICIAL_CHEST_HASHES,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v31.mjs";
import { loadMeshData } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPROVED = path.join(ROOT, "artifacts/full-abdomen-v32/approved");
const REPORT_V32 = path.join(ROOT, "artifacts/full-abdomen-v32/report.json");
const SHARED_SEAM = path.join(
  ROOT,
  "artifacts/full-abdomen-v31/shared-chest-abdomen-seam.json",
);
const OUT = path.join(ROOT, "artifacts/full-abdomen-v33");
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
const FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_full_abdomen_sdf.bin");
const REFINE_BIN = path.join(
  FIELDS_DIR,
  "neutro_body_v1_full_abdomen_refine.bin",
);
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");

const ABDOMEN_INDEX = 11;
const CHEST_INDEX = 9;

const EXPECTED = {
  candidate: "B01",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  pubicClearance: 0.014,
  inguinalSideRise: 0.01,
  fieldHash: "30a41c0dcc820ab0",
  refineHash: "e624d3f9ecc9d40a",
  meanMm: 0.324,
  p95Mm: 1.49,
  maxMm: 3.555,
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
 * Rasterize B01 abdomen into the categorical mask.
 * Clears only ABDOMEN_INDEX. Never mutates CHEST_INDEX or other foreign IDs.
 */
function rasterizeAbdomenOfficial(mesh, bounds, field, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === ABDOMEN_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Float32Array(w * h);
  const bestFront = new Float64Array(w * h).fill(-Infinity);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const pts = [ia, ib, ic].map((vi) => [
      P[vi * 3],
      P[vi * 3 + 1],
      P[vi * 3 + 2],
      UV[vi * 2],
      UV[vi * 2 + 1],
    ]);
    const front = (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
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
        const d = analyticalSignedDistance(x, y, z, bounds, field);
        if (d == null || d <= 0) continue;
        const idx = py * w + px;
        if (front < bestFront[idx]) continue;
        bestFront[idx] = front;
        coverage[idx] = 1;
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (coverage[i] <= 0.5) continue;
    // Never overwrite chest or other foreign IDs.
    if (out[i] !== 0 && out[i] !== ABDOMEN_INDEX) continue;
    out[i] = ABDOMEN_INDEX;
  }
  return out;
}

function sampleMaskFieldAlignment(mesh, mask, w, h, values, opts = {}) {
  const band = opts.band ?? 0.002;
  const wantInterior = opts.interior ?? 5000;
  const wantExterior = opts.exterior ?? 5000;
  const UV = mesh.uvs;
  const I = mesh.indices;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;
  const bary = [
    [0.25, 0.25],
    [0.5, 0.25],
    [0.25, 0.5],
    [0.34, 0.34],
    [0.6, 0.2],
    [0.2, 0.6],
    [0.15, 0.15],
    [0.7, 0.15],
    [0.15, 0.7],
  ];
  // 2px neighbourhood ≈ categorical analogue of the ±2 mm field band on 4k UVs.
  const ambiguousUv = (px, py, radius = 2) => {
    const center = mask[py * w + px];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = mask[ny * w + nx];
        const cAbd = center === ABDOMEN_INDEX;
        const nAbd = n === ABDOMEN_INDEX;
        if (cAbd !== nAbd) return true;
      }
    }
    return false;
  };
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (interior >= wantInterior && exterior >= wantExterior) break;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const u0 = UV[a * 2];
    const v0 = UV[a * 2 + 1];
    const u1 = UV[b * 2];
    const v1 = UV[b * 2 + 1];
    const u2 = UV[c * 2];
    const v2 = UV[c * 2 + 1];
    if (
      Math.abs(u0 - u1) > 0.55 ||
      Math.abs(u1 - u2) > 0.55 ||
      Math.abs(u2 - u0) > 0.55
    ) {
      continue;
    }
    for (const [bu, bv] of bary) {
      const bw = 1 - bu - bv;
      const fieldValue = values[a] * bw + values[b] * bu + values[c] * bv;
      if (Math.abs(fieldValue) <= band) continue;
      const u = u0 * bw + u1 * bu + u2 * bv;
      const v = v0 * bw + v1 * bu + v2 * bv;
      const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
      if (ambiguousUv(px, py)) continue;
      const maskInside = mask[py * w + px] === ABDOMEN_INDEX;
      if (fieldValue > band) {
        if (interior >= wantInterior) continue;
        interior++;
        if (!maskInside) interiorMismatch++;
      } else {
        if (exterior >= wantExterior) continue;
        exterior++;
        if (maskInside) exteriorMismatch++;
      }
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

async function countAbdomenUvSeamErrors(mask, w, h) {
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
    const hasAbd = ids.some((id) => id === ABDOMEN_INDEX);
    if (!hasAbd) continue;
    const first = ids[0];
    if (ids.some((id) => id !== first)) mismatches++;
  }
  return mismatches;
}

function assertChestFrozenOrThrow() {
  const fieldBin = readFileSync(CHEST_FIELD_BIN);
  const refineBin = readFileSync(CHEST_REFINE_BIN);
  const regionFields = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = regionFields.fields.find((f) => f.regionId === "full_chest");
  const ok =
    sha16(fieldBin) === OFFICIAL_CHEST_HASHES.fieldHash &&
    sha16(refineBin) === OFFICIAL_CHEST_HASHES.refinementHash &&
    chestEntry?.fieldHash === OFFICIAL_CHEST_HASHES.fieldHash &&
    chestEntry?.refinement?.hash === OFFICIAL_CHEST_HASHES.refinementHash &&
    chestEntry?.candidateId === "C07";
  if (!ok) {
    throw new Error("FULL_CHEST_REGRESSION_DETECTED");
  }
  return {
    maskHashPreAbdomen: OFFICIAL_CHEST_HASHES.maskHash,
    fieldHash: sha16(fieldBin),
    refinementHash: sha16(refineBin),
    candidateId: "C07",
    intact: true,
    chestEntrySnapshot: structuredClone(chestEntry),
  };
}

export async function promoteFullAbdomenB01() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS, { recursive: true });

  // --- §1 freeze chest (pre) ---
  const chestPre = assertChestFrozenOrThrow();
  console.log("CHEST_FROZEN_PRE", chestPre.fieldHash, chestPre.refinementHash);

  // --- §2 verify source B01 ---
  const candidate = JSON.parse(
    readFileSync(path.join(APPROVED, "candidate.json"), "utf8"),
  );
  const reportV32 = JSON.parse(readFileSync(REPORT_V32, "utf8"));
  const fieldSrc = path.join(
    APPROVED,
    "neutro_body_v1_full_abdomen_sdf_B01.bin",
  );
  const refineSrc = path.join(
    APPROVED,
    "neutro_body_v1_full_abdomen_refine_B01.bin",
  );
  if (!existsSync(fieldSrc) || !existsSync(refineSrc)) {
    throw new Error("B01_PROMOTION_SOURCE_MISMATCH: missing approved binaries");
  }
  if (!existsSync(SHARED_SEAM)) {
    throw new Error("B01_PROMOTION_SOURCE_MISMATCH: missing shared seam");
  }
  const fieldBuf = readFileSync(fieldSrc);
  const refineBuf = readFileSync(refineSrc);
  const fieldHash = sha16(fieldBuf);
  const refineHash = sha16(refineBuf);
  const params = candidate.params;
  const b01Report = reportV32.candidates?.find((c) => c.id === "B01");
  const alignB01 = reportV32.alignments?.B01;
  const ok =
    candidate.candidateId === EXPECTED.candidate &&
    params.pubicClearance === EXPECTED.pubicClearance &&
    params.inguinalSideRise === EXPECTED.inguinalSideRise &&
    reportV32.identity?.geometryHash === EXPECTED.geometryHash &&
    reportV32.identity?.indexHash === EXPECTED.indexHash &&
    reportV32.identity?.vertexCount === EXPECTED.vertexCount &&
    fieldHash === EXPECTED.fieldHash &&
    refineHash === EXPECTED.refineHash &&
    candidate.staged?.fieldHash === EXPECTED.fieldHash &&
    candidate.staged?.refineHash === EXPECTED.refineHash &&
    round(b01Report?.refinedIsolineMm?.mean, 3) === EXPECTED.meanMm &&
    round(b01Report?.refinedIsolineMm?.p95, 2) === EXPECTED.p95Mm &&
    round(b01Report?.refinedIsolineMm?.max, 3) === EXPECTED.maxMm &&
    alignB01?.interiorMismatch === 0 &&
    alignB01?.exteriorMismatch === 0 &&
    reportV32.visualSelection?.chosen === "B01";
  if (!ok) {
    throw new Error(
      `B01_PROMOTION_SOURCE_MISMATCH: ${JSON.stringify({
        candidateId: candidate.candidateId,
        params,
        identity: reportV32.identity,
        fieldHash,
        refineHash,
        precision: b01Report?.refinedIsolineMm,
        alignB01,
        chosen: reportV32.visualSelection?.chosen,
      })}`,
    );
  }
  console.log("SOURCE_OK B01");

  // --- §3 backups (never overwrite) ---
  backupIfPresent(AUTHORING, "neutro_body_v1_anatomical_regions_authoring.png");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");
  backupIfPresent(FIELD_BIN, "neutro_body_v1_full_abdomen_sdf.bin");
  backupIfPresent(REFINE_BIN, "neutro_body_v1_full_abdomen_refine.bin");

  // --- §4 promote geometry field (no isoline JSON — runtime uses refine.bin) ---
  copyFileSync(fieldSrc, FIELD_BIN);
  copyFileSync(refineSrc, REFINE_BIN);
  const refineTriangleCount = Math.floor(refineBuf.byteLength / 10);

  const previousManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chestEntry = previousManifest.fields.find(
    (f) => f.regionId === "full_chest",
  );
  if (!chestEntry) throw new Error("FULL_CHEST_REGRESSION_DETECTED: missing chest entry");
  // Bit-identical C07 entry: reuse the previous object verbatim.
  const officialManifest = {
    model: "neutro_body_v1",
    version: "3.3",
    geometryHash: EXPECTED.geometryHash,
    indexHash: EXPECTED.indexHash,
    vertexCount: EXPECTED.vertexCount,
    indexCount: previousManifest.indexCount,
    fields: [
      chestEntry,
      {
        regionId: "full_abdomen",
        visualRegionId: "full_abdomen_surface",
        surfaceRegionId: "full_abdomen_region",
        maskIndex: ABDOMEN_INDEX,
        geometryHash: EXPECTED.geometryHash,
        indexHash: EXPECTED.indexHash,
        vertexCount: EXPECTED.vertexCount,
        fieldUrl:
          "/models/interaction/fields/neutro_body_v1_full_abdomen_sdf.bin",
        fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        candidateId: "B01",
        anatomicalParameters: {
          pubicClearance: EXPECTED.pubicClearance,
          inguinalSideRise: EXPECTED.inguinalSideRise,
        },
        sharedBoundary: "full_chest",
        refinement: {
          url: "/models/interaction/fields/neutro_body_v1_full_abdomen_refine.bin",
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

  // --- §5 rebuild B01 frontiers (frozen params) + categorical mask ---
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const b01params = buildAbdomenV31CandidateGrid().find((c) => c.id === "B01");
  if (!b01params) {
    throw new Error("B01_PROMOTION_SOURCE_MISMATCH: grid missing B01");
  }
  const evaluated = evaluateAbdomenV31Candidate(ctx, b01params);
  if (evaluated.region.components !== 1) {
    throw new Error(
      `B01_PROMOTION_SOURCE_MISMATCH: components=${evaluated.region.components}`,
    );
  }
  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);
  // Snapshot chest pixels for bit-identity after abdomen rewrite.
  const chestBefore = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    chestBefore[i] = baseMask[i] === CHEST_INDEX ? 1 : 0;
  }

  console.log("Rasterize B01 categorical…");
  const rastered = rasterizeAbdomenOfficial(
    ctx.mesh,
    evaluated.bounds,
    ctx.field,
    baseMask,
    w,
    h,
  );
  const island = keepLargest(rastered, w, h, ABDOMEN_INDEX);

  let foreignModified = 0;
  let chestModified = 0;
  for (let i = 0; i < w * h; i++) {
    const before = baseMask[i];
    const after = rastered[i];
    if (before !== ABDOMEN_INDEX && after !== ABDOMEN_INDEX && before !== after) {
      foreignModified++;
    }
    const chestWas = chestBefore[i] === 1;
    const chestIs = after === CHEST_INDEX;
    if (chestWas !== chestIs) chestModified++;
  }
  if (foreignModified !== 0) {
    throw new Error(`FOREIGN_IDS_MODIFIED=${foreignModified}`);
  }
  if (chestModified !== 0) {
    throw new Error(`FULL_CHEST_REGRESSION_DETECTED: chest pixels=${chestModified}`);
  }

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);
  copyFileSync(
    RUNTIME_MASK,
    path.join(OUT, "neutro_body_v1_anatomical_region_ids.png"),
  );

  // Sync authoring: clear prior abdomen paint, stamp B01 abdomen RGB.
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const abdRgb = parseHex(palette.regions.full_abdomen_region.authoringColor);
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
    const wasAbd = isNear(rgb, abdRgb);
    if (rastered[i] === ABDOMEN_INDEX) {
      auth[o] = abdRgb[0];
      auth[o + 1] = abdRgb[1];
      auth[o + 2] = abdRgb[2];
      auth[o + 3] = 255;
    } else if (wasAbd) {
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

  // Quantize authoring → unknown IDs must stay 0.
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

  // Prefer adaptive raster as official runtime.
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
    promotedCandidates: ["C07", "B01"],
  };
  writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(maskManifest, null, 2)}\n`);
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);

  writeFileSync(
    VISUAL_ASSETS,
    `${JSON.stringify(
      {
        version: "3.3",
        note: "SDF UV retired for full_chest and full_abdomen. Visual authority is the Geometry Distance Field sidecar.",
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
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log("MASK_PROMOTED", maskHash, "abdomenPx", island.pixels);

  // --- §6 seam + field–mask alignment + exclusions ---
  const values = decodeSnorm16(fieldBuf, EXPECTED.vertexCount, FIELD_RANGE_M);
  const alignment = sampleMaskFieldAlignment(ctx.mesh, rastered, w, h, values, {
    interior: 5000,
    exterior: 5000,
  });
  const analyticAlign = sampleAbdomenFieldAlignment(
    ctx.mesh,
    evaluated.bounds,
    ctx.field,
    values,
    { interior: 5000, exterior: 5000, band: 0.002 },
  );
  const sharedDist = measureSharedSeamDistance(
    ctx.mesh,
    values,
    evaluated.refinement,
    ctx.sharedSeam,
  );
  const uvSeamErrors = await countAbdomenUvSeamErrors(rastered, w, h);

  console.log("ALIGNMENT", alignment);
  console.log("SEAM", {
    mean: sharedDist.mean,
    p95: sharedDist.p95,
    max: sharedDist.max,
    gap: sharedDist.gap,
    overlap: sharedDist.overlap,
  });

  if (alignment.interiorMismatch !== 0 || alignment.exteriorMismatch !== 0) {
    throw new Error(
      `HIT_ALIGNMENT_FAIL interior=${alignment.interiorMismatch} exterior=${alignment.exteriorMismatch}`,
    );
  }
  if (analyticAlign.interiorMismatch !== 0 || analyticAlign.exteriorMismatch !== 0) {
    throw new Error(
      `ANALYTIC_ALIGNMENT_FAIL interior=${analyticAlign.interiorMismatch} exterior=${analyticAlign.exteriorMismatch}`,
    );
  }
  if (island.components !== 1) {
    throw new Error(
      `MASK_INTEGRITY_FAIL components=${island.components}`,
    );
  }
  // keepLargest already cleared stray islands; remaining must be zero.
  if (island.tinyIslands > 0) {
    console.log(
      "TINY_ISLANDS_CLEARED",
      island.tinyIslands,
      "removedPx",
      island.removed,
    );
  }
  // Confirm single component remains after cleanup.
  {
    const verify = keepLargest(Buffer.from(rastered), w, h, ABDOMEN_INDEX);
    if (verify.rawComponents !== 1 || verify.tinyIslands !== 0) {
      throw new Error(
        `MASK_INTEGRITY_FAIL remainingComponents=${verify.rawComponents} tiny=${verify.tinyIslands}`,
      );
    }
  }
  if (uvSeamErrors !== 0) {
    throw new Error(`UV_SEAM_ERRORS=${uvSeamErrors}`);
  }
  if (
    sharedDist.mean !== 0 ||
    sharedDist.p95 !== 0 ||
    sharedDist.max > 0.0001 ||
    sharedDist.gap !== 0 ||
    sharedDist.overlap !== 0
  ) {
    throw new Error(
      `SEAM_FAIL mean=${sharedDist.mean} p95=${sharedDist.p95} max=${sharedDist.max} gap=${sharedDist.gap} overlap=${sharedDist.overlap}`,
    );
  }
  for (const [k, v] of Object.entries(evaluated.leaksBefore)) {
    if (v !== 0) throw new Error(`EXCLUSION_POSITIVES ${k}=${v}`);
  }

  // --- §7 post chest freeze ---
  const chestPostField = sha16(readFileSync(CHEST_FIELD_BIN));
  const chestPostRefine = sha16(readFileSync(CHEST_REFINE_BIN));
  const postManifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const postChest = postManifest.fields.find((f) => f.regionId === "full_chest");
  if (
    chestPostField !== OFFICIAL_CHEST_HASHES.fieldHash ||
    chestPostRefine !== OFFICIAL_CHEST_HASHES.refinementHash ||
    JSON.stringify(postChest) !== JSON.stringify(chestPre.chestEntrySnapshot)
  ) {
    throw new Error("FULL_CHEST_REGRESSION_DETECTED");
  }
  // Mask hash MUST change (abdomen rewrite); chest field hashes must not.
  if (maskHash === OFFICIAL_CHEST_HASHES.maskHash) {
    console.warn(
      "NOTE: maskHash unchanged — abdomen raster identical to prior mask",
    );
  }

  // Mark approved candidate as promoted (artifact only).
  writeFileSync(
    path.join(APPROVED, "candidate.json"),
    `${JSON.stringify(
      {
        ...candidate,
        promoted: true,
        promotedAt: "v3.3",
        officialAssetsOverwritten: true,
        official: {
          fieldHash,
          refineHash,
          maskHash,
          fieldUrl:
            "/models/interaction/fields/neutro_body_v1_full_abdomen_sdf.bin",
          refinementUrl:
            "/models/interaction/fields/neutro_body_v1_full_abdomen_refine.bin",
        },
      },
      null,
      2,
    )}\n`,
  );

  const report = {
    version: "3.3",
    candidate: "B01",
    source: "artifacts/full-abdomen-v32/approved",
    identity: {
      geometryHash: EXPECTED.geometryHash,
      indexHash: EXPECTED.indexHash,
      vertexCount: EXPECTED.vertexCount,
    },
    parameters: {
      pubicClearance: EXPECTED.pubicClearance,
      inguinalSideRise: EXPECTED.inguinalSideRise,
    },
    chestRegression: {
      maskHashPreAbdomen: chestPre.maskHashPreAbdomen,
      fieldHash: chestPostField,
      refinementHash: chestPostRefine,
      candidateId: "C07",
      intact: true,
      chestEntryUnchanged: true,
      chestPixelsModified: chestModified,
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
      unknownIds: unknown,
      components: island.components,
      tinyIslandsRemoved: island.tinyIslands,
      tinyIslands: 0,
      uvSeamErrors,
      abdomenPixels: island.pixels,
    },
    seam: {
      mean: sharedDist.mean,
      p95: sharedDist.p95,
      max: sharedDist.max,
      gap: sharedDist.gap,
      overlap: sharedDist.overlap,
      points: sharedDist.n,
      pass: sharedDist.pass,
    },
    alignment,
    analyticAlignment: {
      interior: analyticAlign.interior,
      exterior: analyticAlign.exterior,
      interiorMismatch: analyticAlign.interiorMismatch,
      exteriorMismatch: analyticAlign.exteriorMismatch,
    },
    exclusions: evaluated.leaksBefore,
    precisionMm: b01Report.refinedIsolineMm,
    officialMaskOverwritten: true,
    officialSidecarOverwritten: true,
    glbModified: false,
    promoted: true,
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("V33_PROMOTE_OK", OUT);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/promote-full-abdomen-b01.mjs")) {
  promoteFullAbdomenB01().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
