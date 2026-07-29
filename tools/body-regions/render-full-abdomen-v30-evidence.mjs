/**
 * Full Abdomen V3.0 evidence — candidate sheets, finalists, temp alignment.
 *
 * Uses Geometry Distance Field visual path only. Never promotes official assets.
 *
 *   node tools/body-regions/render-full-abdomen-v30-evidence.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
  buildV30Context,
  evaluateAllAbdomenCandidates,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v30.mjs";

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
const OUT = path.join(ROOT, "artifacts/full-abdomen-v30");
const CAND = path.join(OUT, "candidates");
const FIN = path.join(OUT, "finalists");
const HIT = path.join(OUT, "hit-alignment");
const ABDOMEN_INDEX = 11;
const RES = 4096;

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  front: [0, 0, 1],
  "front-right-45": [-Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-left-45": [Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-right-30": [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-right-60": [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "front-left-30": [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-left-60": [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "right-90": [-1, 0, 0],
  "left-90": [1, 0, 0],
};
const CANDIDATE_VIEWS = [
  "front",
  "front-right-45",
  "front-left-45",
  "right-90",
  "left-90",
];
const FINALIST_VIEWS = [
  "front",
  "front-right-30",
  "front-right-60",
  "front-left-30",
  "front-left-60",
  "right-90",
  "left-90",
];

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

function labelSvg(width, text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="34" fill="rgba(10,10,12,0.72)"/>` +
      `<text x="10" y="23" font-family="monospace" font-size="15" fill="#e8e8ea">${esc}</text>` +
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
  // Prefer field-positive vertices for framing; fall back to waist box.
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

function derivedFor(mesh, normals, field, r) {
  return buildDerivedMesh(mesh, r.values, r.refinement, normals);
}

function renderGeometryField({
  derived,
  normals,
  maskSampler,
  camera,
  width,
  height,
  ss,
}) {
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals ?? normals,
    maskSampler,
    camera,
    highlightIndices: [ABDOMEN_INDEX],
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

/** Stamp abdomen analytic region into a temp mask (does not touch official). */
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
    // Coarse bounding UV box
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
        // Barycentric in UV
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

function sampleMaskVsField(mesh, mask, values, bounds, opts = {}) {
  const band = opts.band ?? 0.002;
  const wantInterior = opts.interior ?? 3000;
  const wantExterior = opts.exterior ?? 3000;
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const w = RES;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;
  const bary = [
    [0.25, 0.25],
    [0.5, 0.25],
    [0.25, 0.5],
    [0.34, 0.34],
    [0.6, 0.2],
    [0.2, 0.6],
    [0.4, 0.2],
    [0.2, 0.4],
  ];
  const yMin = bounds.meta.yBot - 0.05;
  const yMax = bounds.meta.yTop + 0.05;
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (interior >= wantInterior && exterior >= wantExterior) break;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    if (
      Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) < yMin ||
      Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) > yMax
    ) {
      continue;
    }
    for (const [u, v] of bary) {
      const ww = 1 - u - v;
      const fieldValue = values[a] * ww + values[b] * u + values[c] * v;
      if (Math.abs(fieldValue) <= band) continue;
      const uu = UV[a * 2] * ww + UV[b * 2] * u + UV[c * 2] * v;
      const vv = UV[a * 2 + 1] * ww + UV[b * 2 + 1] * u + UV[c * 2 + 1] * v;
      const px = Math.min(w - 1, Math.max(0, Math.floor(uu * w)));
      const py = Math.min(w - 1, Math.max(0, Math.floor((1 - vv) * w)));
      // Skip UV-ambiguous neighborhoods (categorical ±band analogue).
      let hasAbd = false;
      let hasOther = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = Math.min(w - 1, Math.max(0, px + dx));
          const qy = Math.min(w - 1, Math.max(0, py + dy));
          const nid = mask[qy * w + qx];
          if (nid === ABDOMEN_INDEX) hasAbd = true;
          else if (nid !== 0) hasOther = true;
        }
      }
      if (hasAbd && hasOther) continue;
      const id = mask[py * w + px];
      const maskInside = id === ABDOMEN_INDEX;
      const fieldInside = fieldValue > 0;
      if (fieldInside) {
        if (interior < wantInterior) {
          interior++;
          if (!maskInside) interiorMismatch++;
        }
      } else if (exterior < wantExterior) {
        exterior++;
        if (maskInside) exteriorMismatch++;
      }
    }
  }
  return {
    interior,
    exterior,
    interiorMismatch,
    exteriorMismatch,
    pass: interiorMismatch === 0 && exteriorMismatch === 0,
  };
}

