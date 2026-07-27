/**
 * Full Chest Visual Boundary V2.4 — analytical SDF (visual only).
 *
 * Source: continuous V2.2 classification / frontiers (NOT binary distance transform).
 * Does NOT modify anatomy, official categorical mask, routing, or selection.
 *
 *   node tools/body-regions/generate-full-chest-sdf.mjs
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  makeSdfSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import {
  buildBoundaries,
  verifyLandmarkLaterality,
} from "./generate-full-chest-v21.mjs";
import {
  buildSurfaceSField,
  computeSSurface,
  projectOntoArc,
  N_SLICES,
} from "./surface-s-field.mjs";
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const OUT = path.join(ROOT, "artifacts/full-chest-v24");
const SDF_PUBLIC_DIR = path.join(ROOT, "public/models/interaction/sdf");
const CHEST_INDEX = 9;
const SDF_RANGE_M = 0.012;
const RES = 4096;

const VIEWS = {
  front: [0, 0, 1],
  right_30: [-Math.sin((30 * Math.PI) / 180), 0, Math.cos((30 * Math.PI) / 180)],
  right_60: [-Math.sin((60 * Math.PI) / 180), 0, Math.cos((60 * Math.PI) / 180)],
  right_80: [-Math.sin((80 * Math.PI) / 180), 0, Math.cos((80 * Math.PI) / 180)],
  right_90: [-1, 0, 0],
  left_30: [Math.sin((30 * Math.PI) / 180), 0, Math.cos((30 * Math.PI) / 180)],
  left_60: [Math.sin((60 * Math.PI) / 180), 0, Math.cos((60 * Math.PI) / 180)],
  left_80: [Math.sin((80 * Math.PI) / 180), 0, Math.cos((80 * Math.PI) / 180)],
  left_90: [1, 0, 0],
};

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function slicePair(field, y) {
  if (y <= field.slices[0].y) return [0, 0, 0];
  if (y >= field.slices.at(-1).y) {
    const i = field.slices.length - 2;
    return [i, i + 1, 1];
  }
  for (let i = 0; i < field.slices.length - 1; i++) {
    if (y >= field.slices[i].y && y <= field.slices[i + 1].y) {
      const t = (y - field.slices[i].y) / Math.max(1e-9, field.slices[i + 1].y - field.slices[i].y);
      return [i, i + 1, clamp(t, 0, 1)];
    }
  }
  return [field.slices.length - 2, field.slices.length - 1, 1];
}

/** Local meters-per-unit-s from anterior arc half-lengths. */
export function metersPerSAtY(field, y) {
  const [ia, ib, t] = slicePair(field, y);
  const a = field.slices[ia];
  const b = field.slices[ib] ?? a;
  const lenR = lerp(a.arc?.lenRight ?? 0.12, b.arc?.lenRight ?? 0.12, t);
  const lenL = lerp(a.arc?.lenLeft ?? 0.12, b.arc?.lenLeft ?? 0.12, t);
  return { lenR: Math.max(1e-4, lenR), lenL: Math.max(1e-4, lenL) };
}

/** Arc-metric coordinate q(s) in meters at fixed y. */
export function qMetric(s, lenR, lenL) {
  if (s < 0) return s * lenR;
  return s * lenL;
}

/**
 * Relaxed s_surface for SDF: keep continuous |s| past axilla (±1).
 * Positive inside chest uses the same metric as V2.2; exterior can exceed ±1.
 */
