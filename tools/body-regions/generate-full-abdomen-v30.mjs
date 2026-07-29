/**
 * Full Abdomen V3.0 — candidate sweep, finalist selection, approved staging.
 *
 * Never overwrites official mask / sidecars / manifest. Chest C07 stays frozen.
 *
 *   node tools/body-regions/generate-full-abdomen-v30.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildBoundaryRefinement,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";
import {
  buildV30Context,
  evaluateAllAbdomenCandidates,
  OFFICIAL_CHEST_HASHES,
  FROZEN_C07,
  sampleAbdomenFieldAlignment,
} from "./full-abdomen-v30.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/full-abdomen-v30");
const APPROVED = path.join(OUT, "approved");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function assertChestFrozen() {
  const maskManifest = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
      "utf8",
    ),
  );
  const regionFields = JSON.parse(
    readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const chest = regionFields.fields.find((f) => f.regionId === "full_chest");
  const fieldBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const refineBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
  );

  const ok =
    maskManifest.maskHash === OFFICIAL_CHEST_HASHES.maskHash &&
    chest?.fieldHash === OFFICIAL_CHEST_HASHES.fieldHash &&
    chest?.refinement?.hash === OFFICIAL_CHEST_HASHES.refinementHash &&
    chest?.candidateId === OFFICIAL_CHEST_HASHES.candidateId &&
    contentHash16(fieldBin) === OFFICIAL_CHEST_HASHES.fieldHash &&
    contentHash16(refineBin) === OFFICIAL_CHEST_HASHES.refinementHash;

  if (!ok) {
    console.error("FULL_CHEST_REGRESSION_DETECTED", {
      maskHash: maskManifest.maskHash,
      fieldHash: chest?.fieldHash,
      refinementHash: chest?.refinement?.hash,
      candidateId: chest?.candidateId,
      fieldBin: contentHash16(fieldBin),
      refineBin: contentHash16(refineBin),
    });
    process.exit(2);
  }
  return {
    maskHash: maskManifest.maskHash,
    fieldHash: chest.fieldHash,
    refinementHash: chest.refinement.hash,
    candidateId: chest.candidateId,
  };
}

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

function summarize(r) {
  return {
    id: r.id,
    params: {
      pubicClearanceMm: r.params.pubicClearance * 1000,
      lowerSideRiseMm: r.params.lowerSideRise * 1000,
      lateralCoverage: r.params.lateralCoverage,
    },
    pass: r.pass,
    filters: r.filters,
    components: r.region.components,
    leaksBefore: r.leaksBefore,
    symmetryPct: round(r.symmetry.symmetryPct, 3),
    seam: {
      maxGapMm: round(r.seam.maxGapMm, 4),
      maxOverlapMm: round(r.seam.maxOverlapMm, 4),
      pass: r.seam.pass,
    },
    shape: {
      vDepthMm: round(r.shape.vDepthMm, 3),
      centerDipMm: round(r.shape.centerDipMm, 3),
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
    umbDMm: round((r.umbD ?? 0) * 1000, 3),
    waistDMm: round((r.waistD ?? 0) * 1000, 3),
  };
}

function stageCandidate(mesh, field, r, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sidecar = encodeSnorm16(r.values);
  const fieldHash = contentHash16(sidecar);
  const refinement =
    r.refinement ?? buildBoundaryRefinement(mesh, r.values, r.bounds, field);
  const refineBin = encodeRefinement(refinement, FIELD_RANGE_M);
  const refineHash = contentHash16(refineBin);
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_sdf_${r.id}.bin`),
    sidecar,
  );
  writeFileSync(
    path.join(outDir, `neutro_body_v1_full_abdomen_refine_${r.id}.bin`),
    refineBin,
  );
  const refinedPrecision = r.refinedIsoline?.precision ?? {
    mean: 0,
    p95: 0,
    max: 0,
  };
  return {
    fieldHash,
    refineHash,
    sidecarBytes: sidecar.length,
    refineBytes: refineBin.length,
    triangleCount: refinement.triangles.length,
    refinedPrecision: {
      mean: refinedPrecision.mean,
      p95: refinedPrecision.p95,
      max: refinedPrecision.max,
    },
  };
}

export function generateFullAbdomenV30() {
  mkdirSync(OUT, { recursive: true });
  const chest = assertChestFrozen();
  const ctx = buildV30Context(GLB, LANDMARKS);
  writeFileSync(
    path.join(OUT, "derived-landmarks.json"),
    JSON.stringify(ctx.derived, null, 2),
  );

  const sweep = evaluateAllAbdomenCandidates(ctx);
  const summaries = sweep.results.map(summarize);

  // Pick approved = best survivor (or best overall if none pass — still stage).
  let approvedId = sweep.finalists[0] ?? null;
  if (!approvedId) {
    const ranked = [...sweep.results].sort(
      (a, b) => a.filters.length - b.filters.length,
    );
    approvedId = ranked[0]?.id ?? null;
  }
  const approved = sweep.results.find((r) => r.id === approvedId);

  let staged = null;
  let alignment = null;
  if (approved) {
    staged = stageCandidate(ctx.mesh, ctx.field, approved, APPROVED);
    // Analytic field vs analytic inside (temporary; no official mask write).
    alignment = sampleAbdomenFieldAlignment(
      ctx.mesh,
      approved.bounds,
      ctx.field,
      approved.values,
      { interior: 3000, exterior: 3000, band: 0.002 },
    );
    writeFileSync(
      path.join(APPROVED, "candidate.json"),
      JSON.stringify(
        {
          version: "3.0",
          candidateId: approved.id,
          params: approved.params,
          frozenChest: FROZEN_C07,
          chestHashes: chest,
          identity: ctx.identity,
          staged,
          seam: approved.seam,
          alignment,
          officialAssetsOverwritten: false,
        },
        null,
        2,
      ),
    );
  }

  const report = {
    version: "3.0",
    chestRegression: { ...chest, intact: true },
    identity: ctx.identity,
    landmarks: {
      existingUsed: ctx.derived.existingUsed,
      derived: Object.keys(ctx.derived.derived),
      sourceHash: ctx.derived.sourceHash,
    },
    candidates: summaries,
    survivors: sweep.survivors,
    finalists: sweep.finalists,
    approvedId,
    staged,
    alignment,
    officialMaskOverwritten: false,
    officialSidecarOverwritten: false,
    glbModified: false,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    "V30_ABDOMEN",
    JSON.stringify({
      survivors: sweep.survivors,
      finalists: sweep.finalists,
      approvedId,
      sidecarBytes: staged?.sidecarBytes,
      alignment,
    }),
  );
  return { ctx, sweep, report, approved };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("generate-full-abdomen-v30.mjs")) {
  generateFullAbdomenV30();
}
