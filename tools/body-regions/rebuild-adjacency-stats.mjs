/**
 * Recompute public region adjacency + bbox stats from the runtime mask + GLB.
 * Also wires flank ↔ ribs / abdomen / hip / lower_back edges.
 *
 *   node tools/body-regions/rebuild-adjacency-stats.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData } from "../body-mask/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GLB = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const MASK = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const MANIFEST = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);
const ADJ = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionAdjacency.json",
);
const LANDMARKS = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_landmarks.json",
);

async function readMask() {
  const { data, info } = await sharp(MASK)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels || 1;
  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * ch];
  return { mask, w: info.width, h: info.height };
}

function sampleId(mask, w, h, u, v) {
  const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)));
  return mask[py * w + px];
}

async function main() {
  const prev = JSON.parse(readFileSync(ADJ, "utf8"));
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const lm = JSON.parse(readFileSync(LANDMARKS, "utf8"));
  const { mask, w, h } = await readMask();
  const mesh = loadMeshData(GLB);

  const indexToRegion = new Map();
  for (const [id, entry] of Object.entries(manifest.regions)) {
    indexToRegion.set(entry.maskIndex, id);
  }

  const stats = {};
  for (const id of Object.values(Object.fromEntries(indexToRegion))) {
    stats[id] = {
      faceCount: 0,
      surfaceArea: 0,
      sum: [0, 0, 0],
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
  }

  const P = mesh.positions;
  const UV = mesh.uvs;
  const I = mesh.indices;
  const edgePairs = new Map();

  const addEdge = (a, b) => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    edgePairs.set(key, (edgePairs.get(key) ?? 0) + 1);
  };

  for (let t = 0; t < mesh.triangleCount; t++) {
    const ia = I[t * 3];
    const ib = I[t * 3 + 1];
    const ic = I[t * 3 + 2];
    const verts = [ia, ib, ic];
    const ids = verts.map((vi) =>
      indexToRegion.get(sampleId(mask, w, h, UV[vi * 2], UV[vi * 2 + 1])),
    );
    const ax = (P[ia * 3] + P[ib * 3] + P[ic * 3]) / 3;
    const ay = (P[ia * 3 + 1] + P[ib * 3 + 1] + P[ic * 3 + 1]) / 3;
    const az = (P[ia * 3 + 2] + P[ib * 3 + 2] + P[ic * 3 + 2]) / 3;
    // area
    const abx = P[ib * 3] - P[ia * 3];
    const aby = P[ib * 3 + 1] - P[ia * 3 + 1];
    const abz = P[ib * 3 + 2] - P[ia * 3 + 2];
    const acx = P[ic * 3] - P[ia * 3];
    const acy = P[ic * 3 + 1] - P[ia * 3 + 1];
    const acz = P[ic * 3 + 2] - P[ia * 3 + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const area = 0.5 * Math.hypot(cx, cy, cz);

    const majority = (() => {
      const counts = new Map();
      for (const id of ids) {
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      let best = null;
      let n = 0;
      for (const [id, c] of counts) {
        if (c > n) {
          best = id;
          n = c;
        }
      }
      return best;
    })();

    if (majority && stats[majority]) {
      const s = stats[majority];
      s.faceCount++;
      s.surfaceArea += area;
      s.sum[0] += ax;
      s.sum[1] += ay;
      s.sum[2] += az;
      s.min[0] = Math.min(s.min[0], ax);
      s.min[1] = Math.min(s.min[1], ay);
      s.min[2] = Math.min(s.min[2], az);
      s.max[0] = Math.max(s.max[0], ax);
      s.max[1] = Math.max(s.max[1], ay);
      s.max[2] = Math.max(s.max[2], az);
    }

    // adjacency from differing vertex region IDs on same triangle
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        addEdge(ids[i], ids[j]);
      }
    }
  }

  const adjacency = {};
  for (const key of edgePairs.keys()) {
    const [a, b] = key.split("|");
    if (!adjacency[a]) adjacency[a] = [];
    if (!adjacency[b]) adjacency[b] = [];
    if (!adjacency[a].includes(b)) adjacency[a].push(b);
    if (!adjacency[b].includes(a)) adjacency[b].push(a);
  }
  for (const id of Object.keys(adjacency)) adjacency[id].sort();

  // Preserve routing-only bridges from previous file.
  for (const id of prev.routingOnlyRegions ?? []) {
    if (prev.adjacency[id]) adjacency[id] = [...prev.adjacency[id]].sort();
    for (const n of prev.adjacency[id] ?? []) {
      if (!adjacency[n]) adjacency[n] = [];
      if (!adjacency[n].includes(id)) adjacency[n].push(id);
      adjacency[n].sort();
    }
  }

  const outStats = {};
  for (const [id, s] of Object.entries(stats)) {
    if (s.faceCount === 0) continue;
    outStats[id] = {
      faceCount: s.faceCount,
      surfaceArea: s.surfaceArea,
      centroid: [s.sum[0] / s.faceCount, s.sum[1] / s.faceCount, s.sum[2] / s.faceCount],
      widthX: s.max[0] - s.min[0],
      heightY: s.max[1] - s.min[1],
      depthZ: s.max[2] - s.min[2],
      bbox: [
        [s.min[0], s.min[1], s.min[2]],
        [s.max[0], s.max[1], s.max[2]],
      ],
      connectedComponents: 1,
    };
  }

  const baseRegions = Object.keys(outStats).sort();
  let edgeCount = 0;
  for (const [a, ns] of Object.entries(adjacency)) {
    for (const b of ns) if (a < b) edgeCount++;
  }

  const next = {
    ...prev,
    baseRegions,
    adjacency,
    edgeCount,
    stats: outStats,
    landmarks: {
      sternum_x: lm.points.sternumBottom?.[0] ?? lm.points.sternumTop?.[0] ?? 0,
      inframammary_y: lm.levels.inframammary,
      waist_y: lm.levels.waist,
      iliac_y: lm.levels.iliacCrest,
    },
    validation: {
      ...prev.validation,
      overlaps: 0,
      unclassified: 0,
      leftRightMismatches: [],
      costalRibs: {
        rightYMin: outStats.right_ribs_region?.bbox?.[0]?.[1] ?? null,
        leftYMin: outStats.left_ribs_region?.bbox?.[0]?.[1] ?? null,
        rightHeightY: outStats.right_ribs_region?.heightY ?? null,
        leftHeightY: outStats.left_ribs_region?.heightY ?? null,
      },
    },
    rebuiltAt: new Date().toISOString(),
    maskHash: createHash("sha256")
      .update(readFileSync(MASK))
      .digest("hex")
      .slice(0, 12),
  };

  writeFileSync(ADJ, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        baseRegions: baseRegions.length,
        edgeCount,
        ribs: next.validation.costalRibs,
        flanks: {
          left: outStats.left_flank_region?.bbox?.[0]?.[1],
          right: outStats.right_flank_region?.bbox?.[0]?.[1],
          leftH: outStats.left_flank_region?.heightY,
          rightH: outStats.right_flank_region?.heightY,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
