/**
 * Right Ribs V4.1 evidence — stages A–D + final views for R02.
 *
 *   node tools/body-regions/render-right-ribs-v41-evidence.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  buildV41Context,
  evaluateRightRibsV41,
} from "./right-ribs-v41.mjs";

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
const OUT = path.join(ROOT, "artifacts/right-ribs-v41");
const DIAG = path.join(OUT, "diagnostic");
const FIN = path.join(OUT, "final");

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
      `<rect width="100%" height="100%" fill="rgba(10,10,12,0.72)"/>` +
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
    min = [-0.22, 1.05, -0.14];
    max = [-0.05, 1.32, 0.02];
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

function renderGF(derived, maskSampler, camera, w, h) {
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

/** False-color u_ribs as a vertex field in [-1,1] mapped around 0. */
function uAsField(uField) {
  const out = new Float32Array(uField.length);
  for (let i = 0; i < uField.length; i++) {
    const u = uField[i];
    if (!Number.isFinite(u)) {
      out[i] = -0.02;
      continue;
    }
    // Map u∈[0,1] → signed distance-like [-0.01, +0.01] with 0 at u=0.5
    out[i] = (0.5 - Math.abs(u - 0.5)) * 0.04 - 0.0001;
    if (u >= 0 && u <= 1) out[i] = 0.002 + u * 0.016;
    else out[i] = -0.01;
  }
  return out;
}

