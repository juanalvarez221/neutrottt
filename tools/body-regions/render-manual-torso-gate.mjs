/**
 * Gate Torso evidence renders (offline atlas) for curated anatomical mask.
 *
 *   node tools/body-regions/render-manual-torso-gate.mjs
 *
 * Output: artifacts/manual-anatomical-mask-gate-torso/
 * (do not commit)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadMeshData, readJson } from "../body-mask/glb.mjs";
import {
  computeVertexNormals,
  frameCamera,
  makeMaskSampler,
  renderView,
} from "../body-mask/renderer.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/manual-anatomical-mask-gate-torso");
const MASK_PNG = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);

/** Runtime camera dirs: front=+Z, back=-Z */
const VIEWS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [-1, 0, 0],
  left: [1, 0, 0],
  front_right_30: [-0.5, 0, 0.866],
  front_left_30: [0.5, 0, 0.866],
  back_right_30: [-0.5, 0, -0.866],
  back_left_30: [0.5, 0, -0.866],
};

const SHOTS = [
  ["01-pectoral-right-front", "front", ["right_pectoral_region"]],
  ["02-pectoral-right-oblique", "front_right_30", ["right_pectoral_region"]],
  ["03-pectoral-left-front", "front", ["left_pectoral_region"]],
  ["04-pectoral-left-oblique", "front_left_30", ["left_pectoral_region"]],
  [
    "05-full-chest-front",
    "front",
    ["right_pectoral_region", "left_pectoral_region"],
  ],
  [
    "06-full-chest-oblique",
    "front_right_30",
    ["right_pectoral_region", "left_pectoral_region"],
  ],
  ["07-abdomen-front", "front", ["full_abdomen_region"]],
  ["08-ribs-right-front-oblique", "front_right_30", ["right_ribs_region"]],
  ["09-ribs-right-side", "right", ["right_ribs_region"]],
  ["10-ribs-right-back-oblique", "back_right_30", ["right_ribs_region"]],
  ["11-ribs-left-front-oblique", "front_left_30", ["left_ribs_region"]],
  ["12-ribs-left-side", "left", ["left_ribs_region"]],
  ["13-ribs-left-back-oblique", "back_left_30", ["left_ribs_region"]],
  ["14-upper-back-back", "back", ["upper_back_region"]],
  ["15-upper-back-oblique", "back_left_30", ["upper_back_region"]],
  ["16-lower-back-back", "back", ["lower_back_region"]],
  ["17-lower-back-oblique", "back_right_30", ["lower_back_region"]],
  [
    "18-full-back-back",
    "back",
    ["upper_back_region", "lower_back_region"],
  ],
  [
    "19-full-back-oblique",
    "back_left_30",
    ["upper_back_region", "lower_back_region"],
  ],
];

async function main() {
  const mesh = loadMeshData(
    path.join(ROOT, "public/models/production/neutro_body_v1.glb"),
  );
  const normals = computeVertexNormals(mesh);
  const manifest = readJson(MASK_JSON);
  const { data, info } = await sharp(MASK_PNG)
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampler = makeMaskSampler(data, info.width);
  const indexOf = new Map(
    Object.entries(manifest.regions).map(([id, entry]) => [
      id,
      entry.maskIndex,
    ]),
  );

  mkdirSync(OUT, { recursive: true });
  for (const [name, viewKey, regionIds] of SHOTS) {
    const indices = regionIds.map((id) => {
      const idx = indexOf.get(id);
      if (idx === undefined) throw new Error(`unknown region ${id}`);
      return idx;
    });
    const camera = frameCamera(mesh, sampler.at, indices, VIEWS[viewKey], {
      padding: 1.35,
    });
    await renderView({
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: indices,
      width: 960,
      height: 1200,
    }).toFile(path.join(OUT, `${name}.png`));
    console.log(name);
  }
  console.log("wrote", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
