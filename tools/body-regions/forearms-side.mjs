/**
 * Side-aware Forearms V9.0 primitives.
 *
 * BodySide = "right" | "left"
 * Never mirrors vertices / fields / sidecars between sides.
 *
 * Canonical public IDs (repo):
 *   right_forearm_inner_region / right_forearm_outer_region / right_forearm
 *   left_forearm_inner_region  / left_forearm_outer_region  / left_forearm
 * Conceptual aliases (brief):
 *   right_inner_forearm → right_forearm_inner_region, etc.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash12,
  contentHash16,
  OFFICIAL_BACK,
  OFFICIAL_TORSO_REGIONS,
} from "./neck-v60-core.mjs";
import {
  assertOfficialNeckFrozen,
  OFFICIAL_NECK,
  GEOMETRY_IDENTITY,
  loadOfficialField,
  sha16,
  sha12,
  sidePoint,
} from "./shoulders-side.mjs";
import {
  assertOfficialShouldersFrozen,
  assertOfficialBodyFrozen as assertUpperArmsBodyFrozen,
  OFFICIAL_SHOULDERS,
  getUpperArmSideConfig,
  getUpperArmTargetConfig,
} from "./upper-arms-side.mjs";

/** @typedef {"right"|"left"} BodySide */
/** @typedef {"inner"|"outer"|"forearm"} ForearmTargetKind */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

export const PIPELINE_VERSION = "V9.0";
export const SOURCE_GATE = "forearms-v90";
export const FOREARMS_V90_OUT = path.join(ROOT, "artifacts/forearms-v90");

export const CANDIDATES = Object.freeze({
  FA01: { id: "FA01", innerBandOffsetMm: -4 },
  FA02: { id: "FA02", innerBandOffsetMm: 0 },
  FA03: { id: "FA03", innerBandOffsetMm: 4 },
});

/** Official freeze after Upper Arms V8.0 promotion. */
export const OFFICIAL_UPPER_ARMS = Object.freeze({
  candidateId: "UA02",
  right_biceps_region: {
    fieldHash: "06cd4a99cc149e0c",
    refinementHash: "2f814a76008087c7",
  },
  right_triceps_region: {
    fieldHash: "69eccf8116f61a1c",
    refinementHash: "fb16852adab02c60",
  },
  right_upper_arm: {
    fieldHash: "9ba461332242346a",
    refinementHash: "69bb7ba512022f76",
  },
  left_biceps_region: {
    fieldHash: "b01de8aa7bd86841",
    refinementHash: "8939342dea90c8c1",
  },
  left_triceps_region: {
    fieldHash: "0db8d34c26c306aa",
    refinementHash: "161bf01daf9837f0",
  },
  left_upper_arm: {
    fieldHash: "345e104eed76ee18",
    refinementHash: "cd3c73a4993014f7",
  },
  maskHash: "e0580d10c901",
  maskHashPrev: "b6894a5ed2b7",
  proximalSeamHashes: {
    right: "c99c05240fbd7ab9",
    left: "68bbd1ab1d20f7a2",
  },
});

export {
  GEOMETRY_IDENTITY,
  OFFICIAL_NECK,
  OFFICIAL_BACK,
  OFFICIAL_TORSO_REGIONS,
  OFFICIAL_SHOULDERS,
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialNeckFrozen,
  assertOfficialShouldersFrozen,
  contentHash12,
  contentHash16,
  getUpperArmSideConfig,
  getUpperArmTargetConfig,
  loadOfficialField,
  sha16,
  sha12,
  sidePoint,
};

/**
 * @param {BodySide} side
 * @param {ForearmTargetKind} kind
 */
export function getForearmTargetConfig(side, kind) {
  const isRight = side === "right";
  const L = isRight ? "derecho" : "izquierdo";
  if (kind === "inner") {
    return Object.freeze({
      side,
      kind,
      regionId: `${side}_forearm_inner_region`,
      surfaceId: `${side}_forearm_inner_surface`,
      maskIndex: isRight ? 22 : 23,
      fileStem: `${side}_forearm_inner`,
      label: `Antebrazo interno ${L}`,
      description: `Superficie interna del antebrazo ${L}`,
      camera: isRight ? "front-right" : "front-left",
      hitVisualRegionIds: null,
    });
  }
  if (kind === "outer") {
    return Object.freeze({
      side,
      kind,
      regionId: `${side}_forearm_outer_region`,
      surfaceId: `${side}_forearm_outer_surface`,
      maskIndex: isRight ? 24 : 25,
      fileStem: `${side}_forearm_outer`,
      label: `Antebrazo externo ${L}`,
      description: `Superficie externa del antebrazo ${L}`,
      camera: isRight ? "back-right" : "back-left",
      hitVisualRegionIds: null,
    });
  }
  return Object.freeze({
    side,
    kind: "forearm",
    regionId: `${side}_forearm`,
    surfaceId: null,
    maskIndex: null,
    fileStem: `${side}_forearm`,
    label: `Antebrazo completo ${L}`,
    description: `Superficie completa del antebrazo ${L}`,
    camera: isRight ? "front-right" : "front-left",
    hitVisualRegionIds: [
      `${side}_forearm_inner_surface`,
      `${side}_forearm_outer_surface`,
    ],
  });
}

