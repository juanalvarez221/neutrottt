/**
 * Right Ribs V4.1 — diagnose and rebuild R02 with u_ribs metric GDF.
 *
 *   node tools/body-regions/generate-right-ribs-v41.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertTorsoFrontFrozen,
  buildV41Context,
  contentHash16,
  encodeRefinement,
  encodeSnorm16,
  evaluateRightRibsV41,
  FIELD_RANGE_M,
  R02,
} from "./right-ribs-v41.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/right-ribs-v41");

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

export function generateRightRibsV41() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "diagnostic"), { recursive: true });
  mkdirSync(path.join(OUT, "staged"), { recursive: true });
  mkdirSync(path.join(OUT, "final"), { recursive: true });

  const freeze = assertTorsoFrontFrozen();
  const ctx = buildV41Context(GLB, LANDMARKS);
  const result = evaluateRightRibsV41(ctx);

  writeFileSync(
    path.join(OUT, "diagnostic/04-boundary-endpoints.json"),
    JSON.stringify(
      {
        version: "4.1",
        candidateId: "R02",
        endpoints: result.loop.endpoints,
        diagnostics: result.loop.diagnostics,
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(OUT, "u-ribs-atlas.json"),
    JSON.stringify(
      {
        version: "4.1",
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
    ),
  );

  const sidecar = encodeSnorm16(result.values);
  const fieldHash = contentHash16(sidecar);
  let refineBin = Buffer.alloc(0);
  let refineHash = null;
  if (result.refinement?.triangles?.length) {
    refineBin = encodeRefinement(result.refinement, FIELD_RANGE_M);
    refineHash = contentHash16(refineBin);
    writeFileSync(
      path.join(OUT, "staged/neutro_body_v1_right_ribs_refine_R02.bin"),
      refineBin,
    );
  }
  writeFileSync(
    path.join(OUT, "staged/neutro_body_v1_right_ribs_sdf_R02.bin"),
    sidecar,
  );

  const report = {
    version: "4.1",
    regionId: "right_ribs",
    surfaceRegionId: "right_ribs_surface",
    candidateId: "R02",
    params: R02,
    torsoFrontRegression: { ...freeze, intact: freeze.intact },
    stages: result.stages,
    causes: result.causes,
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
      interior: result.rayIn,
      exterior: result.rayOut,
      posterior: result.posteriorProbe,
    },
    staged: {
      fieldHash,
      refineHash,
      sidecarBytes: sidecar.length,
      refineBytes: refineBin.length,
      totalSidecarBytes: sidecar.length + refineBin.length,
    },
    pass: result.pass,
    officialAssetsOverwritten: false,
    promoted: false,
    rejectedV40Path: "artifacts/right-ribs-v40/rejected/R02/",
  };

  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(OUT, "staged/candidate-R02.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(
    "RIGHT_RIBS_V41",
    JSON.stringify(
      {
        freeze,
        stages: result.stages,
        components: result.region.components,
        tinyIslands: result.tinyIslands,
        positives: result.stats.positives,
        isolineMm: report.refinedIsolineMm,
        posteriorU: result.posteriorProbe.results[0]?.u,
        rayIn: result.rayIn.pass,
        rayOut: result.rayOut.pass,
        pass: result.pass,
      },
      null,
      2,
    ),
  );
  return { report, result, ctx };
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-right-ribs-v41.mjs")
) {
  generateRightRibsV41();
}
