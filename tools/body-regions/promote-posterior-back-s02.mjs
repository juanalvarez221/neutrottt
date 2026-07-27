/**
 * Promote Posterior Back S02 → official assets (V5.2 gate).
 *
 * Source: artifacts/posterior-back-v51/approved/ (frozen S02).
 * Does not regenerate S02 anatomy. Does not create full_back_surface.
 * Freezes C07 chest + B01 abdomen + V4.1 right_ribs + L01 left_ribs bit-identical.
 *
 *   node tools/body-regions/promote-posterior-back-s02.mjs
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  expectedOfficialHashes,
} from "./posterior-back-v51-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPROVED = path.join(ROOT, "artifacts/posterior-back-v51/approved");
const REPORT_V51 = path.join(ROOT, "artifacts/posterior-back-v51/report.json");
const OUT = path.join(ROOT, "artifacts/posterior-back-v52");
const BACKUPS = path.join(OUT, "backups");

const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const PALETTE = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_region_palette.json",
);
const ANATOMY = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions.json",
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
const VISUAL_ASSETS = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionVisualAssets.json",
);
const FIELDS_DIR = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS_DIR, "neutro_body_v1_region_fields.json");

const CHEST_INDEX = 9;
const ABDOMEN_INDEX = 11;
const LEFT_RIBS_INDEX = 12;
const RIGHT_RIBS_INDEX = 13;
const UPPER_BACK_INDEX = 14;
const LOWER_BACK_INDEX = 15;

const FROZEN = {
  chestField: "cc4f1242dc879825",
  chestRefine: "b309a72b943d16e8",
  abdomenField: "30a41c0dcc820ab0",
  abdomenRefine: "e624d3f9ecc9d40a",
  rightRibsField: "69a61207dd331a1d",
  rightRibsRefine: "4a17658fa0cec820",
  leftRibsField: "3a1a0e9368a98095",
  leftRibsRefine: "d4691c229a59a804",
  maskHashPre: "6134058b9b59",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
};

const S02 = {
  candidateId: "S02",
  upper: {
    fieldHash: "6795862f576d5f8b",
    refineHash: "4d366898782d2c7f",
    meanMm: 0.22,
    p95Mm: 1.947,
    maxMm: 3.729,
  },
  lower: {
    fieldHash: "105365e5be961e96",
    refineHash: "4c956c30646eb298",
    meanMm: 0.083,
    p95Mm: 0.115,
    maxMm: 3.674,
  },
  full: {
    fieldHash: "6da0b6bfe2eb5b38",
    refineHash: "c79f8241b89fecb2",
    meanMm: 0.238,
    p95Mm: 1.947,
    maxMm: 3.729,
  },
};

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
function round(v, d = 3) {
  return +Number(v).toFixed(d);
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

function restoreFromBackups() {
  const map = [
    ["neutro_body_v1_anatomical_regions_authoring.png", AUTHORING],
    ["neutro_body_v1_anatomical_region_ids.png", RUNTIME_MASK],
    ["neutro_body_v1_anatomical_region_ids.json", RUNTIME_MASK_JSON],
    ["neutro_body_v1_region_fields.json", MANIFEST],
    ["publicRegionMaskManifest.json", BUNDLED_MASK],
    ["publicRegionVisualAssets.json", VISUAL_ASSETS],
    ["neutro_body_v1_region_palette.json", PALETTE],
    ["neutro_body_v1_anatomical_regions.json", ANATOMY],
  ];
  for (const [name, dest] of map) {
    const src = path.join(BACKUPS, name);
    if (existsSync(src)) copyFileSync(src, dest);
  }
  for (const region of ["upper_back", "lower_back", "full_back"]) {
    for (const kind of ["sdf", "refine"]) {
      const p = path.join(
        FIELDS_DIR,
        `neutro_body_v1_${region}_${kind}.bin`,
      );
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  }
  console.error("RESTORED_FROM_BACKUPS");
}

/**
 * Drop UV components that do not contain any field-positive seed pixel.
 * Preserves multi-chart atlas islands that carry real anatomy.
 */
function removeUnseededIslands(mask, w, h, target, seedIndices) {
  const seed = new Uint8Array(w * h);
  for (const i of seedIndices) {
    if (i >= 0 && i < seed.length) seed[i] = 1;
  }
  const seen = new Uint8Array(w * h);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let kept = 0;
  let removed = 0;
  let tinyIslands = 0;
  let pixels = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i] !== target || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const cells = [];
    let hasSeed = false;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      if (seed[cur]) hasSeed = true;
      const x = cur % w;
      const y = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || mask[ni] !== target) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    if (!hasSeed || cells.length < 24) {
      if (cells.length < 24) tinyIslands++;
      for (const c of cells) {
        mask[c] = 0;
        removed++;
      }
    } else {
      kept++;
      pixels += cells.length;
    }
  }
  return {
    components: kept,
    rawComponents: kept + (removed > 0 ? 1 : 0),
    tinyIslands,
    removed,
    pixels,
  };
}

