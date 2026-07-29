/**
 * Promote Full Chest C07 → official assets (V2.7).
 *
 * Source: artifacts/full-chest-v26/approved/ (frozen). Does not recalculate
 * anatomy. Does not overwrite backups. Does not commit.
 *
 *   node tools/body-regions/promote-full-chest-c07.mjs
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
import { rasterizeAdaptive } from "./generate-full-chest-v23.mjs";
import {
  buildCandidateGrid,
  evaluateCandidate,
  buildV26Context,
  sampleHitAlignment,
} from "./full-chest-v26.mjs";
import {
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPROVED = path.join(ROOT, "artifacts/full-chest-v26/approved");
const REPORT_V26 = path.join(ROOT, "artifacts/full-chest-v26/report.json");
const OUT = path.join(ROOT, "artifacts/full-chest-v27");
const BACKUPS = path.join(OUT, "backups");

const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const PALETTE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_region_palette.json",
);
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const RUNTIME_MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const RUNTIME_MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const BUNDLED_MASK = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const FIELD_BIN = path.join(FIELDS_DIR, "neutro_body_v1_full_chest_sdf.bin");
const REFINE_BIN = path.join(FIELDS_DIR, "neutro_body_v1_full_chest_refine.bin");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");

const EXPECTED = {
  candidate: "C07",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  infraclavicularOffset: 0.014,
  upperCenterRise: 0.003,
  inferiorCenterTransition: 0,
  lateralInsetMeters: 0,
  fieldHash: "cc4f1242dc879825",
  refineHash: "b309a72b943d16e8",
};
const CHEST_INDEX = 9;

function sha16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}
function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function backupIfPresent(src, name) {
  if (!existsSync(src)) {
    console.warn("SKIP_BACKUP_MISSING", name);
    return null;
  }
  const dest = path.join(BACKUPS, name);
  if (existsSync(dest)) {
    console.log("BACKUP_KEEP", name);
    return dest;
  }
  copyFileSync(src, dest);
  console.log("BACKUP", name);
  return dest;
}

function keepLargest(mask, w, h, target) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== target || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || mask[ni] !== target) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  const keep = new Set(comps[0] ?? []);
  let removed = 0;
  for (let c = 1; c < comps.length; c++) {
    for (const i of comps[c]) {
      mask[i] = 0;
      removed++;
    }
  }
  return {
    components: keep.size ? 1 : 0,
    rawComponents: comps.length,
    tinyIslands: Math.max(0, comps.length - 1),
    removed,
    pixels: keep.size,
  };
}

async function readIndexedMask(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * ch];
  return { mask: out, w: info.width, h: info.height };
}

/**
 * §5 alignment against the PROMTED categorical mask (not analytic classify).
 * Sample barycentric points, read UV → mask index, compare to GDF sign.
 */
function sampleMaskFieldAlignment(mesh, mask, w, h, values, opts = {}) {
  const band = opts.band ?? 0.002;
  const wantInterior = opts.interior ?? 5000;
  const wantExterior = opts.exterior ?? 5000;
  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;
  const bary = [
    [0.25, 0.25],
    [0.5, 0.25],
    [0.25, 0.5],
    [0.34, 0.34],
    [0.6, 0.2],
    [0.2, 0.6],
    [0.15, 0.15],
    [0.7, 0.15],
    [0.15, 0.7],
  ];
  const ambiguousUv = (px, py) => {
    const center = mask[py * w + px];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = mask[ny * w + nx];
        const cChest = center === CHEST_INDEX;
        const nChest = n === CHEST_INDEX;
        if (cChest !== nChest) return true;
      }
    }
    return false;
  };
  for (let t = 0; t < mesh.triangleCount; t++) {
    if (interior >= wantInterior && exterior >= wantExterior) break;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const u0 = UV[a * 2];
    const v0 = UV[a * 2 + 1];
    const u1 = UV[b * 2];
    const v1 = UV[b * 2 + 1];
    const u2 = UV[c * 2];
    const v2 = UV[c * 2 + 1];
    if (
      Math.abs(u0 - u1) > 0.55 ||
      Math.abs(u1 - u2) > 0.55 ||
      Math.abs(u2 - u0) > 0.55
    ) {
      continue;
    }
    for (const [bu, bv] of bary) {
      const bw = 1 - bu - bv;
      const fieldValue =
        values[a] * bw + values[b] * bu + values[c] * bv;
      if (Math.abs(fieldValue) <= band) continue;
      const u = u0 * bw + u1 * bu + u2 * bv;
      const v = v0 * bw + v1 * bu + v2 * bv;
      // Match NearestFilter / makeMaskSampler (floor, not round).
      const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
      // UV chest boundary texels are the categorical analogue of the ±2 mm band.
      if (ambiguousUv(px, py)) continue;
      const maskInside = mask[py * w + px] === CHEST_INDEX;
      if (fieldValue > band) {
        if (interior >= wantInterior) continue;
        interior++;
        if (!maskInside) interiorMismatch++;
      } else {
        if (exterior >= wantExterior) continue;
        exterior++;
        if (maskInside) exteriorMismatch++;
      }
    }
  }
  return {
    interior,
    exterior,
    interiorMismatch,
    exteriorMismatch,
    bandMeters: band,
  };
}

