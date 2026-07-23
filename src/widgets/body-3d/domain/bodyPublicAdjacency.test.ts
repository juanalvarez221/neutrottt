/**
 * Contiguous public selection + adjacency graph tests.
 */

import { describe, expect, it } from "vitest";
import {
  PUBLIC_REGION_ADJACENCY,
  PUBLIC_REGION_ADJACENCY_EDGE_COUNT,
  arePublicTargetsAdjacent,
  getAdjacentPublicBaseRegions,
  isPublicSelectionContiguous,
  normalizeConnectedBodySelection,
  tryAddContiguousPublicTarget,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  PUBLIC_HIGHLIGHT_REGION_IDS,
  resolvePublicTargetHighlightRegions,
} from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import { PUBLIC_SELECTABLE_BODY_TARGET_IDS } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import { getPublicCameraPoseMeta } from "@/widgets/body-3d/ux/bodyPreferredCamera";

describe("public region adjacency graph", () => {
  it("is generated with edges", () => {
    expect(PUBLIC_REGION_ADJACENCY_EDGE_COUNT).toBeGreaterThan(20);
    expect(Object.keys(PUBLIC_REGION_ADJACENCY).length).toBeGreaterThan(10);
  });

  it("upper and lower back share a boundary", () => {
    const n = getAdjacentPublicBaseRegions("upper_back_region");
    expect(n).toContain("lower_back_region");
  });

  it("pectorals are adjacent to abdomen or each other via sternum continuity", () => {
    const left = getAdjacentPublicBaseRegions("left_pectoral_region");
    const right = getAdjacentPublicBaseRegions("right_pectoral_region");
    expect(
      left.includes("right_pectoral_region") ||
        left.includes("full_abdomen_region") ||
        right.includes("full_abdomen_region"),
    ).toBe(true);
  });
});

describe("contiguous selection", () => {
  it("blocks distant regions", () => {
    const result = tryAddContiguousPublicTarget(
      ["right_chest"],
      "left_lower_leg_back",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/separada/i);
    }
  });

  it("allows adjacent ribs + abdomen", () => {
    const result = tryAddContiguousPublicTarget(["right_ribs"], "full_abdomen");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isPublicSelectionContiguous(result.next)).toBe(true);
    }
  });

  it("normalizes to full chest", () => {
    const next = normalizeConnectedBodySelection(["left_chest", "right_chest"]);
    expect(next).toContain("full_chest");
    expect(next).not.toContain("left_chest");
  });

  it("normalizes to full back", () => {
    const next = normalizeConnectedBodySelection([
      "upper_back_large",
      "lower_back_large",
    ]);
    expect(next).toContain("full_back");
  });

  it("normalizes to complete lower leg", () => {
    const next = normalizeConnectedBodySelection([
      "left_lower_leg_front",
      "left_lower_leg_back",
    ]);
    expect(next).toContain("left_lower_leg");
  });

  it("keeps full sleeve continuous", () => {
    expect(arePublicTargetsAdjacent("right_biceps_region", "right_forearm_inner_region") ||
      resolvePublicTargetHighlightRegions("right_full_sleeve").length > 4).toBe(
      true,
    );
    const regions = resolvePublicTargetHighlightRegions("right_full_sleeve");
    expect(regions).toContain("right_elbow_transition");
  });

  it("keeps full leg continuous", () => {
    const regions = resolvePublicTargetHighlightRegions("left_full_leg");
    expect(regions).toContain("left_knee_transition");
    expect(regions).toContain("left_shin_surface");
  });
});

describe("public targets resolve + camera", () => {
  it("all selectable targets resolve to valid highlight regions", () => {
    const highlightSet = new Set<string>(PUBLIC_HIGHLIGHT_REGION_IDS);
    for (const id of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      const regions = resolvePublicTargetHighlightRegions(id);
      expect(regions.length, id).toBeGreaterThan(0);
      for (const r of regions) {
        expect(highlightSet.has(r), `${id} → ${r}`).toBe(true);
      }
    }
  });

  it("all public targets have camera metadata", () => {
    for (const id of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      const cam = getPublicCameraPoseMeta(id);
      expect(cam.preferredView, id).toBeTruthy();
    }
  });

  it("no flank public targets remain selectable", () => {
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("left_flank")).toBe(false);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("right_flank")).toBe(false);
  });
});

describe("geometric side validation (centroids from generated stats)", () => {
  it("left/right highlight regions have matching side centroids when stats present", async () => {
    const data = await import(
      "@/widgets/body-3d/domain/generated/publicRegionAdjacency.json"
    );
    const stats = (data as { stats?: Record<string, { centroid: number[] }> })
      .stats;
    if (!stats) return;
    for (const [id, st] of Object.entries(stats)) {
      const cx = st.centroid?.[0];
      if (cx == null) continue;
      if (id.startsWith("left_")) {
        expect(cx, id).toBeGreaterThan(-0.02);
      }
      if (id.startsWith("right_")) {
        expect(cx, id).toBeLessThan(0.02);
      }
    }
  });
});