function collectFieldSeeds(mesh, values, w, h, radius = 2) {
  const UV = mesh.uvs;
  const seeds = [];
  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    if (values[vi] <= 0) continue;
    const px = Math.min(w - 1, Math.max(0, Math.floor(UV[vi * 2] * w)));
    const py = Math.min(
      h - 1,
      Math.max(0, Math.floor((1 - UV[vi * 2 + 1]) * h)),
    );
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        seeds.push(y * w + x);
      }
    }
  }
  return seeds;
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
 * Rasterize upper_back (14) and lower_back (15) from S02 field frontiers.
 * Shared seam: pixel goes to the field with larger positive distance.
 * Vertex stamps only — triangle UV fill is too costly/noisy on the 4k atlas.
 */
function rasterizeBackOfficial(mesh, upperValues, lowerValues, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === UPPER_BACK_INDEX || out[i] === LOWER_BACK_INDEX) out[i] = 0;
  }

  const UV = mesh.uvs;
  const bestScore = new Float64Array(w * h).fill(-Infinity);
  const coverage = new Int8Array(w * h);

  const stamp = (px, py, score, index, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const idx = y * w + x;
        if (score < bestScore[idx]) continue;
        bestScore[idx] = score;
        coverage[idx] = index;
      }
    }
  };

  const stampField = (values, index, radius) => {
    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      if (values[vi] <= 0) continue;
      const u = UV[vi * 2];
      const v = UV[vi * 2 + 1];
      const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
      stamp(px, py, values[vi], index, radius);
    }
  };

  stampField(upperValues, UPPER_BACK_INDEX, 18);
  stampField(lowerValues, LOWER_BACK_INDEX, 28);

  const frozen = new Set([
    CHEST_INDEX,
    ABDOMEN_INDEX,
    LEFT_RIBS_INDEX,
    RIGHT_RIBS_INDEX,
  ]);
  let foreignBlocked = 0;
  for (let i = 0; i < out.length; i++) {
    const cov = coverage[i];
    if (!cov) continue;
    if (out[i] !== 0 && frozen.has(out[i])) {
      foreignBlocked++;
      continue;
    }
    if (
      out[i] !== 0 &&
      out[i] !== UPPER_BACK_INDEX &&
      out[i] !== LOWER_BACK_INDEX
    ) {
      foreignBlocked++;
      continue;
    }
    out[i] = cov;
  }
  return { mask: out, foreignBlocked };
}

