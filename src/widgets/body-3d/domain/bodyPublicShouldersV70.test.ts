/**
 * Shoulders V7.0 — official promotion gate tests.
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
} from "../../../../tools/body-regions/shoulders-v70-core.mjs";
import {
  findRegionGeometryFieldEntry,
  decodeRegionFieldRefinement,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";
import {
  getPublicShortLabel,
  getPublicDescription,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { getPrimaryPublicSelectionTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import {
  canonicalAtomicForPublicTarget,
  getPublicTargetForMaskIndex,
  getSurfaceRegionIdForMaskIndex,
} from "@/widgets/body-3d/interaction/bodyPublicMaskHit";
import { getMaskIndexForRegionId } from "@/widgets/body-3d/domain/bodyPublicRegionMask";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/shoulders-v70");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");
const SIDES = ["right_shoulder", "left_shoulder"] as const;

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Shoulders V7.0 — official freeze + promotion", () => {
  it("keeps prior official torso/back/neck fields bit-identical", () => {
    const freeze = assertOfficialBodyFrozen(ROOT);
    expect(freeze.intact).toBe(true);
    expect(freeze.geometryHash).toBe(GEOMETRY_IDENTITY.geometryHash);
    expect(freeze.vertexCount).toBe(GEOMETRY_IDENTITY.vertexCount);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_chest_sdf.bin")),
      ),
    ).toBe("cc4f1242dc879825");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_full_neck_sdf.bin")),
      ),
    ).toBe("f9573effa3f0bfb1");
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_upper_back_sdf.bin")),
      ),
    ).toBe("1a21f0cea6db047f");
  });

  it("promotes bilateral shoulder sidecars with SH02 hashes", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    expect(["7.0", "8.0", "9.0", "9.1-costal"]).toContain(manifest.version);
    expect(hashes.candidateId).toBe("SH02");
    expect(hashes.pipelineVersion).toBe(PIPELINE_VERSION);
    for (const region of SIDES) {
      const bin = path.join(FIELDS, `neutro_body_v1_${region}_sdf.bin`);
      const ref = path.join(FIELDS, `neutro_body_v1_${region}_refine.bin`);
      expect(existsSync(bin)).toBe(true);
      expect(existsSync(ref)).toBe(true);
      expect(contentHash16(readFileSync(bin))).toBe(
        hashes.regions[region].fieldHash,
      );
      expect(contentHash16(readFileSync(ref))).toBe(
        hashes.regions[region].refineHash,
      );
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.candidateId).toBe("SH02");
      expect(entry?.fieldHash).toBe(hashes.regions[region].fieldHash);
      expect(entry?.refinement?.hash).toBe(hashes.regions[region].refineHash);
      expect(entry?.refinement?.encoding).toBe(INDEP_ENCODING);
      const total =
        readFileSync(bin).byteLength + readFileSync(ref).byteLength;
      expect(total / 1024).toBeLessThanOrEqual(45);
    }
  });

  it("does not invent full_shoulders or deltoid subdivisions", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    const blob = JSON.stringify(manifest);
    expect(blob.includes("full_shoulders")).toBe(false);
    expect(blob.includes("both_shoulders")).toBe(false);
    expect(blob.includes("shoulder_pair")).toBe(false);
    expect(blob.includes("anterior_shoulder")).toBe(false);
    for (const region of SIDES) {
      const h = resolvePublicTargetHighlightRegions(region);
      expect(h).toEqual([`${region}_surface`.replace("_shoulder_surface", "_shoulder_surface")]);
      expect(h).toEqual([
        region === "right_shoulder"
          ? "right_shoulder_surface"
          : "left_shoulder_surface",
      ]);
    }
  });

  it("uses independent-edge refinement codec", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (const region of SIDES) {
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.refinement?.encoding).toBe(INDEP_ENCODING);
      const buf = readFileSync(
        path.join(FIELDS, `neutro_body_v1_${region}_refine.bin`),
      );
      const decoded = decodeRegionFieldRefinement(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        0.02,
        INDEP_ENCODING,
      );
      expect(decoded.kind).toBe("independent-edge-v1");
      expect(decoded.edgeTs?.length).toBe(decoded.triangles.length * 3);
    }
  });
});

describe("Shoulders V7.0 — precision 1/2/4 mm", () => {
  it("meets isoline criteria for both shoulders", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const report = readJson(path.join(ART, "report.json"));
    for (const region of SIDES) {
      const iso = hashes.regions[region].isoline;
      expect(iso.meanMm, region).toBeLessThanOrEqual(1);
      expect(iso.p95Mm, region).toBeLessThanOrEqual(2);
      expect(iso.maxMm, region).toBeLessThanOrEqual(4);
      expect(iso.pass, region).toBe(true);
      const side = region.startsWith("right") ? "right" : "left";
      const comps =
        report.selected?.sides?.[side]?.region?.components ??
        report.sides?.[side]?.region?.components ??
        1;
      expect(comps).toBe(1);
    }
  });

  it("records bilateral side-aware sidecars without mirroring", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    expect(hashes.regions.right_shoulder.fieldHash).not.toBe(
      hashes.regions.left_shoulder.fieldHash,
    );
    expect(hashes.regions.right_shoulder.refineHash).not.toBe(
      hashes.regions.left_shoulder.refineHash,
    );
    expect(CANDIDATES.SH02.deltoidInsertionOffsetMm).toBe(0);
  });

  it("keeps alignment at 0/0 mismatches", () => {
    for (const side of ["right", "left"] as const) {
      const a = readJson(path.join(ART, "alignment", `${side}.json`));
      expect(a.interiorMismatches, side).toBe(0);
      expect(a.exteriorMismatches, side).toBe(0);
      expect(a.pass, side).toBe(true);
    }
  });
});

describe("Shoulders V7.0 — UX metadata + cameras", () => {
  it("exposes complete coverage labels and cameras", () => {
    expect(getPublicShortLabel("right_shoulder")).toMatch(/Hombro derecho/i);
    expect(getPublicShortLabel("left_shoulder")).toMatch(/Hombro izquierdo/i);
    expect(getPublicDescription("right_shoulder")).toMatch(/completa/i);
    expect(getPublicDescription("left_shoulder")).toMatch(/completa/i);
    expect(getPreferredBodyView("right_shoulder")).toBe("front-right");
    expect(getPreferredBodyView("left_shoulder")).toBe("front-left");
  });

  it("routes mask hover/select to the shoulder atomic, not chest or arm", () => {
    expect(canonicalAtomicForPublicTarget("right_shoulder")).toBe(
      "right_shoulder",
    );
    expect(canonicalAtomicForPublicTarget("left_shoulder")).toBe(
      "left_shoulder",
    );
    expect(getPrimaryPublicSelectionTarget("right_shoulder")).toBe(
      "right_shoulder",
    );
    expect(getPrimaryPublicSelectionTarget("left_shoulder")).toBe(
      "left_shoulder",
    );

    const rightIndex = getMaskIndexForRegionId("right_shoulder_surface");
    const leftIndex = getMaskIndexForRegionId("left_shoulder_surface");
    expect(rightIndex).toBe(16);
    expect(leftIndex).toBe(17);
    expect(getPublicTargetForMaskIndex(16)).toBe("right_shoulder");
    expect(getPublicTargetForMaskIndex(17)).toBe("left_shoulder");
    expect(getSurfaceRegionIdForMaskIndex(16)).toBe("right_shoulder_surface");
    expect(getSurfaceRegionIdForMaskIndex(17)).toBe("left_shoulder_surface");

    expect(resolvePublicTargetHighlightRegions("right_shoulder")).toEqual([
      "right_shoulder_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("left_shoulder")).toEqual([
      "left_shoulder_surface",
    ]);
  });

  it("keeps official hover/preview/selected opacities", () => {
    const src = readFileSync(
      path.join(
        ROOT,
        "src/widgets/body-3d/interaction/BodyPublicRegionMaskHighlight.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/HOVER_OPACITY = 0.78/);
    expect(src).toMatch(/PREVIEW_OPACITY = 0.84/);
    expect(src).toMatch(/SELECTED_OPACITY = 0.9/);
    expect(src).toMatch(/EDGE_OPACITY = 0\.95/);
    expect(src).toMatch(/DIM_OPACITY = 0\.0/);
    expect(src).toMatch(/depthTest: false/);
    expect(src).toMatch(/NormalBlending/);
    expect(src).toMatch(/uFocusActive/);
    expect(src).toMatch(/uDimColor/);
    expect(src).toMatch(/uEdgeColor/);
  });
});

describe("Shoulders V7.0 — adjacency", () => {
  it("allows neck/chest/back contacts and connected chains", () => {
    expect(arePublicTargetsAdjacent("right_shoulder", "neck_right")).toBe(true);
    expect(arePublicTargetsAdjacent("left_shoulder", "neck_left")).toBe(true);
    expect(arePublicTargetsAdjacent("right_shoulder", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("left_shoulder", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("right_shoulder", "upper_back")).toBe(true);
    expect(arePublicTargetsAdjacent("left_shoulder", "upper_back")).toBe(true);
    expect(arePublicTargetsAdjacent("right_shoulder", "full_neck")).toBe(true);
    expect(arePublicTargetsAdjacent("left_shoulder", "full_neck")).toBe(true);
    expect(
      isPublicSelectionContiguous(["right_shoulder", "left_shoulder"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous([
        "right_shoulder",
        "full_neck",
        "left_shoulder",
      ]),
    ).toBe(true);
    expect(
      isPublicSelectionContiguous([
        "right_shoulder",
        "full_chest",
        "left_shoulder",
      ]),
    ).toBe(true);
    expect(
      isPublicSelectionContiguous([
        "right_shoulder",
        "upper_back",
        "left_shoulder",
      ]),
    ).toBe(true);
  });

  it("rejects distant shoulder + calf/forearm without promoted chain", () => {
    expect(
      isPublicSelectionContiguous(["right_shoulder", "right_calf"]),
    ).toBe(false);
    expect(
      isPublicSelectionContiguous(["left_shoulder", "left_forearm"]),
    ).toBe(false);
  });
});

describe("Shoulders V7.0 — gate artifacts", () => {
  it("retains arm seams for future upper-arm gates", () => {
    expect(
      existsSync(
        path.join(ART, "shared-seams/right-shoulder-upper-arm.json"),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(ART, "shared-seams/left-shoulder-upper-arm.json")),
    ).toBe(true);
    expect(existsSync(path.join(ART, "report.json"))).toBe(true);
    const report = readJson(path.join(ART, "report.json"));
    expect(report.canPromoteOfficially).toBe(true);
    expect(report.selectedCandidate).toBe("SH02");
    expect(report.sourceGate ?? SOURCE_GATE).toBe(SOURCE_GATE);
  });
});
