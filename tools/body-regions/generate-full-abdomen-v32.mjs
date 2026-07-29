/**
 * Full Abdomen V3.2 — residual isoline tessellation for B01/B02.
 *
 *   node tools/body-regions/generate-full-abdomen-v32.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertOfficialChestFrozen,
  buildV31Context,
  encodeRefinement,
  encodeSnorm16,
  evaluateAllAbdomenV32Candidates,
  FIELD_RANGE_M,
  FROZEN_C07,
  OUT,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v32.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const DIAG = path.join(OUT, "diagnostic");
const STAGED = path.join(OUT, "staged");
const APPROVED = path.join(OUT, "approved");

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
    residualCount: r.v32?.residualCount ?? 0,
    residualTypes: Object.fromEntries(
      Object.entries(
        (r.v32?.residualsBefore ?? []).reduce((acc, x) => {
          acc[x.boundaryType] = (acc[x.boundaryType] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    ),
    sharedSeamAffected: (r.v32?.residualsBefore ?? []).some(
      (x) => x.boundaryType === "shared_superior",
    ),
    refinedIsolineMm: {
      mean: round(r.refinedIsoline.precision.mean * 1000, 3),
      p95: round(r.refinedIsoline.precision.p95 * 1000, 3),
      max: round(r.refinedIsoline.precision.max * 1000, 3),
    },
    byFrontierMm: Object.fromEntries(
      Object.entries(r.v32?.byFrontier ?? {}).map(([k, v]) => [
        k,
        {
          n: v.n,
          mean: round(v.mean * 1000, 3),
          p95: round(v.p95 * 1000, 3),
          max: round(v.max * 1000, 3),
        },
      ]),
    ),
    residualGrowthPct: {
      tris: round((r.v32?.residualTriGrowth ?? 0) * 100, 4),
      verts: round((r.v32?.residualVertGrowth ?? 0) * 100, 4),
    },
    topology: r.v32?.pass1,
    leaksBefore: r.leaksBefore,
    sharedDist: {
      mean: r.sharedDist.mean,
      p95: r.sharedDist.p95,
      max: r.sharedDist.max,
      pass: r.sharedDist.pass,
    },
  };
}

function stageCandidate(r, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sidecar = encodeSnorm16(r.values);
  const refineBin = encodeRefinement(r.refinement, FIELD_RANGE_M);
  // Isoline patch metadata (tools + future loader); L1 refine stays compatible.
  const isolinePatch = {
    version: "3.2",
    candidateId: r.id,
    edgeInsertions: r.v32?.edgeInsertions ?? [],
    residualTriGrowth: r.v32?.residualTriGrowth,
    residualVertGrowth: r.v32?.residualVertGrowth,
    precision: r.refinedIsoline.precision,
  };
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_sdf_${r.id}.bin`),
    sidecar,
  );
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_refine_${r.id}.bin`),
    refineBin,
  );
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_isoline_${r.id}.json`),
    JSON.stringify(isolinePatch, null, 2),
  );
  return {
    fieldHash: contentHash16(sidecar),
    refineHash: contentHash16(refineBin),
    sidecarBytes: sidecar.length,
    refineBytes: refineBin.length,
    isolineBytes: Buffer.byteLength(JSON.stringify(isolinePatch)),
    totalSidecarBytes:
      sidecar.length +
      refineBin.length +
      Buffer.byteLength(JSON.stringify(isolinePatch)),
  };
}

export function generateFullAbdomenV32() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DIAG, { recursive: true });
  mkdirSync(STAGED, { recursive: true });
  mkdirSync(path.join(OUT, "finalists"), { recursive: true });
  mkdirSync(path.join(OUT, "browser"), { recursive: true });

  const chest = assertOfficialChestFrozen();
  const ctx = buildV31Context(GLB, LANDMARKS, { skipSeamExtract: true });
  const sweep = evaluateAllAbdomenV32Candidates(ctx);
  const summaries = sweep.results.map(summarize);

  for (const r of sweep.results) {
    writeFileSync(
      path.join(DIAG, `0${r.id === "B01" ? "1" : "2"}-${r.id}-residual-triangles.json`),
      JSON.stringify(
        {
          candidateId: r.id,
          residualThresholdMm: 3.5,
          count: r.v32?.residualCount ?? 0,
          sharedSeamAffected: summaries.find((s) => s.id === r.id)
            ?.sharedSeamAffected,
          triangles: r.v32?.residualsBefore ?? [],
        },
        null,
        2,
      ),
    );
  }

  const staged = {};
  const alignments = {};
  for (const r of sweep.results) {
    staged[r.id] = stageCandidate(r, STAGED);
    alignments[r.id] = sampleAbdomenFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 5000, exterior: 5000, band: 0.002 },
    );
  }

  // Prefer B02 if both pass (slightly softer inguinal); else first passer.
  const passers = sweep.results.filter((r) => r.pass);
  let selectedId = null;
  if (passers.length === 1) selectedId = passers[0].id;
  else if (passers.length === 2) {
    // Defer final visual pick to evidence step; stage both, default B01.
    selectedId = "B01";
  }

  if (selectedId) {
    mkdirSync(APPROVED, { recursive: true });
    const chosen = sweep.results.find((r) => r.id === selectedId);
    const stagedChosen = stageCandidate(chosen, APPROVED);
    writeFileSync(
      path.join(APPROVED, "candidate.json"),
      JSON.stringify(
        {
          version: "3.2",
          candidateId: selectedId,
          params: chosen.params,
          frozenChest: FROZEN_C07,
          chestHashes: chest,
          staged: stagedChosen,
          precision: chosen.refinedIsoline.precision,
          officialAssetsOverwritten: false,
          promoted: false,
        },
        null,
        2,
      ),
    );
  }

  const report = {
    version: "3.2",
    chestRegression: { ...chest, intact: true },
    identity: ctx.identity,
    sharedSeam: {
      seamHash: ctx.sharedSeam.seamHash,
      triangleCount: ctx.sharedSeam.triangleCount,
    },
    lateralsFrozen: true,
    candidates: summaries,
    passers: passers.map((r) => r.id),
    selectedId,
    staged,
    alignments,
    officialMaskOverwritten: false,
    officialSidecarOverwritten: false,
    glbModified: false,
    promoted: false,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    "V32_ABDOMEN",
    JSON.stringify({
      passers: report.passers,
      selectedId,
      candidates: summaries.map((s) => ({
        id: s.id,
        pass: s.pass,
        refined: s.refinedIsolineMm,
        residuals: s.residualCount,
        types: s.residualTypes,
      })),
    }),
  );
  return { ctx, sweep, report };
}

if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("generate-full-abdomen-v32.mjs")
) {
  generateFullAbdomenV32();
}
