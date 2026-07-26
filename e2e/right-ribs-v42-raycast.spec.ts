/**
 * Right Ribs V4.2 — real canvas raycast hit tests.
 *
 *   npx playwright test e2e/right-ribs-v42-raycast.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  EXTERIOR,
  INTERIOR,
  openLabRibs,
  openQuoteSelector,
  clickLandmark,
  raycastWorld,
} from "./right-ribs-v42-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/right-ribs-v42/report.json");
const HIT = path.join(ROOT, "artifacts/right-ribs-v42/hit-alignment");

test.describe("right ribs V4.2 raycast", () => {
  test("interior / exterior via three-raycast bridge", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabRibs(page, report.field.fieldHash);

    const results: Record<
      string,
      { expect: string; publicTargetId: string | null; pass: boolean }
    > = {};

    for (const point of INTERIOR) {
      const candidates: [number, number, number][] = [
        point.xyz,
        [point.xyz[0] - 0.012, point.xyz[1], point.xyz[2]],
        [point.xyz[0] - 0.02, point.xyz[1], point.xyz[2] - 0.01],
      ];
      let hit = null as Awaited<ReturnType<typeof raycastWorld>>;
      for (const p of candidates) {
        hit = await raycastWorld(page, p);
        if (hit?.publicTargetId === "right_ribs") break;
      }
      const pass = hit?.publicTargetId === "right_ribs";
      results[point.id] = {
        expect: "right_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).toBe("right_ribs");
    }

    for (const point of EXTERIOR) {
      const hit = await raycastWorld(page, point.xyz);
      const pass = hit?.publicTargetId !== "right_ribs";
      results[point.id] = {
        expect: "not_right_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).not.toBe("right_ribs");
    }

    writeFileSync(
      path.join(HIT, "raycast-results.json"),
      JSON.stringify({ via: "three-raycast-bridge", results }, null, 2),
    );
  });

  test("real canvas click resolves ribs preview", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuoteSelector(page);
    const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
    await clickLandmark(page, mid.xyz, "right_ribs");
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
      .toBe("right_ribs");
  });
});
