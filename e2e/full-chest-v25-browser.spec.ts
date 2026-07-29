/**
 * Browser evidence for Full Chest V2.5 geometry distance field.
 *
 *   npx playwright test e2e/full-chest-v25-browser.spec.ts --config=playwright.v23.config.ts
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT = path.join("artifacts", "full-chest-v25", "comparison");
const ROTATION = path.join("artifacts", "full-chest-v25", "rotation");
const REPORT = path.join("artifacts", "full-chest-v25", "report.json");

type FieldTiming = {
  regionId: string;
  status: string;
  reason?: string;
  resolveMs: number;
  installMs: number;
  totalMs: number;
};

test.describe("Full Chest V2.5 geometry field", () => {
  test("captures front, grazing angles and a rotation strip", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    expect(existsSync(REPORT)).toBe(true);
    mkdirSync(ROTATION, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.sidecar.fieldHash as string;
    expect(fieldHash).toBeTruthy();

    const sidecarRequests: string[] = [];
    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/models/interaction/fields/")) sidecarRequests.push(url);
      if (url.includes("/models/interaction/sdf/")) sdfRequests.push(url);
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("danniel.language", "es");
    });
    await page.goto(`/lab/body-3d?mode=audit&v25=${fieldHash}`, {
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

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    const readTiming = async () =>
      page.evaluate(
        () =>
          (window as unknown as { __neutroRegionField?: FieldTiming })
            .__neutroRegionField ?? null,
      );
    await expect
      .poll(async () => (await readTiming())?.status, { timeout: 60_000 })
      .toBe("ok");

    const firstTiming = await readTiming();
    console.log("V25_TIMING_FIRST", JSON.stringify(firstTiming));
    expect(firstTiming?.regionId).toContain("full_chest");

    // Re-selecting must hit the cache and stay inside a frame budget.
    await select.selectOption("full_abdomen");
    await page.waitForTimeout(1200);
    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming())?.status, { timeout: 30_000 })
      .toBe("ok");
    const cachedTiming = await readTiming();
    console.log("V25_TIMING_CACHED", JSON.stringify(cachedTiming));
    expect(cachedTiming!.totalMs).toBeLessThan(16);
    await page.waitForTimeout(600);

    // The sidecar is versioned by content and the SDF UV texture is retired.
    expect(sidecarRequests.some((url) => url.includes(fieldHash))).toBe(true);
    expect(sdfRequests).toHaveLength(0);

    await canvas.screenshot({
      path: path.join(OUT, "28-browser-front.png"),
      animations: "disabled",
    });

    const drag = async (fromX: number, toX: number, steps: number) => {
      await page.mouse.move(fromX, 450);
      await page.mouse.down();
      await page.mouse.move(toX, 450, { steps });
      await page.mouse.up();
      await page.waitForTimeout(500);
    };

    // Right sweep: 30 → 60 → 80 → 90, one frame each (flicker/popping check).
    const rightStops = [
      ["right-30", 660],
      ["right-60", 600],
      ["right-80", 560],
      ["right-90", 545],
    ] as const;
    for (const [label, toX] of rightStops) {
      await drag(720, toX, 14);
      await canvas.screenshot({
        path: path.join(ROTATION, `right-${label}.png`),
        animations: "disabled",
      });
      if (label === "right-60") {
        await canvas.screenshot({
          path: path.join(OUT, "29-browser-right-60.png"),
          animations: "disabled",
        });
      }
      if (label === "right-90") {
        await canvas.screenshot({
          path: path.join(OUT, "30-browser-right-90.png"),
          animations: "disabled",
        });
      }
    }

    // Back to front, then the mirrored left sweep.
    await drag(400, 1000, 24);
    await page.waitForTimeout(400);
    const leftStops = [
      ["left-30", 460],
      ["left-60", 520],
      ["left-80", 560],
      ["left-90", 575],
    ] as const;
    for (const [label, toX] of leftStops) {
      await drag(400, toX, 14);
      await canvas.screenshot({
        path: path.join(ROTATION, `left-${label}.png`),
        animations: "disabled",
      });
      if (label === "left-60") {
        await canvas.screenshot({
          path: path.join(OUT, "31-browser-left-60.png"),
          animations: "disabled",
        });
      }
      if (label === "left-90") {
        await canvas.screenshot({
          path: path.join(OUT, "32-browser-left-90.png"),
          animations: "disabled",
        });
      }
    }

    // Selection stays functional with the field installed.
    await expect(select).toHaveValue("full_chest");
  });
});
