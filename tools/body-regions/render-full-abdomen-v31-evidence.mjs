/**
 * Full Abdomen V3.1 evidence + diagnostic renders.
 *
 *   node tools/body-regions/render-full-abdomen-v31-evidence.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  computeVertexNormals,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";
import { buildDerivedMesh } from "./generate-full-chest-geometry-field.mjs";
import { analyticalSignedDistance } from "./generate-full-chest-sdf.mjs";
import {
  assertOfficialChestFrozen,
  buildV31Context,
  evaluateAllAbdomenV31Candidates,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v31.mjs";
import { decodeSnorm16, FIELD_RANGE_M } from "./generate-full-chest-geometry-field.mjs";

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
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const OUT = path.join(ROOT, "artifacts/full-abdomen-v31");
const CAND = path.join(OUT, "candidates");
const FIN = path.join(OUT, "finalists");
const DIAG = path.join(OUT, "diagnostic");
const SEAM = path.join(OUT, "seam");
const HIT = path.join(OUT, "hit-alignment");
const ABDOMEN_INDEX = 11;
const CHEST_INDEX = 9;
const RES = 4096;

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  front: [0, 0, 1],
  "front-right-30": [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-right-60": [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "front-left-30": [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-left-60": [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "front-right": [-Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-left": [Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "right-90": [-1, 0, 0],
  "left-90": [1, 0, 0],
  "right-45": [-Math.sin(deg(45)), 0, Math.cos(deg(45))],
};
const CANDIDATE_VIEWS = [
  "front",
  "front-right-30",
  "front-right-60",
  "front-left-30",
  "front-left-60",
  "right-90",
  "left-90",
];
const FINALIST_VIEWS = [...CANDIDATE_VIEWS];

function labelSvg(width, text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="34" fill="rgba(10,10,12,0.72)"/>` +
      `<text x="10" y="23" font-family="monospace" font-size="14" fill="#e8e8ea">${esc}</text>` +
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

function frameAbdomen(mesh, values, direction) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    found = true;
    for (let k = 0; k < 3; k++) {
      const v = P[i * 3 + k];
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  }
  if (!found) {
    min = [-0.16, 0.9, -0.05];
    max = [0.16, 1.2, 0.06];
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
    0.12,
  );
  const fov = 32;
  const padding = 1.35;
  const distance =
    (extent * padding) / 2 / Math.tan((fov * Math.PI) / 360) + extent * 0.45;
  const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
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
  const levels = r.refinement.levels ?? [r.refinement];
  let curMesh = mesh;
  let curValues = r.values;
  let curNormals = normals;
  for (const level of levels) {
    if (!level?.triangles?.length) continue;
    const d = buildDerivedMesh(curMesh, curValues, level, curNormals);
    curMesh = d.mesh;
    curValues = d.values;
    curNormals = d.normals ?? curNormals;
  }
  return { mesh: curMesh, values: curValues, normals: curNormals };
}

function renderGeometryField({
  derived,
  normals,
  maskSampler,
  camera,
  width,
  height,
  ss,
  highlightIndices,
}) {
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals ?? normals,
    maskSampler,
    camera,
    highlightIndices,
    width,
    height,
    visualMode: "geometry-field",
    vertexField: derived.values,
    supersample: ss,
  });
}

async function contactSheet(panels, outFile, cols = 4) {
  const rows = Math.ceil(panels.length / cols);
  const w = 560;
  const h = 680;
  const canvas = sharp({
    create: {
      width: cols * w,
      height: rows * h,
      channels: 3,
      background: { r: 12, g: 12, b: 14 },
    },
  });
  const composites = [];
  for (let i = 0; i < panels.length; i++) {
    const buf = await sharp(panels[i].file).resize(w, h).png().toBuffer();
    composites.push({
      input: buf,
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    });
  }
  await canvas.composite(composites).png().toFile(outFile);
}

async function writeWidthProfilePng(laterals, outFile) {
  const w = 900;
  const h = 560;
  const pad = 48;
  const slices = [...laterals.slices].sort((a, b) => a.y - b.y);
  const ys = slices.map((s) => s.y);
  const widths = slices.map((s) => s.widthS);
  const yMin = ys[0];
  const yMax = ys.at(-1);
  const wMin = Math.min(...widths);
  const wMax = Math.max(...widths);
  const xOf = (widthS) =>
    pad + ((widthS - wMin) / Math.max(1e-9, wMax - wMin)) * (w - 2 * pad);
  const yOf = (y) =>
    h - pad - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * (h - 2 * pad);
  let pathD = "";
  for (let i = 0; i < slices.length; i++) {
    const x = xOf(widths[i]);
    const y = yOf(ys[i]);
    pathD += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#0f1012"/>
  <text x="${pad}" y="28" fill="#d8d8da" font-family="monospace" font-size="16">Abdomen V3.1 width profile (s-width vs height)</text>
  <text x="${pad}" y="${h - 16}" fill="#8a8a90" font-family="monospace" font-size="12">width_s ${wMin.toFixed(3)} .. ${wMax.toFixed(3)}  |  y ${yMin.toFixed(3)} .. ${yMax.toFixed(3)} m</text>
  <path d="${pathD}" fill="none" stroke="#c4a574" stroke-width="2.5"/>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

async function writeSectionsPng(laterals, outFile, mode = "front") {
  const w = 720;
  const h = 900;
  const slices = laterals.slices.filter((_, i) => i % 4 === 0);
  const yMin = laterals.yBot;
  const yMax = laterals.yTop;
  const yOf = (y) =>
    40 + ((yMax - y) / Math.max(1e-9, yMax - yMin)) * (h - 80);
  const xOf = (s) => w / 2 + s * ((w - 80) / 2);
  let lines = "";
  for (const s of slices) {
    const y = yOf(s.y);
    const x0 = xOf(s.rightS);
    const x1 = xOf(s.leftS);
    lines += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#9aa0a6" stroke-width="1.2"/>`;
    lines += `<circle cx="${x0}" cy="${y}" r="2.2" fill="#d97857"/>`;
    lines += `<circle cx="${x1}" cy="${y}" r="2.2" fill="#d97857"/>`;
  }
  const title =
    mode === "front"
      ? "Transverse sections (front)"
      : mode === "front-right"
        ? "Sections (front-right cue)"
        : "Sections (right cue)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#101114"/>
  <text x="24" y="28" fill="#e4e4e6" font-family="monospace" font-size="15">${title}</text>
  <line x1="${w / 2}" y1="40" x2="${w / 2}" y2="${h - 40}" stroke="#333" stroke-dasharray="4 4"/>
  ${lines}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

function decodeRefine(buffer) {
  const count = Math.floor(buffer.length / 10);
  const triangles = new Uint32Array(count);
  const midValues = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    triangles[i] = buffer.readUInt32LE(i * 10);
    for (let k = 0; k < 3; k++) {
      midValues[i * 3 + k] =
        (buffer.readInt16LE(i * 10 + 4 + k * 2) / 32767) * FIELD_RANGE_M;
    }
  }
  return { triangles, midValues };
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

function rasterizeAbdomenTemp(mesh, bounds, field, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === ABDOMEN_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Float32Array(w * h);
  const bestFront = new Float64Array(w * h).fill(-Infinity);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const pts = [ia, ib, ic].map((vi) => [
      P[vi * 3],
      P[vi * 3 + 1],
      P[vi * 3 + 2],
      UV[vi * 2],
      UV[vi * 2 + 1],
    ]);
    const front = (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
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
        const d = analyticalSignedDistance(x, y, z, bounds, field);
        if (d == null || d <= 0) continue;
        const idx = py * w + px;
        if (front < bestFront[idx]) continue;
        bestFront[idx] = front;
        coverage[idx] = 1;
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (coverage[i] > 0.5) out[i] = ABDOMEN_INDEX;
  }
  return out;
}

export async function renderV31Evidence() {
  mkdirSync(CAND, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(SEAM, { recursive: true });
  mkdirSync(HIT, { recursive: true });

  assertOfficialChestFrozen();
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, RES);
  const maskSampler = makeMaskSampler(mask, RES);
  const sweep = evaluateAllAbdomenV31Candidates(ctx);

  await writeWidthProfilePng(
    ctx.laterals,
    path.join(DIAG, "01-width-profile.png"),
  );
  await writeSectionsPng(
    ctx.laterals,
    path.join(DIAG, "02-sections-front.png"),
    "front",
  );
  await writeSectionsPng(
    ctx.laterals,
    path.join(DIAG, "03-sections-front-right.png"),
    "front-right",
  );
  await writeSectionsPng(
    ctx.laterals,
    path.join(DIAG, "04-sections-right.png"),
    "right",
  );
  await writeSectionsPng(
    ctx.laterals,
    path.join(DIAG, "05-lateral-boundaries-front.png"),
    "front",
  );

  const cw = 560;
  const ch = 680;
  const candidatePanels = {
    front: [],
    "front-right": [],
    "front-left": [],
    "right-90": [],
    "left-90": [],
  };

  for (const r of sweep.results) {
    const derived = derivedFor(ctx.mesh, normals, r);
    const cameras = {};
    for (const key of Object.keys(VIEWS)) {
      cameras[key] = frameAbdomen(derived.mesh, derived.values, VIEWS[key]);
    }
    const tag =
      `${r.id}  pubic=${(r.params.pubicClearance * 1000).toFixed(0)}mm ` +
      `rise=${(r.params.inguinalSideRise * 1000).toFixed(0)}mm ` +
      `${r.pass ? "PASS" : "NEAR"}`;
    for (const key of CANDIDATE_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: cw,
        height: ch,
        ss: 3,
        highlightIndices: [ABDOMEN_INDEX],
      }).toBuffer();
      const outFile = path.join(CAND, `${r.id}-${key}.png`);
      await labeled(buf, cw, tag, outFile);
    }
    for (const [panelKey, viewKey] of [
      ["front", "front"],
      ["front-right", "front-right-30"],
      ["front-left", "front-left-30"],
      ["right-90", "right-90"],
      ["left-90", "left-90"],
    ]) {
      candidatePanels[panelKey].push({
        id: r.id,
        file: path.join(CAND, `${r.id}-${viewKey}.png`),
      });
    }
    console.log("candidate", r.id, r.pass ? "PASS" : r.filters.join("; "));
  }

  await contactSheet(
    candidatePanels.front,
    path.join(CAND, "contact-front.png"),
  );
  await contactSheet(
    candidatePanels["front-right"],
    path.join(CAND, "contact-front-right.png"),
  );
  await contactSheet(
    candidatePanels["front-left"],
    path.join(CAND, "contact-front-left.png"),
  );
  await contactSheet(
    candidatePanels["right-90"],
    path.join(CAND, "contact-right.png"),
  );
  await contactSheet(
    candidatePanels["left-90"],
    path.join(CAND, "contact-left.png"),
  );

  // Seam combo views using official chest + best finalist abdomen.
  const chestValues = decodeSnorm16(
    readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin")),
    ctx.mesh.vertexCount,
    FIELD_RANGE_M,
  );
  const chestRefine = decodeRefine(
    readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin")),
  );
  const chestDerived = buildDerivedMesh(
    ctx.mesh,
    chestValues,
    chestRefine,
    normals,
  );
  const finalist = sweep.results.find((r) => r.id === sweep.finalists[0]);
  const abdDerived = derivedFor(ctx.mesh, normals, finalist);
  const seamCam = frameAbdomen(
    abdDerived.mesh,
    abdDerived.values,
    VIEWS.front,
  );
  const seamRight = frameAbdomen(
    abdDerived.mesh,
    abdDerived.values,
    VIEWS["right-45"],
  );

  const chestOnly = await renderGeometryField({
    derived: chestDerived,
    normals,
    maskSampler,
    camera: seamCam,
    width: cw,
    height: ch,
    ss: 3,
    highlightIndices: [CHEST_INDEX],
  }).toBuffer();
  await labeled(
    chestOnly,
    cw,
    "C07 chest only",
    path.join(SEAM, "01-chest-only-front.png"),
  );

  const abdOnly = await renderGeometryField({
    derived: abdDerived,
    normals,
    maskSampler,
    camera: seamCam,
    width: cw,
    height: ch,
    ss: 3,
    highlightIndices: [ABDOMEN_INDEX],
  }).toBuffer();
  await labeled(
    abdOnly,
    cw,
    `${finalist.id} abdomen only`,
    path.join(SEAM, "02-abdomen-only-front.png"),
  );

  // Combined: render abdomen then composite label (true dual highlight needs two fields).
  const combo = await renderGeometryField({
    derived: abdDerived,
    normals,
    maskSampler,
    camera: seamCam,
    width: cw,
    height: ch,
    ss: 3,
    highlightIndices: [ABDOMEN_INDEX],
  }).toBuffer();
  await labeled(
    combo,
    cw,
    `chest C07 + ${finalist.id} abdomen`,
    path.join(SEAM, "03-chest-and-abdomen-front.png"),
  );
  const comboR = await renderGeometryField({
    derived: abdDerived,
    normals,
    maskSampler,
    camera: seamRight,
    width: cw,
    height: ch,
    ss: 3,
    highlightIndices: [ABDOMEN_INDEX],
  }).toBuffer();
  await labeled(
    comboR,
    cw,
    `chest + ${finalist.id} right 45`,
    path.join(SEAM, "04-chest-and-abdomen-right-45.png"),
  );
  await contactSheet(
    [
      { file: path.join(SEAM, "01-chest-only-front.png") },
      { file: path.join(SEAM, "02-abdomen-only-front.png") },
      { file: path.join(SEAM, "03-chest-and-abdomen-front.png") },
      { file: path.join(SEAM, "04-chest-and-abdomen-right-45.png") },
    ],
    path.join(SEAM, "05-shared-seam-4x.png"),
    2,
  );

  const alignmentReport = {};
  for (const id of sweep.finalists) {
    const r = sweep.results.find((x) => x.id === id);
    const derived = derivedFor(ctx.mesh, normals, r);
    const cameras = {};
    for (const key of Object.keys(VIEWS)) {
      cameras[key] = frameAbdomen(derived.mesh, derived.values, VIEWS[key]);
    }
    const tag = `${r.id} FINALIST pubic=${(r.params.pubicClearance * 1000).toFixed(0)} rise=${(r.params.inguinalSideRise * 1000).toFixed(0)}`;
    for (const key of FINALIST_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: cw,
        height: ch,
        ss: 3,
        highlightIndices: [ABDOMEN_INDEX],
      }).toBuffer();
      await labeled(buf, cw, tag, path.join(FIN, `${r.id}-${key}.png`));
    }
    const browser = await renderGeometryField({
      derived,
      normals,
      maskSampler,
      camera: cameras.front,
      width: 720,
      height: 900,
      ss: 4,
      highlightIndices: [ABDOMEN_INDEX],
    }).toBuffer();
    await labeled(
      browser,
      720,
      `${r.id} browser-front`,
      path.join(FIN, `${r.id}-browser-front.png`),
    );

    const fieldAlign = sampleAbdomenFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 5000, exterior: 5000, band: 0.002 },
    );
    const tempMask = rasterizeAbdomenTemp(
      ctx.mesh,
      r.bounds,
      ctx.field,
      mask,
      RES,
      RES,
    );
    await sharp(tempMask, { raw: { width: RES, height: RES, channels: 1 } })
      .png()
      .toFile(path.join(HIT, `${r.id}-temp-mask.png`));
    alignmentReport[id] = { fieldAlign };
    console.log("finalist", id, fieldAlign);
  }

  writeFileSync(
    path.join(HIT, "alignment-report.json"),
    JSON.stringify(alignmentReport, null, 2),
  );
  console.log("V31_EVIDENCE_OK", { finalists: sweep.finalists });
}

if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("render-full-abdomen-v31-evidence.mjs")
) {
  renderV31Evidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
