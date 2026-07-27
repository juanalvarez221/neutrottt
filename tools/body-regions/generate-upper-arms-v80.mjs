/**
 * Upper Arms V8.0 gate orchestrator — bilateral Geometry Distance Field.
 *
 * Evaluates UA01/UA02/UA03 (bicepsBandOffset -4/0/+4 mm) for both sides,
 * selects UA02 when it passes bilaterally, otherwise first candidate that
 * passes both sides. Writes diagnostics, shared seams, approved sidecars,
 * temporary categorical mask (maskIndex 18-21 only) and gate report.
 *
 * Does NOT write to public/. Does NOT create commits.
 *
 *   node tools/body-regions/generate-upper-arms-v80.mjs
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  SOURCE_GATE,
  UPPER_ARMS_V80_OUT,
  CANONICAL_ID_MAP,
  assertOfficialBodyFrozen,
  evaluateUpperArmSide,
  evaluateUpperArmTarget,
  getUpperArmSideConfig,
  getUpperArmTargetConfig,
  loadMeshData,
  loadGeometryIdentity,
  measureSurfaceMetrics,
  sha16,
  contentHash16,
  decodeSnorm16,
  FIELD_RANGE_M,
  FOREARM_SEAM_T,
  deriveUpperArmLandmarks,
  buildProximalShoulderSeam,
  buildDistalForearmSeam,
  buildBicepsTricepsSeams,
  buildArmAtlas,
} from "./upper-arms-v80-core.mjs";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = UPPER_ARMS_V80_OUT;
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(ROOT, "assets/body-regions/neutro_body_v1_landmarks.json");
const ANATOMY = path.join(ROOT, "assets/body-regions/neutro_body_v1_anatomical_regions.json");

export const SIDES = ["right", "left"];
export const CANDIDATE_ORDER = ["UA01", "UA02", "UA03"];
export const KINDS = ["biceps", "triceps", "upper_arm"];

export function round(v, d = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
}

export function writeJson(p, obj) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
  return p;
}

function ensureDirs() {
  for (const d of [
    OUT,
    path.join(OUT, "diagnostic"),
    path.join(OUT, "shared-seams"),
    path.join(OUT, "candidates"),
    path.join(OUT, "approved"),
    path.join(OUT, "alignment"),
    path.join(OUT, "masks"),
    path.join(OUT, "backups"),
    path.join(OUT, "browser"),
    path.join(OUT, "fallback"),
    path.join(OUT, "hit-alignment"),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

export async function loadRuntimeMask(root = ROOT) {
  const png = path.join(
    root,
    "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
  );
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4];
  return { mask, w: info.width, h: info.height };
}

/**
 * Rasterize ONLY biceps/triceps surface IDs (18-21). Foreign pixels preserved.
 */
export function rasterizeUpperArmSurfaces(mesh, fieldsBySideKind, mask, w, h) {
  const armIds = new Set([18, 19, 20, 21]);
  const out = Uint8Array.from(mask);
  for (let i = 0; i < out.length; i++) {
    if (armIds.has(out[i])) out[i] = 0;
  }
  const UV = mesh.uvs;
  const I = mesh.indices;
  const cover = new Float32Array(w * h);
  let foreignChanged = 0;

  const writeSample = (u, v, maskIndex, dist) => {
    if (!(dist > 0.0005)) return;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
    const idx = py * w + px;
    if (!armIds.has(mask[idx]) && mask[idx] !== 0) {
      // never overwrite foreign
      return;
    }
    if (dist > cover[idx]) {
      cover[idx] = dist;
      out[idx] = maskIndex;
    }
  };

  for (const side of SIDES) {
    for (const kind of ["biceps", "triceps"]) {
      const cfg = getUpperArmTargetConfig(side, kind);
      const values = fieldsBySideKind[`${side}:${kind}`];
      if (!values) continue;
      for (let t = 0; t < mesh.triangleCount; t++) {
        const a = I[t * 3];
        const b = I[t * 3 + 1];
        const c = I[t * 3 + 2];
        const fa = values[a];
        const fb = values[b];
        const fc = values[c];
        if (fa <= 0 && fb <= 0 && fc <= 0) continue;
        const uvs = [
          [UV[a * 2], UV[a * 2 + 1]],
          [UV[b * 2], UV[b * 2 + 1]],
          [UV[c * 2], UV[c * 2 + 1]],
        ];
        const ds = [fa, fb, fc];
        // barycentric samples
        for (const [wa, wb, wc] of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.5, 0.5, 0],
          [0.5, 0, 0.5],
          [0, 0.5, 0.5],
          [1 / 3, 1 / 3, 1 / 3],
        ]) {
          const d = ds[0] * wa + ds[1] * wb + ds[2] * wc;
          const u = uvs[0][0] * wa + uvs[1][0] * wb + uvs[2][0] * wc;
          const v = uvs[0][1] * wa + uvs[1][1] * wb + uvs[2][1] * wc;
          writeSample(u, v, cfg.maskIndex, d);
        }
      }
    }
  }

  // Count foreign changes (should be 0 by construction)
  for (let i = 0; i < mask.length; i++) {
    if (!armIds.has(mask[i]) && mask[i] !== 0 && out[i] !== mask[i]) {
      foreignChanged++;
      out[i] = mask[i];
    }
  }
  return { mask: out, foreignChanged, armIds: [...armIds] };
}

