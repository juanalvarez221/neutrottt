/**
 * Promote Shoulders V7.0 → official assets.
 *
 * Source: artifacts/shoulders-v70/approved/ (requires report.json with
 * canPromoteOfficially === true). Re-asserts the chest/abdomen/ribs (torso),
 * back and neck freezes BIT-IDENTICAL before writing anything. Appends
 * `right_shoulder` / `left_shoulder` to the region-fields manifest without
 * touching any existing entry. Does NOT commit/push/merge.
 *
 *   node tools/body-regions/promote-shoulders-v70.mjs
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
import sharp from "sharp";
import {
  PIPELINE_VERSION,
  SOURCE_GATE,
  SHOULDERS_V70_OUT,
  assertOfficialBodyFrozen,
  getShoulderSideConfig,
  contentHash16,
  loadMeshData,
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./shoulders-v70-core.mjs";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialNeckFrozen,
  OFFICIAL_BACK,
} from "./shoulders-side.mjs";
import {
  loadRuntimeMask,
  rasterizeShoulderSurfaces,
  SIDES,
} from "./generate-shoulders-v70.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const OUT = SHOULDERS_V70_OUT;
const APPROVED = path.join(OUT, "approved");
const MASKS = path.join(OUT, "masks");
const BACKUPS = path.join(OUT, "backups");
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

function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

function backupIfPresent(src, name) {
  if (!existsSync(src)) return null;
  mkdirSync(BACKUPS, { recursive: true });
  const dest = path.join(BACKUPS, name);
  if (existsSync(dest)) return dest;
  copyFileSync(src, dest);
  return dest;
}

async function main() {
  const reportPath = path.join(OUT, "report.json");
  const hashesPath = path.join(APPROVED, "hashes.json");
  if (!existsSync(reportPath) || !existsSync(hashesPath)) {
    throw new Error("MISSING_APPROVED: run generate-shoulders-v70.mjs first");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!report.approved || !report.canPromoteOfficially) {
    throw new Error("NOT_APPROVED");
  }
  const hashes = JSON.parse(readFileSync(hashesPath, "utf8"));
  const selectedCandidate = hashes.candidateId;

  // --- 1. Re-assert freeze of ALL prior official regions BEFORE writing ---
  const freezePre = assertOfficialBodyFrozen(ROOT);
  console.log(
    `[promote-shoulders-v70] pre-write freeze OK maskHash=${freezePre.maskHash}`,
  );

  mkdirSync(BACKUPS, { recursive: true });
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(
    AUTHORING_MASK,
    "neutro_body_v1_anatomical_regions_authoring.png",
  );
  backupIfPresent(MASK_MANIFEST, "publicRegionMaskManifest.json");
  backupIfPresent(MASK_JSON, "neutro_body_v1_anatomical_region_ids.json");

  // --- 2. Copy approved sidecars to public/, verifying bit-identity -------
  const publicBinBySide = {};
  for (const side of SIDES) {
    const cfg = getShoulderSideConfig(side);
    const r = hashes.regions[cfg.regionId];
    if (!r) throw new Error(`MISSING_APPROVED_HASHES:${cfg.regionId}`);
    const sdfSrc = path.join(APPROVED, `${cfg.regionId}_sdf.bin`);
    const refSrc = path.join(APPROVED, `${cfg.regionId}_refine.bin`);
    if (!existsSync(sdfSrc) || !existsSync(refSrc)) {
      throw new Error(`MISSING_APPROVED_BIN:${cfg.regionId}`);
    }
    const sdfDst = path.join(FIELDS_DIR, `neutro_body_v1_${cfg.regionId}_sdf.bin`);
    const refDst = path.join(FIELDS_DIR, `neutro_body_v1_${cfg.regionId}_refine.bin`);
    backupIfPresent(sdfDst, `neutro_body_v1_${cfg.regionId}_sdf.bin`);
    backupIfPresent(refDst, `neutro_body_v1_${cfg.regionId}_refine.bin`);
    copyFileSync(sdfSrc, sdfDst);
    copyFileSync(refSrc, refDst);
    const fh = contentHash16(readFileSync(sdfDst));
    const rh = contentHash16(readFileSync(refDst));
    if (fh !== r.fieldHash || rh !== r.refineHash) {
      throw new Error(`HASH_MISMATCH_ON_COPY:${cfg.regionId}`);
    }
    publicBinBySide[side] = { sdfDst, refDst, fieldHash: fh, refineHash: rh };
    console.log(`[promote-shoulders-v70] ${cfg.regionId} field=${fh} refine=${rh}`);
  }

  // --- 3. Masks: reuse artifacts/shoulders-v70/masks/ if present ----------
  const maskSrc = path.join(MASKS, "neutro_body_v1_anatomical_region_ids.png");
  let rasteredMaskBuf;
  if (existsSync(maskSrc)) {
    rasteredMaskBuf = readFileSync(maskSrc);
    console.log(
      "[promote-shoulders-v70] using pre-rasterized mask from generate step",
    );
  } else {
    console.log(
      "[promote-shoulders-v70] no pre-rasterized mask found — rasterizing now",
    );
    const mesh = loadMeshData(GLB);
    const fieldValuesBySide = {};
    for (const side of SIDES) {
      const buf = readFileSync(publicBinBySide[side].sdfDst);
      fieldValuesBySide[side] = decodeSnorm16(buf, mesh.vertexCount, FIELD_RANGE_M);
    }
    const { mask: baseMask, w, h } = await loadRuntimeMask(ROOT);
    const rastered = rasterizeShoulderSurfaces(mesh, fieldValuesBySide, baseMask, w, h);
    if (rastered.foreignChanged !== 0) {
      throw new Error(`MASK_FOREIGN_CHANGED:${rastered.foreignChanged}`);
    }
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = rastered.mask[i];
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }
    rasteredMaskBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();
    mkdirSync(MASKS, { recursive: true });
    writeFileSync(maskSrc, rasteredMaskBuf);
  }
  writeFileSync(RUNTIME_MASK, rasteredMaskBuf);
  writeFileSync(AUTHORING_MASK, rasteredMaskBuf);
  const maskHash = sha12(rasteredMaskBuf);
  if (maskHash === freezePre.maskHash) {
    throw new Error("MASK_HASH_UNCHANGED — shoulder raster did not update mask");
  }
  console.log(`[promote-shoulders-v70] maskHash ${freezePre.maskHash} → ${maskHash}`);

  // --- 4. Mask manifests ---------------------------------------------------
  if (existsSync(MASK_MANIFEST)) {
    const mm = JSON.parse(readFileSync(MASK_MANIFEST, "utf8"));
    mm.maskHash = maskHash;
    mm.maskUrl = `/models/interaction/neutro_body_v1_anatomical_region_ids.png?v=${maskHash}`;
    writeFileSync(MASK_MANIFEST, `${JSON.stringify(mm, null, 2)}\n`);
  }
  if (existsSync(MASK_JSON)) {
    const mj = JSON.parse(readFileSync(MASK_JSON, "utf8"));
    mj.maskHash = maskHash;
    writeFileSync(MASK_JSON, `${JSON.stringify(mj, null, 2)}\n`);
  }

  // --- 5. Region fields manifest — append shoulder entries only -----------
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  manifest.fields = manifest.fields.filter(
    (f) => f.regionId !== "right_shoulder" && f.regionId !== "left_shoulder",
  );
  for (const side of SIDES) {
    const cfg = getShoulderSideConfig(side);
    const r = hashes.regions[cfg.regionId];
    const entry = {
      regionId: cfg.regionId,
      visualRegionId: cfg.surfaceId,
      surfaceRegionId: cfg.surfaceId,
      maskIndex: cfg.maskIndex,
      geometryHash: hashes.geometryHash,
      indexHash: hashes.indexHash,
      vertexCount: hashes.vertexCount,
      fieldUrl: `/models/interaction/fields/neutro_body_v1_${cfg.regionId}_sdf.bin?v=${r.fieldHash}`,
      fieldHash: r.fieldHash,
      encoding: "snorm16",
      distanceRangeMeters: FIELD_RANGE_M,
      candidateId: selectedCandidate,
      anatomicalParameters: {
        deltoidInsertionOffsetMm: r.deltoidInsertionOffsetMm,
        sourceGate: SOURCE_GATE,
        pipelineVersion: PIPELINE_VERSION,
        side,
      },
      boundaryHashes: r.boundaryHashes,
      refinement: {
        url: `/models/interaction/fields/neutro_body_v1_${cfg.regionId}_refine.bin?v=${r.refineHash}`,
        hash: r.refineHash,
        triangleCount: r.refinementTriangleCount,
        bandMeters: 0.005,
        encoding: r.encoding,
      },
    };
    manifest.fields.push(entry);
  }
  manifest.version = "7.0";
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // --- 6. Re-verify prior official regions bit-identical AFTER writing ----
  // (assertOfficialBackFrozen is intentionally NOT re-invoked here: it hard
  // -compares publicRegionMaskManifest.maskHash to the pre-shoulder constant,
  // which we just advanced on purpose. Field/refine bytes are re-verified
  // directly instead.)
  assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  {
    const manifestPost = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const byId = Object.fromEntries(manifestPost.fields.map((f) => [f.regionId, f]));
    for (const [id, exp] of [
      ["upper_back", OFFICIAL_BACK.upper_back],
      ["lower_back", OFFICIAL_BACK.lower_back],
      ["full_back", OFFICIAL_BACK.full_back],
    ]) {
      const f = byId[id];
      if (!f) throw new Error(`OFFICIAL_BODY_REGRESSION_DETECTED:missing:${id}`);
      const fieldHash = contentHash16(
        readFileSync(path.join(FIELDS_DIR, path.basename(f.fieldUrl.split("?")[0]))),
      );
      const refinementHash = contentHash16(
        readFileSync(
          path.join(FIELDS_DIR, path.basename(f.refinement.url.split("?")[0])),
        ),
      );
      if (fieldHash !== exp.fieldHash || refinementHash !== exp.refinementHash) {
        throw new Error(`OFFICIAL_BODY_REGRESSION_DETECTED:${id}`);
      }
    }
  }
  assertOfficialNeckFrozen(ROOT);
  console.log(
    "[promote-shoulders-v70] post-write freeze OK (torso + back + neck bit-identical)",
  );

  // --- 7. promote-report.json ----------------------------------------------
  const out = {
    promoted: true,
    candidateId: selectedCandidate,
    pipelineVersion: PIPELINE_VERSION,
    maskHashPrev: freezePre.maskHash,
    maskHashNew: maskHash,
    regions: Object.fromEntries(
      SIDES.map((side) => {
        const cfg = getShoulderSideConfig(side);
        const r = hashes.regions[cfg.regionId];
        return [
          cfg.regionId,
          {
            fieldHash: r.fieldHash,
            refineHash: r.refineHash,
            encoding: r.encoding,
            isoline: r.isoline,
            boundaryHashes: r.boundaryHashes,
          },
        ];
      }),
    ),
    commit: false,
    push: false,
    merge: false,
  };
  writeFileSync(
    path.join(OUT, "promote-report.json"),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log("[promote-shoulders-v70] OK — official shoulder regions written (no commit)");
  return out;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("promote-shoulders-v70.mjs")
) {
  main().catch((err) => {
    console.error("[promote-shoulders-v70] FAIL", err.message, err.details || "");
    process.exit(1);
  });
}