/**
 * @param {BodySide} side
 */
export function getForearmSideConfig(side) {
  const isRight = side === "right";
  return Object.freeze({
    side,
    xSign: isRight ? -1 : 1,
    upperArmRegionId: `${side}_upper_arm`,
    bicepsRegionId: `${side}_biceps_region`,
    tricepsRegionId: `${side}_triceps_region`,
    inner: getForearmTargetConfig(side, "inner"),
    outer: getForearmTargetConfig(side, "outer"),
    forearm: getForearmTargetConfig(side, "forearm"),
    landmarkKeys: {
      elbow: isRight ? "elbowRight" : "elbowLeft",
      wrist: isRight ? "wristRight" : "wristLeft",
      shoulder: isRight ? "shoulderRight" : "shoulderLeft",
    },
  });
}

export function assertOfficialUpperArmsFrozen(root = ROOT) {
  const fieldsDir = path.join(root, "public/models/interaction/fields");
  const manifest = JSON.parse(
    readFileSync(path.join(fieldsDir, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const byId = Object.fromEntries(manifest.fields.map((f) => [f.regionId, f]));
  const check = (id, expected) => {
    const f = byId[id];
    if (!f) throw new Error(`OFFICIAL_BODY_REGRESSION_DETECTED:missing:${id}`);
    const fieldBuf = readFileSync(
      path.join(fieldsDir, path.basename(f.fieldUrl.split("?")[0])),
    );
    const refineBuf = readFileSync(
      path.join(fieldsDir, path.basename(f.refinement.url.split("?")[0])),
    );
    const fieldHash = contentHash16(fieldBuf);
    const refinementHash = contentHash16(refineBuf);
    if (
      fieldHash !== expected.fieldHash ||
      refinementHash !== expected.refinementHash ||
      f.candidateId !== "UA02"
    ) {
      const err = new Error("OFFICIAL_BODY_REGRESSION_DETECTED");
      err.details = { id, fieldHash, refinementHash, candidateId: f.candidateId };
      throw err;
    }
    return { fieldHash, refinementHash };
  };
  const ids = [
    "right_biceps_region",
    "right_triceps_region",
    "right_upper_arm",
    "left_biceps_region",
    "left_triceps_region",
    "left_upper_arm",
  ];
  const out = { intact: true, candidateId: "UA02" };
  for (const id of ids) {
    out[id] = check(id, OFFICIAL_UPPER_ARMS[id]);
  }
  return out;
}

/** Full official freeze including upper arms UA02. */
export function assertOfficialBodyFrozen(root = ROOT) {
  const base = assertUpperArmsBodyFrozen(root);
  const upperArms = assertOfficialUpperArmsFrozen(root);
  return {
    ...base,
    upperArms,
    maskHash: OFFICIAL_UPPER_ARMS.maskHash,
  };
}

export const CANONICAL_ID_MAP = Object.freeze({
  conceptual: {
    right_inner_forearm: "right_forearm_inner_region",
    right_outer_forearm: "right_forearm_outer_region",
    right_forearm: "right_forearm",
    left_inner_forearm: "left_forearm_inner_region",
    left_outer_forearm: "left_forearm_outer_region",
    left_forearm: "left_forearm",
  },
  visualSurfaces: {
    right_forearm_inner_surface: { maskIndex: 22 },
    left_forearm_inner_surface: { maskIndex: 23 },
    right_forearm_outer_surface: { maskIndex: 24 },
    left_forearm_outer_surface: { maskIndex: 25 },
  },
  aliases: {
    right_lower_half_sleeve: "right_forearm",
    left_lower_half_sleeve: "left_forearm",
    right_forearm_inner: "right_forearm_inner_region",
    right_forearm_outer: "right_forearm_outer_region",
    right_forearm_complete: "right_forearm",
    left_forearm_inner: "left_forearm_inner_region",
    left_forearm_outer: "left_forearm_outer_region",
    left_forearm_complete: "left_forearm",
    right_inner_lower_arm: "right_forearm_inner_region",
    right_outer_lower_arm: "right_forearm_outer_region",
    left_inner_lower_arm: "left_forearm_inner_region",
    left_outer_lower_arm: "left_forearm_outer_region",
  },
  noCreate: [
    "right_forearm_surface",
    "left_forearm_surface",
    "full_forearms",
    "both_forearms",
    "forearm_pair",
    "elbow",
    "right_elbow",
    "left_elbow",
    "wrist",
    "right_wrist",
    "left_wrist",
  ],
});
