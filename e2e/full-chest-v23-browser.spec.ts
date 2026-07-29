/**
 * Browser evidence for Full Chest V2.3 — intercepts mask URL with temp hash.
 *
 *   npx playwright test e2e/full-chest-v23-browser.spec.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT = path.join("artifacts", "full-chest-v23", "comparison");
const TEMP_MASK = path.join(
  "artifacts",
  "full-chest-v23",
  "temp-runtime-mask.png",
);

test.describe("Full Chest V2.3 browser edge coverage", () => {
  test("captures front / front-right / right with versioned temp mask", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const png = readFileSync(TEMP_MASK);
    const hash = createHash("sha256").update(png).digest("hex").slice(0, 16);

    await page.route("**/neutro_body_v1_anatomical_region_ids.png**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: png,
        headers: {
          "cache-control": "no-store",
          "x-full-chest-v23-hash": hash,
        },
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("danniel.language", "es");
    });
    await page.goto(`/lab/body-3d?mode=audit&v=${hash}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
        (el.textContent ?? "").includes("Public Region Audit"),
      ) as HTMLButtonElement | undefined;
      tab?.click();
    });
    await expect(
      page.locator("text=Anatomical Region Review").first(),
    ).toBeVisible({ timeout: 60_000 });

    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value="full_chest"]') })
      .first();
    await select.selectOption("full_chest");
    await page.waitForTimeout(1600);

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    await canvas.screenshot({
      path: path.join(OUT, "11-browser-front.png"),
      animations: "disabled",
    });

    // Rotate via audit if camera controls exist — fallback: just re-shot after wait
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(520, 450, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    await canvas.screenshot({
      path: path.join(OUT, "12-browser-front-right.png"),
      animations: "disabled",
    });

    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(400, 450, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    await canvas.screenshot({
      path: path.join(OUT, "13-browser-right.png"),
      animations: "disabled",
    });
  });
});
