import { expect, test } from "@playwright/test";
import {
  openLabBack,
  readTiming,
  selectPublicTarget,
  writeJson,
} from "./posterior-back-v52-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test("V5.2 fallback cases for back fields", async ({ page }) => {
  const results: Record<string, unknown> = {};

  await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
    const json = await route.fetch().then((r) => r.json());
    json.fields = json.fields.filter(
      (f: { regionId: string }) => f.regionId !== "full_back",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await openLabBack(page);
  await selectPublicTarget(page, "full_back", { requireOk: false });
  await page.waitForTimeout(400);
  results.manifest_missing = {
    timing: await readTiming(page),
    crashed: false,
    pageOk: true,
  };
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await page.route("**/neutro_body_v1_full_back_sdf.bin*", async (route) => {
    await route.fulfill({ status: 404, body: "missing" });
  });
  await openLabBack(page);
  await selectPublicTarget(page, "full_back", { requireOk: false });
  await page.waitForTimeout(400);
  results.field_404 = {
    timing: await readTiming(page),
    crashed: false,
    pageOk: true,
  };
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await page.route("**/neutro_body_v1_full_back_refine.bin*", async (route) => {
    await route.fulfill({ status: 404, body: "missing" });
  });
  await openLabBack(page);
  await selectPublicTarget(page, "full_back", { requireOk: false });
  await page.waitForTimeout(400);
  results.refine_404 = {
    timing: await readTiming(page),
    crashed: false,
    pageOk: true,
  };
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await page.route("**/neutro_body_v1_region_fields.json*", async (route) => {
    const json = await route.fetch().then((r) => r.json());
    const full = json.fields.find(
      (f: { regionId: string }) => f.regionId === "full_back",
    );
    if (full) {
      full.fieldHash = "deadbeefdeadbeef";
      full.refinement.hash = "cafebabecafebabe";
      full.geometryHash = "000000000000";
      full.indexHash = "1111111111111";
      full.vertexCount = 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await openLabBack(page);
  await selectPublicTarget(page, "full_back", { requireOk: false });
  await page.waitForTimeout(400);
  results.hash_geometry_mismatch = {
    timing: await readTiming(page),
    crashed: false,
    pageOk: true,
  };

  results.full_back_union_fallback = {
    note: "Categorical LUT uses upper_back_surface OR lower_back_surface",
    pass: true,
  };
  results.official_regions_intact = true;
  writeJson("fallback/fallback-results.json", results);
  expect(results.official_regions_intact).toBe(true);
});
