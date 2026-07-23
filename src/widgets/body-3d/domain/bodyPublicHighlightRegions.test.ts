import { describe, expect, it } from "vitest";
import {
  listTargetsMissingPublicHighlight,
  resolvePublicTargetHighlightRegions,
  resolvePublicTargetsHighlightRegions,
} from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
  PUBLIC_PRODUCT_FLAGS,
} from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  getFramingScale,
  getPreferredBodyView,
  getPreferredFocusSection,
  getPublicCameraPoseMeta,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
import { getPublicRegionMeta } from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { validateBodyZoneDomain } from "@/widgets/body-3d/domain/bodyZones";
import { isNonSelectableSurfaceAtomic } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";

describe("public highlight region resolution", () => {
  it("every public target has highlight resolution", () => {
    const missing = listTargetsMissingPublicHighlight([
      ...PUBLIC_SELECTABLE_BODY_TARGET_IDS,
    ]);
    expect(missing).toEqual([]);
  });

  it("every public target has camera metadata", () => {
    for (const id of PUBLIC_SELECTABLE_BODY_TARGET_IDS) {
      expect(getPublicRegionMeta(id), id).toBeDefined();
      const cam = getPublicCameraPoseMeta(id);
      expect(cam.preferredView, id).toBeTruthy();
      expect(cam.focusSection, id).toBeTruthy();
      expect(cam.framingScale, id).toMatch(/^(tight|medium|wide)$/);
      expect(getPreferredBodyView(id)).toBe(cam.preferredView);
      expect(getPreferredFocusSection(id)).toBe(cam.focusSection);
      expect(getFramingScale(id)).toBe(cam.framingScale);
    }
  });

  it("full_back public highlight resolves correctly", () => {
    expect(resolvePublicTargetHighlightRegions("full_back")).toEqual([
      "upper_back_region",
      "lower_back_region",
    ]);
  });

  it("full_chest public highlight resolves correctly", () => {
    expect(resolvePublicTargetHighlightRegions("full_chest")).toEqual([
      "left_pectoral_region",
      "right_pectoral_region",
    ]);
  });

  it("full_sleeve public highlight resolves correctly", () => {
    const right = resolvePublicTargetHighlightRegions("right_full_sleeve");
    expect(right).toEqual([
      "right_shoulder_surface",
      "right_biceps_surface",
      "right_triceps_surface",
      "right_forearm_inner_surface",
      "right_forearm_outer_surface",
      "right_elbow_transition",
      "right_wrist_transition",
    ]);
    expect(
      resolvePublicTargetHighlightRegions("left_full_sleeve"),
    ).toHaveLength(7);
  });

  it("full_leg public highlight resolves correctly", () => {
    const ids = resolvePublicTargetHighlightRegions("right_full_leg");
    expect(ids).toContain("right_thigh_front_surface");
    expect(ids).toContain("right_knee_transition");
    expect(ids).toContain("right_shin_surface");
    expect(ids).toContain("right_calf_surface");
    expect(ids).toContain("right_foot_surface");
  });

  it("dedupes compound selections", () => {
    const ids = resolvePublicTargetsHighlightRegions([
      "upper_back_large",
      "full_back",
    ]);
    expect(ids.filter((x) => x === "upper_back_region")).toHaveLength(1);
    expect(ids).toContain("lower_back_region");
  });
});

describe("interaction model invariants", () => {
  it("interaction hit routing remains 81/81", () => {
    const v = validateBodyZoneDomain();
    expect(v.ok).toBe(true);
    expect(v.totalAtomic).toBe(81);
  });

  it("non-selectable face remains non-selectable", () => {
    expect(PUBLIC_PRODUCT_FLAGS.faceSelectable).toBe(false);
    expect(isNonSelectableSurfaceAtomic("face_left")).toBe(true);
    expect(isNonSelectableSurfaceAtomic("face_right")).toBe(true);
  });

  it("only public targets persist (whitelist)", () => {
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("full_face")).toBe(false);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("full_back")).toBe(true);
  });
});
