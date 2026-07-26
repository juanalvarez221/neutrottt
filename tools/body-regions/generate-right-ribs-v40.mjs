/**
 * Right Ribs V4.0 — generate R01–R04, stage finalists, write report.
 *
 * Never overwrites official mask / chest / abdomen sidecars / manifest.
 *
 *   node tools/body-regions/generate-right-ribs-v40.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  assertTorsoFrontFrozen,
  buildRightRibsCandidateGrid,
  buildV40Context,
  contentHash16,
  encodeRefinement,
  encodeSnorm16,
  evaluateAllRightRibsCandidates,
  FIELD_RANGE_M,
  FROZEN_B01,
  FROZEN_C07,
  FROZEN_TORSO_FRONT,
  probeRaycastField,
  sampleRibsFieldAlignment,
} from "./right-ribs-v40.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/right-ribs-v40");
const STAGED = path.join(OUT, "staged");
const APPROVED = path.join(OUT, "approved");

function round(v, d = 4) {
  return v == null ? null : +v.toFixed(d);
}

function summarize(r) {
  return {
    id: r.id,
    params: {
      posteriorCoverage: r.params.posteriorCoverage,
      waistClearanceMm: r.params.waistClearance * 1000,
    },
    pass: r.pass,
    filters: r.filters,
    components: r.region.components,
    positives: r.positives,
    stripeLike: r.stripeLike,
    leaksAfter: r.leaksAfter,
    sharedFrontMm: {
      mean: round(r.sharedDist.mean * 1000, 4),
      p95: round(r.sharedDist.p95 * 1000, 4),
      max: round(r.sharedDist.max * 1000, 4),
      gap: r.sharedDist.gap,
      overlap: r.sharedDist.overlap,
      points: r.sharedDist.points,
      pass: r.sharedDist.pass,
    },
    backSeam: r.backSeam.diagnostics,
    superior: r.superior.diagnostics,
    inferior: r.inferior.diagnostics,
    width: {
      meanMm: round(r.width.mean * 1000, 2),
      minMm: round(r.width.min * 1000, 2),
      minRatio: round(r.width.minRatio, 3),
      frontConstant: r.width.frontConstant,
      backConstant: r.width.backConstant,
      bottleneck: r.width.bottleneck,
      pass: r.width.pass,
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
    sidecarBytesEstimate: r.sidecarBytesEstimate,
  };
}

function stageCandidate(r, outDir) {
  mkdirSync(outDir, { recursive: true });
  const sidecar = encodeSnorm16(r.values);
  const fieldHash = contentHash16(sidecar);
  const refineBin = encodeRefinement(r.refinement, FIELD_RANGE_M);
  const refineHash = contentHash16(refineBin);
  writeFileSync(
    path.join(outDir, `neutro_body_v1_right_ribs_sdf_${r.id}.bin`),
    sidecar,
  );
  writeFileSync(
    path.join(outDir, `neutro_body_v1_right_ribs_refine_${r.id}.bin`),
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

const INTERIOR_PROBES = [
  { id: "under_axilla", xyz: [-0.155, 1.29, -0.05], expect: "inside" },
  { id: "costado_superior", xyz: [-0.165, 1.24, -0.06], expect: "inside" },
  { id: "costado_medio", xyz: [-0.17, 1.16, -0.07], expect: "inside" },
  { id: "costado_inferior", xyz: [-0.15, 1.11, -0.06], expect: "inside" },
  { id: "frente_lateral_pecho", xyz: [-0.13, 1.22, -0.02], expect: "inside" },
  { id: "frente_lateral_abdomen", xyz: [-0.12, 1.13, -0.02], expect: "inside" },
  { id: "posterior_lateral_int", xyz: [-0.14, 1.17, -0.12], expect: "inside" },
];

const EXTERIOR_PROBES = [
  { id: "pecho", xyz: [-0.072, 1.277, 0.029], expect: "outside" },
  { id: "abdomen", xyz: [0, 1.1, 0.025], expect: "outside" },
  { id: "brazo", xyz: [-0.28, 1.22, -0.09], expect: "outside" },
  { id: "axila_interna", xyz: [-0.1, 1.34, -0.08], expect: "outside" },
  { id: "espalda", xyz: [-0.04, 1.15, -0.19], expect: "outside" },
  { id: "cadera", xyz: [-0.14, 0.92, 0.04], expect: "outside" },
];

export function generateRightRibsV40() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, "diagnostic"), { recursive: true });
  mkdirSync(path.join(OUT, "candidates"), { recursive: true });
  mkdirSync(path.join(OUT, "finalists"), { recursive: true });
  mkdirSync(STAGED, { recursive: true });
  mkdirSync(APPROVED, { recursive: true });

  const freeze = assertTorsoFrontFrozen();
  const seamPath = path.join(OUT, "shared-front-ribs-seam.json");
  let sharedFront = null;
  if (existsSync(seamPath)) {
    sharedFront = JSON.parse(readFileSync(seamPath, "utf8"));
  }
  const ctx = buildV40Context(GLB, LANDMARKS, { sharedFront });
  writeFileSync(
    path.join(OUT, "shared-front-ribs-seam.json"),
    JSON.stringify(ctx.sharedFront, null, 2),
  );

  const sweep = evaluateAllRightRibsCandidates(ctx);
  const summaries = sweep.results.map(summarize);

  const staged = {};
  const alignments = {};
  const raycasts = {};
  for (const r of sweep.results) {
    staged[r.id] = stageCandidate(r, path.join(STAGED, "all"));
  }
  for (const id of sweep.finalists) {
    const r = sweep.results.find((x) => x.id === id);
    if (!r) continue;
    staged[id] = stageCandidate(r, STAGED);
    alignments[id] = sampleRibsFieldAlignment(
      ctx.mesh,
      r.bounds,
      ctx.field,
      r.values,
      { interior: 5000, exterior: 5000, band: 0.002 },
    );
    raycasts[id] = {
      interior: probeRaycastField(r.bounds, ctx.field, INTERIOR_PROBES),
      exterior: probeRaycastField(r.bounds, ctx.field, EXTERIOR_PROBES),
    };
    writeFileSync(
      path.join(STAGED, `candidate-${id}.json`),
      JSON.stringify(
        {
          version: "4.0",
          regionId: "right_ribs",
          surfaceRegionId: "right_ribs_surface",
          candidateId: id,
          params: r.params,
          frozenChest: FROZEN_C07,
          frozenAbdomen: FROZEN_B01,
          torsoFront: FROZEN_TORSO_FRONT,
          freeze,
          identity: ctx.identity,
          staged: staged[id],
          sharedFront: {
            seamHash: ctx.sharedFront.seamHash,
            triangleCount: ctx.sharedFront.triangleCount,
            points: ctx.sharedFront.curveOrder?.length ?? 0,
          },
          sharedDist: r.sharedDist,
          backSeam: r.backSeam.diagnostics,
          width: r.width,
          alignment: alignments[id],
          raycast: raycasts[id],
          officialAssetsOverwritten: false,
        },
        null,
        2,
      ),
    );
  }

  // Select primary: first finalist that passes technical + non-stripe.
  const selected =
    sweep.finalists.find((id) => {
      const r = sweep.results.find((x) => x.id === id);
      return r?.pass && !r.stripeLike;
    }) ??
    sweep.finalists[0] ??
    null;

  if (selected) {
    const r = sweep.results.find((x) => x.id === selected);
    const stagedMeta = stageCandidate(r, APPROVED);
    writeFileSync(
      path.join(APPROVED, "candidate.json"),
      JSON.stringify(
        {
          version: "4.0",
          regionId: "right_ribs",
          surfaceRegionId: "right_ribs_surface",
          candidateId: selected,
          params: r.params,
          staged: stagedMeta,
          freeze,
          promoted: false,
          note: "Staged only — do not promote until visual gate passes.",
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(OUT, "width-profile.json"),
      JSON.stringify(
        {
          candidateId: selected,
          diagnostics: {
            mean: r.width.mean,
            min: r.width.min,
            bottleneck: r.width.bottleneck,
            frontConstant: r.width.frontConstant,
            backConstant: r.width.backConstant,
          },
          rows: r.width.rows.map((row) => ({
            y: +row.y.toFixed(5),
            frontS: +row.frontS.toFixed(5),
            backS: +row.backS.toFixed(5),
            widthMm: +(row.widthM * 1000).toFixed(2),
          })),
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(OUT, "right-side-back-seam.json"),
      JSON.stringify(
        {
          name: r.backSeam.name,
          method: r.backSeam.method,
          coverage: r.backSeam.coverage,
          diagnostics: r.backSeam.diagnostics,
          slices: r.backSeam.slices.map((s) => ({
            y: +s.y.toFixed(5),
            s: +s.s.toFixed(5),
            fallback: !!s.fallback,
          })),
        },
        null,
        2,
      ),
    );
  }

  const report = {
    version: "4.0",
    regionId: "right_ribs",
    surfaceRegionId: "right_ribs_surface",
    torsoFrontRegression: { ...freeze, intact: freeze.intact },
    identity: ctx.identity,
    sharedFront: {
      seamHash: ctx.sharedFront.seamHash,
      triangleCount: ctx.sharedFront.triangleCount,
      curvePoints: ctx.sharedFront.curveOrder?.length ?? 0,
      sources: {
        chest: "C07.rightS",
        abdomen: "B01.rightS",
      },
    },
    grid: buildRightRibsCandidateGrid(),
    candidates: summaries,
    discarded: summaries.filter((s) => !s.pass).map((s) => s.id),
    finalists: sweep.finalists,
    selected,
    alignments,
    raycasts,
    staged,
    officialAssetsOverwritten: false,
    promoted: false,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    "RIGHT_RIBS_V40",
    JSON.stringify(
      {
        freeze,
        generated: summaries.length,
        discarded: report.discarded,
        finalists: sweep.finalists,
        selected,
        sharedFrontTris: ctx.sharedFront.triangleCount,
      },
      null,
      2,
    ),
  );
  return report;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("generate-right-ribs-v40.mjs")
) {
  generateRightRibsV40();
}
