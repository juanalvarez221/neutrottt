/**
 * UV seam coherence audit for anatomical region ID mask.
 *
 * Finds mesh vertices that share position but have different UVs (seam),
 * samples both UV sides on the indexed mask, and reports ID mismatches.
 *
 *   node tools/body-regions/audit-uv-seam-coherence.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const FALLBACK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.png",
);
const MANIFEST = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const FALLBACK_MANIFEST = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.json",
);

function quantizePos(x, y, z) {
  return `${(x * 1e5) | 0},${(y * 1e5) | 0},${(z * 1e5) | 0}`;
}

async function main() {
  const maskPath = MASK;
  const useMask = (() => {
    try {
      readFileSync(maskPath);
      return maskPath;
    } catch {
      return FALLBACK;
    }
  })();
  const manifestPath = useMask === MASK ? MANIFEST : FALLBACK_MANIFEST;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const indexToId = new Map(
    Object.entries(manifest.regions).map(([id, e]) => [e.maskIndex, id]),
  );

  const mesh = loadMeshData(GLB);
  const { positions, uvs } = mesh;
  if (!uvs) throw new Error("mesh has no UVs");

  const posGroups = new Map();
  const vertCount = positions.length / 3;
  for (let vi = 0; vi < vertCount; vi++) {
    const key = quantizePos(
      positions[vi * 3],
      positions[vi * 3 + 1],
      positions[vi * 3 + 2],
    );
    let arr = posGroups.get(key);
    if (!arr) {
      arr = [];
      posGroups.set(key, arr);
    }
    arr.push(vi);
  }

  const { data, info } = await sharp(useMask)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  function sample(u, v) {
    // GL TF / OpenGL UV: v often needs flip for image space
    let uu = u - Math.floor(u);
    let vv = 1 - (v - Math.floor(v));
    const x = Math.min(w - 1, Math.max(0, Math.round(uu * (w - 1))));
    const y = Math.min(h - 1, Math.max(0, Math.round(vv * (h - 1))));
    return data[(y * w + x) * 4];
  }

  let seamVerts = 0;
  let mismatches = 0;
  const examples = [];
  const regionHits = new Map();

  for (const verts of posGroups.values()) {
    if (verts.length < 2) continue;
    const uvKeys = new Set();
    const ids = new Set();
    for (const vi of verts) {
      const u = uvs[vi * 2];
      const v = uvs[vi * 2 + 1];
      uvKeys.add(`${(u * 1e4) | 0},${(v * 1e4) | 0}`);
      ids.add(sample(u, v));
    }
    if (uvKeys.size < 2) continue;
    seamVerts += 1;
    if (ids.size > 1) {
      mismatches += 1;
      const names = [...ids].map((i) => indexToId.get(i) ?? `idx_${i}`);
      for (const n of names) regionHits.set(n, (regionHits.get(n) ?? 0) + 1);
      if (examples.length < 25) {
        const vi = verts[0];
        examples.push({
          pos: [
            positions[vi * 3],
            positions[vi * 3 + 1],
            positions[vi * 3 + 2],
          ],
          ids: names,
        });
      }
    }
  }

  console.log("mask", path.relative(ROOT, useMask));
  console.log("seam_vertex_clusters", seamVerts);
  console.log("uv_seam_id_mismatches", mismatches);
  console.log(
    "top_mismatch_regions",
    [...regionHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  );
  if (examples.length) {
    console.log("examples", JSON.stringify(examples.slice(0, 5), null, 2));
  }
  if (mismatches > 0) process.exitCode = 3;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
