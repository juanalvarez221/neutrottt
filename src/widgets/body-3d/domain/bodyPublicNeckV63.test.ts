/**
 * Neck V6.3 — official promotion gate tests.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOfficialTorsoWithLeftRibsFrozen,
  contentHash16,
  expectedOfficialHashes,
  OFFICIAL_BACK,
} from "../../../../tools/body-regions/neck-v60-core.mjs";
import {
  EXPECTED_SEAM_HASHES,
  INDEP_ENCODING,
  PIPELINE_VERSION,
  CANDIDATE_ID,
} from "../../../../tools/body-regions/neck-v63-core.mjs";
import {
  findRegionGeometryFieldEntry,
  decodeRegionFieldRefinement,
  type RegionGeometryFieldManifest,
} from "@/widgets/body-3d/domain/bodyRegionGeometryField";
import {
  LOGICAL_PUBLIC_BODY_REGIONS,
  getLogicalPublicBodyRegion,
  normalizeLogicalPublicHit,
  resolveGeometryFieldCandidateIds,
} from "@/widgets/body-3d/domain/bodyPublicLogicalRegions";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { getPreferredBodyView } from "@/widgets/body-3d/ux/bodyPreferredCamera";
import { getPublicShortLabel, getPublicDescription } from "@/widgets/body-3d/domain/bodyPublicRegionMeta";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ART = path.join(ROOT, "artifacts/neck-v63");
const FIELDS = path.join(ROOT, "public/models/interaction/fields");
const MANIFEST = path.join(FIELDS, "neutro_body_v1_region_fields.json");
const PARTIALS = ["neck_front", "neck_right", "neck_back", "neck_left"] as const;
const REGIONS = [...PARTIALS, "full_neck"] as const;

function readJson(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("Neck V6.3 — official freeze + promotion", () => {
  it("keeps torso field bins bit-identical", () => {
    const freeze = assertOfficialTorsoWithLeftRibsFrozen(ROOT);
    const expected = expectedOfficialHashes();
    expect(freeze.intact).toBe(true);
    expect(freeze.geometryHash).toBe("c62e81edaa1f");
    expect(freeze.vertexCount).toBe(14517);
    expect(
      contentHash16(readFileSync(path.join(FIELDS, expected.chest.fieldBin))),
    ).toBe(expected.chest.fieldHash);
    expect(
      contentHash16(
        readFileSync(path.join(FIELDS, "neutro_body_v1_upper_back_sdf.bin")),
      ),
    ).toBe(OFFICIAL_BACK.upper_back.fieldHash);
  });

  it("promotes five official neck sidecars with V6.3 hashes", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    expect(["6.3", "7.0"]).toContain(manifest.version);
    for (const region of REGIONS) {
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
      expect(entry?.candidateId).toBe(CANDIDATE_ID);
      expect(entry?.fieldHash).toBe(hashes.regions[region].fieldHash);
      expect(entry?.refinement?.hash).toBe(hashes.regions[region].refineHash);
      const total =
        readFileSync(bin).byteLength + readFileSync(ref).byteLength;
      expect(total / 1024).toBeLessThanOrEqual(45);
    }
  });

  it("does not create full_neck_surface and uses hitVisualRegionIds", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    const full = findRegionGeometryFieldEntry(manifest, "full_neck");
    expect(full?.hitVisualRegionIds).toEqual([
      "neck_front_surface",
      "neck_right_surface",
      "neck_back_surface",
      "neck_left_surface",
    ]);
    expect(JSON.stringify(manifest).includes("full_neck_surface")).toBe(false);
    const logical = getLogicalPublicBodyRegion("full_neck");
    expect(logical?.hitVisualRegionIds).toEqual(full?.hitVisualRegionIds);
    expect(
      LOGICAL_PUBLIC_BODY_REGIONS.some((e) => e.regionId === "full_neck"),
    ).toBe(true);
  });

  it("rejects bc-topology-v1 for official neck refinements", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (const region of PARTIALS) {
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(entry?.refinement?.encoding).toBe(INDEP_ENCODING);
      expect(entry?.refinement?.encoding).not.toBe("bc-topology-v1");
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
    const full = findRegionGeometryFieldEntry(manifest, "full_neck");
    expect(full?.refinement?.encoding).toBe("u32-snorm16x3");
  });
});

describe("Neck V6.3 — precision 1/2/4 mm", () => {
  it("meets isoline criteria for all five targets", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    const metrics = readJson(path.join(ART, "approved/metrics.json"));
    for (const region of REGIONS) {
      const iso = hashes.regions[region].isoline;
      expect(iso.meanMm, region).toBeLessThanOrEqual(1);
      expect(iso.p95Mm, region).toBeLessThanOrEqual(2);
      expect(iso.maxMm, region).toBeLessThanOrEqual(4);
      expect(iso.pass, region).toBe(true);
      expect(metrics.regions[region].comps.components).toBe(1);
      expect(metrics.regions[region].comps.tinyIslands).toBe(0);
    }
  });

  it("preserves canonical seam hashes", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    expect(hashes.boundaryHashes).toEqual(EXPECTED_SEAM_HASHES);
    expect(hashes.candidateId).toBe(CANDIDATE_ID);
    expect(hashes.pipelineVersion).toBe(PIPELINE_VERSION);
  });

  it("records independent topology without non-manifold defects", () => {
    const hashes = readJson(path.join(ART, "approved/hashes.json"));
    for (const region of PARTIALS) {
      const topo = hashes.regions[region].topology;
      expect(topo.nonManifold).toBe(0);
      expect(topo.tJunctions).toBe(0);
      expect(topo.duplicateInsertedVertices).toBe(0);
      expect(topo.pass).toBe(true);
    }
  });
});

describe("Neck V6.3 — logical full_neck + hover contract", () => {
  it("normalizes any neck surface hit to full_neck when active", () => {
    expect(
      normalizeLogicalPublicHit("neck_front_surface", ["full_neck"]),
    ).toBe("full_neck");
    expect(
      normalizeLogicalPublicHit("neck_back_surface", ["full_neck"]),
    ).toBe("full_neck");
    expect(
      resolveGeometryFieldCandidateIds([
        "neck_front_surface",
        "neck_right_surface",
        "neck_back_surface",
        "neck_left_surface",
      ]),
    ).toContain("full_neck");
  });

  it("highlights full region surfaces without full_neck_surface", () => {
    for (const id of PARTIALS) {
      const h = resolvePublicTargetHighlightRegions(id);
      expect(h.length).toBe(1);
    }
    const full = resolvePublicTargetHighlightRegions("full_neck");
    expect(full).toEqual([
      "neck_front_surface",
      "neck_back_surface",
      "neck_left_surface",
      "neck_right_surface",
    ]);
  });

  it("exposes professional public labels and cameras", () => {
    expect(getPublicShortLabel("neck_front")).toMatch(/anterior/i);
    expect(getPublicDescription("neck_back")).toMatch(/posterior/i);
    expect(getPreferredBodyView("neck_right")).toBe("front-right");
    expect(getPreferredBodyView("neck_left")).toBe("front-left");
    expect(getPreferredBodyView("full_neck")).toBe("front-right");
  });
});

describe("Neck V6.3 — adjacency", () => {
  it("allows circular neck and torso contacts; rejects distant", () => {
    expect(arePublicTargetsAdjacent("neck_front", "neck_right")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "neck_back")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "neck_left")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_left", "neck_front")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_front", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_back", "upper_back")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "full_chest")).toBe(true);
    expect(arePublicTargetsAdjacent("full_neck", "upper_back")).toBe(true);
    expect(isPublicSelectionContiguous(["neck_right", "neck_left"])).toBe(
      false,
    );
    expect(
      isPublicSelectionContiguous(["neck_right", "neck_front", "neck_left"]),
    ).toBe(true);
    expect(isPublicSelectionContiguous(["full_neck", "right_calf"])).toBe(
      false,
    );
  });
});

describe("Neck V6.3 — V6.2 rejected", () => {
  it("does not load shared_topology or bc-topology for official neck", () => {
    const manifest = readJson(MANIFEST) as RegionGeometryFieldManifest;
    for (const region of REGIONS) {
      const entry = findRegionGeometryFieldEntry(manifest, region);
      expect(
        (entry as { sharedTopology?: unknown })?.sharedTopology,
      ).toBeUndefined();
      expect(entry?.refinement?.encoding).not.toBe("bc-topology-v1");
    }
    expect(
      existsSync(path.join(FIELDS, "neutro_body_v1_neck_shared_topology.bin")),
    ).toBe(false);
  });
});

describe("Neck V6.3 — opacities", () => {
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
});
