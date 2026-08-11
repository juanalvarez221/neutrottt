/**
 * Surgical repair of neck quadrant fields (front/right/back/left).
 * Cartesian anatomical authority - fixes swapped/skewed V6.3 sidecars.
 *
 *   node tools/body-regions/repair-neck-quadrants.mjs
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
  encodeSnorm16,
  FIELD_RANGE_M,
  OUTSIDE_DEFAULT_M,
} from "./generate-full-chest-geometry-field.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/neck-quadrant-repair");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
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

const NECK_INDEX = {
  neck_front: 5,
  neck_back: 6,
  neck_left: 7,
  neck_right: 8,
};

/** Slim collar band - not jaw, not traps/shoulders. */
const Y_BOT = 1.455;
const Y_TOP = 1.582;
const CX = 0;
const CZ = -0.112;
const R_MAX = 0.092;
const QUAD_HALF = Math.PI / 4 + 0.12;

function sha16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
function sha12(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** theta=0 anterior (+Z), +pi/2 left (+X), +/-pi posterior, -pi/2 right (-X). */
function neckTheta(x, z) {
  return Math.atan2(x - CX, z - CZ);
}

function angularSigned(theta, region) {
  if (region === "neck_back") {
    const d2 = Math.abs(Math.abs(theta) - Math.PI);
    return QUAD_HALF - d2;
  }
  let center = 0;
  if (region === "neck_left") center = Math.PI / 2;
  else if (region === "neck_right") center = -Math.PI / 2;
  let d = theta - center;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return QUAD_HALF - Math.abs(d);
}

function buildQuadrantField(mesh, region) {
  const values = new Float32Array(mesh.vertexCount);
  const P = mesh.positions;
  let positives = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (y < Y_BOT - 0.02 || y > Y_TOP + 0.02) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    const r = Math.hypot(x - CX, z - CZ);
    if (r > R_MAX + 0.06) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }

    if (region === "neck_back") {
      // Strictly posterior nape; kill traps/shoulders.
      if (z > -0.065) {
        values[i] = OUTSIDE_DEFAULT_M;
        continue;
      }
      if (Math.abs(x) > 0.088) {
        values[i] = OUTSIDE_DEFAULT_M;
        continue;
      }
      if (y < 1.448 && Math.abs(x) > 0.055) {
        values[i] = OUTSIDE_DEFAULT_M;
        continue;
      }
    }
    if (region === "neck_front") {
      if (z < -0.12) {
        values[i] = OUTSIDE_DEFAULT_M;
        continue;
      }
      if (Math.abs(x) > 0.085) {
        values[i] = OUTSIDE_DEFAULT_M;
        continue;
      }
    }
    if (region === "neck_left" && x < 0.01) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }
    if (region === "neck_right" && x > -0.01) {
      values[i] = OUTSIDE_DEFAULT_M;
      continue;
    }

    const theta = neckTheta(x, z);
    const dAng = angularSigned(theta, region);
    const dAngM = dAng * Math.max(0.04, r);
    const dRad = R_MAX - r;
    const dY = Math.min(y - Y_BOT, Y_TOP - y);

    const d = Math.min(dAngM, dRad, dY);
    values[i] = clamp(d, -FIELD_RANGE_M, FIELD_RANGE_M);
    if (values[i] > 0) positives++;
  }
  return { values, positives };
}

function classify(values, mesh) {
  const P = mesh.positions;
  let ant = 0;
  let post = 0;
  let left = 0;
  let right = 0;
  let n = 0;
  let sumX = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] <= 0) continue;
    n++;
    const x = P[i * 3];
    const z = P[i * 3 + 2];
    sumX += x;
    if (z > -0.08) ant++;
    else post++;
    if (x > 0.02) left++;
    else if (x < -0.02) right++;
  }
  return {
    n,
    ant,
    post,
    left,
    right,
    meanX: n ? Number((sumX / n).toFixed(4)) : null,
  };
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

