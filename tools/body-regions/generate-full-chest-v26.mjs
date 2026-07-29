/**
 * Full Chest Anatomical Refinement V2.6 — candidate sweep + finalist selection.
 *
 * Runs the 8 controlled candidates through the frozen V2.5 Geometry Distance
 * Field pipeline, applies the technical filters, measures anatomical metrics,
 * selects finalists, checks highlight/hit alignment, and stages the approved
 * candidate under artifacts/ (never the official mask, sidecar, or GLB).
 *
 *   node tools/body-regions/generate-full-chest-v26.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseGlb, readAccessor } from "../body-mask/glb.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "./geometry-field-hash.mjs";
import {
  buildBoundaryRefinement,
  encodeRefinement,
  encodeSnorm16,
  FIELD_RANGE_M,
  REFINE_BAND_METERS,
  validateRefinedIsoline,
} from "./generate-full-chest-geometry-field.mjs";
import {
  buildHitProbes,
  buildV26Context,
  evaluateAllCandidates,
  sampleHitAlignment,
} from "./full-chest-v26.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/full-chest-v26");
const APPROVED = path.join(OUT, "approved");
const REGION_ID = "full_chest";

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

function summarizeCandidate(r) {
  return {
    id: r.id,
    params: {
      infraclavicularOffsetMm: r.params.infraclavicularOffset * 1000,
      upperCenterRiseMm: r.params.upperCenterRise * 1000,
      inferiorCenterTransitionMm: r.params.inferiorCenterTransition * 1000,
    },
    pass: r.pass,
    filters: r.filters,
    components: r.region.components,
    leaksBefore: r.leaksBefore,
    symmetryPct: round(r.symmetry.symmetryPct, 3),
    shape: {
      upperLocalMinMm: round(r.shape.upperLocalMinMm, 3),
      interiorMinima: r.shape.interiorMinima,
      centerDipBelowMedialMm: round(r.shape.centerDipBelowMedialMm, 3),
      maxSlopeJump: round(r.shape.maxSlopeJump, 3),
      minUpperLowerGapMm: round(r.shape.minUpperLowerGapMeters * 1000, 2),
    },
    isolineMm: {
      mean: round(r.isoline.precision.mean * 1000, 3),
      p95: round(r.isoline.precision.p95 * 1000, 3),
      max: round(r.isoline.precision.max * 1000, 3),
      crossed: r.isoline.triangles.crossed,
    },
    abdominalInvasionMm: round(r.abdominalInvasionMm, 3),
    metrics: {
      widthSurfaceM: round(r.metrics.widthSurfaceM),
      heightCentralM: round(r.metrics.heightCentralM),
      heightLateralM: round(r.metrics.heightLateralM),
      areaM2: round(r.metrics.areaM2, 5),
      perimeterM: round(r.metrics.perimeterM),
      distanceToClavicleMm: round(r.metrics.distanceToClavicleMm, 2),
      distanceToImfMeanMm: round(r.metrics.distanceToImfMeanMm, 3),
      distanceToImfMaxMm: round(r.metrics.distanceToImfMaxMm, 3),
      distanceToAxillaMeanMm: round(r.metrics.distanceToAxillaMeanMm, 3),
      distanceToAxillaMaxMm: round(r.metrics.distanceToAxillaMaxMm, 3),
    },
  };
}

export async function generateFullChestV26() {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  mkdirSync(APPROVED, { recursive: true });

  // Geometry identity guard (§2/§7): stop on any mismatch.
  const lmRaw = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const gltf = parseGlb(GLB);
  const primitive = gltf.json.meshes[0].primitives[0];
  const posAccessor = readAccessor(gltf, primitive.attributes.POSITION);
  const idxAccessor = readAccessor(gltf, primitive.indices);
  const geometryHash = hashFloat32Canonical(posAccessor.data);
  const indexHash = hashUint32Canonical(idxAccessor.data);
  const officialManifest = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        "public/models/interaction/fields/neutro_body_v1_region_fields.json",
      ),
      "utf8",
    ),
  );
  const identity = {
    geometryHash,
    indexHash,
    vertexCount: posAccessor.count,
    landmarkSourceHash: lmRaw.sourceHash,
    matchesV25Manifest:
      officialManifest.geometryHash === geometryHash &&
      officialManifest.indexHash === indexHash &&
      officialManifest.vertexCount === posAccessor.count,
  };
  if (!identity.matchesV25Manifest) {
    throw new Error("GEOMETRY_FIELD_MISMATCH: V2.6 geometry != V2.5 manifest");
  }

  console.log("Build frozen s_surface context…");
  const ctx = buildV26Context(GLB, LANDMARKS);

  console.log("Evaluate 8 candidates…");
  const { results, survivors, finalists, scored } = evaluateAllCandidates(ctx);

  const candidates = results.map(summarizeCandidate);

  // Finalist deep checks: highlight/hit alignment + anatomical probes.
  const finalistReports = [];
  for (const id of finalists) {
    const r = results.find((x) => x.id === id);
    const align = sampleHitAlignment(
      ctx.mesh,
      ctx.lm,
      r.bounds,
      ctx.field,
      r.values,
    );
    const probes = buildHitProbes(ctx.mesh, ctx.lm, r.bounds, ctx.field, r.values);
    finalistReports.push({
      id,
      summary: summarizeCandidate(r),
      alignment: {
        interior: align.interior,
        exterior: align.exterior,
        interiorMismatch: align.interiorMismatch,
        exteriorMismatch: align.exteriorMismatch,
        bandMeters: align.bandMeters,
      },
      probes: {
        interiorPass: probes.interiorPass,
        exteriorPass: probes.exteriorPass,
        interior: probes.interiorResults,
        exterior: probes.exteriorResults,
      },
    });
  }

  // Approved = best finalist that clears alignment + probes with 0 mismatches.
  const approvedReport =
    finalistReports.find(
      (f) =>
        f.alignment.interiorMismatch === 0 &&
        f.alignment.exteriorMismatch === 0 &&
        f.probes.interiorPass &&
        f.probes.exteriorPass,
    ) ?? null;

  let approvedArtifacts = null;
  if (approvedReport) {
    const r = results.find((x) => x.id === approvedReport.id);
    const values = r.values;
    // Local boundary refinement, same as V2.5.
    const refinement = buildBoundaryRefinement(
      ctx.mesh,
      values,
      r.bounds,
      ctx.field,
    );
    const refinedCheck = validateRefinedIsoline(
      ctx.mesh,
      values,
      refinement,
      r.bounds,
      ctx.field,
    );
    const payload = encodeSnorm16(values);
    const refineBuffer = encodeRefinement(refinement);
    const fieldFile = `neutro_body_v1_full_chest_sdf_${approvedReport.id}.bin`;
    const refineFile = `neutro_body_v1_full_chest_refine_${approvedReport.id}.bin`;
    writeFileSync(path.join(APPROVED, fieldFile), payload);
    writeFileSync(path.join(APPROVED, refineFile), refineBuffer);
    const fieldHash = createHash("sha256")
      .update(payload)
      .digest("hex")
      .slice(0, 16);
    const refineHash = createHash("sha256")
      .update(refineBuffer)
      .digest("hex")
      .slice(0, 16);
    const tempManifest = {
      model: "neutro_body_v1",
      version: "2.6-candidate",
      status: "NOT_PROMOTED",
      geometryHash,
      indexHash,
      vertexCount: posAccessor.count,
      indexCount: idxAccessor.count,
      candidate: approvedReport.id,
      params: r.params,
      fields: [
        {
          regionId: REGION_ID,
          surfaceRegionId: "full_chest_surface",
          maskIndex: 9,
          geometryHash,
          indexHash,
          vertexCount: posAccessor.count,
          fieldUrl: `/models/interaction/fields/${fieldFile}`,
          fieldHash,
          encoding: "snorm16",
          distanceRangeMeters: FIELD_RANGE_M,
          refinement: {
            url: `/models/interaction/fields/${refineFile}`,
            hash: refineHash,
            triangleCount: refinement.triangles.length,
            bandMeters: REFINE_BAND_METERS,
            encoding: "u32-snorm16x3",
          },
        },
      ],
    };
    writeFileSync(
      path.join(APPROVED, "neutro_body_v1_region_fields.candidate.json"),
      `${JSON.stringify(tempManifest, null, 2)}\n`,
    );
    approvedArtifacts = {
      candidate: approvedReport.id,
      fieldFile,
      refineFile,
      fieldHash,
      refineHash,
      sidecarBytes: statSync(path.join(APPROVED, fieldFile)).size,
      refineBytes: refineBuffer.length,
      refinedTriangles: refinement.triangles.length,
      refinedPrecisionMm: {
        mean: round(refinedCheck.result.precision.mean * 1000, 3),
        p95: round(refinedCheck.result.precision.p95 * 1000, 3),
        max: round(refinedCheck.result.precision.max * 1000, 3),
      },
    };
  }

  const report = {
    version: "2.6",
    frozenFrom: "v2.5",
    regionId: REGION_ID,
    identity,
    candidateGrid: {
      infraclavicularOffsetMm: [10, 14],
      upperCenterRiseMm: [0, 3],
      inferiorCenterTransitionMm: [0, 2],
    },
    generated: results.length,
    survivors,
    discarded: results.filter((r) => !r.pass).map((r) => ({
      id: r.id,
      reasons: r.filters,
    })),
    finalists,
    ranking: scored.map((s) => ({ id: s.r.id, score: round(s.score, 3) })),
    candidates,
    finalistReports,
    approved: approvedArtifacts,
    officialMaskOverwritten: false,
    officialSidecarOverwritten: false,
    glbModified: false,
    elapsedMs: Date.now() - t0,
  };
  writeFileSync(
    path.join(OUT, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log("V26_OK", OUT);
  console.log("SURVIVORS", survivors.join(",") || "(none)");
  console.log("FINALISTS", finalists.join(",") || "(none)");
  console.log("APPROVED", approvedArtifacts?.candidate ?? "(none)");
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/generate-full-chest-v26.mjs")) {
  generateFullChestV26().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
