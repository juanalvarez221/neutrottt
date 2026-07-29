/**
 * Full Abdomen V3.2 — temporary browser QA artifacts (GDF offline authority).
 *
 * Official abdomen sidecars are not promoted yet; browser-* PNGs are produced
 * by the Geometry Field renderer used at runtime. This spec validates the
 * staging contract and chest non-regression in the live app.
 *
 *   npx playwright test e2e/full-abdomen-v32-browser.spec.ts --config=playwright.v23.config.ts
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/full-abdomen-v32");
const REPORT = path.join(ART, "report.json");
const BROWSER = path.join(ART, "browser");
const APPROVED = path.join(ART, "approved");

const BROWSER_NAMES = [
  "browser-desktop-front",
  "browser-desktop-front-right-45",
  "browser-desktop-front-left-45",
  "browser-tablet-front",
  "browser-mobile-front",
] as const;

test.describe("full abdomen V3.2 browser staging", () => {
  test("report and browser GDF captures exist for B01 and B02", () => {
    expect(existsSync(REPORT)).toBe(true);
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      passers: string[];
      chestRegression: { intact: boolean };
      promoted: boolean;
    };
    expect(report.chestRegression.intact).toBe(true);
    expect(report.passers).toEqual(expect.arrayContaining(["B01", "B02"]));
    // V3.2 report may still say promoted:false; V3.3 flips the approved candidate.

    for (const id of ["B01", "B02"]) {
      for (const name of BROWSER_NAMES) {
        const file = path.join(BROWSER, `${id}-${name}.png`);
        expect(existsSync(file), file).toBe(true);
        const st = readFileSync(file);
        expect(st.byteLength).toBeGreaterThan(8_000);
      }
    }
  });

  test("approved staging is now the official promotion source", () => {
    expect(existsSync(path.join(APPROVED, "candidate.json"))).toBe(true);
    const cand = JSON.parse(
      readFileSync(path.join(APPROVED, "candidate.json"), "utf8"),
    ) as { officialAssetsOverwritten: boolean; promoted: boolean };
    expect(cand.promoted).toBe(true);
    expect(cand.officialAssetsOverwritten).toBe(true);

    // Official abdomen sidecars are promoted as of V3.3.
    expect(
      existsSync(
        path.join(
          ROOT,
          "public/models/interaction/fields/neutro_body_v1_full_chest_refine.bin",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          ROOT,
          "public/models/interaction/fields/neutro_body_v1_full_abdomen_sdf.bin",
        ),
      ),
    ).toBe(true);
  });

  test("live app keeps Geometry Field for chest without SDF UV", async ({
    page,
  }) => {
    const sdfHits: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/sdf/") || u.includes("sdf.bin") || u.includes("_sdf.png")) {
        sdfHits.push(u);
      }
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("danniel.language", "es");
      window.localStorage.setItem("quote_onboarding_complete", "1");
      window.localStorage.setItem(
        "quote_profile",
        JSON.stringify({
          name: "Mateo Rivas",
          phone: "+57 312 847 1928",
          email: "mateo.rivas@ejemplo.com",
        }),
      );
    });

    await page.goto("/lab/body-3d", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    expect(sdfHits.filter((u) => u.includes("full_abdomen"))).toEqual([]);
  });
});
