/**
 * Extract shared shoulder seams only — arm insertion loop plus the
 * shoulder-adjacent segments of the frozen neck / full_chest / upper_back
 * frontiers — for SH02 (anatomical baseline, deltoid offset 0 mm), both
 * sides. Thin CLI wrapper around `buildShoulderContext`; does not evaluate
 * or package fields, does not touch masks, does not write approved bins or
 * the region-fields manifest.
 *
 *   node tools/body-regions/extract-shoulder-seams.mjs
 */
import path from "node:path";
import {
  buildShoulderContext,
  CANDIDATES,
  assertOfficialBodyFrozen,
  SHOULDERS_V70_OUT,
} from "./shoulders-v70-core.mjs";
import { SIDES, writeSideSeams } from "./generate-shoulders-v70.mjs";

const OUT_DIR = path.join(SHOULDERS_V70_OUT, "shared-seams");

export function extractShoulderSeams() {
  const freeze = assertOfficialBodyFrozen();
  const written = {};
  for (const side of SIDES) {
    const ctx = buildShoulderContext(side, CANDIDATES.SH02, { freeze });
    written[side] = writeSideSeams(OUT_DIR, side, {
      neck: ctx.neckSeam,
      chest: ctx.chestSeam,
      back: ctx.backSeam,
      arm: ctx.armSeam,
    });
    console.log(
      `[extract-shoulder-seams] ${side}: arm=${ctx.armSeam.points.length}pts neck=${ctx.neckSeam.matchedCount}pts chest=${ctx.chestSeam.matchedCount}pts back=${ctx.backSeam.matchedCount}pts`,
    );
  }
  console.log(
    `[extract-shoulder-seams] OK maskHash=${freeze.maskHash} out=${OUT_DIR}`,
  );
  return written;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("extract-shoulder-seams.mjs")
) {
  extractShoulderSeams();
}