function serializeSeam(seam) {
  return {
    seamId: seam.seamId,
    side: seam.side,
    insertionPoint: seam.insertionPoint,
    planeNormal: seam.planeNormal,
    axisPoint: seam.axisPoint,
    axisDir: seam.axisDir,
    t: seam.t,
    radius: seam.radius,
    insertionDist: seam.insertionDist,
    points: seam.points,
    total: seam.total,
    closed: seam.closed,
    seamHash: seam.seamHash,
    sourceHash: seam.sourceHash ?? null,
    synthesized: seam.synthesized ?? false,
    autoIntersections: seam.autoIntersections ?? 0,
    components: seam.components ?? 1,
    diagnostics: seam.diagnostics ?? null,
    angle: seam.angle ?? null,
  };
}

async function main() {
  ensureDirs();
  console.log("[generate-upper-arms-v80] freeze check…");
  const freeze = assertOfficialBodyFrozen(ROOT);
  console.log("[generate-upper-arms-v80] freeze OK", freeze.maskHash);

  writeJson(path.join(OUT, "diagnostic/canonical-id-map.json"), CANONICAL_ID_MAP);

  const mesh = loadMeshData(GLB);
  const identity = loadGeometryIdentity(GLB);
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const anatomy = JSON.parse(readFileSync(ANATOMY, "utf8"));

  // Derived landmarks + seams (side-aware, no mirroring of data)
  const derivedLandmarks = {};
  const seamsOut = {};
  for (const side of SIDES) {
    const derived = deriveUpperArmLandmarks(side, lm, identity, anatomy);
    derivedLandmarks[side] = {
      side,
      acromion: derived.acromion,
      elbow: derived.elbow,
      armAxis: derived.armAxis,
      armLength: derived.armLength,
      epicondyleMedial: derived.epicondyleMedial,
      epicondyleLateral: derived.epicondyleLateral,
      olecranon: derived.olecranon,
      cubitalFossa: derived.cubitalFossa,
      glenohumeral: derived.glenohumeral,
      method: derived.method,
      confidence: derived.confidence,
      geometryHash: identity.geometryHash,
      sourceHash: sha16(JSON.stringify(lm.points)),
    };
    const proximal = buildProximalShoulderSeam(mesh, derived, 0);
    const distal = buildDistalForearmSeam(mesh, derived);
    const bt = buildBicepsTricepsSeams(derived, proximal, distal, 0);
    seamsOut[side] = { proximal, distal, medial: bt.medial, lateral: bt.lateral };
    writeJson(
      path.join(OUT, "shared-seams", `${side}-shoulder-upper-arm.json`),
      serializeSeam(proximal),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-upper-arm-forearm.json`),
      serializeSeam(distal),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-medial-biceps-triceps.json`),
      serializeSeam(bt.medial),
    );
    writeJson(
      path.join(OUT, "shared-seams", `${side}-lateral-biceps-triceps.json`),
      serializeSeam(bt.lateral),
    );
    const atlas = buildArmAtlas(mesh, derived, proximal, distal);
    writeJson(path.join(OUT, "diagnostic", `${side}-atlas.json`), {
      side,
      parametrized: atlas.parametrized,
      skipped: atlas.skipped,
      sectionCount: atlas.sectionCount,
      forearmSeamT: FOREARM_SEAM_T,
    });
  }
  writeJson(path.join(OUT, "diagnostic/derived-landmarks.json"), derivedLandmarks);

  // Evaluate candidates
  const candidateReports = {};
  let selectedId = null;
  for (const cid of CANDIDATE_ORDER) {
    const candidate = CANDIDATES[cid];
    console.log(`[generate-upper-arms-v80] evaluating ${cid}…`);
    const sides = {};
    let bilateralPass = true;
    for (const side of SIDES) {
      const result = evaluateUpperArmSide(side, candidate, {
        mesh,
        identity,
        landmarks: lm,
        anatomy,
      });
      sides[side] = {
        pass: result.pass,
        kinds: Object.fromEntries(
          KINDS.map((k) => {
            const r = result.results[k];
            return [
              k,
              {
                pass: r.pass,
                regionId: r.regionId,
                stages: r.stages,
                isoline: r.refinedIsoline,
                alignment: {
                  interiorMismatches: r.alignment.interiorMismatches,
                  exteriorMismatches: r.alignment.exteriorMismatches,
                  pass: r.alignment.pass,
                },
                region: {
                  components: r.region.components,
                  tinyIslands: r.region.tinyIslands ?? 0,
                },
                surface: {
                  positives: r.surface.positives,
                  areaApprox: r.surface.areaApprox ?? null,
                },
                pkgBytes: r.pkgBytes,
                refinement: r.refinement
                  ? {
                      rounds: r.refinement.roundStats?.length ?? 0,
                      inserted: r.refinement.insertedVertexCount,
                      vertPct: r.refinement.vertexIncrementPct,
                      triPct: r.refinement.triangleIncrementPct,
                    }
                  : null,
                fieldHash: r.pkg?.fieldHash ?? null,
                refineHash: r.pkg?.refineHash ?? null,
              },
            ];
          }),
        ),
      };
      if (!result.pass) bilateralPass = false;
      // Keep full results for selected candidate packaging
      sides[side]._full = result;
    }
    candidateReports[cid] = {
      candidateId: cid,
      bicepsBandOffsetMm: candidate.bicepsBandOffsetMm,
      bilateralPass,
      sides: Object.fromEntries(
        SIDES.map((s) => [s, { pass: sides[s].pass, kinds: sides[s].kinds }]),
      ),
    };
    writeJson(path.join(OUT, "candidates", `${cid}.json`), candidateReports[cid]);
    if (bilateralPass && !selectedId) {
      // Prefer UA02 anatomical baseline when it passes; otherwise first passer.
      if (cid === "UA02") selectedId = cid;
      else if (!selectedId) selectedId = cid;
    }
    // stash full for later if this ends up selected
    candidateReports[cid]._sidesFull = sides;
  }

  // Prefer UA02 if it passed; else first bilateral passer; else UA02 for diagnostics
  if (!selectedId) {
    for (const cid of CANDIDATE_ORDER) {
      if (candidateReports[cid].bilateralPass) {
        selectedId = cid;
        break;
      }
    }
  }
  if (!selectedId) selectedId = "UA02";

  // If UA02 passed, use it; if we stored first passer before UA02, upgrade to UA02 when it passed
  if (candidateReports.UA02?.bilateralPass) selectedId = "UA02";

  console.log(`[generate-upper-arms-v80] selected ${selectedId}`);
  const selected = CANDIDATES[selectedId];
  const fullSides = {};
  for (const side of SIDES) {
    // Re-evaluate selected to get packages (or reuse stash)
    const stashed = candidateReports[selectedId]._sidesFull?.[side]?._full;
    fullSides[side] =
      stashed ??
      evaluateUpperArmSide(side, selected, { mesh, identity, landmarks: lm, anatomy });
  }

  // Write approved bins + hashes
  const regions = {};
  const fieldsBySideKind = {};
  for (const side of SIDES) {
    for (const kind of KINDS) {
      const r = fullSides[side].results[kind];
      const stem = r.fileStem;
      if (r.pkg) {
        writeFileSync(path.join(OUT, "approved", `${stem}_sdf.bin`), r.pkg.sdf);
        writeFileSync(path.join(OUT, "approved", `${stem}_refine.bin`), r.pkg.refine);
      }
      fieldsBySideKind[`${side}:${kind}`] = r.values;
      regions[r.regionId] = {
        side,
        kind,
        fileStem: stem,
        fieldHash: r.pkg?.fieldHash ?? null,
        refineHash: r.pkg?.refineHash ?? null,
        encoding: r.pkg?.encoding ?? null,
        isoline: r.refinedIsoline,
        alignment: r.alignment,
        components: r.region.components,
        tinyIslands: r.region.tinyIslands ?? 0,
        pkgBytes: r.pkgBytes,
        refinementTriangleCount: r.refinement?.triangles?.length ?? 0,
        vertexIncrementPct: r.refinement?.vertexIncrementPct ?? 0,
        triangleIncrementPct: r.refinement?.triangleIncrementPct ?? 0,
        rounds: r.refinement?.roundStats?.length ?? 0,
        insertedVerts: r.refinement?.insertedVertexCount ?? 0,
        bicepsBandOffsetMm: selected.bicepsBandOffsetMm,
        pass: r.pass,
        hitVisualRegionIds: getUpperArmTargetConfig(side, kind).hitVisualRegionIds,
        maskIndex: getUpperArmTargetConfig(side, kind).maskIndex,
        surfaceId: getUpperArmTargetConfig(side, kind).surfaceId,
        boundaryHashes: {
          shoulder: r.seams.proximal.seamHash,
          forearm: r.seams.distal.seamHash,
          medial: r.seams.medial.seamHash,
          lateral: r.seams.lateral.seamHash,
        },
      };
      writeJson(path.join(OUT, "alignment", `${stem}.json`), {
        regionId: r.regionId,
        ...r.alignment,
      });
    }
  }

  const hashes = {
    candidateId: selectedId,
    pipelineVersion: PIPELINE_VERSION,
    sourceGate: SOURCE_GATE,
    geometryHash: GEOMETRY_IDENTITY.geometryHash,
    indexHash: GEOMETRY_IDENTITY.indexHash,
    vertexCount: GEOMETRY_IDENTITY.vertexCount,
    bicepsBandOffsetMm: selected.bicepsBandOffsetMm,
    regions,
  };
  writeJson(path.join(OUT, "approved/hashes.json"), hashes);

  // Bilateral report
  const area = (side, kind) =>
    fullSides[side].results[kind].surface.positives;
  const bilateral = {
    biceps: {
      right: area("right", "biceps"),
      left: area("left", "biceps"),
    },
    triceps: {
      right: area("right", "triceps"),
      left: area("left", "triceps"),
    },
    upper_arm: {
      right: area("right", "upper_arm"),
      left: area("left", "upper_arm"),
    },
    armLength: {
      right: derivedLandmarks.right.armLength,
      left: derivedLandmarks.left.armLength,
    },
  };
  for (const k of ["biceps", "triceps", "upper_arm"]) {
    const r = bilateral[k].right;
    const l = bilateral[k].left;
    bilateral[k].diffPct = r && l ? +((Math.abs(r - l) / Math.max(r, l)) * 100).toFixed(2) : null;
  }
  bilateral.armLength.diffPct = +(
    (Math.abs(bilateral.armLength.right - bilateral.armLength.left) /
      Math.max(bilateral.armLength.right, bilateral.armLength.left)) *
    100
  ).toFixed(2);
  bilateral.pass =
    (bilateral.biceps.diffPct ?? 99) <= 15 &&
    (bilateral.triceps.diffPct ?? 99) <= 15 &&
    (bilateral.upper_arm.diffPct ?? 99) <= 15 &&
    (bilateral.armLength.diffPct ?? 99) <= 5;
  writeJson(path.join(OUT, "diagnostic/bilateral-report.json"), bilateral);

  // Rasterize mask
  const { mask, w, h } = await loadRuntimeMask(ROOT);
  const rastered = rasterizeUpperArmSurfaces(mesh, fieldsBySideKind, mask, w, h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rastered.mask[i];
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 255;
  }
  const pngBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(path.join(OUT, "masks/neutro_body_v1_anatomical_region_ids.png"), pngBuf);

  const allPass = SIDES.every((s) =>
    KINDS.every((k) => fullSides[s].results[k].pass),
  );
  const report = {
    pipelineVersion: PIPELINE_VERSION,
    sourceGate: SOURCE_GATE,
    selectedCandidateId: selectedId,
    bicepsBandOffsetMm: selected.bicepsBandOffsetMm,
    approved: allPass,
    canPromoteOfficially: allPass && rastered.foreignChanged === 0,
    freeze,
    bilateral,
    candidates: Object.fromEntries(
      CANDIDATE_ORDER.map((c) => [c, candidateReports[c]]),
    ),
    regions,
    mask: {
      foreignChanged: rastered.foreignChanged,
      w,
      h,
    },
    discarded: CANDIDATE_ORDER.filter((c) => c !== selectedId),
    reason: allPass
      ? selectedId === "UA02"
        ? "anatomical baseline UA02 passed bilaterally"
        : `${selectedId} first bilateral passer`
      : "no candidate fully passed — report only",
  };
  writeJson(path.join(OUT, "report.json"), report);
  console.log(
    `[generate-upper-arms-v80] done selected=${selectedId} promote=${report.canPromoteOfficially}`,
  );
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-upper-arms-v80.mjs")
) {
  main().catch((err) => {
    console.error("[generate-upper-arms-v80] FAIL", err.message, err.details || err.stack);
    process.exit(1);
  });
}
