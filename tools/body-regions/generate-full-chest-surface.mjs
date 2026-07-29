/**
 * Generate full_chest_surface from production GLB + landmarks.
 *
 * Anatomical closed Catmull-Rom contour → BVH nearest-surface projection →
 * dense geodesic densify → (theta,y) PIP → per-texel UV rasterization.
 *
 *   node tools/body-regions/generate-full-chest-surface.mjs
 *
 * Also invoked by generate-full-chest-surface.py under Blender headless.
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

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");
const PALETTE = path.join(ROOT, "assets/body-regions/neutro_body_v1_region_palette.json");
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const BACKUPS = path.join(ROOT, "assets/body-regions/backups");
const OUT_DIR = path.join(ROOT, "artifacts/full-chest-code-generation");
const CHEST_HEX = ["#E53935", "#D81B60", "#C62828"];

const VIEWS = {
  front: [0, 0, 1],
  front_right_30: [-0.5, 0, 0.866],
  front_left_30: [0.5, 0, 0.866],
  right: [-1, 0, 0],
  left: [1, 0, 0],
};

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function colorNear(a, b, tol = 12) {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}

function vadd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vscale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function vlen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function vdot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function vnorm(a) {
  const L = vlen(a) || 1;
  return vscale(a, 1 / L);
}
function vlerp(a, b, t) {
  return vadd(vscale(a, 1 - t), vscale(b, t));
}

function axisZAt(y, samples) {
  if (!samples?.length) return -0.08;
  const ys = samples.map((s) => s.y);
  const zs = samples.map((s) => s.z);
  if (y <= ys[0]) return zs[0];
  if (y >= ys.at(-1)) return zs.at(-1);
  for (let i = 0; i < ys.length - 1; i++) {
    if (y >= ys[i] && y <= ys[i + 1]) {
      const t = (y - ys[i]) / Math.max(1e-6, ys[i + 1] - ys[i]);
      return zs[i] * (1 - t) + zs[i + 1] * t;
    }
  }
  return zs.at(-1);
}

function thetaOf(p, axisSamples) {
  const axz = axisZAt(p[1], axisSamples);
  return (Math.atan2(p[0], Math.max(0.008, p[2] - axz)) * 180) / Math.PI;
}

/** Uniform Catmull-Rom (tension τ ∈ [0,1], 0.5 ≈ centripetal-ish). */
function catmullRom(p0, p1, p2, p3, t, tau) {
  const t2 = t * t;
  const t3 = t2 * t;
  const s = (1 - tau) / 2;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a0 = p0[i];
    const a1 = p1[i];
    const a2 = p2[i];
    const a3 = p3[i];
    out[i] =
      a1 +
      s * (-a0 + a2) * t +
      (2 * s * a0 + (s - 3) * a1 + (3 - 2 * s) * a2 - s * a3) * t2 +
      (-s * a0 + (2 - s) * a1 + (s - 2) * a2 + s * a3) * t3;
  }
  return out;
}

function sampleClosedCatmullRom(controls, samplesPerSeg, tau) {
  const n = controls.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = controls[(i - 1 + n) % n];
    const p1 = controls[i];
    const p2 = controls[(i + 1) % n];
    const p3 = controls[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      out.push(catmullRom(p0, p1, p2, p3, t, tau));
    }
  }
  return out;
}

/** Uniform grid BVH-ish nearest point on triangle soup. */
function buildSpatialIndex(mesh, cell = 0.04) {
  const P = mesh.positions;
  const I = mesh.indices;
  const triCount = mesh.triangleCount;
  const grid = new Map();
  const key = (ix, iy, iz) => `${ix},${iy},${iz}`;
  const boxes = new Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const ax = P[i0 * 3];
    const ay = P[i0 * 3 + 1];
    const az = P[i0 * 3 + 2];
    const bx = P[i1 * 3];
    const by = P[i1 * 3 + 1];
    const bz = P[i1 * 3 + 2];
    const cx = P[i2 * 3];
    const cy = P[i2 * 3 + 1];
    const cz = P[i2 * 3 + 2];
    const minX = Math.min(ax, bx, cx);
    const minY = Math.min(ay, by, cy);
    const minZ = Math.min(az, bz, cz);
    const maxX = Math.max(ax, bx, cx);
    const maxY = Math.max(ay, by, cy);
    const maxZ = Math.max(az, bz, cz);
    boxes[t] = { minX, minY, minZ, maxX, maxY, maxZ };
    const x0 = Math.floor(minX / cell);
    const y0 = Math.floor(minY / cell);
    const z0 = Math.floor(minZ / cell);
    const x1 = Math.floor(maxX / cell);
    const y1 = Math.floor(maxY / cell);
    const z1 = Math.floor(maxZ / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = key(ix, iy, iz);
          let arr = grid.get(k);
          if (!arr) {
            arr = [];
            grid.set(k, arr);
          }
          arr.push(t);
        }
      }
    }
  }
  return { grid, boxes, cell, key, triCount };
}

