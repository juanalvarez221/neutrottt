/**
 * Capture browser evidence for full_chest only.
 *   node tools/body-regions/capture-full-chest-browser.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts/full-chest-professional-review");
const URL = process.env.BODY_QA_URL || "http://localhost:3000/lab/body-3d?mode=audit";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.localStorage.setItem("danniel.language", "es");
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
    (el.textContent ?? "").includes("Public Region Audit"),
  );
  tab?.click();
});
await page.waitForSelector("text=Anatomical Region Review", { timeout: 90_000 });
const select = page
  .locator("select")
  .filter({ has: page.locator('option[value="full_chest"]') })
  .first();
await select.selectOption("full_chest");
await page.waitForTimeout(1800);
const canvas = page.locator("canvas").first();
await canvas.waitFor({ state: "visible", timeout: 30_000 });
await canvas.screenshot({
  path: path.join(OUT, "06-full-chest-browser-front.png"),
  animations: "disabled",
});
console.log("WROTE", path.join(OUT, "06-full-chest-browser-front.png"));
await browser.close();
