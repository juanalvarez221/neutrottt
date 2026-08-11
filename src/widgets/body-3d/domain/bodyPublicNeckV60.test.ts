/**
 * Neck Surface Atlas V6.0 gate tests — freeze, atlas, candidates, adjacency.
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
} from "../../../../tools/body-regions/neck-v60-core.mjs";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "./bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "./bodyPublicHighlightRegions";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/neck-v60");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Neck V6.0 — official torso freeze", () => {
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

  it("V6.0 gate itself did not promote; official bins belong to V6.3", () => {
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

describe("Neck V6.0 — canonical IDs and surfaces", () => {
  it("maps conceptual names to existing canonical IDs", () => {
    expect(CANONICAL_IDS.front_neck).toBe("neck_front");
    expect(CANONICAL_IDS.right_neck).toBe("neck_right");
    expect(CANONICAL_IDS.back_neck).toBe("neck_back");
    expect(CANONICAL_IDS.left_neck).toBe("neck_left");
    expect(CANONICAL_IDS.full_neck).toBe("full_neck");
  });

  it("uses four categorical surfaces and no full_neck_surface", () => {
    expect(SURFACE_IDS.neck_front).toBe("neck_front_surface");
    expect(SURFACE_IDS.neck_right).toBe("neck_right_surface");
    expect(SURFACE_IDS.neck_back).toBe("neck_back_surface");
    expect(SURFACE_IDS.neck_left).toBe("neck_left_surface");
    const full = resolvePublicTargetHighlightRegions("full_neck");
    expect(full).toEqual([
      "neck_front_surface",
      "neck_back_surface",
      "neck_left_surface",
      "neck_right_surface",
    ]);
    expect(full.includes("full_neck_surface" as never)).toBe(false);
  });
});

describe("Neck V6.0 — atlas and candidates", () => {
  it("builds continuous tubular atlas", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.atlas.pass).toBe(true);
    expect(report.atlas.levels).toBeGreaterThanOrEqual(48);
    expect(report.atlas.levels).toBeLessThanOrEqual(80);
    expect(report.atlas.nan).toBe(0);
    expect(report.atlas.inversions).toBe(0);
    expect(report.atlas.loopJumps).toBe(0);
    expect(report.atlas.components).toBe(1);
    expect(report.loops.upper.pass).toBe(true);
    expect(report.loops.lower.pass).toBe(true);
  });

  it("derives landmarks deterministically", () => {
    const lm = readJson(path.join(ART, "diagnostic/derived-landmarks.json"));
    expect(lm.geometryHash).toBe("c62e81edaa1f");
    expect(lm.derived.mentonInferior.position).toHaveLength(3);
    expect(lm.derived.occipitalBase.method).toMatch(/backmost/);
    expect(lm.derived.scmAnteriorRight.confidence).toBeGreaterThan(0.5);
  });

  it("stages three candidates and selects one without promoting", () => {
    const report = readJson(path.join(ART, "report.json"));
    expect(report.candidates).toHaveLength(3);
    expect(["N01", "N02", "N03"]).toContain(report.selection.selected);
    expect(report.selection.approved).toBe(true);
    expect(report.promoted).toBe(false);
    expect(existsSync(path.join(ART, "approved/neck_front_sdf.bin"))).toBe(
      true,
    );
    expect(existsSync(path.join(ART, "approved/full_neck_sdf.bin"))).toBe(true);
    expect(existsSync(path.join(ART, "approved/manifest-temp.json"))).toBe(
      true,
    );
  });

  it("keeps full_neck field independent and sidecars within budget", () => {
    const report = readJson(path.join(ART, "report.json"));
    const sel = report.candidates.find(
      (c: { id: string }) => c.id === report.selection.selected,
    );
    expect(sel.regions.full_neck.fieldHash).not.toBe(
      sel.regions.neck_front.fieldHash,
    );
    for (const r of [
      "neck_front",
      "neck_right",
      "neck_back",
      "neck_left",
      "full_neck",
    ]) {
      expect(sel.regions[r].sidecarKb).toBeLessThanOrEqual(45);
      expect(sel.regions[r].triIncPct).toBeLessThanOrEqual(5);
      expect(sel.regions[r].comps.components).toBe(1);
      expect(sel.regions[r].isoline.meanMm).toBeLessThanOrEqual(1.0);
    }
  });

  it("stores evidence PNGs", () => {
    expect(existsSync(path.join(ART, "diagnostic/01-neck-axis.png"))).toBe(
      true,
    );
    expect(existsSync(path.join(ART, "diagnostic/09-neck-sections.png"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(ART, "candidates/contact-front-neck.png")),
    ).toBe(true);
    expect(existsSync(path.join(ART, "candidates/N02-full-neck-front.png"))).toBe(
      true,
    );
  });
});

describe("Neck V6.0 — adjacency", () => {
  it("allows circular neck adjacency", () => {
    expect(arePublicTargetsAdjacent("neck_front", "neck_right")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "neck_back")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "neck_left")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_left", "neck_front")).toBe(true);
  });

  it("allows neck with chest and upper back; rejects isolated laterals and distant calf", () => {
    expect(isPublicSelectionContiguous(["neck_front", "full_chest"])).toBe(
      true,
    );
    expect(isPublicSelectionContiguous(["neck_back", "upper_back"])).toBe(
      true,
    );
    expect(isPublicSelectionContiguous(["full_neck", "full_chest"])).toBe(
      true,
    );
    expect(isPublicSelectionContiguous(["full_neck", "upper_back"])).toBe(
      true,
    );
    expect(isPublicSelectionContiguous(["neck_right", "neck_left"])).toBe(
      false,
    );
    expect(isPublicSelectionContiguous(["full_neck", "left_calf"])).toBe(
      false,
    );
    expect(
      isPublicSelectionContiguous([
        "neck_right",
        "neck_front",
        "neck_left",
      ]),
    ).toBe(true);
  });
});

describe("Neck V6.0 — raycast / fallback / performance artifacts", () => {
  it("records raycast and fallback results", () => {
    const ray = readJson(path.join(ART, "hit-alignment/raycast-results.json"));
    expect(ray.pass).toBe(true);
    const fb = readJson(path.join(ART, "fallback/fallback-results.json"));
    expect(fb.pass).toBe(true);
  });

  it("keeps sidecars under 45KB and documents perf criteria", () => {
    const perf = readJson(path.join(ART, "performance.json"));
    expect(perf.criteria.cachedReselectMs).toBe(16);
    expect(perf.criteria.sdfUvRequests).toBe(0);
    for (const kb of Object.values(perf.sidecarKbPerTarget ?? {})) {
      expect(kb as number).toBeLessThanOrEqual(45);
    }
    // Micro re-select structural bound from bin stat size (cache hit path)
    const front = path.join(ART, "approved/neck_front_sdf.bin");
    expect(statSync(front).size).toBeLessThanOrEqual(45 * 1024);
  });
});
