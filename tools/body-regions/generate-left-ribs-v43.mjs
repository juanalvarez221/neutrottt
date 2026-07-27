/**
 * Left Ribs V4.3 — generate L01 with the side-aware u_ribs V4.1 engine.
 *
 * Everything is derived from real left geometry (C07.leftS / B01.leftS anterior
 * seam + a left 96-slice posterior seam). No right sidecar values are copied,
 * negated or mirrored into the left field.
 *
 * Writes only under artifacts/left-ribs-v43/. Official fields, the categorical
 * mask and region_fields.json are read-only here — nothing is promoted.
 *
 *   node tools/body-regions/generate-left-ribs-v43.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  assertOfficialTorsoRegionsFrozen,
  buildRibsV41Context,
  contentHash16,
  decodeSnorm16,
  encodeRefinement,
  encodeSnorm16,
  evaluateRibsV41,
  FIELD_RANGE_M,
  getRibsSideConfig,
  L01,
  measureSharedFrontSeamSide,
  measureSurfaceMetrics,
  OFFICIAL_TORSO_REGIONS,
  ribsV41SignedDistance,
  sampleV41FieldAlignment,
  serializeBackSeam,
} from "./ribs-v41-core.mjs";
import { extractAndWriteSharedFrontLeftRibsSeam } from "./extract-left-ribs-front-seam.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const PALETTE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_region_palette.json",
);
const OFFICIAL_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const OUT = path.join(ROOT, "artifacts/left-ribs-v43");

const LEFT_INDEX = getRibsSideConfig("left").maskIndex;
const RIGHT_INDEX = getRibsSideConfig("right").maskIndex;
const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;

function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

async function readIndexedMask(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * ch];
  return { mask: out, w: info.width, h: info.height };
}

function collectComponents(mask, w, h, target) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== target || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || mask[ni] !== target) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

function componentStats(mask, w, h, target) {
  const comps = collectComponents(mask, w, h, target);
  const sizes = comps.map((c) => c.length);
  const largest = sizes[0] ?? 0;
  return {
    components: sizes.length,
    sizes: sizes.slice(0, 8),
    pixels: sizes.reduce((a, b) => a + b, 0),
    tinyIslands: sizes.slice(1).filter((s) => s >= Math.max(3, largest * 0.01))
      .length,
  };
}

/** Drop every non-largest UV island of `target` in place (as the promote does). */
function keepLargest(mask, w, h, target) {
  const comps = collectComponents(mask, w, h, target);
  let removed = 0;
  for (let c = 1; c < comps.length; c++) {
    for (const i of comps[c]) {
      mask[i] = 0;
      removed++;
    }
  }
  return {
    rawComponents: comps.length,
    removedPixels: removed,
    removedIslands: Math.max(0, comps.length - 1),
    pixels: comps[0]?.length ?? 0,
  };
}

/**
 * In-memory categorical preview of left_ribs (mask index 12).
 * Returns a NEW buffer; the official PNG is never written.
 */
function previewLeftRibsCategorical(mesh, atlas, values, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === LEFT_INDEX) out[i] = 0;
  }
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const coverage = new Uint8Array(w * h);
  const bestLat = new Float64Array(w * h).fill(-Infinity);

  const stamp = (px, py, lat, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const idx = y * w + x;
        if (lat < bestLat[idx]) continue;
        bestLat[idx] = lat;
        coverage[idx] = 1;
      }
    }
  };

  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    if (values[vi] <= 0) continue;
    const u = UV[vi * 2];
    const v = UV[vi * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    // Left lateralness grows with +X.
    stamp(px, py, P[vi * 3], 6);
  }

  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    if (values[ia] <= 0 && values[ib] <= 0 && values[ic] <= 0) continue;
    const pts = [ia, ib, ic].map((vi) => [
      P[vi * 3],
      P[vi * 3 + 1],
      P[vi * 3 + 2],
      UV[vi * 2],
      UV[vi * 2 + 1],
    ]);
    const lat = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
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
    if (u1 - u0 > 0.55 || v1 - v0 > 0.55) continue;
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
        const d = ribsV41SignedDistance(x, y, z, atlas);
        if (d == null || d <= 0) continue;
        const idx = py * w + px;
        if (lat < bestLat[idx]) continue;
        bestLat[idx] = lat;
        coverage[idx] = 1;
      }
    }
  }

  let foreignBlocked = 0;
  for (let i = 0; i < out.length; i++) {
    if (!coverage[i]) continue;
    if (out[i] !== 0 && out[i] !== LEFT_INDEX) {
      foreignBlocked++;
      continue;
    }
    out[i] = LEFT_INDEX;
  }
  return { preview: out, foreignBlocked };
}

