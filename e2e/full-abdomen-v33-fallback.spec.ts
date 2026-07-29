/**
 * Full Abdomen V3.3 — Geometry Field fallback paths.
 *
 *   npx playwright test e2e/full-abdomen-v33-fallback.spec.ts --config=playwright.v23.config.ts
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
const OUT = path.join(ROOT, "artifacts/full-abdomen-v33/fallback");

test.describe("full abdomen V3.3 fallback", () => {
  test("degrades to categorical highlight without breaking selection", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    mkdirSync(OUT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const cases: {
      id: string;
      setup: () => Promise<void>;
    }[] = [
      {
        id: "manifest_missing_entry",
        setup: async () => {
          await page.route(
            /neutro_body_v1_region_fields\.json/,
            async (route) => {
              const body = {
                model: "neutro_body_v1",
                version: "3.3-fallback",
                geometryHash: report.identity.geometryHash,
                indexHash: report.identity.indexHash,
                vertexCount: report.identity.vertexCount,
                indexCount: 80268,
                fields: [
                  // Keep chest so abdomen failure cannot poison C07.
                  {
                    regionId: "full_chest",
                    surfaceRegionId: "full_chest_surface",
                    maskIndex: 9,
                    geometryHash: report.identity.geometryHash,
                    indexHash: report.identity.indexHash,
                    vertexCount: report.identity.vertexCount,
                    fieldUrl:
                      "/models/interaction/fields/neutro_body_v1_full_chest_sdf.bin",
                    fieldHash: "cc4f1242dc879825",
                    encoding: "snorm16",
                    distanceRangeMeters: 0.02,
                    candidateId: "C07",
                    refinement: {
                      url: "/models/interaction/fields/neutro_body_v1_full_chest_refine.bin",
                      hash: "b309a72b943d16e8",
                      triangleCount: 156,
                      bandMeters: 0.005,
                      encoding: "u32-snorm16x3",
                    },
                  },
                ],
              };
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(body),
              });
            },
          );
        },
      },
      {
        id: "field_404",
        setup: async () => {
          await page.route(/full_abdomen_sdf\.bin/, async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "refinement_404",
        setup: async () => {
          await page.route(/full_abdomen_refine\.bin/, async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "field_hash_incorrect",
        setup: async () => {
          await page.route(
            /neutro_body_v1_region_fields\.json/,
            async (route) => {
              const original = JSON.parse(readFileSync(
                path.join(
                  ROOT,
                  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
                ),
                "utf8",
              ));
              const abd = original.fields.find(
                (f: { regionId: string }) => f.regionId === "full_abdomen",
              );
              if (abd) abd.fieldHash = "deadbeefdeadbeef";
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(original),
              });
            },
          );
        },
      },
      {
        id: "geometry_mismatch",
        setup: async () => {
          await page.route(
            /neutro_body_v1_region_fields\.json/,
            async (route) => {
              const original = JSON.parse(readFileSync(
                path.join(
                  ROOT,
                  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
                ),
                "utf8",
              ));
              const abd = original.fields.find(
                (f: { regionId: string }) => f.regionId === "full_abdomen",
              );
              if (abd) {
                abd.geometryHash = "ffffffffffffffffffff";
                abd.vertexCount = 99999;
              }
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(original),
              });
            },
          );
        },
      },
    ];

    const results: Record<
      string,
      { timingStatus: string | null; previewOk: boolean; confirmOk: boolean }
    > = {};

    for (const c of cases) {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await c.setup();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openQuoteSelector(page);
      const umbilical = INTERIOR.find((p) => p.id === "umbilical")!;
      await clickLandmark(page, umbilical.xyz, "full_abdomen");
      await expect(page.getByText("Abdomen completo").first()).toBeVisible({
        timeout: 15_000,
      });
      await page
        .getByRole("button", {
          name: /Abdomen completo · Superficie frontal completa del abdomen/i,
        })
        .click();
      await page.waitForTimeout(800);
      const timing = await readTiming(page);
      const confirm = page.getByRole("button", {
        name: /Confirmar selección/i,
      });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      await confirm.click();
      await expect(page.getByText("Selección confirmada").first()).toBeVisible({
        timeout: 10_000,
      });
      results[c.id] = {
        timingStatus: timing?.status ?? null,
        previewOk: true,
        confirmOk: true,
      };
    }

    // Chest field must still load after abdomen fallback cases.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await openLabAbdomen(page, report.field.fieldHash);
    const select = page
      .locator("select")
      .filter({ has: page.locator('option[value="full_chest"]') })
      .first();
    await select.selectOption("full_chest");
    await expect
      .poll(async () => (await readTiming(page))?.candidateId, {
        timeout: 30_000,
      })
      .toBe("C07");

    writeFileSync(
      path.join(OUT, "fallback-results.json"),
      JSON.stringify({ results, chestIntactAfter: true }, null, 2),
    );

    for (const r of Object.values(results)) {
      expect(r.previewOk).toBe(true);
      expect(r.confirmOk).toBe(true);
    }
  });
});
