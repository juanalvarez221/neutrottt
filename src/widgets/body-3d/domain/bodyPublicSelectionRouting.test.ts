import { afterEach, describe, expect, it } from "vitest";
import {
  assertDefinedInteractionBehavior,
  assertPublicRoutingCoverage,
  getAtomicInteractionBehavior,
  getPrimaryPublicSelectionTarget,
  getPublicSelectionOptionsForAtomicZone,
  isNonSelectableSurfaceAtomic,
  isRoutingOnlyAtomicZone,
  resolvePublicHighlightAtomicIds,
  upgradeBodySelectionToPublicTargets,
} from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import {
  isPublicSelectableBodyTarget,
  PUBLIC_PRODUCT_FLAGS,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
} from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";
import { normalizeQuoteBodyTargets } from "@/widgets/quote/quoteBodyLocation";

afterEach(() => {
  PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
});

describe("public body selection taxonomy", () => {
  it("maps upper-arm front/inner to biceps", () => {
    expect(getPrimaryPublicSelectionTarget("right_upper_arm_front")).toBe(
      "right_biceps_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_upper_arm_inner")).toBe(
      "right_biceps_region",
    );
    const atomics = resolveTargetToAtomicZoneIds("right_biceps_region");
    // Highlight preciso: cara anterior (no envuelve el brazo)
    expect(atomics).toEqual(["right_upper_arm_front"]);
  });

  it("maps upper-arm back/outer to triceps", () => {
    expect(getPrimaryPublicSelectionTarget("right_upper_arm_back")).toBe(
      "right_triceps_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_upper_arm_outer")).toBe(
      "right_triceps_region",
    );
    expect(resolveTargetToAtomicZoneIds("right_triceps_region")).toEqual([
      "right_upper_arm_back",
    ]);
  });

  it("full_chest highlight is pectorals only (no sternum / abdomen)", () => {
    expect(resolveTargetToAtomicZoneIds("full_chest")).toEqual([
      "left_chest",
      "right_chest",
    ]);
    expect(resolveTargetToAtomicZoneIds("full_chest")).not.toContain("sternum");
    expect(resolveTargetToAtomicZoneIds("full_chest")).not.toContain(
      "upper_abdomen",
    );
  });

  it("maps forearm faces to inner/outer regions", () => {
    expect(getPrimaryPublicSelectionTarget("right_forearm_front")).toBe(
      "right_forearm_inner_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_forearm_inner")).toBe(
      "right_forearm_inner_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_forearm_back")).toBe(
      "right_forearm_outer_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_forearm_outer")).toBe(
      "right_forearm_outer_region",
    );
  });

  it("routes sternum to full chest", () => {
    expect(getPrimaryPublicSelectionTarget("sternum")).toBe("full_chest");
  });

  it("routes upper/mid back to upper_back_large", () => {
    expect(getPrimaryPublicSelectionTarget("left_scapula")).toBe(
      "upper_back_large",
    );
    expect(getPrimaryPublicSelectionTarget("mid_back_center")).toBe(
      "upper_back_large",
    );
  });

  it("routes lower back and sacrum to lower_back_large", () => {
    expect(getPrimaryPublicSelectionTarget("left_lower_back")).toBe(
      "lower_back_large",
    );
    expect(getPrimaryPublicSelectionTarget("sacrum")).toBe("lower_back_large");
  });

  it("routes ears to head side regions", () => {
    expect(getPrimaryPublicSelectionTarget("left_ear")).toBe(
      "head_left_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_ear")).toBe(
      "head_right_region",
    );
  });

  it("elbow options are large arm regions only (no elbow itself)", () => {
    const options = getPublicSelectionOptionsForAtomicZone("right_elbow");
    const ids = options.map((o) => o.targetId);
    expect(ids).not.toContain("right_elbow");
    expect(ids[0]).toBe("right_upper_arm");
    expect(ids).toContain("right_forearm");
    expect(ids).toContain("right_full_sleeve");
    expect(options.every((o) => o.tier === "primary" || o.tier === "amplify")).toBe(
      true,
    );
  });

  it("wrist options are large arm regions only", () => {
    const ids = getPublicSelectionOptionsForAtomicZone("right_wrist").map(
      (o) => o.targetId,
    );
    expect(ids).not.toContain("right_wrist");
    expect(ids).toContain("right_forearm");
    expect(ids).toContain("right_hand");
    expect(ids).toContain("right_full_sleeve");
  });

  it("knee and ankle options are large leg regions only", () => {
    const knee = getPublicSelectionOptionsForAtomicZone("right_knee").map(
      (o) => o.targetId,
    );
    expect(knee).not.toContain("right_knee");
    expect(knee).toContain("right_thigh");
    expect(knee).toContain("right_full_leg");

    const ankle = getPublicSelectionOptionsForAtomicZone("right_ankle").map(
      (o) => o.targetId,
    );
    expect(ankle).not.toContain("right_ankle");
    expect(ankle).toContain("right_foot");
    expect(ankle).toContain("right_full_leg");
  });

  it("covers all 81 atomic zones with public routing", () => {
    const coverage = assertPublicRoutingCoverage();
    expect(coverage.totalAtomics).toBe(81);
    expect(coverage.routed).toBe(81);
    expect(coverage.missing).toEqual([]);
  });

  it("blocks routing-only atomics from persistence whitelist", () => {
    expect(isRoutingOnlyAtomicZone("right_elbow")).toBe(true);
    expect(isPublicSelectableBodyTarget("right_elbow")).toBe(false);
    expect(isPublicSelectableBodyTarget("sternum")).toBe(false);
    expect(isPublicSelectableBodyTarget("right_biceps_region")).toBe(true);
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("right_full_arm")).toBe(false);
  });

  it("upgrades old atomic drafts to public targets", () => {
    expect(
      upgradeBodySelectionToPublicTargets([
        "right_upper_arm_front",
        "right_upper_arm_inner",
        "right_elbow",
      ]),
    ).toEqual(["right_biceps_region", "right_upper_arm"]);

    expect(
      upgradeBodySelectionToPublicTargets(["right_forearm_outer"]),
    ).toEqual(["right_forearm_outer_region"]);
  });

  it("quote normalize only keeps public targets", () => {
    const next = normalizeQuoteBodyTargets([
      "right_elbow",
      "right_biceps_region",
      "right_upper_arm_front",
    ]);
    expect(next.every(isPublicSelectableBodyTarget)).toBe(true);
    expect(next).not.toContain("right_elbow");
    expect(next).not.toContain("right_upper_arm_front");
    // Elbow + bíceps → se normaliza a brazo superior (contiene bíceps)
    expect(next).toContain("right_upper_arm");
  });

  it("sleeve normalization still collapses contained arm regions", () => {
    const next = normalizeSelectedTargetIds([
      "right_biceps_region",
      "right_forearm_outer_region",
      "right_full_sleeve",
    ]);
    expect(next).toEqual(["right_full_sleeve"]);
  });

  it("full back normalization collapses upper/lower large", () => {
    const next = normalizeSelectedTargetIds([
      "upper_back_large",
      "lower_back_large",
      "full_back",
    ]);
    expect(next).toEqual(["full_back"]);
  });

  it("full leg normalization collapses thigh + lower leg", () => {
    const next = normalizeSelectedTargetIds([
      "right_thigh",
      "right_lower_leg",
      "right_full_leg",
    ]);
    expect(next).toEqual(["right_full_leg"]);
  });

  it("biceps panel has no atomic exact option", () => {
    const options = getPublicSelectionOptionsForAtomicZone(
      "right_upper_arm_front",
    );
    expect(options.some((o) => o.tier === "exact")).toBe(false);
    expect(options[0]?.targetId).toBe("right_biceps_region");
    expect(options.map((o) => o.targetId)).toContain("right_full_sleeve");
    expect(options.map((o) => o.targetId)).not.toContain("right_full_arm");
  });

  it("hides full_face from public whitelist by default", () => {
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("full_face")).toBe(false);
    expect(isPublicSelectableBodyTarget("full_face")).toBe(false);
  });

  it("faceSelectable=false → face_left is non-selectable", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(isNonSelectableSurfaceAtomic("face_left")).toBe(true);
    expect(getAtomicInteractionBehavior("face_left")).toBe(
      "non_selectable_surface",
    );
  });

  it("faceSelectable=false → face_right is non-selectable", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(isNonSelectableSurfaceAtomic("face_right")).toBe(true);
    expect(getAtomicInteractionBehavior("face_right")).toBe(
      "non_selectable_surface",
    );
  });

  it("face hover does not resolve to a public selectable target", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(getPrimaryPublicSelectionTarget("face_left")).toBeNull();
    expect(getPrimaryPublicSelectionTarget("face_right")).toBeNull();
    expect(resolvePublicHighlightAtomicIds("face_left", null)).toEqual([]);
    expect(resolvePublicHighlightAtomicIds("face_right", null)).toEqual([]);
    expect(getPublicSelectionOptionsForAtomicZone("face_left")).toEqual([]);
    expect(getPublicSelectionOptionsForAtomicZone("face_right")).toEqual([]);
  });

  it("face click cannot persist full_face", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(upgradeBodySelectionToPublicTargets(["full_face"])).toEqual([]);
    expect(normalizeQuoteBodyTargets(["full_face"])).toEqual([]);
  });

  it("face click cannot persist atomic face_left/face_right", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(upgradeBodySelectionToPublicTargets(["face_left"])).toEqual([]);
    expect(upgradeBodySelectionToPublicTargets(["face_right"])).toEqual([]);
    expect(
      normalizeQuoteBodyTargets(["face_left", "face_right"]),
    ).toEqual([]);
  });

  it("faceSelectable=true → face routes to full_face", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = true;
    expect(isNonSelectableSurfaceAtomic("face_left")).toBe(false);
    expect(getAtomicInteractionBehavior("face_left")).toBe(
      "public_selectable_route",
    );
    expect(getPrimaryPublicSelectionTarget("face_left")).toBe("full_face");
    expect(getPrimaryPublicSelectionTarget("face_right")).toBe("full_face");
    expect(isPublicSelectableBodyTarget("full_face")).toBe(true);
    const opts = getPublicSelectionOptionsForAtomicZone("face_left");
    expect(opts.map((o) => o.targetId)).toContain("full_face");
    expect(upgradeBodySelectionToPublicTargets(["face_left"])).toEqual([
      "full_face",
    ]);
  });

  it("all 81 atomic zones have defined interaction behavior", () => {
    const coverage = assertDefinedInteractionBehavior();
    expect(coverage.totalAtomics).toBe(81);
    expect(coverage.defined).toBe(81);
    expect(coverage.missing).toEqual([]);
    expect(
      coverage.byBehavior.non_selectable_surface +
        coverage.byBehavior.routing_only +
        coverage.byBehavior.public_selectable_route,
    ).toBe(81);
  });

  it("routing-only zones remain valid", () => {
    for (const id of [
      "right_elbow",
      "left_wrist",
      "right_knee",
      "left_ankle",
      "sternum",
      "sacrum",
      "left_ear",
      "right_ear",
    ]) {
      expect(isRoutingOnlyAtomicZone(id)).toBe(true);
      expect(getAtomicInteractionBehavior(id)).toBe("routing_only");
      expect(getPrimaryPublicSelectionTarget(id)).not.toBeNull();
    }
  });

  it("head public regions remain intact", () => {
    expect(getPrimaryPublicSelectionTarget("head_top")).toBe("head_top");
    expect(getPrimaryPublicSelectionTarget("head_left_side")).toBe(
      "head_left_region",
    );
    expect(getPrimaryPublicSelectionTarget("left_ear")).toBe(
      "head_left_region",
    );
    expect(getPrimaryPublicSelectionTarget("head_right_side")).toBe(
      "head_right_region",
    );
    expect(getPrimaryPublicSelectionTarget("right_ear")).toBe(
      "head_right_region",
    );
    expect(getPrimaryPublicSelectionTarget("head_back")).toBe("head_back");
    expect(resolveTargetToAtomicZoneIds("head_left_region")).toEqual([
      "head_left_side",
      "left_ear",
    ]);
    expect(resolveTargetToAtomicZoneIds("head_right_region")).toEqual([
      "head_right_side",
      "right_ear",
    ]);
  });

  it("public selectable targets remain unchanged except full_face hidden", () => {
    PUBLIC_PRODUCT_FLAGS.faceSelectable = false;
    expect(PUBLIC_SELECTABLE_BODY_TARGET_IDS.has("full_face")).toBe(false);
    expect(isPublicSelectableBodyTarget("full_face")).toBe(false);
    expect(isPublicSelectableBodyTarget("head_top")).toBe(true);
    expect(isPublicSelectableBodyTarget("head_left_region")).toBe(true);
    expect(isPublicSelectableBodyTarget("head_right_region")).toBe(true);
    expect(isPublicSelectableBodyTarget("head_back")).toBe(true);
    expect(isPublicSelectableBodyTarget("full_scalp")).toBe(true);
    expect(isPublicSelectableBodyTarget("full_neck")).toBe(true);
  });

  it("persisted targets are always public-selectable", () => {
    const sample = normalizeQuoteBodyTargets([
      "right_biceps_region",
      "full_face",
      "face_left",
      "upper_back_large",
    ]);
    expect(sample.every(isPublicSelectableBodyTarget)).toBe(true);
    expect(sample).not.toContain("full_face");
    expect(sample).not.toContain("face_left");
    expect(sample).toContain("right_biceps_region");
    expect(sample).toContain("upper_back_large");
  });
});
