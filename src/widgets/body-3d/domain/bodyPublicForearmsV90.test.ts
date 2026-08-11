/**
 * Forearms V9.0 — official promotion gate tests.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialBodyFrozen,
  contentHash16,
  CANDIDATES,
  GEOMETRY_IDENTITY,
  PIPELINE_VERSION,
  CANONICAL_ID_MAP,
  OFFICIAL_UPPER_ARMS,
} from "../../../../tools/body-regions/forearms-v90-core.mjs";
import {
  findRegionGeometryFieldEntry,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
  normalizeConnectedBodySelection,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  getLogicalPublicBodyRegion,
  LOGICAL_PUBLIC_BODY_REGIONS,
  normalizeLogicalPublicHit,
  resolveGeometryFieldCandidateIds,
} from "@/widgets/body-3d/domain/bodyPublicLogicalRegions";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";
import {
  getPublicShortLabel,
  getPublicDescription,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import {
  getPublicCatalogEntry,
  getSupportedCoverages,
} from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/forearms-v90");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");
const SHARED = path.join(ROOT, "assets/body-regions/shared-seams");

const REGIONS = [
  "right_forearm_inner_region",
  "right_forearm_outer_region",
  "right_forearm",
  "left_forearm_inner_region",
  "left_forearm_outer_region",
  "left_forearm",
] as const;

const FILE_STEMS = [
  "right_forearm_inner",
  "right_forearm_outer",
  "right_forearm",
  "left_forearm_inner",
  "left_forearm_outer",
  "left_forearm",
] as const;

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Forearms V9.0 — official freeze + promotion", () => {
  it("keeps prior official body fields bit-identical", () => {
    const freeze = assertOfficialBodyFrozen(ROOT);
    expect(freeze.upperArms.candidateId).toBe("UA02");
    expect(freeze.geometryHash ?? GEOMETRY_IDENTITY.geometryHash).toBe(
      GEOMETRY_IDENTITY.geometryHash,
    );
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin")),
      ),
    ).toBe("cc4f1242dc879825");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_upper_arm_sdf.bin")),
      ),
    ).toBe(OFFICIAL_UPPER_ARMS.right_upper_arm.fieldHash);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_left_upper_arm_sdf.bin")),
      ),
    ).toBe(OFFICIAL_UPPER_ARMS.left_upper_arm.fieldHash);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_biceps_sdf.bin")),
      ),
    ).toBe(OFFICIAL_UPPER_ARMS.right_biceps_region.fieldHash);
  });

  it("promotes six sidecars with FA02 hashes within 45 KB", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    expect(manifest.version).toMatch(/^9\./);
    expect(hashes.candidateId).toBe("FA02");
    expect(CANDIDATES.FA02.innerBandOffsetMm).toBe(0);
    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i]!;
      const stem = FILE_STEMS[i]!;
      const bin = path.join(FIELDS, `neutro_body_v1_${stem}_sdf.bin`);
      const ref = path.join(FIELDS, `neutro_body_v1_${stem}_refine.bin`);
      expect(existsSync(bin), bin).toBe(true);
      expect(existsSync(ref), ref).toBe(true);
      expect(contentHash16(readFileSync(bin))).toBe(
        hashes.regions[region].fieldHash,
      );
      expect(contentHash16(readFileSync(ref))).toBe(
        hashes.regions[region].refineHash,
      );
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.fieldHash).toBe(hashes.regions[region].fieldHash);
      expect(entry?.candidateId).toBe("FA02");
      const total =
        readFileSync(bin).byteLength + readFileSync(ref).byteLength;
      expect(total).toBeLessThanOrEqual(45 * 1024);
      const iso = hashes.regions[region].isoline;
      expect(iso.meanMm).toBeLessThanOrEqual(1);
      expect(iso.p95Mm).toBeLessThanOrEqual(2);
      expect(iso.maxMm).toBeLessThanOrEqual(4);
      expect(hashes.regions[region].components).toBe(1);
      expect(hashes.regions[region].tinyIslands).toBe(0);
    }
  });

  it("does not invent forearm_surface / elbow / wrist / forearm_pair", () => {
    const manifest = readFileSync(MANIFEST, "utf8");
    expect(manifest.includes("forearm_surface")).toBe(false);
    expect(CANONICAL_ID_MAP.noCreate).toContain("right_forearm_surface");
    expect(CANONICAL_ID_MAP.noCreate).toContain("wrist");
    expect(CANONICAL_ID_MAP.noCreate).toContain("elbow");
  });

  it("forearm uses hitVisualRegionIds and independent field", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (const side of ["right", "left"] as const) {
      const full = findRegionGeometryFieldEntry(manifest, `${side}_forearm`);
      expect(full?.hitVisualRegionIds).toEqual([
        `${side}_forearm_inner_surface`,
        `${side}_forearm_outer_surface`,
      ]);
      expect(full?.visualRegionId).toBeUndefined();
      expect(full?.surfaceRegionId).toBeUndefined();
      const logical = getLogicalPublicBodyRegion(`${side}_forearm`);
      expect(logical?.hitVisualRegionIds).toEqual([
        `${side}_forearm_inner_surface`,
        `${side}_forearm_outer_surface`,
      ]);
    }
    expect(
      LOGICAL_PUBLIC_BODY_REGIONS.some((e) => e.regionId === "right_forearm"),
    ).toBe(true);
  });

  it("reuses official upper-arm–forearm seams exactly", () => {
    for (const [side, hash] of [
      ["right", "c99c05240fbd7ab9"],
      ["left", "68bbd1ab1d20f7a2"],
    ] as const) {
      const seam = readJson(
        path.join(SHARED, `${side}-upper-arm-forearm.json`),
      );
      expect(seam.seamHash).toBe(hash);
    }
  });

  it("versions closed forearm–hand seams", () => {
    for (const side of ["right", "left"] as const) {
      const seam = readJson(path.join(SHARED, `${side}-forearm-hand.json`));
      expect(seam.closed).toBe(true);
      expect(seam.autoIntersections ?? 0).toBe(0);
      expect(seam.components ?? 1).toBe(1);
      expect((seam.points?.length ?? 0) >= 8).toBe(true);
      expect(seam.seamHash).toBeTruthy();
    }
  });

  it("versions radial/ulnar inner-outer seams", () => {
    for (const side of ["right", "left"] as const) {
      for (const kind of ["radial", "ulnar"] as const) {
        const seam = readJson(
          path.join(SHARED, `${side}-${kind}-inner-outer.json`),
        );
        expect(seam.seamHash).toBeTruthy();
        expect((seam.points?.length ?? 0) >= 8).toBe(true);
      }
    }
  });

  it("does not copy fields between sides", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    expect(hashes.regions.right_forearm.fieldHash).not.toBe(
      hashes.regions.left_forearm.fieldHash,
    );
    expect(hashes.regions.right_forearm_inner_region.fieldHash).not.toBe(
      hashes.regions.left_forearm_inner_region.fieldHash,
    );
  });

  it("alignment 0/0 for all six targets", () => {
    for (const stem of FILE_STEMS) {
      const a = readJson(path.join(ART, "alignment", `${stem}.json`));
      expect(a.interiorMismatches).toBe(0);
      expect(a.exteriorMismatches).toBe(0);
      expect(a.pass).toBe(true);
    }
  });

  it("metadata labels, coverage complete, cameras", () => {
    expect(getPublicShortLabel("right_forearm_inner_region")).toMatch(
      /Antebrazo interno derecho/i,
    );
    expect(getPublicShortLabel("right_forearm_outer_region")).toMatch(
      /Antebrazo externo derecho/i,
    );
    expect(getPublicShortLabel("right_forearm")).toMatch(
      /Antebrazo completo derecho/i,
    );
    expect(getPublicDescription("left_forearm")).toMatch(/completa/i);
    expect(getSupportedCoverages("right_forearm")).toEqual(["complete"]);
    expect(getSupportedCoverages("right_forearm_inner_region")).toEqual([
      "complete",
    ]);
    expect(getPreferredBodyView("right_forearm_inner_region")).toBe(
      "front-right",
    );
    expect(getPreferredBodyView("right_forearm_outer_region")).toBe(
      "back-right",
    );
    expect(getPreferredBodyView("left_forearm")).toBe("front-left");
    expect(getPublicCatalogEntry("right_forearm")?.surface).toBe("full");
    expect(PIPELINE_VERSION).toBe("V9.0");
  });

  it("highlights full surfaces without wrist on forearm", () => {
    expect(resolvePublicTargetHighlightRegions("right_forearm")).toEqual([
      "right_forearm_inner_surface",
      "right_forearm_outer_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("left_forearm")).toEqual([
      "left_forearm_inner_surface",
      "left_forearm_outer_surface",
    ]);
    expect(
      resolvePublicTargetHighlightRegions("right_forearm").join(","),
    ).not.toContain("wrist");
  });

  it("normalizes logical forearm hits", () => {
    expect(
      normalizeLogicalPublicHit("right_forearm_inner_surface", [
        "right_forearm",
      ]),
    ).toBe("right_forearm");
    expect(
      resolveGeometryFieldCandidateIds([
        "right_forearm_inner_surface",
        "right_forearm_outer_surface",
      ]),
    ).toContain("right_forearm");
  });

  it("allows inner+outer→forearm and upper-arm contacts; rejects hand and bilateral isolated", () => {
    expect(
      normalizeConnectedBodySelection([
        "right_forearm_inner_region",
        "right_forearm_outer_region",
      ]),
    ).toEqual(["right_forearm"]);
    expect(
      arePublicTargetsAdjacent("right_forearm", "right_upper_arm"),
    ).toBe(true);
    expect(
      arePublicTargetsAdjacent("left_forearm", "left_upper_arm"),
    ).toBe(true);
    expect(arePublicTargetsAdjacent("right_forearm", "right_hand")).toBe(
      false,
    );
    expect(
      isPublicSelectionContiguous(["right_forearm", "left_forearm"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous(["right_forearm", "right_calf"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous([
        "right_forearm",
        "right_upper_arm",
        "right_shoulder",
        "full_chest",
        "left_shoulder",
        "left_upper_arm",
        "left_forearm",
      ]),
    ).toBe(true);
  });

  it("drops inner when forearm already selected (no duplicate surface)", () => {
    const next = normalizeSelectedTargetIds([
      "right_forearm",
      "right_forearm_inner_region",
    ]);
    expect(next).toEqual(["right_forearm"]);
  });

  it("promote report records mask advance without push/merge", () => {
    const promote = readJson(path.join(ART, "promote-report.json"));
    expect(promote.promoted).toBe(true);
    expect(promote.candidateId).toBe("FA02");
    expect(promote.maskHashPrev).toBe("b6894a5ed2b7");
    expect(promote.maskHashNew).toBeTruthy();
    expect(promote.maskHashNew).not.toBe(promote.maskHashPrev);
    expect(promote.push).toBe(false);
    expect(promote.merge).toBe(false);
  });
});