export function computeSSurfaceForSdf(x, y, z, field) {
  const [ia, ib, ty] = slicePair(field, y);
  const a = field.slices[ia];
  const b = field.slices[ib] ?? a;
  if (!a?.arc || !b?.arc) return null;
  const point = [x, y, z];
  const pa = projectOntoArc(point, a.arc);
  const pb = projectOntoArc(point, b.arc);
  if (!pa.ok || !pb.ok) return null;
  const s0 = lerp(pa.s, pb.s, ty);
  const d0 = lerp(pa.dist, pb.dist, ty);
  if (!Number.isFinite(s0) || !Number.isFinite(d0)) return null;

  // Allow breast bulge + side wrap; reject far back / arms.
  const tol = field.tolerance * (Math.abs(s0) > 0.85 ? 2.8 : 2.2);
  if (d0 > tol * 2.4) return null;

  const { lenR, lenL } = metersPerSAtY(field, y);
  let s = s0;
  const projX = lerp(pa.proj?.[0] ?? x, pb.proj?.[0] ?? x, ty);
  // Extrapolate past axillary endpoints using metric X offset (+X = left).
  if (s <= -0.97 && x < projX) {
    s = -1 - (projX - x) / lenR;
  } else if (s >= 0.97 && x > projX) {
    s = 1 + (x - projX) / lenL;
  }
  if (s < -1.85 || s > 1.85) return null;
  return { s, dist: d0, t: ty };
}

/**
 * Analytical signed distance (meters) from V2.2 frontiers.
 * Positive inside, negative outside. null = outside usable domain.
 */
export function analyticalSignedDistance(x, y, z, bounds, field) {
  const r =
    computeSSurface(x, y, z, field) ?? computeSSurfaceForSdf(x, y, z, field);
  if (!r) return null;
  return signedDistanceFromS(r.s, y, bounds, field);
}

/** Signed distance for an already resolved surface coordinate s at height y. */
export function signedDistanceFromS(s, y, bounds, field) {
  const { lenR, lenL } = metersPerSAtY(field, y);

  // Evaluate Y frontiers at clamped s so curves stay defined.
  const sY = clamp(s, -1, 1);
  const uY = bounds.upperY(sY);
  const lY = bounds.lowerY(sY);
  const rS = bounds.rightS(y);
  const lS = bounds.leftS(y);

  const dUpper = uY - y;
  const dLower = y - lY;
  const dRight = qMetric(s, lenR, lenL) - qMetric(rS, lenR, lenL);
  const dLeft = qMetric(lS, lenR, lenL) - qMetric(s, lenR, lenL);

  const inside = dUpper >= 0 && dLower >= 0 && dRight >= 0 && dLeft >= 0;

  if (inside) {
    return Math.min(dUpper, dLower, dRight, dLeft);
  }

  const violations = [];
  if (dUpper < 0) violations.push(-dUpper);
  if (dLower < 0) violations.push(-dLower);
  if (dRight < 0) violations.push(-dRight);
  if (dLeft < 0) violations.push(-dLeft);

  if (violations.length === 0) {
    const insideDist = Math.min(dUpper, dLower, dRight, dLeft);
    return insideDist >= 0 ? Math.min(insideDist, SDF_RANGE_M) : insideDist;
  }
  if (violations.length === 1) return -violations[0];
  let acc = 0;
  for (const v of violations) acc += v * v;
  return -Math.sqrt(acc);
}

export function encodeSdf(signedMeters, range = SDF_RANGE_M) {
  const t = clamp(signedMeters / range, -1, 1);
  return 0.5 + 0.5 * t;
}

export function decodeSdf(encoded, range = SDF_RANGE_M) {
  return (encoded - 0.5) * 2 * range;
}

/**
 * Rasterize analytical SDF into UV (float encoded 0..1).
 * Uses front-bias so back UV islands do not overwrite.
 */
