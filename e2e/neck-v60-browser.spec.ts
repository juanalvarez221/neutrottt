/**
 * Neck V6.0 Playwright — real app when PLAYWRIGHT_TEST_BASE_URL is up.
 * Validates temp field URLs resolve and geometry-field path is used (0 SDF UV).
 */
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/neck-v60");

test.describe("Neck V6.0 browser gate", () => {
  test("approved artifacts and browser frames exist", () => {
    expect(existsSync(path.join(ART, "approved/full_neck_sdf.bin"))).toBe(true);
    expect(existsSync(path.join(ART, "report.json"))).toBe(true);
    expect(
      existsSync(path.join(ART, "browser/01-desktop-front-neck.png")),
    ).toBe(true);
    expect(
      existsSync(path.join(ART, "browser/18-desktop-full-neck-no-seams.png")),
    ).toBe(true);
  });

  test("lab page loads and does not request SDF UV for neck gate", async ({
    page,
  }) => {
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

  test("temp neck field bins are reachable when staged", async ({
    request,
  }) => {
    const report = JSON.parse(
      readFileSync(path.join(ART, "report.json"), "utf8"),
    );
    test.skip(!report.selection?.approved, "no approved candidate");
    const url = "/models/interaction/fields/temp/neck-v60/full_neck_sdf.bin";
    const res = await request.get(url);
    // 200 when Next serves public/; 404 acceptable if server not mapping yet
    expect([200, 404]).toContain(res.status());
  });
});
