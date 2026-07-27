/**
 * Extract the shared chest↔abdomen inferior seam from official C07 refinement.
 *
 * Reads the frozen full_chest field + refine sidecars, keeps only triangles
 * whose zero isoline belongs to C07.lowerY, and writes a reusable seam asset.
 *
 *   node tools/body-regions/extract-chest-abdomen-seam.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadMeshData } from "../body-mask/glb.mjs";
import {
  decodeSnorm16,
  FIELD_RANGE_M,
} from "./generate-full-chest-geometry-field.mjs";
import {
  buildInferiorControls,
  buildV26Context,
} from "./full-chest-v26.mjs";
import { buildBoundaries } from "./generate-full-chest-v21.mjs";
import { FROZEN_C07, OFFICIAL_CHEST_HASHES } from "./full-abdomen-v30.mjs";
import { computeSSurface } from "./surface-s-field.mjs";
import {
  hashFloat32Canonical,
  hashUint32Canonical,
} from "./geometry-field-hash.mjs";
import { parseGlb, readAccessor } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const OUT = path.join(ROOT, "artifacts/full-abdomen-v31");

function contentHash16(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function assertChestFrozen() {
  const fieldBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
  );
  const refineBin = readFileSync(
    path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
  );
  const manifest = JSON.parse(
    readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
  );
  const chest = manifest.fields.find((f) => f.regionId === "full_chest");
  const maskManifest = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
      "utf8",
    ),
  );
  const ok =
    maskManifest.maskHash === OFFICIAL_CHEST_HASHES.maskHash &&
    chest?.fieldHash === OFFICIAL_CHEST_HASHES.fieldHash &&
    chest?.refinement?.hash === OFFICIAL_CHEST_HASHES.refinementHash &&
    chest?.candidateId === OFFICIAL_CHEST_HASHES.candidateId &&
    contentHash16(fieldBin) === OFFICIAL_CHEST_HASHES.fieldHash &&
    contentHash16(refineBin) === OFFICIAL_CHEST_HASHES.refinementHash;
  if (!ok) {
    console.error("FULL_CHEST_REGRESSION_DETECTED");
    process.exit(2);
  }
  return { fieldBin, refineBin, chest, maskHash: maskManifest.maskHash };
}

function decodeRefine(buffer, range = FIELD_RANGE_M) {
  const count = Math.floor(buffer.length / 10);
  const triangles = new Uint32Array(count);
  const midValues = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    triangles[i] = buffer.readUInt32LE(i * 10);
    for (let k = 0; k < 3; k++) {
      midValues[i * 3 + k] =
        (buffer.readInt16LE(i * 10 + 4 + k * 2) / 32767) * range;
    }
  }
  return { triangles, midValues };
}

/**
 * A refined triangle belongs to the inferior seam when its zero-crossing
 * midpoints sit nearer to C07.lowerY than to upperY / laterals.
 */