async function drawLoopSchematic(loop, outFile, title) {
  const W = 720;
  const H = 900;
  const project = (p) => {
    // Right view: X horizontal (neg right), Y vertical
    const x = 360 + (-p[0] - 0.12) * 2200;
    const y = 120 + (1.35 - p[1]) * 2200;
    return [x, y];
  };
  const pathOf = (arr, color) => {
    if (!arr?.length) return "";
    let d = "";
    for (let i = 0; i < arr.length; i++) {
      const [x, y] = project(arr[i]);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#111214"/>
  <text x="20" y="28" fill="#e8e8ea" font-family="monospace" font-size="14">${title}</text>
  ${pathOf(loop.front, "#c4a574")}
  ${pathOf(loop.superior, "#7d9b76")}
  ${pathOf(loop.back, "#6f8fa8")}
  ${pathOf(loop.inferior, "#b87a6a")}
  <text x="20" y="${H - 20}" fill="#888" font-family="monospace" font-size="12">amber=front green=upper blue=back rose=lower</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

async function drawUSections(atlas, outFile) {
  const W = 900;
  const H = 520;
  const pad = 48;
  const rows = atlas.slices.filter((s) => s.points);
  const yMin = Math.min(...rows.map((r) => r.y));
  const yMax = Math.max(...rows.map((r) => r.y));
  const tMax = Math.max(...rows.map((r) => r.total), 0.01);
  const xOf = (t) => pad + (t / tMax) * (W - 2 * pad);
  const yOf = (y) =>
    pad + ((yMax - y) / Math.max(1e-6, yMax - yMin)) * (H - 2 * pad);
  const poly = rows
    .map((r, i) => {
      const x = xOf(r.total);
      const y = yOf(r.y);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#111214"/>
  <text x="${pad}" y="28" fill="#d8d8dc" font-family="monospace" font-size="14">08-u-field-sections  arc length (m) vs Y</text>
  <path d="${poly}" fill="none" stroke="#7d9b76" stroke-width="2.5"/>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

export async function renderRightRibsV41Evidence() {
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  assertTorsoFrontFrozen();
  const ctx = buildV41Context(GLB, LANDMARKS);
  const result = evaluateRightRibsV41(ctx);
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, 4096);
  const maskSampler = makeMaskSampler(mask, 4096);

  // A — boundary loops
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "01-boundary-loop-front-right.png"),
    "A 01-boundary-loop-front-right",
  );
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "02-boundary-loop-right.png"),
    "A 02-boundary-loop-right",
  );
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "03-boundary-loop-back-right.png"),
    "A 03-boundary-loop-back-right",
  );

  // B — u field views
  const uValues = uAsField(result.uField);
  const uDerived = { mesh: ctx.mesh, values: uValues, normals };
  for (const [fname, view] of [
    ["05-u-field-front-right", "front-right-30"],
    ["06-u-field-right", "right-90"],
    ["07-u-field-back-right", "back-right-30"],
  ]) {
    const camera = frameRegion(ctx.mesh, result.values, VIEWS[view], 1.5);
    const png = await renderGF(uDerived, maskSampler, camera, 720, 960).toBuffer();
    await labeled(png, 720, `B ${fname}`, path.join(DIAG, `${fname}.png`));
  }
  await drawUSections(result.atlas, path.join(DIAG, "08-u-field-sections.png"));

  // C — classification
  const classDerived = { mesh: ctx.mesh, values: result.values, normals };
  for (const [fname, view] of [
    ["09-classification-front-right", "front-right-30"],
    ["10-classification-right", "right-90"],
    ["11-classification-back-right", "back-right-30"],
  ]) {
    const camera = frameRegion(ctx.mesh, result.values, VIEWS[view], 1.5);
    const png = await renderGF(
      classDerived,
      maskSampler,
      camera,
      720,
      960,
    ).toBuffer();
    await labeled(png, 720, `C ${fname}`, path.join(DIAG, `${fname}.png`));
  }

  // D — geometry field (refined if available)
  let fieldMesh = ctx.mesh;
  let fieldValues = result.values;
  let fieldNormals = normals;
  if (result.refinement?.triangles?.length) {
    const d = buildDerivedMesh(ctx.mesh, result.values, result.refinement, normals);
    fieldMesh = d.mesh;
    fieldValues = d.values;
    fieldNormals = d.normals ?? normals;
  }
  const fieldDerived = {
    mesh: fieldMesh,
    values: fieldValues,
    normals: fieldNormals,
  };
  for (const [fname, view] of [
    ["12-field-front-right", "front-right-30"],
    ["13-field-right", "right-90"],
    ["14-field-back-right", "back-right-30"],
  ]) {
    const camera = frameRegion(fieldMesh, fieldValues, VIEWS[view], 1.45);
    const png = await renderGF(
      fieldDerived,
      maskSampler,
      camera,
      720,
      960,
    ).toBuffer();
    await labeled(png, 720, `D ${fname}`, path.join(DIAG, `${fname}.png`));
  }

  // Final captures
  const finals = [
    ["01-front-right-30", "front-right-30", 720, 960],
    ["02-front-right-60", "front-right-60", 720, 960],
    ["03-right-90", "right-90", 720, 960],
    ["04-back-right-60", "back-right-60", 720, 960],
    ["05-back-right-30", "back-right-30", 720, 960],
    ["06-browser-front-right", "front-right-30", 512, 720],
    ["07-browser-right", "right-90", 512, 720],
    ["08-browser-back-right", "back-right-30", 512, 720],
  ];
  for (const [name, view, w, h] of finals) {
    const camera = frameRegion(fieldMesh, fieldValues, VIEWS[view], 1.4);
    const png = await renderGF(fieldDerived, maskSampler, camera, w, h).toBuffer();
    await labeled(
      png,
      w,
      `R02 V4.1 ${name}  ${result.stages.A}/${result.stages.B}/${result.stages.C}/${result.stages.D}`,
      path.join(FIN, `${name}.png`),
    );
  }

  writeFileSync(
    path.join(OUT, "evidence-index.json"),
    JSON.stringify(
      {
        stages: result.stages,
        diagnostic: [
          "01-boundary-loop-front-right.png",
          "02-boundary-loop-right.png",
          "03-boundary-loop-back-right.png",
          "04-boundary-endpoints.json",
          "05-u-field-front-right.png",
          "06-u-field-right.png",
          "07-u-field-back-right.png",
          "08-u-field-sections.png",
          "09-classification-front-right.png",
          "10-classification-right.png",
          "11-classification-back-right.png",
          "12-field-front-right.png",
          "13-field-right.png",
          "14-field-back-right.png",
        ],
        final: finals.map((f) => `${f[0]}.png`),
      },
      null,
      2,
    ),
  );

  // Ensure endpoints json exists even if generate wasn't run
  if (!existsSync(path.join(DIAG, "04-boundary-endpoints.json"))) {
    writeFileSync(
      path.join(DIAG, "04-boundary-endpoints.json"),
      JSON.stringify(result.loop.endpoints, null, 2),
    );
  }

  console.log(
    "EVIDENCE_V41_DONE",
    JSON.stringify({ stages: result.stages, out: OUT }),
  );
}

if (
  process.argv[1] &&
  process.argv[1]
    .replace(/\\/g, "/")
    .endsWith("render-right-ribs-v41-evidence.mjs")
) {
  renderRightRibsV41Evidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
