import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/shared/lib/adminPassword";

describe("adminPassword", () => {
  it("acepta la clave correcta y rechaza otra", async () => {
    const stored = await hashPassword("ClaveDePrueba2026");
    expect(await verifyPassword("ClaveDePrueba2026", stored)).toBe(true);
    expect(await verifyPassword("otra", stored)).toBe(false);
    expect(stored.startsWith("scrypt:")).toBe(true);
  });
});
