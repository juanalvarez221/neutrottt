import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import {
  computeFitFramingFromBox,
  verticalFillForViewport,
} from "@/widgets/body-3d/ux/bodyFitFraming";

describe("bodyFitFraming", () => {
  it("computes framing that fills the viewport vertically", () => {
    const box = new Box3(
      new Vector3(-0.25, -0.87, -0.15),
      new Vector3(0.25, 0.87, 0.15),
    );
    const framing = computeFitFramingFromBox(box, {
      fovDeg: 42,
      aspect: 16 / 9,
      verticalFill: 0.78,
    });
    expect(framing).not.toBeNull();
    expect(framing!.distance).toBeGreaterThan(1.2);
    expect(framing!.target[1]).toBeCloseTo(1.74 * 0.01, 2);
    expect(framing!.minDistance).toBeLessThan(framing!.distance);
    expect(framing!.maxDistance).toBeGreaterThan(framing!.distance);
  });

  it("returns null for empty boxes", () => {
    expect(
      computeFitFramingFromBox(new Box3(), {
        fovDeg: 42,
        aspect: 1,
        verticalFill: 0.75,
      }),
    ).toBeNull();
  });

  it("picks denser fill on wide desktops", () => {
    expect(verticalFillForViewport(1440)).toBe(0.8);
    expect(verticalFillForViewport(1280)).toBe(0.79);
    expect(verticalFillForViewport(800)).toBe(0.76);
    expect(verticalFillForViewport(390)).toBe(0.75);
  });
});
