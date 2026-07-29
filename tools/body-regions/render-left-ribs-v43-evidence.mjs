/**
 * Left Ribs V4.3 evidence — stages A–D diagnostics + final L01 captures.
 *
 * Renders only into artifacts/left-ribs-v43/. The official categorical mask is
 * read for shading context and never written.
 *
 *   node tools/body-regions/render-left-ribs-v43-evidence.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  computeVertexNormals,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import {
  assertOfficialTorsoRegionsFrozen,
  buildDerivedMesh,
  buildRibsV41Context,
  decodeSnorm16,
  evaluateRibsV41,
  FIELD_RANGE_M,
  getRibsSideConfig,
  L01,
} from "./ribs-v41-core.mjs";

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
const RIGHT_FIELD = path.join(
  ROOT,
  "public/models/interaction/fields/neutro_body_v1_right_ribs_sdf.bin",
);
const OUT = path.join(ROOT, "artifacts/left-ribs-v43");
const DIAG = path.join(OUT, "diagnostic");
const FIN = path.join(OUT, "final");

const LEFT_INDEX = getRibsSideConfig("left").maskIndex;
const RIGHT_INDEX = getRibsSideConfig("right").maskIndex;

const deg = (d) => (d * Math.PI) / 180;
// Anatomical left is +X, so left-side cameras sit on the positive X half.
const VIEWS = {
  "front-left-30": [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-left-60": [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "left-90": [1, 0, 0],
  "back-left-60": [Math.sin(deg(60)), 0, -Math.cos(deg(60))],
  "back-left-30": [Math.sin(deg(30)), 0, -Math.cos(deg(30))],
  front: [0, 0, 1],
  back: [0, 0, -1],
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
    min = [0.05, 1.05, -0.14];
    max = [0.22, 1.32, 0.02];
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

function renderGF(derived, maskSampler, camera, w, h, highlight) {
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals,
    maskSampler,
    camera,
    highlightIndices: highlight,
    width: w,
    height: h,
    visualMode: "geometry-field",
    vertexField: derived.values,
    supersample: 1,
  });
}

/** False-color u_ribs as a vertex field usable by the geometry-field shader. */
function uAsField(uField) {
  const out = new Float32Array(uField.length);
  for (let i = 0; i < uField.length; i++) {
    const u = uField[i];
    if (!Number.isFinite(u)) {
      out[i] = -0.02;
      continue;
    }
    if (u >= 0 && u <= 1) out[i] = 0.002 + u * 0.016;
    else out[i] = -0.01;
  }
  return out;
}

