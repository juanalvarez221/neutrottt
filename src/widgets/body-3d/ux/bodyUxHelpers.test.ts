import { describe, expect, it } from "vitest";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { findContainingSelections } from "@/widgets/body-3d/ux/bodyContainedSelection";
import { getCameraFocusForAtomicZone } from "@/widgets/body-3d/ux/bodyCameraFocus";
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

  it("splits zone label into region and detail", () => {
    const parts = splitZoneLabel("right_forearm_outer");
    expect(parts.region).toBe("Antebrazo derecho");
    expect(parts.detail).toBe("Cara externa");
  });

  it("uses natural short label for exact option", () => {
    expect(exactOptionShortLabel("right_forearm_outer")).toBe("Cara externa");
  });

  it("labels lower leg back as pantorrilla", () => {
    expect(getSelectionDisplayLabel("right_lower_leg_back")).toBe(
      "Pantorrilla derecha · Parte posterior",
    );
    expect(getSelectionDisplayLabel("right_lower_leg_front")).toBe(
      "Pierna derecha · Parte frontal",
    );
  });

  it("returns subtle camera focus for small zone (ear)", () => {
    const pose = getCameraFocusForAtomicZone("right_ear", FRAMING);
    expect(pose.position.y).toBeGreaterThan(pose.target.y);
    expect(pose.position.distanceTo(pose.target)).toBeLessThan(FRAMING.distance);
  });
});
