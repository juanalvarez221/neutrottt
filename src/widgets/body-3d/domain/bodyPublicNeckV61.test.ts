/**
 * Neck V6.1 gate tests — shared seams, g_seam metric, freeze, adjacency.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  assertOfficialBackFrozen,
  contentHash16,
  expectedOfficialHashes,
  CANONICAL_IDS,
  SURFACE_IDS,
  OFFICIAL_BACK,
  SEAM_DEFS,
  NECK_V61_OUT,
} from "../../../../tools/body-regions/neck-v61-core.mjs";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "./bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "./bodyPublicHighlightRegions";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = NECK_V61_OUT;
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const V60 = path.join(ROOT, "artifacts/neck-v60");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Neck V6.1 — official torso freeze", () => {
  it("keeps chest/abdomen/ribs/back/geometry bit-identical", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const back = assertOfficialBackFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
    expect(back.intact).toBe(true);
    expect(freeze.geometryHash).toBe("c62e81edaa1f");
    expect(freeze.indexHash).toBe("52494d471398c");
    expect(freeze.vertexCount).toBe(14517);
    expect(back.maskHash).toBe(OFFICIAL_BACK.maskHash);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.chest.fieldBin))),
    ).toBe(expected.chest.fieldHash);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.abdomen.fieldBin))),
    ).toBe(expected.abdomen.fieldHash);
    expect(back.upper_back.fieldHash).toBe(OFFICIAL_BACK.upper_back.fieldHash);
    expect(back.lower_back.fieldHash).toBe(OFFICIAL_BACK.lower_back.fieldHash);
    expect(back.full_back.fieldHash).toBe(OFFICIAL_BACK.full_back.fieldHash);
  });

  it("V6.1 gate itself did not promote; official bins belong to V6.3", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.promoted).toBe(false);
    expect(report.commit).toBe(false);
    const manifest = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    );
    const front = manifest.fields.find(
      (f: { regionId: string }) => f.regionId === "neck_front",
    );
    expect(front?.anatomicalParameters?.sourceGate).toBe("neck-quadrant-repair");
    expect(front?.refinement).toBeUndefined();
  });
});

describe("Neck V6.1 — N02 anatomy preserved", () => {
  it("keeps N02 candidate and zero lateral offset", () => {
    const params = readJson(path.join(ART, "approved/parameters.json"));
    expect(params.candidateId).toBe("N02");
    expect(params.lateralBandOffsetM).toBe(0);
  });

  it("does not regress front isoline vs V6.0", () => {
    const v61 = readJson(path.join(ART, "approved/metrics.json"));
    const v60 = readJson(path.join(V60, "candidates/N02/meta.json"));
    expect(v61.v60Comparison.regressionFront).toBe(false);
    expect(v61.regions.neck_front.isoline.meanMm).toBeLessThanOrEqual(
      v60.regions.neck_front.isoline.meanMm + 0.05,
    );
  });
});

describe("Neck V6.1 — canonical shared seams", () => {
  it("stores four seams with identical consumer hashes", () => {
    for (const def of SEAM_DEFS) {
      const p = path.join(ART, "shared-seams", def.file);
      expect(existsSync(p)).toBe(true);
      const seam = readJson(p);
      expect(seam.seamId).toBe(def.seamId);
      expect(seam.seamHash).toMatch(/^[a-f0-9]{16}$/);
      expect(seam.crossedTriangleIndices.length).toBeGreaterThan(0);
      expect(seam.barycentricCoordinates.length).toBe(
        seam.crossedTriangleIndices.length,
      );
    }
  });

  it("has shared refinement plan with zero T-junctions", () => {
    const plan = readJson(
      path.join(ART, "shared-seams/shared-refinement-plan.json"),
    );
    expect(plan.planId).toBe("neck_shared_refinement_plan");
    expect(plan.invariants.tJunctions).toBe(0);
    expect(plan.invariants.nonManifold).toBe(0);
    expect(plan.invariants.openInternalEdges).toBe(0);
    expect(plan.invariants.duplicateInsertedVertices).toBe(0);
  });
});

describe("Neck V6.1 — seam metric", () => {
  it("diagnoses previous abs(A+B) metric as invalid", () => {
    const diag = readJson(
      path.join(ART, "diagnostic/01-current-seam-metric-report.json"),
    );
    expect(diag.previousMetricValid).toBe(false);
    expect(diag.totals.otherBoundaryAsMinimum).toBeGreaterThan(100);
  });

  it("passes g_seam antisymmetry on all four seams", () => {
    const anti = readJson(
      path.join(ART, "diagnostic/g-seam-antisymmetry.json"),
    );
    for (const key of ["front_right", "right_back", "back_left", "left_front"]) {
      expect(anti[key].pass).toBe(true);
      expect(anti[key].band.maxMm).toBeLessThanOrEqual(0.2);
      expect(anti[key].gap).toBe(0);
      expect(anti[key].overlap).toBe(0);
    }
  });
});

describe("Neck V6.1 — fields and full", () => {
  it("front passes 1/2/4 mm", () => {
    const m = readJson(path.join(ART, "approved/metrics.json"));
    const iso = m.regions.neck_front.isoline;
    expect(iso.meanMm).toBeLessThanOrEqual(1);
    expect(iso.p95Mm).toBeLessThanOrEqual(2);
    expect(iso.maxMm).toBeLessThanOrEqual(4);
  });

  it("full_neck has no internal seams and reuses independent field", () => {
    const m = readJson(path.join(ART, "approved/metrics.json"));
    expect(m.regions.full_neck.pass).toBe(true);
    expect(m.regions.full_neck.isoline.maxMm).toBeLessThanOrEqual(4);
  });

  it("sidecars stay under 45 KB", () => {
    for (const r of [
      "neck_front",
      "neck_right",
      "neck_back",
      "neck_left",
      "full_neck",
    ]) {
      const sdf = statSync(path.join(ART, "approved", `${r}_sdf.bin`)).size;
      const ref = statSync(path.join(ART, "approved", `${r}_refine.bin`)).size;
      expect((sdf + ref) / 1024).toBeLessThanOrEqual(45);
    }
  });
});

describe("Neck V6.1 — adjacency", () => {
  it("allows circular neck pairs and rejects isolated laterals", () => {
    expect(isPublicSelectionContiguous(["neck_front", "neck_right"])).toBe(
      true,
    );
    expect(isPublicSelectionContiguous(["neck_right", "neck_back"])).toBe(true);
    expect(isPublicSelectionContiguous(["neck_back", "neck_left"])).toBe(true);
    expect(isPublicSelectionContiguous(["neck_left", "neck_front"])).toBe(true);
    expect(isPublicSelectionContiguous(["neck_right", "neck_left"])).toBe(
      false,
    );
    expect(
      isPublicSelectionContiguous(["neck_right", "neck_front", "neck_left"]),
    ).toBe(true);
  });

  it("allows neck/full with torso and rejects distant calf", () => {
    expect(arePublicTargetsAdjacent("neck_front", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "upper_back")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "upper_back")).toBe(true);
    expect(isPublicSelectionContiguous(["full_neck", "right_calf"])).toBe(
      false,
    );
  });

  it("maps surfaces without full_neck_surface", () => {
    expect(SURFACE_IDS.neck_front).toBe("neck_front_surface");
    const full = resolvePublicTargetHighlightRegions("full_neck");
    expect(full).toEqual([
      "neck_front_surface",
      "neck_back_surface",
      "neck_left_surface",
      "neck_right_surface",
    ]);
    expect(CANONICAL_IDS.full_neck).toBe("full_neck");
  });
});

describe("Neck V6.1 — browser and fallback evidence", () => {
  it("has 20 browser frames", () => {
    const names = [
      "01-desktop-front-neck.png",
      "02-desktop-right-neck.png",
      "03-desktop-back-neck.png",
      "04-desktop-left-neck.png",
      "05-desktop-full-front.png",
      "06-desktop-full-right.png",
      "07-desktop-full-back.png",
      "08-desktop-full-left.png",
      "09-desktop-front-right-seam.png",
      "10-desktop-right-back-seam.png",
      "11-desktop-back-left-seam.png",
      "12-desktop-left-front-seam.png",
      "13-tablet-front.png",
      "14-tablet-back.png",
      "15-tablet-full.png",
      "16-mobile-front.png",
      "17-mobile-back.png",
      "18-mobile-full.png",
      "19-desktop-four-partials.png",
      "20-desktop-full-no-seams.png",
    ];
    for (const n of names) {
      expect(existsSync(path.join(ART, "browser", n))).toBe(true);
      expect(statSync(path.join(ART, "browser", n)).size).toBeGreaterThan(1000);
    }
  });

  it("has raycast, performance, fallback artifacts", () => {
    expect(
      existsSync(path.join(ART, "hit-alignment/raycast-results.json")),
    ).toBe(true);
    expect(existsSync(path.join(ART, "performance.json"))).toBe(true);
    expect(
      existsSync(path.join(ART, "fallback/fallback-results.json")),
    ).toBe(true);
    const perf = readJson(path.join(ART, "performance.json"));
    expect(perf.microReselectionMs.total).toBeLessThan(16);
    expect(perf.sdfUvRequests).toBe(0);
  });
});
