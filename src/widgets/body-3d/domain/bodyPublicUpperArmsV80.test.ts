/**
 * Upper Arms V8.0 — official promotion gate tests.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialBodyFrozen,
  contentHash16,
  CANDIDATES,
  GEOMETRY_IDENTITY,
  INDEP_ENCODING,
  PIPELINE_VERSION,
  SOURCE_GATE,
  CANONICAL_ID_MAP,
  OFFICIAL_SHOULDERS,
} from "../../../../tools/body-regions/upper-arms-v80-core.mjs";
import {
  findRegionGeometryFieldEntry,
  decodeRegionFieldRefinement,
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
import { getPublicCatalogEntry } from "@/widgets/body-3d/domain/bodyPublicSelectionCatalog";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/upper-arms-v80");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");
const SHARED = path.join(ROOT, "assets/body-regions/shared-seams");

const REGIONS = [
  "right_biceps_region",
  "right_triceps_region",
  "right_upper_arm",
  "left_biceps_region",
  "left_triceps_region",
  "left_upper_arm",
] as const;

const FILE_STEMS = [
  "right_biceps",
  "right_triceps",
  "right_upper_arm",
  "left_biceps",
  "left_triceps",
  "left_upper_arm",
] as const;

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Upper Arms V8.0 — official freeze + promotion", () => {
  it("keeps prior official torso/back/neck/shoulder fields bit-identical", () => {
    const freeze = assertOfficialBodyFrozen(ROOT);
    expect(freeze.intact).toBe(true);
    expect(freeze.geometryHash).toBe(GEOMETRY_IDENTITY.geometryHash);
    expect(freeze.shoulders.candidateId).toBe("SH02");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin")),
      ),
    ).toBe("cc4f1242dc879825");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_neck_sdf.bin")),
      ),
    ).toBe("554f6b07992ae0c5");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_upper_back_sdf.bin")),
      ),
    ).toBe("6795862f576d5f8b");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_right_shoulder_sdf.bin")),
      ),
    ).toBe(OFFICIAL_SHOULDERS.right_shoulder.fieldHash);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_left_shoulder_sdf.bin")),
      ),
    ).toBe(OFFICIAL_SHOULDERS.left_shoulder.fieldHash);
  });

  it("promotes six sidecars with UA02 hashes within 45 KB", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    expect(manifest.version).toBe("8.0");
    expect(hashes.candidateId).toBe("UA02");
    expect(hashes.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(CANDIDATES.UA02.bicepsBandOffsetMm).toBe(0);
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
      expect(entry?.candidateId).toBe("UA02");
      expect(entry?.fieldHash).toBe(hashes.regions[region].fieldHash);
      expect(entry?.refinement?.hash).toBe(hashes.regions[region].refineHash);
      expect(entry?.refinement?.encoding).toBe(INDEP_ENCODING);
      const total =
        readFileSync(bin).byteLength + readFileSync(ref).byteLength;
      expect(total / 1024).toBeLessThanOrEqual(45);
    }
  });

  it("does not invent upper_arm_surface / elbow / arm_pair", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    const blob = JSON.stringify(manifest);
    for (const banned of CANONICAL_ID_MAP.noCreate) {
      expect(blob.includes(banned), banned).toBe(false);
    }
    expect(blob.includes("upper_arm_surface")).toBe(false);
  });

  it("upper_arm uses hitVisualRegionIds and independent field", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (const side of ["right", "left"] as const) {
      const full = findRegionGeometryFieldEntry(manifest, `${side}_upper_arm`);
      expect(full?.hitVisualRegionIds).toEqual([
        `${side}_biceps_surface`,
        `${side}_triceps_surface`,
      ]);
      expect(full?.visualRegionId).toBeUndefined();
      const bi = findRegionGeometryFieldEntry(
        manifest,
        `${side}_biceps_region`,
      );
      const tri = findRegionGeometryFieldEntry(
        manifest,
        `${side}_triceps_region`,
      );
      expect(full?.fieldHash).not.toBe(bi?.fieldHash);
      expect(full?.fieldHash).not.toBe(tri?.fieldHash);
      const logical = getLogicalPublicBodyRegion(`${side}_upper_arm`);
      expect(logical?.hitVisualRegionIds).toEqual(full?.hitVisualRegionIds);
    }
    expect(
      LOGICAL_PUBLIC_BODY_REGIONS.some((e) => e.regionId === "right_upper_arm"),
    ).toBe(true);
  });

  it("uses independent-edge refinement codec", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i]!;
      const stem = FILE_STEMS[i]!;
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.refinement?.encoding).toBe(INDEP_ENCODING);
      const buf = readFileSync(
        path.join(FIELDS, `neutro_body_v1_${stem}_refine.bin`),
      );
      const decoded = decodeRegionFieldRefinement(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        0.02,
        INDEP_ENCODING,
      );
      expect(decoded.kind).toBe("independent-edge-v1");
    }
  });

  it("versions shared seams under assets/body-regions/shared-seams", () => {
    for (const side of ["right", "left"]) {
      for (const name of [
        `${side}-shoulder-upper-arm.json`,
        `${side}-upper-arm-forearm.json`,
        `${side}-medial-biceps-triceps.json`,
        `${side}-lateral-biceps-triceps.json`,
      ]) {
        expect(existsSync(path.join(SHARED, name)), name).toBe(true);
      }
    }
  });
});

describe("Upper Arms V8.0 — precision 1/2/4 mm", () => {
  it("meets isoline criteria for all six targets", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    for (const region of REGIONS) {
      const iso = hashes.regions[region].isoline;
      expect(iso.meanMm, region).toBeLessThanOrEqual(1);
      expect(iso.p95Mm, region).toBeLessThanOrEqual(2);
      expect(iso.maxMm, region).toBeLessThanOrEqual(4);
      expect(iso.pass, region).toBe(true);
      expect(hashes.regions[region].components).toBe(1);
      expect(hashes.regions[region].tinyIslands).toBe(0);
    }
  });

  it("records bilateral side-aware sidecars without mirroring", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    expect(hashes.regions.right_biceps_region.fieldHash).not.toBe(
      hashes.regions.left_biceps_region.fieldHash,
    );
    expect(hashes.regions.right_triceps_region.fieldHash).not.toBe(
      hashes.regions.left_triceps_region.fieldHash,
    );
    expect(hashes.regions.right_upper_arm.fieldHash).not.toBe(
      hashes.regions.left_upper_arm.fieldHash,
    );
  });

  it("keeps alignment at 0/0 mismatches", () => {
    for (const stem of FILE_STEMS) {
      const a = readJson(path.join(ART, "alignment", `${stem}.json`));
      expect(a.interiorMismatches, stem).toBe(0);
      expect(a.exteriorMismatches, stem).toBe(0);
      expect(a.pass, stem).toBe(true);
    }
  });
});

describe("Upper Arms V8.0 — UX metadata + cameras + hover", () => {
  it("exposes complete coverage labels and cameras", () => {
    expect(getPublicShortLabel("right_biceps_region")).toMatch(/Bíceps derecho/i);
    expect(getPublicShortLabel("left_triceps_region")).toMatch(/Tríceps izquierdo/i);
    expect(getPublicShortLabel("right_upper_arm")).toMatch(/Brazo superior derecho/i);
    expect(getPublicDescription("right_biceps_region")).toMatch(/anterior/i);
    expect(getPublicDescription("right_triceps_region")).toMatch(/posterior/i);
    expect(getPreferredBodyView("right_biceps_region")).toBe("front-right");
    expect(getPreferredBodyView("left_biceps_region")).toBe("front-left");
    expect(getPreferredBodyView("right_triceps_region")).toBe("back-right");
    expect(getPreferredBodyView("left_triceps_region")).toBe("back-left");
    expect(getPreferredBodyView("right_upper_arm")).toBe("front-right");
    expect(getPreferredBodyView("left_upper_arm")).toBe("front-left");
    for (const id of REGIONS) {
      expect(getPublicCatalogEntry(id)?.supportedCoverages).toEqual([
        "complete",
      ]);
    }
  });

  it("keeps official hover/preview/selected opacities", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/HOVER_OPACITY = 0\.24/);
    expect(src).toMatch(/PREVIEW_OPACITY = 0\.38/);
    expect(src).toMatch(/SELECTED_OPACITY = 0\.55/);
  });

  it("highlights full surfaces without elbow on upper_arm", () => {
    expect(resolvePublicTargetHighlightRegions("right_upper_arm")).toEqual([
      "right_biceps_surface",
      "right_triceps_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("left_upper_arm")).toEqual([
      "left_biceps_surface",
      "left_triceps_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("right_biceps_region")).toEqual([
      "right_biceps_surface",
    ]);
  });

  it("normalizes logical upper_arm hits", () => {
    expect(
      normalizeLogicalPublicHit("right_biceps_surface", ["right_upper_arm"]),
    ).toBe("right_upper_arm");
    expect(
      resolveGeometryFieldCandidateIds([
        "right_biceps_surface",
        "right_triceps_surface",
      ]),
    ).toContain("right_upper_arm");
  });
});

describe("Upper Arms V8.0 — adjacency + normalization", () => {
  it("allows biceps+triceps→upper_arm and shoulder contacts", () => {
    expect(
      normalizeConnectedBodySelection([
        "right_biceps_region",
        "right_triceps_region",
      ]),
    ).toEqual(["right_upper_arm"]);
    expect(
      arePublicTargetsAdjacent("right_biceps_region", "right_triceps_region"),
    ).toBe(true);
    expect(
      arePublicTargetsAdjacent("right_biceps_region", "right_shoulder"),
    ).toBe(true);
    expect(
      arePublicTargetsAdjacent("right_triceps_region", "right_shoulder"),
    ).toBe(true);
    expect(
      arePublicTargetsAdjacent("right_upper_arm", "right_shoulder"),
    ).toBe(true);
  });

  it("rejects isolated bilateral arms and distant calf", () => {
    expect(
      isPublicSelectionContiguous(["right_upper_arm", "left_upper_arm"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous(["right_upper_arm", "right_calf"]),
    ).toBe(false);
  });

  it("allows connected chains via chest/neck/back", () => {
    expect(
      isPublicSelectionContiguous([
        "right_upper_arm",
        "right_shoulder",
        "full_chest",
        "left_shoulder",
        "left_upper_arm",
      ]),
    ).toBe(true);
    expect(
      isPublicSelectionContiguous([
        "right_upper_arm",
        "right_shoulder",
        "full_neck",
        "left_shoulder",
        "left_upper_arm",
      ]),
    ).toBe(true);
    expect(
      isPublicSelectionContiguous([
        "right_upper_arm",
        "right_shoulder",
        "upper_back",
        "left_shoulder",
        "left_upper_arm",
      ]),
    ).toBe(true);
  });

  it("drops biceps when upper_arm already selected (no duplicate surface)", () => {
    const next = normalizeSelectedTargetIds([
      "right_upper_arm",
      "right_biceps_region",
    ]);
    expect(next).toEqual(["right_upper_arm"]);
  });
});

describe("Upper Arms V8.0 — source gate metadata", () => {
  it("records sourceGate upper-arms-v80", () => {
    expect(SOURCE_GATE).toBe("upper-arms-v80");
    const report = readJson(path.join(ART, "report.json"));
    expect(report.canPromoteOfficially).toBe(true);
    expect(report.selectedCandidateId).toBe("UA02");
    const promote = readJson(path.join(ART, "promote-report.json"));
    expect(promote.promoted).toBe(true);
    expect(promote.maskHashPrev).toBe("b0f32714bfc1");
  }, 20_000);
});