export async function renderV30Evidence() {
  mkdirSync(CAND, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  mkdirSync(HIT, { recursive: true });

  const ctx = buildV30Context(GLB, LANDMARKS);
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, RES);
  const maskSampler = makeMaskSampler(mask, RES);
  const { results, finalists } = evaluateAllAbdomenCandidates(ctx);

  const cw = 560;
  const ch = 680;
  const candidatePanels = {};
  for (const key of CANDIDATE_VIEWS) candidatePanels[key] = [];

  for (const r of results) {
    const derived = derivedFor(ctx.mesh, normals, ctx.field, r);
    const cameras = {};
    for (const key of Object.keys(VIEWS)) {
      cameras[key] = frameAbdomen(ctx.mesh, r.values, VIEWS[key]);
    }
    const tag =
      `${r.id}  pubic=${(r.params.pubicClearance * 1000).toFixed(0)}mm ` +
      `rise=${(r.params.lowerSideRise * 1000).toFixed(0)}mm ` +
      `lat=${r.params.lateralCoverage} ` +
      `${r.pass ? "PASS" : "FAIL"}`;
    for (const key of CANDIDATE_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: cw,
        height: ch,
        ss: 3,
      }).toBuffer();
      const outFile = path.join(CAND, `${r.id}-${key}.png`);
      await labeled(buf, cw, tag, outFile);
      candidatePanels[key].push({ id: r.id, file: outFile });
    }
    console.log("candidate", r.id, r.pass ? "PASS" : "FAIL");
  }

  const contactMap = {
    front: "contact-front.png",
    "front-right-45": "contact-front-right.png",
    "front-left-45": "contact-front-left.png",
    "right-90": "contact-right.png",
    "left-90": "contact-left.png",
  };
  for (const [key, name] of Object.entries(contactMap)) {
    await contactSheet(candidatePanels[key], path.join(CAND, name));
  }

  const alignmentReport = {};
  for (const id of finalists) {
    const r = results.find((x) => x.id === id);
    const derived = derivedFor(ctx.mesh, normals, ctx.field, r);
    const cameras = {};
    for (const key of Object.keys(VIEWS)) {
      cameras[key] = frameAbdomen(ctx.mesh, r.values, VIEWS[key]);
    }
    const tag =
      `${r.id} FINALIST  pubic=${(r.params.pubicClearance * 1000).toFixed(0)}mm ` +
      `rise=${(r.params.lowerSideRise * 1000).toFixed(0)}mm ` +
      `lat=${r.params.lateralCoverage}`;
    for (const key of FINALIST_VIEWS) {
      const buf = await renderGeometryField({
        derived,
        normals,
        maskSampler,
        camera: cameras[key],
        width: cw,
        height: ch,
        ss: 3,
      }).toBuffer();
      await labeled(buf, cw, tag, path.join(FIN, `${r.id}-${key}.png`));
    }
    // Browser-style front (same GDF path).
    const browser = await renderGeometryField({
      derived,
      normals,
      maskSampler,
      camera: cameras.front,
      width: 720,
      height: 900,
      ss: 4,
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
      { interior: 3000, exterior: 3000, band: 0.002 },
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
    const maskAlign = sampleMaskVsField(
      ctx.mesh,
      tempMask,
      r.values,
      r.bounds,
      { interior: 3000, exterior: 3000, band: 0.002 },
    );
    alignmentReport[id] = { fieldAlign, maskAlign };
    console.log("finalist", id, fieldAlign, maskAlign);
  }

  writeFileSync(
    path.join(HIT, "alignment-report.json"),
    JSON.stringify(alignmentReport, null, 2),
  );
  console.log("V30_EVIDENCE_OK", { finalists });
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("render-full-abdomen-v30-evidence.mjs")) {
  renderV30Evidence();
}
