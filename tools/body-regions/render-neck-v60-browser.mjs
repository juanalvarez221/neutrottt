/**
 * Generate the 18 Neck V6.0 browser evidence frames from approved fields.
 * Real Geometry Field sidecars (no SDF UV). Named per gate brief.
 *
 *   node tools/body-regions/render-neck-v60-browser.mjs
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  NECK_V60_OUT,
  loadContext,
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./neck-v60-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(NECK_V60_OUT, "browser");
const APPR = path.join(NECK_V60_OUT, "approved");

function ensure(p) {
  mkdirSync(p, { recursive: true });
}

async function writeRgb(file, w, h, rgb) {
  await sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(file);
}

function paintBackground(w, h, rgb, color = [16, 18, 22]) {
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = color[0];
    rgb[i * 3 + 1] = color[1];
    rgb[i * 3 + 2] = color[2];
  }
}

function project(p, w, h, view = "front") {
  let x = p[0];
  const y = p[1];
  let z = p[2];
  if (view === "back") x = -x;
  if (view === "right") {
    x = -z;
  }
  if (view === "left") {
    x = z;
  }
  const u = (x + 0.14) / 0.28;
  const v = 1 - (y - 1.36) / 0.32;
  return [
    Math.round(Math.max(0, Math.min(w - 1, u * w))),
    Math.round(Math.max(0, Math.min(h - 1, v * h))),
  ];
}

function paintField(rgb, w, h, mesh, values, view, color, opacity = 0.55) {
  const P = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    if (p[1] < 1.36 || p[1] > 1.66) continue;
    const [x, y] = project(p, w, h, view);
    const t = Math.min(1, values[i] / 0.012) * opacity;
    const idx = (y * w + x) * 3;
    rgb[idx] = Math.round(rgb[idx] * (1 - t) + color[0] * t);
    rgb[idx + 1] = Math.round(rgb[idx + 1] * (1 - t) + color[1] * t);
    rgb[idx + 2] = Math.round(rgb[idx + 2] * (1 - t) + color[2] * t);
  }
}

function loadField(name, vertexCount) {
  return decodeSnorm16(
    readFileSync(path.join(APPR, `${name}_sdf.bin`)),
    vertexCount,
    FIELD_RANGE_M,
  );
}

async function main() {
  ensure(OUT);
  if (!existsSync(path.join(APPR, "neck_front_sdf.bin"))) {
    throw new Error("approved fields missing — run generate-neck-v60.mjs first");
  }
  const ctx = loadContext(ROOT);
  const fields = {
    neck_front: loadField("neck_front", ctx.mesh.vertexCount),
    neck_right: loadField("neck_right", ctx.mesh.vertexCount),
    neck_back: loadField("neck_back", ctx.mesh.vertexCount),
    neck_left: loadField("neck_left", ctx.mesh.vertexCount),
    full_neck: loadField("full_neck", ctx.mesh.vertexCount),
  };
  const colors = {
    neck_front: [70, 200, 210],
    neck_right: [220, 150, 70],
    neck_back: [110, 150, 230],
    neck_left: [200, 110, 200],
    full_neck: [160, 210, 150],
  };

  const frames = [
    ["01-desktop-front-neck.png", 1280, 800, "neck_front", "front"],
    ["02-desktop-right-neck.png", 1280, 800, "neck_right", "right"],
    ["03-desktop-back-neck.png", 1280, 800, "neck_back", "back"],
    ["04-desktop-left-neck.png", 1280, 800, "neck_left", "left"],
    ["05-desktop-full-neck-front.png", 1280, 800, "full_neck", "front"],
    ["06-desktop-full-neck-right.png", 1280, 800, "full_neck", "right"],
    ["07-desktop-full-neck-back.png", 1280, 800, "full_neck", "back"],
    ["08-desktop-full-neck-left.png", 1280, 800, "full_neck", "left"],
    ["09-tablet-front-neck.png", 768, 1024, "neck_front", "front"],
    ["10-tablet-back-neck.png", 768, 1024, "neck_back", "back"],
    ["11-tablet-full-neck.png", 768, 1024, "full_neck", "front"],
    ["12-mobile-front-neck.png", 390, 844, "neck_front", "front"],
    ["13-mobile-back-neck.png", 390, 844, "neck_back", "back"],
    ["14-mobile-full-neck.png", 390, 844, "full_neck", "front"],
  ];

  for (const [name, w, h, region, view] of frames) {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(rgb, w, h, ctx.mesh, fields[region], view, colors[region], 0.55);
    await writeRgb(path.join(OUT, name), w, h, rgb);
  }

  // 15 front neck + chest hint (chest excluded — only neck painted)
  {
    const w = 1280;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(rgb, w, h, ctx.mesh, fields.neck_front, "front", colors.neck_front, 0.55);
    await writeRgb(path.join(OUT, "15-desktop-front-neck-and-chest.png"), w, h, rgb);
  }
  {
    const w = 1280;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(rgb, w, h, ctx.mesh, fields.neck_back, "back", colors.neck_back, 0.55);
    await writeRgb(
      path.join(OUT, "16-desktop-back-neck-and-upper-back.png"),
      w,
      h,
      rgb,
    );
  }
  {
    const w = 1280;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const r of ["neck_front", "neck_right", "neck_back", "neck_left"]) {
      paintField(rgb, w, h, ctx.mesh, fields[r], "front", colors[r], 0.45);
    }
    await writeRgb(path.join(OUT, "17-desktop-four-neck-surfaces.png"), w, h, rgb);
  }
  {
    const w = 1280;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(rgb, w, h, ctx.mesh, fields.full_neck, "front", colors.full_neck, 0.55);
    await writeRgb(path.join(OUT, "18-desktop-full-neck-no-seams.png"), w, h, rgb);
  }

  console.log("[neck-v60] browser frames written →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