function countLeftUvSeamErrors(mesh, mask, w, h) {
  const { positions, uvs } = mesh;
  const groups = new Map();
  const vertCount = positions.length / 3;
  for (let vi = 0; vi < vertCount; vi++) {
    const key = `${(positions[vi * 3] * 1e5) | 0},${(positions[vi * 3 + 1] * 1e5) | 0},${(positions[vi * 3 + 2] * 1e5) | 0}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(vi);
  }
  const sample = (u, v) => {
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    return mask[py * w + px];
  };
  let mismatches = 0;
  for (const verts of groups.values()) {
    if (verts.length < 2) continue;
    const ids = verts.map((vi) => sample(uvs[vi * 2], uvs[vi * 2 + 1]));
    if (!ids.some((id) => id === LEFT_INDEX)) continue;
    const first = ids[0];
    if (ids.some((id) => id !== first)) mismatches++;
  }
  return mismatches;
}

function bilateralReport(mesh, leftValues, rightValues) {
  const left = measureSurfaceMetrics(mesh, leftValues);
  const right = measureSurfaceMetrics(mesh, rightValues);
  const rel = (a, b) => {
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return +(Math.abs(a - b) / denom).toFixed(5);
  };

  // Mirrored-right diagnostic: reflect the right positive set across X = 0 and
  // compare extents only. No mirrored value is ever written into the left field.
  const mirroredRight = right.bounds
    ? {
        centroid: [
          -right.centroid[0],
          right.centroid[1],
          right.centroid[2],
        ],
        bounds: {
          min: [-right.bounds.max[0], right.bounds.min[1], right.bounds.min[2]],
          max: [-right.bounds.min[0], right.bounds.max[1], right.bounds.max[2]],
        },
      }
    : null;
  const centroidDeltaM = mirroredRight
    ? [0, 1, 2].map((k) =>
        +Math.abs(left.centroid[k] - mirroredRight.centroid[k]).toFixed(5),
      )
    : null;

  // Vertex-level laterality audit — the two positive sets must not overlap.
  const P = mesh.positions;
  let leftOnRightSide = 0;
  let rightOnLeftSide = 0;
  let sharedVertices = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const li = leftValues[i] > 0;
    const ri = rightValues[i] > 0;
    if (li && ri) sharedVertices++;
    if (li && P[i * 3] < 0) leftOnRightSide++;
    if (ri && P[i * 3] > 0) rightOnLeftSide++;
  }

  return {
    note: "Left is computed from left geometry; the mirrored-right block is a diagnostic overlay only.",
    left,
    right: { ...right, source: "official neutro_body_v1_right_ribs_sdf.bin" },
    deltas: {
      positives: Math.abs(left.positives - right.positives),
      areaRel: rel(left.areaM2, right.areaM2),
      heightRel: rel(left.heightM, right.heightM),
      widthRel: rel(left.widthXM, right.widthXM),
      depthRel: rel(left.depthZM, right.depthZM),
    },
    mirroredRightDiagnostic: {
      centroid: mirroredRight?.centroid ?? null,
      bounds: mirroredRight?.bounds ?? null,
      centroidDeltaM,
    },
    laterality: {
      leftPositivesOnRightSide: leftOnRightSide,
      rightPositivesOnLeftSide: rightOnLeftSide,
      sharedVertices,
      disjoint: sharedVertices === 0,
      pass:
        sharedVertices === 0 && leftOnRightSide === 0 && rightOnLeftSide === 0,
    },
  };
}

export async function generateLeftRibsV43() {
  for (const dir of [
    "",
    "diagnostic",
    "staged",
    "approved",
    "final",
    "hit-alignment",
    "temp",
  ]) {
    mkdirSync(path.join(OUT, dir), { recursive: true });
  }

  // 1 — official torso freeze (chest / abdomen / right_ribs / mask).
  const freeze = assertOfficialTorsoRegionsFrozen();
  console.log("OFFICIAL_TORSO_FROZEN", freeze.maskHash);

  // 3 — left context (L01 params, left posterior seam derived from geometry).
  const ctx = buildRibsV41Context("left", GLB, LANDMARKS, {
    freeze,
    params: L01,
  });

  // 2 — shared anterior seam from C07.leftS / B01.leftS + QA measurement.
  const { seam: frontSeam } = extractAndWriteSharedFrontLeftRibsSeam(ctx);
  const seamMeasure = measureSharedFrontSeamSide(
    ctx.sharedFrontBuilder,
    ctx.chestBounds,
    ctx.abdomenBounds,
    ctx.field,
    ctx.inferior.yEnd,
    ctx.superior.yMax,
    "left",
  );

  // 4 — stage A–D evaluation.
  const result = evaluateRibsV41(ctx);

  // 5 — artifacts.
  writeFileSync(
    path.join(OUT, "left-side-back-seam.json"),
    `${JSON.stringify(
      {
        version: "4.3",
        candidateId: L01.id,
        derivedFrom: "left torso geometry (96-slice curvature normal-turn)",
        mirroredFromRight: false,
        sharedFrontSource: ctx.config.sharedFrontSource,
        ...serializeBackSeam(ctx.backSeamDerived),
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join(OUT, "u-ribs-atlas.json"),
    `${JSON.stringify(
      {
        version: "4.3",
        side: "left",
        candidateId: L01.id,
        diagnostics: result.atlas.diagnostics,
        yTop: result.atlas.yTop,
        yBot: result.atlas.yBot,
        slices: result.atlas.slices.map((s) => ({
          y: +s.y.toFixed(5),
          total: +s.total.toFixed(5),
          frontS: +s.frontS.toFixed(5),
          backS: +s.backS.toFixed(5),
          fallback: !!s.fallback,
          pointCount: s.points?.length ?? 0,
        })),
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join(OUT, "diagnostic/04-boundary-endpoints.json"),
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

  const sidecar = encodeSnorm16(result.values);
  const fieldHash = contentHash16(sidecar);
  let refineBin = Buffer.alloc(0);
  let refineHash = null;
  const stagedField = path.join(
    OUT,
    "staged/neutro_body_v1_left_ribs_sdf_L01.bin",
  );
  const stagedRefine = path.join(
    OUT,
    "staged/neutro_body_v1_left_ribs_refine_L01.bin",
  );
  writeFileSync(stagedField, sidecar);
  if (result.refinement?.triangles?.length) {
    refineBin = encodeRefinement(result.refinement, FIELD_RANGE_M);
    refineHash = contentHash16(refineBin);
    writeFileSync(stagedRefine, refineBin);
  }

  // Bilateral diagnostic vs the official right_ribs field (decoded, read-only).
  const officialRight = decodeSnorm16(
    readFileSync(path.join(FIELDS, "neutro_body_v1_right_ribs_sdf.bin")),
    ctx.mesh.vertexCount,
    FIELD_RANGE_M,
  );
  const bilateral = bilateralReport(ctx.mesh, result.values, officialRight);
  writeFileSync(
    path.join(OUT, "diagnostic/bilateral-report.json"),
    `${JSON.stringify(
      {
        version: "4.3",
        left: { candidateId: L01.id, fieldHash },
        right: {
          candidateId: OFFICIAL_TORSO_REGIONS.rightRibs.candidateId,
          fieldHash: OFFICIAL_TORSO_REGIONS.rightRibs.fieldHash,
        },
        ...bilateral,
      },
      null,
      2,
    )}\n`,
  );

  // Field ↔ analytic alignment.
  const alignment = sampleV41FieldAlignment(
    ctx.mesh,
    result.atlas,
    result.values,
    { interior: 5000, exterior: 5000, band: 0.002 },
  );
  const hitAlignment = {
    version: "4.3",
    candidateId: L01.id,
    alignment,
    interior: result.rayIn.results,
    exterior: result.rayOut.results,
    posterior: result.posteriorProbe.results,
    pass: alignment.pass && result.rayIn.pass && result.rayOut.pass,
  };
  writeFileSync(
    path.join(OUT, "hit-alignment/alignment.json"),
    `${JSON.stringify(hitAlignment, null, 2)}\n`,
  );

  // Categorical preview — statistics only, official mask stays untouched.
  const { mask: baseMask, w, h } = await readIndexedMask(OFFICIAL_MASK);
  const officialLeftPixels = componentStats(baseMask, w, h, LEFT_INDEX);
  const { preview, foreignBlocked } = previewLeftRibsCategorical(
    ctx.mesh,
    result.atlas,
    result.values,
    baseMask,
    w,
    h,
  );
  const rawPreviewStats = componentStats(preview, w, h, LEFT_INDEX);
  const island = keepLargest(preview, w, h, LEFT_INDEX);
  const previewStats = componentStats(preview, w, h, LEFT_INDEX);
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const knownIndices = new Set(
    Object.values(palette.regions).map((e) => e.runtimeIndex),
  );
  knownIndices.add(0);
  let unknown = 0;
  let foreignModified = 0;
  let chestModified = 0;
  let abdomenModified = 0;
  let rightRibsModified = 0;
  for (let i = 0; i < w * h; i++) {
    if (!knownIndices.has(preview[i])) unknown++;
    const before = baseMask[i];
    const after = preview[i];
    if (before !== LEFT_INDEX && after !== LEFT_INDEX && before !== after) {
      foreignModified++;
    }
    if ((before === CHEST_INDEX) !== (after === CHEST_INDEX)) chestModified++;
    if ((before === ABDOMEN_INDEX) !== (after === ABDOMEN_INDEX)) {
      abdomenModified++;
    }
    if ((before === RIGHT_INDEX) !== (after === RIGHT_INDEX)) {
      rightRibsModified++;
    }
  }
  const uvSeamErrors = countLeftUvSeamErrors(ctx.mesh, preview, w, h);
  const maskPreview = {
    version: "4.3",
    note: "In-memory categorical preview for left_ribs (index 12). No official mask, authoring PNG or manifest was written.",
    officialMaskHash: freeze.maskHash,
    officialMaskWritten: false,
    resolution: w,
    maskIndex: LEFT_INDEX,
    officialLeftRibsPixelsBefore: officialLeftPixels.pixels,
    rawComponents: rawPreviewStats.components,
    rawComponentSizes: rawPreviewStats.sizes,
    tinyIslandsRemoved: island.removedIslands,
    removedPixels: island.removedPixels,
    components: previewStats.components,
    componentSizes: previewStats.sizes,
    tinyIslands: previewStats.tinyIslands,
    pixels: previewStats.pixels,
    unknownIds: unknown,
    uvSeamErrors,
    foreignIdsModified: foreignModified,
    foreignPixelsBlocked: foreignBlocked,
    chestPixelsModified: chestModified,
    abdomenPixelsModified: abdomenModified,
    rightRibsPixelsModified: rightRibsModified,
    pass:
      previewStats.components === 1 &&
      previewStats.tinyIslands === 0 &&
      unknown === 0 &&
      uvSeamErrors === 0 &&
      foreignModified === 0 &&
      chestModified === 0 &&
      abdomenModified === 0 &&
      rightRibsModified === 0,
  };
  writeFileSync(
    path.join(OUT, "temp/categorical-preview.json"),
    `${JSON.stringify(maskPreview, null, 2)}\n`,
  );
  // Temporary mask for Playwright only — never copied into public/.
  await sharp(preview, {
    raw: { width: w, height: h, channels: 1 },
  })
    .png()
    .toFile(path.join(OUT, "temp/neutro_body_v1_anatomical_region_ids_left_preview.png"));

  const pass =
    result.pass &&
    seamMeasure.pass &&
    alignment.pass &&
    bilateral.laterality.pass;

  const report = {
    version: "4.3",
    regionId: "left_ribs",
    visualRegionId: "left_ribs_surface",
    surfaceRegionId: "left_ribs_region",
    maskIndex: LEFT_INDEX,
    candidateId: result.candidateId,
    side: "left",
    params: L01,
    engine: "ribs-v41-core (side-aware u_ribs)",
    officialTorsoFreeze: freeze,
    derivation: {
      anteriorSeam: ctx.config.sharedFrontSource,
      posteriorSeam: "left_side_back_seam (96-slice curvature normal-turn)",
      superior: "left axilla base hermite",
      inferior: "left lateral waist hermite",
      mirroredFromRight: false,
      rightSidecarRead: "diagnostic bilateral comparison only",
    },
    stages: result.stages,
    frontSeam: {
      name: frontSeam.name,
      seamHash: frontSeam.seamHash,
      triangleCount: frontSeam.triangleCount,
      meanMm: round(seamMeasure.mean * 1000, 6),
      p95Mm: round(seamMeasure.p95 * 1000, 6),
      maxMm: round(seamMeasure.max * 1000, 6),
      gap: seamMeasure.gap,
      overlap: seamMeasure.overlap,
      points: seamMeasure.points,
      pass: seamMeasure.pass,
    },
    backSeam: ctx.backSeamDerived.diagnostics,
    superior: ctx.superior.diagnostics,
    inferior: ctx.inferior.diagnostics,
    loop: result.loop.diagnostics,
    endpoints: result.loop.endpoints,
    uRibs: {
      ...result.atlas.diagnostics,
      ...result.uDiag,
      frontSeam: 0,
      posteriorSeam: 1,
    },
    classification: {
      positives: result.stats.positives,
      components: result.region.components,
      tinyIslands: result.tinyIslands,
      leaks: result.leaks,
    },
    isolineMm: {
      mean: round(result.isoline.precision.mean * 1000, 3),
      p95: round(result.isoline.precision.p95 * 1000, 3),
      max: round(result.isoline.precision.max * 1000, 3),
    },
    refinedIsolineMm: {
      mean: round(result.refinedIsoline.precision.mean * 1000, 3),
      p95: round(result.refinedIsoline.precision.p95 * 1000, 3),
      max: round(result.refinedIsoline.precision.max * 1000, 3),
    },
    topology: result.topology,
    raycast: {
      interior: { pass: result.rayIn.pass, results: result.rayIn.results },
      exterior: { pass: result.rayOut.pass, results: result.rayOut.results },
      posterior: result.posteriorProbe,
    },
    alignment,
    bilateral: {
      leftPositives: bilateral.left.positives,
      rightPositives: bilateral.right.positives,
      deltas: bilateral.deltas,
      laterality: bilateral.laterality,
    },
    maskPreview,
    staged: {
      fieldHash,
      refineHash,
      sidecarBytes: sidecar.length,
      refineBytes: refineBin.length,
      totalSidecarBytes: sidecar.length + refineBin.length,
      refinementTriangleCount: Math.floor(refineBin.length / 10),
    },
    pass,
    approved: pass,
    officialAssetsOverwritten: false,
    officialMaskOverwritten: false,
    promoted: false,
    leftRibsGenerated: true,
  };

  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "staged/candidate-L01.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  // 6 — promote staged → approved inside the artifact tree only.
  if (pass) {
    copyFileSync(
      stagedField,
      path.join(OUT, "approved/neutro_body_v1_left_ribs_sdf_L01.bin"),
    );
    if (refineBin.length) {
      copyFileSync(
        stagedRefine,
        path.join(OUT, "approved/neutro_body_v1_left_ribs_refine_L01.bin"),
      );
    }
    writeFileSync(
      path.join(OUT, "approved/candidate-L01.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  console.log(
    "LEFT_RIBS_V43",
    JSON.stringify(
      {
        stages: result.stages,
        components: result.region.components,
        tinyIslands: result.tinyIslands,
        positives: result.stats.positives,
        refinedIsolineMm: report.refinedIsolineMm,
        frontSeam: report.frontSeam.pass,
        alignment: alignment.pass,
        maskPreview: maskPreview.pass,
        bilateral: report.bilateral.deltas,
        fieldHash,
        refineHash,
        pass,
      },
      null,
      2,
    ),
  );
  return { report, result, ctx };
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-left-ribs-v43.mjs")
) {
  generateLeftRibsV43().catch((err) => {
    console.error(err);
    if (err?.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  });
}