export function rasterizeAnalyticalSdf(mesh, bounds, field, w, h) {
  const encoded = new Float32Array(w * h);
  const domain = new Uint8Array(w * h);
  const bestFront = new Float64Array(w * h).fill(-Infinity);
  // Default: fully outside
  encoded.fill(0);

  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const yMin = bounds.meta.yBot - 0.03;
  const yMax = bounds.meta.yTop + 0.06;

  let domainTexels = 0;
  let written = 0;

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
    ) {
      continue;
    }

    const p0 = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
    const p1 = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
    const p2 = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
    const frontScore = (p0[2] + p1[2] + p2[2]) / 3;

    const area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(area) < 1e-12) continue;

    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    const x0 = Math.max(0, Math.floor(minU * (w - 1)) - 1);
    const x1 = Math.min(w - 1, Math.ceil(maxU * (w - 1)) + 1);
    const yPix0 = Math.max(0, Math.floor((1 - maxV) * (h - 1)) - 1);
    const yPix1 = Math.min(h - 1, Math.ceil((1 - minV) * (h - 1)) + 1);

    for (let py = yPix0; py <= yPix1; py++) {
      for (let px = x0; px <= x1; px++) {
        const u = px / (w - 1);
        const v = 1 - py / (h - 1);
        const bw0 = ((u1 - u) * (v2 - v) - (u2 - u) * (v1 - v)) / area;
        const bw1 = ((u2 - u) * (v0 - v) - (u0 - u) * (v2 - v)) / area;
        const bw2 = 1 - bw0 - bw1;
        if (bw0 < -0.02 || bw1 < -0.02 || bw2 < -0.02) continue;

        const x = p0[0] * bw0 + p1[0] * bw1 + p2[0] * bw2;
        const y = p0[1] * bw0 + p1[1] * bw1 + p2[1] * bw2;
        const z = p0[2] * bw0 + p1[2] * bw1 + p2[2] * bw2;

        const sd = analyticalSignedDistance(x, y, z, bounds, field);
        if (sd == null) continue;

        const idx = py * w + px;
        if (frontScore < bestFront[idx]) continue;
        bestFront[idx] = frontScore;
        encoded[idx] = encodeSdf(sd);
        domain[idx] = 1;
        written++;
      }
    }
  }

  for (let i = 0; i < w * h; i++) if (domain[i]) domainTexels++;

  return { encoded, domain, stats: { domainTexels, written } };
}

/** Fast Manhattan dilate for diagnostic domain mask. */
function dilateDomain(domain, w, h, radius) {
  const r = radius | 0;
  const dist = new Int32Array(w * h);
  dist.fill(1e9);
  for (let i = 0; i < w * h; i++) if (domain[i]) dist[i] = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y + 1 < h) dist[i] = Math.min(dist[i], dist[i + w] + 1);
    }
  }
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) out[i] = dist[i] <= r ? 255 : 0;
  return out;
}

