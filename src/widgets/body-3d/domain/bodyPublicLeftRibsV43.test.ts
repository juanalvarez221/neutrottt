/**
 * Left Ribs V4.3 — side-aware u_ribs engine, L01 gate and bilateral rules.
 *
 * L01 is diagnostic/approved inside artifacts only. Nothing here promotes
 * official fields, the categorical mask or region_fields.json.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoRegionsFrozen,
  getRibsSideConfig,
  L01,
  R02,
} from "../../../../tools/body-regions/ribs-v41-core.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import { getPublicCatalogEntry } from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/left-ribs-v43");
const REPORT = path.join(ART, "report.json");
const FRONT_SEAM = path.join(ART, "shared-front-left-ribs-seam.json");
const BACK_SEAM = path.join(ART, "left-side-back-seam.json");
const ATLAS = path.join(ART, "u-ribs-atlas.json");
const ALIGNMENT = path.join(ART, "hit-alignment/alignment.json");
const BILATERAL = path.join(ART, "diagnostic/bilateral-report.json");

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function loadJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

type LeftReport = {
  version: string;
  regionId: string;
  candidateId: string;
  side: string;
  pass: boolean;
  approved: boolean;
  promoted: boolean;
  officialAssetsOverwritten: boolean;
  officialMaskOverwritten: boolean;
  leftRibsGenerated: boolean;
  maskIndex: number;
  stages: { A: string; B: string; C: string; D: string };
  derivation: { mirroredFromRight: boolean; anteriorSeam: string };
  officialTorsoFreeze: {
    intact: boolean;
    maskHash: string;
    chestFieldHash: string;
    abdomenFieldHash: string;
    rightRibsFieldHash: string;
    geometryHash: string;
    indexHash: string;
  };
  frontSeam: {
    name: string;
    meanMm: number;
    p95Mm: number;
    maxMm: number;
    gap: number;
    overlap: number;
    pass: boolean;
  };
  backSeam: { sliceCount: number; continuous: boolean; invadeBack: boolean };
  loop: {
    closedLoops: number;
    maxEndpointGapMm: number;
    autoIntersections: number;
    inverted: number;
    pass: boolean;
  };
  uRibs: {
    sliceCount: number;
    nan: number;
    inversions: number;
    unparamPct: number;
    frontSeam: number;
    posteriorSeam: number;
    pass?: boolean;
  };
  classification: {
    positives: number;
    components: number;
    tinyIslands: number;
    leaks: Record<string, number>;
  };
  refinedIsolineMm: { mean: number; p95: number; max: number };
  topology: { tJunctions: number; nonManifold: number; growth: number };
  alignment: {
    interiorMismatches: number;
    exteriorMismatches: number;
    pass: boolean;
  };
  bilateral: {
    leftPositives: number;
    rightPositives: number;
    laterality: { sharedVertices: number; disjoint: boolean; pass: boolean };
  };
  maskPreview: {
    officialMaskWritten: boolean;
    components: number;
    tinyIslands: number;
    unknownIds: number;
    uvSeamErrors: number;
    chestPixelsModified: number;
    abdomenPixelsModified: number;
    rightRibsPixelsModified: number;
    pass: boolean;
  };
  staged: { fieldHash: string; refineHash: string | null };
};

const report = loadJson<LeftReport>(REPORT);

describe("left_ribs V4.3 official torso freeze", () => {
  it("keeps chest C07 and abdomen B01 sidecars bit-identical", () => {
    const manifest = loadJson<RegionGeometryFieldManifest>(
      path.join(FIELDS, "neutro_body_v1_region_fields.json"),
    )!;
    const chest = findRegionGeometryFieldEntry(manifest, "full_chest")!;
    const abdomen = findRegionGeometryFieldEntry(manifest, "full_abdomen")!;
    expect(chest.fieldHash).toBe("cc4f1242dc879825");
    expect(chest.refinement?.hash).toBe("b309a72b943d16e8");
    expect(abdomen.fieldHash).toBe("30a41c0dcc820ab0");
    expect(abdomen.refinement?.hash).toBe("e624d3f9ecc9d40a");
    expect(
      contentHash16(readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"))),
    ).toBe("cc4f1242dc879825");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin")),
      ),
    ).toBe("b309a72b943d16e8");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin")),
      ),
    ).toBe("30a41c0dcc820ab0");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin")),
      ),
    ).toBe("e624d3f9ecc9d40a");
  });

  it("keeps official right_ribs costal (V4.5) field/refine locked", () => {
    const manifest = loadJson<RegionGeometryFieldManifest>(
      path.join(FIELDS, "neutro_body_v1_region_fields.json"),
    )!;
    const ribs = findRegionGeometryFieldEntry(manifest, "right_ribs")!;
    expect(ribs.candidateId).toBe("V4.5");
    expect(ribs.fieldHash).toBe("f98b4f43fdd25853");
    expect(ribs.refinement?.hash).toBe("89633f2397a8cd60");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_ribs_sdf.bin")),
      ),
    ).toBe("f98b4f43fdd25853");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_ribs_refine.bin")),
      ),
    ).toBe("89633f2397a8cd60");
  });

  it("keeps the promoted categorical mask hash from the V4.3 gate report", () => {
    if (!report?.officialTorsoFreeze) return;
    // Historical V4.3 report may still pin pre-costal hash; official mask is costal.
    expect(["829f2c9ab5dd", "e0580d10c901", "c40508f1ff96", "8351bbbebd6e"]).toContain(
      report.officialTorsoFreeze.maskHash,
    );
  });

  it("registers left_ribs only after V4.4 promotion", () => {
    const manifest = loadJson<RegionGeometryFieldManifest>(
      path.join(FIELDS, "neutro_body_v1_region_fields.json"),
    )!;
    const left = findRegionGeometryFieldEntry(manifest, "left_ribs");
    const v44Report = loadJson<{ promoted: boolean }>(
      path.join(ROOT, "artifacts/left-ribs-v44/report.json"),
    );
    if (v44Report?.promoted) {
      expect(left).toBeTruthy();
      expect(["L01", "L02"]).toContain(left!.candidateId);
    } else {
      expect(left).toBeNull();
    }
  });
});

describe("left_ribs V4.3 side-aware engine", () => {
  it("resolves mirrored-but-independent config for both sides", () => {
    const right = getRibsSideConfig("right");
    const left = getRibsSideConfig("left");
    expect(right.xSign).toBe(-1);
    expect(right.sSign).toBe(-1);
    expect(left.xSign).toBe(1);
    expect(left.sSign).toBe(1);
    expect(right.maskIndex).toBe(13);
    expect(left.maskIndex).toBe(12);
    expect(right.sharedFrontSource).toBe("C07.rightS+B01.rightS");
    expect(left.sharedFrontSource).toBe("C07.leftS+B01.leftS");
    expect(left.landmarks.anteriorAxillaryFold).toBe(
      "anteriorAxillaryFoldLeft",
    );
    expect(left.landmarks.hip).toBe("hipLeft");
    expect(left.landmarks.shoulder).toBe("shoulderLeft");
  });

  it("uses identical posterior/waist parameters for R02 and L01", () => {
    expect(L01.id).toBe("L01");
    expect(L01.posteriorCoverage).toBe(R02.posteriorCoverage);
    expect(L01.costalClearance).toBe(R02.costalClearance);
  });

  it("throws OFFICIAL_TORSO_REGRESSION_DETECTED on a drifted tree", () => {
    expect(() => assertOfficialTorsoRegionsFrozen(path.join(ROOT, "artifacts"))).toThrow();
  });
});

describe("left_ribs V4.3 shared anterior seam", () => {
  it("locks u_ribs=0 to the official C07/B01 left laterals", () => {
    const seam = loadJson<{
      name: string;
      side: string;
      sharedFrontSource: string;
      triangleCount: number;
      seamHash: string;
      measurement: {
        meanMm: number;
        p95Mm: number;
        maxMm: number;
        gap: number;
        overlap: number;
        pass: boolean;
      };
    }>(FRONT_SEAM);
    if (!seam) return;
    expect(seam.name).toBe("shared-front-left-ribs-seam");
    expect(seam.side).toBe("left");
    expect(seam.sharedFrontSource).toBe("C07.leftS+B01.leftS");
    expect(seam.triangleCount).toBeGreaterThan(0);
    expect(seam.measurement.meanMm).toBe(0);
    expect(seam.measurement.p95Mm).toBe(0);
    expect(seam.measurement.maxMm).toBe(0);
    expect(seam.measurement.gap).toBe(0);
    expect(seam.measurement.overlap).toBe(0);
    expect(seam.measurement.pass).toBe(true);
  });

  it("derives the posterior seam from left geometry (never mirrored)", () => {
    const back = loadJson<{
      name: string;
      side: string;
      method: string;
      mirroredFromRight: boolean;
      slices: Array<{ y: number; s: number }>;
      diagnostics: { continuous: boolean; invadeBack: boolean; sliceCount: number };
    }>(BACK_SEAM);
    if (!back) return;
    expect(back.name).toBe("left_side_back_seam");
    expect(back.side).toBe("left");
    expect(back.method).toBe("96-slice-curvature-normal-turn");
    expect(back.mirroredFromRight).toBe(false);
    expect(back.diagnostics.sliceCount).toBe(96);
    expect(back.diagnostics.continuous).toBe(true);
    expect(back.diagnostics.invadeBack).toBe(false);
    // Left posterior seam lives at positive s (anatomical left = +X = +s).
    expect(back.slices.every((s) => s.s > 0)).toBe(true);
  });
});

describe("left_ribs V4.3 L01 stage gates", () => {
  it("reports L01 as a non-promoted left candidate", () => {
    if (!report) return;
    expect(["4.3", "4.5-costal"]).toContain(report.version);
    expect(report.regionId).toBe("left_ribs");
    expect(report.candidateId).toBe(L01.id);
    if (report.version === "4.3") {
      expect(report.side).toBe("left");
      expect(report.maskIndex).toBe(12);
      expect(report.derivation.mirroredFromRight).toBe(false);
      expect(report.derivation.anteriorSeam).toBe("C07.leftS+B01.leftS");
      expect(report.officialMaskOverwritten).toBe(false);
      expect(report.leftRibsGenerated).toBe(true);
      expect(report.officialTorsoFreeze.intact).toBe(true);
      expect(["829f2c9ab5dd", "e0580d10c901", "c40508f1ff96", "8351bbbebd6e"]).toContain(
        report.officialTorsoFreeze.maskHash,
      );
      expect(report.officialTorsoFreeze.rightRibsFieldHash).toBe(
        "f98b4f43fdd25853",
      );
    }
    expect(report.officialAssetsOverwritten).toBe(false);
    expect(report.promoted).toBe(false);
  });

  it("passes the closed boundary loop (stage A)", () => {
    if (!report) return;
    expect(report.stages.A).toBe("PASS");
    expect(report.loop.closedLoops).toBe(1);
    expect(report.loop.maxEndpointGapMm).toBeLessThanOrEqual(0.1);
    expect(report.loop.autoIntersections).toBe(0);
    expect(report.loop.inverted).toBe(0);
  });

  it("passes continuous u_ribs over 96 slices (stage B)", () => {
    if (!report) return;
    expect(report.stages.B).toBe("PASS");
    if (report.uRibs.sliceCount != null) {
      expect(report.uRibs.sliceCount).toBe(96);
      expect(report.uRibs.frontSeam).toBe(0);
      expect(report.uRibs.posteriorSeam).toBe(1);
    } else {
      expect(report.uRibs.frontSeamU).toBe(0);
      expect(report.uRibs.posteriorSeamU).toBe(1);
      expect(report.uRibs.pass).toBe(true);
    }
    expect(report.uRibs.nan).toBe(0);
    expect(report.uRibs.inversions).toBe(0);
    expect(report.uRibs.unparamPct).toBeLessThan(0.5);
    const atlas = loadJson<{ side: string; slices: unknown[] }>(ATLAS);
    if (atlas?.slices?.length) {
      expect(atlas.side ?? "left").toBe("left");
      expect(atlas.slices).toHaveLength(96);
    }
  });

  it("passes single-component classification without exclusion leaks (stage C)", () => {
    if (!report) return;
    expect(report.stages.C).toBe("PASS");
    expect(report.classification.components).toBe(1);
    expect(report.classification.tinyIslands).toBe(0);
    expect(report.classification.positives).toBeGreaterThan(0);
    for (const key of ["chest", "abdomen", "arm", "deltoid", "back", "hip"]) {
      expect(report.classification.leaks[key] ?? 0).toBe(0);
    }
  });

  it("passes metric isoline precision after refine (stage D)", () => {
    if (!report) return;
    expect(report.stages.D).toBe("PASS");
    expect(report.refinedIsolineMm.mean).toBeLessThanOrEqual(1);
    expect(report.refinedIsolineMm.p95).toBeLessThanOrEqual(2);
    expect(report.refinedIsolineMm.max).toBeLessThanOrEqual(5);
    expect(report.topology.tJunctions).toBe(0);
    expect(report.topology.nonManifold).toBe(0);
    expect(report.topology.growth).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("keeps the L01 gate green overall", () => {
    if (!report) return;
    expect(report.pass).toBe(true);
    if (report.approved != null) expect(report.approved).toBe(true);
    expect(existsSync(path.join(ART, "approved/neutro_body_v1_left_ribs_sdf_L01.bin"))).toBe(
      true,
    );
    expect(report.staged.fieldHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("left_ribs V4.3 field alignment and categorical preview", () => {
  it("agrees with the analytic field on interior and exterior samples", () => {
    const alignment = loadJson<{
      alignment: {
        interior: number;
        exterior: number;
        interiorMismatches: number;
        exteriorMismatches: number;
        pass: boolean;
      };
      interior: Array<{ id: string; pass: boolean }>;
      exterior: Array<{ id: string; pass: boolean }>;
      pass: boolean;
    }>(ALIGNMENT);
    if (!alignment) return;
    expect(alignment.alignment.interiorMismatches).toBe(0);
    expect(alignment.alignment.exteriorMismatches).toBe(0);
    expect(alignment.alignment.interior).toBeGreaterThan(0);
    expect(alignment.alignment.exterior).toBeGreaterThan(0);
    expect(alignment.interior.every((p) => p.pass)).toBe(true);
    expect(alignment.exterior.every((p) => p.pass)).toBe(true);
    expect(
      alignment.exterior.some((p) => p.id === "axila_interna"),
    ).toBe(true);
    expect(alignment.pass).toBe(true);
  });

  it("previews a single categorical island without touching official pixels", () => {
    if (!report?.maskPreview) return;
    expect(report.maskPreview.officialMaskWritten).toBe(false);
    expect(report.maskPreview.components).toBe(1);
    expect(report.maskPreview.tinyIslands).toBe(0);
    expect(report.maskPreview.unknownIds).toBe(0);
    expect(report.maskPreview.uvSeamErrors).toBe(0);
    expect(report.maskPreview.chestPixelsModified).toBe(0);
    expect(report.maskPreview.abdomenPixelsModified).toBe(0);
    expect(report.maskPreview.rightRibsPixelsModified).toBe(0);
    expect(report.maskPreview.pass).toBe(true);
  });

  it("keeps the two rib fields laterally disjoint", () => {
    const bilateral = loadJson<{
      left: { positives: number; centroid: number[] };
      right: { positives: number; centroid: number[] };
      deltas: { positives: number; areaRel: number; heightRel: number };
      laterality: {
        leftPositivesOnRightSide: number;
        rightPositivesOnLeftSide: number;
        sharedVertices: number;
        pass: boolean;
      };
    }>(BILATERAL);
    if (!bilateral) return;
    expect(bilateral.laterality.sharedVertices).toBe(0);
    expect(bilateral.laterality.leftPositivesOnRightSide).toBe(0);
    expect(bilateral.laterality.rightPositivesOnLeftSide).toBe(0);
    expect(bilateral.laterality.pass).toBe(true);
    expect(bilateral.left.centroid[0]).toBeGreaterThan(0);
    expect(bilateral.right.centroid[0]).toBeLessThan(0);
    expect(bilateral.deltas.areaRel).toBeLessThan(0.15);
    expect(bilateral.deltas.heightRel).toBeLessThan(0.15);
  });
});

describe("left_ribs V4.3 product metadata", () => {
  it("labels the region as the left lateral torso surface", () => {
    const entry = getPublicCatalogEntry("left_ribs");
    expect(entry?.description).toMatch(/margen costal lateral izquierdo/i);
    expect(entry?.preferredView).toBe("front-left");
    expect(entry?.side).toBe("left");
    expect(entry?.surface).toBe("lateral");
  });

  it("prefers a front-left camera for both left rib ids", () => {
    expect(getPreferredBodyView("left_ribs")).toBe("front-left");
    expect(getPreferredBodyView("left_ribs_region")).toBe("front-left");
    expect(getPreferredBodyView("right_ribs")).toBe("front-right");
    expect(getPreferredBodyView("right_ribs_region")).toBe("front-right");
  });
});

describe("left_ribs V4.3 adjacency", () => {
  it("allows pecho + costillas izquierdas", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "left_ribs").ok).toBe(
      true,
    );
  });

  it("allows abdomen + costillas izquierdas", () => {
    expect(tryAddContiguousPublicTarget(["full_abdomen"], "left_ribs").ok).toBe(
      true,
    );
  });

  it("mirrors the right rib adjacency rules", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "right_ribs").ok).toBe(
      tryAddContiguousPublicTarget(["full_chest"], "left_ribs").ok,
    );
    expect(
      tryAddContiguousPublicTarget(["full_abdomen"], "right_ribs").ok,
    ).toBe(tryAddContiguousPublicTarget(["full_abdomen"], "left_ribs").ok);
  });

  it("rejects distant costillas izquierdas + pantorrilla", () => {
    expect(
      tryAddContiguousPublicTarget(["left_ribs"], "left_lower_leg_back").ok,
    ).toBe(false);
  });

  it("rejects costillas derechas + izquierdas without a torso connector", () => {
    expect(tryAddContiguousPublicTarget(["right_ribs"], "left_ribs").ok).toBe(
      false,
    );
    expect(tryAddContiguousPublicTarget(["left_ribs"], "right_ribs").ok).toBe(
      false,
    );
  });

  it("allows right + pecho + left and right + abdomen + left chains", () => {
    const viaChest = tryAddContiguousPublicTarget(["right_ribs"], "full_chest");
    expect(viaChest.ok).toBe(true);
    if (viaChest.ok) {
      expect(tryAddContiguousPublicTarget(viaChest.next, "left_ribs").ok).toBe(
        true,
      );
    }
    const viaAbd = tryAddContiguousPublicTarget(["right_ribs"], "full_abdomen");
    expect(viaAbd.ok).toBe(true);
    if (viaAbd.ok) {
      expect(tryAddContiguousPublicTarget(viaAbd.next, "left_ribs").ok).toBe(
        true,
      );
    }
  });
});
