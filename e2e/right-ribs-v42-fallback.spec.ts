/**
 * Right Ribs V4.2 — Geometry Field fallback paths.
 *
 *   npx playwright test e2e/right-ribs-v42-fallback.spec.ts --config=playwright.v23.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openQuoteSelector,
  clickLandmark,
  readTiming,
} from "./right-ribs-v42-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/right-ribs-v42/report.json");
const OUT = path.join(ROOT, "artifacts/right-ribs-v42/hit-alignment");

test.describe("right ribs V4.2 fallback", () => {
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
                version: "4.2-fallback",
                geometryHash: report.identity.geometryHash,
                indexHash: report.identity.indexHash,
                vertexCount: report.identity.vertexCount,
                indexCount: 80268,
                fields: [
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
                  {
                    regionId: "full_abdomen",
                    surfaceRegionId: "full_abdomen_region",
                    maskIndex: 11,
                    geometryHash: report.identity.geometryHash,
                    indexHash: report.identity.indexHash,
                    vertexCount: report.identity.vertexCount,
                    fieldUrl:
                      "/models/interaction/fields/neutro_body_v1_full_abdomen_sdf.bin",
                    fieldHash: "30a41c0dcc820ab0",
                    encoding: "snorm16",
                    distanceRangeMeters: 0.02,
                    candidateId: "B01",
                    refinement: {
                      url: "/models/interaction/fields/neutro_body_v1_full_abdomen_refine.bin",
                      hash: "e624d3f9ecc9d40a",
                      triangleCount: 225,
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
          await page.route(/right_ribs_sdf\.bin/, async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "refinement_404",
        setup: async () => {
          await page.route(/right_ribs_refine\.bin/, async (route) => {
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
              const res = await route.fetch();
              const json = await res.json();
              const fields = (json.fields as Array<Record<string, unknown>>).map(
                (f) =>
                  f.regionId === "right_ribs"
                    ? { ...f, fieldHash: "deadbeefdeadbeef" }
                    : f,
              );
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ...json, fields }),
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
              const res = await route.fetch();
              const json = await res.json();
              const fields = (json.fields as Array<Record<string, unknown>>).map(
                (f) =>
                  f.regionId === "right_ribs"
                    ? { ...f, geometryHash: "ffffffffaaaa" }
                    : f,
              );
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ...json, fields }),
              });
            },
          );
        },
      },
    ];

    const results: Record<string, unknown> = {};
    for (const c of cases) {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await c.setup();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openQuoteSelector(page);
      const mid = INTERIOR.find((p) => p.id === "costado_medio")!;
      const hit = await clickLandmark(page, mid.xyz);
      expect(hit?.publicTargetId).toBe("right_ribs");
      await page
        .getByRole("button", {
          name: /Costillas derechas · Margen costal lateral derecho/i,
        })
        .click();
      await page.waitForTimeout(800);
      const timing = await readTiming(page);
      const confirm = page.getByRole("button", {
        name: /Confirmar/i,
      });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      await confirm.click();
      await expect(page.getByText("Selección confirmada").first()).toBeVisible({
        timeout: 10_000,
      });
      results[c.id] = {
        hit: hit?.publicTargetId ?? null,
        timingStatus: timing?.status ?? null,
        confirmed: true,
        crash: false,
      };
    }

    writeFileSync(
      path.join(OUT, "fallback-results.json"),
      JSON.stringify({ cases: results, pass: true }, null, 2),
    );
  });
});
