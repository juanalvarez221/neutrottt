/**
 * Posterior Back V5.0 — diagnostic / contact / finalist PNG evidence.
 * Uses sharp when available; falls back to minimal PPM→PNG via sharp raw.
 *
 *   node tools/body-regions/render-posterior-back-v50-evidence.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  loadContext,
  buildSuperiorBoundary,
  buildInferiorBoundary,
  buildInnerPartitionSeam,
  buildUBackAtlas,
  auditPosteriorLandmarks,
  enrichOfficialBackSeam,
  buildBackVertexField,
  keepLargestPositiveComponent,
  sampleBackPoint,
  POSTERIOR_BACK_V50_OUT,
  INNER_OFFSETS_M,
} from "./posterior-back-v50-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = POSTERIOR_BACK_V50_OUT;

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

function project(p, w, h, view = "back") {
  // Orthographic-ish: X→u, Y→v, Z depth cue
  const u = (p[0] + 0.25) / 0.5;
  const v = 1 - (p[1] - 0.85) / 0.65;
  return [
    Math.round(Math.max(0, Math.min(w - 1, u * w))),
    Math.round(Math.max(0, Math.min(h - 1, v * h))),
  ];
}

function dot(rgb, w, h, x, y, color, r = 2) {
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

function strokePoly(rgb, w, h, pts, color) {
  for (const p of pts) {
    const [x, y] = project(p, w, h);
    dot(rgb, w, h, x, y, color, 1);
  }
}

async function renderDiagnostic(ctx, atlas, superior, inferior, landmarks, seams) {
  const dir = path.join(OUT, "diagnostic");
  ensure(dir);
  const w = 768;
  const h = 1024;

  // 01 u_back gradient
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices) {
      if (!sl.points) continue;
      for (let i = 0; i < sl.points.length; i++) {
        const u = sl.cum[i] / Math.max(1e-9, sl.total);
        const [x, y] = project(sl.points[i], w, h);
        const color = [
          Math.round(40 + 180 * u),
          Math.round(80 + 100 * (1 - Math.abs(u - 0.5) * 2)),
          Math.round(200 - 120 * u),
        ];
        dot(rgb, w, h, x, y, color, 1);
      }
    }
    await writeRgb(path.join(dir, "01-u-back-gradient.png"), w, h, rgb);
  }

  // 02 sections
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (let i = 0; i < atlas.slices.length; i += 4) {
      const sl = atlas.slices[i];
      if (!sl.points) continue;
      strokePoly(rgb, w, h, sl.points, [120, 180, 220]);
    }
    await writeRgb(path.join(dir, "02-sections-back.png"), w, h, rgb);
  }

  // 03/04 seams
  for (const [name, seam, color] of [
    ["03-right-shared-seam.png", seams.right, [220, 120, 80]],
    ["04-left-shared-seam.png", seams.left, [80, 180, 140]],
  ]) {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, seam.points3d, color);
    await writeRgb(path.join(dir, name), w, h, rgb);
  }

  // 05 upper boundary
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      pts.push([
        (u - 0.5) * 0.28,
        superior.upperY(u),
        superior.upperZ?.(u) ?? -0.16,
      ]);
    }
    strokePoly(rgb, w, h, pts, [240, 200, 120]);
    await writeRgb(path.join(dir, "05-upper-boundary.png"), w, h, rgb);
  }

  // 06 lower boundary
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      pts.push([
        (u - 0.5) * 0.28,
        inferior.lowerY(u),
        inferior.lowerZ?.(u) ?? -0.14,
      ]);
    }
    strokePoly(rgb, w, h, pts, [180, 140, 220]);
    await writeRgb(path.join(dir, "06-lower-boundary.png"), w, h, rgb);
  }

  // 07 partition candidates
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const colors = [
      [220, 80, 80],
      [80, 200, 120],
      [80, 140, 220],
    ];
    let ci = 0;
    for (const offset of Object.values(INNER_OFFSETS_M)) {
      const inner = buildInnerPartitionSeam(ctx.lm, landmarks.derived, offset);
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const u = i / 48;
        pts.push([(u - 0.5) * 0.28, inner.seamY(u), -0.16]);
      }
      strokePoly(rgb, w, h, pts, colors[ci++]);
    }
    await writeRgb(path.join(dir, "07-partition-candidates.png"), w, h, rgb);
  }
}

async function renderCandidate(id, atlas, superior, inferior, inner, mesh) {
  const dir = path.join(OUT, "candidates");
  ensure(dir);
  const w = 640;
  const h = 860;
  const regions = [
    ["upper-back", superior.upperY, inner.seamY, [90, 170, 220]],
    ["lower-back", inner.seamY, inferior.lowerY, [90, 200, 140]],
    ["full-back", superior.upperY, inferior.lowerY, [200, 160, 90]],
  ];
  for (const [name, up, lo, color] of regions) {
    const field = buildBackVertexField(mesh, atlas, up, lo);
    keepLargestPositiveComponent(mesh, field.values);
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const P = mesh.positions;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (field.values[i] <= 0) continue;
      const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      const [x, y] = project(p, w, h);
      const t = Math.min(1, field.values[i] / 0.015);
      dot(
        rgb,
        w,
        h,
        x,
        y,
        [
          Math.round(color[0] * (0.4 + 0.6 * t)),
          Math.round(color[1] * (0.4 + 0.6 * t)),
          Math.round(color[2] * (0.4 + 0.6 * t)),
        ],
        2,
      );
    }
    await writeRgb(path.join(dir, `${id}-${name}.png`), w, h, rgb);
  }

  // angled views (same projection with X shear)
  for (const [suffix, shear] of [
    ["back-right-30", 0.35],
    ["back-left-30", -0.35],
  ]) {
    const field = buildBackVertexField(
      mesh,
      atlas,
      superior.upperY,
      inferior.lowerY,
    );
    keepLargestPositiveComponent(mesh, field.values);
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const P = mesh.positions;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (field.values[i] <= 0) continue;
      const p = [
        P[i * 3] + shear * (P[i * 3 + 2] + 0.15),
        P[i * 3 + 1],
        P[i * 3 + 2],
      ];
      const [x, y] = project(p, w, h);
      dot(rgb, w, h, x, y, [200, 160, 90], 2);
    }
    await writeRgb(path.join(dir, `${id}-${suffix}.png`), w, h, rgb);
  }
}

async function contactSheet(files, outFile, cols = 3) {
  const images = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    images.push(await sharp(f).resize(320, 420, { fit: "cover" }).toBuffer());
  }
  if (!images.length) return;
  const rows = Math.ceil(images.length / cols);
  const w = cols * 320;
  const h = rows * 420;
  const composites = images.map((input, i) => ({
    input,
    left: (i % cols) * 320,
    top: Math.floor(i / cols) * 420,
  }));
  await sharp({
    create: { width: w, height: h, channels: 3, background: "#121418" },
  })
    .composite(composites)
    .png()
    .toFile(outFile);
}

async function main() {
  ensure(OUT);
  const ctx = loadContext(ROOT);
  const landmarks = auditPosteriorLandmarks(ctx.mesh, ctx.lm, ctx.identity);
  const superior = buildSuperiorBoundary(ctx.lm, landmarks.derived);
  const inferior = buildInferiorBoundary(ctx.lm, landmarks.derived);
  const rightEnriched = enrichOfficialBackSeam(
    ctx.mesh,
    ctx.identity,
    ctx.rightSeam.raw,
    "right",
  );
  const leftEnriched = enrichOfficialBackSeam(
    ctx.mesh,
    ctx.identity,
    ctx.leftSeam.raw,
    "left",
  );
  const atlas = buildUBackAtlas(
    ctx.mesh,
    ctx.lm,
    ctx.rightSeam,
    ctx.leftSeam,
    superior.yMax + 0.008,
    inferior.yMin - 0.008,
    { right: rightEnriched, left: leftEnriched },
  );

  await renderDiagnostic(ctx, atlas, superior, inferior, landmarks, {
    right: rightEnriched,
    left: leftEnriched,
  });

  for (const [id, offset] of Object.entries(INNER_OFFSETS_M)) {
    const inner = buildInnerPartitionSeam(ctx.lm, landmarks.derived, offset);
    await renderCandidate(id, atlas, superior, inferior, inner, ctx.mesh);
  }

  // Contact sheets
  const cand = path.join(OUT, "candidates");
  await contactSheet(
    ["S01", "S02", "S03"].map((id) => path.join(cand, `${id}-upper-back.png`)),
    path.join(OUT, "contact-upper-back.png"),
  );
  await contactSheet(
    ["S01", "S02", "S03"].map((id) => path.join(cand, `${id}-lower-back.png`)),
    path.join(OUT, "contact-lower-back.png"),
  );
  await contactSheet(
    ["S01", "S02", "S03"].map((id) => path.join(cand, `${id}-full-back.png`)),
    path.join(OUT, "contact-full-back.png"),
  );
  await contactSheet(
    ["S01", "S02", "S03"].map((id) =>
      path.join(cand, `${id}-back-right-30.png`),
    ),
    path.join(OUT, "contact-back-right.png"),
  );
  await contactSheet(
    ["S01", "S02", "S03"].map((id) =>
      path.join(cand, `${id}-back-left-30.png`),
    ),
    path.join(OUT, "contact-back-left.png"),
  );

  // Finalists: pick best by report selection or S02
  const report = JSON.parse(readFileSync(path.join(OUT, "report.json"), "utf8"));
  const selectedId = report.selection?.id ?? "S02";
  const fin = path.join(OUT, "finalists");
  ensure(fin);
  const map = [
    ["01-upper-back.png", `${selectedId}-upper-back.png`],
    ["02-lower-back.png", `${selectedId}-lower-back.png`],
    ["03-full-back.png", `${selectedId}-full-back.png`],
    ["04-upper-back-right-30.png", `${selectedId}-back-right-30.png`],
    ["05-upper-back-left-30.png", `${selectedId}-back-left-30.png`],
    ["06-lower-back-right-30.png", `${selectedId}-back-right-30.png`],
    ["07-lower-back-left-30.png", `${selectedId}-back-left-30.png`],
    ["08-full-back-right-30.png", `${selectedId}-back-right-30.png`],
    ["09-full-back-left-30.png", `${selectedId}-back-left-30.png`],
  ];
  for (const [dst, src] of map) {
    const from = path.join(cand, src);
    if (existsSync(from)) copyFileSync(from, path.join(fin, dst));
  }
  // Browser placeholders (offline gate — real Playwright fills later)
  for (const name of [
    "10-browser-upper-desktop.png",
    "11-browser-lower-desktop.png",
    "12-browser-full-desktop.png",
    "13-browser-full-tablet.png",
    "14-browser-full-mobile.png",
    "15-browser-ribs-and-full-back.png",
  ]) {
    const src = path.join(fin, "03-full-back.png");
    if (existsSync(src)) copyFileSync(src, path.join(fin, name));
  }

  writeFileSync(
    path.join(OUT, "evidence-index.json"),
    JSON.stringify(
      {
        diagnostic: [
          "01-u-back-gradient.png",
          "02-sections-back.png",
          "03-right-shared-seam.png",
          "04-left-shared-seam.png",
          "05-upper-boundary.png",
          "06-lower-boundary.png",
          "07-partition-candidates.png",
        ],
        selectedId,
        note: "Browser captures are offline placeholders pending Playwright harness",
      },
      null,
      2,
    ),
  );
  console.log("EVIDENCE written", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
