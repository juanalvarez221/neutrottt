import { describe, expect, it } from "vitest";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { getSelectionOptionsForAtomicZone } from "@/widgets/body-3d/interaction/bodyInteractionResolver";
import {
  findContainingSelections,
  replaceContainingSelection,
} from "@/widgets/body-3d/ux/bodyContainedSelection";
import {
  getCameraFocusForAtomicZone,
  getFocusDistanceScale,
  MAX_FOCUS_DIST_SCALE,
  MIN_FOCUS_DIST_SCALE,
} from "@/widgets/body-3d/ux/bodyCameraFocus";
import {
  applySelectionChange,
  isControlledSelection,
  resolveControlledTargets,
} from "@/widgets/body-3d/ux/bodyControlledSelection";
import {
  buildBodySelectionSnapshot,
  getConceptualSelectionCount,
  serializeConceptualBodySelection,
} from "@/widgets/body-3d/ux/bodySelectionSerialization";
import { exactOptionShortLabel, splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";

const FRAMING = {
  distance: 2.4,
  target: [0, 0.95, 0] as [number, number, number],
};

describe("body UX helpers", () => {
  it("finds containing selection for forearm in full sleeve", () => {
    const contained = findContainingSelections("right_forearm_outer", [
      "right_full_sleeve",
    ]);
    expect(contained).toHaveLength(1);
    expect(contained[0]?.targetId).toBe("right_full_sleeve");
    expect(contained[0]?.label).toBe("Manga completa derecha");
  });

  it("replaces containing selection with anatomical region", () => {
    const next = replaceContainingSelection(
      ["right_full_sleeve", "left_ribs"],
      "right_full_sleeve",
      "right_forearm",
    );
    expect(next).toContain("right_forearm");
    expect(next).toContain("left_ribs");
    expect(next).not.toContain("right_full_sleeve");
  });

  it("splits zone label into region and detail", () => {
    const parts = splitZoneLabel("right_forearm_outer");
    expect(parts.region).toBe("Antebrazo derecho");
    expect(parts.detail).toBe("Cara externa");
  });

  it("uses natural short label for exact option", () => {
    expect(exactOptionShortLabel("right_forearm_outer")).toBe("Cara externa");
  });

  it("labels lower leg as espinilla / pantorrilla", () => {
    expect(getSelectionDisplayLabel("right_lower_leg_front")).toBe(
      "Espinilla derecha",
    );
    expect(getSelectionDisplayLabel("left_lower_leg_front")).toBe(
      "Espinilla izquierda",
    );
    expect(getSelectionDisplayLabel("right_lower_leg_back")).toBe(
      "Pantorrilla derecha",
    );
    expect(getSelectionDisplayLabel("left_lower_leg_back")).toBe(
      "Pantorrilla izquierda",
    );
    expect(getSelectionDisplayLabel("right_lower_leg_inner")).toBe(
      "Pierna derecha · Cara interna",
    );
    expect(getSelectionDisplayLabel("right_lower_leg_outer")).toBe(
      "Pierna derecha · Cara externa",
    );
  });

  it("returns subtle camera focus within global distance limits", () => {
    for (const id of [
      "right_ear",
      "right_wrist",
      "right_hand",
      "right_foot",
      "face_right",
      "left_ribs",
      "right_forearm_outer",
    ]) {
      const scale = getFocusDistanceScale(id, FRAMING);
      expect(scale).toBeGreaterThanOrEqual(MIN_FOCUS_DIST_SCALE);
      expect(scale).toBeLessThanOrEqual(MAX_FOCUS_DIST_SCALE);
    }
    const pose = getCameraFocusForAtomicZone("right_ear", FRAMING);
    expect(pose.position.distanceTo(pose.target)).toBeLessThan(FRAMING.distance);
  });

  it("serializes conceptual payload without expanding atomics", () => {
    const payload = serializeConceptualBodySelection([
      "right_full_sleeve",
      "left_ribs",
      "right_thigh_outer",
    ]);
    expect(payload).toEqual({
      selectedBodyTargets: [
        "right_full_sleeve",
        "left_ribs",
        "right_thigh_outer",
      ],
    });
    expect(getConceptualSelectionCount(payload.selectedBodyTargets)).toBe(3);

    const snap = buildBodySelectionSnapshot(payload.selectedBodyTargets);
    expect(snap.selectionCount).toBe(3);
    expect(snap.resolvedAtomicZoneIds.length).toBeGreaterThan(3);
    expect(snap.resolvedAtomicZoneIds).not.toContain("right_hand");
  });

  it("supports controlled selection helpers", () => {
    expect(isControlledSelection(undefined)).toBe(false);
    expect(isControlledSelection(["left_ribs"])).toBe(true);
    expect(resolveControlledTargets(["a"], ["b"])).toEqual(["a"]);
    expect(resolveControlledTargets(undefined, ["b"])).toEqual(["b"]);

    let internal = ["left_ribs"];
    applySelectionChange(["right_forearm"], {
      controlled: false,
      setInternal: (n) => {
        internal = n;
      },
    });
    expect(internal).toEqual(["right_forearm"]);

    let external: string[] = [];
    applySelectionChange(["right_full_sleeve"], {
      controlled: true,
      onChange: (n) => {
        external = n;
      },
      setInternal: () => {
        throw new Error("should not set internal when controlled");
      },
    });
    expect(external).toEqual(["right_full_sleeve"]);
  });

  it("peek options include exact and anatomical for forearm", () => {
    const options = getSelectionOptionsForAtomicZone("right_forearm_outer");
    expect(options.find((o) => o.tier === "exact")?.shortLabel).toBe(
      "Cara externa",
    );
    expect(options.find((o) => o.tier === "region")?.targetId).toBe(
      "right_forearm",
    );
    expect(options.some((o) => o.tier === "broad")).toBe(true);
  });
});
