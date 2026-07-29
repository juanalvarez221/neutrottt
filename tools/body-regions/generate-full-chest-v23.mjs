/**
 * Full Chest Generator V2.3 — Stage C adaptive raster + visual edge coverage.
 *
 * Freezes V2.2 anatomy (A/B). Improves UV edge via:
 *   - adaptive 16-sample coverage (>=0.5) near analytical borders
 *   - offline binary-debug vs final-visual renders
 *   - browser shader sampleRegionCoverage (IDs never interpolated)
 *
 * Does NOT overwrite official masks. No commit/push/merge.
 *
 *   node tools/body-regions/generate-full-chest-v23.mjs
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import {
  buildBoundaries,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import { classifyPointV22 } from "./generate-full-chest-v22.mjs";
import {
  buildSurfaceSField,
  computeSSurface,
  N_SLICES,
} from "./surface-s-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const V22_MASK = path.join(ROOT, "artifacts/full-chest-v22/temp-runtime-mask.png");
const OUT = path.join(ROOT, "artifacts/full-chest-v23");
const CHEST_INDEX = 9;
const COVERAGE_THRESHOLD = 0.5;
const EDGE_MARGIN_S = 0.07;
const EDGE_MARGIN_Y = 0.006;

const VIEWS = {
  front: [0, 0, 1],
  front_right: [-0.5, 0, 0.866],
  front_left: [0.5, 0, 0.866],
  right: [-1, 0, 0],
  left: [1, 0, 0],
};

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function nearAnalyticalBorder(x, y, z, bounds, field) {
  const r = computeSSurface(x, y, z, field);
  if (!r) return { near: false, inside: false, s: null };
  const s = r.s;
  const inside =
    s >= bounds.rightS(y) &&
    s <= bounds.leftS(y) &&
    y >= bounds.lowerY(s) &&
    y <= bounds.upperY(s);
  const near =
    Math.abs(y - bounds.upperY(s)) <= EDGE_MARGIN_Y ||
    Math.abs(y - bounds.lowerY(s)) <= EDGE_MARGIN_Y ||
    Math.abs(s - bounds.rightS(y)) <= EDGE_MARGIN_S ||
    Math.abs(s - bounds.leftS(y)) <= EDGE_MARGIN_S;
  return { near, inside, s };
}

function makeSubpixelOffsets(n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push([(i + 0.5) / n, (j + 0.5) / n]);
    }
  }
  return out;
}

const OFFSETS_1 = [[0.5, 0.5]];
const OFFSETS_16 = makeSubpixelOffsets(4);

/**
 * Adaptive Stage C raster. Far from border: 1 sample. Near border: 16 samples,
 * coverage >= 0.5. Stores diagnostic coverage float buffer (not an ID).
 */
