import { describe, expect, it } from "vitest";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import {
  getPreferredBodyView,
  getPreferredFocusSection,
  isPreferredViewAlreadyActive,
  toCardinalCameraView,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";

const FULL_BACK_ATOMICS = [
  "left_scapula",
  "right_scapula",
  "upper_back_center",
  "left_mid_back",
  "right_mid_back",
  "mid_back_center",
  "left_lower_back",
  "right_lower_back",
  "lower_back_center",
] as const;

describe("public region composition — exact atomic sets", () => {
  it("full_back resolves full dorsal width without sacrum/neck/glutes", () => {
    const ids = resolveTargetToAtomicZoneIds("full_back");
    expect(ids).toEqual([...FULL_BACK_ATOMICS].sort());
    for (const id of FULL_BACK_ATOMICS) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("sacrum");
    expect(ids).not.toContain("left_glute");
    expect(ids).not.toContain("right_glute");
    expect(ids.some((id) => id.startsWith("neck_"))).toBe(false);
  });

  it("upper_back_large includes scapulae and mid laterals", () => {
    expect(resolveTargetToAtomicZoneIds("upper_back_large")).toEqual(
      [
        "left_scapula",
        "right_scapula",
        "upper_back_center",
        "left_mid_back",
        "right_mid_back",
        "mid_back_center",
      ].sort(),
    );
  });

  it("lower_back_large is lumbar only (no sacrum)", () => {
    expect(resolveTargetToAtomicZoneIds("lower_back_large")).toEqual(
      ["left_lower_back", "right_lower_back", "lower_back_center"].sort(),
    );
    expect(resolveTargetToAtomicZoneIds("lower_back_large")).not.toContain(
      "sacrum",
    );
  });

  it("full_chest is pectorals only", () => {
    expect(resolveTargetToAtomicZoneIds("full_chest")).toEqual([
      "left_chest",
      "right_chest",
    ]);
  });

  it("full sleeve includes arm chain and excludes hand", () => {
    const ids = resolveTargetToAtomicZoneIds("right_full_sleeve");
    expect(ids).toContain("right_shoulder");
    expect(ids).toContain("right_upper_arm_front");
    expect(ids).toContain("right_elbow");
    expect(ids).toContain("right_forearm_outer");
    expect(ids).toContain("right_wrist");
    expect(ids).not.toContain("right_hand");
  });

  it("full leg includes thigh through foot", () => {
    const ids = resolveTargetToAtomicZoneIds("right_full_leg");
    expect(ids).toContain("right_thigh_front");
    expect(ids).toContain("right_knee");
    expect(ids).toContain("right_lower_leg_front");
    expect(ids).toContain("right_ankle");
    expect(ids).toContain("right_foot");
  });
});

describe("preferred camera views", () => {
  it("maps key regions to preferred views", () => {
    expect(getPreferredBodyView("full_back")).toBe("back");
    expect(getPreferredBodyView("full_chest")).toBe("front");
    expect(getPreferredBodyView("right_biceps_region")).toBe("front-right");
    expect(getPreferredBodyView("right_triceps_region")).toBe("back-right");
    expect(getPreferredBodyView("left_lower_leg_back")).toBe("back");
    expect(getPreferredBodyView("head_left_region")).toBe("left");
  });

  it("maps preferred views to cardinal control state", () => {
    expect(toCardinalCameraView("back")).toBe("back");
    expect(toCardinalCameraView("back-right")).toBe("back");
    expect(toCardinalCameraView("front-right")).toBe("right");
    expect(toCardinalCameraView("left")).toBe("left");
  });

  it("skips unnecessary rotation when already aligned", () => {
    expect(isPreferredViewAlreadyActive("back", "back")).toBe(true);
    expect(isPreferredViewAlreadyActive("front", "back")).toBe(false);
    expect(isPreferredViewAlreadyActive("back", "back-right")).toBe(true);
  });

  it("assigns sensible focus sections", () => {
    expect(getPreferredFocusSection("full_back")).toBe("torso");
    expect(getPreferredFocusSection("right_biceps_region")).toBe("arms");
    expect(getPreferredFocusSection("head_left_region")).toBe("head");
    expect(getPreferredFocusSection("left_lower_leg_back")).toBe("legs");
  });
});