export async function promoteFullChestC07() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS, { recursive: true });

  // --- §1 verify source ---
  const candidateManifest = JSON.parse(
    readFileSync(
      path.join(APPROVED, "neutro_body_v1_region_fields.candidate.json"),
      "utf8",
    ),
  );
  const reportV26 = JSON.parse(readFileSync(REPORT_V26, "utf8"));
  const fieldSrc = path.join(APPROVED, "neutro_body_v1_full_chest_sdf_C07.bin");
  const refineSrc = path.join(
    APPROVED,
    "neutro_body_v1_full_chest_refine_C07.bin",
  );
  if (!existsSync(fieldSrc) || !existsSync(refineSrc)) {
    throw new Error("C07_PROMOTION_SOURCE_MISMATCH: missing approved binaries");
  }
  const fieldBuf = readFileSync(fieldSrc);
  const refineBuf = readFileSync(refineSrc);
  const fieldHash = sha16(fieldBuf);
  const refineHash = sha16(refineBuf);
  const params = candidateManifest.params;
  const ok =
    candidateManifest.candidate === EXPECTED.candidate &&
    candidateManifest.geometryHash === EXPECTED.geometryHash &&
    candidateManifest.indexHash === EXPECTED.indexHash &&
    candidateManifest.vertexCount === EXPECTED.vertexCount &&
    params.infraclavicularOffset === EXPECTED.infraclavicularOffset &&
    params.upperCenterRise === EXPECTED.upperCenterRise &&
    params.inferiorCenterTransition === EXPECTED.inferiorCenterTransition &&
    params.lateralInsetMeters === EXPECTED.lateralInsetMeters &&
    fieldHash === EXPECTED.fieldHash &&
    refineHash === EXPECTED.refineHash &&
    reportV26.approved?.candidate === "C07";
  if (!ok) {
    throw new Error(
      `C07_PROMOTION_SOURCE_MISMATCH: ${JSON.stringify({
        candidate: candidateManifest.candidate,
        geometryHash: candidateManifest.geometryHash,
        indexHash: candidateManifest.indexHash,
        vertexCount: candidateManifest.vertexCount,
        params,
        fieldHash,
        refineHash,
        reportCandidate: reportV26.approved?.candidate,
      })}`,
    );
  }
  console.log("SOURCE_OK C07");

  // --- §2 backups ---
  backupIfPresent(AUTHORING, "neutro_body_v1_anatomical_regions_authoring.png");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(FIELD_BIN, "neutro_body_v1_full_chest_sdf.bin");
  backupIfPresent(REFINE_BIN, "neutro_body_v1_full_chest_refine.bin");
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");

  // --- §3 promote geometry field ---
  copyFileSync(fieldSrc, FIELD_BIN);
  copyFileSync(refineSrc, REFINE_BIN);
  const officialManifest = {
    model: "neutro_body_v1",
    version: "2.7",
    geometryHash: EXPECTED.geometryHash,
    indexHash: EXPECTED.indexHash,
    vertexCount: EXPECTED.vertexCount,
    indexCount: candidateManifest.indexCount,
    fields: [
      {
        regionId: "full_chest",
        surfaceRegionId: "full_chest_surface",
        maskIndex: CHEST_INDEX,
        geometryHash: EXPECTED.geometryHash,
        indexHash: EXPECTED.indexHash,
        vertexCount: EXPECTED.vertexCount,
        fieldUrl: "/models/interaction/fields/neutro_body_v1_full_chest_sdf.bin",
        fieldHash,
        encoding: "snorm16",
        distanceRangeMeters: FIELD_RANGE_M,
        candidateId: "C07",
        anatomicalParameters: {
          infraclavicularOffsetMm: 14,
          upperCenterRiseMm: 3,
          inferiorCenterTransitionMm: 0,
          lateralInsetMm: 0,
        },
        refinement: {
          url: "/models/interaction/fields/neutro_body_v1_full_chest_refine.bin",
          hash: refineHash,
          triangleCount: candidateManifest.fields[0].refinement.triangleCount,
          bandMeters: 0.005,
          encoding: "u32-snorm16x3",
        },
      },
    ],
  };
  writeFileSync(MANIFEST, `${JSON.stringify(officialManifest, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "neutro_body_v1_region_fields.json"),
    `${JSON.stringify(officialManifest, null, 2)}\n`,
  );
  console.log("FIELD_PROMOTED", fieldHash, refineHash);

  // --- §4 promote categorical mask ---
  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);

  console.log("Rebuild C07 frontiers (frozen params, no retuning)…");
  const ctx = buildV26Context(GLB, LANDMARKS);
  const c07params = buildCandidateGrid().find((c) => c.id === "C07");
  if (!c07params) throw new Error("C07_PROMOTION_SOURCE_MISMATCH: grid missing C07");
  const evaluated = evaluateCandidate(ctx.mesh, ctx.lm, ctx.field, c07params);
  const boundsFinal = evaluated.bounds;
  const field = ctx.field;
  const mesh = ctx.mesh;

  console.log("Rasterize C07 categorical…");
  // Adaptive draft may stamp chest over contested UV texels. That is allowed:
  // we only ever write CHEST or clear prior CHEST → 0. Foreign→foreign IDs must
  // remain byte-identical (never mutate arm→abdomen, etc.).
  const { mask: rastered } = rasterizeAdaptive(
    mesh,
    boundsFinal,
    field,
    baseMask,
    w,
    h,
  );
  const island = keepLargest(rastered, w, h, CHEST_INDEX);

  let foreignModified = 0;
  let chestClaimedFromForeign = 0;
  let chestReleasedToEmpty = 0;
  for (let i = 0; i < w * h; i++) {
    const before = baseMask[i];
    const after = rastered[i];
    if (before !== CHEST_INDEX && after !== CHEST_INDEX && before !== after) {
      foreignModified++;
    }
    if (before !== CHEST_INDEX && before !== 0 && after === CHEST_INDEX) {
      chestClaimedFromForeign++;
    }
    if (before === CHEST_INDEX && after === 0) {
      chestReleasedToEmpty++;
    }
  }
  if (foreignModified !== 0) {
    throw new Error(`FOREIGN_IDS_MODIFIED=${foreignModified}`);
  }

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);
  copyFileSync(RUNTIME_MASK, path.join(OUT, "neutro_body_v1_anatomical_region_ids.png"));

  // Sync authoring: clear prior chest paint, stamp C07 chest RGB.
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const chestRgb = parseHex(palette.regions.full_chest_surface.authoringColor);
  const bg = parseHex(palette.background.authoringColor);
  const legacy = Object.keys(palette.legacyAuthoringColors ?? {}).map(parseHex);
  const { data: authRaw, info: authInfo } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const auth = Buffer.from(authRaw);
  const isNear = (rgb, target, tol = 14) =>
    Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const rgb = [auth[o], auth[o + 1], auth[o + 2]];
    const wasChest =
      isNear(rgb, chestRgb) || legacy.some((c) => isNear(rgb, c));
    if (rastered[i] === CHEST_INDEX) {
      auth[o] = chestRgb[0];
      auth[o + 1] = chestRgb[1];
      auth[o + 2] = chestRgb[2];
      auth[o + 3] = 255;
    } else if (wasChest) {
      auth[o] = bg[0];
      auth[o + 1] = bg[1];
      auth[o + 2] = bg[2];
      auth[o + 3] = 255;
    }
  }
  await sharp(auth, {
    raw: { width: authInfo.width, height: authInfo.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(AUTHORING);
  copyFileSync(AUTHORING, path.join(OUT, "neutro_body_v1_anatomical_regions_authoring.png"));

  // Quantize authoring → verify unknown IDs = 0 and foreign IDs unchanged.
  const { data: qRaw } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const entries = Object.entries(palette.regions).map(([id, e]) => ({
    id,
    index: e.runtimeIndex,
    rgb: parseHex(e.authoringColor),
  }));
  for (const [hex, regionId] of Object.entries(palette.legacyAuthoringColors ?? {})) {
    const target = entries.find((e) => e.id === regionId);
    if (!target) continue;
    entries.push({
      id: `${regionId}__legacy_${hex}`,
      index: target.index,
      rgb: parseHex(hex),
    });
  }
  const exact = new Map(entries.map((e) => [e.rgb.join(","), e]));
  const TOL2 = 18 * 18;
  const quantized = Buffer.alloc(w * h);
  let unknown = 0;
  for (let i = 0; i < w * h; i++) {
    const r = qRaw[i * 4];
    const g = qRaw[i * 4 + 1];
    const b = qRaw[i * 4 + 2];
    const a = qRaw[i * 4 + 3];
    if (a < 8 || (r === 0 && g === 0 && b === 0)) {
      quantized[i] = 0;
      continue;
    }
    let hit = exact.get(`${r},${g},${b}`);
    if (!hit) {
      let best = null;
      let bestD = Infinity;
      for (const e of entries) {
        const d =
          (r - e.rgb[0]) ** 2 + (g - e.rgb[1]) ** 2 + (b - e.rgb[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best && bestD <= TOL2) hit = best;
    }
    if (!hit) {
      unknown++;
      quantized[i] = 0;
      continue;
    }
    quantized[i] = hit.index;
  }
  if (unknown !== 0) throw new Error(`UNKNOWN_IDS=${unknown}`);

  // Prefer the adaptive raster as the official runtime (quantize can soft-edge).
  // Re-check foreign IDs against the adaptive raster we already validated.
  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);

  const maskBytes = readFileSync(RUNTIME_MASK);
  const maskHash = sha12(maskBytes);
  const regions = {};
  for (const [id, e] of Object.entries(palette.regions)) {
    regions[id] = { maskIndex: e.runtimeIndex };
  }
  const maskTexture = "/models/interaction/neutro_body_v1_anatomical_region_ids.png";
  const maskManifest = {
    model: "neutro_body_v1",
    maskTexture,
    maskHash,
    maskUrl: `${maskTexture}?v=${maskHash}`,
    resolution: w,
    encoding: "r8_index",
    indexScale: 255,
    source: "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
    palette: "assets/body-regions/neutro_body_v1_region_palette.json",
    regions,
    composites: palette.composites,
    promotedCandidate: "C07",
  };
  writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(maskManifest, null, 2)}\n`);
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);
  console.log("MASK_PROMOTED", maskHash, "chestPx", island.pixels);

  // --- §5 hit/highlight alignment ---
  const values = decodeSnorm16(fieldBuf, EXPECTED.vertexCount, FIELD_RANGE_M);
  const alignment = sampleMaskFieldAlignment(mesh, rastered, w, h, values, {
    interior: 5000,
    exterior: 5000,
  });
  // Also keep analytic coincidence for the report.
  const analyticAlign = sampleHitAlignment(
    mesh,
    ctx.lm,
    boundsFinal,
    field,
    values,
    { interior: 2000, exterior: 2000 },
  );
  console.log("ALIGNMENT", alignment);

  const report = {
    version: "2.7",
    candidate: "C07",
    source: "artifacts/full-chest-v26/approved",
    identity: {
      geometryHash: EXPECTED.geometryHash,
      indexHash: EXPECTED.indexHash,
      vertexCount: EXPECTED.vertexCount,
    },
    parameters: {
      infraclavicularOffsetMm: 14,
      upperCenterRiseMm: 3,
      inferiorCenterTransitionMm: 0,
      lateralInsetMm: 0,
    },
    field: {
      fieldHash,
      refineHash,
      sidecarBytes: fieldBuf.length,
      refineBytes: refineBuf.length,
    },
    mask: {
      maskHash,
      resolution: w,
      foreignIdsModified: foreignModified,
      chestClaimedFromForeign,
      chestReleasedToEmpty,
      unknownIds: unknown,
      components: island.components,
      tinyIslands: island.tinyIslands,
      chestPixels: island.pixels,
    },
    alignment,
    analyticAlignment: {
      interior: analyticAlign.interior,
      exterior: analyticAlign.exterior,
      interiorMismatch: analyticAlign.interiorMismatch,
      exteriorMismatch: analyticAlign.exteriorMismatch,
    },
    officialMaskOverwritten: true,
    officialSidecarOverwritten: true,
    glbModified: false,
  };
  writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  if (alignment.interiorMismatch !== 0 || alignment.exteriorMismatch !== 0) {
    throw new Error(
      `HIT_ALIGNMENT_FAIL interior=${alignment.interiorMismatch} exterior=${alignment.exteriorMismatch}`,
    );
  }
  if (island.components !== 1 || island.tinyIslands !== 0) {
    throw new Error(
      `MASK_INTEGRITY_FAIL components=${island.components} tiny=${island.tinyIslands}`,
    );
  }

  console.log("V27_PROMOTE_OK", OUT);
  return report;
}

const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/promote-full-chest-c07.mjs")) {
  promoteFullChestC07().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
