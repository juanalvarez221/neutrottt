import { mkdirSync, writeFileSync } from "node:fs";
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
const BODY_VISUAL = path.join(ROOT, "public/models/production/neutro_body_v1.glb");
const MASK_PNG = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.png",
);
const MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.json",
);
const OUT_DIR = path.join(ROOT, "artifacts/body-public-region-atlas-v2");

const FRONT = [0, 0, 1];
const BACK = [0, 0, -1];
const LEFT = [1, 0, 0];
const RIGHT = [-1, 0, 0];
const FRONT_RIGHT = [-0.82, 0.05, 0.57];
const BACK_RIGHT = [-0.82, 0.05, -0.57];
const FRONT_LEFT = [0.82, 0.05, 0.57];
const TOP = [0, 1, 0.28];

const VIEWS = [
  ["01-pectoral-right-front", FRONT, ["right_pectoral_region"]],
  ["02-pectoral-left-front", FRONT, ["left_pectoral_region"]],
  ["03-full-chest-front", FRONT, ["right_pectoral_region", "left_pectoral_region"]],
  ["04-abdomen-front", FRONT, ["full_abdomen_region"]],
  ["05-ribs-right-oblique", FRONT_RIGHT, ["right_ribs_region"]],
  ["06-ribs-right-side", RIGHT, ["right_ribs_region"]],
  ["07-ribs-left-oblique", FRONT_LEFT, ["left_ribs_region"]],
  ["08-ribs-left-side", LEFT, ["left_ribs_region"]],
  ["09-upper-back-back", BACK, ["upper_back_region"]],
  ["10-lower-back-back", BACK, ["lower_back_region"]],
  ["11-full-back-back", BACK, ["upper_back_region", "lower_back_region"]],
  ["12-biceps-right", FRONT_RIGHT, ["right_biceps_surface"]],
  ["13-triceps-right", BACK_RIGHT, ["right_triceps_surface"]],
  ["14-forearm-inner-right", FRONT_RIGHT, ["right_forearm_inner_surface"]],
  ["15-forearm-outer-right", BACK_RIGHT, ["right_forearm_outer_surface"]],
  ["16-thigh-front-left", FRONT, ["left_thigh_front_surface"]],
  ["17-thigh-back-left", BACK, ["left_thigh_back_surface"]],
  ["18-thigh-inner-left", FRONT_RIGHT, ["left_thigh_inner_surface"]],
  ["19-thigh-outer-left", LEFT, ["left_thigh_outer_surface"]],
  ["20-shin-left", FRONT, ["left_shin_surface"]],
  ["21-calf-left", BACK, ["left_calf_surface"]],
  [
    "22-lower-leg-complete-left",
    FRONT_LEFT,
    ["left_shin_surface", "left_calf_surface", "left_ankle_transition"],
  ],
  ["23-head-top", TOP, ["head_top_surface"]],
  ["24-head-left", LEFT, ["head_left_surface"]],
  ["25-head-back", BACK, ["head_back_surface"]],
  ["26-neck-front", FRONT, ["neck_front_surface"]],
  ["27-neck-left", LEFT, ["neck_left_surface"]],
  ["28-neck-back", BACK, ["neck_back_surface"]],
];

async function main() {
  const mesh = loadMeshData(BODY_VISUAL);
  const normals = computeVertexNormals(mesh);
  const manifest = readJson(MASK_JSON);

  const image = sharp(MASK_PNG);
  const { data, info } = await image
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampler = makeMaskSampler(data, info.width);

  const indexOf = new Map(
    Object.entries(manifest.regions).map(([id, entry]) => [id, entry.maskIndex]),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const log = [];

  for (const [name, direction, regionIds] of VIEWS) {
    const indices = regionIds.map((id) => {
      const index = indexOf.get(id);
      if (index === undefined) throw new Error(`unknown region: ${id}`);
      return index;
    });
    const camera = frameCamera(mesh, sampler.at, indices, direction, {
      padding: 1.9,
    });
    const png = renderView({
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: indices,
    });
    const file = path.join(OUT_DIR, `${name}.png`);
    await png.toFile(file);
    log.push(`${name}: ${regionIds.join(" + ")}`);
    console.log(`rendered ${name}`);
  }

  writeFileSync(
    path.join(OUT_DIR, "_render-log.txt"),
    `${["Neutro public region atlas v2", "", ...log].join("\n")}\n`,
  );

  // Colour key of the whole partition, for spotting holes and wrong IDs.
  const preview = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const id = data[i];
    if (!id) continue;
    const hue = ((id * 47) % 360) / 360;
    const a = 0.72 * Math.min(0.55, 1 - 0.55);
    const f = (n) => {
      const k = (n + hue * 12) % 12;
      return 0.55 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    preview[i * 3] = Math.round(f(0) * 255);
    preview[i * 3 + 1] = Math.round(f(8) * 255);
    preview[i * 3 + 2] = Math.round(f(4) * 255);
  }
  await sharp(preview, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .resize(1024, 1024, { kernel: "nearest" })
    .png()
    .toFile(path.join(OUT_DIR, "uv-mask-preview.png"));

  console.log(`\natlas written to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