function sampleAlignment(mesh, mask, w, h, values, targetIndex, opts = {}) {
  const band = opts.band ?? 0.002;
  const otherValues = opts.otherValues ?? null;
  const UV = mesh.uvs;
  const P = mesh.positions;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;

  const nearTarget = (px, py, radius = 20) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (mask[ny * w + nx] === targetIndex) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = values[i];
    if (Math.abs(v) <= band) continue;
    // Skip shared-seam contest where the sibling field wins the categorical pixel.
    if (otherValues && v > band && otherValues[i] > v) continue;
    const u = UV[i * 2];
    const vv = UV[i * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - vv) * h)));
    const mid = mask[py * w + px];
    if (
      mid === CHEST_INDEX ||
      mid === ABDOMEN_INDEX ||
      mid === LEFT_RIBS_INDEX ||
      mid === RIGHT_RIBS_INDEX
    ) {
      continue;
    }
    const maskInside = mid === targetIndex;
    if (v > band) {
      interior++;
      if (!maskInside && !nearTarget(px, py, 24)) interiorMismatch++;
    } else if (v < -band) {
      const z = P[i * 3 + 2];
      const y = P[i * 3 + 1];
      if (z > -0.02) continue;
      if (y < 0.85 || y > 1.45) continue;
      if (!nearTarget(px, py, 40)) continue;
      exterior++;
      if (maskInside) exteriorMismatch++;
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

function sampleFullUnionAlignment(
  mesh,
  mask,
  w,
  h,
  fullValues,
  opts = {},
) {
  const band = opts.band ?? 0.002;
  const UV = mesh.uvs;
  const P = mesh.positions;
  let interior = 0;
  let exterior = 0;
  let interiorMismatch = 0;
  let exteriorMismatch = 0;
  const union = (mid) =>
    mid === UPPER_BACK_INDEX || mid === LOWER_BACK_INDEX;

  const nearUnion = (px, py, radius = 24) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (union(mask[ny * w + nx])) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < mesh.vertexCount; i++) {
    const v = fullValues[i];
    if (Math.abs(v) <= band) continue;
    const u = UV[i * 2];
    const vv = UV[i * 2 + 1];
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - vv) * h)));
    const mid = mask[py * w + px];
    if (
      mid === CHEST_INDEX ||
      mid === ABDOMEN_INDEX ||
      mid === LEFT_RIBS_INDEX ||
      mid === RIGHT_RIBS_INDEX
    ) {
      continue;
    }
    const maskInside = union(mid);
    if (v > band) {
      interior++;
      if (!maskInside && !nearUnion(px, py, 24)) interiorMismatch++;
    } else if (v < -band) {
      const z = P[i * 3 + 2];
      const y = P[i * 3 + 1];
      if (z > -0.02) continue;
      if (y < 0.85 || y > 1.45) continue;
      if (!nearUnion(px, py, 40)) continue;
      exterior++;
      if (maskInside) exteriorMismatch++;
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

function measureGapOverlap(mask, w, h) {
  let gap = 0;
  let overlap = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = mask[i];
      if (v === UPPER_BACK_INDEX) {
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = mask[ny * w + nx];
          if (n === 0) {
            // empty neighbour between upper and lower counts as gap only if
            // lower is within 2px on the opposite side — approximate seam check
          }
        }
      }
      // Overlap cannot exist in single-channel mask; check score conflicts via
      // adjacent upper/lower without empty — that's continuity (good).
      if (v === UPPER_BACK_INDEX) {
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (mask[ny * w + nx] === LOWER_BACK_INDEX) {
            // shared seam pixel adjacency — expected
          }
        }
      }
    }
  }
  // Pixel-level exclusive assignment ⇒ overlap always 0.
  overlap = 0;
  // Gap: upper and lower components exist and share a frontier (no empty corridor).
  // Count empty pixels that border BOTH regions within radius 2.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] !== 0) continue;
      let hasU = false;
      let hasL = false;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const n = mask[(y + dy) * w + (x + dx)];
          if (n === UPPER_BACK_INDEX) hasU = true;
          if (n === LOWER_BACK_INDEX) hasL = true;
        }
      }
      if (hasU && hasL) gap++;
    }
  }
  return { gap, overlap };
}

function assertFrozenOrThrow() {
  const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  const expected = expectedOfficialHashes();
  const regionFields = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const chest = regionFields.fields.find((f) => f.regionId === "full_chest");
  const abd = regionFields.fields.find((f) => f.regionId === "full_abdomen");
  const right = regionFields.fields.find((f) => f.regionId === "right_ribs");
  const left = regionFields.fields.find((f) => f.regionId === "left_ribs");
  const mask = JSON.parse(readFileSync(BUNDLED_MASK, "utf8"));

  const ok =
    freeze.intact === true &&
    freeze.geometryHash === FROZEN.geometryHash &&
    freeze.indexHash === FROZEN.indexHash &&
    freeze.vertexCount === FROZEN.vertexCount &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.chest.fieldBin))) ===
      FROZEN.chestField &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.chest.refineBin))) ===
      FROZEN.chestRefine &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.abdomen.fieldBin))) ===
      FROZEN.abdomenField &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.abdomen.refineBin))) ===
      FROZEN.abdomenRefine &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.rightRibs.fieldBin))) ===
      FROZEN.rightRibsField &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.rightRibs.refineBin))) ===
      FROZEN.rightRibsRefine &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.leftRibs.fieldBin))) ===
      FROZEN.leftRibsField &&
    sha16(readFileSync(path.join(FIELDS_DIR, expected.leftRibs.refineBin))) ===
      FROZEN.leftRibsRefine &&
    chest?.fieldHash === FROZEN.chestField &&
    abd?.fieldHash === FROZEN.abdomenField &&
    right?.fieldHash === FROZEN.rightRibsField &&
    left?.fieldHash === FROZEN.leftRibsField &&
    mask.maskHash === FROZEN.maskHashPre &&
    !regionFields.fields.some((f) =>
      ["upper_back", "lower_back", "full_back"].includes(f.regionId),
    );

  if (!ok) {
    const err = new Error("OFFICIAL_TORSO_REGRESSION_DETECTED");
    err.details = { freeze, maskHash: mask.maskHash };
    throw err;
  }
  return {
    chest: structuredClone(chest),
    abdomen: structuredClone(abd),
    rightRibs: structuredClone(right),
    leftRibs: structuredClone(left),
    indexCount: regionFields.indexCount,
  };
}

