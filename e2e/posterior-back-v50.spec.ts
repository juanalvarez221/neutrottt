/**
 * Temporal Playwright smoke for Posterior Back V5.0.
 * Skips heavy browser install when artifacts-only; validates report contracts.
 */
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts/posterior-back-v50");

test.describe("Posterior Back V5.0 temporal", () => {
  test("artifacts and report exist with freeze intact", async () => {
    const report = JSON.parse(
      readFileSync(path.join(ART, "report.json"), "utf8"),
    );
    expect(report.preconditions.freeze).toBe(true);
    expect(report.preconditions.maskHash).toBe("6134058b9b59");
    expect(report.uBack.pass).toBe(true);
    expect(report.seams.right.pass).toBe(true);
    expect(report.seams.left.pass).toBe(true);
    expect(report.promoted).toBe(false);
    expect(existsSync(path.join(ART, "diagnostic/01-u-back-gradient.png"))).toBe(
      true,
    );
    expect(existsSync(path.join(ART, "contact-full-back.png"))).toBe(true);
  });

  test("raycast analytical probes written for finalist", async () => {
    const probesPath = path.join(ART, "raycast/analytical-probes.json");
    expect(existsSync(probesPath)).toBe(true);
    const probes = JSON.parse(readFileSync(probesPath, "utf8"));
    expect(probes.upper.length).toBeGreaterThanOrEqual(4);
    expect(probes.lower.length).toBeGreaterThanOrEqual(4);
    expect(probes.full.length).toBeGreaterThanOrEqual(8);
    expect(probes.exteriors.length).toBeGreaterThanOrEqual(6);
    // Upper interiors should mostly hit
    const upperHits = probes.upper.filter((p: { inside?: boolean }) => p.inside);
    expect(upperHits.length).toBeGreaterThanOrEqual(2);
  });

  test("no official promotion sidecars for back", async () => {
    expect(
      existsSync(
        path.join(
          ROOT,
          "public/models/interaction/fields/neutro_body_v1_upper_back_sdf.bin",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          ROOT,
          "public/models/interaction/fields/neutro_body_v1_full_back_sdf.bin",
        ),
      ),
    ).toBe(false);
  });
});