function closestPointOnTri(p, a, b, c) {
  const ab = vsub(b, a);
  const ac = vsub(c, a);
  const ap = vsub(p, a);
  const d1 = vdot(ab, ap);
  const d2 = vdot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = vsub(p, b);
  const d3 = vdot(ab, bp);
  const d4 = vdot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return vadd(a, vscale(ab, v));
  }
  const cp = vsub(p, c);
  const d5 = vdot(ab, cp);
  const d6 = vdot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return vadd(a, vscale(ac, w));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return vadd(b, vscale(vsub(c, b), w));
  }
  const denom = 1 / (va + vb + vc);
  return vadd(a, vadd(vscale(ab, vb * denom), vscale(ac, vc * denom)));
}

function projectToSurface(p, mesh, index) {
  const P = mesh.positions;
  const I = mesh.indices;
  const { grid, cell, key } = index;
  const ix = Math.floor(p[0] / cell);
  const iy = Math.floor(p[1] / cell);
  const iz = Math.floor(p[2] / cell);
  let best = null;
  let bestD = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const tris = grid.get(key(ix + dx, iy + dy, iz + dz));
        if (!tris) continue;
        for (const t of tris) {
          const i0 = I[t * 3];
          const i1 = I[t * 3 + 1];
          const i2 = I[t * 3 + 2];
          const a = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
          const b = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
          const c = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
          const q = closestPointOnTri(p, a, b, c);
          const d = vlen(vsub(q, p));
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
      }
    }
  }
  if (best) return best;
  // Fallback: scan all (rare)
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const a = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
    const b = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
    const c = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
    const q = closestPointOnTri(p, a, b, c);
    const d = vlen(vsub(q, p));
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best ?? p;
}

function densifyProjected(pts, mesh, index, midSamples = 2) {
  if (midSamples <= 0) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    for (let m = 1; m <= midSamples; m++) {
      const t = m / (midSamples + 1);
      out.push(projectToSurface(vlerp(a, b, t), mesh, index));
    }
  }
  return out;
}

