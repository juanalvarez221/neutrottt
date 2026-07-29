/**
 * Curate torso regions onto authoring RGB mask using PRODUCTION GLB UVs.
 * (Authoring .blend mesh UVs currently diverge from public/models/production GLB.)
 *
 *   node tools/body-regions/curate-torso-mask.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const SEED = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.png",
);
const BACKUPS = path.join(ROOT, "assets/body-regions/backups");

const TORSO = [
  "right_pectoral_region",
  "left_pectoral_region",
  "full_abdomen_region",
  "right_ribs_region",
  "left_ribs_region",
  "upper_back_region",
  "lower_back_region",
];

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
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

function classify(x, y, z, levels, samples) {
  const axz = axisZAt(y, samples);
  const th = (Math.atan2(x, z - axz) * 180) / Math.PI;
  const ath = Math.abs(th);
  const { neckBase: neck, infraclavicular: clav, inframammary: imf, inferiorScapular: scap, waist, iliacCrest: iliac } = levels;

  if (y > neck + 0.02 || y < iliac - 0.02) return null;
  if (Math.abs(x) > 0.28 && ath > 55 && y > clav - 0.08) return null;

  const latN = Math.min(1, Math.abs(x) / 0.14);
  const imfCurve = imf - 0.008 + 0.045 * latN ** 1.55;
  const topPec = clav + 0.008;
  const front = z - axz;

  // Pectorals — full mound to IMF, sternum, axilla
  if (y >= imfCurve - 0.012 && y <= topPec && ath <= 75 && front > -0.015) {
    const t = Math.max(0, Math.min(1, (y - imfCurve) / Math.max(0.05, topPec - imfCurve)));
    const maxAth = 48 + 22 * t;
    if (ath <= maxAth && front > -0.008) {
      if (x < -0.003) return "right_pectoral_region";
      if (x > 0.003) return "left_pectoral_region";
      return x <= 0 ? "right_pectoral_region" : "left_pectoral_region";
    }
  }

  // Abdomen
  let abTop = imfCurve - 0.01;
  const abTopC = imf - 0.02;
  if (ath < 32) abTop = abTopC + (abTop - abTopC) * (ath / 32);
  if (y >= iliac + 0.048 && y <= abTop && ath <= 60 && front > 0.0) {
    return "full_abdomen_region";
  }

  // Ribs wrap
  if (y >= waist - 0.04 && y <= clav - 0.03 && ath >= 46 && ath <= 138) {
    if (ath >= 54 || y < imfCurve - 0.02) {
      return x < 0 ? "right_ribs_region" : x > 0 ? "left_ribs_region" : null;
    }
  }

  // Upper back
  if (y >= scap - 0.015 && y <= neck - 0.008 && ath >= 92 && Math.abs(x) < 0.23) {
    return "upper_back_region";
  }

  // Lower back
  if (y >= iliac + 0.03 && y <= scap + 0.005 && ath >= 88 && Math.abs(x) < 0.21) {
    return "lower_back_region";
  }

  return null;
}

function colorNear(rgb, target, tol = 10) {
  return (
    Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol
  );
}

async function main() {
  mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (AUTHORING) {
    try {
      copyFileSync(AUTHORING, path.join(BACKUPS, `pre_glb_curate_${stamp}.png`));
    } catch {}
  }

  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const mesh = loadMeshData(GLB);
  const size = palette.resolution || 4096;

  // Start from seed indexed → keep limbs/head, or from authoring if present
  let basePath = AUTHORING;
  try {
    readFileSync(AUTHORING);
  } catch {
    basePath = SEED;
  }

  // Build RGB canvas from seed indexed mask for non-torso preservation
  const seed = await sharp(SEED).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const byIndex = new Map([[0, [0, 0, 0]]]);
  for (const [id, e] of Object.entries(palette.regions)) {
    byIndex.set(e.runtimeIndex, parseHex(e.authoringColor));
  }
  const torsoColors = TORSO.map((id) => parseHex(palette.regions[id].authoringColor));
  const out = Buffer.alloc(size * size * 3);

  for (let i = 0; i < size * size; i++) {
    const idx = seed.data[i * 4];
    let rgb = byIndex.get(idx) || [0, 0, 0];
    // clear prior torso colors
    if (torsoColors.some((c) => colorNear(rgb, c, 8))) rgb = [0, 0, 0];
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }

  const colorOf = Object.fromEntries(
    TORSO.map((id) => [id, parseHex(palette.regions[id].authoringColor)]),
  );

  const STEPS = 8;
  let painted = 0;
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
        const rid = classify(x, y, z, lm.levels, lm.axisZSamples);
        if (!rid) continue;
        const u = UV[i0 * 2] * wc + UV[i1 * 2] * wa + UV[i2 * 2] * wb;
        const v = UV[i0 * 2 + 1] * wc + UV[i1 * 2 + 1] * wa + UV[i2 * 2 + 1] * wb;
        const px = Math.min(size - 1, Math.max(0, Math.round(u * (size - 1))));
        const py = Math.min(size - 1, Math.max(0, Math.round((1 - v) * (size - 1))));
        const col = colorOf[rid];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(size - 1, Math.max(0, px + dx));
            const yy = Math.min(size - 1, Math.max(0, py + dy));
            const o = (yy * size + xx) * 3;
            out[o] = col[0];
            out[o + 1] = col[1];
            out[o + 2] = col[2];
            painted++;
          }
        }
      }
    }
  }

  await sharp(out, { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(AUTHORING);

  console.log("WROTE", path.relative(ROOT, AUTHORING));
  console.log("PAINTED_STAMPS", painted);
  console.log("CURATE_TORSO_GLB_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
