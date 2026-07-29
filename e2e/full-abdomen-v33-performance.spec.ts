/**
 * Full Abdomen V3.3 — performance + multi-region cache.
 *
 *   npx playwright test e2e/full-abdomen-v33-performance.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openLabAbdomen,
  openQuoteSelector,
  clickLandmark,
  readTiming,
} from "./full-abdomen-v33-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/full-abdomen-v33/report.json");
const PERF = path.join(ROOT, "artifacts/full-abdomen-v33/performance.json");

test.describe("full abdomen V3.3 performance", () => {
  test("cold load + cached reselect + chest↔abdomen swap", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    mkdirSync(path.dirname(PERF), { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;
    const refineHash = report.field.refineHash as string;

    const sidecarRequests: string[] = [];
    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/models/interaction/fields/")) sidecarRequests.push(url);
      if (url.includes("/models/interaction/sdf/")) sdfRequests.push(url);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuoteSelector(page);
    const umbilical = INTERIOR.find((p) => p.id === "umbilical")!;
    await clickLandmark(page, umbilical.xyz, "full_abdomen");
    await page
      .getByRole("button", {
        name: /Abdomen completo · Superficie frontal completa del abdomen/i,
      })
      .click();
    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const cold = await readTiming(page);
    expect(cold?.candidateId).toBe("B01");
    expect(cold?.fieldHash).toBe(fieldHash);
    expect(cold?.refinementHash).toBe(refineHash);

    const select = await openLabAbdomen(page, fieldHash);

    // Cached re-select abdomen.
    await select.selectOption("full_chest");
    await page.waitForTimeout(700);
    await select.selectOption("full_abdomen");
    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 30_000 })
      .toBe("ok");
    const cachedAbd = await readTiming(page);
    expect(cachedAbd!.candidateId).toBe("B01");
    expect(cachedAbd!.totalMs).toBeLessThan(16);

    // Chest → abdomen
    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("C07");
    const chestTiming = await readTiming(page);
    await select.selectOption("full_abdomen");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("B01");
    const chestToAbd = await readTiming(page);

    // Abdomen → chest
    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("C07");
    const abdToChest = await readTiming(page);

    // Other region → abdomen
    await select.selectOption("left_ribs");
    await page.waitForTimeout(500);
    await select.selectOption("full_abdomen");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("B01");
    const otherToAbd = await readTiming(page);

    const mem = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
      };
      return {
        jsHeapUsed: perf.memory?.usedJSHeapSize ?? null,
        jsHeapTotal: perf.memory?.totalJSHeapSize ?? null,
      };
    });

    expect(sdfRequests).toHaveLength(0);
    expect(report.field.totalSidecarBytes).toBeLessThanOrEqual(45 * 1024);

    writeFileSync(
      PERF,
      JSON.stringify(
        {
          cold,
          cachedReselectMs: cachedAbd!.totalMs,
          chestToAbdomen: chestToAbd,
          abdomenToChest: abdToChest,
          otherToAbdomen: otherToAbd,
          chestTiming,
          sidecarRequestCount: sidecarRequests.length,
          sdfRequestCount: sdfRequests.length,
          sidecarBytes: report.field.totalSidecarBytes,
          drawCallsAdditional: 0,
          memory: mem,
        },
        null,
        2,
      ),
    );
  });
});
