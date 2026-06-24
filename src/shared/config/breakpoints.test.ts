import { describe, expect, it } from "vitest";
import { BREAKPOINTS } from "./breakpoints";

describe("breakpoints", () => {
  it("mantiene orden ascendente para auditorias responsive", () => {
    const values = Object.values(BREAKPOINTS);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });
});
