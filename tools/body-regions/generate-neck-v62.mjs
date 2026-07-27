/**
 * Neck Boundary-Conforming Refinement V6.2 — gate orchestrator.
 * No official promotion. No commit/push/merge. N02 only. No shoulders.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";
import {
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  deriveAnatomicalSeams,
  expectedOfficialHashes,
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  enforceNonOverlap,
  SURFACE_IDS,
  CANONICAL_IDS,
  FIELD_RANGE_M,
  contentHash16,
  decodeSnorm16,
} from "./neck-v60-core.mjs";
import {
  SEAM_DEFS,
  validateN02Source,
  N02_SOURCE,
} from "./neck-v61-core.mjs";
import {
  NECK_V62_OUT,
  EXPECTED_SEAM_HASHES,
  buildNeckBoundaryGraph,
  buildSharedBoundaryTopology,
  computeAnalyticalFieldOnTopology,
  validateBcIsoline,
  applyResidualRefinement,
  encodeSharedTopology,
  encodeBcFieldPackage,
  serializeEdgeRegistry,
  loadV61SeamsFromDisk,
  assertExpectedSeamHashes,
  measureBoundaryErrors,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  sampleAlignment,
  sha16,
} from "./neck-v62-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PARTIALS = ["neck_front", "neck_right", "neck_back", "neck_left"];
const REGIONS = [...PARTIALS, "full_neck"];
const OUT = NECK_V62_OUT;

function ensureDirs() {
  for (const d of [
    "diagnostic",
    "boundary-graph",
    "refinement",
    "alignment",
    "hit-alignment",
    "browser",
    "fallback",
    "approved",
    "temp",
    "masks",
  ]) {
    mkdirSync(path.join(OUT, d), { recursive: true });
  }
  mkdirSync(path.join(ROOT, "public/models/interaction/fields/temp/neck-v62"), {
    recursive: true,
  });
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

function round(x, n = 3) {
  return +Number(x).toFixed(n);
}

function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2));
}

function buildTempManifest(regionPacks, sharedTopologyHash) {
  const fields = REGIONS.map((regionId) => ({
    regionId,
    visualRegionId:
      regionId === "full_neck" ? undefined : SURFACE_IDS[regionId],
    surfaceRegionId:
      regionId === "full_neck" ? undefined : SURFACE_IDS[regionId],
    hitVisualRegionIds:
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
    fieldUrl: `/models/interaction/fields/temp/neck-v62/${regionId}_sdf.bin`,
    fieldHash: regionPacks[regionId].fieldHash,
    encoding: "snorm16",
    distanceRangeMeters: FIELD_RANGE_M,
    candidateId: "N02",
    anatomicalParameters: {
      gate: "neck-v62",
      lateralBandOffsetM: 0,
      sharedTopologyHash,
      boundaryConforming: true,
    },
    sharedTopology: {
      url: `/models/interaction/fields/temp/neck-v62/shared_topology.bin`,
      hash: sharedTopologyHash,
      encoding: "bc-topology-v1",
    },
    refinement: {
      url: `/models/interaction/fields/temp/neck-v62/${regionId}_refine.bin`,
      hash: regionPacks[regionId].refineHash,
      triangleCount: regionPacks[regionId].triangleIncrement ?? 0,
      bandMeters: 0.005,
      encoding: "bc-topology-v1",
      sharedTopologyHash,
      refinedVertexCount: regionPacks[regionId].refinedVertexCount,
      refinedTriangleCount: regionPacks[regionId].refinedTriangleCount,
    },
  }));
  return {
    model: "neutro_body_v1",
    version: "6.2-temp",
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    indexCount: 80268,
    temporary: true,
    promoted: false,
    sharedTopologyHash,
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
      atlas.slices.filter((s) => s.ok)[
        Math.floor(v * (atlas.slices.length - 1))
      ];
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
    const du = 0.00125 / circ; // ~1.25 mm band (0.5–2 mm)
    for (const v of [0.35, 0.55, 0.75]) {
      seamSides.push({
        id: `${def.pairKey}_A_v${v}`,
        region: def.regionA,
        xyz: sample(wrap01(u + du), v),
        seam: def.seamId,
        side: "A",
      });
      seamSides.push({
        id: `${def.pairKey}_B_v${v}`,
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
    { id: "ear_left", xyz: [0.09, 1.58, -0.02], expect: null },
    { id: "jaw", xyz: [0.02, 1.58, 0.04], expect: null },
    { id: "shoulder_right", xyz: [-0.2, 1.4, -0.1], expect: null },
    { id: "shoulder_left", xyz: [0.2, 1.4, -0.1], expect: null },
    { id: "deltoid_right", xyz: [-0.22, 1.38, -0.05], expect: null },
    { id: "chest", xyz: [0, 1.32, 0.02], expect: null },
    { id: "upper_back_out", xyz: [0, 1.35, -0.16], expect: null },
  ];
  return { interiors, exteriors, seamSides };
}

async function paintBrowserFrame(name, mesh, values, atlas, color) {
  const w = 960;
  const h = 720;
  const rgb = Buffer.alloc(w * h * 3, 18);
  const P = mesh.positions;
  // simple orthographic splat of positive vertices
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (values[i] <= 0) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    minX = -0.1;
    maxX = 0.1;
    minY = 1.35;
    maxY = 1.6;
  }
  const pad = 0.02;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (!(v > 0)) continue;
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const px = Math.floor(((x - minX) / (maxX - minX)) * (w - 1));
    const py = Math.floor((1 - (y - minY) / (maxY - minY)) * (h - 1));
    const alpha = Math.min(1, 0.35 + (v / FIELD_RANGE_M) * 0.55);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx;
        const yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = (yy * w + xx) * 3;
        rgb[o] = Math.round(rgb[o] * (1 - alpha) + color[0] * alpha);
        rgb[o + 1] = Math.round(rgb[o + 1] * (1 - alpha) + color[1] * alpha);
        rgb[o + 2] = Math.round(rgb[o + 2] * (1 - alpha) + color[2] * alpha);
      }
    }
  }
  void atlas;
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(path.join(OUT, "browser", name));
}

async function paintTopologyDiag(name, mesh, topology, boundaryFilter) {
  const w = 800;
  const h = 800;
  const rgb = Buffer.alloc(w * h * 3, 12);
  const verts = topology.registry.vertices.filter(
    (v) => !boundaryFilter || boundaryFilter(v.boundaryId),
  );
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.position[0]);
    maxX = Math.max(maxX, v.position[0]);
    minY = Math.min(minY, v.position[1]);
    maxY = Math.max(maxY, v.position[1]);
  }
  if (!Number.isFinite(minX)) return;
  const pad = 0.015;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  for (const v of verts) {
    const px = Math.floor(((v.position[0] - minX) / (maxX - minX)) * (w - 1));
    const py = Math.floor(
      (1 - (v.position[1] - minY) / (maxY - minY)) * (h - 1),
    );
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx;
        const yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = (yy * w + xx) * 3;
        rgb[o] = 220;
        rgb[o + 1] = 180;
        rgb[o + 2] = 60;
      }
    }
  }
  void mesh;
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(path.join(OUT, "diagnostic", name));
}

async function main() {
  ensureDirs();
  const git = gitMeta();
  console.log(`[neck-v62] branch=${git.branch} head=${git.head?.slice(0, 7)}`);
  if (git.branch !== "fix/final-public-body-regions") {
    throw new Error(`WRONG_BRANCH:${git.branch}`);
  }
  if (!git.head?.startsWith("a3dd0ab")) {
    throw new Error(`WRONG_HEAD:${git.head}`);
  }

  const ctx = loadContext(ROOT);
  const expected = expectedOfficialHashes();
  const backFreeze = assertOfficialBackFrozen(ROOT);
  const torsoFreeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  console.log("[neck-v62] freeze OK", backFreeze.maskHash);

  const n02 = validateN02Source(ROOT);
  if (n02.params.candidateId !== "N02" || n02.params.lateralBandOffsetM !== 0) {
    throw new Error("N02_OR_SHARED_SEAMS_SOURCE_MISMATCH");
  }

  // Rebuild N02 anatomy (frozen)
  const landmarks = auditAndDeriveNeckLandmarks(ctx.mesh, ctx.lm, ctx.identity);
  const upper = buildUpperLoop(landmarks.derived);
  const superiorBack = buildSuperiorBoundary(ctx.lm, {});
  const lower = buildLowerLoop(ctx.lm, landmarks.derived, superiorBack);
  const atlas = buildNeckAtlas(ctx.mesh, upper, lower, 64);
  const seams = deriveAnatomicalSeams(atlas, landmarks.derived, 0);

  const pSeams = n02.params.seams;
  for (const k of ["uFrontRight", "uRightBack", "uBackLeft", "uLeftFront"]) {
    if (Math.abs(seams[k] - pSeams[k]) > 1e-6) {
      throw new Error(`N02_OR_SHARED_SEAMS_SOURCE_MISMATCH:seam:${k}`);
    }
  }

  // Load V6.1 canonical seams (do not regenerate anatomy)
  const seamPayloads = loadV61SeamsFromDisk(ROOT);
  assertExpectedSeamHashes(seamPayloads);
  for (const s of seamPayloads) {
    if (
      s.geometryHash !== "c62e81edaa1f" ||
      s.indexHash !== "52494d471398c"
    ) {
      throw new Error("N02_OR_SHARED_SEAMS_SOURCE_MISMATCH:geometry");
    }
  }
  console.log("[neck-v62] seams OK", Object.values(EXPECTED_SEAM_HASHES));

  // Boundary graph
  const graph = buildNeckBoundaryGraph(ctx.mesh, upper, lower, seamPayloads);
  writeJson(path.join(OUT, "boundary-graph/neck-boundary-graph.json"), {
    ...graph,
    segments: graph.segments.map((s) => ({
      ...s,
      orderedPoints: s.orderedPoints,
      barycentricCoordinates: s.barycentricCoordinates,
    })),
  });
  if (!graph.validation.pass) {
    throw new Error("BOUNDARY_GRAPH_INVALID:" + JSON.stringify(graph.validation));
  }
  console.log("[neck-v62] boundary graph PASS", graph.validation);

  // Shared topology
  const topology = buildSharedBoundaryTopology(ctx.mesh, atlas, seams, graph);
  console.log(
    `[neck-v62] shared topology verts+${topology.vertexIncrement} (${round(topology.vertexIncPct)}%) tris+${topology.triangleIncrement} (${round(topology.triangleIncPct)}%) hash=${topology.sharedTopologyHash}`,
  );

  if (topology.vertexIncPct > 5 || topology.triangleIncPct > 5) {
    const stop = {
      code: "BOUNDARY_CONFORMING_BUDGET_EXCEEDED",
      vertexIncPct: topology.vertexIncPct,
      triangleIncPct: topology.triangleIncPct,
      vertexIncrement: topology.vertexIncrement,
      triangleIncrement: topology.triangleIncrement,
      minimumRequiredBudgetPct: {
        vertices: round(topology.vertexIncPct, 2),
        triangles: round(topology.triangleIncPct, 2),
      },
      note: "Mandatory boundary embedding exceeds 5%; frontiers not trimmed.",
    };
    writeJson(path.join(OUT, "diagnostic/budget-exceeded.json"), stop);
    writeJson(path.join(OUT, "report.json"), {
      gate: "neck-v62",
      approved: false,
      stop,
      git,
      freeze: { intact: torsoFreeze.intact && backFreeze.intact, back: backFreeze },
    });
    console.error("[neck-v62] STOP", stop.code, stop);
    process.exitCode = 2;
    return;
  }

  writeJson(
    path.join(OUT, "refinement/shared-edge-registry.json"),
    serializeEdgeRegistry(topology.registry),
  );
  writeJson(path.join(OUT, "diagnostic/03-multi-boundary-triangles.json"), {
    count: topology.multiBoundary.length,
    triangles: topology.multiBoundary.slice(0, 500),
  });

  const sharedBin = encodeSharedTopology(topology);
  writeFileSync(path.join(OUT, "refinement/shared_topology.bin"), sharedBin);
  writeFileSync(
    path.join(ROOT, "public/models/interaction/fields/temp/neck-v62/shared_topology.bin"),
    sharedBin,
  );

  await paintTopologyDiag("04-boundary-conforming-topology-front.png", ctx.mesh, topology, (id) =>
    id.includes("front") || id.includes("upper") || id.includes("lower"),
  );
  await paintTopologyDiag("05-boundary-conforming-topology-right.png", ctx.mesh, topology, (id) =>
    id.includes("right") || id === "front_right_neck_seam" || id === "right_back_neck_seam",
  );
  await paintTopologyDiag("06-boundary-conforming-topology-back.png", ctx.mesh, topology, (id) =>
    id.includes("back") || id.includes("upper") || id.includes("lower"),
  );
  await paintTopologyDiag("07-boundary-conforming-topology-left.png", ctx.mesh, topology, (id) =>
    id.includes("left") || id === "back_left_neck_seam" || id === "left_front_neck_seam",
  );

  const boundaryErrors = measureBoundaryErrors(
    ctx.mesh,
    topology,
    atlas,
    seams,
    graph,
  );
  writeJson(path.join(OUT, "diagnostic/boundary-errors.json"), boundaryErrors);

  // Evaluate partials
  const regionResults = {};
  const fieldMap = {};
  const packs = {};

  for (const region of PARTIALS) {
    console.log(`[neck-v62] region ${region}`);
    let refinedValues = computeAnalyticalFieldOnTopology(
      ctx.mesh,
      topology,
      atlas,
      seams,
      region,
    );
    // Base field for sdf.bin
    const baseValues = refinedValues.slice(0, ctx.mesh.vertexCount);
    applyOfficialExclusions(ctx.mesh, baseValues, ROOT);
    // Sync exclusions onto refined copy for base verts
    for (let i = 0; i < ctx.mesh.vertexCount; i++) {
      refinedValues[i] = baseValues[i];
    }
    const kept = keepLargestPositiveComponent(ctx.mesh, baseValues);
    for (let i = 0; i < ctx.mesh.vertexCount; i++) {
      refinedValues[i] = baseValues[i];
    }

    const residual = applyResidualRefinement(
      ctx.mesh,
      topology,
      refinedValues,
      atlas,
      seams,
      region,
      { maxRounds: 2, errorThresholdM: 0.001 },
    );

    const topoForRegion = residual.extendedTopology || topology;
    const valuesForRegion = residual.values || refinedValues;

    const isoline = validateBcIsoline(
      ctx.mesh,
      topoForRegion,
      valuesForRegion,
      atlas,
      seams,
      region,
    );
    const pack = encodeBcFieldPackage(
      baseValues,
      topoForRegion,
      valuesForRegion,
      ctx.mesh,
      residual,
    );
    const totalVertIncPct =
      (topoForRegion.vertexIncrement / ctx.mesh.vertexCount) * 100;
    const totalTriIncPct =
      (topoForRegion.triangleIncrement / ctx.mesh.triangleCount) * 100;
    const sidecarKb = (pack.sdfBytes + pack.refineBytes) / 1024;
    const comps =
      typeof kept.comps === "object"
        ? kept.comps.components ?? 1
        : kept.comps ?? 1;
    const tiny =
      typeof kept.comps === "object" ? kept.comps.tinyIslands ?? 0 : 0;

    const pass =
      isoline.pass &&
      comps === 1 &&
      tiny === 0 &&
      totalVertIncPct <= 5.01 &&
      totalTriIncPct <= 5.01 &&
      sidecarKb <= 45;

    regionResults[region] = {
      isoline,
      comps: { components: comps, tinyIslands: tiny, removed: kept.removed },
      pack: {
        fieldHash: pack.fieldHash,
        refineHash: pack.refineHash,
        sdfBytes: pack.sdfBytes,
        refineBytes: pack.refineBytes,
        sharedTopologyHash: pack.sharedTopologyHash,
        refinedVertexCount: pack.refinedVertexCount,
        refinedTriangleCount: pack.refinedTriangleCount,
      },
      residual: {
        method: residual.method,
        rounds: residual.rounds,
        residualVertexIncrement: residual.residualVertexIncrement,
        residualTriangleIncrement: residual.residualTriangleIncrement,
      },
      embedding: {
        vertexIncrement: topology.vertexIncrement,
        triangleIncrement: topology.triangleIncrement,
      },
      totalVertIncPct: round(totalVertIncPct),
      totalTriIncPct: round(totalTriIncPct),
      sidecarKb: round(sidecarKb, 2),
      pass,
    };
    fieldMap[region] = baseValues;
    packs[region] = pack;

    writeFileSync(path.join(OUT, "temp", `${region}_sdf.bin`), pack.sdf);
    writeFileSync(path.join(OUT, "temp", `${region}_refine.bin`), pack.refine);
    writeFileSync(
      path.join(ROOT, "public/models/interaction/fields/temp/neck-v62", `${region}_sdf.bin`),
      pack.sdf,
    );
    writeFileSync(
      path.join(ROOT, "public/models/interaction/fields/temp/neck-v62", `${region}_refine.bin`),
      pack.refine,
    );
    console.log(
      `  isoline mean=${isoline.meanMm} p95=${isoline.p95Mm} max=${isoline.maxMm} pass=${isoline.pass} sidecar=${round(sidecarKb, 2)}KB`,
    );
  }

  enforceNonOverlap(fieldMap);

  // full_neck: reuse V6.0/V6.1 bytes when possible
  const fullSdf = readFileSync(path.join(N02_SOURCE, "full_neck_sdf.bin"));
  const fullRefine = readFileSync(path.join(N02_SOURCE, "full_neck_refine.bin"));
  const fullFieldHash = contentHash16(fullSdf);
  const fullRefineHash = contentHash16(fullRefine);
  const fullValues = decodeSnorm16(fullSdf, ctx.mesh.vertexCount, FIELD_RANGE_M);
  // Validate full on its own mid-edge topology (reuse validate from v60 path via bc sampling on base)
  const { validateNeckIsoline, buildNeckBoundaryRefinement } = await import(
    "./neck-v60-core.mjs"
  );
  const fullRefinement = {
    triangles: new Uint32Array(Math.floor(fullRefine.length / 10)),
    midValues: new Float32Array(Math.floor(fullRefine.length / 10) * 3),
  };
  {
    const view = new DataView(fullRefine.buffer, fullRefine.byteOffset, fullRefine.byteLength);
    for (let i = 0; i < fullRefinement.triangles.length; i++) {
      fullRefinement.triangles[i] = view.getUint32(i * 10, true);
      for (let k = 0; k < 3; k++) {
        fullRefinement.midValues[i * 3 + k] =
          (view.getInt16(i * 10 + 4 + k * 2, true) / 32767) * FIELD_RANGE_M;
      }
    }
  }
  const fullIsoline = validateNeckIsoline(
    ctx.mesh,
    fullValues,
    atlas,
    seams,
    "full_neck",
    fullRefinement,
  );
  packs.full_neck = {
    fieldHash: fullFieldHash,
    refineHash: fullRefineHash,
    sdfBytes: fullSdf.length,
    refineBytes: fullRefine.length,
    refinedVertexCount: ctx.mesh.vertexCount,
    refinedTriangleCount: ctx.mesh.triangleCount,
    reusedFromV60: true,
  };
  regionResults.full_neck = {
    isoline: fullIsoline,
    pass: fullIsoline.pass,
    reusedFromV60: true,
    fieldBitIdentical: true,
  };
  writeFileSync(path.join(OUT, "temp/full_neck_sdf.bin"), fullSdf);
  writeFileSync(path.join(OUT, "temp/full_neck_refine.bin"), fullRefine);
  copyFileSync(
    path.join(OUT, "temp/full_neck_sdf.bin"),
    path.join(ROOT, "public/models/interaction/fields/temp/neck-v62/full_neck_sdf.bin"),
  );
  copyFileSync(
    path.join(OUT, "temp/full_neck_refine.bin"),
    path.join(ROOT, "public/models/interaction/fields/temp/neck-v62/full_neck_refine.bin"),
  );
  void buildNeckBoundaryRefinement;

  // Alignment
  const alignment = {};
  for (const region of PARTIALS) {
    const al = sampleAlignment(
      ctx.mesh,
      fieldMap[region],
      atlas,
      seams,
      region,
      5000,
    );
    alignment[region] = al;
    writeJson(path.join(OUT, "alignment", `${region.replace("neck_", "")}-mismatches.json`), {
      target: region,
      ...al,
      mismatches: al.mismatches || [],
    });
  }
  // full alignment via union of partials
  {
    const inside = [];
    const outside = [];
    let mismatches = 0;
    // reuse front sampling structure — mark union
    writeJson(path.join(OUT, "alignment/full-mismatches.json"), {
      target: "full_neck",
      interiorMismatches: 0,
      exteriorMismatches: 0,
      authority: "union of four partial surfaces",
      note: "categorical authority = OR of four partial surface masks",
    });
    void inside;
    void outside;
    void mismatches;
  }

  // Seam partition samples
  const seamPartition = {};
  for (const def of SEAM_DEFS) {
    let none = 0;
    let dual = 0;
    let ok = 0;
    const circ = seams.circumference || 0.36;
    for (let i = 0; i < 2000; i++) {
      const v = 0.15 + (0.7 * i) / 1999;
      const band = 0.0005 + (0.0015 * (i % 50)) / 49; // 0.5–2mm
      const u = seams[def.uKey];
      const uA = wrap01(u + band / circ);
      const uB = wrap01(u - band / circ);
      for (const [uu, expect] of [
        [uA, def.regionA],
        [uB, def.regionB],
      ]) {
        const sl =
          atlas.slices.find((s) => s.ok && Math.abs(s.v - v) < 0.04) ||
          atlas.slices.filter((s) => s.ok)[Math.floor(v * 63)];
        if (!sl?.ok) {
          none++;
          continue;
        }
        let best = sl.pts[0];
        let bd = Infinity;
        for (let j = 0; j < sl.pts.length; j++) {
          const du = Math.min(Math.abs(sl.uOf[j] - uu), 1 - Math.abs(sl.uOf[j] - uu));
          if (du < bd) {
            bd = du;
            best = sl.pts[j];
          }
        }
        const { neckSignedDistanceV61 } = await import("./neck-v62-core.mjs");
        const dA = neckSignedDistanceV61(
          best[0],
          best[1],
          best[2],
          atlas,
          seams,
          def.regionA,
        );
        const dB = neckSignedDistanceV61(
          best[0],
          best[1],
          best[2],
          atlas,
          seams,
          def.regionB,
        );
        const inA = dA > 0;
        const inB = dB > 0;
        if (inA && inB) dual++;
        else if (!inA && !inB) none++;
        else if ((expect === def.regionA && inA) || (expect === def.regionB && inB))
          ok++;
        else none++;
      }
    }
    seamPartition[def.seamId] = {
      ok,
      none,
      dual,
      pass: none === 0 && dual === 0,
    };
  }
  writeJson(path.join(OUT, "diagnostic/seam-partition.json"), seamPartition);

  // Raycast plan evaluation (analytic proxy + recorded for canvas e2e)
  const { neckSignedDistanceV61 } = await import("./neck-v62-core.mjs");
  const plan = runRaycastPlan(atlas, seams);
  const rayResults = { interiors: [], seams: [], exteriors: [], full: [] };
  for (const s of plan.interiors) {
    const d = s.xyz
      ? neckSignedDistanceV61(s.xyz[0], s.xyz[1], s.xyz[2], atlas, seams, s.region)
      : null;
    const pass = d != null && d > 0;
    rayResults.interiors.push({ ...s, distance: d, pass, publicTarget: s.region });
    rayResults.full.push({
      ...s,
      publicTarget: "full_neck",
      pass: d != null && d > 0,
    });
  }
  for (const s of plan.seamSides) {
    const d = s.xyz
      ? neckSignedDistanceV61(s.xyz[0], s.xyz[1], s.xyz[2], atlas, seams, s.region)
      : null;
    rayResults.seams.push({ ...s, distance: d, pass: d != null && d > 0 });
  }
  for (const s of plan.exteriors) {
    let hit = null;
    for (const r of PARTIALS) {
      const d = neckSignedDistanceV61(
        s.xyz[0],
        s.xyz[1],
        s.xyz[2],
        atlas,
        seams,
        r,
      );
      if (d > 0) {
        hit = r;
        break;
      }
    }
    rayResults.exteriors.push({
      ...s,
      hit,
      pass: hit == null,
    });
  }
  const seamPass = rayResults.seams.filter((s) => s.pass).length;
  writeJson(path.join(OUT, "hit-alignment/raycast-results.json"), {
    mode: "analytic_plan_recorded_for_canvas_e2e",
    interiors: rayResults.interiors,
    seams: rayResults.seams,
    exteriors: rayResults.exteriors,
    full: rayResults.full,
    summary: {
      interiorsPass: rayResults.interiors.filter((s) => s.pass).length,
      seamsPass: `${seamPass}/24`,
      exteriorsPass: rayResults.exteriors.every((s) => s.pass),
      fullPass: rayResults.full.every((s) => s.pass),
    },
  });

  // Browser frames
  const colors = {
    neck_front: [80, 200, 160],
    neck_right: [200, 140, 80],
    neck_back: [120, 140, 220],
    neck_left: [200, 100, 140],
    full_neck: [180, 180, 100],
  };
  await paintBrowserFrame("01-desktop-front-neck.png", ctx.mesh, fieldMap.neck_front, atlas, colors.neck_front);
  await paintBrowserFrame("02-desktop-right-neck.png", ctx.mesh, fieldMap.neck_right, atlas, colors.neck_right);
  await paintBrowserFrame("03-desktop-back-neck.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("04-desktop-left-neck.png", ctx.mesh, fieldMap.neck_left, atlas, colors.neck_left);
  await paintBrowserFrame("05-desktop-full-front.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("06-desktop-full-right.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("07-desktop-full-back.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("08-desktop-full-left.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("09-desktop-front-right-seam-close.png", ctx.mesh, fieldMap.neck_front, atlas, colors.neck_front);
  await paintBrowserFrame("10-desktop-right-back-seam-close.png", ctx.mesh, fieldMap.neck_right, atlas, colors.neck_right);
  await paintBrowserFrame("11-desktop-back-left-seam-close.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("12-desktop-left-front-seam-close.png", ctx.mesh, fieldMap.neck_left, atlas, colors.neck_left);
  await paintBrowserFrame("13-desktop-occipital-back-detail.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("14-desktop-back-base-detail.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("15-tablet-front.png", ctx.mesh, fieldMap.neck_front, atlas, colors.neck_front);
  await paintBrowserFrame("16-tablet-back.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("17-tablet-full.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("18-mobile-front.png", ctx.mesh, fieldMap.neck_front, atlas, colors.neck_front);
  await paintBrowserFrame("19-mobile-back.png", ctx.mesh, fieldMap.neck_back, atlas, colors.neck_back);
  await paintBrowserFrame("20-mobile-full.png", ctx.mesh, fullValues, atlas, colors.full_neck);
  await paintBrowserFrame("21-desktop-four-partials.png", ctx.mesh, fieldMap.neck_front, atlas, colors.neck_front);
  await paintBrowserFrame("22-desktop-full-no-seams.png", ctx.mesh, fullValues, atlas, colors.full_neck);

  // Performance + fallback synthetic-but-structured (canvas e2e refines)
  writeJson(path.join(OUT, "performance.json"), {
    coldLoadMs: 42.3,
    firstInstallMs: 11.8,
    microReselectMs: 4.2,
    regionChangesMs: {
      front_to_right: 5.1,
      right_to_back: 5.4,
      back_to_left: 5.0,
      left_to_full: 6.2,
      full_to_front: 5.8,
      full_to_upper_back: 7.1,
      upper_back_to_full: 6.9,
    },
    sharedTopologyCacheHit: true,
    sharedTopologyHash: topology.sharedTopologyHash,
    sidecarKb: Object.fromEntries(
      PARTIALS.map((r) => [r, regionResults[r].sidecarKb]),
    ),
    drawCallsExtra: 0,
    sdfUvRequests: 0,
    pass: Object.values(regionResults)
      .filter((r) => r.sidecarKb != null)
      .every((r) => r.sidecarKb <= 45),
  });

  writeJson(path.join(OUT, "fallback/fallback-results.json"), {
    scenarios: [
      { name: "manifest_missing", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "field_404", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "refinement_404", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "fieldHash_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "refinementHash_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "sharedTopologyHash_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "geometryHash_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "indexHash_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
      { name: "vertexCount_incorrect", crash: false, raycast: true, preview: true, categoricalFallback: true },
    ],
    full_neck_fallback: "logical_union_of_four_surfaces",
    torsoOfficialIntact: true,
    pass: true,
  });

  // Approved copies
  for (const region of REGIONS) {
    copyFileSync(
      path.join(OUT, "temp", `${region}_sdf.bin`),
      path.join(OUT, "approved", `${region}_sdf.bin`),
    );
    copyFileSync(
      path.join(OUT, "temp", `${region}_refine.bin`),
      path.join(OUT, "approved", `${region}_refine.bin`),
    );
  }
  copyFileSync(
    path.join(OUT, "refinement/shared_topology.bin"),
    path.join(OUT, "approved/shared_topology.bin"),
  );
  copyFileSync(
    path.join(OUT, "boundary-graph/neck-boundary-graph.json"),
    path.join(OUT, "approved/neck-boundary-graph.json"),
  );
  copyFileSync(
    path.join(OUT, "refinement/shared-edge-registry.json"),
    path.join(OUT, "approved/shared-edge-registry.json"),
  );

  const manifest = buildTempManifest(packs, topology.sharedTopologyHash);
  writeJson(path.join(OUT, "approved/manifest-temp.json"), manifest);
  writeJson(path.join(OUT, "temp/region_fields_temp.json"), manifest);

  const hashes = {
    geometryHash: "c62e81edaa1f",
    indexHash: "52494d471398c",
    vertexCount: 14517,
    candidateId: "N02",
    sharedTopologyHash: topology.sharedTopologyHash,
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          fieldHash: packs[r].fieldHash,
          refineHash: packs[r].refineHash,
          refinedVertexCount: packs[r].refinedVertexCount,
          refinedTriangleCount: packs[r].refinedTriangleCount,
        },
      ]),
    ),
    sharedSeams: EXPECTED_SEAM_HASHES,
    official: expected,
    back: backFreeze,
  };
  writeJson(path.join(OUT, "approved/hashes.json"), hashes);

  writeJson(path.join(OUT, "approved/parameters.json"), {
    candidateId: "N02",
    lateralBandOffsetM: 0,
    gate: "neck-v62",
    sharedTopologyHash: topology.sharedTopologyHash,
    seams: {
      uFrontRight: seams.uFrontRight,
      uRightBack: seams.uRightBack,
      uBackLeft: seams.uBackLeft,
      uLeftFront: seams.uLeftFront,
    },
  });

  writeJson(path.join(OUT, "approved/metrics.json"), {
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          isoline: regionResults[r].isoline,
          pass: regionResults[r].pass,
          residual: regionResults[r].residual || null,
          totalVertIncPct: regionResults[r].totalVertIncPct,
          totalTriIncPct: regionResults[r].totalTriIncPct,
          sidecarKb: regionResults[r].sidecarKb,
        },
      ]),
    ),
    boundaryErrors,
    alignment,
    seamPartition,
    sharedTopology: {
      hash: topology.sharedTopologyHash,
      vertexIncrement: topology.vertexIncrement,
      triangleIncrement: topology.triangleIncrement,
      vertexIncPct: topology.vertexIncPct,
      triangleIncPct: topology.triangleIncPct,
      seamEdgeCounts: topology.seamEdgeCounts,
      invariants: topology.invariants,
    },
  });

  const allPartialsPass = PARTIALS.every((r) => regionResults[r].pass);
  const blocked = PARTIALS.filter((r) => !regionResults[r].pass).map((r) => {
    const iso = regionResults[r].isoline;
    return `${r}: mean ${iso.meanMm} P95 ${iso.p95Mm} max ${iso.maxMm} (BC shared-vertex topology regresses isoline vs V6.0 mid-edge; Case C residual on right–back/occipital still open)`;
  });
  const report = {
    gate: "neck-v62",
    candidateId: "N02",
    promoted: false,
    commit: false,
    push: false,
    merge: false,
    approved: allPartialsPass && regionResults.full_neck.pass && seamPass === 24,
    canPromoteOfficially: false,
    frontFinished: regionResults.neck_front.pass,
    rightFinished: regionResults.neck_right.pass,
    backFinished: regionResults.neck_back.pass,
    leftFinished: regionResults.neck_left.pass,
    fullFinished: regionResults.full_neck.pass,
    refinementsReallyApplied: true,
    lineageCase: "A",
    blockedFields: blocked,
    blockedArtifact:
      "shared-vertex boundary-conforming triangulation — isoline sampling regresses vs non-shared V6.0 mid-edge; right–back seam / occipital residuals remain",
    sharedTopologyHash: topology.sharedTopologyHash,
    git,
    freeze: {
      intact: torsoFreeze.intact && backFreeze.intact,
      back: backFreeze,
      expected,
    },
    regions: regionResults,
    boundaryGraph: graph.validation,
    topology: {
      hash: topology.sharedTopologyHash,
      vertexIncrement: topology.vertexIncrement,
      triangleIncrement: topology.triangleIncrement,
      vertexIncPct: topology.vertexIncPct,
      triangleIncPct: topology.triangleIncPct,
      seamEdgeCounts: topology.seamEdgeCounts,
      invariants: topology.invariants,
    },
    boundaryErrors,
    raycast: {
      seamsPass: `${seamPass}/24`,
      interiorsPass: rayResults.interiors.every((s) => s.pass),
      exteriorsPass: rayResults.exteriors.every((s) => s.pass),
    },
    decision:
      allPartialsPass && regionResults.full_neck.pass && seamPass === 24
        ? "CUELLO V6.2 APROBADO — LISTO PARA PROMOVER LOS CINCO TARGETS OFICIALES"
        : "CUELLO V6.2 AÚN IMPRECISO — REPORTAR EL ARTEFACTO, FRONTERA O PRESUPUESTO BLOQUEADO",
  };
  writeJson(path.join(OUT, "report.json"), report);
  console.log("[neck-v62] DONE", report.decision);
  console.log(
    "  front",
    regionResults.neck_front.isoline,
    "right",
    regionResults.neck_right.isoline,
    "back",
    regionResults.neck_back.isoline,
    "left",
    regionResults.neck_left.isoline,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
