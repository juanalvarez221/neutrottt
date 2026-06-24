import { describe, expect, it } from "vitest";
import { getBodyMapViewLabel } from "./bodyMapViewLabels";

describe("getBodyMapViewLabel", () => {
  it("explica que la vista frontal corresponde a la cara anterior", () => {
    expect(getBodyMapViewLabel("front", "es")).toBe("Vista frontal · cara anterior");
  });

  it("explica que la vista posterior corresponde a la cara posterior", () => {
    expect(getBodyMapViewLabel("back", "es")).toBe("Vista posterior · cara posterior");
  });
});
