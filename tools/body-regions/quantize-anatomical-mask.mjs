/**
 * Quantize RGB authoring mask → R8 indexed runtime mask.
 *
 * Usage:
 *   node tools/body-regions/quantize-anatomical-mask.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PALETTE = path.join(ROOT, "assets/body-regions/neutro_body_v1_region_palette.json");
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const OUT_PNG = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);
const OUT_JSON = path.join(
  ROOT,
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.json",
);
const OUT_BUNDLED = path.join(
  ROOT,
  "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
);

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

async function main() {
  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const entries = Object.entries(palette.regions).map(([id, e]) => ({
    id,
    index: e.runtimeIndex,
    rgb: parseHex(e.authoringColor),
  }));
  // Legacy pec colors → full_chest_surface
  for (const [hex, regionId] of Object.entries(palette.legacyAuthoringColors ?? {})) {
    const target = entries.find((e) => e.id === regionId);
    if (!target) continue;
    entries.push({
      id: `${regionId}__legacy_${hex}`,
      index: target.index,
      rgb: parseHex(hex),
    });
  }
  const bg = parseHex(palette.background.authoringColor);

  // Exact color map first; nearest within tolerance for anti-aliased paint edges.
  const exact = new Map();
  for (const e of entries) {
    exact.set(e.rgb.join(","), e);
  }
  const TOL2 = 18 * 18; // reject unknowns beyond this

  const { data, info } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== palette.resolution || info.height !== palette.resolution) {
    console.warn(
      `resolution ${info.width}x${info.height} (expected ${palette.resolution})`,
    );
  }

  const out = Buffer.alloc(info.width * info.height);
  let unknown = 0;
  let matched = 0;
  const used = new Map();

  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 8 || (r === 0 && g === 0 && b === 0)) {
      out[i] = 0;
      continue;
    }
    const key = `${r},${g},${b}`;
    let hit = exact.get(key);
    if (!hit) {
      let best = null;
      let bestD = Infinity;
      for (const e of entries) {
        const d = dist2([r, g, b], e.rgb);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best && bestD <= TOL2) hit = best;
    }
    if (!hit) {
      // near black → background
      if (dist2([r, g, b], bg) <= TOL2) {
        out[i] = 0;
        continue;
      }
      unknown += 1;
      out[i] = 0;
      continue;
    }
    out[i] = hit.index;
    matched += 1;
    used.set(hit.id, (used.get(hit.id) ?? 0) + 1);
  }

  if (unknown > 0) {
    console.error(`UNKNOWN_COLORS: ${unknown} pixels rejected`);
    process.exitCode = 2;
  }

  mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png({ compressionLevel: 9 })
    .toFile(OUT_PNG);

  const pngBytes = readFileSync(OUT_PNG);
  const maskHash = createHash("sha256").update(pngBytes).digest("hex").slice(0, 12);

  const regions = {};
  for (const [id, e] of Object.entries(palette.regions)) {
    regions[id] = { maskIndex: e.runtimeIndex };
  }
  const maskTexture = "/models/interaction/neutro_body_v1_anatomical_region_ids.png";
  const manifest = {
    model: "neutro_body_v1",
    maskTexture,
    maskHash,
    maskUrl: `${maskTexture}?v=${maskHash}`,
    resolution: info.width,
    encoding: "r8_index",
    indexScale: 255,
    source: "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
    palette: "assets/body-regions/neutro_body_v1_region_palette.json",
    regions,
    composites: palette.composites,
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(OUT_BUNDLED, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("wrote", path.relative(ROOT, OUT_PNG));
  console.log("maskHash", maskHash);
  console.log("matched", matched, "unknown", unknown);
  console.log("regions painted", used.size);
}

main();
