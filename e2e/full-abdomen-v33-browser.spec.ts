/**
 * Full Abdomen V3.3 — browser visual evidence.
 *
 *   npx playwright test e2e/full-abdomen-v33-browser.spec.ts --config=playwright.v23.config.ts
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openLabAbdomen,
  openQuoteSelector,
  clickLandmark,
  prepView,
  readTiming,
} from "./full-abdomen-v33-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/full-abdomen-v33/report.json");
const BROWSER = path.join(ROOT, "artifacts/full-abdomen-v33/browser");

test.describe("full abdomen V3.3 browser", () => {
  test("quote UX: Abdomen completo only + confirm", async ({ page }) => {
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
    const umbilical = INTERIOR.find((p) => p.id === "umbilical")!;
    await clickLandmark(page, umbilical.xyz, "full_abdomen");

    await expect(page.getByText("Abdomen completo").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Superficie frontal completa del abdomen").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Abdomen superior")).toHaveCount(0);
    await expect(page.getByText("Abdomen inferior")).toHaveCount(0);
    await expect(page.getByText("Ombligo")).toHaveCount(0);
    await expect(page.getByText("Línea alba")).toHaveCount(0);
    await expect(page.getByText("Cara interna")).toHaveCount(0);
    await expect(page.getByText("Cara externa")).toHaveCount(0);

    await page
      .getByRole("button", {
        name: /Abdomen completo · Superficie frontal completa del abdomen/i,
      })
      .click();
    await page.waitForTimeout(400);

    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const timing = await readTiming(page);
    expect(timing?.candidateId).toBe("B01");
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

  test("captures 15 browser evidence frames", async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync(BROWSER, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;

    const groups: {
      width: number;
      height: number;
      shots: {
        name: string;
        prep:
          | "front"
          | "right30"
          | "right45"
          | "right60"
          | "right90"
          | "left30"
          | "left60"
          | "left90";
        combo?: boolean;
      }[];
    }[] = [
      {
        width: 1440,
        height: 900,
        shots: [
          { name: "01-desktop-front.png", prep: "front" },
          { name: "02-desktop-front-right-30.png", prep: "right30" },
          { name: "03-desktop-front-right-60.png", prep: "right60" },
          { name: "04-desktop-right-90.png", prep: "right90" },
          { name: "05-desktop-front-left-30.png", prep: "left30" },
          { name: "06-desktop-front-left-60.png", prep: "left60" },
          { name: "07-desktop-left-90.png", prep: "left90" },
          {
            name: "08-desktop-chest-and-abdomen-front.png",
            prep: "front",
            combo: true,
          },
          {
            name: "09-desktop-chest-and-abdomen-right-45.png",
            prep: "right45",
            combo: true,
          },
        ],
      },
      {
        width: 820,
        height: 1180,
        shots: [
          { name: "10-tablet-front.png", prep: "front" },
          { name: "11-tablet-front-right-45.png", prep: "right45" },
          {
            name: "12-tablet-chest-and-abdomen.png",
            prep: "front",
            combo: true,
          },
        ],
      },
      {
        width: 390,
        height: 844,
        shots: [
          { name: "13-mobile-front.png", prep: "front" },
          { name: "14-mobile-front-right-45.png", prep: "right45" },
          {
            name: "15-mobile-chest-and-abdomen.png",
            prep: "front",
            combo: true,
          },
        ],
      },
    ];

    for (const group of groups) {
      await page.setViewportSize({
        width: group.width,
        height: group.height,
      });
      const select = await openLabAbdomen(page, fieldHash);
      for (const shot of group.shots) {
        if (shot.combo) {
          await select.selectOption("full_chest");
          await page.waitForTimeout(400);
          await select.selectOption("full_abdomen");
          await page.waitForTimeout(400);
          await page.evaluate(() => {
            const w = window as unknown as {
              __neutroAuditSetSelected?: (ids: string[]) => void;
            };
            w.__neutroAuditSetSelected?.(["full_chest", "full_abdomen"]);
          });
          await page.waitForTimeout(500);
        } else {
          await select.selectOption("full_abdomen");
          await page.waitForTimeout(350);
        }
        await prepView(page, shot.prep);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const canvas = page.locator("canvas").first();
        await expect(canvas).toBeVisible({ timeout: 15_000 });
        await canvas.screenshot({ path: path.join(BROWSER, shot.name) });
        const bytes = readFileSync(path.join(BROWSER, shot.name));
        expect(bytes.byteLength).toBeGreaterThan(8_000);
      }
    }
  });
});
