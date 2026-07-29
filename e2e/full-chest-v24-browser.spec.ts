/**
 * Browser evidence for Full Chest V2.4 analytical SDF edge.
 *
 *   npx playwright test e2e/full-chest-v24-browser.spec.ts --config=playwright.v23.config.ts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT = path.join("artifacts", "full-chest-v24", "comparison");
const REPORT = path.join("artifacts", "full-chest-v24", "report.json");

test.describe("Full Chest V2.4 browser SDF edge", () => {
  test("captures front and grazing angles with versioned SDF", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    expect(existsSync(REPORT)).toBe(true);
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const hash = report.sdfHash as string;
    expect(hash).toBeTruthy();

    await page.addInitScript(() => {
      window.localStorage.setItem("danniel.language", "es");
    });
    await page.goto(`/lab/body-3d?mode=audit&v24=${hash}`, {
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
    await page.waitForTimeout(2000);

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    await canvas.screenshot({
      path: path.join(OUT, "19-browser-front.png"),
      animations: "disabled",
    });

    // ~60° right
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(480, 450, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await canvas.screenshot({
      path: path.join(OUT, "20-browser-front-right-60.png"),
      animations: "disabled",
    });

    // ~90° right
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(380, 450, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await canvas.screenshot({
      path: path.join(OUT, "21-browser-right-90.png"),
      animations: "disabled",
    });

    // Reset toward front then left 60 / 90
    await page.mouse.move(400, 450);
    await page.mouse.down();
    await page.mouse.move(900, 450, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.mouse.move(400, 450);
    await page.mouse.down();
    await page.mouse.move(640, 450, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await canvas.screenshot({
      path: path.join(OUT, "22-browser-front-left-60.png"),
      animations: "disabled",
    });

    await page.mouse.move(400, 450);
    await page.mouse.down();
    await page.mouse.move(280, 450, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await canvas.screenshot({
      path: path.join(OUT, "23-browser-left-90.png"),
      animations: "disabled",
    });
  });
});
