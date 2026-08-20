import { describe, expect, it } from "vitest";
import {
  SESSION_PRICE_CONSECUTIVE_DAYS,
  SESSION_PRICE_SEPARATE_DAYS,
  buildQuoteSessionEstimate,
  defaultSessionCountFromEstimate,
} from "@/shared/lib/quoteSessionPricing";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

describe("quote session pricing", () => {
  it("charges 1.200.000 on consecutive days and 1.500.000 on separate days", () => {
    expect(SESSION_PRICE_CONSECUTIVE_DAYS).toBe(1_200_000);
    expect(SESSION_PRICE_SEPARATE_DAYS).toBe(1_500_000);
    expect(SESSION_PRICE_CONSECUTIVE_DAYS).toBeLessThan(
      SESSION_PRICE_SEPARATE_DAYS,
    );
  });

  it("formats medium-piece estimates from the official per-session rates", () => {
    const estimate = buildQuoteSessionEstimate("mediano", "es");
    expect(estimate.minSessions).toBe(2);
    expect(estimate.maxSessions).toBe(4);
    expect(digits(estimate.consecutivePerSession)).toBe("1200000");
    expect(digits(estimate.separatePerSession)).toBe("1500000");
    expect(digits(estimate.consecutiveTotal)).toBe("24000004800000");
    expect(digits(estimate.separateTotal)).toBe("30000006000000");
  });

  it("toma el punto medio del rango de sesiones orientativo", () => {
    expect(defaultSessionCountFromEstimate("2 a 4 sesiones")).toBe(3);
    expect(defaultSessionCountFromEstimate("5 sesiones")).toBe(5);
  });
});
