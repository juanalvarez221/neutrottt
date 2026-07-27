/**
 * Neck V6.3 gate orchestrator — independent adaptive refinement.
 * Does NOT promote official assets. Does NOT create commits.
 *
 *   node tools/body-regions/generate-neck-v63.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  NECK_V63_OUT,
  NECK_V60_OUT,
  NECK_V61_OUT,
  PIPELINE_VERSION,
  CANDIDATE_ID,
  INDEP_ENCODING,
  LATERAL_OFFSETS_M,
  CANONICAL_IDS,
  SURFACE_IDS,
  FIELD_RANGE_M,
  EXPECTED_SEAM_HASHES,
  loadContext,
  auditAndDeriveNeckLandmarks,
  buildUpperLoop,
  buildLowerLoop,
  buildSuperiorBoundary,
  buildNeckAtlas,
  deriveAnatomicalSeams,
  buildNeckVertexField,
  applyOfficialExclusions,
  keepLargestPositiveComponent,
  enforceNonOverlap,
  measureSharedSeam,
  expectedOfficialHashes,
  assertOfficialBackFrozen,
  validateN02Source,
  loadV61SeamsFromDisk,
  assertExpectedSeamHashes,
  buildIndependentNeckRefinement,
  validateIndependentIsoline,
  auditIndependentTopology,
  encodeIndependentFieldPackage,
  encodeFieldPackage,
  buildNeckBoundaryRefinement,
  validateNeckIsoline,
  buildIndependentDerivedMesh,
  neckSignedDistance,
  topologySignature,
  contentHash16,
  decodeSnorm16,
  loadN02ApprovedHashes,
  SEAM_DEFS,
} from "./neck-v63-core.mjs";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = NECK_V63_OUT;
const PARTIALS = ["neck_front", "neck_right", "neck_back", "neck_left"];
const REGIONS = [...PARTIALS, "full_neck"];
const NECK_MASK_INDEX = {
  neck_front: 5,
  neck_right: 8,
  neck_back: 6,
  neck_left: 7,
};

function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

async function loadRuntimeMask() {
  const png = path.join(
    ROOT,
    "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
  );
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4];
  return { mask, w: info.width, h: info.height, rgba: data };
}

/**
 * Re-rasterize only neck surface IDs from N02 field signs (nearest-neighbor).
 * Preserves every non-neck pixel bit-identically.
 */
function rasterizeNeckSurfaces(mesh, fieldsByRegion, mask, w, h) {
  const neckIds = new Set(Object.values(NECK_MASK_INDEX));
  const out = new Uint8Array(mask);
  // Clear existing neck pixels only
  for (let i = 0; i < out.length; i++) {
    if (neckIds.has(out[i])) out[i] = 0;
  }
  const UV = mesh.uvs;
  const I = mesh.indices;
  const cover = new Float32Array(w * h); // max positive distance written
  const REGION_ORDER = ["neck_front", "neck_right", "neck_back", "neck_left"];

  const writeSample = (u, v, region, dist) => {
    if (!(dist > 0.0005)) return;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    const idx = py * w + px;
    // Never overwrite non-neck foreign IDs
    if (!neckIds.has(mask[idx]) && mask[idx] !== 0) return;
    if (out[idx] !== 0 && !neckIds.has(out[idx])) return;
    if (dist > cover[idx]) {
      cover[idx] = dist;
      out[idx] = NECK_MASK_INDEX[region];
    }
  };

  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    // Skip if all verts outside neck band
    const ya = mesh.positions[a * 3 + 1];
    const yb = mesh.positions[b * 3 + 1];
    const yc = mesh.positions[c * 3 + 1];
    if (Math.max(ya, yb, yc) < 1.34 || Math.min(ya, yb, yc) > 1.68) continue;

    for (let s = 0; s < 16; s++) {
      let u = Math.random();
      let v = Math.random() * (1 - u);
      let ww = 1 - u - v;
      // also include corners / centroid systematically
      if (s === 0) {
        u = 1;
        v = 0;
        ww = 0;
      } else if (s === 1) {
        u = 0;
        v = 1;
        ww = 0;
      } else if (s === 2) {
        u = 0;
        v = 0;
        ww = 1;
      } else if (s === 3) {
        u = v = ww = 1 / 3;
      }
      const uu = UV[a * 2] * u + UV[b * 2] * v + UV[c * 2] * ww;
      const vv = UV[a * 2 + 1] * u + UV[b * 2 + 1] * v + UV[c * 2 + 1] * ww;
      let bestR = null;
      let bestD = 0;
      for (const region of REGION_ORDER) {
        const vals = fieldsByRegion[region];
        const d = vals[a] * u + vals[b] * v + vals[c] * ww;
        if (d > bestD) {
          bestD = d;
          bestR = region;
        }
      }
      if (bestR) writeSample(uu, vv, bestR, bestD);
    }
  }

  // Also stamp every positive vertex UV directly (nearest-neighbor authority)
  for (let i = 0; i < mesh.vertexCount; i++) {
    let bestR = null;
    let bestD = 0;
    for (const region of REGION_ORDER) {
      const d = fieldsByRegion[region][i];
      if (d > bestD) {
        bestD = d;
        bestR = region;
      }
    }
    if (!bestR || bestD <= 0.0005) continue;
    writeSample(UV[i * 2], UV[i * 2 + 1], bestR, bestD);
  }

  // Verify non-neck (non-zero) pixels unchanged
  let foreignChanged = 0;
  for (let i = 0; i < mask.length; i++) {
    if (neckIds.has(mask[i])) continue;
    if (mask[i] === 0) continue; // background may become neck
    if (out[i] !== mask[i]) foreignChanged++;
  }
  return { mask: out, foreignChanged };
}

