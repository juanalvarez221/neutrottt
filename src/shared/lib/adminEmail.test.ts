import { describe, expect, it } from "vitest";
import { esCorreoValido, normalizarCorreo } from "@/shared/lib/adminEmail";

describe("esCorreoValido", () => {
  it("acepta correos reales y rechaza basura", () => {
    expect(esCorreoValido("samuel@neutrottt.com")).toBe(true);
    expect(esCorreoValido(" Samuel@Neutrottt.com ")).toBe(true);
    expect(esCorreoValido("juan@neutrottt.com")).toBe(true);
    expect(esCorreoValido("not-an-email")).toBe(false);
    expect(esCorreoValido("samuel@neutrottt.com@x")).toBe(false);
    expect(esCorreoValido("")).toBe(false);
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(normalizarCorreo(" Juan@Neutrottt.com ")).toBe("juan@neutrottt.com");
  });
});
