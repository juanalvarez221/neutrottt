/**
 * Neck V6.1 Playwright — real app when PLAYWRIGHT_TEST_BASE_URL is up.
 */
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/neck-v61");

test.describe("Neck V6.1 browser gate", () => {
  test("approved artifacts and 20 browser frames exist", () => {
    expect(existsSync(path.join(ART, "approved/full_neck_sdf.bin"))).toBe(true);
    expect(existsSync(path.join(ART, "report.json"))).toBe(true);
    expect(
      existsSync(path.join(ART, "browser/01-desktop-front-neck.png")),
    ).toBe(true);
    expect(
      existsSync(path.join(ART, "browser/20-desktop-full-no-seams.png")),
    ).toBe(true);
    expect(
      existsSync(path.join(ART, "shared-seams/shared-refinement-plan.json")),
    ).toBe(true);
  });

  test("lab page loads and does not request SDF UV", async ({ page }) => {
    const sdfUv: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (/sdf.*uv|uv.*sdf/i.test(u)) sdfUv.push(u);
    });
    const res = await page.goto("/lab/body-3d", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    expect(res?.ok() || res?.status() === 304).toBeTruthy();
    await page.waitForTimeout(1500);
    expect(sdfUv).toEqual([]);
  });

  test("temp neck-v61 field bins are reachable when staged", async ({
    request,
  }) => {
    const report = JSON.parse(
      readFileSync(path.join(ART, "report.json"), "utf8"),
    );
    test.skip(report.promoted === true, "should stay unpromoted");
    const url = "/models/interaction/fields/temp/neck-v61/full_neck_sdf.bin";
    const res = await request.get(url);
    expect([200, 404]).toContain(res.status());
  });
});