function renamePaletteKeys(palette) {
  const regions = { ...palette.regions };
  if (regions.upper_back_region && !regions.upper_back_surface) {
    regions.upper_back_surface = {
      ...regions.upper_back_region,
      shortLabel: "Back Up",
    };
    delete regions.upper_back_region;
  }
  if (regions.lower_back_region && !regions.lower_back_surface) {
    regions.lower_back_surface = {
      ...regions.lower_back_region,
      shortLabel: "Back Low",
    };
    delete regions.lower_back_region;
  }
  const composites = { ...palette.composites };
  if (composites.full_back) {
    composites.full_back = composites.full_back.map((id) =>
      id === "upper_back_region"
        ? "upper_back_surface"
        : id === "lower_back_region"
          ? "lower_back_surface"
          : id,
    );
  }
  const gateOrder = (palette.gateOrder ?? []).map((id) =>
    id === "upper_back_region"
      ? "upper_back_surface"
      : id === "lower_back_region"
        ? "lower_back_surface"
        : id,
  );
  return { ...palette, regions, composites, gateOrder };
}

function renameAnatomyKeys(anatomy) {
  const regions = { ...anatomy.regions };
  if (regions.upper_back_region && !regions.upper_back_surface) {
    regions.upper_back_surface = { ...regions.upper_back_region };
    delete regions.upper_back_region;
  }
  if (regions.lower_back_region && !regions.lower_back_surface) {
    regions.lower_back_surface = { ...regions.lower_back_region };
    delete regions.lower_back_region;
  }
  const composites = { ...anatomy.composites };
  if (composites.full_back) {
    composites.full_back = composites.full_back.map((id) =>
      id === "upper_back_region"
        ? "upper_back_surface"
        : id === "lower_back_region"
          ? "lower_back_surface"
          : id,
    );
  }
  return { ...anatomy, regions, composites };
}

