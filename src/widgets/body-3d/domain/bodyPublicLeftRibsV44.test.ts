/**
 * Left Ribs V4.4 — official L01 promotion tests.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  OFFICIAL_TORSO_REGIONS,
} from "../../../../tools/body-regions/ribs-side.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";
import visualAssets from "@/widgets/body-3d/domain/generated/publicRegionVisualAssets.json";
import { BODY_PUBLIC_SELECTION_CATALOG } from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/left-ribs-v44");
const REPORT = path.join(ART, "report.json");

const EXPECTED = {
  candidate: "L01",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  fieldHash: "3a1a0e9368a98095",
  refineHash: "d4691c229a59a804",
  maskHashPre: "b628b15261da",
};

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("left_ribs V4.4 torso freeze", () => {
  it("keeps C07 + B01 + right_ribs field/refine bit-identical", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const chest = findRegionGeometryFieldEntry(regionFields, "full_chest")!;
    const abd = findRegionGeometryFieldEntry(regionFields, "full_abdomen")!;
    const right = findRegionGeometryFieldEntry(regionFields, "right_ribs")!;
    expect(contentHash16(readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin")))).toBe(
      OFFICIAL_TORSO_REGIONS.chest.fieldHash,
    );
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin")),
      ),
    ).toBe(OFFICIAL_TORSO_REGIONS.chest.refinementHash);
    expect(contentHash16(readFileSync(path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin")))).toBe(
      OFFICIAL_TORSO_REGIONS.abdomen.fieldHash,
    );
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin")),
      ),
    ).toBe(OFFICIAL_TORSO_REGIONS.abdomen.refinementHash);
    expect(contentHash16(readFileSync(path.join(FIELDS, "neutro_body_v1_right_ribs_sdf.bin")))).toBe(
      OFFICIAL_TORSO_REGIONS.rightRibs.fieldHash,
    );
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_ribs_refine.bin")),
      ),
    ).toBe(OFFICIAL_TORSO_REGIONS.rightRibs.refinementHash);
    expect(chest.candidateId).toBe("C07");
    expect(abd.candidateId).toBe("B01");
    expect(right.candidateId).toBe("V4.1");
    expect(assertOfficialTorsoWithLeftRibsFrozen().intact).toBe(true);
  });

  it("reports zero chest/abdomen/right_ribs pixel mutations when promotion report exists", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      torsoFrontRegression: {
        chestPixelsModified: number;
        abdomenPixelsModified: number;
        rightRibsPixelsModified: number;
        chestIntact: boolean;
        abdomenIntact: boolean;
        rightRibsIntact: boolean;
        maskHashPre: string;
        maskHashPost: string;
      };
      mask: { foreignIdsModified: number };
    };
    expect(report.torsoFrontRegression.chestIntact).toBe(true);
    expect(report.torsoFrontRegression.abdomenIntact).toBe(true);
    expect(report.torsoFrontRegression.rightRibsIntact).toBe(true);
    expect(report.torsoFrontRegression.chestPixelsModified).toBe(0);
    expect(report.torsoFrontRegression.abdomenPixelsModified).toBe(0);
    expect(report.torsoFrontRegression.rightRibsPixelsModified).toBe(0);
    expect(report.mask.foreignIdsModified).toBe(0);
    expect(report.torsoFrontRegression.maskHashPre).toBe(EXPECTED.maskHashPre);
    expect(report.torsoFrontRegression.maskHashPost).not.toBe(
      EXPECTED.maskHashPre,
    );
  });
});

describe("left_ribs V4.4 official assets", () => {
  it("promotes L01 field + refine with versioned hashes", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest & {
      version?: string;
      fields: Array<{
        visualRegionId?: string;
        side?: string;
        sharedBoundaries?: string[];
      }>;
    };
    const ribs = findRegionGeometryFieldEntry(regionFields, "left_ribs") as
      | (RegionGeometryFieldEntry & {
          side?: string;
          sharedBoundaries?: string[];
        })
      | null;
    expect(ribs).toBeTruthy();
    expect(ribs!.candidateId).toBe(EXPECTED.candidate);
    expect(ribs!.fieldHash).toBe(EXPECTED.fieldHash);
    expect(ribs!.refinement?.hash).toBe(EXPECTED.refineHash);
    expect(ribs!.geometryHash).toBe(EXPECTED.geometryHash);
    expect(ribs!.indexHash).toBe(EXPECTED.indexHash);
    expect(ribs!.vertexCount).toBe(EXPECTED.vertexCount);
    expect(ribs!.encoding).toBe("snorm16");
    expect(ribs!.visualRegionId).toBe("left_ribs_surface");
    expect(ribs!.surfaceRegionId).toBe("left_ribs_region");
    expect(ribs!.maskIndex).toBe(12);
    expect(ribs!.side).toBe("left");
    expect(ribs!.sharedBoundaries).toContain("full_chest");
    expect(ribs!.sharedBoundaries).toContain("full_abdomen");
    expect(regionFields.version).toBe("4.4");
    expect(regionFields.fields).toHaveLength(4);

    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_left_ribs_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_left_ribs_refine.bin"),
    );
    expect(contentHash16(fieldBin)).toBe(EXPECTED.fieldHash);
    expect(contentHash16(refineBin)).toBe(EXPECTED.refineHash);
    expect(fieldBin.byteLength + refineBin.byteLength).toBeLessThanOrEqual(
      45 * 1024,
    );
  });

  it("resolves left_ribs via visual and surface aliases", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    expect(
      findRegionGeometryFieldEntry(regionFields, "left_ribs_surface")
        ?.candidateId,
    ).toBe("L01");
    expect(
      findRegionGeometryFieldEntry(regionFields, "left_ribs_region")
        ?.candidateId,
    ).toBe("L01");
  });

  it("updates categorical mask manifest and visual assets", () => {
    expect(maskManifest.maskHash).toBeTruthy();
    expect(maskManifest.maskHash).not.toBe(EXPECTED.maskHashPre);
    expect(maskManifest.regions.left_ribs_region.maskIndex).toBe(12);
    expect(maskManifest.regions.right_ribs_region.maskIndex).toBe(13);
    expect(maskManifest.regions.full_chest_surface.maskIndex).toBe(9);
    expect(maskManifest.regions.full_abdomen_region.maskIndex).toBe(11);
    expect(maskManifest.promotedCandidates).toContain("L01");
    expect(visualAssets.assets.some((a) => a.regionId === "left_ribs")).toBe(
      true,
    );
  });

  it("promotion report passes integrity + alignment when present", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      candidate: string;
      side: string;
      promoted: boolean;
      seam: { mean: number; p95: number; max: number; gap: number; overlap: number };
      alignment: { interiorMismatch: number; exteriorMismatch: number };
      fieldAlignment: { interiorMismatches: number; exteriorMismatches: number };
      mask: {
        components: number;
        tinyIslands: number;
        uvSeamErrors: number;
        unknownIds: number;
      };
      field: { totalSidecarBytes: number };
      bilateral: { pass: boolean };
    };
    expect(report.candidate).toBe("L01");
    expect(report.side).toBe("left");
    expect(report.promoted).toBe(true);
    expect(report.seam.mean).toBe(0);
    expect(report.seam.p95).toBe(0);
    expect(report.seam.max).toBe(0);
    expect(report.alignment.interiorMismatch).toBe(0);
    expect(report.alignment.exteriorMismatch).toBe(0);
    expect(report.fieldAlignment.interiorMismatches).toBe(0);
    expect(report.fieldAlignment.exteriorMismatches).toBe(0);
    expect(report.mask.components).toBe(1);
    expect(report.mask.tinyIslands).toBe(0);
    expect(report.mask.uvSeamErrors).toBe(0);
    expect(report.mask.unknownIds).toBe(0);
    expect(report.field.totalSidecarBytes).toBeLessThanOrEqual(45 * 1024);
    expect(report.bilateral.pass).toBe(true);
  });
});

describe("left_ribs V4.4 UX + adjacency", () => {
  it("exposes a single complete left_ribs public target", () => {
    const ribs = BODY_PUBLIC_SELECTION_CATALOG.filter((e) => e.id === "left_ribs");
    expect(ribs).toHaveLength(1);
    expect(ribs[0]!.shortLabel).toBe("Costillas izquierdas");
    expect(ribs[0]!.description).toBe(
      "Superficie lateral izquierda del torso",
    );
    expect(ribs[0]!.supportedCoverages).toEqual(["complete"]);
    expect(ribs[0]!.preferredView).toBe("front-left");
    expect(getPreferredBodyView("left_ribs")).toBe("front-left");
  });

  it("allows chest/abdomen + left_ribs chain and rejects distant calf", () => {
    expect(tryAddContiguousPublicTarget(["full_chest"], "left_ribs").ok).toBe(
      true,
    );
    expect(
      tryAddContiguousPublicTarget(["full_abdomen"], "left_ribs").ok,
    ).toBe(true);
    const chain = tryAddContiguousPublicTarget(["full_chest"], "full_abdomen");
    expect(chain.ok).toBe(true);
    if (chain.ok) {
      expect(tryAddContiguousPublicTarget(chain.next, "left_ribs").ok).toBe(
        true,
      );
    }
    expect(
      tryAddContiguousPublicTarget(["left_ribs"], "left_lower_leg_back").ok,
    ).toBe(false);
    expect(tryAddContiguousPublicTarget(["right_ribs"], "left_ribs").ok).toBe(
      false,
    );
  });
});
