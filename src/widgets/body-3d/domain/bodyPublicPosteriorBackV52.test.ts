/**
 * Posterior Back V5.2 — official S02 promotion gate.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  expectedOfficialHashes,
} from "../../../../tools/body-regions/posterior-back-v51-core.mjs";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  LOGICAL_PUBLIC_BODY_REGIONS,
  normalizeLogicalPublicHit,
  resolveGeometryFieldCandidateIds,
  visualIdsSuppressedByFieldRegion,
} from "@/widgets/body-3d/domain/bodyPublicLogicalRegions";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import { getPublicShortLabel, getPublicDescription } from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { PUBLIC_SELECTABLE_BODY_TARGET_IDS } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  isConnectedBodySelection,
  normalizeConnectedBodySelection,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";
import { getMaskIndexForRegionId } from "@/widgets/body-3d/domain/bodyPublicRegionMask";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/posterior-back-v52");
const ART51 = path.join(ROOT, "artifacts/posterior-back-v51");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function sha16(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

const S02 = {
  upper: { field: "6795862f576d5f8b", refine: "4d366898782d2c7f" },
  lower: { field: "105365e5be961e96", refine: "4c956c30646eb298" },
  full: { field: "6da0b6bfe2eb5b38", refine: "c79f8241b89fecb2" },
};

describe("Posterior Back V5.2 — official S02 promotion", () => {
  it("promotes three official back fields from approved S02 bins", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    const ids = manifest.fields.map((f) => f.regionId);
    expect(ids).toEqual(
      expect.arrayContaining(["upper_back", "lower_back", "full_back"]),
    );
    expect(Number.parseFloat(manifest.version)).toBeGreaterThanOrEqual(5.2);

    for (const region of ["upper_back", "lower_back", "full_back"] as const) {
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.candidateId).toBe("S02");
      expect(entry?.encoding).toBe("snorm16");
      expect(entry?.geometryHash).toBe("c62e81edaa1f");
      expect(entry?.indexHash).toBe("52494d471398c");
      expect(entry?.vertexCount).toBe(14517);
      const sdf = readFileSync(
        path.join(FIELDS, `neutro_body_v1_${region}_sdf.bin`),
      );
      const refine = readFileSync(
        path.join(FIELDS, `neutro_body_v1_${region}_refine.bin`),
      );
      expect(sha16(sdf)).toBe(S02[region === "upper_back" ? "upper" : region === "lower_back" ? "lower" : "full"].field);
      expect(sha16(refine)).toBe(
        S02[region === "upper_back" ? "upper" : region === "lower_back" ? "lower" : "full"].refine,
      );
      expect((sdf.byteLength + refine.byteLength) / 1024).toBeLessThanOrEqual(45);
    }
  });

  it("full_back uses hitVisualRegionIds and has no full_back_surface", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    const full = findRegionGeometryFieldEntry(manifest, "full_back");
    expect(full?.hitVisualRegionIds).toEqual([
      "upper_back_surface",
      "lower_back_surface",
    ]);
    expect(full?.visualRegionId).toBeUndefined();
    expect(full?.surfaceRegionId).toBeUndefined();
    expect(full?.maskIndex).toBeUndefined();

    const mask = readJson(
      path.join(
        ROOT,
        "src/widgets/body-3d/domain/generated/publicRegionMaskManifest.json",
      ),
    );
    expect(mask.regions.full_back_surface).toBeUndefined();
    expect(mask.regions.upper_back_surface.maskIndex).toBe(14);
    expect(mask.regions.lower_back_surface.maskIndex).toBe(15);
    expect(getMaskIndexForRegionId("upper_back_region")).toBe(14);
    expect(getMaskIndexForRegionId("lower_back_region")).toBe(15);
  });

  it("keeps official torso fields bit-identical", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
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

  it("copies S02 approved hashes unchanged", () => {
    for (const region of ["upper_back", "lower_back", "full_back"]) {
      const approved = readFileSync(
        path.join(ART51, "approved", `${region}_sdf.bin`),
      );
      const official = readFileSync(
        path.join(FIELDS, `neutro_body_v1_${region}_sdf.bin`),
      );
      expect(sha16(official)).toBe(sha16(approved));
    }
  });
});

describe("Posterior Back V5.2 — logical full_back + metadata", () => {
  it("resolves Geometry Field candidates preferring full_back union", () => {
    expect(LOGICAL_PUBLIC_BODY_REGIONS[0]?.regionId).toBe("full_back");
    expect(
      resolveGeometryFieldCandidateIds([
        "upper_back_surface",
        "lower_back_surface",
      ]),
    ).toEqual(["full_back", "upper_back_surface", "lower_back_surface"]);
    expect(visualIdsSuppressedByFieldRegion("full_back")).toEqual([
      "upper_back_surface",
      "lower_back_surface",
    ]);
    expect(
      normalizeLogicalPublicHit("upper_back_surface", ["full_back"]),
    ).toBe("full_back");
    expect(normalizeLogicalPublicHit("upper_back_surface", [])).toBe(
      "upper_back_surface",
    );
  });

  it("exposes public metadata and Back camera", () => {
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("upper_back")).toBe(true);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("lower_back")).toBe(true);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("full_back")).toBe(true);
    expect(getPublicShortLabel("upper_back")).toBe("Espalda alta");
    expect(getPublicShortLabel("lower_back")).toBe("Espalda baja");
    expect(getPublicShortLabel("full_back")).toBe("Espalda completa");
    expect(getPublicDescription("upper_back")).toMatch(/superior/i);
    expect(getPublicDescription("lower_back")).toMatch(/lumbar/i);
    expect(getPublicDescription("full_back")).toMatch(/completa/i);
    expect(getPreferredBodyView("upper_back")).toBe("back");
    expect(getPreferredBodyView("lower_back")).toBe("back");
    expect(getPreferredBodyView("full_back")).toBe("back");
    expect(resolvePublicTargetHighlightRegions("upper_back")).toEqual([
      "upper_back_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("lower_back")).toEqual([
      "lower_back_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("full_back")).toEqual([
      "upper_back_surface",
      "lower_back_surface",
    ]);
  });

  it("allows back+ribs adjacency and rejects distant calf", () => {
    expect(isConnectedBodySelection(["upper_back", "lower_back"])).toBe(true);
    expect(isConnectedBodySelection(["upper_back", "right_ribs"])).toBe(true);
    expect(isConnectedBodySelection(["lower_back", "left_ribs"])).toBe(true);
    expect(isConnectedBodySelection(["full_back", "right_ribs"])).toBe(true);
    expect(
      isConnectedBodySelection(["right_ribs", "full_back", "left_ribs"]),
    ).toBe(true);
    expect(isConnectedBodySelection(["full_back", "right_calf"])).toBe(false);
    expect(
      normalizeConnectedBodySelection(["upper_back", "lower_back"]),
    ).toEqual(["full_back"]);
  });

  it("writes V5.2 promotion report", () => {
    expect(existsSync(path.join(ART, "report.json"))).toBe(true);
    const report = readJson(path.join(ART, "report.json"));
    expect(report.promoted).toBe(true);
    expect(report.candidateId).toBe("S02");
    expect(report.chestIntact).toBe(true);
    expect(report.abdomenIntact).toBe(true);
    expect(report.leftRibsIntact).toBe(true);
    expect(report.rightRibsIntact).toBe(true);
    expect(report.full.hitVisualRegionIds).toEqual([
      "upper_back_surface",
      "lower_back_surface",
    ]);
  });
});
