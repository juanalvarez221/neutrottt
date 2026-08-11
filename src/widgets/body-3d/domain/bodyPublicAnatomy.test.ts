import { describe, expect, it } from "vitest";
import adjacencyData from "@/widgets/body-3d/domain/generated/publicRegionAdjacency.json";
import {
  isConnectedBodySelection,
  normalizeConnectedBodySelection,
  tryAddContiguousPublicTarget,
  PUBLIC_REGION_ADJACENCY,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";

type Stats = {
  faceCount?: number;
  widthX?: number;
  centroid?: number[];
  connectedComponents?: number;
  surfaceArea?: number;
  bbox?: number[][];
};

const DATA = adjacencyData as {
  stats: Record<string, Stats>;
  validation: {
    overlaps: number;
    unclassified: number;
    leftRightMismatches: string[];
    pectoralPCA?: {
      right: { width: number; height: number; horizontalDominance: number };
      left: { width: number; height: number; horizontalDominance: number };
    };
    backCoverageRatio?: number;
  };
  landmarks: { sternum_x: number; inframammary_y?: number; waist_y?: number; iliac_y?: number };
};

describe("pectoralis orientation sanity", () => {
  it("right pec PCA is not a vertical column", () => {
    const pca = DATA.validation.pectoralPCA?.right;
    expect(pca).toBeTruthy();
    // Female breast volume may be taller than wide; reject only extreme columns.
    expect(pca!.width).toBeGreaterThanOrEqual(pca!.height * 0.55);
    expect(pca!.horizontalDominance).toBeGreaterThan(0.4);
  });

  it("full chest only resolves full_chest_surface", () => {
    const ids = [...resolvePublicTargetHighlightRegions("full_chest")].sort();
    expect(ids).toEqual(["full_chest_surface"]);
  });
});

describe("abdomen / ribs / back sanity", () => {
  it("abdomen does not include pectorals", () => {
    const ids = resolvePublicTargetHighlightRegions("full_abdomen");
    expect(ids).toEqual(["full_abdomen_region"]);
    expect(ids).not.toContain("full_chest_surface");
    expect(ids).not.toContain("left_pectoral_region");
    expect(ids).not.toContain("right_pectoral_region");
  });

  it("ribs have side ownership and meaningful lateral width", () => {
    const r = DATA.stats.right_ribs_region;
    const l = DATA.stats.left_ribs_region;
    expect(r?.centroid?.[0]).toBeLessThan(DATA.landmarks.sternum_x);
    expect(l?.centroid?.[0]).toBeGreaterThan(DATA.landmarks.sternum_x);
    expect(r?.widthX ?? 0).toBeGreaterThan(0.03);
    expect(l?.widthX ?? 0).toBeGreaterThan(0.03);
    expect(r?.faceCount ?? 0).toBeGreaterThan(40);
  });

  it("costillas stop at costal margin (not waist/iliac flank)", () => {
    const imfY = DATA.landmarks.inframammary_y ?? 1.175;
    const iliacY = DATA.landmarks.iliac_y ?? 0.934;
    for (const id of ["right_ribs_region", "left_ribs_region"] as const) {
      const ymin = DATA.stats[id]?.bbox?.[0]?.[1];
      expect(ymin, id).toBeGreaterThan(imfY - 0.06);
      expect(ymin, id).toBeGreaterThan(iliacY + 0.12);
      expect(DATA.stats[id]?.heightY ?? 0, id).toBeLessThan(0.28);
    }
  });

  it("costados (flanks) sit below costillas and above iliac", () => {
    const iliacY = DATA.landmarks.iliac_y ?? 0.934;
    for (const side of ["left", "right"] as const) {
      const ribs = DATA.stats[`${side}_ribs_region`];
      const flank = DATA.stats[`${side}_flank_region`];
      expect(flank?.faceCount ?? 0, side).toBeGreaterThan(10);
      const ribsYmin = ribs?.bbox?.[0]?.[1] ?? 0;
      const flankYmax = flank?.bbox?.[1]?.[1] ?? 0;
      const flankYmin = flank?.bbox?.[0]?.[1] ?? 0;
      expect(flankYmax, side).toBeLessThanOrEqual(ribsYmin + 0.02);
      expect(flankYmin, side).toBeGreaterThan(iliacY + 0.02);
    }
  });

  it("public labels distinguish costillas vs costado", () => {
    expect(resolvePublicTargetHighlightRegions("left_ribs")).toEqual([
      "left_ribs_region",
    ]);
    expect(resolvePublicTargetHighlightRegions("left_flank")).toEqual([
      "left_flank_region",
    ]);
    expect(resolvePublicTargetHighlightRegions("right_flank")).toEqual([
      "right_flank_region",
    ]);
  });

  it("upper / lower back posterior width sanity", () => {
    expect(DATA.stats.upper_back_surface?.widthX ?? 0).toBeGreaterThan(0.28);
    expect(DATA.stats.lower_back_surface?.widthX ?? 0).toBeGreaterThan(0.22);
    expect(DATA.stats.upper_back_surface?.faceCount ?? 0).toBeGreaterThan(200);
  });

  it("lower_back sits in lumbar band, not sacral bowl", () => {
    const bbox = DATA.stats.lower_back_surface?.bbox;
    expect(bbox).toBeTruthy();
    const yMin = bbox![0][1];
    const yMax = bbox![1][1];
    // Above superior sacrum (~0.91) and below thoracolumbar mid (~1.10+)
    expect(yMin).toBeGreaterThanOrEqual(0.945);
    expect(yMax).toBeGreaterThan(1.04);
    expect(yMax).toBeLessThan(1.12);
  });
});

describe("geometric integrity", () => {
  it("no base overlaps / unclassified in generated validation", () => {
    expect(DATA.validation.overlaps).toBe(0);
    expect(DATA.validation.unclassified).toBe(0);
  });

  it("left/right centroids match side prefixes", () => {
    expect(DATA.validation.leftRightMismatches).toEqual([]);
    for (const [id, s] of Object.entries(DATA.stats)) {
      const cx = s.centroid?.[0];
      if (cx == null) continue;
      if (id.startsWith("left_")) {
        expect(cx, id).toBeGreaterThan(DATA.landmarks.sternum_x - 0.02);
      }
      if (id.startsWith("right_")) {
        expect(cx, id).toBeLessThan(DATA.landmarks.sternum_x + 0.02);
      }
    }
  });

  it("public adjacency graph is non-empty", () => {
    expect(Object.keys(PUBLIC_REGION_ADJACENCY).length).toBeGreaterThan(10);
    expect(PUBLIC_REGION_ADJACENCY.upper_back_surface?.length ?? 0).toBeGreaterThan(
      0,
    );
  });
});

describe("connected selection graph", () => {
  it("accepts adjacent chains and rejects distant targets", () => {
    const ok = tryAddContiguousPublicTarget(["full_chest"], "full_abdomen");
    expect(ok.ok).toBe(true);
    const distant = tryAddContiguousPublicTarget(
      ["full_chest"],
      "left_lower_leg_back",
    );
    expect(distant.ok).toBe(false);
    if (!distant.ok) {
      expect(distant.message).toMatch(/separada/i);
    }
  });

  it("isConnectedBodySelection matches contiguous component rule", () => {
    expect(isConnectedBodySelection(["upper_back", "lower_back"])).toBe(true);
    expect(isConnectedBodySelection(["full_chest", "left_lower_leg_front"])).toBe(
      false,
    );
  });

  it("normalizations for chest/back/arm/forearm/leg", () => {
    expect(
      normalizeConnectedBodySelection(["left_chest", "right_chest"]),
    ).toEqual(["full_chest"]);
    expect(
      normalizeConnectedBodySelection(["upper_back", "lower_back"]),
    ).toEqual(["full_back"]);
    expect(
      normalizeConnectedBodySelection([
        "right_biceps_region",
        "right_triceps_region",
      ]),
    ).toEqual(["right_upper_arm"]);
    expect(
      normalizeConnectedBodySelection([
        "right_forearm_inner_region",
        "right_forearm_outer_region",
      ]),
    ).toEqual(["right_forearm"]);
    expect(
      normalizeConnectedBodySelection([
        "left_lower_leg_front",
        "left_lower_leg_back",
      ]),
    ).toEqual(["left_lower_leg"]);
  });
});
