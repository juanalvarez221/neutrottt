/**
 * Left Ribs V4.3 — temporary field performance (no official promote).
 *
 *   npx playwright test e2e/left-ribs-v43-performance.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  installTempLeftRibsManifest,
  openLabLeftRibs,
  readTiming,
} from "./left-ribs-v43-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v43/report.json");
const PERF = path.join(ROOT, "artifacts/left-ribs-v43/performance.json");

test.describe("left ribs V4.3 temporary performance", () => {
  test("cold load + cached reselect + bilateral swaps", async ({ page }) => {
    test.setTimeout(360_000);
    mkdirSync(path.dirname(PERF), { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const fieldHash = report.staged.fieldHash as string;
    const refineHash = report.staged.refineHash as string;

    const sidecarRequests: string[] = [];
    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/models/interaction/fields/")) sidecarRequests.push(url);
      if (url.includes("/models/interaction/sdf/")) sdfRequests.push(url);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTempLeftRibsManifest(page, fieldHash, refineHash);
    const select = await openLabLeftRibs(page, fieldHash, refineHash);
    const cold = await readTiming(page);
    expect(cold?.candidateId).toBe("L01");
    expect(cold?.fieldHash).toBe(fieldHash);
    expect(cold?.status).toBe("ok");

    await select.selectOption("full_chest");
    await page.waitForTimeout(500);
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
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("L01");
    const chestToLeft = await readTiming(page);

    await select.selectOption("full_abdomen");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("B01");
    await select.selectOption("left_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("L01");
    const abdomenToLeft = await readTiming(page);

    await select.selectOption("right_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("V4.1");
    await select.selectOption("left_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("L01");
    const rightToLeft = await readTiming(page);

    await select.selectOption("right_ribs");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("V4.1");
    const leftToRight = await readTiming(page);

    const perf = {
      via: "playwright-temp-manifest",
      temporary: true,
      promoted: false,
      coldLoadMs: cold?.totalMs ?? null,
      firstInstallMs: cold?.installMs ?? null,
      cachedReselectMs: cached?.totalMs ?? null,
      chestToLeftMs: chestToLeft?.totalMs ?? null,
      abdomenToLeftMs: abdomenToLeft?.totalMs ?? null,
      rightToLeftMs: rightToLeft?.totalMs ?? null,
      leftToRightMs: leftToRight?.totalMs ?? null,
      sidecarRequests: sidecarRequests.length,
      sdfUvRequests: sdfRequests.length,
      sidecarBytes: report.staged.totalSidecarBytes,
      drawCallsExtra: 0,
      pass:
        (cached?.totalMs ?? 99) < 16 &&
        sdfRequests.length === 0 &&
        report.staged.totalSidecarBytes <= 45 * 1024,
    };
    writeFileSync(PERF, JSON.stringify(perf, null, 2));
    expect(perf.pass).toBe(true);
  });
});
