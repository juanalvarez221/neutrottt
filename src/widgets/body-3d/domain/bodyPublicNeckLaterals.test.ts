/**
 * Lateral neck — professional public selection (left / right).
 */
import { describe, expect, it } from "vitest";
import {
  resolveLateralNeckPublicHit,
  isLateralNeckPublicId,
} from "@/widgets/body-3d/domain/bodyPublicNeckHit";
import {
  getPrimaryPublicSelectionTarget,
  getPublicSelectionOptionsForAtomicZone,
} from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { isPublicSelectableBodyTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  arePublicTargetsAdjacent,
  isPublicSelectionContiguous,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  getPublicShortLabel,
  getPublicDescription,
  getPublicFullLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import {
  getPreferredBodyView,
  getPreferredFocusSection,
  getFramingScale,
  toCardinalCameraView,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
import { getMaskIndexForRegionId } from "@/widgets/body-3d/domain/bodyPublicRegionMask";
import {
  canonicalAtomicForPublicTarget,
  getPublicTargetForMaskIndex,
  getSurfaceRegionIdForMaskIndex,
} from "@/widgets/body-3d/interaction/bodyPublicMaskHit";
import { BODY_ZONES_BY_ID } from "@/widgets/body-3d/domain/bodyZones";

const LATERALS = ["neck_left", "neck_right"] as const;

describe("Lateral neck — public catalog", () => {
  it("exposes both laterals as public selectable targets", () => {
    for (const id of LATERALS) {
      expect(isPublicSelectableBodyTarget(id)).toBe(true);
      expect(BODY_ZONES_BY_ID[id]?.kind).toBe("atomic");
      expect(getPrimaryPublicSelectionTarget(id)).toBe(id);
    }
  });

  it("uses professional Spanish labels", () => {
    expect(getPublicShortLabel("neck_left")).toBe("Cuello lateral izquierdo");
    expect(getPublicShortLabel("neck_right")).toBe("Cuello lateral derecho");
    expect(getPublicDescription("neck_left")).toMatch(/lateral izquierda/i);
    expect(getPublicDescription("neck_right")).toMatch(/lateral derecha/i);
    expect(getPublicFullLabel("neck_left")).toMatch(/mandíbula/i);
    expect(getPublicFullLabel("neck_right")).toMatch(/clavícula/i);
    expect(BODY_ZONES_BY_ID.neck_left?.label).toBe("Cuello lateral izquierdo");
    expect(BODY_ZONES_BY_ID.neck_right?.label).toBe("Cuello lateral derecho");
  });

  it("orients camera to the ipsilateral 3/4 view and frames the neck", () => {
    expect(getPreferredBodyView("neck_left")).toBe("front-left");
    expect(getPreferredBodyView("neck_right")).toBe("front-right");
    expect(toCardinalCameraView("front-left")).toBe("left");
    expect(toCardinalCameraView("front-right")).toBe("right");
    expect(getPreferredFocusSection("neck_left")).toBe("head");
    expect(getPreferredFocusSection("neck_right")).toBe("head");
    expect(getFramingScale("neck_left")).toBe("tight");
    expect(getFramingScale("neck_right")).toBe("tight");
  });
});

describe("Lateral neck — mask + hit routing", () => {
  it("maps mask indices 7/8 to laterals, not full_neck or anterior", () => {
    expect(getMaskIndexForRegionId("neck_left_surface")).toBe(7);
    expect(getMaskIndexForRegionId("neck_right_surface")).toBe(8);
    expect(getPublicTargetForMaskIndex(7)).toBe("neck_left");
    expect(getPublicTargetForMaskIndex(8)).toBe("neck_right");
    expect(getSurfaceRegionIdForMaskIndex(7)).toBe("neck_left_surface");
    expect(getSurfaceRegionIdForMaskIndex(8)).toBe("neck_right_surface");
    expect(canonicalAtomicForPublicTarget("neck_left")).toBe("neck_left");
    expect(canonicalAtomicForPublicTarget("neck_right")).toBe("neck_right");
    expect(resolvePublicTargetHighlightRegions("neck_left")).toEqual([
      "neck_left_surface",
    ]);
    expect(resolvePublicTargetHighlightRegions("neck_right")).toEqual([
      "neck_right_surface",
    ]);
  });

  it("keeps mask laterals even when the ray hits shoulder or anterior mesh", () => {
    expect(resolveLateralNeckPublicHit("right_shoulder", "neck_right")).toBe(
      "neck_right",
    );
    expect(resolveLateralNeckPublicHit("neck_front", "neck_left")).toBe(
      "neck_left",
    );
    expect(isLateralNeckPublicId("neck_right")).toBe(true);
  });

  it("reclaims stolen anterior / nape / shoulder hits onto the lateral mesh", () => {
    expect(resolveLateralNeckPublicHit("neck_left", "neck_front")).toBe(
      "neck_left",
    );
    expect(resolveLateralNeckPublicHit("neck_right", "neck_back")).toBe(
      "neck_right",
    );
    expect(resolveLateralNeckPublicHit("neck_right", "right_shoulder")).toBe(
      "neck_right",
    );
    expect(resolveLateralNeckPublicHit("neck_left", "left_shoulder")).toBe(
      "neck_left",
    );
    expect(resolveLateralNeckPublicHit("neck_left", null)).toBe("neck_left");
  });

  it("does not steal a real neighboring region from a non-lateral mesh", () => {
    expect(resolveLateralNeckPublicHit("right_shoulder", "right_shoulder")).toBe(
      "right_shoulder",
    );
    expect(resolveLateralNeckPublicHit("neck_front", "neck_front")).toBe(
      "neck_front",
    );
  });
});

describe("Lateral neck — option sheet", () => {
  it("offers both laterals from any neck quadrant", () => {
    for (const atomic of [
      "neck_front",
      "neck_back",
      "neck_left",
      "neck_right",
    ] as const) {
      const ids = getPublicSelectionOptionsForAtomicZone(atomic).map(
        (o) => o.targetId,
      );
      expect(ids, atomic).toContain("neck_left");
      expect(ids, atomic).toContain("neck_right");
      expect(ids, atomic).toContain("full_neck");
      expect(ids[0], atomic).toBe(atomic);
    }
  });

  it("offers the ipsilateral lateral from each shoulder", () => {
    const right = getPublicSelectionOptionsForAtomicZone("right_shoulder").map(
      (o) => o.targetId,
    );
    const left = getPublicSelectionOptionsForAtomicZone("left_shoulder").map(
      (o) => o.targetId,
    );
    expect(right).toContain("neck_right");
    expect(right).not.toContain("neck_left");
    expect(left).toContain("neck_left");
    expect(left).not.toContain("neck_right");
  });
});

describe("Lateral neck — adjacency", () => {
  it("contacts anterior, nape and ipsilateral shoulder; not the opposite lateral", () => {
    expect(arePublicTargetsAdjacent("neck_left", "neck_front")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "neck_front")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_left", "neck_back")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "neck_back")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_left", "left_shoulder")).toBe(true);
    expect(arePublicTargetsAdjacent("neck_right", "right_shoulder")).toBe(true);
    expect(isPublicSelectionContiguous(["neck_left", "neck_right"])).toBe(
      false,
    );
    expect(
      isPublicSelectionContiguous(["neck_left", "neck_front", "neck_right"]),
    ).toBe(true);
  });
});
