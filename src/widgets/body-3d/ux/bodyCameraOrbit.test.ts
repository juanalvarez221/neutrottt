import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  getCameraLookTarget,
  getCameraPositionForView,
} from "@/widgets/body-3d/cameraViewHelpers";
import { isCameraInPosteriorHemisphere } from "@/widgets/body-3d/domain/bodyModelCoordinateSystem";
import {
  isOrbitStepSettled,
  shortestAngleDelta,
  stepOrbitCamera,
} from "@/widgets/body-3d/ux/bodyCameraOrbit";

const FRAMING = {
  distance: 2.15,
  target: [0, 0.87, 0] as [number, number, number],
};

describe("shortestAngleDelta", () => {
  it("takes the short arc across the 180 wrap", () => {
    expect(shortestAngleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 8);
    expect(shortestAngleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 8);
    expect(shortestAngleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 8);
  });
});

describe("stepOrbitCamera front to back", () => {
  it("orbits around the body instead of passing through the look-at", () => {
    const look = getCameraLookTarget(FRAMING);
    const front = getCameraPositionForView("front", FRAMING);
    const back = getCameraPositionForView("back", FRAMING);
    const minRadius = FRAMING.distance * 0.55;

    let pos = front.clone();
    let currentLook = look.clone();
    const outPos = new Vector3();
    const outLook = new Vector3();

    for (let i = 0; i < 48; i += 1) {
      stepOrbitCamera(pos, currentLook, back, look, 0.18, outPos, outLook);
      expect(outPos.distanceTo(outLook)).toBeGreaterThan(minRadius);
      pos = outPos.clone();
      currentLook = outLook.clone();
    }

    expect(isCameraInPosteriorHemisphere(pos, look, 8)).toBe(true);
    expect(isOrbitStepSettled(pos, currentLook, back, look)).toBe(true);
  });

  it("linear lerp would collapse through the origin (regression contrast)", () => {
    const look = getCameraLookTarget(FRAMING);
    const front = getCameraPositionForView("front", FRAMING);
    const back = getCameraPositionForView("back", FRAMING);
    const mid = front.clone().lerp(back, 0.5);
    expect(mid.distanceTo(look)).toBeLessThan(0.05);
  });
});