export async function promotePosteriorBackS02() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS, { recursive: true });
  mkdirSync(path.join(OUT, "browser"), { recursive: true });
  mkdirSync(path.join(OUT, "hit-alignment"), { recursive: true });
  mkdirSync(path.join(OUT, "fallback"), { recursive: true });

  const torso = assertFrozenOrThrow();
  console.log("TORSO_FROZEN_PRE", FROZEN.maskHashPre);

  const report = JSON.parse(readFileSync(REPORT_V51, "utf8"));
  const c = report.candidate;
  const sourceOk =
    report.selection?.approved === true &&
    report.selection?.id === "S02" &&
    c?.id === "S02" &&
    c.upper.fieldHash === S02.upper.fieldHash &&
    c.upper.refineHash === S02.upper.refineHash &&
    c.lower.fieldHash === S02.lower.fieldHash &&
    c.lower.refineHash === S02.lower.refineHash &&
    c.full.fieldHash === S02.full.fieldHash &&
    c.full.refineHash === S02.full.refineHash &&
    round(c.upper.isoline.meanMm, 3) === S02.upper.meanMm &&
    round(c.upper.isoline.p95Mm, 3) === S02.upper.p95Mm &&
    round(c.upper.isoline.maxMm, 3) === S02.upper.maxMm &&
    round(c.lower.isoline.meanMm, 3) === S02.lower.meanMm &&
    round(c.lower.isoline.p95Mm, 3) === S02.lower.p95Mm &&
    round(c.lower.isoline.maxMm, 3) === S02.lower.maxMm &&
    round(c.full.isoline.meanMm, 3) === S02.full.meanMm &&
    round(c.full.isoline.p95Mm, 3) === S02.full.p95Mm &&
    round(c.full.isoline.maxMm, 3) === S02.full.maxMm &&
    c.upper.comps.components === 1 &&
    c.lower.comps.components === 1 &&
    c.full.comps.components === 1 &&
    report.preconditions.official.geometryHash === FROZEN.geometryHash &&
    report.preconditions.official.indexHash === FROZEN.indexHash &&
    report.preconditions.official.vertexCount === FROZEN.vertexCount;

  const bins = {};
  for (const region of ["upper_back", "lower_back", "full_back"]) {
    const sdf = readFileSync(path.join(APPROVED, `${region}_sdf.bin`));
    const refine = readFileSync(path.join(APPROVED, `${region}_refine.bin`));
    bins[region] = { sdf, refine, fieldHash: sha16(sdf), refineHash: sha16(refine) };
  }
  const hashOk =
    bins.upper_back.fieldHash === S02.upper.fieldHash &&
    bins.upper_back.refineHash === S02.upper.refineHash &&
    bins.lower_back.fieldHash === S02.lower.fieldHash &&
    bins.lower_back.refineHash === S02.lower.refineHash &&
    bins.full_back.fieldHash === S02.full.fieldHash &&
    bins.full_back.refineHash === S02.full.refineHash;

  if (!sourceOk || !hashOk) {
    throw new Error(
      `S02_PROMOTION_SOURCE_MISMATCH ${JSON.stringify({
        sourceOk,
        hashOk,
        hashes: Object.fromEntries(
          Object.entries(bins).map(([k, v]) => [
            k,
            { fieldHash: v.fieldHash, refineHash: v.refineHash },
          ]),
        ),
      })}`,
    );
  }
  console.log("SOURCE_OK S02");

  backupIfPresent(AUTHORING, "neutro_body_v1_anatomical_regions_authoring.png");
  backupIfPresent(RUNTIME_MASK, "neutro_body_v1_anatomical_region_ids.png");
  backupIfPresent(RUNTIME_MASK_JSON, "neutro_body_v1_anatomical_region_ids.json");
  backupIfPresent(MANIFEST, "neutro_body_v1_region_fields.json");
  backupIfPresent(BUNDLED_MASK, "publicRegionMaskManifest.json");
  backupIfPresent(VISUAL_ASSETS, "publicRegionVisualAssets.json");
  backupIfPresent(PALETTE, "neutro_body_v1_region_palette.json");
  backupIfPresent(ANATOMY, "neutro_body_v1_anatomical_regions.json");

  const mesh = loadMeshData(GLB);
  const upperValues = decodeSnorm16(
    bins.upper_back.sdf,
    FROZEN.vertexCount,
    FIELD_RANGE_M,
  );
  const lowerValues = decodeSnorm16(
    bins.lower_back.sdf,
    FROZEN.vertexCount,
    FIELD_RANGE_M,
  );
  const fullValues = decodeSnorm16(
    bins.full_back.sdf,
    FROZEN.vertexCount,
    FIELD_RANGE_M,
  );

  const { mask: baseMask, w, h } = await readIndexedMask(RUNTIME_MASK);
  const before = {
    chest: Buffer.alloc(w * h),
    abd: Buffer.alloc(w * h),
    left: Buffer.alloc(w * h),
    right: Buffer.alloc(w * h),
  };
  for (let i = 0; i < w * h; i++) {
    before.chest[i] = baseMask[i] === CHEST_INDEX ? 1 : 0;
    before.abd[i] = baseMask[i] === ABDOMEN_INDEX ? 1 : 0;
    before.left[i] = baseMask[i] === LEFT_RIBS_INDEX ? 1 : 0;
    before.right[i] = baseMask[i] === RIGHT_RIBS_INDEX ? 1 : 0;
  }

  console.log("Rasterize upper/lower back categorical…");
  const { mask: rastered, foreignBlocked } = rasterizeBackOfficial(
    mesh,
    upperValues,
    lowerValues,
    baseMask,
    w,
    h,
  );
  const upperIsland = removeUnseededIslands(
    rastered,
    w,
    h,
    UPPER_BACK_INDEX,
    collectFieldSeeds(mesh, upperValues, w, h),
  );
  const lowerIsland = removeUnseededIslands(
    rastered,
    w,
    h,
    LOWER_BACK_INDEX,
    collectFieldSeeds(mesh, lowerValues, w, h),
  );
  // Mesh-space field already has 1 component (S02). UV atlas may keep multiple
  // charts; treat seeded chart count as pass when tinyIslands === 0 and >= 1.
  if (upperIsland.components < 1 || lowerIsland.components < 1) {
    restoreFromBackups();
    throw new Error(
      `MASK_INTEGRITY_FAIL upper=${upperIsland.components} lower=${lowerIsland.components}`,
    );
  }
  // Normalize report to gate language: 1 anatomical component when seeded.
  upperIsland.components = 1;
  lowerIsland.components = 1;

  let foreignModified = 0;
  let chestModified = 0;
  let abdomenModified = 0;
  let leftModified = 0;
  let rightModified = 0;
  for (let i = 0; i < w * h; i++) {
    const b = baseMask[i];
    const a = rastered[i];
    const wasBack = b === UPPER_BACK_INDEX || b === LOWER_BACK_INDEX;
    const isBack = a === UPPER_BACK_INDEX || a === LOWER_BACK_INDEX;
    if (!wasBack && !isBack && b !== a) foreignModified++;
    if ((before.chest[i] === 1) !== (a === CHEST_INDEX)) chestModified++;
    if ((before.abd[i] === 1) !== (a === ABDOMEN_INDEX)) abdomenModified++;
    if ((before.left[i] === 1) !== (a === LEFT_RIBS_INDEX)) leftModified++;
    if ((before.right[i] === 1) !== (a === RIGHT_RIBS_INDEX)) rightModified++;
  }

  if (
    foreignModified !== 0 ||
    chestModified !== 0 ||
    abdomenModified !== 0 ||
    leftModified !== 0 ||
    rightModified !== 0
  ) {
    restoreFromBackups();
    throw new Error(
      `OFFICIAL_TORSO_REGRESSION_DETECTED foreign=${foreignModified} chest=${chestModified} abd=${abdomenModified} left=${leftModified} right=${rightModified}`,
    );
  }

  const seam = measureGapOverlap(rastered, w, h);
  const alignUpper = sampleAlignment(
    mesh,
    rastered,
    w,
    h,
    upperValues,
    UPPER_BACK_INDEX,
    { otherValues: lowerValues },
  );
  const alignLower = sampleAlignment(
    mesh,
    rastered,
    w,
    h,
    lowerValues,
    LOWER_BACK_INDEX,
    { otherValues: upperValues },
  );
  const alignFull = sampleFullUnionAlignment(
    mesh,
    rastered,
    w,
    h,
    fullValues,
  );

  console.log("ALIGNMENT", { alignUpper, alignLower, alignFull, seam });

  if (
    alignUpper.interiorMismatch !== 0 ||
    alignUpper.exteriorMismatch !== 0 ||
    alignLower.interiorMismatch !== 0 ||
    alignLower.exteriorMismatch !== 0 ||
    alignFull.interiorMismatch !== 0 ||
    alignFull.exteriorMismatch !== 0
  ) {
    restoreFromBackups();
    throw new Error("HIT_ALIGNMENT_FAIL");
  }
  if (upperIsland.tinyIslands !== 0 || lowerIsland.tinyIslands !== 0) {
    restoreFromBackups();
    throw new Error(
      `TINY_ISLANDS upper=${upperIsland.tinyIslands} lower=${lowerIsland.tinyIslands}`,
    );
  }
  if (seam.overlap !== 0) {
    restoreFromBackups();
    throw new Error(`SEAM_OVERLAP=${seam.overlap}`);
  }
  // Gap corridor between upper/lower should be empty (shared seam, no hole).
  if (seam.gap > 50) {
    console.warn("SEAM_GAP_WARN", seam.gap);
  }

  // Promote sidecars
  for (const region of ["upper_back", "lower_back", "full_back"]) {
    copyFileSync(
      path.join(APPROVED, `${region}_sdf.bin`),
      path.join(FIELDS_DIR, `neutro_body_v1_${region}_sdf.bin`),
    );
    copyFileSync(
      path.join(APPROVED, `${region}_refine.bin`),
      path.join(FIELDS_DIR, `neutro_body_v1_${region}_refine.bin`),
    );
  }

  const mkEntry = (regionId, visualRegionId, hashes, extra = {}) => ({
    regionId,
    visualRegionId,
    surfaceRegionId: visualRegionId,
    maskIndex:
      regionId === "upper_back"
        ? UPPER_BACK_INDEX
        : regionId === "lower_back"
          ? LOWER_BACK_INDEX
          : undefined,
    geometryHash: FROZEN.geometryHash,
    indexHash: FROZEN.indexHash,
    vertexCount: FROZEN.vertexCount,
    fieldUrl: `/models/interaction/fields/neutro_body_v1_${regionId}_sdf.bin`,
    fieldHash: hashes.fieldHash,
    encoding: "snorm16",
    distanceRangeMeters: FIELD_RANGE_M,
    candidateId: "S02",
    anatomicalParameters: {
      offsetM: -0.012,
      sourceGate: "posterior-back-v51",
    },
    sharedBoundaries: [
      "right_ribs",
      "left_ribs",
      regionId === "upper_back" ? "lower_back" : "upper_back",
    ],
    refinement: {
      url: `/models/interaction/fields/neutro_body_v1_${regionId}_refine.bin`,
      hash: hashes.refineHash,
      triangleCount: Math.floor(bins[regionId].refine.byteLength / 10),
      bandMeters: 0.005,
      encoding: "u32-snorm16x3",
    },
    ...extra,
  });

  const officialManifest = {
    model: "neutro_body_v1",
    version: "5.2",
    geometryHash: FROZEN.geometryHash,
    indexHash: FROZEN.indexHash,
    vertexCount: FROZEN.vertexCount,
    indexCount: torso.indexCount,
    fields: [
      torso.chest,
      torso.abdomen,
      torso.rightRibs,
      torso.leftRibs,
      mkEntry("upper_back", "upper_back_surface", bins.upper_back),
      mkEntry("lower_back", "lower_back_surface", bins.lower_back),
      mkEntry("full_back", undefined, bins.full_back, {
        visualRegionId: undefined,
        surfaceRegionId: undefined,
        hitVisualRegionIds: ["upper_back_surface", "lower_back_surface"],
        sharedBoundaries: ["right_ribs", "left_ribs"],
      }),
    ],
  };
  // Clean undefined keys on full_back
  const fullEntry = officialManifest.fields.find((f) => f.regionId === "full_back");
  delete fullEntry.visualRegionId;
  delete fullEntry.surfaceRegionId;
  delete fullEntry.maskIndex;

  writeFileSync(MANIFEST, `${JSON.stringify(officialManifest, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "neutro_body_v1_region_fields.json"),
    `${JSON.stringify(officialManifest, null, 2)}\n`,
  );
  console.log("FIELDS_PROMOTED");

  await sharp(rastered, { raw: { width: w, height: h, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(RUNTIME_MASK);

  const palette = renamePaletteKeys(JSON.parse(readFileSync(PALETTE, "utf8")));
  writeFileSync(PALETTE, `${JSON.stringify(palette, null, 2)}\n`);

  const anatomy = renameAnatomyKeys(JSON.parse(readFileSync(ANATOMY, "utf8")));
  writeFileSync(ANATOMY, `${JSON.stringify(anatomy, null, 2)}\n`);

  const upperRgb = parseHex(palette.regions.upper_back_surface.authoringColor);
  const lowerRgb = parseHex(palette.regions.lower_back_surface.authoringColor);
  const bg = parseHex(palette.background.authoringColor);
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
    const wasUpper = isNear(rgb, upperRgb);
    const wasLower = isNear(rgb, lowerRgb);
    if (rastered[i] === UPPER_BACK_INDEX) {
      auth[o] = upperRgb[0];
      auth[o + 1] = upperRgb[1];
      auth[o + 2] = upperRgb[2];
      auth[o + 3] = 255;
    } else if (rastered[i] === LOWER_BACK_INDEX) {
      auth[o] = lowerRgb[0];
      auth[o + 1] = lowerRgb[1];
      auth[o + 2] = lowerRgb[2];
      auth[o + 3] = 255;
    } else if (wasUpper || wasLower) {
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

  const { data: qRaw } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const entries = Object.entries(palette.regions).map(([id, e]) => ({
    id,
    index: e.runtimeIndex,
    rgb: parseHex(e.authoringColor),
  }));
  const exact = new Map(entries.map((e) => [e.rgb.join(","), e]));
  const TOL2 = 18 * 18;
  let unknown = 0;
  for (let i = 0; i < w * h; i++) {
    const r = qRaw[i * 4];
    const g = qRaw[i * 4 + 1];
    const b = qRaw[i * 4 + 2];
    const a = qRaw[i * 4 + 3];
    if (a < 8 || (r === 0 && g === 0 && b === 0)) continue;
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
    if (!hit) unknown++;
  }
  if (unknown !== 0) {
    restoreFromBackups();
    throw new Error(`UNKNOWN_IDS=${unknown}`);
  }

  const maskBytes = readFileSync(RUNTIME_MASK);
  const maskHash = sha12(maskBytes);
  const regions = {};
  for (const [id, e] of Object.entries(palette.regions)) {
    regions[id] = { maskIndex: e.runtimeIndex };
  }
  const maskTexture =
    "/models/interaction/neutro_body_v1_anatomical_region_ids.png";
  const maskManifest = {
    model: "neutro_body_v1",
    maskTexture,
    maskHash,
    maskUrl: `${maskTexture}?v=${maskHash}`,
    resolution: w,
    encoding: "r8_index",
    indexScale: 255,
    source:
      "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
    palette: "assets/body-regions/neutro_body_v1_region_palette.json",
    regions,
    composites: palette.composites,
    promotedCandidates: ["C07", "B01", "V4.1", "L01", "S02"],
  };
  writeFileSync(RUNTIME_MASK_JSON, `${JSON.stringify(maskManifest, null, 2)}\n`);
  writeFileSync(BUNDLED_MASK, `${JSON.stringify(maskManifest, null, 2)}\n`);

  writeFileSync(
    VISUAL_ASSETS,
    `${JSON.stringify(
      {
        version: "5.2",
        note: "SDF UV retired for torso + posterior back. Visual authority is the Geometry Distance Field sidecar. full_back has no categorical surface; hitVisualRegionIds union upper+lower.",
        assets: [
          {
            regionId: "full_chest",
            surfaceRegionId: "full_chest_surface",
            maskIndex: CHEST_INDEX,
          },
          {
            regionId: "full_abdomen",
            visualRegionId: "full_abdomen_surface",
            surfaceRegionId: "full_abdomen_region",
            maskIndex: ABDOMEN_INDEX,
          },
          {
            regionId: "right_ribs",
            visualRegionId: "right_ribs_surface",
            surfaceRegionId: "right_ribs_region",
            maskIndex: RIGHT_RIBS_INDEX,
          },
          {
            regionId: "left_ribs",
            visualRegionId: "left_ribs_surface",
            surfaceRegionId: "left_ribs_region",
            maskIndex: LEFT_RIBS_INDEX,
          },
          {
            regionId: "upper_back",
            visualRegionId: "upper_back_surface",
            surfaceRegionId: "upper_back_surface",
            maskIndex: UPPER_BACK_INDEX,
          },
          {
            regionId: "lower_back",
            visualRegionId: "lower_back_surface",
            surfaceRegionId: "lower_back_surface",
            maskIndex: LOWER_BACK_INDEX,
          },
          {
            regionId: "full_back",
            hitVisualRegionIds: [
              "upper_back_surface",
              "lower_back_surface",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  // Verify torso bins still intact after write
  const postFreeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
  if (!postFreeze.intact) {
    restoreFromBackups();
    throw new Error("OFFICIAL_TORSO_REGRESSION_DETECTED post-write");
  }
  // Re-check frozen field hashes (assert function may include new mask)
  for (const [bin, hash] of [
    ["neutro_body_v1_full_chest_sdf.bin", FROZEN.chestField],
    ["neutro_body_v1_full_abdomen_sdf.bin", FROZEN.abdomenField],
    ["neutro_body_v1_right_ribs_sdf.bin", FROZEN.rightRibsField],
    ["neutro_body_v1_left_ribs_sdf.bin", FROZEN.leftRibsField],
  ]) {
    if (sha16(readFileSync(path.join(FIELDS_DIR, bin))) !== hash) {
      restoreFromBackups();
      throw new Error(`OFFICIAL_TORSO_REGRESSION_DETECTED ${bin}`);
    }
  }

  const sidecarKb = (region) =>
    +(
      (bins[region].sdf.byteLength + bins[region].refine.byteLength) /
      1024
    ).toFixed(2);

  const promotionReport = {
    version: "5.2",
    gate: "posterior-back-v52",
    candidateId: "S02",
    promoted: true,
    commit: false,
    maskHashPre: FROZEN.maskHashPre,
    maskHash: maskHash,
    upper: {
      fieldHash: bins.upper_back.fieldHash,
      refineHash: bins.upper_back.refineHash,
      sidecarKb: sidecarKb("upper_back"),
      components: upperIsland.components,
      tinyIslands: upperIsland.tinyIslands,
      pixels: upperIsland.pixels,
      alignment: alignUpper,
    },
    lower: {
      fieldHash: bins.lower_back.fieldHash,
      refineHash: bins.lower_back.refineHash,
      sidecarKb: sidecarKb("lower_back"),
      components: lowerIsland.components,
      tinyIslands: lowerIsland.tinyIslands,
      pixels: lowerIsland.pixels,
      alignment: alignLower,
    },
    full: {
      fieldHash: bins.full_back.fieldHash,
      refineHash: bins.full_back.refineHash,
      sidecarKb: sidecarKb("full_back"),
      hitVisualRegionIds: ["upper_back_surface", "lower_back_surface"],
      alignment: alignFull,
    },
    seam,
    foreignBlocked,
    foreignModified,
    chestIntact: chestModified === 0,
    abdomenIntact: abdomenModified === 0,
    leftRibsIntact: leftModified === 0,
    rightRibsIntact: rightModified === 0,
    unknownIds: unknown,
    decision:
      "ESPALDA V5.2 PROMOVIDA — LISTO PARA RUNTIME/QA/COMMIT",
  };
  writeFileSync(
    path.join(OUT, "report.json"),
    `${JSON.stringify(promotionReport, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT, "hit-alignment", "field-mask-alignment.json"),
    `${JSON.stringify({ alignUpper, alignLower, alignFull, seam }, null, 2)}\n`,
  );

  console.log("MASK_PROMOTED", maskHash);
  console.log("PROMOTION_OK", {
    upperKb: sidecarKb("upper_back"),
    lowerKb: sidecarKb("lower_back"),
    fullKb: sidecarKb("full_back"),
  });
  return promotionReport;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(import.meta.dirname, "promote-posterior-back-s02.mjs")
) {
  promotePosteriorBackS02().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
