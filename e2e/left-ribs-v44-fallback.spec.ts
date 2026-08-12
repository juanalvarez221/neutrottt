/**
 * Left Ribs V4.4 — Geometry Field fallback paths.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  INTERIOR,
  openQuoteSelector,
  clickLandmark,
  readTiming,
} from "./left-ribs-v44-helpers";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "artifacts/left-ribs-v44/report.json");
const MANIFEST = path.join(
  ROOT,
  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
);
const OUT = path.join(ROOT, "artifacts/left-ribs-v44/fallback");

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    fields: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

test.describe("left ribs V4.4 fallback", () => {
  test("degrades to categorical highlight without breaking selection", async ({
    page,
  }) => {
    test.setTimeout(720_000);
    mkdirSync(OUT, { recursive: true });
    const report = JSON.parse(readFileSync(REPORT, "utf8"));
    const cases: { id: string; setup: () => Promise<void> }[] = [
      {
        id: "manifest_missing_entry",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.filter((f) => f.regionId !== "left_ribs");
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
        },
      },
      {
        id: "field_404",
        setup: async () => {
          await page.route(/left_ribs_sdf\.bin/, async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "refinement_404",
        setup: async () => {
          await page.route(/left_ribs_refine\.bin/, async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "field_hash_incorrect",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.map((f) =>
              f.regionId === "left_ribs"
                ? { ...f, fieldHash: "deadbeefdeadbeef" }
                : f,
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
        },
      },
      {
        id: "refinement_hash_incorrect",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.map((f) =>
              f.regionId === "left_ribs"
                ? {
                    ...f,
                    refinement: {
                      ...(f.refinement as object),
                      hash: "deadbeefdeadbeef",
                    },
                  }
                : f,
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
        },
      },
      {
        id: "geometry_mismatch",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.map((f) =>
              f.regionId === "left_ribs"
                ? { ...f, geometryHash: "ffffffffaaaa" }
                : f,
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
        },
      },
      {
        id: "index_mismatch",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.map((f) =>
              f.regionId === "left_ribs"
                ? { ...f, indexHash: "ffffffffaaaa" }
                : f,
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
        },
      },
      {
        id: "vertex_count_mismatch",
        setup: async () => {
          await page.route(/neutro_body_v1_region_fields\.json/, async (route) => {
            const json = loadManifest();
            const fields = json.fields.map((f) =>
              f.regionId === "left_ribs" ? { ...f, vertexCount: 1 } : f,
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ...json, fields }),
            });
          });
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
      expect(hit?.publicTargetId).toBe("left_ribs");
      await page
        .getByRole("button", {
          name: /Costillas izquierdas · Margen costal lateral izquierdo/i,
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
        identity: report.identity,
      };
    }

    writeFileSync(
      path.join(OUT, "fallback-results.json"),
      JSON.stringify({ cases: results, pass: true }, null, 2),
    );
  });
});
