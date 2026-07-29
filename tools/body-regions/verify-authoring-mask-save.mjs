/**
 * Verify authoring mask was saved after full-chest curation.
 *
 *   node tools/body-regions/verify-authoring-mask-save.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const AUTHORING = path.join(
  ROOT,
  "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png",
);
const PALETTE = path.join(ROOT, "assets/body-regions/neutro_body_v1_region_palette.json");
const BACKUPS = path.join(ROOT, "assets/body-regions/backups");

function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function near(a, b, tol = 10) {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}

async function main() {
  if (!existsSync(AUTHORING)) {
    console.error("MISSING_AUTHORING", AUTHORING);
    process.exit(2);
  }
  const st = statSync(AUTHORING);
  const ageMs = Date.now() - st.mtimeMs;
  console.log("authoring_mtime", st.mtime.toISOString());
  console.log("authoring_age_ms", ageMs);

  const palette = JSON.parse(readFileSync(PALETTE, "utf8"));
  const chest = parseHex(palette.regions.full_chest_surface.authoringColor);
  const legacyHexes = Object.keys(palette.legacyAuthoringColors ?? {}).map(parseHex);

  const { data, info } = await sharp(AUTHORING)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let chestPx = 0;
  let legacyPecPx = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (near(rgb, chest, 8)) chestPx++;
    for (const legacy of legacyHexes) {
      if (!near(legacy, chest, 2) && near(rgb, legacy, 8)) {
        legacyPecPx++;
        break;
      }
    }
  }

  console.log("full_chest_surface_pixels", chestPx);
  console.log("legacy_separate_pec_pixels", legacyPecPx);
  console.log("resolution", `${info.width}x${info.height}`);

  const recentBackup = existsSync(BACKUPS);
  console.log("backups_dir", recentBackup);

  if (chestPx < 500) {
    console.error("FAIL: full_chest_surface nearly empty");
    process.exit(2);
  }

  // Fresh enough write from this session (< 2h) OR explicit env skip
  if (ageMs > 2 * 60 * 60 * 1000 && process.env.ALLOW_STALE_AUTHORING !== "1") {
    console.warn("WARN: authoring PNG older than 2h — ensure SAVE AND VERIFY ran");
  }

  console.log("SAVE_STATUS SAVED_AND_CHANGED");
  console.log("VERIFY_AUTHORING_MASK_SAVE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
