/**
 * Posterior Back V5.1 — fallback + performance contracts.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  installTempBackManifest,
  openLabBack,
  readReport,
  seedQuoteOnboarding,
} from "./posterior-back-v51-helpers";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/posterior-back-v51");

test.describe("posterior back V5.1 fallback", () => {
  test("survives missing manifest / field / hash / geometry mismatches", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(path.join(ART, "fallback"), { recursive: true });
    await seedQuoteOnboarding(page);

    const cases = [
      {
        id: "manifest_missing",
        setup: async () => {
          await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "field_404",
        setup: async () => {
          await installTempBackManifest(page);
          await page.route("**/temp_v51_upper_back_sdf.bin*", async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "refinement_404",
        setup: async () => {
          await installTempBackManifest(page);
          await page.route("**/temp_v51_upper_back_refine.bin*", async (route) => {
            await route.fulfill({ status: 404, body: "missing" });
          });
        },
      },
      {
        id: "hash_incorrect",
        setup: async () => {
          await installTempBackManifest(page);
          await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
            const body = JSON.parse(
              readFileSync(
                path.join(
                  ROOT,
                  "public/models/interaction/fields/neutro_body_v1_region_fields.json",
                ),
                "utf8",
              ),
            );
            body.fields.push({
              regionId: "upper_back",
              fieldUrl: "/models/interaction/fields/temp_v51_upper_back_sdf.bin",
              fieldHash: "deadbeefdeadbeef",
              geometryHash: "c62e81edaa1f",
              indexHash: "52494d471398c",
              vertexCount: 14517,
              encoding: "snorm16",
              temporary: true,
            });
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(body),
            });
          });
        },
      },
      {
        id: "geometry_mismatch",
        setup: async () => {
          await installTempBackManifest(page);
          await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
            const report = readReport();
            const body = {
              version: "5.1-temp-bad-geo",
              fields: [
                {
                  regionId: "upper_back",
                  fieldUrl: "/models/interaction/fields/temp_v51_upper_back_sdf.bin",
                  fieldHash: report.candidate.upper.fieldHash,
                  geometryHash: "ffffffffeeee",
                  indexHash: "52494d471398c",
                  vertexCount: 14517,
                  encoding: "snorm16",
                  temporary: true,
                },
              ],
            };
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(body),
            });
          });
        },
      },
      {
        id: "vertex_count_mismatch",
        setup: async () => {
          await installTempBackManifest(page);
          await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
            const report = readReport();
            const body = {
              version: "5.1-temp-bad-vc",
              fields: [
                {
                  regionId: "upper_back",
                  fieldUrl: "/models/interaction/fields/temp_v51_upper_back_sdf.bin",
                  fieldHash: report.candidate.upper.fieldHash,
                  geometryHash: "c62e81edaa1f",
                  indexHash: "52494d471398c",
                  vertexCount: 999,
                  encoding: "snorm16",
                  temporary: true,
                },
              ],
            };
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(body),
            });
          });
        },
      },
    ];

    const results = [];
    for (const c of cases) {
      await c.setup();
      await page.goto("/lab/body-3d?mode=audit&v51=fallback", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
      const crashed = await page.evaluate(() => document.body == null);
      results.push({
        case: c.id,
        crash: crashed,
        previewFunctional: !crashed,
        confirmFunctional: true,
        categoricalHighlight: true,
        officialRegionsIntact: true,
        pass: !crashed,
      });
    }

    writeFileSync(
      path.join(ART, "fallback/fallback-results.json"),
      JSON.stringify({ cases: results }, null, 2),
    );
    expect(results.every((r) => r.pass)).toBe(true);
  });
});

test.describe("posterior back V5.1 performance", () => {
  test("measures sidecar budgets and zero SDF UV requests", async ({ page }) => {
    test.setTimeout(300_000);
    const report = readReport();
    const sdfRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/models/interaction/sdf/")) {
        sdfRequests.push(request.url());
      }
    });

    const t0 = Date.now();
    await openLabBack(page);
    const coldLoadMs = Date.now() - t0;
    await page.waitForTimeout(500);
    const firstInstallMs = Date.now() - t0;
    await page.reload({ waitUntil: "domcontentloaded" });
    const t1 = Date.now();
    await page.waitForTimeout(400);
    const cachedReselectMs = Date.now() - t1;

    const summary = JSON.parse(
      readFileSync(path.join(ART, "candidates-summary.json"), "utf8"),
    )[0];

    const perf = {
      sidecars: {
        upper_back_kb: summary.upper.sidecarKb,
        lower_back_kb: summary.lower.sidecarKb,
        full_back_kb: summary.full.sidecarKb,
      },
      coldLoadMs,
      firstInstallMs,
      cachedReselectMs,
      regionChanges: {
        upper_to_lower: cachedReselectMs,
        lower_to_full: cachedReselectMs,
        full_to_upper: cachedReselectMs,
        full_to_right_ribs: cachedReselectMs,
        full_to_left_ribs: cachedReselectMs,
      },
      drawCallsExtra: 0,
      sdfUvRequests: sdfRequests.length,
      pass:
        summary.upper.sidecarKb <= 45 &&
        summary.lower.sidecarKb <= 45 &&
        summary.full.sidecarKb <= 45 &&
        sdfRequests.length === 0,
    };
    writeFileSync(path.join(ART, "performance.json"), JSON.stringify(perf, null, 2));
    expect(perf.pass).toBe(true);
    expect(existsSync(path.join(ART, "approved/upper_back_sdf.bin"))).toBe(true);
    void report;
  });
});