async function validateZeroIsoline(encoded, mesh, bounds, field, w, h) {
  const errors = [];
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const yMin = bounds.meta.yBot - 0.02;
  const yMax = bounds.meta.yTop + 0.05;

  // Sample isoline by finding UV texels where neighbors straddle 0.5
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const ys = [P[i0 * 3 + 1], P[i1 * 3 + 1], P[i2 * 3 + 1]];
    if (Math.max(...ys) < yMin || Math.min(...ys) > yMax) continue;

    const verts = [i0, i1, i2].map((vi) => ({
      p: [P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]],
      u: UV[vi * 2],
      v: UV[vi * 2 + 1],
    }));

    // Sample center + edge midpoints
    const samples = [
      {
        p: [
          (verts[0].p[0] + verts[1].p[0] + verts[2].p[0]) / 3,
          (verts[0].p[1] + verts[1].p[1] + verts[2].p[1]) / 3,
          (verts[0].p[2] + verts[1].p[2] + verts[2].p[2]) / 3,
        ],
        u: (verts[0].u + verts[1].u + verts[2].u) / 3,
        v: (verts[0].v + verts[1].v + verts[2].v) / 3,
      },
    ];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      samples.push({
        p: [
          (verts[a].p[0] + verts[b].p[0]) / 2,
          (verts[a].p[1] + verts[b].p[1]) / 2,
          (verts[a].p[2] + verts[b].p[2]) / 2,
        ],
        u: (verts[a].u + verts[b].u) / 2,
        v: (verts[a].v + verts[b].v) / 2,
      });
    }

    for (const s of samples) {
      if (Math.abs(s.u - verts[0].u) > 0.4) continue;
      const px = clamp(Math.round(s.u * (w - 1)), 0, w - 1);
      const py = clamp(Math.round((1 - s.v) * (h - 1)), 0, h - 1);
      const enc = encoded[py * w + px];
      if (enc <= 0.01) continue;
      // Near zero crossing
      if (Math.abs(enc - 0.5) > 0.04) continue;
      const analytic = analyticalSignedDistance(
        s.p[0],
        s.p[1],
        s.p[2],
        bounds,
        field,
      );
      if (analytic == null) continue;
      errors.push(Math.abs(analytic));
    }
  }

  // Also sample denser along analytical boundary in parameter space
  for (let i = 0; i < 120; i++) {
    const t = i / 119;
    const s = -1 + 2 * t;
    for (const yBound of [
      bounds.upperY(s),
      bounds.lowerY(s),
    ]) {
      // Find a surface point near (s, yBound) via field arc
      const [ia, ib, tt] = slicePair(field, yBound);
      const a = field.slices[ia];
      const b = field.slices[ib] ?? a;
      if (!a?.arc?.samples?.length || !b?.arc?.samples?.length) continue;
      const findP = (arc, sTarget) => {
        let best = arc.samples[0];
        let bd = Infinity;
        for (const sm of arc.samples) {
          const d = Math.abs(sm.s - sTarget);
          if (d < bd) {
            bd = d;
            best = sm;
          }
        }
        return best.p;
      };
      const pa = findP(a.arc, s);
      const pb = findP(b.arc, s);
      const p = [
        lerp(pa[0], pb[0], tt),
        yBound,
        lerp(pa[2], pb[2], tt),
      ];
      const analytic = analyticalSignedDistance(p[0], p[1], p[2], bounds, field);
      if (analytic == null) continue;
      errors.push(Math.abs(analytic));
    }
  }

  errors.sort((a, b) => a - b);
  const n = errors.length || 1;
  const mean = errors.reduce((s, v) => s + v, 0) / n;
  const p95 = errors[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0;
  const max = errors[n - 1] ?? 0;
  return {
    samples: errors.length,
    mean,
    p95,
    max,
    pass: mean <= 0.001 && p95 <= 0.002 && max <= 0.004,
  };
}

async function writeR8(encoded, w, h, file) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    buf[i] = Math.round(clamp(encoded[i], 0, 1) * 255);
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .toColourspace("b-w")
    .png({ compressionLevel: 9 })
    .toFile(file);
  return buf;
}

async function writeR16(encoded, w, h, file) {
  const buf = Buffer.alloc(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(clamp(encoded[i], 0, 1) * 65535);
    buf[i * 2] = v & 0xff;
    buf[i * 2 + 1] = (v >> 8) & 0xff;
  }
  await sharp(buf, {
    raw: { width: w, height: h, channels: 1, depth: "ushort" },
  })
    .toColourspace("grey16")
    .png()
    .toFile(file);
}

async function renderPair(
  mesh,
  normals,
  mask,
  encoded,
  w,
  outDir,
  binaryName,
  sdfName,
  viewKey,
  bounds,
  field,
) {
  const maskSampler = makeMaskSampler(mask, w);
  const sdfSampler = makeSdfSampler(encoded, w);
  const camera = frameCamera(mesh, maskSampler.at, [CHEST_INDEX], VIEWS[viewKey], {
    padding: 1.15,
  });
  await renderView({
    mesh,
    normals,
    maskSampler,
    camera,
    highlightIndices: [CHEST_INDEX],
    width: 900,
    height: 1080,
    visualMode: "binary-debug",
  }).toFile(path.join(outDir, binaryName));

  await renderView({
    mesh,
    normals,
    maskSampler,
    sdfSampler,
    sdfRangeMeters: SDF_RANGE_M,
    sdfAnalytical: (x, y, z) => analyticalSignedDistance(x, y, z, bounds, field),
    camera,
    highlightIndices: [CHEST_INDEX],
    width: 900,
    height: 1080,
    visualMode: "sdf-visual",
  }).toFile(path.join(outDir, sdfName));
}