function rasterizeNeck(mesh, fields, baseMask, w, h) {
  const out = Buffer.from(baseMask);
  for (let i = 0; i < out.length; i++) {
    if (
      out[i] === NECK_INDEX.neck_front ||
      out[i] === NECK_INDEX.neck_back ||
      out[i] === NECK_INDEX.neck_left ||
      out[i] === NECK_INDEX.neck_right
    ) {
      out[i] = 0;
    }
  }
  const UV = mesh.uvs;
  const best = new Float64Array(w * h).fill(-Infinity);
  const cov = new Int8Array(w * h);
  const stamp = (values, index, radius) => {
    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      if (values[vi] <= 0) continue;
      const u = UV[vi * 2];
      const v = UV[vi * 2 + 1];
      const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const idx = y * w + x;
          if (values[vi] < best[idx]) continue;
          best[idx] = values[vi];
          cov[idx] = index;
        }
      }
    }
  };
  stamp(fields.neck_front, NECK_INDEX.neck_front, 14);
  stamp(fields.neck_back, NECK_INDEX.neck_back, 16);
  stamp(fields.neck_left, NECK_INDEX.neck_left, 12);
  stamp(fields.neck_right, NECK_INDEX.neck_right, 12);
  for (let i = 0; i < out.length; i++) {
    if (!cov[i]) continue;
    if (
      out[i] !== 0 &&
      out[i] !== NECK_INDEX.neck_front &&
      out[i] !== NECK_INDEX.neck_back &&
      out[i] !== NECK_INDEX.neck_left &&
      out[i] !== NECK_INDEX.neck_right
    ) {
      continue;
    }
    out[i] = cov[i];
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const mesh = await loadMeshData(GLB);
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  console.log("landmarks", {
    front: lm.points.neckBaseFront,
    back: lm.points.neckBaseBack,
  });

  const regions = ["neck_front", "neck_right", "neck_back", "neck_left"];
  const fields = {};
  const report = { regions: {}, gates: { Y_BOT, Y_TOP, R_MAX, CX, CZ } };

  for (const region of regions) {
    const { values, positives } = buildQuadrantField(mesh, region);
    const cls = classify(values, mesh);
    console.log(region, { positives, ...cls });
    report.regions[region] = { positives, ...cls };
    fields[region] = values;

    if (region === "neck_back") {
      if (cls.post < cls.ant * 2) {
        throw new Error(
          "neck_back still too anterior: " + JSON.stringify(cls),
        );
      }
      if (cls.n < 70) throw new Error("neck_back too sparse: " + cls.n);
      if (Math.abs(cls.meanX) > 0.025) {
        throw new Error(
          "neck_back not centered meanX: " + JSON.stringify(cls),
        );
      }
      if (Math.abs(cls.left - cls.right) > cls.n * 0.55) {
        throw new Error("neck_back too lateral: " + JSON.stringify(cls));
      }
    }
    if (region === "neck_front" && cls.ant < cls.post) {
      throw new Error("neck_front not anterior: " + JSON.stringify(cls));
    }
    if (region === "neck_left" && cls.left < cls.right) {
      throw new Error("neck_left not left: " + JSON.stringify(cls));
    }
    if (region === "neck_right" && cls.right < cls.left) {
      throw new Error("neck_right not right: " + JSON.stringify(cls));
    }
  }

  const full = new Float32Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    full[i] = Math.max(
      fields.neck_front[i],
      fields.neck_back[i],
      fields.neck_left[i],
      fields.neck_right[i],
    );
  }
  fields.full_neck = full;

  const hashes = {};
  for (const region of [...regions, "full_neck"]) {
    const enc = encodeSnorm16(fields[region]);
    const name = "neutro_body_v1_" + region + "_sdf.bin";
    const dest = path.join(FIELDS, name);
    if (existsSync(dest)) copyFileSync(dest, path.join(OUT, "backup_" + name));
    writeFileSync(dest, enc);
    hashes[region] = sha16(enc);
    console.log("WROTE", name, hashes[region]);
  }

  const { mask, w, h } = await loadMaskR8(RUNTIME_MASK);
  const nextMask = rasterizeNeck(
    mesh,
    {
      neck_front: fields.neck_front,
      neck_back: fields.neck_back,
      neck_left: fields.neck_left,
      neck_right: fields.neck_right,
    },
    mask,
    w,
    h,
  );
  const maskPng = await sharp(nextMask, {
    raw: { width: w, height: h, channels: 1 },
  })
    .png()
    .toBuffer();
  copyFileSync(RUNTIME_MASK, path.join(OUT, "backup_mask.png"));
  writeFileSync(RUNTIME_MASK, maskPng);
  const maskHash = sha12(maskPng);
  console.log("MASK", maskHash, w + "x" + h);

  const counts = { 5: 0, 6: 0, 7: 0, 8: 0 };
  for (let i = 0; i < nextMask.length; i++) {
    if (counts[nextMask[i]] !== undefined) counts[nextMask[i]]++;
  }
  console.log("mask neck pixels", counts);
  report.maskPixels = counts;

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  for (const f of manifest.fields) {
    if (!hashes[f.regionId]) continue;
    f.fieldHash = hashes[f.regionId];
    f.fieldUrl =
      "/models/interaction/fields/neutro_body_v1_" +
      f.regionId +
      "_sdf.bin?v=" +
      hashes[f.regionId];
    f.anatomicalParameters = {
      ...(f.anatomicalParameters || {}),
      sourceGate: "neck-quadrant-repair",
      yBot: Y_BOT,
      yTop: Y_TOP,
      rMax: R_MAX,
    };
    if (f.refinement) delete f.refinement;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  for (const jsonPath of [RUNTIME_MASK_JSON, BUNDLED_MASK]) {
    if (!existsSync(jsonPath)) continue;
    const j = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (j.maskHash !== undefined) j.maskHash = maskHash;
    if (j.maskUrl) {
      const base = String(j.maskTexture || j.maskUrl).split("?")[0];
      j.maskUrl = base + "?v=" + maskHash;
    }
    if (j.maskTexture) {
      const base = String(j.maskTexture).split("?")[0];
      j.maskTexture = base + "?v=" + maskHash;
    }
    writeFileSync(jsonPath, JSON.stringify(j, null, 2) + "\n");
    console.log("UPDATED", path.relative(ROOT, jsonPath));
  }

  report.hashes = hashes;
  report.maskHash = maskHash;
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("OK", path.join(OUT, "report.json"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
