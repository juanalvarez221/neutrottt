import { describe, expect, it } from "vitest";
import { getBodyMapGuideKeys } from "./bodyMapGuidance";

describe("getBodyMapGuideKeys", () => {
  it("devuelve una guía específica para la selección de brazo", () => {
    expect(getBodyMapGuideKeys("brazo", "front")).toEqual({
      titleKey: "quoteBodyMapGuideArmTitle",
      hintKey: "quoteBodyMapGuideArmFrontHint",
    });
  });

  it("devuelve una guía simple para zonas sin refinamiento anatómico", () => {
    expect(getBodyMapGuideKeys("pecho", "front")).toEqual({
      titleKey: "quoteBodyMapGuideSimpleTitle",
      hintKey: "quoteBodyMapGuideSimpleHint",
    });
  });
});
