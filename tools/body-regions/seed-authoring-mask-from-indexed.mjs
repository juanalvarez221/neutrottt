/**
 * Seed RGB authoring mask from existing R-indexed runtime PNG.
 * This is the INITIAL proposal only — torso contours must be curated in Blender Texture Paint.
 *
 *   node tools/body-regions/seed-authoring-mask-from-indexed.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PALETTE = path.join(ROOT, "assets/body-regions/neutro_body_v1_region_palette.json");
const SEED = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_public_region_mask.png",
);
const OUT = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function main() {
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const byIndex = new Map([[0, [0, 0, 0]]]);
  const seenColors = new Map();
  for (const [id, e] of Object.entries(palette.regions)) {
    const rgb = parseHex(e.authoringColor);
    const key = rgb.join(",");
    if (seenColors.has(key)) {
      throw new Error(
        `duplicate authoringColor ${e.authoringColor}: ${seenColors.get(key)} vs ${id}`,
      );
    }
    seenColors.set(key, id);
    byIndex.set(e.runtimeIndex, rgb);
  }

  const { data, info } = await sharp(SEED)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 3);
  const missing = new Set();
  for (let i = 0; i < info.width * info.height; i++) {
    const idx = data[i * 4]; // R channel holds index
    const rgb = byIndex.get(idx);
    if (!rgb) {
      missing.add(idx);
      out[i * 3] = 0;
      out[i * 3 + 1] = 0;
      out[i * 3 + 2] = 0;
      continue;
    }
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
  if (missing.size) {
    console.warn("missing palette indices:", [...missing].sort((a, b) => a - b));
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log("wrote", path.relative(ROOT, OUT), `${info.width}x${info.height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