export function rasterizeAdaptive(mesh, bounds, field, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < w * h; i++) {
    if (out[i] === CHEST_INDEX) out[i] = 0;
  }
  const coverageDiag = new Float32Array(w * h);
  coverageDiag.fill(-1);

  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const yMin = bounds.meta.yBot - 0.02;
  const yMax = bounds.meta.yTop + 0.05;

  let texels16 = 0;
  let texels1 = 0;
  let ambiguous = 0;

  const bestFront = new Float64Array(w * h).fill(-Infinity);
  const bestCov = new Float32Array(w * h).fill(-1);

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const y0 = P[i0 * 3 + 1];
    const y1 = P[i1 * 3 + 1];
    const y2 = P[i2 * 3 + 1];
    if (Math.max(y0, y1, y2) < yMin || Math.min(y0, y1, y2) > yMax) continue;

    const u0 = UV[i0 * 2];
    const v0 = UV[i0 * 2 + 1];
    const u1 = UV[i1 * 2];
    const v1 = UV[i1 * 2 + 1];
    const u2 = UV[i2 * 2];
    const v2 = UV[i2 * 2 + 1];
    if (
      Math.abs(u0 - u1) > 0.55 ||
      Math.abs(u1 - u2) > 0.55 ||
      Math.abs(u2 - u0) > 0.55
    )
      continue;

    const p0 = [P[i0 * 3], y0, P[i0 * 3 + 2]];
    const p1 = [P[i1 * 3], y1, P[i1 * 3 + 2]];
    const p2 = [P[i2 * 3], y2, P[i2 * 3 + 2]];
    const frontScore = (p0[2] + p1[2] + p2[2]) / 3;
    if (frontScore < -0.12) continue;

    const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(area) < 1e-12) continue;

    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    const x0p = Math.max(0, Math.floor(minU * (w - 1)));
    const x1p = Math.min(w - 1, Math.ceil(maxU * (w - 1)));
    const y0p = Math.max(0, Math.floor((1 - maxV) * (h - 1)));
    const y1p = Math.min(h - 1, Math.ceil((1 - minV) * (h - 1)));

    for (let py = y0p; py <= y1p; py++) {
      for (let px = x0p; px <= x1p; px++) {
        // Center probe for interior/exterior + border proximity
        const uc = (px + 0.5) / (w - 1);
        const vc = 1 - (py + 0.5) / (h - 1);
        const w0c = ((u1 - uc) * (v2 - vc) - (u2 - uc) * (v1 - vc)) / area;
        const w1c = ((u2 - uc) * (v0 - vc) - (u0 - uc) * (v2 - vc)) / area;
        const w2c = 1 - w0c - w1c;
        if (w0c < -0.02 || w1c < -0.02 || w2c < -0.02) continue;

        const xc = p0[0] * w0c + p1[0] * w1c + p2[0] * w2c;
        const yc = p0[1] * w0c + p1[1] * w1c + p2[1] * w2c;
        const zc = p0[2] * w0c + p1[2] * w1c + p2[2] * w2c;
        const prox = nearAnalyticalBorder(xc, yc, zc, bounds, field);

        const offsets = prox.near ? OFFSETS_16 : OFFSETS_1;
        let inside = 0;
        let hits = 0;
        for (const [ox, oy] of offsets) {
          const u = (px + ox) / (w - 1);
          const v = 1 - (py + oy) / (h - 1);
          const bw0 = ((u1 - u) * (v2 - v) - (u2 - u) * (v1 - v)) / area;
          const bw1 = ((u2 - u) * (v0 - v) - (u0 - u) * (v2 - v)) / area;
          const bw2 = 1 - bw0 - bw1;
          if (bw0 < -0.02 || bw1 < -0.02 || bw2 < -0.02) continue;
          inside++;
          const x = p0[0] * bw0 + p1[0] * bw1 + p2[0] * bw2;
          const y = p0[1] * bw0 + p1[1] * bw1 + p2[1] * bw2;
          const z = p0[2] * bw0 + p1[2] * bw1 + p2[2] * bw2;
          if (classifyPointV22(x, y, z, bounds, field)) hits++;
        }
        if (inside === 0) continue;
        const cov = hits / inside;
        const idx = py * w + px;
        if (prox.near) texels16++;
        else texels1++;
        if (inside > 1 && hits > 0 && hits < inside) ambiguous++;

        if (frontScore >= bestFront[idx]) {
          bestFront[idx] = frontScore;
          bestCov[idx] = cov;
        }
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (bestCov[i] < 0) continue;
    coverageDiag[i] = bestCov[i];
    if (bestCov[i] >= COVERAGE_THRESHOLD) out[i] = CHEST_INDEX;
  }

  return {
    mask: out,
    coverageDiag,
    stats: { texels16, texels1, ambiguous, threshold: COVERAGE_THRESHOLD },
  };
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
  for (const c of comps.slice(1)) {
    for (const i of c) {
      mask[i] = 0;
      removed++;
    }
  }
  return {
    components: keep.size ? 1 : 0,
    rawComponents: comps.length,
    removed,
    pixels: keep.size,
    tinyIslands: comps.filter((c, i) => i > 0 && c.length < 64).length,
  };
}

function compareMasks(a, b) {
  let inter = 0;
  let uni = 0;
  let added = 0;
  let removed = 0;
  for (let i = 0; i < a.length; i++) {
    const aa = a[i] === CHEST_INDEX;
    const bb = b[i] === CHEST_INDEX;
    if (aa || bb) uni++;
    if (aa && bb) inter++;
    if (!aa && bb) added++;
    if (aa && !bb) removed++;
  }
  return {
    iou: uni ? inter / uni : 1,
    added,
    removed,
    intersection: inter,
    union: uni,
  };
}

function meanBoundaryShiftUv(a, b, w, h) {
  // For each edge texel in a, distance to nearest edge in b (in texels)
  const isEdge = (mask, i) => {
    if (mask[i] !== CHEST_INDEX) return false;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
      if (mask[ny * w + nx] !== CHEST_INDEX) return true;
    }
    return false;
  };
  const edgesB = [];
  for (let i = 0; i < w * h; i++) {
    if (isEdge(b, i)) edgesB.push([i % w, (i / w) | 0]);
  }
  if (!edgesB.length) return 0;
  // Sample subset for speed
  const dists = [];
  for (let i = 0; i < w * h; i += 17) {
    if (!isEdge(a, i)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let best = Infinity;
    for (const [bx, by] of edgesB) {
      const d = Math.hypot(x - bx, y - by);
      if (d < best) best = d;
      if (best === 0) break;
    }
    dists.push(best);
  }
  if (!dists.length) return 0;
  return dists.reduce((s, d) => s + d, 0) / dists.length;
}

