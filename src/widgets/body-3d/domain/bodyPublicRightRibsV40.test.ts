/**
 * Right Ribs V4.0 — freeze, seam reuse, adjacency, and staged QA invariants.
 * Does not promote official assets.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertTorsoFrontFrozen,
  buildRightRibsCandidateGrid,
  FROZEN_B01,
  FROZEN_TORSO_FRONT,
  OFFICIAL_CHEST_HASHES,
} from "../../../../tools/body-regions/right-ribs-v40.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/right-ribs-v40");
const REPORT = path.join(ART, "report.json");
const SEAM = path.join(ART, "shared-front-ribs-seam.json");

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("right_ribs V4.0 torso front freeze", () => {
  it("keeps pecho C07 field/refine bit-identical", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const chest = findRegionGeometryFieldEntry(regionFields, "full_chest")!;
    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
    );
    expect(chest.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(chest.refinement?.hash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(chest.candidateId).toBe("C07");
    expect(contentHash16(fieldBin)).toBe("cc4f1242dc879825");
    expect(contentHash16(refineBin)).toBe("b309a72b943d16e8");
  });

  it("keeps abdomen B01 field/refine bit-identical", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const abd = findRegionGeometryFieldEntry(regionFields, "full_abdomen")!;
    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin"),
    );
    expect(abd.candidateId).toBe("B01");
    expect(abd.fieldHash).toBe(FROZEN_B01.fieldHash);
    expect(abd.refinement?.hash).toBe(FROZEN_B01.refinementHash);
    expect(contentHash16(fieldBin)).toBe("30a41c0dcc820ab0");
    expect(contentHash16(refineBin)).toBe("e624d3f9ecc9d40a");
  });

  it("keeps chest/abdomen freeze intact (mask advances after V4.2)", () => {
    expect(FROZEN_TORSO_FRONT.maskHash).toBe("8f68930e75e0");
    const freeze = assertTorsoFrontFrozen();
    expect(freeze.intact).toBe(true);
    const promoted = existsSync(
      path.join(ROOT, "artifacts/right-ribs-v42/report.json"),
    );
    if (!promoted) {
      expect(maskManifest.maskHash).toBe("8f68930e75e0");
      expect(freeze.maskHash).toBe("8f68930e75e0");
    } else {
      expect(maskManifest.maskHash).not.toBe("8f68930e75e0");
    }
  });

  it("right_ribs field presence tracks V4.2 promotion", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const entry = findRegionGeometryFieldEntry(regionFields, "right_ribs");
    const promoted = existsSync(
      path.join(ROOT, "artifacts/right-ribs-v42/report.json"),
    );
    if (promoted) {
      expect(["V4.1", "V4.5"]).toContain(entry?.candidateId);
    } else {
      expect(entry).toBeNull();
    }
  });
});

describe("right_ribs V4.0 shared anterior seam", () => {
  it("builds R01–R04 posteriorCoverage × waistClearance grid", () => {
    const grid = buildRightRibsCandidateGrid();
    expect(grid.map((g) => g.id)).toEqual(["R01", "R02", "R03", "R04"]);
    expect(grid[0]).toMatchObject({
      posteriorCoverage: "conservative",
      waistClearance: 0.01,
    });
    expect(grid[1]).toMatchObject({
      posteriorCoverage: "medium",
      waistClearance: 0.01,
    });
    expect(grid[2]).toMatchObject({
      posteriorCoverage: "conservative",
      waistClearance: 0.016,
    });
    expect(grid[3]).toMatchObject({
      posteriorCoverage: "medium",
      waistClearance: 0.016,
    });
  });

  it("reuses C07 + B01 laterals in shared-front-ribs-seam when generated", () => {
    if (!existsSync(SEAM)) return;
    const seam = JSON.parse(readFileSync(SEAM, "utf8")) as {
      chestCandidateId: string;
      abdomenCandidateId: string;
      triangleCount: number;
      fieldHashChest: string;
      fieldHashAbdomen: string;
      sources: string[];
    };
    expect(seam.chestCandidateId).toBe("C07");
    expect(seam.abdomenCandidateId).toBe("B01");
    expect(seam.fieldHashChest).toBe("cc4f1242dc879825");
    expect(seam.fieldHashAbdomen).toBe("30a41c0dcc820ab0");
    expect(seam.triangleCount).toBeGreaterThan(0);
    expect(seam.sources.some((s) => s === "C07")).toBe(true);
    expect(seam.sources.some((s) => s === "B01")).toBe(true);
  });

  it("reports anterior seam functional identity when report exists", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      candidates: Array<{
        id: string;
        sharedFrontMm: { mean: number; p95: number; max: number; pass: boolean };
      }>;
    };
    for (const c of report.candidates) {
      expect(c.sharedFrontMm.mean).toBe(0);
      expect(c.sharedFrontMm.p95).toBe(0);
      expect(c.sharedFrontMm.max).toBeLessThanOrEqual(0.0001);
      expect(c.sharedFrontMm.pass).toBe(true);
    }
  });
});

describe("right_ribs V4.0 adjacency", () => {
  it("allows pecho + costillas derechas", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "right_ribs").ok).toBe(
      true,
    );
  });

  it("allows abdomen + costillas derechas", () => {
    expect(
      tryAddContiguousPublicTarget(["full_abdomen"], "right_ribs").ok,
    ).toBe(true);
  });

  it("allows pecho + abdomen + costillas derechas", () => {
    const a = tryAddContiguousPublicTarget(["full_chest"], "full_abdomen");
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(tryAddContiguousPublicTarget(a.next, "right_ribs").ok).toBe(true);
  });

  it("rejects distant costillas + pantorrilla", () => {
    expect(
      tryAddContiguousPublicTarget(["right_ribs"], "right_lower_leg_back").ok,
    ).toBe(false);
  });
});

describe("right_ribs V4.0 staged artifacts (no promote)", () => {
  it("stages approved candidate without overwriting official fields", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      officialAssetsOverwritten: boolean;
      promoted: boolean;
      selected: string | null;
      torsoFrontRegression: { intact: boolean };
    };
    expect(report.officialAssetsOverwritten).toBe(false);
    expect(report.promoted).toBe(false);
    expect(report.torsoFrontRegression.intact).toBe(true);
    expect(report.selected).toBeTruthy();
  });
});
