/**
 * Curate ONLY full_chest_surface onto the authoring RGB mask.
 *
 * Adapts the proven torso pec classifier into ONE continuous region
 * (no L/R split). Uses neutro_body_v1_landmarks.json measures.
 * Does not rewrite abdomen / ribs / back definitive paint.
 *
 *   node tools/body-regions/curate-full-chest.mjs
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const PALETTE = path.join(ROOT, "assets/body-regions/neutro_body_v1_region_palette.json");
const LANDMARKS = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const BACKUPS = path.join(ROOT, "assets/body-regions/backups");

const CHEST_ID = "full_chest_surface";
const LEGACY_PEC_HEX = ["#D81B60", "#C62828", "#E53935"];

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function colorNear(rgb, target, tol = 12) {
  return (
    Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol
  );
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

/**
 * Single continuous full chest from landmarks.
 * Mild IMF amplitude (~1cm) — anatomical soft fold, not exaggerated W/bib.
 */
function isFullChest(x, y, z, lm) {
  const p = lm.points;
  const axz = axisZAt(y, lm.axisZSamples);
  const front = z - axz;
  const th = (Math.atan2(x, z - axz) * 180) / Math.PI;
  const ath = Math.abs(th);
  const absX = Math.abs(x);

  const clav = lm.levels.infraclavicular;
  const imf = lm.levels.inframammary;
  const apex = lm.levels.breastApex;
  const axFoldX = Math.abs(p.anteriorAxillaryFoldLeft[0]);
  const axFoldY = p.anteriorAxillaryFoldLeft[1];
  const imfLatY = p.inframammaryLateralLeft[1];
  const imfMedY = p.inframammaryMedialLeft[1];
  const imfLatX = Math.abs(p.inframammaryLateralLeft[0]);

  // Exclude neck / arms / far lateral
  if (y > clav + 0.002) return false;
  if (absX > axFoldX + 0.006) return false;
  if (absX > 0.22 && ath > 52 && y > clav - 0.08) return false;

  // Soft IMF from medial / lateral landmarks (low amplitude)
  // Center ~ imfMedY+0.004; under breast ~ imfLatY+0.004; rise to axilla
  const u = Math.min(1, absX / Math.max(1e-6, imfLatX));
  const underBreast = Math.sin((Math.PI * u) / 2);
  let imfCurve =
    imfMedY + 0.005 - (imfMedY - imfLatY) * underBreast * 0.85;
  if (absX > imfLatX) {
    const t = Math.min(
      1,
      (absX - imfLatX) / Math.max(1e-6, axFoldX - imfLatX),
    );
    imfCurve += 0.028 * t * t;
  }
  // Hard floor: never below measured lateral IMF
  imfCurve = Math.max(imfCurve, imfLatY + 0.001);

  // Continuous infraclavicular top (slightly below clavicles, descend to axilla)
  const topLat = Math.min(1, absX / axFoldX);
  const topPec =
    clav - 0.014 - 0.012 * topLat * topLat - (absX > 0.09 ? 0.01 * topLat : 0);

  if (y < imfCurve) return false;
  if (y > topPec) return false;
  if (ath > 62) return false;
  if (front < -0.006) return false;

  const t = Math.max(
    0,
    Math.min(1, (y - imfCurve) / Math.max(0.05, topPec - imfCurve)),
  );
  // Wider mid-breast / near apex; tighter at IMF and clavicle
  const apexBoost = Math.exp(-Math.pow((y - apex) / 0.055, 2));
  let maxAth = 42 + 16 * t + 6 * apexBoost;
  if (y > axFoldY - 0.04) maxAth = Math.min(maxAth, 50);
  if (y < apex - 0.03) maxAth = Math.min(maxAth, 44);
  if (ath > maxAth) return false;

  // Block rib wrap: require anterior mound
  if (front < -0.002 + 0.01 * Math.max(0, (ath - 35) / 25)) return false;
  if (y < imf + 0.02 && ath > 48 && front < 0.01) return false;

  return true;
}

function keepLargestChest(buf, w, h, chestRgb) {
  const isChest = (o) =>
    colorNear([buf[o], buf[o + 1], buf[o + 2]], chestRgb, 8);
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
      if (seen[i] || !isChest(i * 3)) continue;
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
          if (seen[ni] || !isChest(ni * 3)) continue;
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
    if (kept < 2 && c.length >= Math.max(400, total * 0.05)) {
      for (const i of c) keep.add(i);
      kept++;
    }
  }
  if (!keep.size && comps[0]) for (const i of comps[0]) keep.add(i);
  let removed = 0;
  for (const c of comps) {
    for (const i of c) {
      if (keep.has(i)) continue;
      const o = i * 3;
      buf[o] = 0;
      buf[o + 1] = 0;
      buf[o + 2] = 0;
      removed++;
    }
  }
  return { components: comps.length, kept, removed };
}

