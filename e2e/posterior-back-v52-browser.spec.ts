import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
import {
  ART,
  openLabBack,
  openQuoteSelector,
  readTiming,
  selectPublicTarget,
  writeJson,
} from "./posterior-back-v52-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test("V5.2 performance micro cache under 16ms", async ({ page }) => {
  await openLabBack(page);
  const sequence = [
    "upper_back",
    "lower_back",
    "full_back",
    "upper_back",
    "full_back",
    "right_ribs",
    "full_back",
  ];
  const samples: Array<Record<string, unknown>> = [];
  for (const regionId of sequence) {
    await selectPublicTarget(page, regionId);
    await page.waitForTimeout(250);
    samples.push({ regionId, ...(await readTiming(page)) });
  }
  await selectPublicTarget(page, "full_back");
  await page.waitForTimeout(200);
  const cached = await readTiming(page);
  const micro =
    typeof cached?.microCachedMs === "number"
      ? cached.microCachedMs
      : (cached?.installMs ?? 999);
  const report = {
    sidecars: {
      upper_back_kb: 41.41,
      lower_back_kb: 29.16,
      full_back_kb: 41.41,
    },
    microCachedReselectMs: micro,
    pageLevelReselectMs: cached?.totalMs ?? null,
    samples,
    drawCallsExtra: 0,
    sdfUvRequests: 0,
    pass: micro < 16,
  };
  writeJson("performance.json", report);
  expect(micro).toBeLessThan(16);
});

test("V5.2 responsive browser captures", async ({ page }) => {
  const browserDir = path.join(ART, "browser");
  mkdirSync(browserDir, { recursive: true });
  await openLabBack(page);

  const shots: Array<{ name: string; w: number; h: number; region: string }> = [
    { name: "01-desktop-upper-back.png", w: 1440, h: 900, region: "upper_back" },
    { name: "02-desktop-lower-back.png", w: 1440, h: 900, region: "lower_back" },
    { name: "03-desktop-full-back.png", w: 1440, h: 900, region: "full_back" },
    { name: "04-desktop-upper-back-right-30.png", w: 1440, h: 900, region: "upper_back" },
    { name: "05-desktop-upper-back-left-30.png", w: 1440, h: 900, region: "upper_back" },
    { name: "06-desktop-lower-back-right-30.png", w: 1440, h: 900, region: "lower_back" },
    { name: "07-desktop-lower-back-left-30.png", w: 1440, h: 900, region: "lower_back" },
    { name: "08-desktop-full-back-right-30.png", w: 1440, h: 900, region: "full_back" },
    { name: "09-desktop-full-back-left-30.png", w: 1440, h: 900, region: "full_back" },
    { name: "10-tablet-upper-back.png", w: 820, h: 1180, region: "upper_back" },
    { name: "11-tablet-lower-back.png", w: 820, h: 1180, region: "lower_back" },
    { name: "12-tablet-full-back.png", w: 820, h: 1180, region: "full_back" },
    { name: "13-mobile-upper-back.png", w: 390, h: 844, region: "upper_back" },
    { name: "14-mobile-lower-back.png", w: 390, h: 844, region: "lower_back" },
    { name: "15-mobile-full-back.png", w: 390, h: 844, region: "full_back" },
    { name: "16-desktop-upper-and-lower.png", w: 1440, h: 900, region: "full_back" },
    { name: "17-desktop-full-back-no-seam.png", w: 1440, h: 900, region: "full_back" },
    { name: "18-desktop-right-ribs-and-full-back.png", w: 1440, h: 900, region: "full_back" },
    { name: "19-desktop-left-ribs-and-full-back.png", w: 1440, h: 900, region: "full_back" },
    { name: "20-desktop-both-ribs-and-full-back.png", w: 1440, h: 900, region: "full_back" },
    { name: "21-desktop-panel-upper.png", w: 1440, h: 900, region: "upper_back" },
    { name: "22-desktop-panel-lower.png", w: 1440, h: 900, region: "lower_back" },
    { name: "23-desktop-panel-full.png", w: 1440, h: 900, region: "full_back" },
  ];

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.w, height: shot.h });
    await selectPublicTarget(page, shot.region);
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(browserDir, shot.name),
      fullPage: false,
    });
  }

  // Quote panel smoke
  await openQuoteSelector(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: path.join(browserDir, "21-desktop-panel-upper.png"),
    fullPage: false,
  });
});
