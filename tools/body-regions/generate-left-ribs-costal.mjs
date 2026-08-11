/**
 * Left Ribs costal (V4.5) — generate L01 with side-aware u_ribs engine.
 *
 *   node tools/body-regions/generate-left-ribs-costal.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildRibsV41Context,
  contentHash16,
  encodeRefinement,
  encodeSnorm16,
  evaluateRibsV41,
  FIELD_RANGE_M,
  L01,
} from "./ribs-v41-core.mjs";
import { assertTorsoFrontFrozen } from "./right-ribs-v40.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/left-ribs-v43");

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

export function generateLeftRibsCostal() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "diagnostic"), { recursive: true });
  mkdirSync(path.join(OUT, "staged"), { recursive: true });
  mkdirSync(path.join(OUT, "approved"), { recursive: true });

  const freeze = assertTorsoFrontFrozen();
  const ctx = buildRibsV41Context("left", GLB, LANDMARKS, { params: L01 });
  const result = evaluateRibsV41(ctx);

  writeFileSync(
    path.join(OUT, "diagnostic/04-boundary-endpoints.json"),
    JSON.stringify(
      {
        version: "4.5-costal",
        candidateId: "L01",
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
        version: "4.5-costal",
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
  if (result.refinement) {
    refineBin = encodeRefinement(result.refinement);
    refineHash = contentHash16(refineBin);
    writeFileSync(
      path.join(OUT, "staged/neutro_body_v1_left_ribs_refine_L01.bin"),
      refineBin,
    );
    writeFileSync(
      path.join(OUT, "approved/neutro_body_v1_left_ribs_refine_L01.bin"),
      refineBin,
    );
  }
  writeFileSync(
    path.join(OUT, "staged/neutro_body_v1_left_ribs_sdf_L01.bin"),
    sidecar,
  );
  writeFileSync(
    path.join(OUT, "approved/neutro_body_v1_left_ribs_sdf_L01.bin"),
    sidecar,
  );

  const report = {
    version: "4.5-costal",
    regionId: "left_ribs",
    surfaceRegionId: "left_ribs_region",
    candidateId: "L01",
    params: L01,
    torsoFrontRegression: freeze,
    stages: result.stages,
    loop: {
      closedLoops: result.loop.diagnostics.closedLoops,
      maxEndpointGapMm: result.loop.diagnostics.maxEndpointGapMm,
      autoIntersections: result.loop.diagnostics.autoIntersections,
      inverted: result.loop.diagnostics.inverted,
      pass: result.loop.diagnostics.pass,
    },
    endpoints: result.loop.endpoints,
    uRibs: result.uDiag,
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
  };

  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(OUT, "staged/candidate-L01.json"),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    path.join(OUT, "approved/candidate-L01.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(
    "LEFT_RIBS_COSTAL",
    JSON.stringify(
      {
        freeze,
        stages: result.stages,
        components: result.region.components,
        tinyIslands: result.tinyIslands,
        positives: result.stats.positives,
        isolineMm: report.refinedIsolineMm,
        yBot: result.atlas.yBot,
        yTop: result.atlas.yTop,
        rayIn: result.rayIn.pass,
        rayOut: result.rayOut.pass,
        pass: result.pass,
        fieldHash,
        refineHash,
      },
      null,
      2,
    ),
  );
  return { report, result, ctx };
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-left-ribs-costal.mjs")
) {
  generateLeftRibsCostal();
}
