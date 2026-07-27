/**
 * Left Ribs V4.4 — real canvas raycast hit tests.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  EXTERIOR,
  INTERIOR,
  openLabLeftRibs,
  openQuoteSelector,
  clickLandmark,
  prepView,
  raycastWorld,
} from "./left-ribs-v44-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v44/report.json");
const HIT = path.join(ROOT, "artifacts/left-ribs-v44/hit-alignment");

test.describe("left ribs V4.4 raycast", () => {
  test("interior / exterior via three-raycast bridge", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabLeftRibs(page, report.field.fieldHash);

    const results: Record<string, unknown> = {};

    for (const point of INTERIOR) {
      const candidates: [number, number, number][] = [
        point.xyz,
        [point.xyz[0] + 0.012, point.xyz[1], point.xyz[2]],
        [point.xyz[0] + 0.02, point.xyz[1], point.xyz[2] - 0.01],
      ];
      let hit = null as Awaited<ReturnType<typeof raycastWorld>>;
      for (const p of candidates) {
        hit = await raycastWorld(page, p);
        if (hit?.publicTargetId === "left_ribs") break;
      }
      results[point.id] = {
        expect: "left_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        point: hit?.point,
        pass: hit?.publicTargetId === "left_ribs",
      };
      expect(hit?.publicTargetId, point.id).toBe("left_ribs");
    }

    for (const point of EXTERIOR) {
      if (point.id === "espalda") {
        await prepView(page, "back-left");
      } else if (point.id === "pecho" || point.id === "abdomen") {
        await prepView(page, "front-left");
      }
      const hit = await raycastWorld(page, point.xyz);
      results[point.id] = {
        expect: "not_left_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        point: hit?.point,
        pass: hit?.publicTargetId !== "left_ribs",
      };
      expect(hit?.publicTargetId, point.id).not.toBe("left_ribs");
    }

    writeFileSync(
      path.join(HIT, "raycast-results.json"),
      JSON.stringify({ via: "three-raycast-bridge", promoted: true, results }, null, 2),
    );
  });

  test("real canvas click resolves left ribs preview", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuoteSelector(page);
    const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
    await clickLandmark(page, mid.xyz, "left_ribs");
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const hit = (
              window as unknown as {
                __neutroLastHit?: { publicTargetId?: string | null; via?: string };
              }
            ).__neutroLastHit;
            return hit?.via === "pointer" ? hit.publicTargetId : null;
          }),
        { timeout: 20_000 },
      )
      .toBe("left_ribs");
  });
});
