/**
 * Extract the shared anterior left-ribs seam from official C07 + B01 laterals.
 *
 * Reads the frozen chest/abdomen sidecars and writes only into
 * artifacts/left-ribs-v43/. Never promotes or mutates official assets.
 *
 *   node tools/body-regions/extract-left-ribs-front-seam.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertOfficialTorsoRegionsFrozen,
  buildRibsV41Context,
  extractSharedFrontRibsSeam,
  measureSharedFrontSeamSide,
} from "./ribs-v41-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/left-ribs-v43");

export function extractAndWriteSharedFrontLeftRibsSeam(ctx = null) {
  mkdirSync(OUT, { recursive: true });
  const freeze = assertOfficialTorsoRegionsFrozen();
  const context = ctx ?? buildRibsV41Context("left", GLB, LANDMARKS, { freeze });
  const seam = extractSharedFrontRibsSeam(context, "left");
  const measurement = measureSharedFrontSeamSide(
    context.sharedFrontBuilder,
    context.chestBounds,
    context.abdomenBounds,
    context.field,
    context.inferior.yEnd,
    Math.min(
      context.superior.yMax,
      context.chestBounds.meta?.clavY ?? context.superior.yMax,
    ),
    "left",
  );
  const payload = {
    ...seam,
    measurement: {
      meanMm: +(measurement.mean * 1000).toFixed(6),
      p95Mm: +(measurement.p95 * 1000).toFixed(6),
      maxMm: +(measurement.max * 1000).toFixed(6),
      gap: measurement.gap,
      overlap: measurement.overlap,
      points: measurement.points,
      source: measurement.source,
      pass: measurement.pass,
    },
    freeze,
  };
  const outFile = path.join(OUT, "shared-front-left-ribs-seam.json");
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    "LEFT_FRONT_SEAM_EXTRACTED",
    JSON.stringify({
      name: seam.name,
      triangles: seam.triangleCount,
      curvePoints: seam.curveOrder.length,
      seamHash: seam.seamHash,
      measurement: payload.measurement,
      maskHash: freeze.maskHash,
      outFile,
    }),
  );
  return { seam: payload, ctx: context, measurement };
}

if (
  process.argv[1] &&
  process.argv[1]
    .replace(/\\/g, "/")
    .endsWith("extract-left-ribs-front-seam.mjs")
) {
  extractAndWriteSharedFrontLeftRibsSeam();
}
