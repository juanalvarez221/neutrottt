/**
 * Posterior Back V5.1 — diagnostic PNG evidence (real sharp renders).
 *   node tools/body-regions/render-posterior-back-v51-evidence.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  loadContext,
  buildSuperiorBoundary,
  buildInferiorBoundary,
  buildS02InnerSeamWithExtendedEndpoints,
  buildUBackAtlas,
  auditPosteriorLandmarks,
  enrichOfficialBackSeam,
  buildLowerBackContinuation,
  buildBackVertexField,
  keepLargestPositiveComponent,
  diagnoseResidualTriangles,
  POSTERIOR_BACK_V51_OUT,
  RIBS_SEAM_FLOOR_Y,
} from "./posterior-back-v51-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = POSTERIOR_BACK_V51_OUT;

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

function project(p, w, h, shear = 0) {
  const x = p[0] + shear * (p[2] + 0.15);
  const u = (x + 0.25) / 0.5;
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

function strokePoly(rgb, w, h, pts, color, shear = 0) {
  for (const p of pts) {
    if (!p) continue;
    const [x, y] = project(p, w, h, shear);
    dot(rgb, w, h, x, y, color, 1);
  }
}

async function main() {
  const diag = path.join(OUT, "diagnostic");
  ensure(diag);
  const ctx = loadContext(ROOT);
  const landmarks = auditPosteriorLandmarks(ctx.mesh, ctx.lm, ctx.identity);
  const superior = buildSuperiorBoundary(ctx.lm, landmarks.derived);
  const inferior = buildInferiorBoundary(ctx.lm, landmarks.derived);

  const rightSrc = JSON.parse(
    readFileSync(path.join(OUT, "shared-right-ribs-back-seam.json"), "utf8"),
  ).raw;
  const leftSrc = JSON.parse(
    readFileSync(path.join(OUT, "shared-left-ribs-back-seam.json"), "utf8"),
  ).raw;
  const rightEnriched = enrichOfficialBackSeam(ctx.mesh, ctx.identity, rightSrc, "right");
  const leftEnriched = enrichOfficialBackSeam(ctx.mesh, ctx.identity, leftSrc, "left");
  const rightCont = JSON.parse(
    readFileSync(path.join(OUT, "right-lower-back-continuation.json"), "utf8"),
  );
  const leftCont = JSON.parse(
    readFileSync(path.join(OUT, "left-lower-back-continuation.json"), "utf8"),
  );

  const atlas = buildUBackAtlas(
    ctx.mesh,
    ctx.lm,
    ctx.rightSeam,
    ctx.leftSeam,
    superior.yMax + 0.008,
    inferior.yMin - 0.008,
    {
      right: rightEnriched,
      left: leftEnriched,
      rightContinuation: rightCont,
      leftContinuation: leftCont,
    },
  );
  const inner = buildS02InnerSeamWithExtendedEndpoints(ctx.lm, landmarks.derived, atlas);

  const w = 768;
  const h = 1024;

  // Residual diagnostics from precomputed JSON + overlays
  const residual = JSON.parse(
    readFileSync(path.join(diag, "01-residual-triangles.json"), "utf8"),
  );

  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices) {
      if (!sl.points) continue;
      strokePoly(rgb, w, h, sl.points, [50, 60, 70]);
    }
    for (const t of residual.triangles) {
      const [x, y] = project(t.centroid, w, h);
      const color =
        t.boundaryType.includes("right")
          ? [220, 90, 70]
          : t.boundaryType.includes("left")
            ? [70, 180, 120]
            : t.boundaryType.includes("internal")
              ? [240, 200, 80]
              : [180, 140, 220];
      dot(rgb, w, h, x, y, color, 3);
    }
    await writeRgb(path.join(diag, "02-residual-back.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const t of residual.triangles.filter((r) => r.centroid[0] < 0)) {
      const [x, y] = project(t.centroid, w, h, 0.35);
      dot(rgb, w, h, x, y, [220, 90, 70], 3);
    }
    await writeRgb(path.join(diag, "03-residual-back-right.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const t of residual.triangles.filter((r) => r.centroid[0] > 0)) {
      const [x, y] = project(t.centroid, w, h, -0.35);
      dot(rgb, w, h, x, y, [70, 180, 120], 3);
    }
    await writeRgb(path.join(diag, "04-residual-back-left.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, rightEnriched.points3d, [220, 120, 80]);
    strokePoly(rgb, w, h, leftEnriched.points3d, [80, 180, 140]);
    // floor line markers
    for (let i = 0; i < w; i++) {
      const [_, yy] = project([0, RIBS_SEAM_FLOOR_Y, -0.12], w, h);
      dot(rgb, w, h, i, yy, [100, 100, 120], 0);
    }
    await writeRgb(path.join(diag, "05-current-side-boundary-floor.png"), w, h, rgb);
  }

  // Continuations
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, rightEnriched.points3d, [120, 80, 60]);
    strokePoly(rgb, w, h, rightCont.points3d, [240, 140, 80]);
    await writeRgb(path.join(diag, "06-right-lower-continuation.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, leftEnriched.points3d, [60, 100, 80]);
    strokePoly(rgb, w, h, leftCont.points3d, [80, 220, 140]);
    await writeRgb(path.join(diag, "07-left-lower-continuation.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    strokePoly(rgb, w, h, rightCont.points3d, [240, 140, 80]);
    strokePoly(rgb, w, h, leftCont.points3d, [80, 220, 140]);
    await writeRgb(path.join(diag, "08-both-continuations-back.png"), w, h, rgb);
  }

  // Extended u_back
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices) {
      if (!sl.points) continue;
      for (let i = 0; i < sl.points.length; i++) {
        const u = sl.cum[i] / Math.max(1e-9, sl.total);
        const [x, y] = project(sl.points[i], w, h);
        dot(rgb, w, h, x, y, [
          Math.round(40 + 180 * u),
          Math.round(80 + 100 * (1 - Math.abs(u - 0.5) * 2)),
          Math.round(200 - 120 * u),
        ], 1);
      }
    }
    await writeRgb(path.join(diag, "10-u-back-extended-gradient.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices.filter((s) => s.zone === "upper_official")) {
      if (!sl.points) continue;
      strokePoly(rgb, w, h, sl.points, [120, 180, 220]);
    }
    await writeRgb(path.join(diag, "11-u-back-upper-sections.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const sl of atlas.slices.filter((s) => s.zone === "lower_continuation")) {
      if (!sl.points) continue;
      strokePoly(rgb, w, h, sl.points, [180, 140, 220]);
    }
    await writeRgb(path.join(diag, "12-u-back-lower-sections.png"), w, h, rgb);
  }
  {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const tr = atlas.slices.find((s) => Math.abs(s.y - RIBS_SEAM_FLOOR_Y) < 0.008);
    if (tr?.points) strokePoly(rgb, w, h, tr.points, [240, 200, 80]);
    await writeRgb(path.join(diag, "13-u-back-transition-slice.png"), w, h, rgb);
  }

  // Region fields quick views
  for (const [name, up, lo, color] of [
    ["upper", (u) => superior.upperY(u), (u) => inner.seamY(u), [90, 170, 220]],
    ["lower", (u) => inner.seamY(u), (u) => inferior.lowerY(u), [90, 200, 140]],
    ["full", (u) => superior.upperY(u), (u) => inferior.lowerY(u), [200, 160, 90]],
  ]) {
    const field = buildBackVertexField(ctx.mesh, atlas, up, lo);
    keepLargestPositiveComponent(ctx.mesh, field.values);
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    const P = ctx.mesh.positions;
    for (let i = 0; i < ctx.mesh.vertexCount; i++) {
      if (field.values[i] <= 0) continue;
      const [x, y] = project([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], w, h);
      dot(rgb, w, h, x, y, color, 2);
    }
    await writeRgb(path.join(diag, `14-field-${name}-back.png`), w, h, rgb);
  }

  writeFileSync(
    path.join(OUT, "evidence-index.json"),
    JSON.stringify(
      {
        version: "5.1",
        selectedId: "S02",
        diagnostic: [
          "01-residual-triangles.json",
          "02-residual-back.png",
          "03-residual-back-right.png",
          "04-residual-back-left.png",
          "05-current-side-boundary-floor.png",
          "06-right-lower-continuation.png",
          "07-left-lower-continuation.png",
          "08-both-continuations-back.png",
          "09-continuation-tangents.json",
          "10-u-back-extended-gradient.png",
          "11-u-back-upper-sections.png",
          "12-u-back-lower-sections.png",
          "13-u-back-transition-slice.png",
        ],
      },
      null,
      2,
    ),
  );
  console.log("V5.1 evidence written to", diag);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
