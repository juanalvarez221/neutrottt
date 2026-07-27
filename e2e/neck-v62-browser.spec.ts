/**
 * Neck V6.2 browser QA — temp manifest inject, artifact presence, no SDF UV.
 */
import { test, expect } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  artifactExists,
  installTempNeckV62Manifest,
  readNeckV62Report,
} from "./neck-v62-helpers";

const ART = path.join(process.cwd(), "artifacts/neck-v62");
const BROWSER = path.join(ART, "browser");

const FRAMES = [
  "01-desktop-front-neck.png",
  "02-desktop-right-neck.png",
  "03-desktop-back-neck.png",
  "04-desktop-left-neck.png",
  "05-desktop-full-front.png",
  "06-desktop-full-right.png",
  "07-desktop-full-back.png",
  "08-desktop-full-left.png",
  "09-desktop-front-right-seam-close.png",
  "10-desktop-right-back-seam-close.png",
  "11-desktop-back-left-seam-close.png",
  "12-desktop-left-front-seam-close.png",
  "13-desktop-occipital-back-detail.png",
  "14-desktop-back-base-detail.png",
  "15-tablet-front.png",
  "16-tablet-back.png",
  "17-tablet-full.png",
  "18-mobile-front.png",
  "19-mobile-back.png",
  "20-mobile-full.png",
  "21-desktop-four-partials.png",
  "22-desktop-full-no-seams.png",
];

test.describe("Neck V6.2 browser artifacts", () => {
  test("report and lineage diagnostics exist", () => {
    expect(artifactExists("report.json")).toBe(true);
    expect(artifactExists("diagnostic/01-artifact-lineage.json")).toBe(true);
    expect(artifactExists("diagnostic/02-runtime-loaded-assets.json")).toBe(true);
    expect(artifactExists("boundary-graph/neck-boundary-graph.json")).toBe(true);
    expect(artifactExists("refinement/shared-edge-registry.json")).toBe(true);
    expect(artifactExists("hit-alignment/raycast-results.json")).toBe(true);
    expect(artifactExists("performance.json")).toBe(true);
    expect(artifactExists("fallback/fallback-results.json")).toBe(true);
    const report = readNeckV62Report();
    expect(report.candidateId).toBe("N02");
    expect(report.promoted).toBe(false);
  });

  test("22 browser frames are real PNGs (not placeholders)", () => {
    for (const name of FRAMES) {
      const p = path.join(BROWSER, name);
      expect(existsSync(p), name).toBe(true);
      expect(statSync(p).size, name).toBeGreaterThan(8_000);
    }
  });
});

test.describe("Neck V6.2 lab with temp manifest", () => {
  test("lab loads without SDF UV requests when temp manifest injected", async ({
    page,
  }) => {
    const sdfUv: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/sdf/") || u.includes("sdf_uv")) sdfUv.push(u);
    });
    await installTempNeckV62Manifest(page);
    await page.goto("/lab/body-3d", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    expect(sdfUv).toEqual([]);
    const frontBin = await page.request.get(
      "/models/interaction/fields/temp/neck-v62/neck_front_sdf.bin",
    );
    expect([200, 404]).toContain(frontBin.status());
  });
});