function pointInPolyThetaY(th, y, poly) {
  // poly: [{th,y}, ...] closed, winding
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    const thi = poly[i].th;
    const thj = poly[j].th;
    const intersect =
      yi > y !== yj > y &&
      th < ((thj - thi) * (y - yi)) / (yj - yi + 1e-12) + thi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function buildControlPoints(lm, params) {
  const p = lm.points;
  const {
    clavicleDrop,
    centralLift,
    axillaInset,
    sternumTopDrop,
    imfLateralOut,
  } = params;

  const clavR = p.clavicleRight;
  const clavL = p.clavicleLeft;
  const st = p.sternumTop;
  const axR = p.anteriorAxillaryFoldRight;
  const axL = p.anteriorAxillaryFoldLeft;
  const imfLatR = p.inframammaryLateralRight;
  const imfMedR = p.inframammaryMedialRight;
  const imfMedL = p.inframammaryMedialLeft;
  const imfLatL = p.inframammaryLateralLeft;

  const towardCenter = (pt, amount) => {
    const s = Math.sign(pt[0]) || 1;
    return [pt[0] - s * amount, pt[1], pt[2] + amount * 0.2];
  };

  // Inferior: gentle U/soft fold — center ABOVE lateral IMF (no tongue).
  // Extra mid points reduce Catmull-Rom overshoot.
  const imfFloor = Math.min(imfLatR[1], imfLatL[1]);
  const centerY = Math.max(imfMedR[1], imfMedL[1]) + centralLift;
  const medY = Math.max(imfMedR[1], imfFloor + 0.008) + centralLift * 0.35;
  const centerBottom = [
    (imfMedR[0] + imfMedL[0]) * 0.5,
    centerY,
    (imfMedR[2] + imfMedL[2]) * 0.5 + 0.005,
  ];
  const midR = [
    (imfMedR[0] + centerBottom[0]) * 0.5,
    (medY + centerY) * 0.5,
    (imfMedR[2] + centerBottom[2]) * 0.5,
  ];
  const midL = [
    (imfMedL[0] + centerBottom[0]) * 0.5,
    (medY + centerY) * 0.5,
    (imfMedL[2] + centerBottom[2]) * 0.5,
  ];

  // Closed loop clockwise from superior sternum (front view)
  return [
    [st[0], st[1] - sternumTopDrop * 0.35, st[2] + 0.012],
    [clavR[0] * 0.35, clavR[1] - clavicleDrop * 0.55, (clavR[2] + st[2]) * 0.5 + 0.01],
    [clavR[0] * 0.75, clavR[1] - clavicleDrop * 0.85, clavR[2] + 0.008],
    [clavR[0], clavR[1] - clavicleDrop, clavR[2] + 0.006],
    towardCenter(
      [axR[0], axR[1] - 0.01, axR[2]],
      axillaInset,
    ),
    [
      imfLatR[0] - Math.sign(imfLatR[0] || -1) * imfLateralOut,
      Math.max(imfLatR[1], imfFloor),
      imfLatR[2] + 0.004,
    ],
    [imfMedR[0], medY, imfMedR[2] + 0.004],
    midR,
    centerBottom,
    midL,
    [imfMedL[0], medY, imfMedL[2] + 0.004],
    [
      imfLatL[0] - Math.sign(imfLatL[0] || 1) * imfLateralOut,
      Math.max(imfLatL[1], imfFloor),
      imfLatL[2] + 0.004,
    ],
    towardCenter(
      [axL[0], axL[1] - 0.01, axL[2]],
      axillaInset,
    ),
    [clavL[0], clavL[1] - clavicleDrop, clavL[2] + 0.006],
    [clavL[0] * 0.75, clavL[1] - clavicleDrop * 0.85, clavL[2] + 0.008],
    [clavL[0] * 0.35, clavL[1] - clavicleDrop * 0.55, (clavL[2] + st[2]) * 0.5 + 0.01],
  ];
}

/** Prevent CR overshoot into abdomen / neck after projection. */
function sanitizeProjectedCurve(curve, lm) {
  const imfFloor =
    Math.min(
      lm.points.inframammaryLateralLeft[1],
      lm.points.inframammaryLateralRight[1],
    ) - 0.001;
  const clavCeil = lm.levels.infraclavicular - 0.004;
  return curve.map((p) => {
    let y = Math.min(p[1], clavCeil);
    const absX = Math.abs(p[0]);
    // Midline inferior floor slightly above lateral IMF — kills tongue without deep W
    const floor =
      absX < 0.04 ? imfFloor + 0.008 : absX < 0.08 ? imfFloor + 0.003 : imfFloor;
    y = Math.max(y, floor);
    return [p[0], y, p[2]];
  });
}

function contourMetrics(poly3, axisSamples) {
  let peri = 0;
  let turn = 0;
  for (let i = 0; i < poly3.length; i++) {
    const a = poly3[i];
    const b = poly3[(i + 1) % poly3.length];
    const c = poly3[(i + 2) % poly3.length];
    peri += vlen(vsub(b, a));
    const u = vnorm(vsub(b, a));
    const v = vnorm(vsub(c, b));
    turn += Math.acos(Math.max(-1, Math.min(1, vdot(u, v))));
  }
  const ths = poly3.map((p) => thetaOf(p, axisSamples));
  const ys = poly3.map((p) => p[1]);
  const width = Math.max(...ths) - Math.min(...ths);
  const height = Math.max(...ys) - Math.min(...ys);
  // Inferior central concavity: center-bottom y vs lateral IMF-ish samples
  const mid = poly3.reduce(
    (best, p) => (Math.abs(p[0]) < Math.abs(best[0]) && p[1] < best[1] + 0.05 ? p : best),
    poly3[0],
  );
  const lowYs = ys.slice().sort((a, b) => a - b).slice(0, 6);
  const centralLow = mid[1];
  const lateralLow = (lowYs[0] + lowYs[1]) * 0.5;
  const centralConcavity = Math.max(0, lateralLow - centralLow);
  return {
    perimeter: peri,
    meanCurvature: turn / poly3.length,
    widthDeg: width,
    height,
    ratio: width / Math.max(1e-6, height),
    centralConcavity,
  };
}

function scoreVariant(meta, lm) {
  let score = 100;
  // Prefer mild raised center (no tongue); punish deep concavity hard
  score -= Math.abs(meta.centralConcavity - 0.002) * 600;
  if (meta.centralConcavity > 0.012) score -= 50;
  // Prefer higher tension (less CR overshoot)
  score -= Math.abs((meta.params.tension ?? 0.5) - 0.85) * 15;
  score -= Math.abs(meta.params.centralLift - 0.015) * 200;
  score -= Math.abs(meta.params.clavicleDrop - 0.016) * 150;
  score -= Math.abs(meta.symmetryPct) * 4;
  if (Math.abs(meta.symmetryPct) > 3) score -= 20;
  score -= meta.landmarkDist.clavicle * 120;
  score -= meta.landmarkDist.axilla * 100;
  score -= meta.landmarkDist.imf * 100;
  if (meta.pixels < 120000) score -= 30;
  if (meta.pixels > 450000) score -= 15;
  if (meta.metrics.height < 0.12) score -= 25;
  if (meta.metrics.height > 0.28) score -= 15;
  score -= Math.max(0, meta.metrics.meanCurvature - 0.45) * 30;
  void lm;
  return score;
}

function keepLargestComponents(mask, w, h, maxKeep = 2) {
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
      const i = y * w + x;
      if (!mask[i] || seen[i]) continue;
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
          if (seen[ni] || !mask[ni]) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      comps.push(cells);
    }
  }
  comps.sort((a, b) => b.length - a.length);
  const total = comps.reduce((s, c) => s + c.length, 0);
  const keep = new Set();
  let kept = 0;
  for (const c of comps) {
    if (kept < maxKeep && c.length >= Math.max(400, total * 0.04)) {
      for (const i of c) keep.add(i);
      kept++;
    }
  }
  if (!keep.size && comps[0]) for (const i of comps[0]) keep.add(i);
  let removed = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && !keep.has(i)) {
      mask[i] = 0;
      removed++;
    }
  }
  return { componentsBefore: comps.length, kept, removed, sizes: comps.map((c) => c.length).slice(0, 6) };
}