function isInferiorSeamTriangle(mesh, t, values, bounds, field) {
  const I = mesh.indices;
  const P = mesh.positions;
  const a = I[t * 3];
  const b = I[t * 3 + 1];
  const c = I[t * 3 + 2];
  const fa = values[a];
  const fb = values[b];
  const fc = values[c];
  if (!(Math.min(fa, fb, fc) <= 0 && Math.max(fa, fb, fc) >= 0)) return false;

  // Edge midpoints that straddle zero.
  const pairs = [
    [a, b, fa, fb],
    [b, c, fb, fc],
    [c, a, fc, fa],
  ];
  let lowerVotes = 0;
  let upperVotes = 0;
  let samples = 0;
  for (const [i, j, di, dj] of pairs) {
    if ((di > 0 && dj > 0) || (di < 0 && dj < 0) || di === dj) continue;
    const k = di / (di - dj);
    const x = P[i * 3] + (P[j * 3] - P[i * 3]) * k;
    const y = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k;
    const z = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k;
    const r = computeSSurface(x, y, z, field);
    const s = r?.s ?? 0;
    const sClamped = Math.max(-1, Math.min(1, s));
    const dLower = Math.abs(y - bounds.lowerY(sClamped));
    const dUpper = Math.abs(y - bounds.upperY(sClamped));
    const dRight = Math.abs(s - bounds.rightS(y));
    const dLeft = Math.abs(s - bounds.leftS(y));
    samples++;
    if (dLower <= dUpper && dLower <= Math.min(dRight, dLeft) * 0.08 + 0.008) {
      lowerVotes++;
    } else if (dUpper < dLower) {
      upperVotes++;
    }
  }
  if (samples === 0) return false;
  // Prefer triangles whose centroid y is near the inferior curve.
  const cy =
    (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  const rs = computeSSurface(cx, cy, cz, field);
  const s0 = Math.max(-1, Math.min(1, rs?.s ?? 0));
  const nearLower = Math.abs(cy - bounds.lowerY(s0)) < 0.012;
  return lowerVotes >= upperVotes && (lowerVotes > 0 || nearLower);
}

export function extractSharedChestAbdomenSeam() {
  mkdirSync(OUT, { recursive: true });
  const frozen = assertChestFrozen();
  const mesh = loadMeshData(GLB);
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const ctx = buildV26Context(GLB, LANDMARKS);
  const inferiorControls = buildInferiorControls(
    lm,
    ctx.field,
    FROZEN_C07.inferiorCenterTransition,
  );
  const bounds = buildBoundaries(lm, { ...FROZEN_C07, inferiorControls });
  const values = decodeSnorm16(
    frozen.fieldBin,
    mesh.vertexCount,
    FIELD_RANGE_M,
  );
  const refine = decodeRefine(frozen.refineBin);

  const seamTris = [];
  const seamMids = [];
  const refinedPositions = [];
  const barycentric = [];
  const curveSamples = [];

  for (let i = 0; i < refine.triangles.length; i++) {
    const t = refine.triangles[i];
    if (!isInferiorSeamTriangle(mesh, t, values, bounds, ctx.field)) continue;
    seamTris.push(t);
    const m0 = refine.midValues[i * 3];
    const m1 = refine.midValues[i * 3 + 1];
    const m2 = refine.midValues[i * 3 + 2];
    seamMids.push(m0, m1, m2);

    const I = mesh.indices;
    const P = mesh.positions;
    const a = I[t * 3];
    const b = I[t * 3 + 1];
    const c = I[t * 3 + 2];
    const mids = [
      [
        (P[a * 3] + P[b * 3]) / 2,
        (P[a * 3 + 1] + P[b * 3 + 1]) / 2,
        (P[a * 3 + 2] + P[b * 3 + 2]) / 2,
      ],
      [
        (P[b * 3] + P[c * 3]) / 2,
        (P[b * 3 + 1] + P[c * 3 + 1]) / 2,
        (P[b * 3 + 2] + P[c * 3 + 2]) / 2,
      ],
      [
        (P[c * 3] + P[a * 3]) / 2,
        (P[c * 3 + 1] + P[a * 3 + 1]) / 2,
        (P[c * 3 + 2] + P[a * 3 + 2]) / 2,
      ],
    ];
    for (const p of mids) {
      refinedPositions.push(p);
      const r = computeSSurface(p[0], p[1], p[2], ctx.field);
      curveSamples.push({
        point: p.map((v) => +v.toFixed(6)),
        s: r?.s ?? null,
        y: +p[1].toFixed(6),
      });
    }
    barycentric.push(
      { edge: "ab", u: 0.5, v: 0.5, w: 0 },
      { edge: "bc", u: 0, v: 0.5, w: 0.5 },
      { edge: "ca", u: 0.5, v: 0, w: 0.5 },
    );
  }

  // Order curve samples by s_surface for a continuous inferior isoline.
  const ordered = curveSamples
    .filter((s) => s.s != null && Number.isFinite(s.s))
    .sort((a, b) => a.s - b.s);

  const gltf = parseGlb(GLB);
  const primitive = gltf.json.meshes[0].primitives[0];
  const positions = readAccessor(gltf, primitive.attributes.POSITION);
  const indices = readAccessor(gltf, primitive.indices);
  const geometryHash = hashFloat32Canonical(positions.data);
  const indexHash = hashUint32Canonical(indices.data);

  const payload = {
    version: "3.1",
    candidateId: "C07",
    geometryHash,
    indexHash,
    fieldHash: OFFICIAL_CHEST_HASHES.fieldHash,
    refinementHash: OFFICIAL_CHEST_HASHES.refinementHash,
    maskHash: frozen.maskHash,
    triangleCount: seamTris.length,
    triangles: seamTris,
    midValues: seamMids,
    barycentric,
    refinedPositions: refinedPositions.map((p) =>
      p.map((v) => +v.toFixed(6)),
    ),
    curveOrder: ordered,
    seamHash: contentHash16(
      Buffer.from(
        JSON.stringify({
          triangles: seamTris,
          midValues: seamMids.map((v) => +v.toFixed(6)),
        }),
      ),
    ),
  };

  const outFile = path.join(OUT, "shared-chest-abdomen-seam.json");
  writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(
    "SEAM_EXTRACTED",
    JSON.stringify({
      triangles: seamTris.length,
      curvePoints: ordered.length,
      seamHash: payload.seamHash,
      outFile,
    }),
  );
  return payload;
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("extract-chest-abdomen-seam.mjs")
) {
  extractSharedChestAbdomenSeam();
}
