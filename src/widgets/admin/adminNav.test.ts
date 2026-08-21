import { describe, expect, it } from "vitest";
import { isAdminNavActive } from "@/widgets/admin/adminNav";

describe("isAdminNavActive", () => {
  it("marca Inicio solo en la raíz del admin", () => {
    expect(isAdminNavActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavActive("/admin/cotizaciones", "/admin")).toBe(false);
  });

  it("incluye el detalle de una cotización en Cotizaciones", () => {
    expect(isAdminNavActive("/admin/cotizaciones/SQ-1", "/admin/cotizaciones")).toBe(true);
    expect(isAdminNavActive("/admin/analitica", "/admin/cotizaciones")).toBe(false);
  });
});
