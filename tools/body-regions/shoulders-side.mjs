/**
 * Side-aware shoulders V7.0 primitives.
 *
 * BodySide = "right" | "left"
 * Never mirrors vertices / fields / sidecars between sides.
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

/** @typedef {"right"|"left"} BodySide */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

export const PIPELINE_VERSION = "V7.0";
export const SOURCE_GATE = "shoulders-v70";
export const SHOULDERS_V70_OUT = path.join(ROOT, "artifacts/shoulders-v70");

export const CANDIDATES = Object.freeze({
  SH01: { id: "SH01", deltoidInsertionOffsetMm: -6 },
  SH02: { id: "SH02", deltoidInsertionOffsetMm: 0 },
  SH03: { id: "SH03", deltoidInsertionOffsetMm: 6 },
});

/** Official freeze after Neck V6.3 promotion. */
export const OFFICIAL_NECK = Object.freeze({
  candidateId: "N02",
  neck_front: {
    fieldHash: "45583a99fef6a5d5",
  },
  neck_right: {
    fieldHash: "c7c19743eeb5d7c8",
  },
  neck_back: {
    fieldHash: "e62386ae9584c6d8",
  },
  neck_left: {
    fieldHash: "1abf594b89e37ab2",
  },
  full_neck: {
    fieldHash: "f9573effa3f0bfb1",
  },
  maskHash: "8351bbbebd6e",
});

export const GEOMETRY_IDENTITY = Object.freeze({
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
});

/**
 * @param {BodySide} side
 */
export function getShoulderSideConfig(side) {
  const isRight = side === "right";
  return Object.freeze({
    side,
    xSign: isRight ? -1 : 1,
    regionId: isRight ? "right_shoulder" : "left_shoulder",
    surfaceId: isRight ? "right_shoulder_surface" : "left_shoulder_surface",
    maskIndex: isRight ? 16 : 17,
    neckRegionId: isRight ? "neck_right" : "neck_left",
    label: isRight ? "Hombro derecho" : "Hombro izquierdo",
    description: isRight
      ? "Superficie completa del hombro derecho"
      : "Superficie completa del hombro izquierdo",
    camera: isRight ? "front-right" : "front-left",
    landmarkKeys: {
      shoulder: isRight ? "shoulderRight" : "shoulderLeft",
      elbow: isRight ? "elbowRight" : "elbowLeft",
      clavicle: isRight ? "clavicleRight" : "clavicleLeft",
      anteriorAxilla: isRight
        ? "anteriorAxillaryFoldRight"
        : "anteriorAxillaryFoldLeft",
      posteriorAxilla: isRight
        ? "posteriorAxillaryFoldRight"
        : "posteriorAxillaryFoldLeft",
    },
  });
}

export function sidePoint(lm, side, key) {
  const cfg = getShoulderSideConfig(side);
  const name = cfg.landmarkKeys[key];
  const p = lm.points[name];
  if (!p) throw new Error(`missing landmark ${name}`);
  return [...p];
}

export {
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash12,
  contentHash16,
  OFFICIAL_BACK,
  OFFICIAL_TORSO_REGIONS,
};

export function assertOfficialNeckFrozen(root = ROOT) {
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
    const fieldHash = contentHash16(fieldBuf);
    if (fieldHash !== expected.fieldHash || f.candidateId !== "N02") {
      const err = new Error("OFFICIAL_BODY_REGRESSION_DETECTED");
      err.details = { id, fieldHash, candidateId: f.candidateId };
      throw err;
    }
    if (f.refinement) {
      const err = new Error("OFFICIAL_BODY_REGRESSION_DETECTED");
      err.details = { id, reason: "unexpected neck refinement after quadrant-repair" };
      throw err;
    }
    return { fieldHash };
  };
  return {
    intact: true,
    neck_front: check("neck_front", OFFICIAL_NECK.neck_front),
    neck_right: check("neck_right", OFFICIAL_NECK.neck_right),
    neck_back: check("neck_back", OFFICIAL_NECK.neck_back),
    neck_left: check("neck_left", OFFICIAL_NECK.neck_left),
    full_neck: check("full_neck", OFFICIAL_NECK.full_neck),
    candidateId: "N02",
  };
}

export function assertOfficialBodyFrozen(root = ROOT) {
  const torso = assertOfficialTorsoWithLeftRibsFrozen(root);
  const back = assertOfficialBackFrozen(root);
  const neck = assertOfficialNeckFrozen(root);
  return {
    intact: true,
    torso,
    back,
    neck,
    geometryHash: GEOMETRY_IDENTITY.geometryHash,
    indexHash: GEOMETRY_IDENTITY.indexHash,
    vertexCount: GEOMETRY_IDENTITY.vertexCount,
    maskHash: OFFICIAL_NECK.maskHash,
  };
}

export function sha16(buf) {
  if (Buffer.isBuffer(buf) || buf instanceof Uint8Array) {
    return createHash("sha256").update(buf).digest("hex").slice(0, 16);
  }
  return createHash("sha256")
    .update(JSON.stringify(buf))
    .digest("hex")
    .slice(0, 16);
}

export function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

export function loadOfficialField(regionId, root = ROOT) {
  const buf = readFileSync(
    path.join(FIELDS, `neutro_body_v1_${regionId}_sdf.bin`),
  );
  return buf;
}
