import { describe, expect, it } from "vitest";
import { confirmationMatches, isPurgeCategory } from "@/shared/lib/admin/purgeCategories";

describe("purge confirmation", () => {
  it("exige la frase exacta, sin espacios de más", () => {
    expect(confirmationMatches("analitica", "VACIAR METRICAS")).toBe(true);
    expect(confirmationMatches("analitica", " VACIAR METRICAS ")).toBe(true);
    expect(confirmationMatches("analitica", "vaciar metricas")).toBe(false);
    expect(confirmationMatches("cotizaciones", "VACIAR METRICAS")).toBe(false);
  });

  it("solo acepta categorías conocidas", () => {
    expect(isPurgeCategory("recorridos")).toBe(true);
    expect(isPurgeCategory("admins")).toBe(false);
  });
});
