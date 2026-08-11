/**
 * Full Abdomen V3.3 — official B01 promotion tests.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialChestFrozen,
  OFFICIAL_CHEST_HASHES,
} from "../../../../tools/body-regions/full-abdomen-v32.mjs";
import { tryAddContiguousPublicTarget } from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";
import visualAssets from "@/widgets/body-3d/domain/generated/publicRegionVisualAssets.json";
import { BODY_PUBLIC_SELECTION_CATALOG } from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const ART = path.join(ROOT, "artifacts/full-abdomen-v33");
const REPORT = path.join(ART, "report.json");
const APPROVED = path.join(
  ROOT,
  "artifacts/full-abdomen-v32/approved/candidate.json",
);

const EXPECTED = {
  candidate: "B01",
  geometryHash: "c62e81edaa1f",
  indexHash: "52494d471398c",
  vertexCount: 14517,
  fieldHash: "30a41c0dcc820ab0",
  refineHash: "e624d3f9ecc9d40a",
  pubicClearance: 0.014,
  inguinalSideRise: 0.01,
};

function contentHash16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("full_abdomen V3.3 C07 freeze", () => {
  it("keeps official chest field/refine bit-identical", () => {
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
    expect(contentHash16(fieldBin)).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(contentHash16(refineBin)).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(assertOfficialChestFrozen().intact).toBe(true);
  });

  it("reports zero chest pixel mutations when promotion report exists", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      chestRegression: { chestPixelsModified: number; intact: boolean };
      mask: { foreignIdsModified: number };
    };
    expect(report.chestRegression.intact).toBe(true);
    expect(report.chestRegression.chestPixelsModified).toBe(0);
    expect(report.mask.foreignIdsModified).toBe(0);
  });
});

describe("full_abdomen V3.3 official assets", () => {
  it("promotes B01 field + refine with versioned hashes", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest & {
      fields: Array<{
        anatomicalParameters?: {
          pubicClearance?: number;
          inguinalSideRise?: number;
        };
        sharedBoundary?: string;
        visualRegionId?: string;
      }>;
    };
    const abd = findRegionGeometryFieldEntry(regionFields, "full_abdomen");
    expect(abd).toBeTruthy();
    expect(abd!.candidateId).toBe(EXPECTED.candidate);
    expect(abd!.fieldHash).toBe(EXPECTED.fieldHash);
    expect(abd!.refinement?.hash).toBe(EXPECTED.refineHash);
    expect(abd!.geometryHash).toBe(EXPECTED.geometryHash);
    expect(abd!.indexHash).toBe(EXPECTED.indexHash);
    expect(abd!.vertexCount).toBe(EXPECTED.vertexCount);
    expect(abd!.encoding).toBe("snorm16");
    expect(abd!.visualRegionId).toBe("full_abdomen_surface");
    expect(abd!.sharedBoundary).toBe("full_chest");
    expect(abd!.anatomicalParameters).toMatchObject({
      pubicClearance: EXPECTED.pubicClearance,
      inguinalSideRise: EXPECTED.inguinalSideRise,
    });

    const fieldBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_sdf.bin"),
    );
    const refineBin = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.bin"),
    );
    expect(contentHash16(fieldBin)).toBe(EXPECTED.fieldHash);
    expect(contentHash16(refineBin)).toBe(EXPECTED.refineHash);
    expect(fieldBin.byteLength + refineBin.byteLength).toBeLessThanOrEqual(
      45 * 1024,
    );

    // Isoline metadata stays in artifacts — not a runtime sidecar.
    expect(
      existsSync(
        path.join(FIELDS, "neutro_body_v1_full_abdomen_refine.json"),
      ),
    ).toBe(false);
  });

  it("resolves full_abdomen via visual and surface aliases", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    expect(
      findRegionGeometryFieldEntry(regionFields, "full_abdomen_surface")
        ?.candidateId,
    ).toBe("B01");
    expect(
      findRegionGeometryFieldEntry(regionFields, "full_abdomen_region")
        ?.candidateId,
    ).toBe("B01");
  });

  it("keeps C07 chest entry unchanged beside abdomen", () => {
    const regionFields = JSON.parse(
      readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
    ) as RegionGeometryFieldManifest;
    const chest = findRegionGeometryFieldEntry(regionFields, "full_chest")!;
    expect(chest.candidateId).toBe("C07");
    expect(chest.fieldHash).toBe(OFFICIAL_CHEST_HASHES.fieldHash);
    expect(chest.refinement?.hash).toBe(OFFICIAL_CHEST_HASHES.refinementHash);
    expect(regionFields.fields.length).toBeGreaterThanOrEqual(2);
    expect(findRegionGeometryFieldEntry(regionFields, "full_chest")).toBeTruthy();
    expect(findRegionGeometryFieldEntry(regionFields, "full_abdomen")).toBeTruthy();
  });

  it("updates categorical mask manifest and visual assets", () => {
    expect(maskManifest.maskHash).toBeTruthy();
    expect(maskManifest.maskHash).not.toBe(OFFICIAL_CHEST_HASHES.maskHash);
    expect(maskManifest.regions.full_abdomen_region.maskIndex).toBe(11);
    expect(maskManifest.regions.full_chest_surface.maskIndex).toBe(9);
    expect(visualAssets.assets.some((a) => a.regionId === "full_abdomen")).toBe(
      true,
    );
  });

  it("promotion report passes seam + alignment when present", () => {
    if (!existsSync(REPORT)) return;
    const report = JSON.parse(readFileSync(REPORT, "utf8")) as {
      candidate: string;
      promoted: boolean;
      seam: {
        mean: number;
        p95: number;
        max: number;
        gap: number;
        overlap: number;
      };
      alignment: { interiorMismatch: number; exteriorMismatch: number };
      mask: {
        components: number;
        tinyIslands: number;
        uvSeamErrors: number;
        unknownIds: number;
      };
      exclusions: Record<string, number>;
    };
    expect(report.candidate).toBe("B01");
    expect(report.promoted).toBe(true);
    expect(report.seam.mean).toBe(0);
    expect(report.seam.p95).toBe(0);
    expect(report.seam.max).toBeLessThanOrEqual(0.0001);
    expect(report.seam.gap).toBe(0);
    expect(report.seam.overlap).toBe(0);
    expect(report.alignment.interiorMismatch).toBe(0);
    expect(report.alignment.exteriorMismatch).toBe(0);
    expect(report.mask.components).toBe(1);
    expect(report.mask.tinyIslands).toBe(0);
    expect(report.mask.uvSeamErrors).toBe(0);
    expect(report.mask.unknownIds).toBe(0);
    for (const v of Object.values(report.exclusions)) {
      expect(v).toBe(0);
    }
  });

  it("marks approved candidate as promoted", () => {
    if (!existsSync(APPROVED)) return;
    const cand = JSON.parse(readFileSync(APPROVED, "utf8")) as {
      promoted: boolean;
      candidateId: string;
    };
    expect(cand.candidateId).toBe("B01");
    expect(cand.promoted).toBe(true);
  });
});

describe("full_abdomen V3.3 UX + adjacency", () => {
  it("exposes a single complete abdomen public target", () => {
    const abdomen = BODY_PUBLIC_SELECTION_CATALOG.filter((e) =>
      e.id.includes("abdomen"),
    );
    expect(abdomen).toHaveLength(1);
    expect(abdomen[0]!.id).toBe("full_abdomen");
    expect(abdomen[0]!.shortLabel).toBe("Abdomen completo");
    expect(abdomen[0]!.description).toBe(
      "Superficie frontal del abdomen bajo el pecho, hasta la zona púbica",
    );
    expect(abdomen[0]!.supportedCoverages).toEqual(["complete"]);
    expect(abdomen[0]!.preferredView).toBe("front");
  });

  it("allows chest + abdomen and rejects a distant calf", () => {
    const chestThenAbd = tryAddContiguousPublicTarget(
      ["full_chest"],
      "full_abdomen",
    );
    expect(chestThenAbd.ok).toBe(true);

    const distant = tryAddContiguousPublicTarget(
      ["full_abdomen"],
      "left_lower_leg_back",
    );
    expect(distant.ok).toBe(false);
    if (!distant.ok) {
      expect(distant.message).toBe(
        "Esta zona está separada de tu selección actual.",
      );
    }
  });
});