async function rasterizeChest(mesh, polyThetaY, axisSamples, authoringRgb, chestRgb) {
  const { data, info } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.alloc(w * h * 3);
  const clearColors = CHEST_HEX.map(parseHex);

  for (let i = 0; i < w * h; i++) {
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (clearColors.some((c) => colorNear(rgb, c, 14))) {
      out[i * 3] = 0;
      out[i * 3 + 1] = 0;
      out[i * 3 + 2] = 0;
    } else {
      out[i * 3] = rgb[0];
      out[i * 3 + 1] = rgb[1];
      out[i * 3 + 2] = rgb[2];
    }
  }

  const candidate = new Uint8Array(w * h);
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  let areaLAccum = 0;
  let areaRAccum = 0;
  const imfY = polyThetaY.reduce((m, p) => Math.min(m, p.y), Infinity);
  const topY = polyThetaY.reduce((m, p) => Math.max(m, p.y), -Infinity);

  // Per-triangle UV bbox rasterization (texel-accurate, not whole-tri paint)
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    const u0 = UV[i0 * 2];
    const v0 = UV[i0 * 2 + 1];
    const u1 = UV[i1 * 2];
    const v1 = UV[i1 * 2 + 1];
    const u2 = UV[i2 * 2];
    const v2 = UV[i2 * 2 + 1];
    // Skip degenerate / UV-seam spanning triangles (large UV edges)
    const du01 = Math.abs(u0 - u1);
    const du12 = Math.abs(u1 - u2);
    const du20 = Math.abs(u2 - u0);
    if (du01 > 0.55 || du12 > 0.55 || du20 > 0.55) continue;

    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    const x0 = Math.max(0, Math.floor(minU * (w - 1)));
    const x1 = Math.min(w - 1, Math.ceil(maxU * (w - 1)));
    const y0 = Math.max(0, Math.floor((1 - maxV) * (h - 1)));
    const y1 = Math.min(h - 1, Math.ceil((1 - minV) * (h - 1)));

    const p0 = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
    const p1 = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
    const p2 = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];

    const area =
      (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(area) < 1e-12) continue;

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const u = px / (w - 1);
        const v = 1 - py / (h - 1);
        // Barycentric in UV
        const w0 = ((u1 - u) * (v2 - v) - (u2 - u) * (v1 - v)) / area;
        const w1 = ((u2 - u) * (v0 - v) - (u0 - u) * (v2 - v)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
        const x = p0[0] * w0 + p1[0] * w1 + p2[0] * w2;
        const y = p0[1] * w0 + p1[1] * w1 + p2[1] * w2;
        const z = p0[2] * w0 + p1[2] * w1 + p2[2] * w2;
        const axz = axisZAt(y, axisSamples);
        const front = z - axz;
        if (front < -0.012) continue; // back surface exclusion only
        const th = thetaOf([x, y, z], axisSamples);
        let inside = pointInPolyThetaY(th, y, polyThetaY);
        // Sternum corridor: ensure continuous full_chest across UV charts
        if (
          !inside &&
          Math.abs(th) <= 16 &&
          y >= imfY + 0.004 &&
          y <= topY - 0.002 &&
          front > -0.004
        ) {
          inside = true;
        }
        if (!inside) continue;
        candidate[py * w + px] = 1;
        // Track anatomical side for symmetry (runtime +X = left)
        if (x >= 0) areaLAccum++;
        else areaRAccum++;
      }
    }
  }

  const island = keepLargestComponents(candidate, w, h, 2);

  let painted = 0;
  // Overwrite empty + prior chest + abdomen/ribs that fall inside the chest contour.
  // Do not rewrite back / limb / head palette colors.
  const abdomenRgb = parseHex(
    JSON.parse(readFileSync(PALETTE, "utf8")).regions.full_abdomen_region
      .authoringColor,
  );
  const ribL = parseHex(
    JSON.parse(readFileSync(PALETTE, "utf8")).regions.left_ribs_region
      .authoringColor,
  );
  const ribR = parseHex(
    JSON.parse(readFileSync(PALETTE, "utf8")).regions.right_ribs_region
      .authoringColor,
  );
  const overwritable = [...CHEST_HEX.map(parseHex), abdomenRgb, ribL, ribR, [0, 0, 0]];

  for (let i = 0; i < w * h; i++) {
    if (!candidate[i]) continue;
    const o = i * 3;
    const rgb = [out[o], out[o + 1], out[o + 2]];
    const canWrite =
      rgb[0] <= 8 && rgb[1] <= 8 && rgb[2] <= 8
        ? true
        : overwritable.some((c) => colorNear(rgb, c, 14));
    if (!canWrite) continue;
    out[o] = chestRgb[0];
    out[o + 1] = chestRgb[1];
    out[o + 2] = chestRgb[2];
    painted++;
  }

  // Second pass island cleanup on painted RGB (quantized speckles prevention)
  const paintedMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    if (colorNear([out[o], out[o + 1], out[o + 2]], chestRgb, 8)) paintedMask[i] = 1;
  }
  const island2 = keepLargestComponents(paintedMask, w, h, 2);
  for (let i = 0; i < w * h; i++) {
    if (paintedMask[i]) continue;
    const o = i * 3;
    if (colorNear([out[o], out[o + 1], out[o + 2]], chestRgb, 8)) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      painted--;
    }
  }

  // Symmetry from raster hits (may count multi-cover); normalize by painted
  const hitTotal = areaLAccum + areaRAccum;
  const areaL =
    hitTotal > 0 ? Math.round((painted * areaLAccum) / hitTotal) : painted / 2;
  const areaR =
    hitTotal > 0 ? Math.round((painted * areaRAccum) / hitTotal) : painted / 2;

  void authoringRgb;
  return {
    out,
    w,
    h,
    painted: Math.max(0, painted),
    areaL,
    areaR,
    island: { ...island, secondPass: island2 },
    candidate,
  };
}

