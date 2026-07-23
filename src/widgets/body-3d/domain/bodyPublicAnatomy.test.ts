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
  landmarks: { sternum_x: number };
};

describe("pectoralis orientation sanity", () => {
  it("right pec PCA is horizontally dominant", () => {
    const pca = DATA.validation.pectoralPCA?.right;
    expect(pca).toBeTruthy();
    expect(pca!.width).toBeGreaterThanOrEqual(pca!.height * 0.95);
    expect(pca!.horizontalDominance).toBeGreaterThan(0.55);
  });

  it("full chest only resolves pectoral surfaces", () => {
    const ids = [...resolvePublicTargetHighlightRegions("full_chest")].sort();
    expect(ids).toEqual(
      ["left_pectoral_region", "right_pectoral_region"].sort(),
    );
  });
});

describe("abdomen / ribs / back sanity", () => {
  it("abdomen does not include pectorals", () => {
    const ids = resolvePublicTargetHighlightRegions("full_abdomen");
    expect(ids).toEqual(["full_abdomen_region"]);
    expect(ids).not.toContain("left_pectoral_region");
    expect(ids).not.toContain("right_pectoral_region");
  });

  it("ribs have side ownership and meaningful lateral width", () => {
    const r = DATA.stats.right_ribs_region;
    const l = DATA.stats.left_ribs_region;
    expect(r?.centroid?.[0]).toBeLessThan(DATA.landmarks.sternum_x);
    expect(l?.centroid?.[0]).toBeGreaterThan(DATA.landmarks.sternum_x);
    expect(r?.widthX ?? 0).toBeGreaterThan(0.08);
    expect(l?.widthX ?? 0).toBeGreaterThan(0.08);
    expect(r?.faceCount ?? 0).toBeGreaterThan(100);
  });

  it("upper / lower back posterior width sanity", () => {
    expect(DATA.stats.upper_back_region?.widthX ?? 0).toBeGreaterThan(0.28);
    expect(DATA.stats.lower_back_region?.widthX ?? 0).toBeGreaterThan(0.22);
    expect(DATA.stats.upper_back_region?.faceCount ?? 0).toBeGreaterThan(200);
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
    expect(PUBLIC_REGION_ADJACENCY.upper_back_region?.length ?? 0).toBeGreaterThan(
      0,
    );
  });
});

describe("connected selection graph", () => {
  it("accepts adjacent chains and rejects distant targets", () => {
    const ok = tryAddContiguousPublicTarget(["right_chest"], "right_ribs");
    expect(ok.ok).toBe(true);
    const distant = tryAddContiguousPublicTarget(
      ["right_chest"],
      "left_lower_leg_back",
    );
    expect(distant.ok).toBe(false);
    if (!distant.ok) {
      expect(distant.message).toMatch(/separada/i);
    }
  });

  it("isConnectedBodySelection matches contiguous component rule", () => {
    expect(isConnectedBodySelection(["upper_back_large", "lower_back_large"])).toBe(
      true,
    );
    expect(isConnectedBodySelection(["full_chest", "left_lower_leg_front"])).toBe(
      false,
    );
  });

  it("normalizations for chest/back/arm/forearm/leg", () => {
    expect(
      normalizeConnectedBodySelection(["left_chest", "right_chest"]),
    ).toEqual(["full_chest"]);
    expect(
      normalizeConnectedBodySelection(["upper_back_large", "lower_back_large"]),
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
