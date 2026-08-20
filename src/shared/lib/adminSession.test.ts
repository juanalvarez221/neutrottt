import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/shared/lib/adminSession";

const SECRET = "test-admin-session-secret-32chars!!";

describe("adminSession", () => {
  it("firma y verifica un token nominado", async () => {
    const token = await signSessionToken(SECRET, "samuel@neutrottt.com");
    expect(await verifySessionToken(SECRET, token)).toBe(true);
  });

  it("rechaza un valor que no es correo", async () => {
    await expect(signSessionToken(SECRET, "no-es-correo")).rejects.toThrow();
  });

  it("rechaza token sin firma válida", async () => {
    const token = await signSessionToken(SECRET, "samuel@neutrottt.com");
    expect(await verifySessionToken(SECRET, `${token}x`)).toBe(false);
    expect(await verifySessionToken(SECRET, "")).toBe(false);
    expect(await verifySessionToken("", token)).toBe(false);
  });
});
