/**
 * Write temporary L01 categorical mask PNG for Playwright (artifacts only).
 *
 *   node tools/body-regions/write-left-ribs-v43-temp-mask.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  assertOfficialTorsoRegionsFrozen,
  buildRibsV41Context,
  evaluateRibsV41,
  L01,
  ribsV41SignedDistance,
} from "./ribs-v41-core.mjs";
import { getRibsSideConfig } from "./ribs-side.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OFFICIAL_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const OUT = path.join(ROOT, "artifacts/left-ribs-v43/temp");
const LEFT_INDEX = getRibsSideConfig("left").maskIndex;
const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;
const RIGHT_INDEX = 13;

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

function keepLargest(mask, w, h, index) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (mask[start] !== index || seen[start]) continue;
      const stack = [start];
      const cells = [];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop();
        cells.push(i);
        const cx = i % w;
        const cy = (i / w) | 0;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || mask[ni] !== index) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      comps.push(cells);
    }
  }
  comps.sort((a, b) => b.length - a.length);
  let removed = 0;
  for (let c = 1; c < comps.length; c++) {
    for (const i of comps[c]) {
      mask[i] = 0;
      removed++;
    }
  }
  return { removedPixels: removed, removedIslands: Math.max(0, comps.length - 1) };
}

function previewLeftRibsCategorical(mesh, atlas, values, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === LEFT_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Uint8Array(w * h);
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

  for (let i = 0; i < out.length; i++) {
    if (!coverage[i]) continue;
    if (out[i] !== 0 && out[i] !== LEFT_INDEX) continue;
    out[i] = LEFT_INDEX;
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const freeze = assertOfficialTorsoRegionsFrozen();
const ctx = buildRibsV41Context("left", GLB, LANDMARKS, {
  freeze,
  params: L01,
});
const result = evaluateRibsV41(ctx);
const { mask: baseMask, w, h } = await readIndexedMask(OFFICIAL_MASK);
const preview = previewLeftRibsCategorical(
  ctx.mesh,
  result.atlas,
  result.values,
  baseMask,
  w,
  h,
);
keepLargest(preview, w, h, LEFT_INDEX);
const outFile = path.join(
  OUT,
  "neutro_body_v1_anatomical_region_ids_left_preview.png",
);
await sharp(preview, { raw: { width: w, height: h, channels: 1 } })
  .png()
  .toFile(outFile);
writeFileSync(
  path.join(OUT, "temp-mask-meta.json"),
  `${JSON.stringify(
    {
      officialMaskUntouched: true,
      path: outFile,
      leftIndex: LEFT_INDEX,
      preservedChest: CHEST_INDEX,
      preservedAbdomen: ABDOMEN_INDEX,
      preservedRightRibs: RIGHT_INDEX,
    },
    null,
    2,
  )}\n`,
);
console.log("TEMP_MASK_WRITTEN", outFile);
