/**
 * Full Abdomen V3.1 — generate B01–B04, stage finalists, write report.
 *
 * Never overwrites official mask / chest sidecars / manifest.
 *
 *   node tools/body-regions/generate-full-abdomen-v31.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encodeSnorm16 } from "./generate-full-chest-geometry-field.mjs";
import {
  assertOfficialChestFrozen,
  buildV31Context,
  encodeRefinement,
  evaluateAllAbdomenV31Candidates,
  FIELD_RANGE_M,
  FROZEN_C07,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v31.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/full-abdomen-v31");
const STAGED = path.join(OUT, "staged");

function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

function summarize(r) {
  return {
    id: r.id,
    params: {
      pubicClearanceMm: r.params.pubicClearance * 1000,
      inguinalSideRiseMm: r.params.inguinalSideRise * 1000,
    },
    pass: r.pass,
    filters: r.filters,
    components: r.region.components,
    leaksBefore: r.leaksBefore,
    symmetryPct: round(r.symmetry.symmetryPct, 3),
    seamAnalytic: {
      maxGapMm: round(r.seamAnalytic.maxGapMm, 4),
      maxOverlapMm: round(r.seamAnalytic.maxOverlapMm, 4),
      pass: r.seamAnalytic.pass,
    },
    sharedSeamMm: {
      mean: round(r.sharedDist.mean * 1000, 4),
      p95: round(r.sharedDist.p95 * 1000, 4),
      max: round(r.sharedDist.max * 1000, 4),
      fieldMax: round((r.sharedDist.fieldOnSeam?.max ?? 0) * 1000, 4),
      pass: r.sharedDist.pass,
    },
    shape: {
      laterals: r.shape.laterals,
      inferior: r.shape.inferior,
      errors: r.shape.errors,
    },
    isolineMm: {
      mean: round(r.isoline.precision.mean * 1000, 3),
      p95: round(r.isoline.precision.p95 * 1000, 3),
      max: round(r.isoline.precision.max * 1000, 3),
    },
    refinedIsolineMm: {
      mean: round(r.refinedIsoline.precision.mean * 1000, 3),
      p95: round(r.refinedIsoline.precision.p95 * 1000, 3),
      max: round(r.refinedIsoline.precision.max * 1000, 3),
    },
    refinement: {
      triangles: r.refinement.triangles.length,
      growthPct: round(r.refinement.growth * 100, 2),
      levelsUsed: r.refinement.levelsUsed,
      seamReused: r.refinement.seamReused,
      seamTotal: r.refinement.seamTotal,
    },
    umbDMm: round((r.umbD ?? 0) * 1000, 3),
    waistDMm: round((r.waistD ?? 0) * 1000, 3),
  };
}

function stageCandidate(mesh, field, r, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sidecar = encodeSnorm16(r.values);
  const fieldHash = contentHash16(sidecar);
  const refineBin = encodeRefinement(r.refinement, FIELD_RANGE_M);
  const refineHash = contentHash16(refineBin);
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_sdf_${r.id}.bin`),
    sidecar,
  );
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_refine_${r.id}.bin`),
    refineBin,
  );
  return {
    fieldHash,
    refineHash,
    sidecarBytes: sidecar.length,
    refineBytes: refineBin.length,
    totalSidecarBytes: sidecar.length + refineBin.length,
    triangleCount: r.refinement.triangles.length,
    refinedPrecision: r.refinedIsoline.precision,
  };
}

export function generateFullAbdomenV31() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "diagnostic"), { recursive: true });
  mkdirSync(path.join(OUT, "candidates"), { recursive: true });
  mkdirSync(path.join(OUT, "finalists"), { recursive: true });
  mkdirSync(path.join(OUT, "seam"), { recursive: true });
  mkdirSync(STAGED, { recursive: true });

  const chest = assertOfficialChestFrozen();
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });

  writeFileSync(
    path.join(OUT, "derived-landmarks.json"),
    JSON.stringify(ctx.derived, null, 2),
  );
  writeFileSync(
    path.join(OUT, "lateral-profile.json"),
    JSON.stringify(
      {
        diagnostics: ctx.laterals.diagnostics,
        slices: ctx.laterals.slices.map((s) => ({
          y: +s.y.toFixed(5),
          rightS: +s.rightS.toFixed(5),
          leftS: +s.leftS.toFixed(5),
          widthS: +s.widthS.toFixed(5),
        })),
      },
      null,
      2,
    ),
  );

  const sweep = evaluateAllAbdomenV31Candidates(ctx);
  const summaries = sweep.results.map(summarize);

  const staged = {};
  const alignments = {};
  for (const id of sweep.finalists) {
    const r = sweep.results.find((x) => x.id === id);
    if (!r) continue;
    staged[id] = stageCandidate(ctx.mesh, ctx.field, r, STAGED);
    alignments[id] = sampleAbdomenFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 5000, exterior: 5000, band: 0.002 },
    );
    writeFileSync(
      path.join(STAGED, `candidate-${id}.json`),
      JSON.stringify(
        {
          version: "3.1",
          candidateId: id,
          params: r.params,
          frozenChest: FROZEN_C07,
          chestHashes: chest,
          identity: ctx.identity,
          staged: staged[id],
          seamAnalytic: r.seamAnalytic,
          sharedDist: r.sharedDist,
          alignment: alignments[id],
          officialAssetsOverwritten: false,
        },
        null,
        2,
      ),
    );
  }

  // Also stage all B01–B04 for evidence rendering.
  for (const r of sweep.results) {
    stageCandidate(ctx.mesh, ctx.field, r, path.join(STAGED, "all"));
  }

  const report = {
    version: "3.1",
    chestRegression: { ...chest, intact: true },
    identity: ctx.identity,
    sharedSeam: {
      seamHash: ctx.sharedSeam.seamHash,
      triangleCount: ctx.sharedSeam.triangleCount,
      curvePoints: ctx.sharedSeam.curveOrder?.length ?? 0,
      candidateId: ctx.sharedSeam.candidateId,
    },
    laterals: ctx.laterals.diagnostics,
    landmarks: {
      existingUsed: ctx.derived.existingUsed,
      derived: Object.keys(ctx.derived.derived),
      sourceHash: ctx.derived.sourceHash,
    },
    candidates: summaries,
    survivors: sweep.survivors,
    finalists: sweep.finalists,
    technicallyDiscarded: summaries
      .filter((s) => !s.pass)
      .map((s) => ({ id: s.id, filters: s.filters })),
    staged,
    alignments,
    officialMaskOverwritten: false,
    officialSidecarOverwritten: false,
    glbModified: false,
    promoted: false,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    "V31_ABDOMEN",
    JSON.stringify({
      survivors: sweep.survivors,
      finalists: sweep.finalists,
      lateralsConstant: ctx.laterals.diagnostics.areConstant,
      widthProfile: {
        top: ctx.laterals.diagnostics.widthTop,
        waist: ctx.laterals.diagnostics.widthWaist,
        low: ctx.laterals.diagnostics.widthLow,
      },
      discarded: report.technicallyDiscarded.map((d) => d.id),
    }),
  );
  return { ctx, sweep, report };
}

if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("generate-full-abdomen-v31.mjs")
) {
  generateFullAbdomenV31();
}