function edgeMetrics(mask, w, h) {
  // Rough stair metric: count axis-aligned runs on contour
  let stairs = 0;
  let abrupt = 0;
  let edgeLen = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] !== CHEST_INDEX) continue;
      const n =
        (mask[i - 1] !== CHEST_INDEX ? 1 : 0) +
        (mask[i + 1] !== CHEST_INDEX ? 1 : 0) +
        (mask[i - w] !== CHEST_INDEX ? 1 : 0) +
        (mask[i + w] !== CHEST_INDEX ? 1 : 0);
      if (n === 0) continue;
      edgeLen++;
      if (n >= 2) abrupt++;
      // corner step: both horizontal and vertical open
      if (
        (mask[i - 1] !== CHEST_INDEX || mask[i + 1] !== CHEST_INDEX) &&
        (mask[i - w] !== CHEST_INDEX || mask[i + w] !== CHEST_INDEX)
      ) {
        stairs++;
      }
    }
  }
  return { edgeLen, stairs, abrupt };
}

async function renderPair(mesh, normals, mask, w, outDir, fileBinary, fileFinal, viewKey) {
  const sampler = makeMaskSampler(mask, w);
  const camera = frameCamera(mesh, sampler.at, [CHEST_INDEX], VIEWS[viewKey], {
    padding: 1.2,
  });
  await renderView({
    mesh,
    normals,
    maskSampler: sampler,
    camera,
    highlightIndices: [CHEST_INDEX],
    width: 960,
    height: 1200,
    visualMode: "binary-debug",
  }).toFile(path.join(outDir, fileBinary));
  await renderView({
    mesh,
    normals,
    maskSampler: sampler,
    camera,
    highlightIndices: [CHEST_INDEX],
    width: 960,
    height: 1200,
    visualMode: "final-visual",
  }).toFile(path.join(outDir, fileFinal));
}

async function renderEdgeDiagnostics(mask, coverage, w, h, outDir) {
  mkdirSync(outDir, { recursive: true });
  // Find chest bbox
  let minx = w;
  let maxx = 0;
  let miny = h;
  let maxy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== CHEST_INDEX) continue;
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
    }
  }
  const mid = ((minx + maxx) / 2) | 0;
  const crops = [
    ["01-right-axillary-edge-8x.png", minx, ((miny + maxy) / 2) | 0],
    ["02-left-axillary-edge-8x.png", maxx, ((miny + maxy) / 2) | 0],
    ["03-right-imf-edge-8x.png", ((minx + mid) / 2) | 0, maxy],
    ["04-left-imf-edge-8x.png", ((mid + maxx) / 2) | 0, maxy],
    ["05-upper-edge-8x.png", mid, miny],
  ];
  const half = 48;
  for (const [name, cx, cy] of crops) {
    const x0 = clamp(cx - half, 0, w - 1);
    const y0 = clamp(cy - half, 0, h - 1);
    const bw = Math.min(half * 2, w - x0);
    const bh = Math.min(half * 2, h - y0);
    const rgb = Buffer.alloc(bw * bh * 3);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const sx = x0 + x;
        const sy = y0 + y;
        const i = sy * w + sx;
        const o = (y * bw + x) * 3;
        const id = mask[i];
        const cov = coverage[i];
        // grid
        const grid = x % 8 === 0 || y % 8 === 0;
        if (id === CHEST_INDEX) {
          rgb[o] = 229;
          rgb[o + 1] = 57;
          rgb[o + 2] = 53;
        } else if (cov >= 0) {
          const g = Math.round(40 + cov * 180);
          rgb[o] = g;
          rgb[o + 1] = g;
          rgb[o + 2] = 80;
        } else {
          rgb[o] = rgb[o + 1] = rgb[o + 2] = 18;
        }
        if (grid) {
          rgb[o] = Math.min(255, rgb[o] + 35);
          rgb[o + 1] = Math.min(255, rgb[o + 1] + 35);
          rgb[o + 2] = Math.min(255, rgb[o + 2] + 35);
        }
        // edge outline
        if (id === CHEST_INDEX) {
          const edge =
            (sx > 0 && mask[i - 1] !== CHEST_INDEX) ||
            (sx < w - 1 && mask[i + 1] !== CHEST_INDEX) ||
            (sy > 0 && mask[i - w] !== CHEST_INDEX) ||
            (sy < h - 1 && mask[i + w] !== CHEST_INDEX);
          if (edge) {
            rgb[o] = 255;
            rgb[o + 1] = 220;
            rgb[o + 2] = 40;
          }
        }
      }
    }
    await sharp(rgb, { raw: { width: bw, height: bh, channels: 3 } })
      .resize(bw * 8, bh * 8, { kernel: "nearest" })
      .png()
      .toFile(path.join(outDir, name));
  }
}