function landmarkDistances(poly3, lm) {
  const p = lm.points;
  const nearest = (target) => {
    let best = Infinity;
    for (const q of poly3) {
      const d = vlen(vsub(q, target));
      if (d < best) best = d;
    }
    return best;
  };
  const clav = Math.min(
    nearest([p.clavicleLeft[0], p.clavicleLeft[1] - 0.018, p.clavicleLeft[2]]),
    nearest([p.clavicleRight[0], p.clavicleRight[1] - 0.018, p.clavicleRight[2]]),
  );
  const axilla = Math.min(
    nearest(p.anteriorAxillaryFoldLeft),
    nearest(p.anteriorAxillaryFoldRight),
  );
  const imf = Math.min(
    nearest(p.inframammaryLateralLeft),
    nearest(p.inframammaryLateralRight),
    nearest(p.inframammaryMedialLeft),
    nearest(p.inframammaryMedialRight),
  );
  return { clavicle: clav, axilla, imf };
}

async function renderEvidence(maskPngPath, outDir) {
  const mesh = loadMeshData(GLB);
  const normals = computeVertexNormals(mesh);
  // Quantized mask path preferred; fall back after quantize in pipeline
  const MASK_PNG = path.join(
    ROOT,
    "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
  );
  const MASK_JSON = path.join(
    ROOT,
    "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
  );
  const manifest = JSON.parse(readFileSync(MASK_JSON, "utf8"));
  const chestIdx = manifest.regions.full_chest_surface.maskIndex;
  const { data, info } = await sharp(MASK_PNG)
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampler = makeMaskSampler(data, info.width);
  mkdirSync(outDir, { recursive: true });
  const shots = [
    ["01-front", "front"],
    ["02-front-right-30", "front_right_30"],
    ["03-front-left-30", "front_left_30"],
    ["04-right", "right"],
    ["05-left", "left"],
  ];
  for (const [name, viewKey] of shots) {
    const camera = frameCamera(mesh, sampler.at, [chestIdx], VIEWS[viewKey], {
      padding: 1.2,
    });
    await renderView({
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: [chestIdx],
      width: 960,
      height: 1200,
    }).toFile(path.join(outDir, `${name}.png`));
  }
  void maskPngPath;
}

