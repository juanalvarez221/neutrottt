/**
 * Full Chest V2.7 — official C07 promotion invariants.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  getPublicDescription,
  getPublicShortLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import {
  getSupportedCoverages,
  isPublicSelectableBodyTarget,
  regionSupportsCoverage,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import {
  getPrimaryPublicSelectionTarget,
} from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  getPublicRegionSdfSrc,
  getPublicRegionVisualAsset,
  regionIdsWithSdf,
} from "@/widgets/body-3d/domain/bodyPublicRegionVisualAssets";
import maskManifest from "@/widgets/body-3d/domain/generated/publicRegionMaskManifest.json";

const ROOT = process.cwd();
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const APPROVED = path.join(ROOT, "artifacts/full-chest-v26/approved");
const REPORT = path.join(ROOT, "artifacts/full-chest-v27/report.json");

function contentHash16(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

describe("full_chest V2.7 official C07 promotion", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(FIELDS, "neutro_body_v1_region_fields.json"), "utf8"),
  ) as RegionGeometryFieldManifest;
  const entry = findRegionGeometryFieldEntry(manifest, "full_chest")!;
  const report = JSON.parse(readFileSync(REPORT, "utf8"));

  it("approved source matches frozen C07 identity", () => {
    expect(existsSync(APPROVED)).toBe(true);
    const field = readFileSync(
      path.join(APPROVED, "neutro_body_v1_full_chest_sdf_C07.bin"),
    );
    const refine = readFileSync(
      path.join(APPROVED, "neutro_body_v1_full_chest_refine_C07.bin"),
    );
    expect(contentHash16(field)).toBe("cc4f1242dc879825");
    expect(contentHash16(refine)).toBe("b309a72b943d16e8");
    expect(report.identity).toEqual({
      geometryHash: "c62e81edaa1f",
      indexHash: "52494d471398c",
      vertexCount: 14517,
    });
    expect(report.parameters).toEqual({
      infraclavicularOffsetMm: 14,
      upperCenterRiseMm: 3,
      inferiorCenterTransitionMm: 0,
      lateralInsetMm: 0,
    });
    expect(report.candidate).toBe("C07");
  });

  it("official field binaries are byte-identical to approved C07", () => {
    const officialField = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin"),
    );
    const officialRefine = readFileSync(
      path.join(FIELDS, "neutro_body_v1_full_chest_refine.bin"),
    );
    const approvedField = readFileSync(
      path.join(APPROVED, "neutro_body_v1_full_chest_sdf_C07.bin"),
    );
    const approvedRefine = readFileSync(
      path.join(APPROVED, "neutro_body_v1_full_chest_refine_C07.bin"),
    );
    expect(Buffer.compare(officialField, approvedField)).toBe(0);
    expect(Buffer.compare(officialRefine, approvedRefine)).toBe(0);
    expect(officialField.length + officialRefine.length).toBeLessThanOrEqual(
      40 * 1024,
    );
  });

  it("official manifest registers C07 with hash-versioned metadata", () => {
    // Manifest version advances with multi-region promotions (V5.2 posterior back).
    expect(["2.7", "3.3", "4.2", "4.4", "5.2", "6.3", "7.0", "8.0", "9.0"]).toContain(manifest.version);
    expect(entry.regionId).toBe("full_chest");
    expect(entry.geometryHash).toBe("c62e81edaa1f");
    expect(entry.indexHash).toBe("52494d471398c");
    expect(entry.vertexCount).toBe(14517);
    expect(entry.fieldHash).toBe("cc4f1242dc879825");
    expect(entry.refinement?.hash).toBe("b309a72b943d16e8");
    expect(entry.candidateId).toBe("C07");
    expect(entry.anatomicalParameters).toEqual({
      infraclavicularOffsetMm: 14,
      upperCenterRiseMm: 3,
      inferiorCenterTransitionMm: 0,
      lateralInsetMm: 0,
    });
    expect(entry.encoding).toBe("snorm16");
    expect(entry.fieldUrl).toContain("full_chest_sdf.bin");
    expect(entry.refinement?.url).toContain("full_chest_refine.bin");
  });

  it("mask integrity and hit/highlight alignment passed offline", () => {
    // Global maskHash advanced after abdomen V3.3; V2.7 report remains the
    // historical C07 promotion evidence (d0187d9ec55f).
    expect(report.mask.maskHash).toBe("d0187d9ec55f");
    expect(maskManifest.maskHash).toBeTruthy();
    expect(maskManifest.maskHash).not.toBe("");
    expect(report.mask.foreignIdsModified).toBe(0);
    expect(report.mask.unknownIds).toBe(0);
    expect(report.mask.components).toBe(1);
    expect(report.mask.tinyIslands).toBe(0);
    expect(report.mask.uvSeamErrors).toBe(0);
    expect(report.alignment.interiorMismatch).toBe(0);
    expect(report.alignment.exteriorMismatch).toBe(0);
    expect(report.alignment.interior).toBeGreaterThanOrEqual(5000);
    expect(report.alignment.exterior).toBeGreaterThanOrEqual(5000);
  });

  it("productive path has no SDF UV for full_chest", () => {
    expect(getPublicRegionVisualAsset("full_chest")?.sdfUrl).toBeUndefined();
    expect(getPublicRegionSdfSrc("full_chest")).toBeNull();
    expect(regionIdsWithSdf(["full_chest"])).toBeNull();
    const highlight = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(highlight).not.toMatch(/uUseSdf/);
    expect(highlight).not.toMatch(/getPublicRegionSdfSrc/);
    expect(highlight).toMatch(/aActiveRegionDistance/);
  });

  it("UX contract remains Pecho completo / complete-only", () => {
    expect(getPublicShortLabel("full_chest")).toBe("Pecho completo");
    expect(getPublicDescription("full_chest")).toBe(
      "Superficie frontal completa del pecho",
    );
    expect(getSupportedCoverages("full_chest")).toEqual(["complete"]);
    expect(regionSupportsCoverage("full_chest")).toBe(false);
    expect(isPublicSelectableBodyTarget("full_chest")).toBe(true);
    expect(isPublicSelectableBodyTarget("left_chest")).toBe(false);
    expect(isPublicSelectableBodyTarget("right_chest")).toBe(false);
    expect(getPrimaryPublicSelectionTarget("left_chest")).toBe("full_chest");
    expect(getPrimaryPublicSelectionTarget("right_chest")).toBe("full_chest");
    expect(getPrimaryPublicSelectionTarget("sternum")).toBe("full_chest");
    expect(resolvePublicTargetHighlightRegions("full_chest")).toEqual([
      "full_chest_surface",
    ]);
  });
});