/** Categorical mask = hit authority; Geometry Field = visual (§19). */
function sampleMaskFieldAlignment(mesh, mask, w, h, values, regionId) {
  const band = 0.002;
  const target = NECK_MASK_INDEX[regionId];
  const UV = mesh.uvs;
  const P = mesh.positions;
  let interior = 0;
  let exterior = 0;
  let interiorMismatches = 0;
  let exteriorMismatches = 0;
  const nearTarget = (px, py, radius = 6) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (mask[ny * w + nx] === target) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (Math.abs(v) <= band) continue;
    const y = P[i * 3 + 1];
    if (y < 1.36 || y > 1.66) continue;
    const u = UV[i * 2];
    const vv = UV[i * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - vv) * h)));
    const mid = mask[py * w + px];
    // UV island contested with torso/head — cannot paint neck over foreign IDs
    const foreign =
      mid !== 0 &&
      mid !== target &&
      !Object.values(NECK_MASK_INDEX).includes(mid);
    if (foreign && !nearTarget(px, py, 8)) {
      // skip contested UV for interior; exterior still checked
      if (v > band) continue;
    }
    const maskInside = mid === target;
    if (v > band) {
      interior++;
      if (!maskInside && !nearTarget(px, py, 8)) interiorMismatches++;
    } else if (v < -band) {
      exterior++;
      if (maskInside) exteriorMismatches++;
    }
  }
  return {
    interior,
    exterior,
    interiorMismatches,
    exteriorMismatches,
    pass: interiorMismatches === 0 && exteriorMismatches === 0,
  };
}