const VARIANTS = [
  { tension: 0.85, centralLift: 0.014, clavicleDrop: 0.016, axillaInset: 0.004, sternumTopDrop: 0.006, imfLateralOut: 0.0, samplesPerSeg: 48, densify: 2 },
  { tension: 0.9, centralLift: 0.016, clavicleDrop: 0.014, axillaInset: 0.002, sternumTopDrop: 0.004, imfLateralOut: 0.0, samplesPerSeg: 56, densify: 2 },
  { tension: 0.75, centralLift: 0.012, clavicleDrop: 0.018, axillaInset: 0.006, sternumTopDrop: 0.008, imfLateralOut: 0.0, samplesPerSeg: 48, densify: 3 },
  { tension: 1.0, centralLift: 0.015, clavicleDrop: 0.015, axillaInset: 0.003, sternumTopDrop: 0.005, imfLateralOut: 0.0, samplesPerSeg: 40, densify: 2 },
  { tension: 0.8, centralLift: 0.018, clavicleDrop: 0.017, axillaInset: 0.005, sternumTopDrop: 0.007, imfLateralOut: 0.0, samplesPerSeg: 52, densify: 2 },
  { tension: 0.7, centralLift: 0.013, clavicleDrop: 0.013, axillaInset: 0.001, sternumTopDrop: 0.003, imfLateralOut: 0.0, samplesPerSeg: 64, densify: 2 },
  { tension: 0.95, centralLift: 0.011, clavicleDrop: 0.019, axillaInset: 0.004, sternumTopDrop: 0.009, imfLateralOut: 0.0, samplesPerSeg: 48, densify: 2 },
  { tension: 0.85, centralLift: 0.017, clavicleDrop: 0.016, axillaInset: 0.0, sternumTopDrop: 0.005, imfLateralOut: 0.0, samplesPerSeg: 56, densify: 3 },
];

