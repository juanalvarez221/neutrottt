/**
 * Promote Forearms V9.0 → official assets.
 *
 *   node tools/body-regions/promote-forearms-v90.mjs
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
  FOREARMS_V90_OUT,
  assertOfficialBodyFrozen,
  getForearmTargetConfig,
  contentHash16,
  loadMeshData,
  decodeSnorm16,
  FIELD_RANGE_M,
  GEOMETRY_IDENTITY,
  OFFICIAL_UPPER_ARMS,
} from "./forearms-v90-core.mjs";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialNeckFrozen,
  assertOfficialShouldersFrozen,
  assertOfficialUpperArmsFrozen,
  OFFICIAL_BACK,
  OFFICIAL_SHOULDERS,
} from "./forearms-side.mjs";
import {
  loadRuntimeMask,
  rasterizeForearmSurfaces,
  SIDES,
  KINDS,
} from "./generate-forearms-v90.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const OUT = FOREARMS_V90_OUT;
const APPROVED = path.join(OUT, "approved");
const MASKS = path.join(OUT, "masks");
const BACKUPS = path.join(OUT, "backups");
const SHARED = path.join(ROOT, "assets/body-regions/shared-seams");
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

function promoteSharedSeams() {
  mkdirSync(SHARED, { recursive: true });
  const names = [];
  for (const side of SIDES) {
    for (const name of [
      `${side}-forearm-hand.json`,
      `${side}-radial-inner-outer.json`,
      `${side}-ulnar-inner-outer.json`,
    ]) {
      const src = path.join(OUT, "shared-seams", name);
      if (!existsSync(src)) throw new Error(`MISSING_SEAM:${name}`);
      copyFileSync(src, path.join(SHARED, name));
      names.push(name);
    }
    // Proximal upper-arm–forearm seams stay bit-identical (already official).
  }
  return names;
}

async function main() {
  const reportPath = path.join(OUT, "report.json");
  const hashesPath = path.join(APPROVED, "hashes.json");
  if (!existsSync(reportPath) || !existsSync(hashesPath)) {
    throw new Error("MISSING_APPROVED: run generate-forearms-v90.mjs first");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!report.approved || !report.canPromoteOfficially) {
    throw new Error("NOT_APPROVED");
  }
  const hashes = JSON.parse(readFileSync(hashesPath, "utf8"));
  const selectedCandidate = hashes.candidateId;

  const freezePre = assertOfficialBodyFrozen(ROOT);
  console.log(
    `[promote-forearms-v90] pre-write freeze OK maskHash=${freezePre.maskHash}`,
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

  const regionIds = [];
  for (const side of SIDES) {
    for (const kind of KINDS) {
      const cfg = getForearmTargetConfig(side, kind);
      const r = hashes.regions[cfg.regionId];
      if (!r) throw new Error(`MISSING_APPROVED_HASHES:${cfg.regionId}`);
      const sdfSrc = path.join(APPROVED, `${cfg.fileStem}_sdf.bin`);
      const refSrc = path.join(APPROVED, `${cfg.fileStem}_refine.bin`);
      if (!existsSync(sdfSrc) || !existsSync(refSrc)) {
        throw new Error(`MISSING_APPROVED_BIN:${cfg.fileStem}`);
      }
      const sdfDst = path.join(
        FIELDS_DIR,
        `neutro_body_v1_${cfg.fileStem}_sdf.bin`,
      );
      const refDst = path.join(
        FIELDS_DIR,
        `neutro_body_v1_${cfg.fileStem}_refine.bin`,
      );
      backupIfPresent(sdfDst, path.basename(sdfDst));
      backupIfPresent(refDst, path.basename(refDst));
      copyFileSync(sdfSrc, sdfDst);
      copyFileSync(refSrc, refDst);
      const fh = contentHash16(readFileSync(sdfDst));
      const rh = contentHash16(readFileSync(refDst));
      if (fh !== r.fieldHash || rh !== r.refineHash) {
        throw new Error(`HASH_MISMATCH_ON_COPY:${cfg.regionId}`);
      }
      regionIds.push(cfg.regionId);
      console.log(
        `[promote-forearms-v90] ${cfg.regionId} field=${fh} refine=${rh}`,
      );
    }
  }

  const seamFiles = promoteSharedSeams();
  console.log(`[promote-forearms-v90] shared seams: ${seamFiles.length}`);

  const maskSrc = path.join(MASKS, "neutro_body_v1_anatomical_region_ids.png");
  let rasteredMaskBuf;
  if (existsSync(maskSrc)) {
    rasteredMaskBuf = readFileSync(maskSrc);
  } else {
    const mesh = loadMeshData(GLB);
    const fieldValues = {};
    for (const side of SIDES) {
      for (const kind of ["inner", "outer"]) {
        const cfg = getForearmTargetConfig(side, kind);
        const buf = readFileSync(
          path.join(FIELDS_DIR, `neutro_body_v1_${cfg.fileStem}_sdf.bin`),
        );
        fieldValues[`${side}:${kind}`] = decodeSnorm16(
          buf,
          mesh.vertexCount,
          FIELD_RANGE_M,
        );
      }
    }
    const { mask: baseMask, w, h } = await loadRuntimeMask(ROOT);
    const rastered = rasterizeForearmSurfaces(mesh, fieldValues, baseMask, w, h);
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
    rasteredMaskBuf = await sharp(rgba, {
      raw: { width: w, height: h, channels: 4 },
    })
      .png()
      .toBuffer();
  }
  writeFileSync(RUNTIME_MASK, rasteredMaskBuf);
  writeFileSync(AUTHORING_MASK, rasteredMaskBuf);
  const maskHash = sha12(rasteredMaskBuf);
  console.log(
    `[promote-forearms-v90] maskHash ${freezePre.maskHash} → ${maskHash}`,
  );

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

  const removeIds = new Set(regionIds);
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  manifest.fields = manifest.fields.filter((f) => !removeIds.has(f.regionId));
  for (const side of SIDES) {
    for (const kind of KINDS) {
      const cfg = getForearmTargetConfig(side, kind);
      const r = hashes.regions[cfg.regionId];
      const entry = {
        regionId: cfg.regionId,
        geometryHash: hashes.geometryHash,
        indexHash: hashes.indexHash,
        vertexCount: hashes.vertexCount,
        fieldUrl: `/models/interaction/fields/neutro_body_v1_${cfg.fileStem}_sdf.bin?v=${r.fieldHash}`,
        fieldHash: r.fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        candidateId: selectedCandidate,
        anatomicalParameters: {
          innerBandOffsetMm: r.innerBandOffsetMm,
          sourceGate: SOURCE_GATE,
          pipelineVersion: PIPELINE_VERSION,
          side,
          kind,
        },
        boundaryHashes: r.boundaryHashes,
        refinement: {
          url: `/models/interaction/fields/neutro_body_v1_${cfg.fileStem}_refine.bin?v=${r.refineHash}`,
          hash: r.refineHash,
          triangleCount: r.refinementTriangleCount,
          bandMeters: 0.005,
          encoding: r.encoding,
        },
      };
      if (cfg.surfaceId) {
        entry.visualRegionId = cfg.surfaceId;
        entry.surfaceRegionId = cfg.surfaceId;
        entry.maskIndex = cfg.maskIndex;
      }
      if (cfg.hitVisualRegionIds) {
        entry.hitVisualRegionIds = cfg.hitVisualRegionIds;
      }
      manifest.fields.push(entry);
    }
  }
  manifest.version = "9.0";
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  {
    const manifestPost = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const byId = Object.fromEntries(
      manifestPost.fields.map((f) => [f.regionId, f]),
    );
    for (const [id, exp] of [
      ["upper_back", OFFICIAL_BACK.upper_back],
      ["lower_back", OFFICIAL_BACK.lower_back],
      ["full_back", OFFICIAL_BACK.full_back],
      ["right_shoulder", OFFICIAL_SHOULDERS.right_shoulder],
      ["left_shoulder", OFFICIAL_SHOULDERS.left_shoulder],
      ["right_upper_arm", OFFICIAL_UPPER_ARMS.right_upper_arm],
      ["left_upper_arm", OFFICIAL_UPPER_ARMS.left_upper_arm],
      ["right_biceps_region", OFFICIAL_UPPER_ARMS.right_biceps_region],
      ["left_biceps_region", OFFICIAL_UPPER_ARMS.left_biceps_region],
      ["right_triceps_region", OFFICIAL_UPPER_ARMS.right_triceps_region],
      ["left_triceps_region", OFFICIAL_UPPER_ARMS.left_triceps_region],
    ]) {
      const f = byId[id];
      if (!f) throw new Error(`OFFICIAL_BODY_REGRESSION_DETECTED:missing:${id}`);
      const fieldHash = contentHash16(
        readFileSync(
          path.join(FIELDS_DIR, path.basename(f.fieldUrl.split("?")[0])),
        ),
      );
      const refinementHash = contentHash16(
        readFileSync(
          path.join(FIELDS_DIR, path.basename(f.refinement.url.split("?")[0])),
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
  assertOfficialNeckFrozen(ROOT);
  assertOfficialShouldersFrozen(ROOT);
  console.log("[promote-forearms-v90] post-write freeze OK");

  const out = {
    promoted: true,
    candidateId: selectedCandidate,
    pipelineVersion: PIPELINE_VERSION,
    maskHashPrev: freezePre.maskHash,
    maskHashNew: maskHash,
    geometryIdentity: GEOMETRY_IDENTITY,
    regions: Object.fromEntries(
      regionIds.map((id) => {
        const r = hashes.regions[id];
        return [
          id,
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
    sharedSeams: seamFiles,
    commit: false,
    push: false,
    merge: false,
  };
  writeFileSync(
    path.join(OUT, "promote-report.json"),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log(
    "[promote-forearms-v90] OK — official forearm regions written (no commit)",
  );
  return out;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("promote-forearms-v90.mjs")
) {
  main().catch((err) => {
    console.error(
      "[promote-forearms-v90] FAIL",
      err.message,
      err.details || "",
    );
    process.exit(1);
  });
}
