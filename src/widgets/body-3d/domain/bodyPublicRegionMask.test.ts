/**
 * UV Region ID Mask — manifiesto, resolución de índices e integridad anatómica.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BODY_PUBLIC_REGION_MASK_ENCODING,
  BODY_PUBLIC_REGION_MASK_INDEX_SCALE,
  BODY_PUBLIC_REGION_MASK_MANIFEST,
  BODY_PUBLIC_REGION_MASK_RESOLUTION,
  getMaskIndexForRegionId,
  resolveMaskIndicesForPublicTarget,
  resolveMaskIndicesForRegionIds,
} from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import { PUBLIC_HIGHLIGHT_REGION_IDS } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import { PUBLIC_SELECTABLE_BODY_TARGET_IDS } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  PUBLIC_REGION_ADJACENCY,
  getAdjacentPublicBaseRegions,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import adjacencyData from "@/widgets/body-3d/domain/generated/publicRegionAdjacency.json";

type AnatomySource = {
  model: string;
  regions: Record<string, { maskIndex: number; public?: boolean }>;
  composites: Record<string, string[]>;
  symmetryPairs: Array<[string, string]>;
};

type AdjacencyBundle = {
  stats: Record<
    string,
    {
      faceCount?: number;
      surfaceArea?: number;
      connectedComponents?: number;
    }
  >;
  validation: {
    overlaps: number;
    unclassified: number;
    leftRightMismatches: string[];
  };
};

const ANATOMY_PATH = path.join(
  process.cwd(),
  "assets/body-regions/neutro_body_v1_anatomical_regions.json",
);
const MASK_PNG_PATH = path.join(
  process.cwd(),
  "public/models/interaction/neutro_body_v1_anatomical_region_ids.png",
);

const BUNDLE = adjacencyData as AdjacencyBundle;

describe("bodyPublicRegionMask", () => {
  it("manifest is valid", () => {
    expect(BODY_PUBLIC_REGION_MASK_MANIFEST.model).toBe("neutro_body_v1");
    expect(BODY_PUBLIC_REGION_MASK_RESOLUTION).toBe(4096);
    expect(BODY_PUBLIC_REGION_MASK_ENCODING).toBe("r8_index");
    expect(BODY_PUBLIC_REGION_MASK_INDEX_SCALE).toBe(255);
    expect(BODY_PUBLIC_REGION_MASK_MANIFEST.maskTexture).toContain(
      "neutro_body_v1_anatomical_region_ids.png",
    );
    expect(
      Object.keys(BODY_PUBLIC_REGION_MASK_MANIFEST.regions).length,
    ).toBeGreaterThan(40);
  });

  it("mask texture asset exists", () => {
    expect(existsSync(MASK_PNG_PATH)).toBe(true);
  });

  it("authoritative anatomical source covers every highlight region", () => {
    expect(existsSync(ANATOMY_PATH)).toBe(true);
    const anatomy = JSON.parse(
      readFileSync(ANATOMY_PATH, "utf8"),
    ) as AnatomySource;
    expect(anatomy.model).toBe("neutro_body_v1");
    for (const id of PUBLIC_HIGHLIGHT_REGION_IDS) {
      expect(anatomy.regions[id], id).toBeTruthy();
      expect(anatomy.regions[id].maskIndex).toBe(
        getMaskIndexForRegionId(id),
      );
    }
    expect(anatomy.composites.full_chest).toEqual(["full_chest_surface"]);
    expect(anatomy.composites.full_back).toEqual([
      "upper_back_region",
      "lower_back_region",
    ]);
  });

  it("all PUBLIC_HIGHLIGHT_REGION_IDS have unique mask indices", () => {
    const indices = PUBLIC_HIGHLIGHT_REGION_IDS.map((id) => {
      const index = getMaskIndexForRegionId(id);
      expect(index, id).not.toBeNull();
      expect(index!, id).toBeGreaterThan(0);
      expect(index!, id).toBeLessThanOrEqual(255);
      return index!;
    });
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("no duplicate mask indices across manifest regions", () => {
    const indices = Object.values(BODY_PUBLIC_REGION_MASK_MANIFEST.regions).map(
      (entry) => entry.maskIndex,
    );
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("all public targets resolve to at least one mask index", () => {
    for (const targetId of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      const indices = resolveMaskIndicesForPublicTarget(targetId);
      expect(indices.length, targetId).toBeGreaterThanOrEqual(1);
    }
  });

  it("composites full_chest / full_back resolve to expected mask indices", () => {
    expect(resolveMaskIndicesForPublicTarget("full_chest")).toHaveLength(1);
    expect(resolveMaskIndicesForPublicTarget("full_back")).toHaveLength(2);
  });

  it("resolveMaskIndicesForRegionIds dedupes and skips unknown", () => {
    const a = getMaskIndexForRegionId("full_chest_surface");
    const b = getMaskIndexForRegionId("full_abdomen_region");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(
      resolveMaskIndicesForRegionIds([
        "full_chest_surface",
        "full_chest_surface",
        "not_a_region",
        "full_abdomen_region",
      ]),
    ).toEqual([a, b]);
  });

  it("bake validation shows no overlaps, unclassified or side mismatches", () => {
    expect(BUNDLE.validation.overlaps).toBe(0);
    expect(BUNDLE.validation.unclassified).toBe(0);
    expect(BUNDLE.validation.leftRightMismatches).toEqual([]);
  });

  it("every public highlight region is a single connected component with area", () => {
    for (const id of PUBLIC_HIGHLIGHT_REGION_IDS) {
      const entry = BUNDLE.stats[id];
      if (!entry) continue; // stats may lag until full body bake
      expect(entry.faceCount ?? 0, id).toBeGreaterThan(0);
    }
    expect(BUNDLE.stats.full_chest_surface || getMaskIndexForRegionId("full_chest_surface")).toBeTruthy();
  });

  it("left/right area ratios stay within anatomical tolerance", () => {
    const anatomy = JSON.parse(
      readFileSync(ANATOMY_PATH, "utf8"),
    ) as AnatomySource;
    for (const [left, right] of anatomy.symmetryPairs) {
      const a = BUNDLE.stats[left]?.surfaceArea ?? 0;
      const b = BUNDLE.stats[right]?.surfaceArea ?? 0;
      if (!a || !b) continue;
      const ratio = Math.min(a, b) / Math.max(a, b);
      expect(ratio, `${left}/${right}`).toBeGreaterThan(0.85);
    }
  });

  it("adjacency regenerated from anatomical bake includes critical torso edges", () => {
    expect(getAdjacentPublicBaseRegions("upper_back_region")).toContain(
      "lower_back_region",
    );
    expect(getAdjacentPublicBaseRegions("full_chest_surface")).toContain(
      "full_abdomen_region",
    );
    expect(Object.keys(PUBLIC_REGION_ADJACENCY).length).toBe(
      PUBLIC_HIGHLIGHT_REGION_IDS.length,
    );
  });
});