async function main() {
  mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(AUTHORING, path.join(BACKUPS, `pre_full_chest_${stamp}.png`));

  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const mesh = loadMeshData(GLB);
  const chestRgb = parseHex(palette.regions[CHEST_ID].authoringColor);
  const clearColors = [chestRgb, ...LEGACY_PEC_HEX.map(parseHex)];

  const { data, info } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const out = Buffer.alloc(w * h * 3);
  let cleared = 0;

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const rgb = [r, g, b];
    if (clearColors.some((c) => colorNear(rgb, c, 14))) {
      out[i * 3] = 0;
      out[i * 3 + 1] = 0;
      out[i * 3 + 2] = 0;
      cleared++;
    } else {
      out[i * 3] = r;
      out[i * 3 + 1] = g;
      out[i * 3 + 2] = b;
    }
  }

  // Candidate UV from 3D classifier (prevents morph bleed into abdomen)
  const candidate = new Uint8Array(w * h);
  const STEPS = 16;
  let hits = 0;
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = I[t * 3];
    const i1 = I[t * 3 + 1];
    const i2 = I[t * 3 + 2];
    for (let a = 0; a <= STEPS; a++) {
      for (let b = 0; b <= STEPS - a; b++) {
        const wa = a / STEPS;
        const wb = b / STEPS;
        const wc = 1 - wa - wb;
        const x = P[i0 * 3] * wc + P[i1 * 3] * wa + P[i2 * 3] * wb;
        const y = P[i0 * 3 + 1] * wc + P[i1 * 3 + 1] * wa + P[i2 * 3 + 1] * wb;
        const z = P[i0 * 3 + 2] * wc + P[i1 * 3 + 2] * wa + P[i2 * 3 + 2] * wb;
        if (!isFullChest(x, y, z, lm)) continue;
        const u = UV[i0 * 2] * wc + UV[i1 * 2] * wa + UV[i2 * 2] * wb;
        const v = UV[i0 * 2 + 1] * wc + UV[i1 * 2 + 1] * wa + UV[i2 * 2 + 1] * wb;
        const px = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
        const py = Math.min(h - 1, Math.max(0, Math.round((1 - v) * (h - 1))));
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx * dx + dy * dy > 2) continue;
            const xx = Math.min(w - 1, Math.max(0, px + dx));
            const yy = Math.min(h - 1, Math.max(0, py + dy));
            candidate[yy * w + xx] = 1;
          }
        }
        hits++;
      }
    }
  }

  // Light close/open only on candidate
  const tmp = new Uint8Array(candidate);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (candidate[(y + dy) * w + (x + dx)]) n++;
          }
        }
        if (pass === 0 && !candidate[i] && n >= 5) tmp[i] = 1;
        else if (pass === 1 && candidate[i] && n <= 2) tmp[i] = 0;
        else tmp[i] = candidate[i];
      }
    }
    candidate.set(tmp);
  }

  let painted = 0;
  for (let i = 0; i < w * h; i++) {
    if (!candidate[i]) continue;
    const o = i * 3;
    if (out[o] > 8 || out[o + 1] > 8 || out[o + 2] > 8) continue;
    out[o] = chestRgb[0];
    out[o + 1] = chestRgb[1];
    out[o + 2] = chestRgb[2];
    painted++;
  }

  const islandStats = keepLargestChest(out, w, h, chestRgb);

  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(AUTHORING);

  console.log("LANDMARKS_USED");
  console.log(
    JSON.stringify(
      {
        clavicleLeft: lm.points.clavicleLeft,
        clavicleRight: lm.points.clavicleRight,
        sternumTop: lm.points.sternumTop,
        sternumBottom: lm.points.sternumBottom,
        breastApexLeft: lm.points.breastApexLeft,
        breastApexRight: lm.points.breastApexRight,
        inframammaryMedialLeft: lm.points.inframammaryMedialLeft,
        inframammaryLateralLeft: lm.points.inframammaryLateralLeft,
        inframammaryMedialRight: lm.points.inframammaryMedialRight,
        inframammaryLateralRight: lm.points.inframammaryLateralRight,
        anteriorAxillaryFoldLeft: lm.points.anteriorAxillaryFoldLeft,
        anteriorAxillaryFoldRight: lm.points.anteriorAxillaryFoldRight,
        levels: {
          infraclavicular: lm.levels.infraclavicular,
          breastApex: lm.levels.breastApex,
          inframammary: lm.levels.inframammary,
        },
        sourceHash: lm.sourceHash,
      },
      null,
      2,
    ),
  );
  console.log("CLEARED_PEC_PIXELS", cleared);
  console.log("CANDIDATE_HITS", hits);
  console.log("PAINTED_PIXELS", painted);
  console.log("ISLAND_CLEANUP", JSON.stringify(islandStats));
  console.log("WROTE", path.relative(ROOT, AUTHORING));
  console.log("CURATE_FULL_CHEST_OK");
  console.log("SAVE_STATUS SAVED_AND_CHANGED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
