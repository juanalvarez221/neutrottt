/**
 * Neck V6.0 — diagnostic + candidate contact-sheet PNGs (sharp).
 *   node tools/body-regions/render-neck-v60-evidence.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  NECK_V60_OUT,
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./neck-v60-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = NECK_V60_OUT;

function ensure(p) {
  mkdirSync(p, { recursive: true });
}

async function writeRgb(file, w, h, rgb) {
  await sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(file);
}

function paintBackground(w, h, rgb, color = [18, 20, 24]) {
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = color[0];
    rgb[i * 3 + 1] = color[1];
    rgb[i * 3 + 2] = color[2];
  }
}

function project(p, w, h, view = "front") {
  let x = p[0];
  let y = p[1];
  let z = p[2];
  if (view === "back") x = -x;
  if (view === "right") {
    x = -z;
    z = p[0];
  }
  if (view === "left") {
    x = z;
    z = -p[0];
  }
  const u = (x + 0.12) / 0.24;
  const v = 1 - (y - 1.38) / 0.28;
  return [
    Math.round(Math.max(0, Math.min(w - 1, u * w))),
    Math.round(Math.max(0, Math.min(h - 1, v * h))),
  ];
}

function dot(rgb, w, h, x, y, color, r = 1) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = (yy * w + xx) * 3;
      rgb[i] = color[0];
      rgb[i + 1] = color[1];
      rgb[i + 2] = color[2];
    }
  }
}

function strokePoly(rgb, w, h, pts, color, view) {
  for (const p of pts) {
    if (!p) continue;
    const [x, y] = project(p, w, h, view);
    dot(rgb, w, h, x, y, color, 1);
  }
}

function paintField(rgb, w, h, mesh, values, view, color) {
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    if (p[1] < 1.38 || p[1] > 1.66) continue;
    const [x, y] = project(p, w, h, view);
    const t = Math.min(1, values[i] / 0.01);
    const c = [
      Math.round(color[0] * t + 18 * (1 - t)),
      Math.round(color[1] * t + 20 * (1 - t)),
      Math.round(color[2] * t + 24 * (1 - t)),
    ];
    dot(rgb, w, h, x, y, c, 1);
  }
}

async function renderDiag(ctx, atlas, upper, lower, landmarks) {
  const diag = path.join(OUT, "diagnostic");
  ensure(diag);
  const w = 640;
  const h = 800;

  // 01 axis
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, upper.pts, [220, 180, 90], "front");
    strokePoly(rgb, w, h, lower.pts, [90, 180, 220], "front");
    const axisPts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      axisPts.push([
        atlas.axisOrigin[0] + (atlas.axisEnd[0] - atlas.axisOrigin[0]) * t,
        atlas.axisOrigin[1] + (atlas.axisEnd[1] - atlas.axisOrigin[1]) * t,
        atlas.axisOrigin[2] + (atlas.axisEnd[2] - atlas.axisOrigin[2]) * t,
      ]);
    }
    strokePoly(rgb, w, h, axisPts, [240, 240, 240], "front");
    await writeRgb(path.join(diag, "01-neck-axis.png"), w, h, rgb);
  }
  // 02 upper / 03 lower
  for (const [name, loop, view] of [
    ["02-upper-loop.png", upper.pts, "front"],
    ["03-lower-loop.png", lower.pts, "front"],
  ]) {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, loop, [120, 220, 160], view);
    await writeRgb(path.join(diag, name), w, h, rgb);
  }
  // 04-07 u-neck views
  const mid = atlas.slices.find((s) => s.ok && Math.abs(s.v - 0.5) < 0.08);
  for (const [name, view] of [
    ["04-u-neck-front.png", "front"],
    ["05-u-neck-right.png", "right"],
    ["06-u-neck-back.png", "back"],
    ["07-u-neck-left.png", "left"],
  ]) {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices) {
      if (!sl.ok) continue;
      for (let i = 0; i < sl.pts.length; i++) {
        const u = sl.uOf[i];
        const c = [
          Math.round(40 + 180 * u),
          Math.round(80 + 100 * (1 - u)),
          Math.round(200 - 120 * u),
        ];
        const [x, y] = project(sl.pts[i], w, h, view);
        dot(rgb, w, h, x, y, c, 1);
      }
    }
    await writeRgb(path.join(diag, name), w, h, rgb);
  }
  // 08 v gradient
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices) {
      if (!sl.ok) continue;
      const c = [
        Math.round(40 + 200 * sl.v),
        Math.round(180 - 80 * sl.v),
        Math.round(100 + 40 * sl.v),
      ];
      strokePoly(rgb, w, h, sl.pts, c, "front");
    }
    await writeRgb(path.join(diag, "08-v-neck-gradient.png"), w, h, rgb);
  }
  // 09 sections
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (let i = 0; i < atlas.slices.length; i += 4) {
      const sl = atlas.slices[i];
      if (!sl.ok) continue;
      strokePoly(rgb, w, h, sl.pts, [160, 200, 220], "front");
    }
    if (mid) strokePoly(rgb, w, h, mid.pts, [255, 220, 80], "front");
    await writeRgb(path.join(diag, "09-neck-sections.png"), w, h, rgb);
  }
  writeFileSync(
    path.join(diag, "landmarks-overlay.json"),
    JSON.stringify(
      {
        derived: Object.fromEntries(
          Object.entries(landmarks.derived).map(([k, v]) => [k, v.position]),
        ),
      },
      null,
      2,
    ),
  );
}

async function renderCandidates(ctx) {
  const report = JSON.parse(readFileSync(path.join(OUT, "report.json"), "utf8"));
  const candRoot = path.join(OUT, "candidates");
  const colors = {
    neck_front: [80, 200, 220],
    neck_right: [220, 140, 80],
    neck_back: [120, 160, 240],
    neck_left: [200, 120, 200],
    full_neck: [180, 210, 160],
  };
  const views = {
    neck_front: "front",
    neck_right: "right",
    neck_back: "back",
    neck_left: "left",
  };
  const w = 480;
  const h = 640;
  for (const c of report.candidates) {
    const dir = path.join(candRoot, c.id);
    for (const region of Object.keys(colors)) {
      const sdfPath = path.join(dir, `${region}_sdf.bin`);
      if (!existsSync(sdfPath)) continue;
      const values = decodeSnorm16(
        readFileSync(sdfPath),
        ctx.mesh.vertexCount,
        FIELD_RANGE_M,
      );
      const view = views[region] || "front";
      const rgb = new Uint8Array(w * h * 3);
      paintBackground(w, h, rgb);
      paintField(rgb, w, h, ctx.mesh, values, view, colors[region]);
      // Caption bar
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < 28; y++) {
          const i = (y * w + x) * 3;
          rgb[i] = 12;
          rgb[i + 1] = 14;
          rgb[i + 2] = 18;
        }
      }
      if (region === "full_neck") {
        for (const v of ["front", "right", "back", "left"]) {
          const rgb2 = new Uint8Array(w * h * 3);
          paintBackground(w, h, rgb2);
          paintField(rgb2, w, h, ctx.mesh, values, v, colors.full_neck);
          await writeRgb(
            path.join(candRoot, `${c.id}-full-neck-${v}.png`),
            w,
            h,
            rgb2,
          );
        }
      } else {
        const outName = `${c.id}-${region.replace(/^neck_/, "")}-neck.png`;
        await writeRgb(path.join(candRoot, outName), w, h, rgb);
      }
    }
  }

  // Contact sheets 2x2 for each region across N01-N03
  const ids = ["N01", "N02", "N03"];
  for (const region of [
    "neck_front",
    "neck_right",
    "neck_back",
    "neck_left",
    "full_neck",
  ]) {
    const cw = w * 2;
    const ch = h * 2;
    const sheet = new Uint8Array(cw * ch * 3);
    paintBackground(cw, ch, sheet, [10, 12, 14]);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const sdfPath = path.join(candRoot, id, `${region}_sdf.bin`);
      if (!existsSync(sdfPath)) continue;
      const values = decodeSnorm16(
        readFileSync(sdfPath),
        ctx.mesh.vertexCount,
        FIELD_RANGE_M,
      );
      const view =
        region === "full_neck"
          ? "front"
          : views[region] || "front";
      const tile = new Uint8Array(w * h * 3);
      paintBackground(w, h, tile);
      paintField(tile, w, h, ctx.mesh, values, view, colors[region]);
      const col = i % 2;
      const row = Math.floor(i / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = ((row * h + y) * cw + (col * w + x)) * 3;
          const ti = (y * w + x) * 3;
          sheet[si] = tile[ti];
          sheet[si + 1] = tile[ti + 1];
          sheet[si + 2] = tile[ti + 2];
        }
      }
    }
    const name =
      region === "full_neck"
        ? "contact-full-neck.png"
        : `contact-${region.replace(/^neck_/, "")}-neck.png`;
    await writeRgb(path.join(candRoot, name), cw, ch, sheet);
  }
}

async function main() {
  ensure(path.join(OUT, "diagnostic"));
  ensure(path.join(OUT, "candidates"));
  const ctx = loadContext(ROOT);
  const landmarks = auditAndDeriveNeckLandmarks(
    ctx.mesh,
    ctx.lm,
    ctx.identity,
  );
  const upper = buildUpperLoop(landmarks.derived);
  const lower = buildLowerLoop(
    ctx.lm,
    landmarks.derived,
    buildSuperiorBoundary(ctx.lm, {}),
  );
  const atlas = buildNeckAtlas(ctx.mesh, upper, lower, 64);
  await renderDiag(ctx, atlas, upper, lower, landmarks);
  await renderCandidates(ctx);
  console.log("[neck-v60] evidence written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