export async function generateFullChestSurface() {
  mkdirSync(BACKUPS, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(AUTHORING, path.join(BACKUPS, `pre_full_chest_codegen_${stamp}.png`));

  const glbBuf = readFileSync(GLB);
  const glbHash = createHash("sha256").update(glbBuf).digest("hex").slice(0, 16);
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const chestRgb = parseHex(palette.regions.full_chest_surface.authoringColor);

  if (lm.sourceHash && lm.sourceMesh) {
    console.log("LANDMARK_SOURCE_HASH", lm.sourceHash);
    console.log("GLB_HASH16", glbHash);
  }

  const required = [
    "clavicleLeft",
    "clavicleRight",
    "sternumTop",
    "sternumBottom",
    "breastApexLeft",
    "breastApexRight",
    "inframammaryMedialLeft",
    "inframammaryLateralLeft",
    "inframammaryMedialRight",
    "inframammaryLateralRight",
    "anteriorAxillaryFoldLeft",
    "anteriorAxillaryFoldRight",
  ];
  for (const id of required) {
    if (!lm.points[id]) throw new Error(`missing landmark ${id}`);
  }

  const mesh = loadMeshData(GLB);
  if (!mesh.hasUv) throw new Error("mesh missing UVs");
  console.log("MESH", {
    tris: mesh.triangleCount,
    verts: mesh.vertexCount,
    hasUv: mesh.hasUv,
  });

  const index = buildSpatialIndex(mesh, 0.035);
  const axisSamples = lm.axisZSamples;
  const contourCandidates = [];

  for (let vi = 0; vi < VARIANTS.length; vi++) {
    const params = VARIANTS[vi];
    console.log(`CONTOUR ${vi + 1}/${VARIANTS.length}`, JSON.stringify(params));
    const controls = buildControlPoints(lm, params);
    let curve = sampleClosedCatmullRom(
      controls,
      params.samplesPerSeg,
      params.tension,
    );
    curve = curve.map((p) => projectToSurface(p, mesh, index));
    curve = densifyProjected(curve, mesh, index, params.densify);
    curve = sanitizeProjectedCurve(curve, lm);
    curve = curve.map((p) => projectToSurface(p, mesh, index));
    curve = sanitizeProjectedCurve(curve, lm);

    const imfFloorY = Math.min(
      lm.points.inframammaryLateralLeft[1],
      lm.points.inframammaryLateralRight[1],
    );
    let polyThetaY = curve.map((p) => ({
      th: thetaOf(p, axisSamples),
      y: p[1],
    }));
    // Flatten central inferior PIP to kill tongue / deep W in parameter space
    polyThetaY = polyThetaY.map((pt) => {
      if (Math.abs(pt.th) < 22 && pt.y < imfFloorY + 0.01) {
        return { th: pt.th, y: imfFloorY + 0.01 };
      }
      if (Math.abs(pt.th) < 12 && pt.y > imfFloorY + 0.022) {
        // soften excessive central rise (W peak)
        return { th: pt.th, y: imfFloorY + 0.016 };
      }
      return pt;
    });
    const metrics = contourMetrics(curve, axisSamples);
    const landmarkDist = landmarkDistances(curve, lm);
    const pre = {
      params,
      curve,
      polyThetaY,
      metrics,
      landmarkDist,
      centralConcavity: metrics.centralConcavity,
      pixels: 200000,
      areaL: 100000,
      areaR: 100000,
      symmetryPct: 0,
    };
    pre.score = scoreVariant(pre, lm);
    contourCandidates.push(pre);
    console.log(
      "  preScore",
      pre.score.toFixed(2),
      "concavity",
      metrics.centralConcavity.toFixed(4),
      "lm",
      landmarkDist,
    );
  }

  contourCandidates.sort((a, b) => b.score - a.score);
  const toRaster = contourCandidates.slice(0, Math.min(1, contourCandidates.length));
  const results = [];

  for (let ri = 0; ri < toRaster.length; ri++) {
    const pre = toRaster[ri];
    console.log(`RASTER ${ri + 1}/${toRaster.length}`, JSON.stringify(pre.params));
    const rast = await rasterizeChest(
      mesh,
      pre.polyThetaY,
      axisSamples,
      null,
      chestRgb,
    );
    const total = rast.painted;
    const sym =
      total > 0
        ? (100 * Math.abs(rast.areaL - rast.areaR)) / total
        : 100;

    const meta = {
      params: pre.params,
      pixels: total,
      areaL: rast.areaL,
      areaR: rast.areaR,
      symmetryPct: sym,
      metrics: pre.metrics,
      landmarkDist: pre.landmarkDist,
      island: rast.island,
      centralConcavity: pre.centralConcavity,
      curve: pre.curve,
      polyThetaY: pre.polyThetaY,
      rast,
    };
    meta.score = scoreVariant(meta, lm);
    results.push(meta);
    console.log("  score", meta.score.toFixed(2), "px", total, "sym%", sym.toFixed(2));
  }

  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  console.log("BEST_SCORE", best.score, best.params);

  await sharp(best.rast.out, {
    raw: { width: best.rast.w, height: best.rast.h, channels: 3 },
  })
    .png({ compressionLevel: 9 })
    .toFile(AUTHORING);

  // Quantize via child logic (inline spawn)
  const { spawnSync } = await import("node:child_process");
  const q = spawnSync(
    process.execPath,
    [path.join(ROOT, "tools/body-regions/quantize-anatomical-mask.mjs")],
    { cwd: ROOT, encoding: "utf8" },
  );
  console.log(q.stdout);
  if (q.status !== 0) {
    console.error(q.stderr);
    throw new Error("quantize failed");
  }

  // Integrity
  const { validateFullChest } = await import("./validate-full-chest.mjs");
  const integrity = await validateFullChest();
  // validate writes to full-chest-professional-review; also write codegen renders
  await renderEvidence(AUTHORING, OUT_DIR);

  // Copy integrity-oriented report
  const report = {
    generatedAt: new Date().toISOString(),
    glb: path.relative(ROOT, GLB).replace(/\\/g, "/"),
    glbHash16: glbHash,
    landmarkSourceHash: lm.sourceHash,
    uv: { hasUv: mesh.hasUv, triangleCount: mesh.triangleCount },
    algorithm: {
      contour: "closed Catmull-Rom through anatomical landmarks",
      projection: "spatial-grid nearest-surface (BVH-like)",
      densify: "lerp + re-project (geodesic approximation)",
      rasterization: "per-texel UV barycentric + (theta,y) PIP",
      iterations: VARIANTS.length,
      rasterizedTop: results.length,
      bestIndex: 0,
    },
    bestParams: best.params,
    bestScore: best.score,
    metrics: {
      widthDeg: best.metrics.widthDeg,
      height: best.metrics.height,
      ratio: best.metrics.ratio,
      perimeter: best.metrics.perimeter,
      meanCurvature: best.metrics.meanCurvature,
      areaPixels: best.pixels,
      areaL: best.areaL,
      areaR: best.areaR,
      symmetryPct: best.symmetryPct,
      centralConcavity: best.centralConcavity,
      landmarkDistances: best.landmarkDist,
    },
    integrity,
    contourCandidates: contourCandidates.map((r) => ({
      score: r.score,
      params: r.params,
      landmarkDist: r.landmarkDist,
      centralConcavity: r.centralConcavity,
    })),
    variants: results.map((r) => ({
      score: r.score,
      params: r.params,
      pixels: r.pixels,
      symmetryPct: r.symmetryPct,
      landmarkDist: r.landmarkDist,
      centralConcavity: r.centralConcavity,
    })),
  };
  writeFileSync(
    path.join(OUT_DIR, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  // Also sync professional-review folder for continuity
  for (const name of [
    "01-front.png",
    "02-front-right-30.png",
    "03-front-left-30.png",
    "04-right.png",
    "05-left.png",
  ]) {
    const src = path.join(OUT_DIR, name);
    const destMap = {
      "01-front.png": "01-full-chest-front.png",
      "02-front-right-30.png": "02-full-chest-front-right-30.png",
      "03-front-left-30.png": "03-full-chest-front-left-30.png",
      "04-right.png": "04-full-chest-right.png",
      "05-left.png": "05-full-chest-left.png",
    };
    try {
      copyFileSync(
        src,
        path.join(ROOT, "artifacts/full-chest-professional-review", destMap[name]),
      );
    } catch {
      /* optional */
    }
  }

  console.log("GENERATE_FULL_CHEST_SURFACE_OK");
  console.log("REPORT", path.join(OUT_DIR, "report.json"));
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-surface.mjs")) {
  generateFullChestSurface().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
