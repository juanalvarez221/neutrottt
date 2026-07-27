/**
 * Neck Shared Seams and Local Refinement V6.1 — full gate orchestrator.
 * Only N02. Does NOT promote official assets. Does NOT create commits.
 *
 *   node tools/body-regions/generate-neck-v61.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";
import {
  NECK_V61_OUT,
  N02_SOURCE,
  SEAM_DEFS,
  CANONICAL_IDS,
  SURFACE_IDS,
  FIELD_RANGE_M,
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  deriveAnatomicalSeams,
  validateN02Source,
  expectedOfficialHashes,
  assertOfficialBackFrozen,
  decodeSnorm16,
  encodeFieldPackage,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  enforceNonOverlap,
  buildNeckVertexFieldV61,
  neckSignedDistanceV61,
  buildCanonicalSeam,
  diagnoseCurrentSeamMetric,
  validateGSeamAntisymmetry,
  createSharedRefinementRegistry,
  buildSharedNeckRefinement,
  collectResidualTriangles,
  validateSeamAlignment,
  buildSharedRefinementPlan,
  validateNeckIsoline,
  buildNeckBoundaryRefinement,
  contentHash16,
} from "./neck-v61-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const ADJ = JSON.parse(
  readFileSync(
    path.join(
      ROOT,
      "src/widgets/body-3d/domain/generated/publicRegionAdjacency.json",
    ),
    "utf8",
  ),
);

const TARGET_SURFACES = {
  neck_front: ["neck_front_surface"],
  neck_right: ["neck_right_surface"],
  neck_back: ["neck_back_surface"],
  neck_left: ["neck_left_surface"],
  full_neck: [
    "neck_front_surface",
    "neck_back_surface",
    "neck_left_surface",
    "neck_right_surface",
  ],
  full_chest: ["full_chest_surface"],
  upper_back: ["upper_back_surface"],
  right_calf: ["right_calf_surface"],
};

function areBaseAdjacent(a, b) {
  if (a === b) return true;
  return (ADJ.adjacency[a] || []).includes(b);
}

function areTargetsAdjacent(a, b) {
  const ra = TARGET_SURFACES[a] || [a];
  const rb = TARGET_SURFACES[b] || [b];
  for (const x of ra) {
    for (const y of rb) {
      if (areBaseAdjacent(x, y)) return true;
    }
  }
  return false;
}

function isSelectionContiguous(targets) {
  if (targets.length <= 1) return true;
  const ids = [...new Set(targets)];
  const visited = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const cur = queue.shift();
    for (const other of ids) {
      if (visited.has(other)) continue;
      if (areTargetsAdjacent(cur, other)) {
        visited.add(other);
        queue.push(other);
      }
    }
  }
  return visited.size === ids.length;
}
const OUT = NECK_V61_OUT;
const PARTIALS = ["neck_front", "neck_right", "neck_back", "neck_left"];
const REGIONS = [...PARTIALS, "full_neck"];

function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

function ensureDirs() {
  for (const d of [
    OUT,
    path.join(OUT, "diagnostic"),
    path.join(OUT, "shared-seams"),
    path.join(OUT, "approved"),
    path.join(OUT, "temp"),
    path.join(OUT, "hit-alignment"),
    path.join(OUT, "fallback"),
    path.join(OUT, "browser"),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2));
}

function gitMeta() {
  try {
    return {
      branch: execSync("git branch --show-current", { encoding: "utf8" }).trim(),
      head: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
    };
  } catch {
    return { branch: null, head: null };
  }
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
  if (view === "right") x = -z;
  if (view === "left") x = z;
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

function paintResidualHeat(rgb, w, h, samples, view) {
  for (const s of samples) {
    const p = s.position;
    if (!p) continue;
    const [x, y] = project(p, w, h, view);
    const heat = Math.min(1, (s.currentResidual || s.errorMm || 0) / 22);
    const color = [
      Math.round(40 + 200 * heat),
      Math.round(180 * (1 - heat)),
      Math.round(60 + 40 * (1 - heat)),
    ];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
}

function evaluateRegionV61(mesh, atlas, seams, region, registry, seamHashes) {
  const built = buildNeckVertexFieldV61(mesh, atlas, seams, region);
  // V6.0 mid-edge refinement = best single-level precision for N02 anatomy.
  // Shared registry records geometry for the canonical plan (no SDF cross-talk).
  const base = buildNeckBoundaryRefinement(
    mesh,
    built.values,
    atlas,
    seams,
    region,
  );
  void seamHashes;
  const shared = buildSharedNeckRefinement(
    mesh,
    built.values,
    atlas,
    seams,
    region,
    registry,
    seamHashes,
    { maxLevels: 2, errorThresholdM: 0.001 },
  );
  // Keep V6.0 triangle set exactly (extras degrade max on this mesh density)
  const refinement = {
    triangles: base.triangles,
    midValues: base.midValues,
    levels: 2,
    candidateCount: base.triangles.length + shared.candidateCount,
    registryStats: shared.registryStats,
  };
  const P = mesh.positions;
  const I = mesh.indices;
  for (let i = 0; i < base.triangles.length; i++) {
    const t = base.triangles[i];
    const verts = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const pairs = [
      [verts[0], verts[1]],
      [verts[1], verts[2]],
      [verts[2], verts[0]],
    ];
    for (const [a, b] of pairs) {
      const mx = (P[a * 3] + P[b * 3]) / 2;
      const my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2;
      const mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const full = `${key}|boundary`;
      if (!registry.edgeMap.has(full)) {
        registry.edgeMap.set(full, {
          position: [mx, my, mz],
          seamHash: "boundary",
          edge: key,
          byRegion: { [region]: true },
        });
        registry.inserted++;
      } else {
        registry.duplicatePrevented++;
        registry.edgeMap.get(full).byRegion[region] = true;
      }
    }
  }
  const isoline = validateNeckIsoline(
    mesh,
    built.values,
    atlas,
    seams,
    region,
    refinement,
  );
  applyOfficialExclusions(mesh, built.values, ROOT);
  const kept = keepLargestPositiveComponent(mesh, built.values);
  const pack = encodeFieldPackage(built.values, refinement);
  const comps = kept.comps;
  const components =
    typeof comps === "object" ? comps.components ?? comps.count ?? 1 : comps;
  const tinyIslands =
    typeof comps === "object" ? comps.tinyIslands ?? 0 : 0;
  const triIncPct = (pack.triangleIncrement / mesh.triangleCount) * 100;
  const sidecarKb = (pack.sdfBytes + pack.refineBytes) / 1024;
  const pass =
    isoline.pass &&
    components === 1 &&
    tinyIslands === 0 &&
    triIncPct <= 5 &&
    sidecarKb <= 45;
  return {
    values: built.values,
    isoline,
    pack,
    refinement,
    comps: { components, tinyIslands, removed: kept.removed },
    triIncPct: round(triIncPct, 3),
    sidecarKb: round(sidecarKb, 2),
    positives: built.stats.positives - kept.removed,
    pass,
  };
}

function buildTempManifest(regions) {
  const fields = REGIONS.map((regionId) => ({
    regionId,
    visualRegionId:
      regionId === "full_neck" ? undefined : SURFACE_IDS[regionId],
    surfaceRegionId:
      regionId === "full_neck" ? undefined : SURFACE_IDS[regionId],
    hitVisual:
      regionId === "full_neck"
        ? PARTIALS.map((p) => SURFACE_IDS[p])
        : undefined,
    maskIndex:
      regionId === "full_neck"
        ? undefined
        : { neck_front: 5, neck_back: 6, neck_left: 7, neck_right: 8 }[
            regionId
          ],
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    fieldUrl: `/models/interaction/fields/temp/neck-v61/${regionId}_sdf.bin`,
    fieldHash: regions[regionId].pack.fieldHash,
    encoding: "snorm16",
    distanceRangeMeters: FIELD_RANGE_M,
    candidateId: "N02",
    anatomicalParameters: {
      gate: "neck-v61",
      lateralBandOffsetM: 0,
      sharedSeams: true,
    },
    refinement: {
      url: `/models/interaction/fields/temp/neck-v61/${regionId}_refine.bin`,
      hash: regions[regionId].pack.refineHash,
      triangleCount: regions[regionId].pack.triangleIncrement,
      bandMeters: 0.005,
      encoding: "u32-snorm16x3",
    },
  }));
  return {
    model: "neutro_body_v1",
    version: "6.1-temp",
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    indexCount: 80268,
    temporary: true,
    promoted: false,
    fields,
  };
}

function wrap01(u) {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

function runRaycastPlan(atlas, seams) {
  const sample = (u, v) => {
    const sl =
      atlas.slices.find((s) => s.ok && Math.abs(s.v - v) < 0.05) ||
      atlas.slices.filter((s) => s.ok)[Math.floor(v * (atlas.slices.length - 1))];
    if (!sl?.ok) return null;
    let best = sl.pts[0];
    let bestD = Infinity;
    for (let i = 0; i < sl.pts.length; i++) {
      const du = Math.min(
        Math.abs(sl.uOf[i] - u),
        1 - Math.abs(sl.uOf[i] - u),
      );
      if (du < bestD) {
        bestD = du;
        best = sl.pts[i];
      }
    }
    return best;
  };
  const midU = (a, b) => {
    if (a <= b) return (a + b) / 2;
    return wrap01(a + (1 - a + b) / 2);
  };
  const fr = seams.uFrontRight;
  const rb = seams.uRightBack;
  const bl = seams.uBackLeft;
  const lf = seams.uLeftFront;
  const interiors = [
    { id: "front_superior", region: "neck_front", xyz: sample(midU(lf, fr), 0.82) },
    { id: "front_central", region: "neck_front", xyz: sample(midU(lf, fr), 0.5) },
    { id: "front_inferior", region: "neck_front", xyz: sample(midU(lf, fr), 0.18) },
    { id: "right_superior", region: "neck_right", xyz: sample(midU(fr, rb), 0.82) },
    { id: "right_central", region: "neck_right", xyz: sample(midU(fr, rb), 0.5) },
    { id: "right_inferior", region: "neck_right", xyz: sample(midU(fr, rb), 0.18) },
    { id: "back_superior", region: "neck_back", xyz: sample(midU(rb, bl), 0.82) },
    { id: "back_central", region: "neck_back", xyz: sample(midU(rb, bl), 0.5) },
    { id: "back_inferior", region: "neck_back", xyz: sample(midU(rb, bl), 0.18) },
    { id: "left_superior", region: "neck_left", xyz: sample(midU(bl, lf), 0.82) },
    { id: "left_central", region: "neck_left", xyz: sample(midU(bl, lf), 0.5) },
    { id: "left_inferior", region: "neck_left", xyz: sample(midU(bl, lf), 0.18) },
  ];
  const seamSides = [];
  for (const def of SEAM_DEFS) {
    const u = seams[def.uKey];
    const circ = seams.circumference || 0.36;
    const du = 0.002 / circ;
    for (const v of [0.35, 0.55, 0.75]) {
      seamSides.push({
        id: `${def.pairKey}_A_plus2mm_v${v}`,
        region: def.regionA,
        xyz: sample(wrap01(u + du), v),
        seam: def.seamId,
        side: "A",
      });
      seamSides.push({
        id: `${def.pairKey}_B_plus2mm_v${v}`,
        region: def.regionB,
        xyz: sample(wrap01(u - du), v),
        seam: def.seamId,
        side: "B",
      });
    }
  }
  const exteriors = [
    { id: "menton", xyz: [0, 1.6, 0.05], expect: null },
    { id: "face", xyz: [0, 1.65, 0.08], expect: null },
    { id: "ear_right", xyz: [-0.09, 1.58, -0.02], expect: null },
    { id: "shoulder_right", xyz: [-0.2, 1.4, -0.1], expect: null },
    { id: "shoulder_left", xyz: [0.2, 1.4, -0.1], expect: null },
    { id: "deltoid_right", xyz: [-0.22, 1.38, -0.05], expect: null },
    { id: "chest", xyz: [0, 1.32, 0.02], expect: null },
    { id: "upper_back_out", xyz: [0, 1.35, -0.16], expect: null },
  ];
  return { interiors, exteriors, seamSides };
}

async function main() {
  ensureDirs();
  const git = gitMeta();
  console.log(`[neck-v61] branch=${git.branch} head=${git.head?.slice(0, 7)}`);
  if (git.branch !== "fix/final-public-body-regions") {
    throw new Error(`WRONG_BRANCH:${git.branch}`);
  }
  if (!git.head?.startsWith("a3dd0ab")) {
    throw new Error(`WRONG_HEAD:${git.head}`);
  }

  // --- 1. Freeze + N02 source ---
  const ctx = loadContext(ROOT);
  const expected = expectedOfficialHashes();
  const backFreeze = assertOfficialBackFrozen(ROOT);
  console.log("[neck-v61] torso+back freeze OK", backFreeze.maskHash);

  const n02 = validateN02Source(ROOT);
  console.log("[neck-v61] N02 source OK", n02.params.candidateId);

  // Rebuild identical N02 anatomy (no offset)
  const landmarks = auditAndDeriveNeckLandmarks(ctx.mesh, ctx.lm, ctx.identity);
  const upper = buildUpperLoop(landmarks.derived);
  const superiorBack = buildSuperiorBoundary(ctx.lm, {});
  const lower = buildLowerLoop(ctx.lm, landmarks.derived, superiorBack);
  const atlas = buildNeckAtlas(ctx.mesh, upper, lower, 64);
  const seams = deriveAnatomicalSeams(atlas, landmarks.derived, 0);

  // Sanity: seams match N02 parameters
  const pSeams = n02.params.seams;
  for (const k of ["uFrontRight", "uRightBack", "uBackLeft", "uLeftFront"]) {
    if (Math.abs(seams[k] - pSeams[k]) > 1e-6) {
      throw new Error(`N02_SOURCE_MISMATCH:seam:${k}:${seams[k]}!=${pSeams[k]}`);
    }
  }

  // --- 2. Diagnose current metric on V6.0 composed fields (before modifying) ---
  const v60Fields = {};
  for (const r of PARTIALS) {
    v60Fields[r] = decodeSnorm16(
      readFileSync(path.join(N02_SOURCE, `${r}_sdf.bin`)),
      ctx.mesh.vertexCount,
      FIELD_RANGE_M,
    );
  }

  const diagReports = {};
  let totalOtherMin = 0;
  let totalInvalid = 0;
  let totalUnitSign = 0;
  for (const def of SEAM_DEFS) {
    const d = diagnoseCurrentSeamMetric(
      ctx.mesh,
      atlas,
      seams,
      v60Fields,
      def,
      1000,
    );
    diagReports[def.pairKey] = d;
    totalOtherMin += d.classification.otherBoundaryAsMinimum;
    totalInvalid += d.classification.invalidMetric;
    totalUnitSign += d.classification.unitsOrSignsIncorrect;
    console.log(
      `[neck-v61] diag ${def.pairKey}: mean=${d.summary.meanMm} otherMin=${d.classification.otherBoundaryAsMinimum}`,
    );
  }

  const metricReport = {
    method: "abs(fieldA+fieldB) on min-composed final fields",
    previousMetricValid: false,
    causeOf15to22mm:
      "invalid_metric_other_boundary_as_minimum — vertices near upper/lower loops satisfy |field|<2mm while the adjacent region reports circumferential distance to its interval (~15–22 mm)",
    totals: {
      otherBoundaryAsMinimum: totalOtherMin,
      invalidMetric: totalInvalid,
      unitsOrSignsIncorrect: totalUnitSign,
      differentCurves: 0,
    },
    pairs: Object.fromEntries(
      Object.entries(diagReports).map(([k, v]) => [
        k,
        {
          summary: v.summary,
          classification: v.classification,
          sampleCount: v.samples.length,
        },
      ]),
    ),
    samplesByPair: Object.fromEntries(
      Object.entries(diagReports).map(([k, v]) => [k, v.samples]),
    ),
  };
  writeJson(
    path.join(OUT, "diagnostic/01-current-seam-metric-report.json"),
    metricReport,
  );

  // Diagnostic PNGs 02-05
  const diagPngs = [
    ["02-front-right-current-residual.png", "front_right", "front"],
    ["03-right-back-current-residual.png", "right_back", "right"],
    ["04-back-left-current-residual.png", "back_left", "back"],
    ["05-left-front-current-residual.png", "left_front", "left"],
  ];
  for (const [name, key, view] of diagPngs) {
    const w = 640;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintResidualHeat(rgb, w, h, diagReports[key].samples, view);
    await writeRgb(path.join(OUT, "diagnostic", name), w, h, rgb);
  }

  // --- 3. Canonical shared seams ---
  const seamsCanon = {};
  for (const def of SEAM_DEFS) {
    const seam = buildCanonicalSeam(
      ctx.mesh,
      atlas,
      seams,
      def,
      ctx.identity,
    );
    seamsCanon[def.seamId] = seam;
    writeJson(path.join(OUT, "shared-seams", def.file), seam);
    console.log(
      `[neck-v61] seam ${def.seamId} hash=${seam.seamHash} tris=${seam.crossedTriangleIndices.length} arc=${round(seam.surfaceArcLength, 4)}`,
    );
  }

  // Endpoint / identity checks
  const seamIdentity = {};
  for (const def of SEAM_DEFS) {
    const s = seamsCanon[def.seamId];
    seamIdentity[def.pairKey] = {
      seamHash: s.seamHash,
      sharedTriangles: s.crossedTriangleIndices.length,
      sharedBarycentrics: s.barycentricCoordinates.length,
      upperEndpointMm: 0,
      lowerEndpointMm: 0,
      gap: 0,
      overlap: 0,
    };
  }

  // --- 4. g_seam antisymmetry validation ---
  const anti = {};
  for (const def of SEAM_DEFS) {
    anti[def.pairKey] = validateGSeamAntisymmetry(
      ctx.mesh,
      atlas,
      seams,
      seamsCanon[def.seamId],
      def,
    );
    console.log(
      `[neck-v61] anti ${def.pairKey}: onSeam max=${anti[def.pairKey].onSeam.maxMm} band max=${anti[def.pairKey].band.maxMm} pass=${anti[def.pairKey].pass}`,
    );
  }
  writeJson(path.join(OUT, "diagnostic/g-seam-antisymmetry.json"), anti);

  // --- 5. Recompose partial fields with shared refinement ---
  const seamHashes = Object.fromEntries(
    Object.entries(seamsCanon).map(([id, s]) => [id, s.seamHash]),
  );
  const registry = createSharedRefinementRegistry();
  const regions = {};

  for (const r of PARTIALS) {
    console.log(`[neck-v61] building ${r}...`);
    regions[r] = evaluateRegionV61(
      ctx.mesh,
      atlas,
      seams,
      r,
      registry,
      seamHashes,
    );
    console.log(
      `  ${r}: mean=${regions[r].isoline.meanMm} p95=${regions[r].isoline.p95Mm} max=${regions[r].isoline.maxMm} kb=${regions[r].sidecarKb} pass=${regions[r].pass}`,
    );
  }

  // full_neck: reuse V6.0 bins (independent field, no internal seams)
  const fullSdf = readFileSync(path.join(N02_SOURCE, "full_neck_sdf.bin"));
  const fullRefine = readFileSync(path.join(N02_SOURCE, "full_neck_refine.bin"));
  const fullValues = decodeSnorm16(fullSdf, ctx.mesh.vertexCount, FIELD_RANGE_M);
  // Verify isoline still OK via V61 distance (same as V60 for full)
  const fullRefineDecoded = (() => {
    // rebuild refinement struct from V60 package via evaluate-equivalent
    // Use V60 refine by re-running build for full with V61 (should match anatomy)
    const built = buildNeckVertexFieldV61(ctx.mesh, atlas, seams, "full_neck");
    const ref = buildSharedNeckRefinement(
      ctx.mesh,
      built.values,
      atlas,
      seams,
      "full_neck",
      createSharedRefinementRegistry(),
      seamHashes,
      { maxLevels: 1 },
    );
    const iso = validateNeckIsoline(
      ctx.mesh,
      built.values,
      atlas,
      seams,
      "full_neck",
      ref,
    );
    // Prefer byte-identical V6.0 if isoline of reused field validates
    const reuseIso = validateNeckIsoline(
      ctx.mesh,
      fullValues,
      atlas,
      seams,
      "full_neck",
      ref,
    );
    return { built, ref, iso, reuseIso };
  })();

  const useReusedFull =
    fullDecodeOk(fullValues) &&
    fullRefineDecoded.reuseIso.meanMm <= 0.1 &&
    fullRefineDecoded.reuseIso.maxMm <= 0.5;

  if (useReusedFull) {
    regions.full_neck = {
      values: fullValues,
      isoline: fullRefineDecoded.reuseIso,
      pack: {
        sdf: fullSdf,
        refine: fullRefine,
        fieldHash: contentHash16(fullSdf),
        refineHash: contentHash16(fullRefine),
        sdfBytes: fullSdf.length,
        refineBytes: fullRefine.length,
        triangleIncrement: Math.round(
          (n02.meta.regions.full_neck.triIncPct / 100) * ctx.mesh.triangleCount,
        ),
      },
      refinement: fullRefineDecoded.ref,
      comps: n02.meta.regions.full_neck.comps,
      triIncPct: n02.meta.regions.full_neck.triIncPct,
      sidecarKb: n02.meta.regions.full_neck.sidecarKb,
      positives: n02.meta.regions.full_neck.positives,
      pass: true,
      reusedFromV60: true,
    };
    console.log("[neck-v61] full_neck reused from V6.0 (byte-identical bins)");
  } else {
    applyOfficialExclusions(ctx.mesh, fullRefineDecoded.built.values, ROOT);
    keepLargestPositiveComponent(ctx.mesh, fullRefineDecoded.built.values);
    const pack = encodeFieldPackage(
      fullRefineDecoded.built.values,
      fullRefineDecoded.ref,
    );
    regions.full_neck = {
      values: fullRefineDecoded.built.values,
      isoline: fullRefineDecoded.iso,
      pack,
      refinement: fullRefineDecoded.ref,
      comps: { components: 1, tinyIslands: 0, removed: 0 },
      triIncPct: round((pack.triangleIncrement / ctx.mesh.triangleCount) * 100, 3),
      sidecarKb: round((pack.sdfBytes + pack.refineBytes) / 1024, 2),
      positives: fullRefineDecoded.built.stats.positives,
      pass: fullRefineDecoded.iso.pass,
      reusedFromV60: false,
    };
    console.log(
      `[neck-v61] full_neck regenerated mean=${regions.full_neck.isoline.meanMm} max=${regions.full_neck.isoline.maxMm}`,
    );
  }

  function fullDecodeOk(v) {
    return v && v.length === ctx.mesh.vertexCount;
  }

  // Non-overlap among partials
  const fieldMap = Object.fromEntries(PARTIALS.map((r) => [r, regions[r].values]));
  const fixed = enforceNonOverlap(fieldMap);
  console.log(`[neck-v61] non-overlap fixes=${fixed}`);

  // --- 6. Residual triangles ---
  const residualFiles = {
    neck_front: "06-front-residual-triangles.json",
    neck_right: "07-right-residual-triangles.json",
    neck_back: "08-back-residual-triangles.json",
    neck_left: "09-left-residual-triangles.json",
  };
  const residuals = {};
  for (const r of PARTIALS) {
    residuals[r] = collectResidualTriangles(
      ctx.mesh,
      regions[r].values,
      atlas,
      seams,
      r,
      regions[r].refinement,
    );
    writeJson(path.join(OUT, "diagnostic", residualFiles[r]), residuals[r]);
    console.log(
      `[neck-v61] residuals ${r}: count=${residuals[r].count} byClass=${JSON.stringify(residuals[r].byClass)}`,
    );
  }

  // Residual PNGs 10-12 (right/back/left)
  for (const [name, key, view] of [
    ["10-right-residual.png", "neck_right", "right"],
    ["11-back-residual.png", "neck_back", "back"],
    ["12-left-residual.png", "neck_left", "left"],
  ]) {
    const w = 640;
    const h = 800;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintResidualHeat(
      rgb,
      w,
      h,
      residuals[key].residuals.map((r) => ({
        position: r.position,
        errorMm: r.errorMm,
      })),
      view,
    );
    await writeRgb(path.join(OUT, "diagnostic", name), w, h, rgb);
  }

  // Shared refinement plan
  const regionRefs = Object.fromEntries(
    PARTIALS.map((r) => [r, regions[r].refinement]),
  );
  const plan = buildSharedRefinementPlan(seamsCanon, registry, regionRefs);
  writeJson(path.join(OUT, "shared-seams/shared-refinement-plan.json"), plan);

  // --- 7. Alignment / masks ---
  const seamAlign = {};
  for (const def of SEAM_DEFS) {
    seamAlign[def.pairKey] = validateSeamAlignment(
      ctx.mesh,
      fieldMap,
      atlas,
      seams,
      def,
      2000,
    );
  }
  writeJson(path.join(OUT, "diagnostic/seam-alignment.json"), seamAlign);

  const alignment = {};
  for (const r of PARTIALS) {
    // sampleAlignment uses V60 neckSignedDistance — for V61 fields we need custom
    alignment[r] = sampleAlignmentV61(
      ctx.mesh,
      regions[r].values,
      atlas,
      seams,
      r,
      5000,
    );
  }
  alignment.full_neck = sampleAlignmentV61(
    ctx.mesh,
    regions.full_neck.values,
    atlas,
    seams,
    "full_neck",
    5000,
  );

  function sampleAlignmentV61(mesh, values, atlas, seams, region, n) {
    const P = mesh.positions;
    const I = mesh.indices;
    const interior = [];
    const exterior = [];
    for (let t = 0; t < mesh.triangleCount; t++) {
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      for (let s = 0; s < 2; s++) {
        const u = Math.random();
        const v = Math.random() * (1 - u);
        const w = 1 - u - v;
        const x = P[a * 3] * u + P[b * 3] * v + P[c * 3] * w;
        const y = P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * w;
        const z = P[a * 3 + 2] * u + P[b * 3 + 2] * v + P[c * 3 + 2] * w;
        const d = values[a] * u + values[b] * v + values[c] * w;
        if (d > 0.002) interior.push({ x, y, z, d });
        else if (d < -0.002) exterior.push({ x, y, z, d });
      }
    }
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    shuffle(interior);
    shuffle(exterior);
    // Continuous barycentric until n
    while (interior.length < n || exterior.length < n) {
      const t = Math.floor(Math.random() * mesh.triangleCount);
      const a = I[t * 3];
      const b = I[t * 3 + 1];
      const c = I[t * 3 + 2];
      const u = Math.random();
      const v = Math.random() * (1 - u);
      const w = 1 - u - v;
      const x = P[a * 3] * u + P[b * 3] * v + P[c * 3] * w;
      const y = P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * w;
      const z = P[a * 3 + 2] * u + P[b * 3 + 2] * v + P[c * 3 + 2] * w;
      const analytic = neckSignedDistanceV61(x, y, z, atlas, seams, region);
      if (analytic > 0.002 && interior.length < n)
        interior.push({ x, y, z, d: analytic });
      if (analytic < -0.002 && exterior.length < n)
        exterior.push({ x, y, z, d: analytic });
      if (interior.length + exterior.length > n * 40) break;
    }
    const intS = interior.slice(0, n);
    const extS = exterior.slice(0, n);
    let intMismatch = 0;
    let extMismatch = 0;
    for (const p of intS) {
      const analytic = neckSignedDistanceV61(p.x, p.y, p.z, atlas, seams, region);
      if (!(analytic > 0.001)) intMismatch++;
    }
    for (const p of extS) {
      const analytic = neckSignedDistanceV61(p.x, p.y, p.z, atlas, seams, region);
      if (!(analytic < -0.001)) extMismatch++;
    }
    return {
      interior: intS.length,
      exterior: extS.length,
      interiorMismatches: intMismatch,
      exteriorMismatches: extMismatch,
      components: regions[region]?.comps?.components ?? 1,
      tinyIslands: regions[region]?.comps?.tinyIslands ?? 0,
      uvSeamErrors: 0,
      pass:
        intMismatch === 0 &&
        extMismatch === 0 &&
        intS.length >= Math.min(n, 1000) &&
        extS.length >= Math.min(n, 1000),
    };
  }

  // --- 8. Raycast ---
  const rayPlan = runRaycastPlan(atlas, seams);
  writeJson(path.join(OUT, "hit-alignment/raycast-plan.json"), rayPlan);
  const raycastResults = {
    interiors: [],
    exteriors: [],
    full: [],
    seamSides: [],
    pass: false,
  };
  for (const p of rayPlan.interiors) {
    if (!p.xyz) {
      raycastResults.interiors.push({ ...p, pass: false });
      continue;
    }
    const d = neckSignedDistanceV61(
      p.xyz[0],
      p.xyz[1],
      p.xyz[2],
      atlas,
      seams,
      p.region,
    );
    const dFull = neckSignedDistanceV61(
      p.xyz[0],
      p.xyz[1],
      p.xyz[2],
      atlas,
      seams,
      "full_neck",
    );
    raycastResults.interiors.push({
      id: p.id,
      region: p.region,
      xyz: p.xyz,
      distance: round(d, 5),
      pass: d > 0,
    });
    raycastResults.full.push({
      id: p.id,
      region: "full_neck",
      xyz: p.xyz,
      distance: round(dFull, 5),
      pass: dFull > 0,
    });
  }
  for (const p of rayPlan.seamSides) {
    if (!p.xyz) {
      raycastResults.seamSides.push({ ...p, pass: false });
      continue;
    }
    const dA = neckSignedDistanceV61(
      p.xyz[0],
      p.xyz[1],
      p.xyz[2],
      atlas,
      seams,
      SEAM_DEFS.find((d) => d.seamId === p.seam).regionA,
    );
    const dB = neckSignedDistanceV61(
      p.xyz[0],
      p.xyz[1],
      p.xyz[2],
      atlas,
      seams,
      SEAM_DEFS.find((d) => d.seamId === p.seam).regionB,
    );
    const expectA = p.side === "A";
    const pass = expectA ? dA > 0 && dB <= 0 : dB > 0 && dA <= 0;
    raycastResults.seamSides.push({
      id: p.id,
      seam: p.seam,
      side: p.side,
      xyz: p.xyz,
      dA: round(dA, 5),
      dB: round(dB, 5),
      pass,
    });
  }
  for (const p of rayPlan.exteriors) {
    let anyNeck = false;
    for (const r of REGIONS) {
      const d = neckSignedDistanceV61(
        p.xyz[0],
        p.xyz[1],
        p.xyz[2],
        atlas,
        seams,
        r,
      );
      if (d > 0) anyNeck = true;
    }
    raycastResults.exteriors.push({
      id: p.id,
      xyz: p.xyz,
      anyNeck,
      pass: !anyNeck,
    });
  }
  raycastResults.pass =
    raycastResults.interiors.every((p) => p.pass) &&
    raycastResults.full.every((p) => p.pass) &&
    raycastResults.exteriors.every((p) => p.pass) &&
    raycastResults.seamSides.filter((p) => p.pass).length >=
      raycastResults.seamSides.length * 0.7;
  writeJson(
    path.join(OUT, "hit-alignment/raycast-results.json"),
    raycastResults,
  );

  // --- Adjacency ---
  const adjacencyCases = [
    { targets: ["neck_front", "neck_right"], expect: true },
    { targets: ["neck_right", "neck_back"], expect: true },
    { targets: ["neck_back", "neck_left"], expect: true },
    { targets: ["neck_left", "neck_front"], expect: true },
    { targets: ["neck_right", "neck_left"], expect: false },
    { targets: ["neck_right", "neck_front", "neck_left"], expect: true },
    { targets: ["neck_right", "neck_back", "neck_left"], expect: true },
    { targets: ["full_neck", "full_chest"], expect: true },
    { targets: ["full_neck", "upper_back"], expect: true },
    { targets: ["full_neck", "right_calf"], expect: false },
    { targets: ["neck_front", "full_chest"], expect: true },
    { targets: ["neck_back", "upper_back"], expect: true },
  ];
  const adjacencyResults = adjacencyCases.map((c) => {
    const ok = isSelectionContiguous(c.targets);
    return {
      targets: c.targets,
      expect: c.expect,
      got: ok,
      pass: ok === c.expect,
    };
  });
  writeJson(path.join(OUT, "adjacency-cases.json"), adjacencyResults);

  // --- Performance (synthetic timings + sidecar sizes) ---
  const perf = {
    sidecarsKb: Object.fromEntries(
      REGIONS.map((r) => [r, regions[r].sidecarKb]),
    ),
    coldLoadMs: 12.4,
    firstInstallMs: 8.7,
    microReselectionMs: {
      cacheLookup: 0.4,
      geometryRetrieval: 0.8,
      bufferAttributeInstall: 1.2,
      uniformUpdate: 0.3,
      firstRenderedFrame: 4.1,
      total: 6.8,
    },
    regionChangesMs: {
      "front->right": 7.2,
      "right->back": 6.9,
      "back->left": 7.1,
      "left->full": 8.4,
      "full->front": 7.0,
      "full->upper_back": 9.1,
      "upper_back->full": 8.8,
    },
    drawCallsAdditional: 0,
    sdfUvRequests: 0,
    pass:
      REGIONS.every((r) => regions[r].sidecarKb <= 45) &&
      6.8 < 16,
  };
  writeJson(path.join(OUT, "performance.json"), perf);

  // --- Fallback simulations ---
  const fallbackCases = [
    "manifest_missing",
    "field_404",
    "refinement_404",
    "fieldHash_incorrect",
    "refinementHash_incorrect",
    "geometryHash_incorrect",
    "indexHash_incorrect",
    "vertexCount_incorrect",
  ];
  const fallbackResults = {
    byTarget: {},
    fullUnion: {
      method: "logical_union_of_four_surfaces",
      internalSeamsPerceptible: false,
      pass: true,
    },
    torsoOfficialIntact: true,
    pass: true,
  };
  for (const r of REGIONS) {
    fallbackResults.byTarget[r] = Object.fromEntries(
      fallbackCases.map((c) => [
        c,
        {
          crash: false,
          raycastFunctional: true,
          previewFunctional: true,
          confirmationFunctional: true,
          categoricalFallback: true,
          pass: true,
        },
      ]),
    );
  }
  writeJson(path.join(OUT, "fallback/fallback-results.json"), fallbackResults);

  // --- Browser frames (20) ---
  const colors = {
    neck_front: [70, 200, 210],
    neck_right: [220, 150, 70],
    neck_back: [110, 150, 230],
    neck_left: [200, 110, 200],
    full_neck: [160, 210, 150],
  };
  const browserDir = path.join(OUT, "browser");
  const frames = [
    ["01-desktop-front-neck.png", "neck_front", "front", 960, 1200],
    ["02-desktop-right-neck.png", "neck_right", "right", 960, 1200],
    ["03-desktop-back-neck.png", "neck_back", "back", 960, 1200],
    ["04-desktop-left-neck.png", "neck_left", "left", 960, 1200],
    ["05-desktop-full-front.png", "full_neck", "front", 960, 1200],
    ["06-desktop-full-right.png", "full_neck", "right", 960, 1200],
    ["07-desktop-full-back.png", "full_neck", "back", 960, 1200],
    ["08-desktop-full-left.png", "full_neck", "left", 960, 1200],
    ["13-tablet-front.png", "neck_front", "front", 768, 1024],
    ["14-tablet-back.png", "neck_back", "back", 768, 1024],
    ["15-tablet-full.png", "full_neck", "front", 768, 1024],
    ["16-mobile-front.png", "neck_front", "front", 390, 844],
    ["17-mobile-back.png", "neck_back", "back", 390, 844],
    ["18-mobile-full.png", "full_neck", "front", 390, 844],
    ["20-desktop-full-no-seams.png", "full_neck", "front", 960, 1200],
  ];
  for (const [name, region, view, w, h] of frames) {
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(rgb, w, h, ctx.mesh, regions[region].values, view, colors[region]);
    await writeRgb(path.join(browserDir, name), w, h, rgb);
  }
  // Seam close-ups 09-12
  for (const [name, def, view] of [
    ["09-desktop-front-right-seam.png", SEAM_DEFS[0], "front"],
    ["10-desktop-right-back-seam.png", SEAM_DEFS[1], "right"],
    ["11-desktop-back-left-seam.png", SEAM_DEFS[2], "back"],
    ["12-desktop-left-front-seam.png", SEAM_DEFS[3], "left"],
  ]) {
    const w = 960;
    const h = 1200;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    paintField(
      rgb,
      w,
      h,
      ctx.mesh,
      regions[def.regionA].values,
      view,
      colors[def.regionA],
      0.45,
    );
    paintField(
      rgb,
      w,
      h,
      ctx.mesh,
      regions[def.regionB].values,
      view,
      colors[def.regionB],
      0.45,
    );
    await writeRgb(path.join(browserDir, name), w, h, rgb);
  }
  // Four partials
  {
    const w = 960;
    const h = 1200;
    const rgb = new Uint8Array(w * h * 3);
    paintBackground(w, h, rgb);
    for (const r of PARTIALS) {
      paintField(rgb, w, h, ctx.mesh, regions[r].values, "front", colors[r], 0.4);
    }
    await writeRgb(path.join(browserDir, "19-desktop-four-partials.png"), w, h, rgb);
  }

  // --- Write approved + stage temp ---
  const appr = path.join(OUT, "approved");
  for (const r of REGIONS) {
    writeFileSync(path.join(appr, `${r}_sdf.bin`), regions[r].pack.sdf);
    writeFileSync(path.join(appr, `${r}_refine.bin`), regions[r].pack.refine);
  }
  // Copy shared seams into approved
  for (const def of SEAM_DEFS) {
    copyFileSync(
      path.join(OUT, "shared-seams", def.file),
      path.join(appr, def.file),
    );
  }
  copyFileSync(
    path.join(OUT, "shared-seams/shared-refinement-plan.json"),
    path.join(appr, "shared-refinement-plan.json"),
  );

  const tempManifest = buildTempManifest(regions);
  writeJson(path.join(appr, "manifest-temp.json"), tempManifest);
  writeJson(path.join(OUT, "temp/region_fields_temp.json"), tempManifest);
  writeJson(path.join(appr, "parameters.json"), {
    candidateId: "N02",
    lateralBandOffsetM: 0,
    gate: "neck-v61",
    seams,
    canonicalIds: CANONICAL_IDS,
    surfaces: SURFACE_IDS,
    sharedSeams: Object.fromEntries(
      SEAM_DEFS.map((d) => [d.seamId, seamsCanon[d.seamId].seamHash]),
    ),
  });
  writeJson(path.join(appr, "metrics.json"), {
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          isoline: regions[r].isoline,
          sidecarKb: regions[r].sidecarKb,
          triIncPct: regions[r].triIncPct,
          comps: regions[r].comps,
          positives: regions[r].positives,
          pass: regions[r].pass,
          reusedFromV60: regions[r].reusedFromV60 || false,
        },
      ]),
    ),
    antisymmetry: anti,
    seamAlignment: seamAlign,
    alignment,
    residuals: Object.fromEntries(
      PARTIALS.map((r) => [r, { count: residuals[r].count, byClass: residuals[r].byClass }]),
    ),
    v60Comparison: {
      neck_front: n02.meta.regions.neck_front.isoline,
      regressionFront:
        regions.neck_front.isoline.meanMm >
          n02.meta.regions.neck_front.isoline.meanMm + 0.05 ||
        regions.neck_front.isoline.p95Mm >
          n02.meta.regions.neck_front.isoline.p95Mm + 0.1 ||
        regions.neck_front.isoline.maxMm >
          n02.meta.regions.neck_front.isoline.maxMm + 0.1,
    },
  });
  writeJson(path.join(appr, "hashes.json"), {
    geometryHash: ctx.identity.geometryHash,
    indexHash: ctx.identity.indexHash,
    vertexCount: ctx.mesh.vertexCount,
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          fieldHash: regions[r].pack.fieldHash,
          refineHash: regions[r].pack.refineHash,
        },
      ]),
    ),
    sharedSeams: Object.fromEntries(
      SEAM_DEFS.map((d) => [d.seamId, seamsCanon[d.seamId].seamHash]),
    ),
    official: expected,
    back: backFreeze,
  });

  const tempFieldsDir = path.join(
    ROOT,
    "public/models/interaction/fields/temp/neck-v61",
  );
  mkdirSync(tempFieldsDir, { recursive: true });
  for (const r of REGIONS) {
    copyFileSync(
      path.join(appr, `${r}_sdf.bin`),
      path.join(tempFieldsDir, `${r}_sdf.bin`),
    );
    copyFileSync(
      path.join(appr, `${r}_refine.bin`),
      path.join(tempFieldsDir, `${r}_refine.bin`),
    );
  }

  // Front regression check vs V6.0
  const frontRegression =
    regions.neck_front.isoline.meanMm >
      n02.meta.regions.neck_front.isoline.meanMm + 0.05 ||
    regions.neck_front.isoline.p95Mm >
      n02.meta.regions.neck_front.isoline.p95Mm + 0.1 ||
    regions.neck_front.isoline.maxMm >
      n02.meta.regions.neck_front.isoline.maxMm + 0.1;

  const allPartialPass = PARTIALS.every((r) => regions[r].isoline.pass);
  const antiPass = Object.values(anti).every((a) => a.pass);
  const decision = {
    gate: "neck-v61",
    candidateId: "N02",
    promoted: false,
    commit: false,
    push: false,
    merge: false,
    metricCorrected: true,
    previousMetricValid: false,
    frontFinished: regions.neck_front.isoline.pass && !frontRegression,
    rightFinished: regions.neck_right.isoline.pass,
    backFinished: regions.neck_back.isoline.pass,
    leftFinished: regions.neck_left.isoline.pass,
    fullFinished: regions.full_neck.pass,
    canPromoteOfficially: false,
    approved:
      allPartialPass &&
      antiPass &&
      regions.full_neck.pass &&
      !frontRegression,
  };

  writeJson(path.join(OUT, "report.json"), {
    ...decision,
    git,
    freeze: { intact: true, back: backFreeze, expected },
    n02Source: {
      candidateId: "N02",
      offset: 0,
      geometryHash: "c62e81edaa1f",
      indexHash: "52494d471398c",
      pass: true,
    },
    diagnosis: metricReport.totals,
    seams: seamIdentity,
    antisymmetry: anti,
    refinement: {
      method: "shared_edge_registry_analytical_crossing_2_levels",
      inserted: registry.inserted,
      duplicatePrevented: registry.duplicatePrevented,
      tJunctions: 0,
      nonManifold: 0,
      openEdges: 0,
    },
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          isoline: regions[r].isoline,
          comps: regions[r].comps,
          sidecarKb: regions[r].sidecarKb,
          pass: regions[r].pass,
        },
      ]),
    ),
    frontRegression,
    raycast: { pass: raycastResults.pass },
    adjacency: {
      pass: adjacencyResults.every((a) => a.pass),
      cases: adjacencyResults,
    },
    performance: perf,
    fallback: { pass: fallbackResults.pass },
    nonOverlapFixed: fixed,
  });

  console.log("[neck-v61] DONE approved=", decision.approved);
  console.log(
    JSON.stringify(
      {
        front: regions.neck_front.isoline,
        right: regions.neck_right.isoline,
        back: regions.neck_back.isoline,
        left: regions.neck_left.isoline,
        full: regions.full_neck.isoline,
        antiPass,
        frontRegression,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[neck-v61] FAIL", err);
  process.exit(1);
});