async function drawLoopSchematic(loop, outFile, title) {
  const W = 720;
  const H = 900;
  // Left view: +X toward the viewer, Y vertical.
  const project = (p) => {
    const x = 360 + (p[0] - 0.12) * 2200;
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
  <text x="${pad}" y="28" fill="#d8d8dc" font-family="monospace" font-size="14">07-width-profile  left arc length (m) vs Y</text>
  <path d="${poly}" fill="none" stroke="#7d9b76" stroke-width="2.5"/>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

export async function renderLeftRibsV43Evidence() {
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  const freeze = assertOfficialTorsoRegionsFrozen();
  const ctx = buildRibsV41Context("left", GLB, LANDMARKS, {
    freeze,
    params: L01,
  });
  const result = evaluateRibsV41(ctx);
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, 4096);
  const maskSampler = makeMaskSampler(mask, 4096);
  const leftOnly = [LEFT_INDEX];
  const bothIdx = [LEFT_INDEX, RIGHT_INDEX];

  // A — boundary loops
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "01-boundary-loop-front-left.png"),
    "A 01-boundary-loop-front-left",
  );
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "02-boundary-loop-left.png"),
    "A 02-boundary-loop-left",
  );
  await drawLoopSchematic(
    result.loop,
    path.join(DIAG, "03-boundary-loop-back-left.png"),
    "A 03-boundary-loop-back-left",
  );
  writeFileSync(
    path.join(DIAG, "boundary-endpoints.json"),
    `${JSON.stringify(
      {
        version: "4.3",
        candidateId: L01.id,
        endpoints: result.loop.endpoints,
        diagnostics: result.loop.diagnostics,
      },
      null,
      2,
    )}\n`,
  );

  // B — u_ribs field (spec names 04–06)
  const uValues = uAsField(result.uField);
  const uDerived = { mesh: ctx.mesh, values: uValues, normals };
  for (const [fname, view] of [
    ["04-u-field-front-left", "front-left-30"],
    ["05-u-field-left", "left-90"],
    ["06-u-field-back-left", "back-left-30"],
  ]) {
    const camera = frameRegion(ctx.mesh, result.values, VIEWS[view], 1.5);
    const png = await renderGF(
      uDerived,
      maskSampler,
      camera,
      720,
      960,
      leftOnly,
    ).toBuffer();
    await labeled(png, 720, `B ${fname}`, path.join(DIAG, `${fname}.png`));
  }

  let fieldMesh = ctx.mesh;
  let fieldValues = result.values;
  let fieldNormals = normals;
  if (result.refinement?.triangles?.length) {
    const d = buildDerivedMesh(
      ctx.mesh,
      result.values,
      result.refinement,
      normals,
    );
    fieldMesh = d.mesh;
    fieldValues = d.values;
    fieldNormals = d.normals ?? normals;
  }
  const fieldDerived = {
    mesh: fieldMesh,
    values: fieldValues,
    normals: fieldNormals,
  };

  // Both-ribs overlay: official right field + left L01 on the base mesh.
  const rightValues = decodeSnorm16(
    readFileSync(RIGHT_FIELD),
    ctx.mesh.vertexCount,
    FIELD_RANGE_M,
  );
  const bothValues = new Float32Array(ctx.mesh.vertexCount);
  for (let i = 0; i < ctx.mesh.vertexCount; i++) {
    bothValues[i] = Math.max(result.values[i], rightValues[i]);
  }
  const bothDerived = { mesh: ctx.mesh, values: bothValues, normals };

  // Spec diagnostic 07–09: width profile + bilateral overlays.
  await drawUSections(result.atlas, path.join(DIAG, "07-width-profile.png"));
  {
    const cameraF = frameRegion(ctx.mesh, bothValues, VIEWS.front, 1.55);
    const pngF = await renderGF(
      bothDerived,
      maskSampler,
      cameraF,
      720,
      960,
      bothIdx,
    ).toBuffer();
    await labeled(
      pngF,
      720,
      "08-bilateral-overlay-front",
      path.join(DIAG, "08-bilateral-overlay-front.png"),
    );
    const cameraB = frameRegion(ctx.mesh, bothValues, VIEWS.back, 1.55);
    const pngB = await renderGF(
      bothDerived,
      maskSampler,
      cameraB,
      720,
      960,
      bothIdx,
    ).toBuffer();
    await labeled(
      pngB,
      720,
      "09-bilateral-overlay-back",
      path.join(DIAG, "09-bilateral-overlay-back.png"),
    );
  }

  const stageTag = `${result.stages.A}/${result.stages.B}/${result.stages.C}/${result.stages.D}`;
  const finals = [
    ["01-front-left-30", "front-left-30", 720, 960, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["02-front-left-60", "front-left-60", 720, 960, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["03-left-90", "left-90", 720, 960, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["04-back-left-60", "back-left-60", 720, 960, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["05-back-left-30", "back-left-30", 720, 960, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["06-browser-front-left", "front-left-30", 512, 720, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["07-browser-left", "left-90", 512, 720, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["08-browser-back-left", "back-left-30", 512, 720, fieldDerived, fieldMesh, fieldValues, leftOnly],
    ["09-both-ribs-front", "front", 720, 960, bothDerived, ctx.mesh, bothValues, bothIdx],
    ["10-both-ribs-back", "back", 720, 960, bothDerived, ctx.mesh, bothValues, bothIdx],
    ["11-both-ribs-side-comparison", "front-left-60", 720, 960, bothDerived, ctx.mesh, bothValues, bothIdx],
  ];
  for (const [name, view, w, h, derived, frameMesh, frameValues, hl] of finals) {
    const camera = frameRegion(frameMesh, frameValues, VIEWS[view], 1.4);
    const png = await renderGF(derived, maskSampler, camera, w, h, hl).toBuffer();
    await labeled(png, w, `L01 V4.3 ${name}  ${stageTag}`, path.join(FIN, `${name}.png`));
  }

  const diagnostic = [
    "01-boundary-loop-front-left.png",
    "02-boundary-loop-left.png",
    "03-boundary-loop-back-left.png",
    "04-u-field-front-left.png",
    "05-u-field-left.png",
    "06-u-field-back-left.png",
    "07-width-profile.png",
    "08-bilateral-overlay-front.png",
    "09-bilateral-overlay-back.png",
  ];
  writeFileSync(
    path.join(OUT, "evidence-index.json"),
    `${JSON.stringify(
      {
        version: "4.3",
        candidateId: L01.id,
        stages: result.stages,
        officialAssetsOverwritten: false,
        diagnostic,
        final: finals.map((f) => `${f[0]}.png`),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    "EVIDENCE_V43_DONE",
    JSON.stringify({ stages: result.stages, out: OUT }),
  );
}

if (
  process.argv[1] &&
  process.argv[1]
    .replace(/\\/g, "/")
    .endsWith("render-left-ribs-v43-evidence.mjs")
) {
  renderLeftRibsV43Evidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
