/**
 * Side-aware Upper Arms V8.0 primitives.
 *
 * BodySide = "right" | "left"
 * Never mirrors vertices / fields / sidecars between sides.
 *
 * Canonical public IDs (repo):
 *   right_biceps_region / right_triceps_region / right_upper_arm
 *   left_biceps_region  / left_triceps_region  / left_upper_arm
 * Conceptual aliases (brief): right_biceps → right_biceps_region, etc.
 */
import { createHash } from "node:crypto";
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
  assertOfficialBodyFrozen as assertShouldersBodyFrozen,
  OFFICIAL_NECK,
  GEOMETRY_IDENTITY,
  getShoulderSideConfig,
  loadOfficialField,
  sha16,
  sha12,
  sidePoint,
} from "./shoulders-side.mjs";

/** @typedef {"right"|"left"} BodySide */
/** @typedef {"biceps"|"triceps"|"upper_arm"} ArmTargetKind */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

export const PIPELINE_VERSION = "V8.0";
export const SOURCE_GATE = "upper-arms-v80";
export const UPPER_ARMS_V80_OUT = path.join(ROOT, "artifacts/upper-arms-v80");

export const CANDIDATES = Object.freeze({
  UA01: { id: "UA01", bicepsBandOffsetMm: -4 },
  UA02: { id: "UA02", bicepsBandOffsetMm: 0 },
  UA03: { id: "UA03", bicepsBandOffsetMm: 4 },
});

/** Official freeze after Shoulders V7.0 promotion. */
export const OFFICIAL_SHOULDERS = Object.freeze({
  candidateId: "SH02",
  right_shoulder: {
    fieldHash: "b213189a4f6b6d27",
    refinementHash: "7fa63f0a95d7a90d",
  },
  left_shoulder: {
    fieldHash: "6cec9beae6491233",
    refinementHash: "424bbcb6edb04649",
  },
  maskHash: "b6894a5ed2b7",
  maskHashPrev: "b0f32714bfc1",
  upperArmBoundary: {
    right: "f603092bdd3ac2e3",
    left: "2d3072c92f3d666e",
  },
});

export {
  GEOMETRY_IDENTITY,
  OFFICIAL_NECK,
  OFFICIAL_BACK,
  OFFICIAL_TORSO_REGIONS,
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialNeckFrozen,
  contentHash12,
  contentHash16,
  getShoulderSideConfig,
  loadOfficialField,
  sha16,
  sha12,
  sidePoint,
};

/**
 * @param {BodySide} side
 * @param {ArmTargetKind} kind
 */
export function getUpperArmTargetConfig(side, kind) {
  const isRight = side === "right";
  const L = isRight ? "derecho" : "izquierdo";
  const La = isRight ? "derecha" : "izquierda";
  if (kind === "biceps") {
    return Object.freeze({
      side,
      kind,
      regionId: `${side}_biceps_region`,
      surfaceId: `${side}_biceps_surface`,
      maskIndex: isRight ? 18 : 19,
      fileStem: `${side}_biceps`,
      label: `Bíceps ${L}`,
      description: `Superficie anterior del brazo superior ${L}`,
      camera: isRight ? "front-right" : "front-left",
      hitVisualRegionIds: null,
    });
  }
  if (kind === "triceps") {
    return Object.freeze({
      side,
      kind,
      regionId: `${side}_triceps_region`,
      surfaceId: `${side}_triceps_surface`,
      maskIndex: isRight ? 20 : 21,
      fileStem: `${side}_triceps`,
      label: `Tríceps ${L}`,
      description: `Superficie posterior del brazo superior ${L}`,
      camera: isRight ? "back-right" : "back-left",
      hitVisualRegionIds: null,
    });
  }
  return Object.freeze({
    side,
    kind: "upper_arm",
    regionId: `${side}_upper_arm`,
    surfaceId: null,
    maskIndex: null,
    fileStem: `${side}_upper_arm`,
    label: `Brazo superior ${L}`,
    description: `Superficie completa del brazo superior ${isRight ? "derecho" : "izquierdo"}`,
    camera: isRight ? "front-right" : "front-left",
    hitVisualRegionIds: [
      `${side}_biceps_surface`,
      `${side}_triceps_surface`,
    ],
  });
}

/**
 * @param {BodySide} side
 */
export function getUpperArmSideConfig(side) {
  const isRight = side === "right";
  return Object.freeze({
    side,
    xSign: isRight ? -1 : 1,
    shoulderRegionId: isRight ? "right_shoulder" : "left_shoulder",
    shoulderMaskIndex: isRight ? 16 : 17,
    biceps: getUpperArmTargetConfig(side, "biceps"),
    triceps: getUpperArmTargetConfig(side, "triceps"),
    upperArm: getUpperArmTargetConfig(side, "upper_arm"),
    landmarkKeys: {
      shoulder: isRight ? "shoulderRight" : "shoulderLeft",
      elbow: isRight ? "elbowRight" : "elbowLeft",
      wrist: isRight ? "wristRight" : "wristLeft",
    },
  });
}

export function assertOfficialShouldersFrozen(root = ROOT) {
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
      f.candidateId !== "SH02"
    ) {
      const err = new Error("OFFICIAL_BODY_REGRESSION_DETECTED");
      err.details = { id, fieldHash, refinementHash, candidateId: f.candidateId };
      throw err;
    }
    return { fieldHash, refinementHash };
  };
  return {
    intact: true,
    right_shoulder: check("right_shoulder", OFFICIAL_SHOULDERS.right_shoulder),
    left_shoulder: check("left_shoulder", OFFICIAL_SHOULDERS.left_shoulder),
    candidateId: "SH02",
  };
}

/** Full official freeze including shoulders SH02. */
export function assertOfficialBodyFrozen(root = ROOT) {
  const base = assertShouldersBodyFrozen(root);
  const shoulders = assertOfficialShouldersFrozen(root);
  return {
    ...base,
    shoulders,
    maskHash: OFFICIAL_SHOULDERS.maskHash,
  };
}

export const CANONICAL_ID_MAP = Object.freeze({
  conceptual: {
    right_biceps: "right_biceps_region",
    right_triceps: "right_triceps_region",
    right_upper_arm: "right_upper_arm",
    left_biceps: "left_biceps_region",
    left_triceps: "left_triceps_region",
    left_upper_arm: "left_upper_arm",
  },
  visualSurfaces: {
    right_biceps_surface: { maskIndex: 18 },
    left_biceps_surface: { maskIndex: 19 },
    right_triceps_surface: { maskIndex: 20 },
    left_triceps_surface: { maskIndex: 21 },
  },
  aliases: {
    right_upper_half_sleeve: "right_upper_arm",
    left_upper_half_sleeve: "left_upper_arm",
    bicep_right: "right_biceps_region",
    tricep_right: "right_triceps_region",
    upper_arm_front: "biceps_region",
    upper_arm_back: "triceps_region",
  },
  noCreate: [
    "right_upper_arm_surface",
    "left_upper_arm_surface",
    "full_upper_arms",
    "both_upper_arms",
    "arm_pair",
    "elbow",
    "right_elbow",
    "left_elbow",
  ],
});
