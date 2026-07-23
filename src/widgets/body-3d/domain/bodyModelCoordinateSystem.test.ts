import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  MODEL_BACK,
  MODEL_FORWARD,
  MODEL_LEFT,
  MODEL_RIGHT,
  auditRuntimeOrientation,
  cameraDirectionForCanonicalView,
  isCameraInAnteriorHemisphere,
  isCameraInHemisphere,
  isCameraInPosteriorHemisphere,
  resolveCanonicalAzimuth,
  viewHemisphereScore,
} from "@/widgets/body-3d/domain/bodyModelCoordinateSystem";
import {
  axisForCardinalView,
  getCameraPositionForView,
} from "@/widgets/body-3d/cameraViewHelpers";
import {
  getCameraPoseForPreferredView,
  getCameraPoseForPublicTarget,
  getPreferredBodyView,
  preferredViewToCanonical,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";

const FRAMING = {
  distance: 2.15,
  target: [0, 0.87, 0] as [number, number, number],
};

describe("bodyModelCoordinateSystem contract", () => {
  it("defines +Z forward and +X anatomical left", () => {
    expect(MODEL_FORWARD.toArray()).toEqual([0, 0, 1]);
    expect(MODEL_BACK.toArray()).toEqual([0, 0, -1]);
    expect(MODEL_LEFT.toArray()).toEqual([1, 0, 0]);
    expect(MODEL_RIGHT.toArray()).toEqual([-1, 0, 0]);
  });

  it("canonical azimuths place camera on the correct axes", () => {
    const front = cameraDirectionForCanonicalView("FRONT");
    const back = cameraDirectionForCanonicalView("BACK");
    const left = cameraDirectionForCanonicalView("LEFT");
    const right = cameraDirectionForCanonicalView("RIGHT");
    expect(front.dot(MODEL_FORWARD)).toBeGreaterThan(0.99);
    expect(back.dot(MODEL_BACK)).toBeGreaterThan(0.99);
    expect(left.dot(MODEL_LEFT)).toBeGreaterThan(0.99);
    expect(right.dot(MODEL_RIGHT)).toBeGreaterThan(0.99);
  });

  it("audits runtime landmarks against the contract", () => {
    const audit = auditRuntimeOrientation({
      frontSample: new Vector3(0, 1.3, 0.08),
      backSample: new Vector3(0, 1.3, -0.18),
      leftSample: new Vector3(0.12, 1.3, 0),
      rightSample: new Vector3(-0.12, 1.3, 0),
    });
    expect(audit.matchesContract).toBe(true);
    expect(audit.forwardDot).toBeGreaterThan(0.95);
    expect(audit.leftDot).toBeGreaterThan(0.95);
  });
});

describe("canonical camera poses", () => {
  it("front/back/left/right land in the correct hemispheres (±5°)", () => {
    for (const view of ["front", "back", "left", "right"] as const) {
      const pos = getCameraPositionForView(view, FRAMING);
      const target = new Vector3(...FRAMING.target);
      const axis = axisForCardinalView(view);
      expect(
        isCameraInHemisphere(pos, target, axis, 5),
        `${view} not within ±5° of canonical`,
      ).toBe(true);
    }
  });

  it("preferredView back ends in real posterior hemisphere", () => {
    const pose = getCameraPoseForPreferredView("back", FRAMING, "torso", "wide");
    expect(
      isCameraInPosteriorHemisphere(pose.position, pose.target, 5),
    ).toBe(true);
    expect(
      isCameraInAnteriorHemisphere(pose.position, pose.target, 90),
    ).toBe(false);
  });

  it("diagonal preferred views stay in the correct quadrant", () => {
    const cases = [
      ["front-right", MODEL_FORWARD, MODEL_RIGHT],
      ["front-left", MODEL_FORWARD, MODEL_LEFT],
      ["back-right", MODEL_BACK, MODEL_RIGHT],
      ["back-left", MODEL_BACK, MODEL_LEFT],
    ] as const;
    for (const [view, primary, secondary] of cases) {
      const pose = getCameraPoseForPreferredView(view, FRAMING, "arms", "medium");
      expect(viewHemisphereScore(pose.position, pose.target, primary)).toBeGreaterThan(
        0.2,
      );
      expect(
        viewHemisphereScore(pose.position, pose.target, secondary),
      ).toBeGreaterThan(0.2);
    }
  });
});

describe("regression: public target camera orientation", () => {
  const cases: Array<[string, "back" | "front" | "left" | "right" | "front-right" | "back-right"]> = [
    ["upper_back_large", "back"],
    ["full_back", "back"],
    ["full_chest", "front"],
    ["right_biceps_region", "front-right"],
    ["right_triceps_region", "back-right"],
    ["left_lower_leg_back", "back"],
    ["head_left_region", "left"],
  ];

  for (const [targetId, expected] of cases) {
    it(`${targetId} → preferred ${expected} and correct hemisphere`, () => {
      expect(getPreferredBodyView(targetId)).toBe(expected);
      const pose = getCameraPoseForPublicTarget(targetId, FRAMING);
      const canonical = preferredViewToCanonical(expected);
      const dir = cameraDirectionForCanonicalView(canonical);
      const score = viewHemisphereScore(pose.position, pose.target, dir);
      // Canonical within ±5° ⇒ cos(5°)≈0.996; allow focus elev noise → 0.95
      expect(score, `${targetId} score=${score}`).toBeGreaterThan(0.95);
      if (expected === "back" || expected.startsWith("back")) {
        // Diagonales back-* están exactamente a 45° del eje BACK canónico.
        expect(
          isCameraInPosteriorHemisphere(pose.position, pose.target, 46),
        ).toBe(true);
      }
      if (expected === "front" || expected.startsWith("front")) {
        expect(
          isCameraInAnteriorHemisphere(pose.position, pose.target, 46),
        ).toBe(true);
      }
    });
  }

  it("azimuth for BACK is π (camera at −Z)", () => {
    expect(Math.abs(resolveCanonicalAzimuth("BACK") - Math.PI)).toBeLessThan(
      1e-9,
    );
  });
});