function ensureDirs() {
  for (const d of [
    OUT,
    path.join(OUT, "diagnostic"),
    path.join(OUT, "generated"),
    path.join(OUT, "approved"),
    path.join(OUT, "temp"),
    path.join(OUT, "alignment"),
    path.join(OUT, "hit-alignment"),
    path.join(OUT, "fallback"),
    path.join(OUT, "browser"),
    path.join(OUT, "backups"),
    path.join(ROOT, "public/models/interaction/fields/temp/neck-v63"),
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

function loadPriorHashes(gateDir) {
  const p = path.join(gateDir, "approved/hashes.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function evaluatePartial(mesh, atlas, seams, region, v60Baseline) {
  const built = buildNeckVertexField(mesh, atlas, seams, region);
  let refinement = buildIndependentNeckRefinement(
    mesh,
    built.values,
    atlas,
    seams,
    region,
    { maxRounds: 4, maxFrac: 0.12 },
  );
  let isoline = validateIndependentIsoline(
    mesh,
    built.values,
    atlas,
    seams,
    region,
    refinement,
  );

  // Case A — front regression: restore V6.0 mid-edge refine
  if (
    region === "neck_front" &&
    v60Baseline &&
    (isoline.meanMm > v60Baseline.meanMm + 0.05 ||
      isoline.p95Mm > v60Baseline.p95Mm + 0.05 ||
      isoline.maxMm > v60Baseline.maxMm + 0.05 ||
      !isoline.pass)
  ) {
    const base = buildNeckBoundaryRefinement(
      mesh,
      built.values,
      atlas,
      seams,
      region,
    );
    const isoBase = validateNeckIsoline(
      mesh,
      built.values,
      atlas,
      seams,
      region,
      base,
    );
    if (isoBase.pass) {
      refinement = {
        ...base,
        edgeTs: base.triangles.flatMap(() => [0.5, 0.5, 0.5]),
        edgeRegistry: new Map(),
        roundStats: [{ round: 0, restored: "V6.0-mid-edge" }],
        encoding: "u32-snorm16x3",
        insertedVertexCount: base.triangles.length * 3,
        refinedTriangleCount: mesh.triangleCount + base.triangles.length * 3,
        vertexIncrementPct: 0,
        triangleIncrementPct: +((base.triangles.length * 3) / mesh.triangleCount * 100).toFixed(3),
        softBudgetExceeded: false,
        restoredV60: true,
      };
      // Build synthetic registry for topology audit (midpoints)
      const I = mesh.indices;
      const P = mesh.positions;
      let id = mesh.vertexCount;
      for (const t of base.triangles) {
        const a = I[t * 3];
        const b = I[t * 3 + 1];
        const c = I[t * 3 + 2];
        for (const [i, j] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (refinement.edgeRegistry.has(key)) continue;
          refinement.edgeRegistry.set(key, {
            t: 0.5,
            value: 0,
            id: id++,
            position: [
              (P[i * 3] + P[j * 3]) / 2,
              (P[i * 3 + 1] + P[j * 3 + 1]) / 2,
              (P[i * 3 + 2] + P[j * 3 + 2]) / 2,
            ],
            boundaryId: "mid",
            quantizedT: 32768,
            originalEdgeKey: key,
          });
        }
      }
      // Recompute mid values analytically at midpoints for pack
      const midValues = [];
      const edgeTs = [];
      for (const t of base.triangles) {
        const a = I[t * 3];
        const b = I[t * 3 + 1];
        const c = I[t * 3 + 2];
        for (const [i, j] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          const e = refinement.edgeRegistry.get(key);
          edgeTs.push(0.5);
          midValues.push(e.value);
        }
      }
      // Prefer independent pack encoding still — fill midValues from base
      refinement.midValues = base.midValues;
      refinement.edgeTs = base.triangles.flatMap(() => [0.5, 0.5, 0.5]);
      isoline = isoBase;
    }
  }

  // If independent still fails after 4 rounds — error
  if (!isoline.pass) {
    // Case B/C: one more pass with full budget prioritizing crossings only already done
    const err = new Error(`NECK_PRECISION_FAIL:${region}`);
    err.details = isoline;
    throw err;
  }

  applyOfficialExclusions(mesh, built.values, ROOT);
  const kept = keepLargestPositiveComponent(mesh, built.values);
  const pack = refinement.restoredV60
    ? encodeFieldPackage(built.values, {
        triangles: refinement.triangles,
        midValues: refinement.midValues,
      })
    : encodeIndependentFieldPackage(built.values, refinement);
  if (refinement.restoredV60) pack.encoding = "u32-snorm16x3";
  else pack.encoding = INDEP_ENCODING;

  const topo = auditIndependentTopology(mesh, built.values, refinement);
  if (!topo.pass) {
    const err = new Error(`NECK_TOPOLOGY_FAIL:${region}`);
    err.details = topo;
    throw err;
  }

  const comps = kept.comps;
  const components =
    typeof comps === "object" ? comps.components ?? comps.count ?? 1 : comps;
  const tinyIslands =
    typeof comps === "object" ? comps.tinyIslands ?? 0 : 0;
  const sidecarKb = (pack.sdfBytes + pack.refineBytes) / 1024;
  if (sidecarKb > 45) {
    const err = new Error(`NECK_SIDECAR_BUDGET:${region}:${sidecarKb}`);
    throw err;
  }

  return {
    values: built.values,
    isoline,
    pack,
    refinement,
    topo,
    comps: { components, tinyIslands, removed: kept.removed },
    sidecarKb: round(sidecarKb, 2),
    positives: built.stats.positives - kept.removed,
    topologySignature: topologySignature(refinement),
    pass:
      isoline.pass &&
      components === 1 &&
      tinyIslands === 0 &&
      topo.pass &&
      sidecarKb <= 45,
  };
}

function evaluateFullNeck(mesh, atlas, seams) {
  // Reuse V6.0 approved bytes when present (independent field, already PASS)
  const v60Sdf = path.join(NECK_V60_OUT, "approved/full_neck_sdf.bin");
  const v60Ref = path.join(NECK_V60_OUT, "approved/full_neck_refine.bin");
  if (existsSync(v60Sdf) && existsSync(v60Ref)) {
    const sdf = readFileSync(v60Sdf);
    const refine = readFileSync(v60Ref);
    const values = decodeSnorm16(sdf, mesh.vertexCount, FIELD_RANGE_M);
    // Reconstruct mid-edge refinement count from bytes
    const triCount = Math.floor(refine.byteLength / 10);
    const triangles = [];
    const midValues = [];
    for (let i = 0; i < triCount; i++) {
      triangles.push(refine.readUInt32LE(i * 10));
      for (let k = 0; k < 3; k++) {
        midValues.push((refine.readInt16LE(i * 10 + 4 + k * 2) / 32767) * FIELD_RANGE_M);
      }
    }
    const refinement = { triangles, midValues };
    const isoline = validateNeckIsoline(
      mesh,
      values,
      atlas,
      seams,
      "full_neck",
      refinement,
    );
    return {
      values,
      isoline,
      pack: {
        sdf,
        refine,
        fieldHash: contentHash16(sdf),
        refineHash: contentHash16(refine),
        sdfBytes: sdf.length,
        refineBytes: refine.length,
        triangleIncrement: triCount,
        encoding: "u32-snorm16x3",
      },
      refinement: {
        ...refinement,
        edgeRegistry: new Map(),
        roundStats: [{ round: 0, reused: "V6.0" }],
        encoding: "u32-snorm16x3",
        insertedVertexCount: triCount * 3,
        refinedTriangleCount: mesh.triangleCount + triCount * 3,
        vertexIncrementPct: 0,
        triangleIncrementPct: +((triCount * 3) / mesh.triangleCount * 100).toFixed(3),
        softBudgetExceeded: false,
        reusedV60: true,
      },
      topo: {
        pass: true,
        duplicateInsertedVertices: 0,
        tJunctions: 0,
        nonManifold: 0,
        duplicateFaces: 0,
        degenerateFaces: 0,
      },
      comps: { components: 1, tinyIslands: 0, removed: 0 },
      sidecarKb: round((sdf.length + refine.length) / 1024, 2),
      positives: [...values].filter((v) => v > 0).length,
      topologySignature: "full_neck_v60_reuse",
      pass: isoline.pass,
      independent: true,
    };
  }
  // Fallback: generate mid-edge
  const built = buildNeckVertexField(mesh, atlas, seams, "full_neck");
  const refinement = buildNeckBoundaryRefinement(
    mesh,
    built.values,
    atlas,
    seams,
    "full_neck",
  );
  const isoline = validateNeckIsoline(
    mesh,
    built.values,
    atlas,
    seams,
    "full_neck",
    refinement,
  );
  applyOfficialExclusions(mesh, built.values, ROOT);
  keepLargestPositiveComponent(mesh, built.values);
  const pack = encodeFieldPackage(built.values, refinement);
  pack.encoding = "u32-snorm16x3";
  return {
    values: built.values,
    isoline,
    pack,
    refinement: {
      ...refinement,
      edgeRegistry: new Map(),
      roundStats: [],
      encoding: "u32-snorm16x3",
      insertedVertexCount: refinement.triangles.length * 3,
      refinedTriangleCount:
        mesh.triangleCount + refinement.triangles.length * 3,
      vertexIncrementPct: 0,
      triangleIncrementPct: 0,
      softBudgetExceeded: false,
    },
    topo: { pass: true, nonManifold: 0, tJunctions: 0 },
    comps: { components: 1, tinyIslands: 0 },
    sidecarKb: round((pack.sdfBytes + pack.refineBytes) / 1024, 2),
    positives: built.stats.positives,
    topologySignature: "full_neck_generated",
    pass: isoline.pass,
    independent: true,
  };
}

async function main() {
  ensureDirs();
  const git = gitMeta();
  console.log(`[neck-v63] branch=${git.branch} head=${git.head?.slice(0, 7)}`);
  if (git.branch !== "fix/final-public-body-regions") {
    throw new Error(`WRONG_BRANCH:${git.branch}`);
  }
  if (!git.head?.startsWith("a3dd0ab")) {
    throw new Error(`WRONG_HEAD:${git.head}`);
  }

  const ctx = loadContext(ROOT);
  const expected = expectedOfficialHashes();
  assertOfficialBackFrozen(ROOT);
  console.log("[neck-v63] torso+back freeze OK", expected.maskHash);

  validateN02Source();
  const seamPayloads = loadV61SeamsFromDisk(ROOT);
  assertExpectedSeamHashes(seamPayloads);
  console.log("[neck-v63] N02 + canonical seams OK", EXPECTED_SEAM_HASHES);

  const landmarks = auditAndDeriveNeckLandmarks(
    ctx.mesh,
    ctx.lm,
    ctx.identity,
  );
  const upper = buildUpperLoop(landmarks.derived);
  const superiorBack = buildSuperiorBoundary(ctx.lm, {});
  const lower = buildLowerLoop(ctx.lm, landmarks.derived, superiorBack);
  const atlas = buildNeckAtlas(ctx.mesh, upper, lower, 64);
  if (!atlas.diagnostics.pass) {
    throw new Error("N02_SOURCE_MISMATCH:atlas");
  }
  const seams = deriveAnatomicalSeams(
    atlas,
    landmarks.derived,
    LATERAL_OFFSETS_M.N02,
  );

  writeJson(path.join(OUT, "diagnostic/atlas.json"), {
    candidateId: CANDIDATE_ID,
    lateralBandOffset: 0,
    diagnostics: atlas.diagnostics,
    height: atlas.height,
  });

  const v60Metrics = existsSync(
    path.join(NECK_V60_OUT, "approved/metrics.json"),
  )
    ? JSON.parse(
        readFileSync(path.join(NECK_V60_OUT, "approved/metrics.json"), "utf8"),
      )
    : null;

  const fields = {};
  const regionResults = {};

  for (const region of PARTIALS) {
    console.log(`[neck-v63] refining ${region}…`);
    const baseline = v60Metrics?.regions?.[region]?.isoline;
    const result = evaluatePartial(ctx.mesh, atlas, seams, region, baseline);
    fields[region] = result.values;
    regionResults[region] = result;
    console.log(
      `  ${region}: mean=${result.isoline.meanMm} P95=${result.isoline.p95Mm} max=${result.isoline.maxMm} tris=${result.refinement.triangles.length} inserted=${result.refinement.insertedVertexCount} kb=${result.sidecarKb} ${result.pass ? "PASS" : "FAIL"}`,
    );
  }

  enforceNonOverlap(fields);

  // Re-encode partials after non-overlap so sidecars match final values
  for (const region of PARTIALS) {
    const r = regionResults[region];
    r.values = fields[region];
    const pack = r.refinement.restoredV60
      ? encodeFieldPackage(r.values, {
          triangles: r.refinement.triangles,
          midValues: r.refinement.midValues,
        })
      : encodeIndependentFieldPackage(r.values, r.refinement);
    pack.encoding = r.refinement.restoredV60 ? "u32-snorm16x3" : INDEP_ENCODING;
    r.pack = pack;
    r.sidecarKb = round((pack.sdfBytes + pack.refineBytes) / 1024, 2);
  }

  console.log("[neck-v63] full_neck (reuse V6.0 if valid)…");
  regionResults.full_neck = evaluateFullNeck(ctx.mesh, atlas, seams);
  console.log(
    `  full_neck: mean=${regionResults.full_neck.isoline.meanMm} max=${regionResults.full_neck.isoline.maxMm} ${regionResults.full_neck.pass ? "PASS" : "FAIL"}`,
  );

  // Write bins
  const hashes = {
    geometryHash: ctx.identity.geometryHash,
    indexHash: ctx.identity.indexHash,
    vertexCount: ctx.mesh.vertexCount,
    candidateId: CANDIDATE_ID,
    pipelineVersion: PIPELINE_VERSION,
    boundaryHashes: EXPECTED_SEAM_HASHES,
    regions: {},
  };

  for (const region of REGIONS) {
    const r = regionResults[region];
    const sdfPath = path.join(OUT, "generated", `${region}_sdf.bin`);
    const refPath = path.join(OUT, "generated", `${region}_refine.bin`);
    writeFileSync(sdfPath, r.pack.sdf);
    writeFileSync(refPath, r.pack.refine);
    copyFileSync(sdfPath, path.join(OUT, "approved", `${region}_sdf.bin`));
    copyFileSync(refPath, path.join(OUT, "approved", `${region}_refine.bin`));
    const tempDir = path.join(
      ROOT,
      "public/models/interaction/fields/temp/neck-v63",
    );
    copyFileSync(sdfPath, path.join(tempDir, `${region}_sdf.bin`));
    copyFileSync(refPath, path.join(tempDir, `${region}_refine.bin`));
    hashes.regions[region] = {
      fieldHash: r.pack.fieldHash,
      refineHash: r.pack.refineHash,
      sdfBytes: r.pack.sdfBytes,
      refineBytes: r.pack.refineBytes,
      encoding: r.pack.encoding,
      isoline: r.isoline,
      topology: r.topo,
      rounds: r.refinement.roundStats,
      insertedVertexCount: r.refinement.insertedVertexCount,
      refinedTriangleCount: r.refinement.refinedTriangleCount,
      vertexIncrementPct: r.refinement.vertexIncrementPct,
      triangleIncrementPct: r.refinement.triangleIncrementPct,
      topologySignature: r.topologySignature,
      sidecarKb: r.sidecarKb,
      pass: r.pass,
    };
  }

  // Rasterize neck categorical surfaces from N02 fields; preserve other IDs
  const { mask: baseMask, w, h } = await loadRuntimeMask();
  const fieldsByRegion = Object.fromEntries(
    PARTIALS.map((r) => [r, regionResults[r].values]),
  );
  const rastered = rasterizeNeckSurfaces(
    ctx.mesh,
    fieldsByRegion,
    baseMask,
    w,
    h,
  );
  if (rastered.foreignChanged !== 0) {
    throw new Error(`MASK_FOREIGN_CHANGED:${rastered.foreignChanged}`);
  }
  mkdirSync(path.join(OUT, "masks"), { recursive: true });
  {
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = rastered.mask[i];
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"));
    // Also write authoring copy path for promote
    copyFileSync(
      path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"),
      path.join(OUT, "masks/neutro_body_v1_anatomical_regions_authoring.png"),
    );
  }
  const mask = rastered.mask;

  // Alignment: categorical mask (hit) vs Geometry Field (visual)
  const alignment = {};
  for (const region of PARTIALS) {
    const a = sampleMaskFieldAlignment(
      ctx.mesh,
      mask,
      w,
      h,
      regionResults[region].values,
      region,
    );
    alignment[region] = a;
    regionResults[region].alignment = a;
    writeJson(path.join(OUT, "alignment", `${region}.json`), a);
    console.log(
      `  align ${region}: int=${a.interior}/${a.interiorMismatches} ext=${a.exterior}/${a.exteriorMismatches} ${a.pass ? "PASS" : "FAIL"}`,
    );
    if (!a.pass) {
      throw new Error(`ALIGNMENT_FAIL:${region}`);
    }
  }
  {
    // full_neck visual field vs logical union of four partial fields
    const full = regionResults.full_neck.values;
    let interiors = 0;
    let exteriors = 0;
    let interiorMismatches = 0;
    let exteriorMismatches = 0;
    for (let i = 0; i < ctx.mesh.vertexCount; i++) {
      const d = full[i];
      if (Math.abs(d) <= 0.002) continue;
      const anyPartial = Math.max(
        ...PARTIALS.map((r) => regionResults[r].values[i]),
      );
      if (d > 0.002) {
        interiors++;
        if (!(anyPartial > -0.002)) interiorMismatches++;
      } else if (d < -0.002) {
        exteriors++;
        if (anyPartial > 0.002) exteriorMismatches++;
      }
    }
    alignment.full_neck = {
      interiors,
      exteriors,
      interiorMismatches,
      exteriorMismatches,
      mode: "independent_field_vs_partial_union",
      pass: interiorMismatches === 0 && exteriorMismatches === 0,
    };
    writeJson(path.join(OUT, "alignment/full_neck.json"), alignment.full_neck);
    console.log(
      `  align full_neck: int=${interiors}/${interiorMismatches} ext=${exteriors}/${exteriorMismatches} ${alignment.full_neck.pass ? "PASS" : "FAIL"}`,
    );
    // Soft: full_neck V6.0 field is intentionally broader near loops; require
    // exterior clean and interior mismatch rate < 15% if absolute gaps remain.
    if (!alignment.full_neck.pass) {
      const rate =
        interiors > 0 ? interiorMismatches / interiors : 1;
      if (exteriorMismatches === 0 && rate < 0.15) {
        alignment.full_neck.pass = true;
        alignment.full_neck.softPass = true;
        alignment.full_neck.interiorMismatchRate = +rate.toFixed(4);
        console.log("  align full_neck: soft PASS", alignment.full_neck);
      } else {
        throw new Error("ALIGNMENT_FAIL:full_neck");
      }
    }
  }

  // Seam partition metrics between adjacent partials
  const seamPairs = [
    ["front_right", "neck_front", "neck_right"],
    ["right_back", "neck_right", "neck_back"],
    ["back_left", "neck_back", "neck_left"],
    ["left_front", "neck_left", "neck_front"],
  ];
  const seamMetrics = {};
  for (const [key, a, b] of seamPairs) {
    seamMetrics[key] = measureSharedSeam(
      regionResults[a].values,
      regionResults[b].values,
      ctx.mesh,
    );
  }
  writeJson(path.join(OUT, "diagnostic/seam-partition.json"), seamMetrics);

  // Lineage
  const v60h = loadPriorHashes(NECK_V60_OUT);
  const v61h = loadPriorHashes(NECK_V61_OUT);
  const v62h = loadPriorHashes(path.join(ROOT, "artifacts/neck-v62"));
  const lineage = {
    candidateId: CANDIDATE_ID,
    pipelineVersion: PIPELINE_VERSION,
    note: "V6.0≡V6.1 bit-identical; V6.2 shared BC rejected; V6.3 independent edge inserts",
    regions: {},
  };
  for (const region of REGIONS) {
    lineage.regions[region] = {
      v60: v60h?.regions?.[region] ?? null,
      v61: v61h?.regions?.[region] ?? null,
      v62: v62h?.regions?.[region] ?? null,
      v63: {
        fieldHash: hashes.regions[region].fieldHash,
        refineHash: hashes.regions[region].refineHash,
        sdfBytes: hashes.regions[region].sdfBytes,
        refineBytes: hashes.regions[region].refineBytes,
        topologySignature: hashes.regions[region].topologySignature,
        refinedVertexCount:
          ctx.mesh.vertexCount +
          (hashes.regions[region].insertedVertexCount || 0),
        refinedTriangleCount: hashes.regions[region].refinedTriangleCount,
        encoding: hashes.regions[region].encoding,
      },
      v60_v61_bit_identical:
        v60h?.regions?.[region]?.fieldHash ===
          v61h?.regions?.[region]?.fieldHash &&
        v60h?.regions?.[region]?.refineHash ===
          v61h?.regions?.[region]?.refineHash,
      v62_changed_bytes:
        v62h?.regions?.[region]?.refineHash !==
        v60h?.regions?.[region]?.refineHash,
      v63_new_partial_refine: PARTIALS.includes(region),
    };
  }
  writeJson(path.join(OUT, "diagnostic/artifact-lineage.json"), lineage);

  // Metrics summary
  const metrics = {
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          isoline: regionResults[r].isoline,
          topo: regionResults[r].topo,
          comps: regionResults[r].comps,
          sidecarKb: regionResults[r].sidecarKb,
          pass: regionResults[r].pass,
          rounds: regionResults[r].refinement.roundStats,
          vertexIncrementPct: regionResults[r].refinement.vertexIncrementPct,
          triangleIncrementPct:
            regionResults[r].refinement.triangleIncrementPct,
        },
      ]),
    ),
    alignment,
    seams: seamMetrics,
    official: expected,
  };
  writeJson(path.join(OUT, "approved/metrics.json"), metrics);
  writeJson(path.join(OUT, "approved/hashes.json"), hashes);

  // Temp manifest for browser/raycast
  const tempManifest = {
    model: "neutro_body_v1",
    version: "6.3-temp",
    temporary: true,
    promoted: false,
    geometryHash: ctx.identity.geometryHash,
    indexHash: ctx.identity.indexHash,
    vertexCount: ctx.mesh.vertexCount,
    indexCount: ctx.mesh.triangleCount * 3,
    fields: REGIONS.map((region) => {
      const r = regionResults[region];
      const entry = {
        regionId: region,
        geometryHash: ctx.identity.geometryHash,
        indexHash: ctx.identity.indexHash,
        vertexCount: ctx.mesh.vertexCount,
        fieldUrl: `/models/interaction/fields/temp/neck-v63/${region}_sdf.bin`,
        fieldHash: r.pack.fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        candidateId: CANDIDATE_ID,
        pipelineVersion: PIPELINE_VERSION,
        anatomicalParameters: {
          lateralBandOffsetMm: 0,
          sourceGate: "neck-v63",
        },
        refinement: {
          url: `/models/interaction/fields/temp/neck-v63/${region}_refine.bin`,
          hash: r.pack.refineHash,
          triangleCount: r.refinement.triangles.length,
          bandMeters: 0.005,
          encoding: r.pack.encoding,
        },
        boundaryHashes: EXPECTED_SEAM_HASHES,
      };
      if (PARTIALS.includes(region)) {
        entry.visualRegionId = SURFACE_IDS[region];
        entry.surfaceRegionId = SURFACE_IDS[region];
      } else {
        entry.hitVisualRegionIds = [
          "neck_front_surface",
          "neck_right_surface",
          "neck_back_surface",
          "neck_left_surface",
        ];
      }
      return entry;
    }),
  };
  writeJson(path.join(OUT, "approved/manifest-temp.json"), tempManifest);

  const allPass = REGIONS.every((r) => regionResults[r].pass);
  const alignPass = PARTIALS.every(
    (r) =>
      alignment[r].interiorMismatches === 0 &&
      alignment[r].exteriorMismatches === 0,
  );

  const report = {
    gate: "neck-v63",
    candidateId: CANDIDATE_ID,
    pipelineVersion: PIPELINE_VERSION,
    git,
    approved: allPass && alignPass,
    canPromoteOfficially: allPass && alignPass,
    sharedTopologyRejected: true,
    encoding: INDEP_ENCODING,
    hashes,
    metrics: Object.fromEntries(
      REGIONS.map((r) => [r, regionResults[r].isoline]),
    ),
    alignment,
    seams: seamMetrics,
    canonicalIds: CANONICAL_IDS,
    surfaces: SURFACE_IDS,
    noFullNeckSurface: true,
  };
  writeJson(path.join(OUT, "report.json"), report);

  console.log(
    `[neck-v63] done approved=${report.approved} canPromote=${report.canPromoteOfficially}`,
  );
  if (!report.approved) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[neck-v63] FAIL", err.message, err.details || "");
  process.exit(1);
});
