/**
 * Promote Neck V6.3 → official assets.
 *
 * Source: artifacts/neck-v63/approved/
 * Freezes C07/B01/V4.1/L01/S02 bit-identical.
 * Does NOT create full_neck_surface. Does NOT commit/push/merge.
 *
 *   node tools/body-regions/promote-neck-v63.mjs
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  assertOfficialBackFrozen,
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  expectedOfficialHashes,
  FIELD_RANGE_M,
  SURFACE_IDS,
  EXPECTED_SEAM_HASHES,
  CANDIDATE_ID,
  PIPELINE_VERSION,
} from "./neck-v63-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPROVED = path.join(ROOT, "artifacts/neck-v63/approved");
const MASKS = path.join(ROOT, "artifacts/neck-v63/masks");
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const AUTHORING_MASK = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const MASK_MANIFEST = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);

const REGIONS = [
  "neck_front",
  "neck_right",
  "neck_back",
  "neck_left",
  "full_neck",
];
const PARTIALS = ["neck_front", "neck_right", "neck_back", "neck_left"];
const NECK_MASK_INDEX = {
  neck_front: 5,
  neck_back: 6,
  neck_left: 7,
  neck_right: 8,
};

function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

function main() {
  if (!existsSync(path.join(APPROVED, "hashes.json"))) {
    throw new Error("MISSING_APPROVED: run generate-neck-v63.mjs first");
  }
  const report = JSON.parse(
    readFileSync(path.join(ROOT, "artifacts/neck-v63/report.json"), "utf8"),
  );
  if (!report.approved || !report.canPromoteOfficially) {
    throw new Error("NOT_APPROVED");
  }

  assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  assertOfficialBackFrozen(ROOT);
  const expected = expectedOfficialHashes();
  const hashes = JSON.parse(
    readFileSync(path.join(APPROVED, "hashes.json"), "utf8"),
  );

  // Copy sidecars
  for (const region of REGIONS) {
    const sdfSrc = path.join(APPROVED, `${region}_sdf.bin`);
    const refSrc = path.join(APPROVED, `${region}_refine.bin`);
    const sdfDst = path.join(FIELDS_DIR, `neutro_body_v1_${region}_sdf.bin`);
    const refDst = path.join(FIELDS_DIR, `neutro_body_v1_${region}_refine.bin`);
    copyFileSync(sdfSrc, sdfDst);
    copyFileSync(refSrc, refDst);
    const fh = contentHash16(readFileSync(sdfDst));
    const rh = contentHash16(readFileSync(refDst));
    if (
      fh !== hashes.regions[region].fieldHash ||
      rh !== hashes.regions[region].refineHash
    ) {
      throw new Error(`HASH_MISMATCH_ON_COPY:${region}`);
    }
    const total =
      readFileSync(sdfDst).byteLength + readFileSync(refDst).byteLength;
    if (total / 1024 > 45) {
      throw new Error(`SIDECAR_BUDGET:${region}:${total}`);
    }
    console.log(
      `[promote] ${region} field=${fh} refine=${rh} kb=${(total / 1024).toFixed(2)}`,
    );
  }

  // Update mask if V6.3 raster exists
  let maskHash = expected.maskHash;
  const newMask = path.join(MASKS, "neutro_body_v1_anatomical_region_ids.png");
  if (existsSync(newMask)) {
    copyFileSync(newMask, RUNTIME_MASK);
    if (existsSync(path.join(MASKS, "neutro_body_v1_anatomical_regions_authoring.png"))) {
      copyFileSync(
        path.join(MASKS, "neutro_body_v1_anatomical_regions_authoring.png"),
        AUTHORING_MASK,
      );
    }
    maskHash = sha12(readFileSync(RUNTIME_MASK));
    console.log(`[promote] maskHash ${expected.maskHash} → ${maskHash}`);

    // Update mask manifests
    if (existsSync(MASK_MANIFEST)) {
      const mm = JSON.parse(readFileSync(MASK_MANIFEST, "utf8"));
      mm.maskHash = maskHash;
      mm.maskUrl = `/models/interaction/neutro_body_v1_anatomical_region_ids.png?v=${maskHash}`;
      writeFileSync(MASK_MANIFEST, JSON.stringify(mm, null, 2) + "\n");
    }
    if (existsSync(MASK_JSON)) {
      const mj = JSON.parse(readFileSync(MASK_JSON, "utf8"));
      mj.maskHash = maskHash;
      writeFileSync(MASK_JSON, JSON.stringify(mj, null, 2) + "\n");
    }
  }

  // Patch region fields manifest — append neck entries only
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const existing = new Set(manifest.fields.map((f) => f.regionId));
  for (const region of REGIONS) {
    if (existing.has(region)) {
      // replace in place
      manifest.fields = manifest.fields.filter((f) => f.regionId !== region);
    }
  }

  for (const region of REGIONS) {
    const r = hashes.regions[region];
    const entry = {
      regionId: region,
      geometryHash: hashes.geometryHash,
      indexHash: hashes.indexHash,
      vertexCount: hashes.vertexCount,
      fieldUrl: `/models/interaction/fields/neutro_body_v1_${region}_sdf.bin?v=${r.fieldHash}`,
      fieldHash: r.fieldHash,
      encoding: "snorm16",
      distanceRangeMeters: FIELD_RANGE_M,
      candidateId: CANDIDATE_ID,
      anatomicalParameters: {
        lateralBandOffsetMm: 0,
        sourceGate: "neck-v63",
        pipelineVersion: PIPELINE_VERSION,
      },
      boundaryHashes: EXPECTED_SEAM_HASHES,
      refinement: {
        url: `/models/interaction/fields/neutro_body_v1_${region}_refine.bin?v=${r.refineHash}`,
        hash: r.refineHash,
        triangleCount: Math.floor(r.refineBytes / (r.encoding === "u32-t16-snorm16x3" ? 16 : 10)),
        bandMeters: 0.005,
        encoding: r.encoding,
      },
    };
    if (PARTIALS.includes(region)) {
      entry.visualRegionId = SURFACE_IDS[region];
      entry.surfaceRegionId = SURFACE_IDS[region];
      entry.maskIndex = NECK_MASK_INDEX[region];
    } else {
      entry.hitVisualRegionIds = [
        "neck_front_surface",
        "neck_right_surface",
        "neck_back_surface",
        "neck_left_surface",
      ];
    }
    manifest.fields.push(entry);
  }

  // Bump version
  manifest.version = "6.3";
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  // Re-assert torso field bins bit-identical (mask hash updated for neck surfaces)
  assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  // Back fields only — maskHash already advanced to neck V6.3
  {
    const fieldsDir = path.join(ROOT, "public/models/interaction/fields");
    const manifestCheck = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const byId = Object.fromEntries(
      manifestCheck.fields.map((f) => [f.regionId, f]),
    );
    for (const [id, exp] of [
      ["upper_back", expected.upper_back],
      ["lower_back", expected.lower_back],
      ["full_back", expected.full_back],
    ]) {
      const f = byId[id];
      const fieldHash = contentHash16(
        readFileSync(path.join(fieldsDir, path.basename(f.fieldUrl.split("?")[0]))),
      );
      const refinementHash = contentHash16(
        readFileSync(
          path.join(fieldsDir, path.basename(f.refinement.url.split("?")[0])),
        ),
      );
      if (
        fieldHash !== exp.fieldHash ||
        refinementHash !== exp.refinementHash
      ) {
        throw new Error(`OFFICIAL_BODY_REGRESSION_DETECTED:${id}`);
      }
    }
  }

  // Verify no full_neck_surface
  const text = readFileSync(MANIFEST, "utf8");
  if (text.includes("full_neck_surface")) {
    throw new Error("FULL_NECK_SURFACE_CREATED");
  }

  const out = {
    promoted: true,
    candidateId: CANDIDATE_ID,
    pipelineVersion: PIPELINE_VERSION,
    maskHashPrev: expected.maskHash,
    maskHashNew: maskHash,
    regions: Object.fromEntries(
      REGIONS.map((r) => [
        r,
        {
          fieldHash: hashes.regions[r].fieldHash,
          refineHash: hashes.regions[r].refineHash,
          encoding: hashes.regions[r].encoding,
          isoline: hashes.regions[r].isoline,
        },
      ]),
    ),
    commit: false,
    push: false,
    merge: false,
  };
  mkdirSync(path.join(ROOT, "artifacts/neck-v63"), { recursive: true });
  writeFileSync(
    path.join(ROOT, "artifacts/neck-v63/promote-report.json"),
    JSON.stringify(out, null, 2),
  );
  console.log("[promote] OK — official neck regions written (no commit)");
}

main();
