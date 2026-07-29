import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  loadMeshData,
  readJson,
  triangleArea,
  triangleCentroid,
  triangleCentroidUv,
} from "./glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BODY_VISUAL = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const MASK_PNG = path.join(ROOT, "public/models/interaction/neutro_body_v1_public_region_mask.png");
const MASK_JSON = path.join(ROOT, "public/models/interaction/neutro_body_v1_public_region_mask.json");

function bboxAccumulator() {
  return {
    count: 0,
    area: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    sum: [0, 0, 0],
  };
}

function accumulate(acc, p, area) {
  acc.count += 1;
  acc.area += area;
  for (let i = 0; i < 3; i++) {
    acc.min[i] = Math.min(acc.min[i], p[i]);
    acc.max[i] = Math.max(acc.max[i], p[i]);
    acc.sum[i] += p[i];
  }
}

function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(3) : "n/a";
}

async function main() {
  const mesh = loadMeshData(BODY_VISUAL);

  console.log("=== BODYVISUAL UV AUDIT ===");
  console.log(`file            : ${path.relative(ROOT, BODY_VISUAL)}`);
  console.log(`primitives      : ${mesh.primitives.length}`);
  for (const prim of mesh.primitives) {
    console.log(`  - ${prim.name}: ${prim.triCount} tris`);
  }
  console.log(`vertices        : ${mesh.vertexCount}`);
  console.log(`triangles       : ${mesh.triangleCount}`);
  console.log(`has TEXCOORD_0  : ${mesh.hasUv ? "YES" : "NO"}`);

  if (!mesh.hasUv) {
    console.log("\nFATAL: BodyVisual has no UV attribute. Mask approach impossible.");
    return;
  }

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  let outside = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const u = mesh.uvs[i * 2];
    const v = mesh.uvs[i * 2 + 1];
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) outside += 1;
  }
  console.log(`uv range        : u [${fmt(uMin)}, ${fmt(uMax)}]  v [${fmt(vMin)}, ${fmt(vMax)}]`);
  console.log(`uv outside 0..1 : ${outside} vertices`);

  // UV area coverage: how much of the 0..1 square the mesh actually uses.
  let uvArea = 0;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = mesh.indices[t * 3];
    const b = mesh.indices[t * 3 + 1];
    const c = mesh.indices[t * 3 + 2];
    const ux = mesh.uvs[b * 2] - mesh.uvs[a * 2];
    const uy = mesh.uvs[b * 2 + 1] - mesh.uvs[a * 2 + 1];
    const vx = mesh.uvs[c * 2] - mesh.uvs[a * 2];
    const vy = mesh.uvs[c * 2 + 1] - mesh.uvs[a * 2 + 1];
    uvArea += Math.abs(ux * vy - uy * vx) / 2;
  }
  console.log(`uv area used    : ${(uvArea * 100).toFixed(1)}% of the 0..1 square`);

  if (!existsSync(MASK_PNG)) {
    console.log("\nNo mask PNG present yet.");
    return;
  }

  const image = sharp(MASK_PNG);
  const meta = await image.metadata();
  const { data, info } = await image
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log("\n=== MASK ===");
  console.log(`file            : ${path.relative(ROOT, MASK_PNG)}`);
  console.log(`size            : ${meta.width}x${meta.height} (${meta.channels}ch ${meta.depth})`);

  const manifest = readJson(MASK_JSON);
  const indexToRegion = new Map();
  for (const [regionId, entry] of Object.entries(manifest.regions)) {
    indexToRegion.set(entry.maskIndex, regionId);
  }

  const sampleAt = (u, v) => {
    let x = Math.floor(u * info.width);
    let y = Math.floor((1 - v) * info.height);
    x = Math.min(info.width - 1, Math.max(0, x));
    y = Math.min(info.height - 1, Math.max(0, y));
    return data[y * info.width + x];
  };

  const perIndex = new Map();
  let totalArea = 0;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const [u, v] = triangleCentroidUv(mesh, t);
    const id = sampleAt(u, v);
    const p = triangleCentroid(mesh, t);
    const area = triangleArea(mesh, t);
    totalArea += area;
    if (!perIndex.has(id)) perIndex.set(id, bboxAccumulator());
    accumulate(perIndex.get(id), p, area);
  }

  console.log("\n=== MASK COVERAGE THROUGH BODYVISUAL UV ===");
  console.log("(triangle centroid sampling; centroid/bbox are runtime world coords)");
  console.log(
    "idx  region                          tris    area%   cx      cy      cz     | y range        | z range",
  );

  const sorted = [...perIndex.entries()].sort((a, b) => a[0] - b[0]);
  for (const [id, acc] of sorted) {
    const region = id === 0 ? "<UNASSIGNED>" : (indexToRegion.get(id) ?? `!! UNKNOWN ${id}`);
    const cx = acc.sum[0] / acc.count;
    const cy = acc.sum[1] / acc.count;
    const cz = acc.sum[2] / acc.count;
    console.log(
      `${String(id).padStart(3)}  ${region.padEnd(30)} ${String(acc.count).padStart(6)} ` +
        `${((acc.area / totalArea) * 100).toFixed(2).padStart(6)}  ` +
        `${fmt(cx).padStart(6)} ${fmt(cy).padStart(6)} ${fmt(cz).padStart(6)}  | ` +
        `${fmt(acc.min[1]).padStart(6)}..${fmt(acc.max[1]).padStart(6)} | ` +
        `${fmt(acc.min[2]).padStart(6)}..${fmt(acc.max[2]).padStart(6)}`,
    );
  }

  const declared = new Set(indexToRegion.keys());
  const present = new Set(sorted.map(([id]) => id));
  const missing = [...declared].filter((id) => !present.has(id));
  console.log("\n=== INTEGRITY ===");
  console.log(`declared regions        : ${declared.size}`);
  console.log(`regions hit via UV      : ${[...present].filter((i) => i !== 0).length}`);
  console.log(
    `declared but NOT reachable through BodyVisual UV: ${missing.length}` +
      (missing.length ? ` -> ${missing.map((i) => indexToRegion.get(i)).join(", ")}` : ""),
  );
  const unassigned = perIndex.get(0);
  if (unassigned) {
    console.log(
      `unassigned surface      : ${((unassigned.area / totalArea) * 100).toFixed(2)}% of body area`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
