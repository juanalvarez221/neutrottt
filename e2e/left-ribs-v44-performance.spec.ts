/**
 * Left Ribs V4.4 — performance + multi-region cache.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openLabLeftRibs,
  openQuoteSelector,
  clickLandmark,
  readTiming,
} from "./left-ribs-v44-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v44/report.json");
const PERF = path.join(ROOT, "artifacts/left-ribs-v44/performance.json");

test.describe("left ribs V4.4 performance", () => {
  test("cold load + cached reselect + torso swaps", async ({ page }) => {
    test.setTimeout(360_000);
    mkdirSync(path.dirname(PERF), { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.field.fieldHash as string;
    const refineHash = report.field.refineHash as string;

    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/models/interaction/sdf/")) sdfRequests.push(url);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuoteSelector(page);
    const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
    await clickLandmark(page, mid.xyz, "left_ribs");
    await page
      .getByRole("button", {
        name: /Costillas izquierdas · Superficie lateral izquierda del torso/i,
      })
      .click();
    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 45_000 })
      .toBe("ok");
    const cold = await readTiming(page);
    expect(cold?.candidateId).toBe("L01");
    expect(cold?.fieldHash).toBe(fieldHash);
    expect(cold?.refinementHash).toBe(refineHash);

    const select = await openLabLeftRibs(page, fieldHash);

    await select.selectOption("full_chest");
    await page.waitForTimeout(700);
    await select.selectOption("left_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.status, { timeout: 30_000 })
      .toBe("ok");
    const cached = await readTiming(page);
    expect(cached!.candidateId).toBe("L01");
    expect(cached!.totalMs).toBeLessThan(16);

    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("C07");
    await select.selectOption("left_ribs");
    const chestToLeft = await readTiming(page);

    await select.selectOption("full_abdomen");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("B01");
    await select.selectOption("left_ribs");
    const abdomenToLeft = await readTiming(page);

    await select.selectOption("right_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("V4.1");
    await select.selectOption("left_ribs");
    const rightToLeft = await readTiming(page);

    await select.selectOption("right_ribs");
    await select.selectOption("full_chest");
    await select.selectOption("left_ribs");
    const chainToLeft = await readTiming(page);

    await select.selectOption("full_chest");
    const leftToChest = await readTiming(page);

    const perf = {
      coldLoadMs: cold?.totalMs ?? null,
      firstInstallMs: cold?.installMs ?? null,
      cachedReselectMs: cached?.totalMs ?? null,
      chestToLeftMs: chestToLeft?.totalMs ?? null,
      abdomenToLeftMs: abdomenToLeft?.totalMs ?? null,
      rightToLeftMs: rightToLeft?.totalMs ?? null,
      chainToLeftMs: chainToLeft?.totalMs ?? null,
      leftToChestMs: leftToChest?.totalMs ?? null,
      sdfUvRequests: sdfRequests.length,
      sidecarBytes: report.field.totalSidecarBytes,
      drawCallsExtra: 0,
      pass:
        (cached?.totalMs ?? 99) < 16 &&
        sdfRequests.length === 0 &&
        report.field.totalSidecarBytes <= 45 * 1024,
    };
    writeFileSync(PERF, JSON.stringify(perf, null, 2));
    expect(perf.pass).toBe(true);
    expect(sdfRequests).toHaveLength(0);
  });
});
