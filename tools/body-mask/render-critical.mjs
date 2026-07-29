import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData, readJson } from "./glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  renderView,
} from "./renderer.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/body-public-region-atlas-v2");
const MEMBERSHIP = path.join(OUT, "_membership");
const CRITICAL = [
  ["01-pectoral-right-front", [0, 0, 1], ["right_pectoral_region"]],
  ["02-pectoral-left-front", [0, 0, 1], ["left_pectoral_region"]],
  ["03-full-chest-front", [0, 0, 1], ["right_pectoral_region", "left_pectoral_region"]],
  ["04-abdomen-front", [0, 0, 1], ["full_abdomen_region"]],
  ["06-ribs-right-side", [-1, 0, 0], ["right_ribs_region"]],
  ["09-upper-back-back", [0, 0, -1], ["upper_back_region"]],
  ["11-full-back-back", [0, 0, -1], ["upper_back_region", "lower_back_region"]],
];

async function main() {
  const mesh = loadMeshData(path.join(ROOT, "public/models/production/neutro_body_v1.glb"));
  const normals = computeVertexNormals(mesh);
  const manifest = readJson(
    path.join(ROOT, "public/models/interaction/neutro_body_v1_public_region_mask.json"),
  );
  const { data, info } = await sharp(
    path.join(ROOT, "public/models/interaction/neutro_body_v1_public_region_mask.png"),
  )
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampler = makeMaskSampler(data, info.width);
  const indexOf = new Map(
    Object.entries(manifest.regions).map(([id, entry]) => [id, entry.maskIndex]),
  );
  mkdirSync(OUT, { recursive: true });
  mkdirSync(MEMBERSHIP, { recursive: true });

  for (const [name, direction, regionIds] of CRITICAL) {
    const indices = regionIds.map((id) => indexOf.get(id));
    const camera = frameCamera(mesh, sampler.at, indices, direction, { padding: 1.9 });
    const opts = {
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: indices,
      width: 720,
      height: 860,
    };
    await renderView(opts).toFile(path.join(OUT, `${name}.png`));
    await renderView(opts).toFile(path.join(MEMBERSHIP, `${name}.membership.png`));
    console.log(name);
  }
}

main();