export async function generateFullChestV23() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "diagnostic"), { recursive: true });
  mkdirSync(path.join(OUT, "comparison"), { recursive: true });

  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  verifyLandmarkLaterality(lm);
  const bounds = buildBoundaries(lm);
  const mesh = loadMeshData(GLB);
  const normals = computeVertexNormals(mesh);

  const yMin = bounds.meta.yBot - 0.015;
  const yMax = bounds.meta.yTop + 0.04;
  console.log("Rebuild s_surface (frozen V2.2 params)…");
  const field = buildSurfaceSField(mesh, lm, yMin, yMax, N_SLICES);

  const { data: v22raw, info } = await sharp(V22_MASK)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels || 1;
  const v22 = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) v22[i] = v22raw[i * ch];

  // Base: copy non-chest from official runtime via V22 (already a full mask)
  const base = Buffer.from(v22);

  console.log("Adaptive Stage C raster…");
  const { mask, coverageDiag, stats } = rasterizeAdaptive(
    mesh,
    bounds,
    field,
    base,
    w,
    h,
  );
  // Preserve non-chest IDs from V2.2 outside chest writes
  for (let i = 0; i < w * h; i++) {
    if (mask[i] === CHEST_INDEX) continue;
    if (v22[i] !== CHEST_INDEX && v22[i] !== 0) mask[i] = v22[i];
  }
  const island = keepLargest(mask, w, h, CHEST_INDEX);
  const cmp = compareMasks(v22, mask);
  const shift = meanBoundaryShiftUv(v22, mask, w, h);
  const edges = edgeMetrics(mask, w, h);

  console.log("IoU", cmp.iou, "shift", shift, "adaptive", stats);

  const hash = createHash("sha256").update(mask).digest("hex").slice(0, 16);
  await sharp(mask, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toFile(path.join(OUT, "temp-runtime-mask.png"));
  await sharp(mask, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toFile(path.join(OUT, "temp-authoring-mask.png"));
  copyFileSync(
    path.join(ROOT, "public/models/interaction/neutro_body_v1_anatomical_region_ids.png"),
    path.join(OUT, "OFFICIAL_MASK_NOT_MODIFIED.png"),
  );

  // Diagnostic coverage PNG (grayscale float→byte)
  {
    const covRgb = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) {
      const c = coverageDiag[i];
      covRgb[i] = c < 0 ? 0 : Math.round(clamp(c, 0, 1) * 255);
    }
    await sharp(covRgb, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toFile(path.join(OUT, "diagnostic/coverage-map.png"));
  }
  await renderEdgeDiagnostics(mask, coverageDiag, w, h, path.join(OUT, "diagnostic"));

  console.log("Comparison binary/final…");
  const cmpDir = path.join(OUT, "comparison");
  await renderPair(mesh, normals, mask, w, cmpDir, "01-front-binary.png", "02-front-final.png", "front");
  await renderPair(mesh, normals, mask, w, cmpDir, "03-front-right-binary.png", "04-front-right-final.png", "front_right");
  await renderPair(mesh, normals, mask, w, cmpDir, "05-front-left-binary.png", "06-front-left-final.png", "front_left");
  await renderPair(mesh, normals, mask, w, cmpDir, "07-right-binary.png", "08-right-final.png", "right");
  await renderPair(mesh, normals, mask, w, cmpDir, "09-left-binary.png", "10-left-final.png", "left");

  // Public temp URL for browser (not official)
  const publicTemp = path.join(
    ROOT,
    "public/models/interaction/full_chest_v23_temp.png",
  );
  copyFileSync(path.join(OUT, "temp-runtime-mask.png"), publicTemp);
  writeFileSync(
    path.join(OUT, "browser-mask-url.txt"),
    `/models/interaction/full_chest_v23_temp.png?v=${hash}\n`,
  );

  const report = {
    version: "2.3",
    frozenFrom: "v2.2",
    adaptive: stats,
    island,
    compareV22: { ...cmp, meanBoundaryShiftTexels: shift },
    edgeMetrics: edges,
    diagnosis: {
      primaryCause: "UV texel discretization + previous 3/4 inward bias + offline soft membership",
      uvResolution: "4096 — stair amplitude ~1 texel; visible on grazing laterals",
      subpixelVote: "replaced 3/4 with adaptive 16-sample coverage>=0.5",
      offlineRenderer: "binary-debug vs final-visual coverage AA",
      browserShader: "sampleRegionCoverage / sampleLutCoverage (bilinear membership + fwidth)",
    },
    outputHash: hash,
    officialMaskOverwritten: false,
    browserMaskUrl: `/models/interaction/full_chest_v23_temp.png?v=${hash}`,
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("V23_OK", OUT);
  console.log("HASH", hash);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-v23.mjs")) {
  generateFullChestV23().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
