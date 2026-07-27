/**
 * Right Ribs V4.1 — compatibility layer over the side-aware ribs engine.
 *
 * The u_ribs atlas, metric GDF and stage gates now live in ribs-v41-core.mjs
 * so right_ribs and left_ribs share one implementation. This module keeps the
 * historical right-only export names bound to side === "right".
 */
import path from "node:path";
import {
  buildRibsV41Context,
  evaluateRibsV41,
  extractRibsArc,
} from "./ribs-v41-core.mjs";
import {
  assertTorsoFrontFrozen,
  FROZEN_B01,
  FROZEN_TORSO_FRONT,
} from "./right-ribs-v40.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

export {
  backSeamFromSlices,
  buildBoundaryLoop,
  buildExclusions,
  buildInteriorProbes,
  buildURibsAtlas,
  buildV41VertexField,
  contentHash12,
  contentHash16,
  countTinyIslands,
  encodeRefinement,
  encodeSnorm16,
  evaluateRibsV41,
  extractRibsArc,
  FIELD_RANGE_M,
  FROZEN_C07,
  L01,
  loadR02BackSeam,
  measureSurfaceMetrics,
  OFFICIAL_CHEST_HASHES,
  OFFICIAL_TORSO_REGIONS,
  probeRaycast,
  PROBES_OUT,
  queryURibs,
  R02,
  ribsStrictlyResolved,
  ribsV41SignedDistance,
  sampleAtlasPoint,
  sampleV41FieldAlignment,
  sideLandmark,
  validateURibsField,
  assertOfficialTorsoRegionsFrozen,
  buildRibsV41Context,
} from "./ribs-v41-core.mjs";

export { assertTorsoFrontFrozen, FROZEN_B01, FROZEN_TORSO_FRONT };

/** Right-only context builder (frozen R02 posterior seam). */
export function buildV41Context(glbPath, landmarksPath, opts = {}) {
  return buildRibsV41Context("right", glbPath, landmarksPath, {
    ...opts,
    root: opts.root ?? ROOT,
  });
}

/** Right-only stage A–D evaluation. */
export function evaluateRightRibsV41(ctx) {
  return evaluateRibsV41(ctx);
}

/** Right-only lateral arc extraction. */
export function extractRightRibsArc(pts, y, field, frontS, backS, lm) {
  return extractRibsArc(pts, y, field, frontS, backS, lm, "right");
}
