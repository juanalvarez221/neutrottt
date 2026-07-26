/**
 * Right Ribs V4.0 evidence — diagnostics, candidates, contact sheets, finalists.
 *
 *   node tools/body-regions/render-right-ribs-v40-evidence.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  computeVertexNormals,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import { buildDerivedMesh } from "./generate-full-chest-geometry-field.mjs";
import {
  assertTorsoFrontFrozen,
  buildV40Context,
  evaluateAllRightRibsCandidates,
} from "./right-ribs-v40.mjs";

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
const OUT = path.join(ROOT, "artifacts/right-ribs-v40");
const DIAG = path.join(OUT, "diagnostic");
const CAND = path.join(OUT, "candidates");
const FIN = path.join(OUT, "finalists");

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  "front-right-30": [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-right-60": [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "right-90": [-1, 0, 0],
  "back-right-60": [-Math.sin(deg(60)), 0, -Math.cos(deg(60))],
  "back-right-30": [-Math.sin(deg(30)), 0, -Math.cos(deg(30))],
};

function labelSvg(width, text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="36" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="36" fill="rgba(10,10,12,0.72)"/>` +
      `<text x="10" y="24" font-family="monospace" font-size="13" fill="#e8e8ea">${esc}</text>` +
      `</svg>`,
  );
}

async function labeled(pngBuffer, width, text, outFile) {
  const label = await sharp(labelSvg(width, text)).png().toBuffer();
  await sharp(pngBuffer)
    .composite([{ input: label, left: 0, top: 0 }])
    .png()
    .toFile(outFile);
}

function frameRegion(mesh, values, direction, pad = 1.45) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    found = true;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i * 3 + k]);
      max[k] = Math.max(max[k], P[i * 3 + k]);
    }
  }
  if (!found) {
    min = [-0.22, 1.0, -0.12];
    max = [-0.05, 1.32, 0.04];
  }
  const target = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const extent = Math.max(
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
    0.14,
  );
  const fov = 32;
  const distance =
    (extent * pad) / 2 / Math.tan((fov * Math.PI) / 360) + extent * 0.5;
  const len = Math.hypot(...direction) || 1;
  const dir = direction.map((c) => c / len);
  return {
    position: [
      target[0] + dir[0] * distance,
      target[1] + dir[1] * distance,
      target[2] + dir[2] * distance,
    ],
    target,
    fov,
    near: 0.01,
    far: 20,
  };
}

function derivedFor(mesh, normals, r) {
  let curMesh = mesh;
  let curValues = r.values;
  let curNormals = normals;
  for (const level of r.refinement.levels ?? [r.refinement]) {
    if (!level?.triangles?.length) continue;
    const d = buildDerivedMesh(curMesh, curValues, level, curNormals);
    curMesh = d.mesh;
    curValues = d.values;
    curNormals = d.normals ?? curNormals;
  }
  return { mesh: curMesh, values: curValues, normals: curNormals };
}

function renderGF({ derived, maskSampler, camera, w, h }) {
  // renderView already returns a sharp().png() pipeline.
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals,
    maskSampler,
    camera,
    highlightIndices: [13],
    width: w,
    height: h,
    visualMode: "geometry-field",
    vertexField: derived.values,
    supersample: 1,
  });
}

async function readSingleChannel(file, size) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(size * size);
  for (let i = 0; i < size * size; i++) out[i] = data[i * ch];
  return out;
}

async function contactSheet(files, outFile, cols = 2) {
  if (!files.length) return;
  const w = 560;
  const h = 680;
  const rows = Math.ceil(files.length / cols);
  const canvas = sharp({
    create: {
      width: cols * w,
      height: rows * h,
      channels: 3,
      background: { r: 12, g: 12, b: 14 },
    },
  });
  const composites = [];
  for (let i = 0; i < files.length; i++) {
    const buf = await sharp(files[i]).resize(w, h).png().toBuffer();
    composites.push({
      input: buf,
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    });
  }
  await canvas.composite(composites).png().toFile(outFile);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

async function drawWidthProfilePng(width, outFile) {
  const W = 900;
  const H = 520;
  const pad = 48;
  const rows = width.rows;
  if (!rows.length) return;
  const yMin = Math.min(...rows.map((r) => r.y));
  const yMax = Math.max(...rows.map((r) => r.y));
  const wMax = Math.max(...rows.map((r) => r.widthM), 0.01);
  const xOf = (t) => pad + t * (W - 2 * pad);
  const yOf = (y) =>
    pad + ((yMax - y) / Math.max(1e-6, yMax - yMin)) * (H - 2 * pad);
  const poly = rows
    .map((r, i) => {
      const x = xOf(r.widthM / wMax);
      const y = yOf(r.y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const front = rows
    .map((r, i) => {
      const t = (Math.abs(r.frontS) - 0.7) / 0.9;
      const x = xOf(clamp01(t));
      const y = yOf(r.y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const back = rows
    .map((r, i) => {
      const t = (Math.abs(r.backS) - 0.7) / 0.9;
      const x = xOf(clamp01(t));
      const y = yOf(r.y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#111214"/>
  <text x="${pad}" y="28" fill="#d8d8dc" font-family="monospace" font-size="14">01-width-profile  mean=${(width.mean * 1000).toFixed(1)}mm  minRatio=${width.minRatio.toFixed(2)}</text>
  <path d="${poly}" fill="none" stroke="#7d9b76" stroke-width="2.5"/>
  <path d="${front}" fill="none" stroke="#c4a574" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="${back}" fill="none" stroke="#6f8fa8" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="${pad}" y="${H - 16}" fill="#888" font-family="monospace" font-size="12">green=width  amber=frontS  blue=backS</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

async function renderCandidateViews(derived, maskSampler, r, outDir, prefix) {
  mkdirSync(outDir, { recursive: true });
  const views = [
    "front-right-30",
    "front-right-60",
    "right-90",
    "back-right-60",
    "back-right-30",
  ];
  const files = [];
  for (const name of views) {
    const camera = frameRegion(derived.mesh, derived.values, VIEWS[name]);
    const png = await renderGF({
      derived,
      maskSampler,
      camera,
      w: 720,
      h: 960,
    }).toBuffer();
    const target = path.join(outDir, `${prefix}-${name}.png`);
    await labeled(
      png,
      720,
      `${r.id}  post=${r.params.posteriorCoverage}  waist=${r.params.waistClearance * 1000}mm`,
      target,
    );
    files.push(target);
  }
  return files;
}

export async function renderRightRibsV40Evidence() {
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(CAND, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  assertTorsoFrontFrozen();
  const seamPath = path.join(OUT, "shared-front-ribs-seam.json");
  const sharedFront = existsSync(seamPath)
    ? JSON.parse(readFileSync(seamPath, "utf8"))
    : null;
  const ctx = buildV40Context(GLB, LANDMARKS, { sharedFront });
  const sweep = evaluateAllRightRibsCandidates(ctx);
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, 4096);
  const maskSampler = makeMaskSampler(mask, 4096);

  const primaryId = sweep.finalists[0] ?? sweep.results[0]?.id;
  const primary = sweep.results.find((r) => r.id === primaryId);
  if (primary) {
    await drawWidthProfilePng(
      primary.width,
      path.join(DIAG, "01-width-profile.png"),
    );
    const derived = derivedFor(ctx.mesh, normals, primary);
    const diagMap = [
      ["02-sections-front-right", "front-right-30"],
      ["03-sections-right", "right-90"],
      ["04-sections-back-right", "back-right-30"],
      ["05-boundaries-front-right", "front-right-30"],
      ["06-boundaries-right", "right-90"],
      ["07-boundaries-back-right", "back-right-30"],
    ];
    for (const [fname, view] of diagMap) {
      const camera = frameRegion(derived.mesh, derived.values, VIEWS[view], 1.55);
      const png = await renderGF({
        derived,
        maskSampler,
        camera,
        w: 720,
        h: 960,
      }).toBuffer();
      await labeled(png, 720, `${fname}  ${primary.id}`, path.join(DIAG, `${fname}.png`));
    }
  }

  const contactBuckets = {
    "front-right": [],
    right: [],
    "back-right": [],
  };

  for (const r of sweep.results) {
    const derived = derivedFor(ctx.mesh, normals, r);
    const files = await renderCandidateViews(
      derived,
      maskSampler,
      r,
      CAND,
      r.id,
    );
    for (const f of files) {
      if (f.includes("front-right")) contactBuckets["front-right"].push(f);
      else if (f.includes("right-90")) contactBuckets.right.push(f);
      else if (f.includes("back-right")) contactBuckets["back-right"].push(f);
    }
  }

  await contactSheet(
    contactBuckets["front-right"].slice(0, 8),
    path.join(OUT, "contact-front-right.png"),
    4,
  );
  await contactSheet(
    contactBuckets.right.slice(0, 4),
    path.join(OUT, "contact-right.png"),
    4,
  );
  await contactSheet(
    contactBuckets["back-right"].slice(0, 8),
    path.join(OUT, "contact-back-right.png"),
    4,
  );

  for (const id of sweep.finalists) {
    const r = sweep.results.find((x) => x.id === id);
    if (!r) continue;
    const derived = derivedFor(ctx.mesh, normals, r);
    await renderCandidateViews(derived, maskSampler, r, FIN, id);
    const browserViews = [
      ["browser-front-right", "front-right-30"],
      ["browser-right", "right-90"],
      ["browser-back-right", "back-right-30"],
    ];
    for (const [name, view] of browserViews) {
      const camera = frameRegion(derived.mesh, derived.values, VIEWS[view], 1.35);
      const png = await renderGF({
        derived,
        maskSampler,
        camera,
        w: 512,
        h: 720,
      }).toBuffer();
      await labeled(png, 512, `${id} ${name}`, path.join(FIN, `${id}-${name}.png`));
    }
    for (const alias of [
      "front-right-30",
      "front-right-60",
      "right-90",
      "back-right-60",
      "back-right-30",
    ]) {
      const src = path.join(FIN, `${id}-${alias}.png`);
      if (existsSync(src)) copyFileSync(src, path.join(FIN, `${alias}.png`));
    }
    for (const alias of [
      "browser-front-right",
      "browser-right",
      "browser-back-right",
    ]) {
      const src = path.join(FIN, `${id}-${alias}.png`);
      if (existsSync(src)) copyFileSync(src, path.join(FIN, `${alias}.png`));
    }
  }

  writeFileSync(
    path.join(OUT, "evidence-index.json"),
    JSON.stringify(
      {
        diagnostic: [
          "01-width-profile.png",
          "02-sections-front-right.png",
          "03-sections-right.png",
          "04-sections-back-right.png",
          "05-boundaries-front-right.png",
          "06-boundaries-right.png",
          "07-boundaries-back-right.png",
        ],
        contact: [
          "contact-front-right.png",
          "contact-right.png",
          "contact-back-right.png",
        ],
        finalists: sweep.finalists,
      },
      null,
      2,
    ),
  );
  console.log(
    "EVIDENCE_DONE",
    JSON.stringify({ finalists: sweep.finalists, out: OUT }),
  );
}

if (
  process.argv[1] &&
  process.argv[1]
    .replace(/\\/g, "/")
    .endsWith("render-right-ribs-v40-evidence.mjs")
) {
  renderRightRibsV40Evidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
