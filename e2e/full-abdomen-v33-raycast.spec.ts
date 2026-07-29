/**
 * Full Abdomen V3.3 — real canvas raycast hit tests.
 *
 *   npx playwright test e2e/full-abdomen-v33-raycast.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  EXTERIOR,
  INTERIOR,
  openLabAbdomen,
  openQuoteSelector,
  clickLandmark,
  raycastWorld,
  SEAM,
} from "./full-abdomen-v33-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/full-abdomen-v33/report.json");
const HIT = path.join(ROOT, "artifacts/full-abdomen-v33/hit-alignment");

test.describe("full abdomen V3.3 raycast", () => {
  test("interior / exterior / seam via three-raycast bridge", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabAbdomen(page, report.field.fieldHash);

    const results: Record<
      string,
      { expect: string; publicTargetId: string | null; pass: boolean }
    > = {};

    for (const point of INTERIOR) {
      const hit = await raycastWorld(page, point.xyz);
      const pass = hit?.publicTargetId === "full_abdomen";
      results[point.id] = {
        expect: "full_abdomen",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).toBe("full_abdomen");
    }

    for (const point of EXTERIOR) {
      const hit = await raycastWorld(page, point.xyz);
      const pass = hit?.publicTargetId !== "full_abdomen";
      results[point.id] = {
        expect: "not_full_abdomen",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).not.toBe("full_abdomen");
    }

    const chestHit = await raycastWorld(page, SEAM.chest.xyz);
    const abdHit = await raycastWorld(page, SEAM.abdomen.xyz);
    results[SEAM.chest.id] = {
      expect: "full_chest",
      publicTargetId: chestHit?.publicTargetId ?? null,
      pass: chestHit?.publicTargetId === "full_chest",
    };
    results[SEAM.abdomen.id] = {
      expect: "full_abdomen",
      publicTargetId: abdHit?.publicTargetId ?? null,
      pass: abdHit?.publicTargetId === "full_abdomen",
    };
    expect(chestHit?.publicTargetId).toBe("full_chest");
    expect(abdHit?.publicTargetId).toBe("full_abdomen");

    writeFileSync(
      path.join(HIT, "raycast-results.json"),
      JSON.stringify({ via: "three-raycast-bridge", results }, null, 2),
    );
  });

  test("real canvas click resolves abdomen preview", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openQuoteSelector(page);
    const umbilical = INTERIOR.find((p) => p.id === "umbilical")!;
    await clickLandmark(page, umbilical.xyz, "full_abdomen");
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
      .toBe("full_abdomen");
  });
});
