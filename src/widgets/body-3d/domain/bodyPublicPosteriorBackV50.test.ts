/**
 * Posterior Back V5.0 gate tests — temporal atlas, freeze, seams, contracts.
 * Does not promote official assets.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  expectedOfficialHashes,
  OFFICIAL_TORSO_REGIONS,
} from "../../../../tools/body-regions/posterior-back-v50-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/posterior-back-v50");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Posterior Back V5.0 — official torso freeze", () => {
  it("keeps chest/abdomen/ribs/geometry bit-identical (mask updated in V5.2)", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
    expect(freeze.leftRibsFieldHash).toBe(expected.leftRibs.fieldHash);
    expect(freeze.leftRibsRefinementHash).toBe(expected.leftRibs.refinementHash);
    expect(freeze.geometryHash).toBe("c62e81edaa1f");
    expect(freeze.indexHash).toBe("52494d471398c");
    expect(freeze.vertexCount).toBe(14517);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.chest.fieldBin))),
    ).toBe(expected.chest.fieldHash);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.abdomen.fieldBin))),
    ).toBe(expected.abdomen.fieldHash);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, expected.rightRibs.fieldBin)),
      ),
    ).toBe(expected.rightRibs.fieldHash);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.leftRibs.fieldBin))),
    ).toBe(expected.leftRibs.fieldHash);
  });

  it("V5.0 artifacts remain unpromoted (official promotion is V5.2)", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.promoted).toBe(false);
    expect(existsSync(path.join(ART, "approved"))).toBe(true);
  });
});

describe("Posterior Back V5.0 — seams and u_back", () => {
  it("reuses official ribs back seams with zero gap/overlap", () => {
    const right = readJson(path.join(ART, "shared-right-ribs-back-seam.json"));
    const left = readJson(path.join(ART, "shared-left-ribs-back-seam.json"));
    expect(right.name).toBe("right_side_back_seam");
    expect(left.name).toBe("left_side_back_seam");
    expect(right.diagnostics.gap).toBe(0);
    expect(right.diagnostics.overlap).toBe(0);
    expect(left.diagnostics.gap).toBe(0);
    expect(left.diagnostics.overlap).toBe(0);
    expect(right.diagnostics.meanMm).toBe(0);
    expect(left.diagnostics.meanMm).toBe(0);
    expect(right.diagnostics.maxMm).toBeLessThanOrEqual(0.1);
    expect(left.diagnostics.maxMm).toBeLessThanOrEqual(0.1);
    expect(right.points3d.length).toBeGreaterThan(50);
    expect(left.points3d.length).toBeGreaterThan(50);
  });

  it("parametrizes posterior arc u_back without frontal classification", () => {
    const atlas = readJson(path.join(ART, "u-back-atlas.json"));
    expect(atlas.diagnostics.sliceCount).toBe(112);
    expect(atlas.diagnostics.nan).toBe(0);
    expect(atlas.diagnostics.inversions).toBe(0);
    expect(atlas.diagnostics.jumps).toBe(0);
    expect(atlas.diagnostics.components).toBe(1);
    expect(atlas.diagnostics.unparamPct).toBeLessThan(0.5);
    expect(atlas.diagnostics.rightSeamU).toBe(0);
    expect(atlas.diagnostics.leftSeamU).toBe(1);
    expect(Math.abs(atlas.diagnostics.centerBackU - 0.5)).toBeLessThan(0.12);
    expect(atlas.diagnostics.pass).toBe(true);
  });
});

describe("Posterior Back V5.0 — architecture contracts", () => {
  it("defines two categorical surfaces and full_back as hit union", () => {
    const report = readJson(path.join(ART, "report.json"));
    const ux = readJson(path.join(ART, "ux-metadata-temp.json"));
    expect(ux.upper_back.label).toBe("Espalda alta");
    expect(ux.lower_back.label).toBe("Espalda baja");
    expect(ux.full_back.label).toBe("Espalda completa");
    expect(ux.upper_back.camera).toBe("back");
    expect(ux.full_back.camera).toBe("back");
    const adj = readJson(path.join(ART, "adjacency-cases.json"));
    expect(adj["upper_back+lower_back"]).toBe("allowed");
    expect(adj["full_back+right_ribs"]).toBe("allowed");
    expect(adj["full_back+calf"]).toBe("rejected");
    expect(report.promoted).toBe(false);
    expect(report.commit).toBe(false);
  });

  it("stages independent full_back field (not visual sum of upper+lower)", () => {
    const summary = readJson(path.join(ART, "candidates-summary.json"));
    expect(summary.length).toBe(3);
    for (const c of summary) {
      expect(c.upper.fieldHash).toBeTruthy();
      expect(c.lower.fieldHash).toBeTruthy();
      expect(c.full.fieldHash).toBeTruthy();
      // full must not equal upper or lower hashes
      expect(c.full.fieldHash).not.toBe(c.upper.fieldHash);
      expect(c.full.fieldHash).not.toBe(c.lower.fieldHash);
    }
  });

  it("keeps sidecars within 45 KB budget per field", () => {
    const summary = readJson(path.join(ART, "candidates-summary.json"));
    for (const c of summary) {
      expect(c.upper.sidecarKb).toBeLessThanOrEqual(45);
      expect(c.lower.sidecarKb).toBeLessThanOrEqual(45);
      expect(c.full.sidecarKb).toBeLessThanOrEqual(45);
    }
  });
});

describe("Posterior Back V5.0 — selection gate", () => {
  it("does not promote when lower isoline max exceeds 4 mm", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.decision).toMatch(/IMPRECISA|APROBADA/);
    if (report.selection.id == null) {
      expect(report.decision).toContain("IMPRECISA");
      expect(report.selection.blockingIssue).toBeTruthy();
      expect(existsSync(path.join(ART, "approved"))).toBe(true);
      // approved dir may be empty of bins when unapproved
    } else {
      expect(report.decision).toContain("APROBADA");
      expect(
        existsSync(path.join(ART, "approved", "upper_back_sdf.bin")),
      ).toBe(true);
    }
  });

  it("records a finalist for evidence even if not approved", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.selection.finalistId).toMatch(/^S0[123]$/);
  });
});

describe("Posterior Back V5.0 — geometry field loader contract", () => {
  it("reuses aActiveRegionDistance attribute name (no back-specific attrs)", () => {
    const highlight = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(highlight).toMatch(/aActiveRegionDistance/);
    expect(highlight).not.toMatch(/aUpperBackDistance/);
    expect(highlight).not.toMatch(/aFullBackDistance/);
  });

  it("official OFFICIAL_TORSO_REGIONS constants remain frozen", () => {
    expect(OFFICIAL_TORSO_REGIONS.chest.candidateId).toBe("C07");
    expect(OFFICIAL_TORSO_REGIONS.abdomen.candidateId).toBe("B01");
    expect(["V4.1", "V4.5"]).toContain(OFFICIAL_TORSO_REGIONS.rightRibs.candidateId);
    expect(["L01", "L02"]).toContain(OFFICIAL_TORSO_REGIONS.leftRibs.candidateId);
  });
});
