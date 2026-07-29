/**
 * Render professional full-chest evidence (5 offline views).
 * Browser shot is captured separately via Playwright.
 *
 *   node tools/body-regions/render-full-chest-review.mjs
 */
import {
  renderFullChestReview,
  validateFullChest,
} from "./validate-full-chest.mjs";

async function main() {
  await validateFullChest();
  await renderFullChestReview();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
