/**
 * Posterior Back V5.1 gate tests — S02 continuations, freeze, precision.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  expectedOfficialHashes,
} from "../../../../tools/body-regions/posterior-back-v51-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/posterior-back-v51");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Posterior Back V5.1 — official torso freeze", () => {
  it("keeps chest/abdomen/ribs/geometry bit-identical (mask may change after V5.2)", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
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

  it("V5.1 artifacts remain the approved S02 source (promotion is V5.2)", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.promoted).toBe(false);
    expect(report.selection.approved).toBe(true);
    expect(report.selection.id).toBe("S02");
  });
});

describe("Posterior Back V5.1 — S02 source and continuations", () => {
  it("validates S02 source blocking metrics from V5.0", () => {
    const report = readJson(ART + "/report.json");
    expect(report.preconditions.s02Source.ok).toBe(true);
    expect(report.preconditions.s02Source.lower.maxMm).toBe(7.037);
    expect(report.preconditions.s02Source.offsetM).toBe(-0.012);
  });

  it("keeps official ribs seams intact and builds C1 lumbar continuations", () => {
    const right = readJson(path.join(ART, "shared-right-ribs-back-seam.json"));
    const left = readJson(path.join(ART, "shared-left-ribs-back-seam.json"));
    const rc = readJson(path.join(ART, "right-lower-back-continuation.json"));
    const lc = readJson(path.join(ART, "left-lower-back-continuation.json"));
    expect(right.name).toBe("right_side_back_seam");
    expect(left.name).toBe("left_side_back_seam");
    expect(right.diagnostics.pass).toBe(true);
    expect(left.diagnostics.pass).toBe(true);
    expect(rc.belongsToRibs).toBe(false);
    expect(lc.belongsToRibs).toBe(false);
    expect(rc.diagnostics.joinDistance).toBe(0);
    expect(lc.diagnostics.joinDistance).toBe(0);
    expect(rc.diagnostics.tangentDifferenceDeg).toBeLessThanOrEqual(5);
    expect(lc.diagnostics.tangentDifferenceDeg).toBeLessThanOrEqual(5);
    expect(rc.diagnostics.autoIntersections).toBe(0);
    expect(lc.diagnostics.gap).toBe(0);
    expect(rc.diagnostics.pass).toBe(true);
    expect(lc.diagnostics.pass).toBe(true);
  });

  it("extends u_back with posterior arcs and no upper regression", () => {
    const atlas = readJson(path.join(ART, "u-back-atlas.json"));
    const reg = readJson(path.join(ART, "upper-zone-regression.json"));
    expect(atlas.diagnostics.sliceCount).toBeGreaterThanOrEqual(112);
    expect(atlas.diagnostics.sliceCount).toBeLessThanOrEqual(128);
    expect(atlas.diagnostics.nan).toBe(0);
    expect(atlas.diagnostics.inversions).toBe(0);
    expect(atlas.diagnostics.unparamPct).toBe(0);
    expect(atlas.diagnostics.components).toBe(1);
    expect(Math.abs(atlas.diagnostics.centerBackU - 0.5)).toBeLessThan(0.12);
    expect(atlas.diagnostics.pass).toBe(true);
    expect(reg.meanMm).toBeLessThanOrEqual(0.1);
    expect(reg.maxMm).toBeLessThanOrEqual(0.5);
  });

  it("shares exact S02 seam and preserves central shape", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.s02.centralDisplacement.pass).toBe(true);
    expect(report.s02.seamShared.meanMm).toBe(0);
    expect(report.s02.seamShared.p95Mm).toBe(0);
    expect(report.s02.seamShared.maxMm).toBeLessThanOrEqual(0.1);
    expect(report.s02.seamShared.pass).toBe(true);
  });
});

describe("Posterior Back V5.1 — precision and coverage", () => {
  it("meets 1/2/4 mm precision for upper/lower/full", () => {
    const c = readJson(path.join(ART, "report.json")).candidate;
    for (const key of ["upper", "lower", "full"] as const) {
      const iso = c[key].isoline;
      expect(iso.meanMm).toBeLessThanOrEqual(1.0);
      expect(iso.p95Mm).toBeLessThanOrEqual(2.0);
      expect(iso.maxMm).toBeLessThanOrEqual(4.0);
      expect(iso.pass).toBe(true);
      expect(c[key].pass).toBe(true);
      expect(c[key].sidecarKb).toBeLessThanOrEqual(45);
      expect(c[key].triIncPct).toBeLessThanOrEqual(5);
      expect(c[key].comps.components).toBe(1);
      expect(c[key].comps.tinyIslands).toBe(0);
    }
  });

  it("covers lumbar quadrants and keeps residual off official ribs seams", () => {
    const report = readJson(path.join(ART, "report.json"));
    const lc = report.candidate.filters.lumbarCoverage;
    expect(lc.lumbar_right).toBe(true);
    expect(lc.lumbar_left).toBe(true);
    expect(lc.lumbar_center).toBe(true);
    expect(lc.superior_sacrum).toBe(true);
    expect(report.residualDiagnostic.officialRibsSeamClean).toBe(true);
  });

  it("aligns field with temporal mask samples and keeps independent full field", () => {
    const c = readJson(path.join(ART, "report.json")).candidate;
    expect(c.alignment.upper.pass).toBe(true);
    expect(c.alignment.lower.pass).toBe(true);
    expect(c.upper.fieldHash).not.toBe(c.full.fieldHash);
    expect(c.lower.fieldHash).not.toBe(c.full.fieldHash);
  });

  it("stages approved sidecars without promoting", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(existsSync(path.join(ART, "approved/upper_back_sdf.bin"))).toBe(true);
    expect(existsSync(path.join(ART, "approved/lower_back_sdf.bin"))).toBe(true);
    expect(existsSync(path.join(ART, "approved/full_back_sdf.bin"))).toBe(true);
    expect(report.promoted).toBe(false);
    expect(report.commit).toBe(false);
    expect(report.selection.approved).toBe(true);
    expect(report.decision).toMatch(/APROBADA/);
  });
});

describe("Posterior Back V5.1 — adjacency", () => {
  it("allows back+ribs combinations and rejects distant calf", () => {
    const adj = readJson(path.join(ART, "adjacency-cases.json"));
    expect(adj["upper_back+lower_back"]).toBe("allowed");
    expect(adj["upper_back+right_ribs"]).toBe("allowed");
    expect(adj["lower_back+left_ribs"]).toBe("allowed");
    expect(adj["full_back+right_ribs"]).toBe("allowed");
    expect(adj["right_ribs+full_back+left_ribs"]).toBe("allowed");
    expect(adj["full_back+calf"]).toBe("rejected");
  });
});
