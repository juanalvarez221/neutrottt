/**
 * Full Abdomen V3.2 evidence — residual diagnostics, finalists, compares, browser sizes.
 *
 *   node tools/body-regions/render-full-abdomen-v32-evidence.mjs
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
import {
  assertOfficialChestFrozen,
  buildV31Context,
  evaluateAllAbdomenV32Candidates,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v32.mjs";

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
const OUT = path.join(ROOT, "artifacts/full-abdomen-v32");
const DIAG = path.join(OUT, "diagnostic");
const FIN = path.join(OUT, "finalists");
const BROWSER = path.join(OUT, "browser");
const ABDOMEN_INDEX = 11;

const deg = (d) => (d * Math.PI) / 180;
const VIEWS = {
  front: [0, 0, 1],
  "front-right-30": [-Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-right-45": [-Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-right-60": [-Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "front-left-30": [Math.sin(deg(30)), 0, Math.cos(deg(30))],
  "front-left-45": [Math.sin(deg(45)), 0, Math.cos(deg(45))],
  "front-left-60": [Math.sin(deg(60)), 0, Math.cos(deg(60))],
  "right-90": [-1, 0, 0],
  "left-90": [1, 0, 0],
};

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

function frameRegion(mesh, values, direction, pad = 1.35) {
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
  const distance =
    (extent * pad) / 2 / Math.tan((fov * Math.PI) / 360) + extent * 0.45;
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

function frameWaist(mesh, values, direction, side) {
  const P = mesh.positions;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (Math.abs(values[i]) > 0.006) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    if (y < 1.05 || y > 1.18) continue;
    if (side === "right" && x > -0.04) continue;
    if (side === "left" && x < 0.04) continue;
    found = true;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i * 3 + k]);
      max[k] = Math.max(max[k], P[i * 3 + k]);
    }
  }
  if (!found) return frameRegion(mesh, values, direction, 0.55);
  const target = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const extent = Math.max(0.04, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const fov = 28;
  const distance = (extent * 0.9) / 2 / Math.tan((fov * Math.PI) / 360) + 0.08;
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
  // V3.1 multilevel then V3.2 final mesh if present.
  if (r.v32?.finalMesh) {
    return {
      mesh: r.v32.finalMesh,
      values: r.v32.finalValues,
      normals,
    };
  }
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

function renderGF({ derived, normals, maskSampler, camera, w, h, ss }) {
  return renderView({
    mesh: derived.mesh,
    normals: derived.normals ?? normals,
    maskSampler,
    camera,
    highlightIndices: [ABDOMEN_INDEX],
    width: w,
    height: h,
    visualMode: "geometry-field",
    vertexField: derived.values,
    supersample: ss,
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

async function residualOverlayPng(residuals, outFile, title) {
  const w = 720;
  const h = 900;
  let marks = "";
  for (const r of residuals) {
    const x = 360 + r.centroid[0] * 1800;
    const y = 120 + (1.22 - r.centroid[1]) * 2200;
    const rad = 4 + Math.min(10, r.errorMax * 2000);
    marks += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#d97857" fill-opacity="0.85"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#101114"/>
  <text x="24" y="32" fill="#e8e8ea" font-family="monospace" font-size="15">${title}</text>
  <text x="24" y="54" fill="#9aa0a6" font-family="monospace" font-size="12">residual tris error &gt; 3.5 mm</text>
  ${marks}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outFile);
}

export async function renderV32Evidence() {
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(FIN, { recursive: true });
  mkdirSync(BROWSER, { recursive: true });

  assertOfficialChestFrozen();
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const normals = computeVertexNormals(ctx.mesh);
  const mask = await readSingleChannel(OFFICIAL_MASK, 4096);
  const maskSampler = makeMaskSampler(mask, 4096);
  const { results } = evaluateAllAbdomenV32Candidates(ctx);

  const cw = 560;
  const ch = 680;
  const compareFront = [];
  const compareLower = [];
  const compareFR = [];
  const compareFL = [];

  for (const r of results) {
    const derived = derivedFor(ctx.mesh, normals, r);
    const tag =
      `${r.id} V3.2 pubic=${(r.params.pubicClearance * 1000).toFixed(0)} ` +
      `rise=${(r.params.inguinalSideRise * 1000).toFixed(0)} ` +
      `max=${(r.refinedIsoline.precision.max * 1000).toFixed(2)}mm ` +
      `${r.pass ? "PASS" : "FAIL"}`;

    await residualOverlayPng(
      r.v32?.residualsBefore ?? [],
      path.join(DIAG, `0${r.id === "B01" ? "3" : "5"}-${r.id}-residual-front.png`),
      `${r.id} residual front`,
    );
    await residualOverlayPng(
      r.v32?.residualsBefore ?? [],
      path.join(
        DIAG,
        `0${r.id === "B01" ? "4" : "6"}-${r.id}-residual-front-right.png`,
      ),
      `${r.id} residual front-right`,
    );

    const cams = {};
    for (const [k, d] of Object.entries(VIEWS)) {
      cams[k] = frameRegion(derived.mesh, derived.values, d);
    }
    const finalistViews = [
      "front",
      "front-right-30",
      "front-right-60",
      "front-left-30",
      "front-left-60",
      "right-90",
      "left-90",
    ];
    for (const key of finalistViews) {
      const buf = await renderGF({
        derived,
        normals,
        maskSampler,
        camera: cams[key],
        w: cw,
        h: ch,
        ss: 3,
      }).toBuffer();
      const out = path.join(FIN, `${r.id}-${key}.png`);
      await labeled(buf, cw, tag, out);
    }

    // Lower boundary 2x and waist 4x crops via tighter framing.
    const lowerCam = frameRegion(derived.mesh, derived.values, VIEWS.front, 0.7);
    lowerCam.target[1] -= 0.06;
    const lowerBuf = await renderGF({
      derived,
      normals,
      maskSampler,
      camera: lowerCam,
      w: cw,
      h: ch,
      ss: 4,
    }).toBuffer();
    await labeled(
      lowerBuf,
      cw,
      `${r.id} lower-boundary-2x`,
      path.join(FIN, `${r.id}-lower-boundary-2x.png`),
    );

    for (const side of ["right", "left"]) {
      const cam = frameWaist(
        derived.mesh,
        derived.values,
        side === "right" ? VIEWS["front-right-45"] : VIEWS["front-left-45"],
        side,
      );
      const buf = await renderGF({
        derived,
        normals,
        maskSampler,
        camera: cam,
        w: cw,
        h: ch,
        ss: 4,
      }).toBuffer();
      await labeled(
        buf,
        cw,
        `${r.id} waist-${side}-4x`,
        path.join(FIN, `${r.id}-waist-${side}-4x.png`),
      );
    }

    compareFront.push(path.join(FIN, `${r.id}-front.png`));
    compareLower.push(path.join(FIN, `${r.id}-lower-boundary-2x.png`));
    compareFR.push(path.join(FIN, `${r.id}-front-right-30.png`));
    compareFL.push(path.join(FIN, `${r.id}-front-left-30.png`));

    // Browser-sized captures (Geometry Field offline = same visual authority).
    const browserSpecs = [
      ["browser-desktop-front", VIEWS.front, 1280, 800],
      ["browser-desktop-front-right-45", VIEWS["front-right-45"], 1280, 800],
      ["browser-desktop-front-left-45", VIEWS["front-left-45"], 1280, 800],
      ["browser-tablet-front", VIEWS.front, 834, 1112],
      ["browser-mobile-front", VIEWS.front, 390, 844],
    ];
    for (const [name, dir, w, h] of browserSpecs) {
      const cam = frameRegion(derived.mesh, derived.values, dir, 1.4);
      const buf = await renderGF({
        derived,
        normals,
        maskSampler,
        camera: cam,
        w,
        h,
        ss: 3,
      }).toBuffer();
      await labeled(
        buf,
        w,
        `${r.id} ${name} GDF`,
        path.join(BROWSER, `${r.id}-${name}.png`),
      );
    }

    const align = sampleAbdomenFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 5000, exterior: 5000, band: 0.002 },
    );
    console.log(r.id, r.pass ? "PASS" : "FAIL", {
      maxMm: +(r.refinedIsoline.precision.max * 1000).toFixed(3),
      residuals: r.v32?.residualCount,
      align,
    });
  }

  await contactSheet(compareFront, path.join(FIN, "compare-front.png"));
  await contactSheet(compareLower, path.join(FIN, "compare-lower-boundary.png"));
  await contactSheet(compareFR, path.join(FIN, "compare-front-right.png"));
  await contactSheet(compareFL, path.join(FIN, "compare-front-left.png"));

  writeFileSync(
    path.join(OUT, "evidence-manifest.json"),
    JSON.stringify(
      {
        finalists: results.map((r) => r.id),
        passers: results.filter((r) => r.pass).map((r) => r.id),
      },
      null,
      2,
    ),
  );
  console.log("V32_EVIDENCE_OK");
}

if (
  process.argv[1]
    ?.replace(/\\/g, "/")
    .endsWith("render-full-abdomen-v32-evidence.mjs")
) {
  renderV32Evidence().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