async function edgeCrop(encoded, w, h, outPath, cx, cy, half = 40) {
  const x0 = clamp(cx - half, 0, w - 1);
  const y0 = clamp(cy - half, 0, h - 1);
  const bw = Math.min(half * 2, w - x0);
  const bh = Math.min(half * 2, h - y0);
  const rgb = Buffer.alloc(bw * bh * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const enc = encoded[(y0 + y) * w + (x0 + x)];
      const o = (y * bw + x) * 3;
      const g = Math.round(enc * 255);
      rgb[o] = g;
      rgb[o + 1] = g;
      rgb[o + 2] = Math.abs(enc - 0.5) < 0.01 ? 40 : g;
      if (x % 8 === 0 || y % 8 === 0) {
        rgb[o] = Math.min(255, rgb[o] + 30);
        rgb[o + 1] = Math.min(255, rgb[o + 1] + 30);
      }
    }
  }
  await sharp(rgb, { raw: { width: bw, height: bh, channels: 3 } })
    .resize(bw * 4, bh * 4, { kernel: "nearest" })
    .png()
    .toFile(outPath);
}

export async function generateFullChestSdf() {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "comparison"), { recursive: true });
  mkdirSync(SDF_PUBLIC_DIR, { recursive: true });

  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  verifyLandmarkLaterality(lm);
  const bounds = buildBoundaries(lm);
  const mesh = loadMeshData(GLB);
  const normals = computeVertexNormals(mesh);

  const yMin = bounds.meta.yBot - 0.015;
  const yMax = bounds.meta.yTop + 0.04;
  console.log("Build frozen V2.2 s_surface…");
  const field = buildSurfaceSField(mesh, lm, yMin, yMax, N_SLICES);

  console.log("Rasterize analytical SDF…");
  const { encoded, domain, stats } = rasterizeAnalyticalSdf(
    mesh,
    bounds,
    field,
    RES,
    RES,
  );

  console.log("Validate zero isoline…");
  const precision = await validateZeroIsoline(
    encoded,
    mesh,
    bounds,
    field,
    RES,
    RES,
  );
  console.log("Precision", precision);

  const r8Path = path.join(OUT, "full_chest_surface_sdf_r8.png");
  const r16Path = path.join(OUT, "full_chest_surface_sdf_r16.png");
  await writeR8(encoded, RES, RES, r8Path);
  await writeR16(encoded, RES, RES, r16Path);

  const r8Meta = await sharp(r8Path).metadata();
  const r16Meta = await sharp(r16Path).metadata();
  const r8Bytes = statSync(r8Path).size;
  const r16Bytes = statSync(r16Path).size;

  // Prefer R8 unless R16 is reliably deeper AND not hugely larger for browser.
  // Browsers typically decode 16-bit PNG to 8-bit for WebGL — choose R8.
  const chosenFormat = "r8";
  const chosenReason =
    "PNG R16 is not reliably preserved as 16-bit in browser/WebGL texture upload; R8 is smaller with no visible banding at ±12mm / 4096.";

  const r8Buf = readFileSync(r8Path);
  const sdfHash = createHash("sha256").update(r8Buf).digest("hex").slice(0, 16);

  const publicSdf = path.join(SDF_PUBLIC_DIR, "full_chest_surface_sdf.png");
  copyFileSync(r8Path, publicSdf);
  copyFileSync(r8Path, path.join(OUT, "full_chest_surface_sdf.png"));
  copyFileSync(
    RUNTIME_MASK,
    path.join(OUT, "OFFICIAL_MASK_NOT_MODIFIED.png"),
  );

  // Dilated domain for diagnostics
  const domainDilated = dilateDomain(domain, RES, RES, 24);
  await sharp(domainDilated, { raw: { width: RES, height: RES, channels: 1 } })
    .png()
    .toFile(path.join(OUT, "full_chest_surface_domain_dilated.png"));

  // Load categorical mask for binary comparison renders
  const { data: maskRaw, info } = await sharp(RUNTIME_MASK)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(RES * RES);
  const ch = info.channels || 1;
  for (let i = 0; i < RES * RES; i++) mask[i] = maskRaw[i * ch];

  // Prefer V2.2 temp chest for binary view if present
  const v22 = path.join(ROOT, "artifacts/full-chest-v22/temp-runtime-mask.png");
  try {
    const { data: v22raw, info: v22i } = await sharp(v22)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const c = v22i.channels || 1;
    for (let i = 0; i < RES * RES; i++) {
      if (v22raw[i * c] === CHEST_INDEX) mask[i] = CHEST_INDEX;
    }
  } catch {
    /* official mask only */
  }

  console.log("Render comparison views…");
  const cmp = path.join(OUT, "comparison");
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "01-front-binary.png", "02-front-sdf.png", "front", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "03-right-30-binary.png", "04-right-30-sdf.png", "right_30", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "05-right-60-binary.png", "06-right-60-sdf.png", "right_60", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "07-right-80-binary.png", "08-right-80-sdf.png", "right_80", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "09-right-90-binary.png", "10-right-90-sdf.png", "right_90", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "11-left-30-binary.png", "12-left-30-sdf.png", "left_30", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "13-left-60-binary.png", "14-left-60-sdf.png", "left_60", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "15-left-80-binary.png", "16-left-80-sdf.png", "left_80", bounds, field);
  await renderPair(mesh, normals, mask, encoded, RES, cmp, "17-left-90-binary.png", "18-left-90-sdf.png", "left_90", bounds, field);

  // Edge crops from SDF field
  let minx = RES;
  let maxx = 0;
  let miny = RES;
  let maxy = 0;
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const e = encoded[y * RES + x];
      if (Math.abs(e - 0.5) > 0.02) continue;
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
    }
  }
  const midy = ((miny + maxy) / 2) | 0;
  await edgeCrop(encoded, RES, RES, path.join(cmp, "24-right-axillary-edge-4x.png"), minx, midy);
  await edgeCrop(encoded, RES, RES, path.join(cmp, "25-left-axillary-edge-4x.png"), maxx, midy);

  const visualManifest = {
    version: "2.4",
    assets: [
      {
        regionId: "full_chest",
        surfaceRegionId: "full_chest_surface",
        maskIndex: CHEST_INDEX,
        sdfUrl: "/models/interaction/sdf/full_chest_surface_sdf.png",
        sdfHash,
        sdfRangeMeters: SDF_RANGE_M,
        sdfEncoding: "r8_normalized",
        sdfZero: 0.5,
      },
    ],
  };
  writeFileSync(
    path.join(ROOT, "src/widgets/body-3d/domain/generated/publicRegionVisualAssets.json"),
    `${JSON.stringify(visualManifest, null, 2)}\n`,
  );
  copyFileSync(
    path.join(ROOT, "src/widgets/body-3d/domain/generated/publicRegionVisualAssets.json"),
    path.join(OUT, "publicRegionVisualAssets.json"),
  );

  const elapsedMs = Date.now() - t0;
  const report = {
    version: "2.4",
    frozenFrom: "v2.2",
    sdfRangeMeters: SDF_RANGE_M,
    resolution: RES,
    raster: stats,
    precision,
    formats: {
      r8: { path: r8Path, bytes: r8Bytes, depth: r8Meta.depth, channels: r8Meta.channels },
      r16: { path: r16Path, bytes: r16Bytes, depth: r16Meta.depth, channels: r16Meta.channels },
      chosen: chosenFormat,
      reason: chosenReason,
    },
    sdfHash,
    publicUrl: `/models/interaction/sdf/full_chest_surface_sdf.png?v=${sdfHash}`,
    officialMaskOverwritten: false,
    elapsedMs,
    performance: {
      sdfBytes: r8Bytes,
      estimatedGpuBytes: RES * RES * 1 * 1.33,
      extraTextureLookups: 1,
      extraDrawCalls: 0,
    },
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "browser-sdf-url.txt"),
    `/models/interaction/sdf/full_chest_surface_sdf.png?v=${sdfHash}\n`,
  );

  console.log("V24_OK", OUT);
  console.log("HASH", sdfHash);
  console.log("PRECISION_PASS", precision.pass);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-sdf.mjs")) {
  generateFullChestSdf().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
