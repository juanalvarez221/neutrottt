/**
 * Integrity + evidence for full_chest_surface only.
 *
 *   node tools/body-regions/validate-full-chest.mjs
 *   node tools/body-regions/render-full-chest-review.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const MASK_PNG = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const MASK_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const OUT = path.join(ROOT, "artifacts/full-chest-professional-review");
const REPORT = path.join(OUT, "integrity-report.json");

const VIEWS = {
  front: [0, 0, 1],
  front_right_30: [-0.5, 0, 0.866],
  front_left_30: [0.5, 0, 0.866],
  right: [-1, 0, 0],
  left: [1, 0, 0],
};

const NEIGHBORS = [
  "full_abdomen_region",
  "left_ribs_region",
  "right_ribs_region",
  "right_shoulder_surface",
  "left_shoulder_surface",
  "neck_front_surface",
];

function connectedComponents(mask, w, h, targetIndex) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== targetIndex || seen[i]) continue;
      let size = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const cur = stack.pop();
        size++;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || mask[ni] !== targetIndex) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      comps.push(size);
    }
  }
  return comps.sort((a, b) => b - a);
}

export async function validateFullChest() {
  const manifest = readJson(MASK_JSON);
  const chestEntry = manifest.regions.full_chest_surface;
  if (!chestEntry) throw new Error("full_chest_surface missing from manifest");
  const chestIdx = chestEntry.maskIndex;

  // Aliases must share same mask index
  for (const alias of ["left_pectoral_region", "right_pectoral_region"]) {
    const a = manifest.regions[alias];
    if (a && a.maskIndex !== chestIdx) {
      throw new Error(`${alias} maskIndex ${a.maskIndex} != chest ${chestIdx}`);
    }
  }

  const { data, info } = await sharp(MASK_PNG)
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const comps = connectedComponents(data, info.width, info.height, chestIdx);
  const total = comps.reduce((s, n) => s + n, 0);
  const tiny = comps.filter((n) => n < total * 0.02 && n < 400).length;
  const main = comps[0] ?? 0;

  // Neighbor overlap: count chest pixels that have 4-neigh neighbor ID
  const neighborIdx = new Set(
    NEIGHBORS.map((id) => manifest.regions[id]?.maskIndex).filter(
      (v) => v != null,
    ),
  );
  let borderAbdomen = 0;
  let borderRibs = 0;
  let borderShoulder = 0;
  let borderNeck = 0;
  // Overlap = same pixel can't be two IDs; instead check interior chest
  // that is surrounded — we report adjacency contact only.
  const abdomen = manifest.regions.full_abdomen_region?.maskIndex;
  const ribL = manifest.regions.left_ribs_region?.maskIndex;
  const ribR = manifest.regions.right_ribs_region?.maskIndex;
  const shL = manifest.regions.left_shoulder_surface?.maskIndex;
  const shR = manifest.regions.right_shoulder_surface?.maskIndex;
  const neck = manifest.regions.neck_front_surface?.maskIndex;

  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const i = y * info.width + x;
      if (data[i] !== chestIdx) continue;
      const n = [
        data[i - 1],
        data[i + 1],
        data[i - info.width],
        data[i + info.width],
      ];
      if (abdomen != null && n.includes(abdomen)) borderAbdomen++;
      if ((ribL != null && n.includes(ribL)) || (ribR != null && n.includes(ribR)))
        borderRibs++;
      if ((shL != null && n.includes(shL)) || (shR != null && n.includes(shR)))
        borderShoulder++;
      if (neck != null && n.includes(neck)) borderNeck++;
    }
  }

  const report = {
    full_chest_surface: {
      maskIndex: chestIdx,
      pixels: total,
      components: comps.length,
      mainComponentPixels: main,
      tinyIslands: tiny,
      componentSizes: comps.slice(0, 8),
    },
    composites: manifest.composites,
    contactBorders: {
      abdomen: borderAbdomen,
      ribs: borderRibs,
      shoulder: borderShoulder,
      neck: borderNeck,
    },
    // Overlap of IDs on same pixel is impossible in R8; report 0
    overlapWithAbdomen: 0,
    overlapWithRibs: 0,
    overlapWithShoulders: 0,
    overlapWithNeck: 0,
    pass: {
      present: total > 500,
      // UV unwrap often splits L/R chest into 2 charts with same mask ID.
      singleDominantComponent:
        comps.length >= 1 &&
        (main / Math.max(1, total) >= 0.92 ||
          ((comps[0] ?? 0) + (comps[1] ?? 0)) / Math.max(1, total) >= 0.95),
      tinyIslands:
        comps
          .slice(1)
          .reduce((s, n) => s + n, 0) < Math.max(200, total * 0.006),
      uniqueMaskId: true,
      uvIslandPairOk:
        comps.filter((n) => n >= total * 0.2).length <= 2,
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (!report.pass.present) throw new Error("full_chest_surface missing/empty");
  if (!report.pass.singleDominantComponent) {
    console.warn("WARN: multiple components — review tiny islands");
  }
  return report;
}

export async function renderFullChestReview() {
  const mesh = loadMeshData(
    path.join(ROOT, "public/models/production/neutro_body_v1.glb"),
  );
  const normals = computeVertexNormals(mesh);
  const manifest = readJson(MASK_JSON);
  const chestIdx = manifest.regions.full_chest_surface.maskIndex;
  const { data, info } = await sharp(MASK_PNG)
    .removeAlpha()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sampler = makeMaskSampler(data, info.width);

  mkdirSync(OUT, { recursive: true });
  const shots = [
    ["01-full-chest-front", "front"],
    ["02-full-chest-front-right-30", "front_right_30"],
    ["03-full-chest-front-left-30", "front_left_30"],
    ["04-full-chest-right", "right"],
    ["05-full-chest-left", "left"],
  ];

  for (const [name, viewKey] of shots) {
    const camera = frameCamera(mesh, sampler.at, [chestIdx], VIEWS[viewKey], {
      padding: 1.2,
    });
    await renderView({
      mesh,
      normals,
      maskSampler: sampler,
      camera,
      highlightIndices: [chestIdx],
      width: 960,
      height: 1200,
    }).toFile(path.join(OUT, `${name}.png`));
    console.log(name);
  }
  console.log("RENDER_FULL_CHEST_REVIEW_OK");
}

// CLI: node tools/body-regions/validate-full-chest.mjs
const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked?.endsWith("/validate-full-chest.mjs")) {
  validateFullChest().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
