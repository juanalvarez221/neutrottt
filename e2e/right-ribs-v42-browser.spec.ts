/**
 * Right Ribs V4.2 — browser visual evidence.
 *
 *   npx playwright test e2e/right-ribs-v42-browser.spec.ts --config=playwright.v23.config.ts
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openLabRibs,
  openQuoteSelector,
  clickLandmark,
  prepView,
  readTiming,
} from "./right-ribs-v42-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/right-ribs-v42/report.json");
const BROWSER = path.join(ROOT, "artifacts/right-ribs-v42/browser");

test.describe("right ribs V4.2 browser", () => {
  test("quote UX: Costillas derechas + confirm", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(existsSync(REPORT)).toBe(true);
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;

    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/models/interaction/sdf/")) {
        sdfRequests.push(request.url());
      }
    });

    await openQuoteSelector(page);
    const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
    await clickLandmark(page, mid.xyz, "right_ribs");

    await expect(page.getByText("Costillas derechas").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Margen costal lateral derecho").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Cara interna")).toHaveCount(0);
    await expect(page.getByText("Cara externa")).toHaveCount(0);

    await page
      .getByRole("button", {
        name: /Costillas derechas · Margen costal lateral derecho/i,
      })
      .click();
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const timing = await readTiming(page);
    expect(timing?.candidateId).toBe("V4.1");
    expect(timing?.fieldHash).toBe(fieldHash);
    expect(timing?.refinementHash).toBe(report.field.refineHash);

    const confirm = page.getByRole("button", { name: /Confirmar selección/i });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();
    await expect(page.getByText("Selección confirmada").first()).toBeVisible({
      timeout: 10_000,
    });
    expect(sdfRequests).toHaveLength(0);
  });

  test("captures browser evidence frames", async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync(BROWSER, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;

    const shots: {
      name: string;
      width: number;
      height: number;
      prep: "front-right" | "right" | "back-right";
      lab?: boolean;
      panel?: boolean;
      from?: "chest" | "abdomen";
    }[] = [
      {
        name: "01-desktop-front-right.png",
        width: 1440,
        height: 900,
        prep: "front-right",
        lab: true,
      },
      {
        name: "02-desktop-right.png",
        width: 1440,
        height: 900,
        prep: "right",
        lab: true,
      },
      {
        name: "03-desktop-back-right.png",
        width: 1440,
        height: 900,
        prep: "back-right",
        lab: true,
      },
      {
        name: "04-tablet-right.png",
        width: 834,
        height: 1112,
        prep: "right",
        lab: true,
      },
      {
        name: "05-mobile-right.png",
        width: 390,
        height: 844,
        prep: "right",
        lab: true,
      },
      {
        name: "06-desktop-panel.png",
        width: 1440,
        height: 900,
        prep: "right",
        panel: true,
      },
      {
        name: "07-desktop-chest-to-ribs.png",
        width: 1440,
        height: 900,
        prep: "right",
        lab: true,
        from: "chest",
      },
      {
        name: "08-desktop-abdomen-to-ribs.png",
        width: 1440,
        height: 900,
        prep: "right",
        lab: true,
        from: "abdomen",
      },
    ];

    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      if (shot.panel) {
        await openQuoteSelector(page);
        const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
        await clickLandmark(page, mid.xyz, "right_ribs");
        await page
          .getByRole("button", {
            name: /Costillas derechas · Margen costal lateral derecho/i,
          })
          .click();
        await expect
          .poll(async () => (await readTiming(page))?.status, {
            timeout: 45_000,
          })
          .toBe("ok");
        await prepView(page, shot.prep);
      } else {
        const select = await openLabRibs(page, fieldHash);
        if (shot.from === "chest") {
          await select.selectOption("full_chest");
          await page.waitForTimeout(500);
          await select.selectOption("right_ribs");
          await expect
            .poll(async () => (await readTiming(page))?.candidateId, {
              timeout: 30_000,
            })
            .toBe("V4.1");
        } else if (shot.from === "abdomen") {
          await select.selectOption("full_abdomen");
          await page.waitForTimeout(500);
          await select.selectOption("right_ribs");
          await expect
            .poll(async () => (await readTiming(page))?.candidateId, {
              timeout: 30_000,
            })
            .toBe("V4.1");
        }
        await prepView(page, shot.prep);
      }
      await page.waitForTimeout(400);
      await page
        .locator("canvas")
        .first()
        .screenshot({ path: path.join(BROWSER, shot.name) });
    }
  });
});
