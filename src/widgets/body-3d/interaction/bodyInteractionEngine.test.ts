import { describe, expect, it } from "vitest";
import {
  isFullSleeveExcludingHand,
  resolveTargetToAtomicZoneIds,
  resolveTargetsToAtomicZoneIds,
} from "@/widgets/body-3d/domain/bodySelectionTargets";
import { validateBodyZoneDomain } from "@/widgets/body-3d/domain/bodyZones";
import {
  getSelectionDisplayLabel,
  interactionMeshNameToAtomicId,
} from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { getSelectionOptionsForAtomicZone } from "@/widgets/body-3d/interaction/bodyInteractionResolver";
import {
  addSelectionTarget,
  clearSelectionTargets,
  normalizeSelectedTargetIds,
  removeSelectionTarget,
  resolveSelectedAtomicZoneIds,
} from "@/widgets/body-3d/interaction/bodySelectionEngine";

describe("body interaction domain", () => {
  it("keeps 81-zone domain valid", () => {
    const v = validateBodyZoneDomain();
    expect(v.ok).toBe(true);
    expect(v.totalAtomic).toBe(81);
  });

  it("maps mesh name → atomic ID", () => {
    expect(interactionMeshNameToAtomicId("zone_right_forearm_outer")).toBe(
      "right_forearm_outer",
    );
    expect(interactionMeshNameToAtomicId("zone_left_chest.001")).toBe(
      "left_chest",
    );
    expect(interactionMeshNameToAtomicId("Human")).toBeNull();
  });

  it("labels forearm outer professionally", () => {
    expect(getSelectionDisplayLabel("right_forearm_outer")).toBe(
      "Antebrazo derecho · Cara externa",
    );
  });

  it("resolves contextual options for right_forearm_outer", () => {
    const options = getSelectionOptionsForAtomicZone("right_forearm_outer");
    const ids = options.map((o) => o.targetId);
    expect(ids[0]).toBe("right_forearm_outer");
    expect(ids).toContain("right_forearm");
    expect(ids).toContain("right_lower_half_sleeve");
    expect(ids).toContain("right_full_sleeve");
    expect(ids).toContain("right_full_arm");
  });

  it("resolves contextual options for left_chest", () => {
    const ids = getSelectionOptionsForAtomicZone("left_chest").map(
      (o) => o.targetId,
    );
    expect(ids[0]).toBe("left_chest");
    expect(ids).toContain("full_chest");
    expect(ids).toContain("front_torso");
  });

  it("resolves contextual options for right_thigh_outer", () => {
    const ids = getSelectionOptionsForAtomicZone("right_thigh_outer").map(
      (o) => o.targetId,
    );
    expect(ids[0]).toBe("right_thigh_outer");
    expect(ids).toContain("right_thigh");
    expect(ids).toContain("right_full_leg");
  });

  it("full sleeve excludes hand", () => {
    const atomics = resolveTargetToAtomicZoneIds("right_full_sleeve");
    expect(atomics).toContain("right_wrist");
    expect(atomics).not.toContain("right_hand");
    expect(isFullSleeveExcludingHand("right_full_sleeve")).toBe(true);
  });

  it("parent forearm expands to four faces", () => {
    expect(resolveTargetToAtomicZoneIds("right_forearm")).toEqual([
      "right_forearm_back",
      "right_forearm_front",
      "right_forearm_inner",
      "right_forearm_outer",
    ]);
  });

  it("full_chest expands to chest + sternum", () => {
    expect(resolveTargetToAtomicZoneIds("full_chest")).toEqual([
      "left_chest",
      "right_chest",
      "sternum",
    ]);
  });

  it("unions multiple targets without duplicate atomics", () => {
    const union = resolveTargetsToAtomicZoneIds([
      "right_full_sleeve",
      "left_ribs",
      "right_thigh_outer",
    ]);
    expect(new Set(union).size).toBe(union.length);
    expect(union).toContain("right_forearm_outer");
    expect(union).toContain("left_ribs");
    expect(union).toContain("right_thigh_outer");
    expect(union).not.toContain("right_hand");
  });

  it("normalizes containment: atomics absorbed by parent", () => {
    const next = normalizeSelectedTargetIds([
      "right_forearm_outer",
      "right_forearm_inner",
      "right_forearm",
    ]);
    expect(next).toEqual(["right_forearm"]);
  });

  it("does not add atomic already covered by sleeve", () => {
    const next = addSelectionTarget(
      ["right_full_sleeve"],
      "right_forearm_outer",
    );
    expect(next).toEqual(["right_full_sleeve"]);
  });

  it("keeps partial overlap selections", () => {
    const next = normalizeSelectedTargetIds([
      "right_upper_half_sleeve",
      "right_lower_half_sleeve",
    ]);
    expect(next).toContain("right_upper_half_sleeve");
    expect(next).toContain("right_lower_half_sleeve");
  });

  it("removes and clears selection", () => {
    let ids = addSelectionTarget([], "full_chest");
    ids = addSelectionTarget(ids, "left_ribs");
    ids = removeSelectionTarget(ids, "full_chest");
    expect(ids).toEqual(["left_ribs"]);
    expect(clearSelectionTargets()).toEqual([]);
    expect(resolveSelectedAtomicZoneIds(["full_chest"])).toEqual([
      "left_chest",
      "right_chest",
      "sternum",
    ]);
  });
});
