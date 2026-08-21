import { describe, expect, it } from "vitest";
import {
  ADMIN_GATE_PATH,
  ADMIN_HOME_PATH,
  isAdminGatePath,
  isStaffUiPath,
  sanitizeAdminNext,
} from "./adminGate";

describe("admin gate", () => {
  it("usa un código opaco, no un nombre adivinable", () => {
    expect(ADMIN_GATE_PATH).toMatch(/^\/[a-z0-9]{8,16}$/);
    expect(ADMIN_GATE_PATH).not.toContain("login");
    expect(ADMIN_GATE_PATH).not.toContain("admin");
    expect(ADMIN_GATE_PATH).not.toContain("acceso");
    expect(ADMIN_GATE_PATH).not.toContain("cuarto");
  });

  it("reconoce la entrada y el panel", () => {
    expect(isAdminGatePath(ADMIN_GATE_PATH)).toBe(true);
    expect(isStaffUiPath("/admin/cotizaciones")).toBe(true);
    expect(isStaffUiPath("/cotizacion")).toBe(false);
  });

  it("solo reenvía next hacia el panel", () => {
    expect(sanitizeAdminNext(null)).toBe(ADMIN_HOME_PATH);
    expect(sanitizeAdminNext("/admin/asesorias")).toBe("/admin/asesorias");
    expect(sanitizeAdminNext("/admin/login")).toBe(ADMIN_HOME_PATH);
    expect(sanitizeAdminNext(ADMIN_GATE_PATH)).toBe(ADMIN_HOME_PATH);
    expect(sanitizeAdminNext("https://evil.example")).toBe(ADMIN_HOME_PATH);
  });
});
