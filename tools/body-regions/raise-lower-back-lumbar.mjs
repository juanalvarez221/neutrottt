/**
 * Surgical raise of lower_back into true lumbar territory.
 *
 *   node tools/body-regions/raise-lower-back-lumbar.mjs
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
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  decodeSnorm16,
  encodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/lower-back-lumbar-raise");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");
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

const UPPER_BACK_INDEX = 14;
const LOWER_BACK_INDEX = 15;
const FLOOR_Y = 0.972;
const SEAM_Y = 1.092;
const POSTERIOR_Z_MAX = 0.035;

function sha16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

async function loadMaskR8(p) {
  const { data, info } = await sharp(p)
    
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const out = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * ch];
  return { mask: out, w: info.width, h: info.height };
}

function rasterizeBack(mesh, upperValues, lowerValues, baseMask, w, h) {
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
  stampField(lowerValues, LOWER_BACK_INDEX, 26);
  for (let i = 0; i < out.length; i++) {
    const cov = coverage[i];
    if (!cov) continue;
    if (
      out[i] !== 0 &&
      out[i] !== UPPER_BACK_INDEX &&
      out[i] !== LOWER_BACK_INDEX
    ) {
      continue;
    }
    out[i] = cov;
  }
  return out;
}

function countPositives(values, mesh) {
  let n = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  const P = mesh.positions;
  for (let i = 0; i < values.length; i++) {
    if (values[i] <= 0) continue;
    n++;
    const y = P[i * 3 + 1];
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  return {
    n,
    yMin: Number.isFinite(yMin) ? +yMin.toFixed(4) : null,
    yMax: Number.isFinite(yMax) ? +yMax.toFixed(4) : null,
  };
}

function raiseLowerBack(mesh, upperIn, lowerIn) {
  const upper = Float32Array.from(upperIn);
  const lower = Float32Array.from(lowerIn);
  const P = mesh.positions;
  let raisedOut = 0;
  let claimed = 0;
  let clearedSacral = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (z > POSTERIOR_Z_MAX) continue;
    if (y < FLOOR_Y) {
      if (lower[i] > 0) {
        lower[i] = -Math.max(0.002, FLOOR_Y - y);
        clearedSacral++;
      }
      continue;
    }
    if (y <= SEAM_Y) {
      const wasUpper = upper[i] > 0;
      const wasLower = lower[i] > 0;
      if (!wasUpper && !wasLower) continue;
      const dFloor = y - FLOOR_Y;
      const dSeam = SEAM_Y - y;
      const lateralSoft = Math.max(0.002, 0.14 - Math.abs(x));
      const seed = Math.max(
        wasUpper ? upper[i] : 0,
        wasLower ? lower[i] : 0,
        0.0015,
      );
      const d = Math.min(seed, dFloor, dSeam, lateralSoft);
      lower[i] = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
      if (wasUpper) {
        upper[i] = -Math.max(0.0015, Math.min(dSeam, 0.008));
        claimed++;
      }
      if (!wasLower) raisedOut++;
    }
  }
  const full = new Float32Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    full[i] = Math.max(upper[i], lower[i]);
  }
  return { upper, lower, full, stats: { raisedOut, claimed, clearedSacral } };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const mesh = await loadMeshData(GLB);
  const upperBuf = readFileSync(path.join(FIELDS, "neutro_body_v1_upper_back_sdf.bin"));
  const lowerBuf = readFileSync(path.join(FIELDS, "neutro_body_v1_lower_back_sdf.bin"));
  const upper = decodeSnorm16(upperBuf, mesh.vertexCount);
  const lower = decodeSnorm16(lowerBuf, mesh.vertexCount);
  const beforeLower = countPositives(lower, mesh);
  const beforeUpper = countPositives(upper, mesh);
  console.log("BEFORE lower", beforeLower, "upper", beforeUpper);
  const { upper: up2, lower: lo2, full, stats } = raiseLowerBack(mesh, upper, lower);
  const afterLower = countPositives(lo2, mesh);
  const afterUpper = countPositives(up2, mesh);
  console.log("AFTER  lower", afterLower, "upper", afterUpper, stats);
  if (afterLower.yMin != null && afterLower.yMin < FLOOR_Y - 0.01) {
    throw new Error("lower_back still too low: yMin=" + afterLower.yMin);
  }
  if (afterLower.n < 80) {
    throw new Error("lower_back too sparse after raise: " + afterLower.n);
  }
  const upEnc = encodeSnorm16(up2);
  const loEnc = encodeSnorm16(lo2);
  const fullEnc = encodeSnorm16(full);
  for (const [name, buf] of [
    ["neutro_body_v1_upper_back_sdf.bin", upEnc],
    ["neutro_body_v1_lower_back_sdf.bin", loEnc],
    ["neutro_body_v1_full_back_sdf.bin", fullEnc],
  ]) {
    const dest = path.join(FIELDS, name);
    copyFileSync(dest, path.join(OUT, "backup_" + name));
    writeFileSync(dest, buf);
    console.log("WROTE", name, sha16(buf));
  }
  const { mask, w, h } = await loadMaskR8(RUNTIME_MASK);
  const nextMask = rasterizeBack(mesh, up2, lo2, mask, w, h);
  const maskPng = await sharp(nextMask, {
    raw: { width: w, height: h, channels: 1 },
  })
    .png()
    .toBuffer();
  copyFileSync(RUNTIME_MASK, path.join(OUT, "backup_mask.png"));
  writeFileSync(RUNTIME_MASK, maskPng);
  const maskHash = sha12(maskPng);
  console.log("MASK", maskHash, w + "x" + h);
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const patch = {
    upper_back: { fieldHash: sha16(upEnc) },
    lower_back: {
      fieldHash: sha16(loEnc),
      anatomicalParameters: {
        offsetM: 0.018,
        sourceGate: "lower-back-lumbar-raise",
        floorY: FLOOR_Y,
        seamY: SEAM_Y,
      },
    },
    full_back: { fieldHash: sha16(fullEnc) },
  };
  for (const f of manifest.fields) {
    const p = patch[f.regionId];
    if (!p) continue;
    f.fieldHash = p.fieldHash;
    if (p.anatomicalParameters) f.anatomicalParameters = p.anatomicalParameters;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  for (const jsonPath of [RUNTIME_MASK_JSON, BUNDLED_MASK]) {
    if (!existsSync(jsonPath)) continue;
    const j = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (j.maskHash !== undefined) j.maskHash = maskHash;
    if (j.maskUrl && j.maskTexture) {
      j.maskUrl = j.maskTexture.split("?")[0] + "?v=" + maskHash;
    }
    writeFileSync(jsonPath, JSON.stringify(j, null, 2) + "\n");
    console.log("UPDATED", path.relative(ROOT, jsonPath));
  }
  const report = {
    floorY: FLOOR_Y,
    seamY: SEAM_Y,
    before: { lower: beforeLower, upper: beforeUpper },
    after: { lower: afterLower, upper: afterUpper },
    stats,
    hashes: patch,
    maskHash,
  };
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("OK", path.join(OUT, "report.json"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
