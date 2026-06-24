/**
 * ADVERTENCIA: No ejecutar sin consentimiento explícito.
 * Quita fondo claro de PNGs del cotizador. Los originales con fondo están en public/body/_originals/.
 * Uso manual: node scripts/body/remove-body-image-backgrounds.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BODY_DIR = path.resolve("public/body");

const QUOTE_IMAGES = [
  "body-map-front.png",
  "body-map-back.png",
  "head-top-profile.png",
  "head-right-profile.png",
  "head-left-profile.png",
  "head-back-profile.png",
  "back-detail.png",
  "arm-outer-detail.png",
  "arm-inner-detail.png",
  "leg-anterior-detail.png",
  "leg-posterior-detail.png",
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getPixel(data, width, channels, x, y) {
  const i = (y * width + x) * channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] ?? 255 };
}

function minCornerDistance(r, g, b, refs) {
  let min = Infinity;
  for (const ref of refs) {
    min = Math.min(min, colorDist(r, g, b, ref.r, ref.g, ref.b));
  }
  return min;
}

function isBackgroundPixel(r, g, b, refs, tolerance) {
  if (minCornerDistance(r, g, b, refs) <= tolerance) return true;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum >= 245 && minCornerDistance(r, g, b, refs) <= tolerance + 12) return true;
  return false;
}

function countSubjectPixels(data, width, height, channels, refs, tolerance) {
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = getPixel(data, width, channels, x, y);
      if (!isBackgroundPixel(px.r, px.g, px.b, refs, tolerance)) count++;
    }
  }
  return count;
}

function cornerRefs(raw, width, height, channels) {
  const corners = [
    getPixel(raw, width, channels, 0, 0),
    getPixel(raw, width, channels, width - 1, 0),
    getPixel(raw, width, channels, 0, height - 1),
    getPixel(raw, width, channels, width - 1, height - 1),
  ];
  return corners.map(({ r, g, b }) => ({ r, g, b }));
}

function removeBackground(raw, width, height, channels, tolerance) {
  const corners = [
    getPixel(raw, width, channels, 0, 0),
    getPixel(raw, width, channels, width - 1, 0),
    getPixel(raw, width, channels, 0, height - 1),
    getPixel(raw, width, channels, width - 1, height - 1),
  ];
  const edgeRefs = corners.map(({ r, g, b }) => ({ r, g, b }));

  const out = Buffer.from(raw);
  const visited = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const px = getPixel(out, width, channels, x, y);
    if (!isBackgroundPixel(px.r, px.g, px.b, edgeRefs, tolerance)) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx - x) / width;
    const o = idx * channels;
    out[o + 3] = 0;

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (visited[nIdx]) continue;
      const px = getPixel(out, width, channels, nx, ny);
      if (!isBackgroundPixel(px.r, px.g, px.b, edgeRefs, tolerance)) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const o = (y * width + x) * channels;
      if (out[o + 3] === 0) continue;
      const r = out[o];
      const g = out[o + 1];
      const b = out[o + 2];
      if (!isBackgroundPixel(r, g, b, edgeRefs, tolerance + 6)) continue;
      const neighbors = [
        (y * width + (x - 1)) * channels + 3,
        (y * width + (x + 1)) * channels + 3,
        ((y - 1) * width + x) * channels + 3,
        ((y + 1) * width + x) * channels + 3,
      ];
      if (neighbors.some((a) => out[a] === 0)) out[o + 3] = 0;
    }
  }

  return out;
}

async function processImage(filename, tolerance = 28) {
  const inputPath = path.join(BODY_DIR, filename);
  const backupDir = path.join(BODY_DIR, "_originals");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, filename);

  try {
    await fs.access(backupPath);
  } catch {
    await fs.copyFile(inputPath, backupPath);
  }

  const sourcePath = backupPath;
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const refs = cornerRefs(data, info.width, info.height, info.channels);
  const originalSubject = countSubjectPixels(
    data,
    info.width,
    info.height,
    info.channels,
    refs,
    tolerance,
  );
  const cleaned = removeBackground(data, info.width, info.height, info.channels, tolerance);
  const cleanedSubject = countSubjectPixels(
    cleaned,
    info.width,
    info.height,
    info.channels,
    refs,
    tolerance,
  );
  const subjectRatio = originalSubject === 0 ? 1 : cleanedSubject / originalSubject;

  if (subjectRatio < 0.92) {
    throw new Error(
      `${filename}: se perdió sujeto (${(subjectRatio * 100).toFixed(1)}% restante). Ajusta tolerancia.`,
    );
  }

  const tempPath = `${inputPath}.tmp.png`;
  await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(tempPath);

  await fs.rename(tempPath, inputPath);
  console.log(
    `OK ${filename} (${info.width}x${info.height}, tolerance=${tolerance}, subject=${(subjectRatio * 100).toFixed(1)}%)`,
  );
}

async function main() {
  const tolerances = {
    "body-map-front.png": 30,
    "body-map-back.png": 30,
    "back-detail.png": 28,
    "head-left-profile.png": 26,
    "head-top-profile.png": 28,
    "head-right-profile.png": 28,
    "head-back-profile.png": 28,
    "arm-outer-detail.png": 28,
    "arm-inner-detail.png": 28,
    "leg-anterior-detail.png": 28,
    "leg-posterior-detail.png": 28,
  };

  for (const file of QUOTE_IMAGES) {
    await processImage(file, tolerances[file] ?? 28);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
