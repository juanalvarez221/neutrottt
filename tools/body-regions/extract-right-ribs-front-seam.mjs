/**
 * Extract shared anterior right-ribs seam from official C07 + B01 laterals.
 *
 *   node tools/body-regions/extract-right-ribs-front-seam.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertTorsoFrontFrozen,
  buildV40Context,
  extractSharedFrontRibsSeam,
} from "./right-ribs-v40.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const OUT = path.join(ROOT, "artifacts/right-ribs-v40");

export function extractAndWriteSharedFrontRibsSeam() {
  mkdirSync(OUT, { recursive: true });
  const freeze = assertTorsoFrontFrozen();
  const ctx = buildV40Context(GLB, LANDMARKS, { sharedFront: null });
  // buildV40Context already extracts; rewrite explicitly for clarity.
  const seam = extractSharedFrontRibsSeam(ctx);
  const outFile = path.join(OUT, "shared-front-ribs-seam.json");
  writeFileSync(outFile, JSON.stringify(seam, null, 2));
  console.log(
    "FRONT_SEAM_EXTRACTED",
    JSON.stringify({
      triangles: seam.triangleCount,
      curvePoints: seam.curveOrder.length,
      seamHash: seam.seamHash,
      freeze,
      outFile,
    }),
  );
  return seam;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("extract-right-ribs-front-seam.mjs")
) {
  extractAndWriteSharedFrontRibsSeam();
}
