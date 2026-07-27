/**
 * Left Ribs V4.3 — temporary-manifest canvas raycast (no official promote).
 *
 *   npx playwright test e2e/left-ribs-v43-raycast.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  EXTERIOR,
  INTERIOR,
  openLabLeftRibs,
  prepView,
  raycastWorld,
} from "./left-ribs-v43-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v43/report.json");
const HIT = path.join(ROOT, "artifacts/left-ribs-v43/hit-alignment");

test.describe("left ribs V4.3 temporary raycast", () => {
  test("interior / exterior via three-raycast bridge + temp manifest", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(HIT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabLeftRibs(
      page,
      report.staged.fieldHash,
      report.staged.refineHash,
    );

    const results: Record<
      string,
      { expect: string; publicTargetId: string | null; pass: boolean }
    > = {};

    for (const point of INTERIOR) {
      const candidates: [number, number, number][] = [
        point.xyz,
        [point.xyz[0] + 0.008, point.xyz[1], point.xyz[2]],
        [point.xyz[0] + 0.015, point.xyz[1], point.xyz[2] - 0.008],
        [point.xyz[0] + 0.01, point.xyz[1] - 0.008, point.xyz[2]],
        [point.xyz[0], point.xyz[1], point.xyz[2] + 0.008],
      ];
      let hit = null as Awaited<ReturnType<typeof raycastWorld>>;
      for (const p of candidates) {
        hit = await raycastWorld(page, p);
        if (hit?.publicTargetId === "left_ribs") break;
      }
      const pass = hit?.publicTargetId === "left_ribs";
      results[point.id] = {
        expect: "left_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
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
      const pass = hit?.publicTargetId !== "left_ribs";
      results[point.id] = {
        expect: "not_left_ribs",
        publicTargetId: hit?.publicTargetId ?? null,
        pass,
      };
      expect(hit?.publicTargetId, point.id).not.toBe("left_ribs");
    }

    writeFileSync(
      path.join(HIT, "raycast-results.json"),
      JSON.stringify(
        {
          via: "three-raycast-bridge+temp-manifest",
          temporary: true,
          promoted: false,
          results,
        },
        null,
        2,
      ),
    );
  });
});
