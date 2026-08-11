/**
 * Promote costal-margin ribs (V4.5) without destroying later field entries.
 *
 * - Copies staged right (and optional left) ribs GDF → official bins
 * - Patches region_fields.json entries in place
 * - Re-rasters ribs mask; liberated old-ribs pixels → flank indices
 *
 *   node tools/body-regions/promote-ribs-costal-v45.mjs
 *   node tools/body-regions/promote-ribs-costal-v45.mjs --side=right
 *   node tools/body-regions/promote-ribs-costal-v45.mjs --side=left
 *   node tools/body-regions/promote-ribs-costal-v45.mjs --side=both
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
  buildRibsV41Context,
  evaluateRibsV41,
  R02,
  L01,
  ribsV41SignedDistance,
} from "./ribs-v41-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const RUNTIME_MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const PALETTE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_region_palette.json",
);
const BUNDLED_MASK = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const VISUAL_ASSETS = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionVisualAssets.json",
);
const OUT = path.join(ROOT, "artifacts/ribs-costal-v45");

const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;
const LEFT_RIBS = 12;
const RIGHT_RIBS = 13;
const LEFT_FLANK = 10;
const RIGHT_FLANK = 54;

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

async function readIndexedMask(pngPath) {
  const { data, info } = await sharp(pngPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) {
    // Some builds store R as index in RGB — take red channel.
    const indexed = Buffer.alloc(info.width * info.height);
    for (let i = 0; i < indexed.length; i++) indexed[i] = data[i * info.channels];
    return { mask: indexed, w: info.width, h: info.height };
  }
  return { mask: Buffer.from(data), w: info.width, h: info.height };
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
  for (let c = 1; c < comps.length; c++) {
    for (const i of comps[c]) mask[i] = 0;
  }
  return { pixels: keep.size, components: keep.size ? 1 : 0 };
}

function rasterizeRibs(mesh, atlas, values, baseMask, w, h, ribsIndex, xSign) {
  const out = Buffer.from(baseMask);
  const oldRibs = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === ribsIndex) {
      oldRibs[i] = 1;
      out[i] = 0;
    }
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

  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    if (values[vi] <= 0) continue;
    const u = UV[vi * 2];
    const v = UV[vi * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    stamp(px, py, xSign * P[vi * 3], 6);
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
    const lat = (xSign * (pts[0][0] + pts[1][0] + pts[2][0])) / 3;
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

  const flankIndex = ribsIndex === RIGHT_RIBS ? RIGHT_FLANK : LEFT_FLANK;
  let ribsPx = 0;
  let flankPx = 0;
  for (let i = 0; i < out.length; i++) {
    if (coverage[i] > 0.5) {
      if (out[i] === 0 || out[i] === ribsIndex || out[i] === flankIndex) {
        out[i] = ribsIndex;
        ribsPx++;
      }
    } else if (oldRibs[i]) {
      // Liberated costal→waist band becomes public flank (costado).
      if (out[i] === 0 || out[i] === ribsIndex) {
        out[i] = flankIndex;
        flankPx++;
      }
    }
  }
  return { mask: out, ribsPx, flankPx };
}

function patchFieldEntry(manifest, regionId, patch) {
  const idx = manifest.fields.findIndex((f) => f.regionId === regionId);
  if (idx < 0) throw new Error(`MISSING_FIELD_ENTRY:${regionId}`);
  manifest.fields[idx] = { ...manifest.fields[idx], ...patch };
}

async function promoteSide(side) {
  const isRight = side === "right";
  const stagedDir = path.join(
    ROOT,
    isRight ? "artifacts/right-ribs-v41/staged" : "artifacts/left-ribs-v43/approved",
  );
  const reportPath = path.join(
    ROOT,
    isRight ? "artifacts/right-ribs-v41/report.json" : "artifacts/left-ribs-v43/report.json",
  );
  const cand = isRight ? "R02" : "L01";
  const regionId = isRight ? "right_ribs" : "left_ribs";
  const ribsIndex = isRight ? RIGHT_RIBS : LEFT_RIBS;
  const fieldName = `neutro_body_v1_${regionId}_sdf.bin`;
  const refineName = `neutro_body_v1_${regionId}_refine.bin`;
  const stagedField = path.join(
    stagedDir,
    isRight
      ? `neutro_body_v1_right_ribs_sdf_${cand}.bin`
      : `neutro_body_v1_left_ribs_sdf_${cand}.bin`,
  );
  const stagedRefine = path.join(
    stagedDir,
    isRight
      ? `neutro_body_v1_right_ribs_refine_${cand}.bin`
      : `neutro_body_v1_left_ribs_refine_${cand}.bin`,
  );

  if (!existsSync(stagedField) || !existsSync(stagedRefine)) {
    throw new Error(`MISSING_STAGED:${side} ${stagedField}`);
  }
  if (!existsSync(reportPath)) throw new Error(`MISSING_REPORT:${reportPath}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!report.pass) throw new Error(`REPORT_NOT_PASS:${side}`);

  const fieldBuf = readFileSync(stagedField);
  const refineBuf = readFileSync(stagedRefine);
  const fieldHash = sha16(fieldBuf);
  const refineHash = sha16(refineBuf);

  copyFileSync(stagedField, path.join(FIELDS_DIR, fieldName));
  copyFileSync(stagedRefine, path.join(FIELDS_DIR, refineName));

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const params = isRight ? R02 : L01;
  patchFieldEntry(manifest, regionId, {
    fieldHash,
    candidateId: isRight ? "V4.5" : "L02",
    sourceCandidateId: cand,
    anatomicalParameters: {
      posteriorCoverage: params.posteriorCoverage,
      costalClearance: params.costalClearance,
      uRibsSlices: 96,
    },
    refinement: {
      ...(manifest.fields.find((f) => f.regionId === regionId)?.refinement ?? {}),
      url: `/models/interaction/fields/${refineName}`,
      hash: refineHash,
      triangleCount: Math.floor(refineBuf.byteLength / 10),
      bandMeters: 0.005,
      encoding: "u32-snorm16x3",
    },
  });
  // Ensure flank placeholders exist for loaders (field optional until flank bake).
  for (const flank of [
    {
      regionId: "right_flank",
      surfaceRegionId: "right_flank_region",
      maskIndex: RIGHT_FLANK,
    },
    {
      regionId: "left_flank",
      surfaceRegionId: "left_flank_region",
      maskIndex: LEFT_FLANK,
    },
  ]) {
    if (!manifest.fields.some((f) => f.regionId === flank.regionId)) {
      manifest.fields.push({
        ...flank,
        visualRegionId: flank.surfaceRegionId.replace("_region", "_surface"),
        geometryHash: manifest.geometryHash,
        indexHash: manifest.indexHash,
        vertexCount: manifest.vertexCount,
        encoding: "categorical-only",
        note: "Costado: categorical mask until dedicated GDF bake",
      });
    }
  }
  manifest.version = "9.1-costal";
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  const ctx = buildRibsV41Context(side, GLB, LANDMARKS);
  const evaluated = evaluateRibsV41(ctx);
  if (!evaluated.pass) {
    throw new Error(`EVAL_FAIL:${side} ${JSON.stringify(evaluated.stages)}`);
  }

  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);
  const chestBefore = Buffer.alloc(w * h);
  const abdBefore = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    chestBefore[i] = baseMask[i] === CHEST_INDEX ? 1 : 0;
    abdBefore[i] = baseMask[i] === ABDOMEN_INDEX ? 1 : 0;
  }

  const fieldValues = decodeSnorm16(fieldBuf, manifest.vertexCount, FIELD_RANGE_M);
  const xSign = isRight ? -1 : 1;
  const { mask: rastered, ribsPx, flankPx } = rasterizeRibs(
    ctx.mesh,
    evaluated.atlas,
    fieldValues,
    baseMask,
    w,
    h,
    ribsIndex,
    xSign,
  );
  keepLargest(rastered, w, h, ribsIndex);
  keepLargest(rastered, w, h, isRight ? RIGHT_FLANK : LEFT_FLANK);

  let chestModified = 0;
  let abdomenModified = 0;
  for (let i = 0; i < w * h; i++) {
    if ((chestBefore[i] === 1) !== (rastered[i] === CHEST_INDEX)) chestModified++;
    if ((abdBefore[i] === 1) !== (rastered[i] === ABDOMEN_INDEX)) abdomenModified++;
  }
  if (chestModified !== 0) throw new Error(`CHEST_PIXELS_MODIFIED=${chestModified}`);
  if (abdomenModified !== 0) {
    throw new Error(`ABDOMEN_PIXELS_MODIFIED=${abdomenModified}`);
  }

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);

  const maskHash = sha12(readFileSync(RUNTIME_MASK));
  const maskManifest = JSON.parse(readFileSync(BUNDLED_MASK, "utf8"));
  maskManifest.maskHash = maskHash;
  maskManifest.maskUrl = `${maskManifest.maskTexture}?v=${maskHash}`;
  if (!maskManifest.regions.left_flank_region) {
    maskManifest.regions.left_flank_region = { maskIndex: LEFT_FLANK };
  }
  if (!maskManifest.regions.right_flank_region) {
    maskManifest.regions.right_flank_region = { maskIndex: RIGHT_FLANK };
  }
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);

  if (existsSync(RUNTIME_MASK_JSON)) {
    const runtimeJson = JSON.parse(readFileSync(RUNTIME_MASK_JSON, "utf8"));
    runtimeJson.maskHash = maskHash;
    writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(runtimeJson, null, 2)}\n`);
  }

  // Authoring paint: ribs + flank colors
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const ribsKey = isRight ? "right_ribs_region" : "left_ribs_region";
  const flankKey = isRight ? "right_flank_region" : "left_flank_region";
  const ribsRgb = parseHex(palette.regions[ribsKey].authoringColor);
  const flankRgb = parseHex(palette.regions[flankKey].authoringColor);
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
    if (rastered[i] === ribsIndex) {
      auth[o] = ribsRgb[0];
      auth[o + 1] = ribsRgb[1];
      auth[o + 2] = ribsRgb[2];
      auth[o + 3] = 255;
    } else if (rastered[i] === (isRight ? RIGHT_FLANK : LEFT_FLANK)) {
      auth[o] = flankRgb[0];
      auth[o + 1] = flankRgb[1];
      auth[o + 2] = flankRgb[2];
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

  return {
    side,
    fieldHash,
    refineHash,
    maskHash,
    ribsPx,
    flankPx,
    positives: report.classification?.positives,
    yEndpoints: report.endpoints?.points,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const arg = process.argv.find((a) => a.startsWith("--side="));
  const side = arg ? arg.slice("--side=".length) : "right";
  const sides =
    side === "both" ? ["right", "left"] : side === "left" ? ["left"] : ["right"];

  const results = [];
  for (const s of sides) {
    console.log(`PROMOTE_COSTAL ${s}…`);
    results.push(await promoteSide(s));
  }
  writeFileSync(
    path.join(OUT, "report.json"),
    `${JSON.stringify({ version: "4.5-costal", results }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
