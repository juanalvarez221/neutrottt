/**
 * Left Ribs V4.4 — browser visual evidence.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openLabLeftRibs,
  openQuoteSelector,
  clickLandmark,
  prepView,
  readTiming,
} from "./left-ribs-v44-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v44/report.json");
const BROWSER = path.join(ROOT, "artifacts/left-ribs-v44/browser");

test.describe("left ribs V4.4 browser", () => {
  test("quote UX: Costillas izquierdas + confirm", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(existsSync(REPORT)).toBe(true);
    const report = JSON.parse(readFileSync(REPORT, "utf8"));

    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/models/interaction/sdf/")) {
        sdfRequests.push(request.url());
      }
    });

    await openQuoteSelector(page);
    const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
    await clickLandmark(page, mid.xyz, "left_ribs");

    await expect(page.getByText("Costillas izquierdas").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Margen costal lateral izquierdo").first(),
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("button", {
        name: /Costillas izquierdas · Margen costal lateral izquierdo/i,
      })
      .click();
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const timing = await readTiming(page);
    expect(timing?.candidateId).toBe("L01");
    expect(timing?.fieldHash).toBe(report.field.fieldHash);

    const confirm = page.getByRole("button", { name: /Confirmar/i });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();
    await expect(page.getByText("Selección confirmada").first()).toBeVisible({
      timeout: 10_000,
    });
    expect(sdfRequests).toHaveLength(0);
  });

  test("captures browser evidence frames", async ({ page }) => {
    test.setTimeout(1_800_000);
    mkdirSync(BROWSER, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;

    const shots: {
      name: string;
      width: number;
      height: number;
      prep: "front-left" | "left" | "back-left";
      panel?: boolean;
      from?: "chest" | "abdomen" | "right";
      bilateral?: boolean;
    }[] = [
      { name: "01-desktop-front-left.png", width: 1440, height: 900, prep: "front-left" },
      { name: "02-desktop-left.png", width: 1440, height: 900, prep: "left" },
      { name: "03-desktop-back-left.png", width: 1440, height: 900, prep: "back-left" },
      { name: "05-tablet-front-left.png", width: 820, height: 1180, prep: "front-left" },
      { name: "06-tablet-left.png", width: 820, height: 1180, prep: "left" },
      { name: "07-mobile-front-left.png", width: 390, height: 844, prep: "front-left" },
      { name: "08-mobile-left.png", width: 390, height: 844, prep: "left" },
      {
        name: "09-desktop-chest-to-left-ribs.png",
        width: 1440,
        height: 900,
        prep: "left",
        from: "chest",
      },
      {
        name: "10-desktop-abdomen-to-left-ribs.png",
        width: 1440,
        height: 900,
        prep: "left",
        from: "abdomen",
      },
      {
        name: "11-desktop-right-to-left-ribs.png",
        width: 1440,
        height: 900,
        prep: "left",
        from: "right",
      },
      {
        name: "12-desktop-both-ribs-front.png",
        width: 1440,
        height: 900,
        prep: "front-left",
        bilateral: true,
      },
      {
        name: "13-desktop-both-ribs-back.png",
        width: 1440,
        height: 900,
        prep: "back-left",
        bilateral: true,
      },
      { name: "04-desktop-panel.png", width: 1440, height: 900, prep: "left", panel: true },
    ];

    let labSelect: Awaited<ReturnType<typeof openLabLeftRibs>> | null = null;

    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      if (shot.panel) {
        await openQuoteSelector(page);
        const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
        await clickLandmark(page, mid.xyz, "left_ribs");
        await page
          .getByRole("button", {
            name: /Costillas izquierdas · Margen costal lateral izquierdo/i,
          })
          .click();
        await expect
          .poll(async () => (await readTiming(page))?.status, {
            timeout: 45_000,
          })
          .toBe("ok");
        await prepView(page, shot.prep);
        labSelect = null;
      } else {
        if (!labSelect) {
          labSelect = await openLabLeftRibs(page, fieldHash);
        }
        const select = labSelect;
        if (shot.from === "chest") {
          await select.selectOption("full_chest");
          await page.waitForTimeout(500);
          await select.selectOption("left_ribs");
          await expect
            .poll(async () => (await readTiming(page))?.candidateId, {
              timeout: 30_000,
            })
            .toBe("L01");
        } else if (shot.from === "abdomen") {
          await select.selectOption("full_abdomen");
          await page.waitForTimeout(500);
          await select.selectOption("left_ribs");
          await expect
            .poll(async () => (await readTiming(page))?.candidateId, {
              timeout: 30_000,
            })
            .toBe("L01");
        } else if (shot.from === "right") {
          await select.selectOption("right_ribs");
          await page.waitForTimeout(500);
          await select.selectOption("left_ribs");
          await expect
            .poll(async () => (await readTiming(page))?.candidateId, {
              timeout: 30_000,
            })
            .toBe("L01");
        } else if (shot.bilateral) {
          await select.selectOption("right_ribs");
          await page.waitForTimeout(300);
          await select.selectOption("left_ribs");
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
