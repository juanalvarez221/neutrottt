import { describe, expect, it } from "vitest";
import { esCorreoAdmin } from "@/shared/lib/adminEmail";

describe("esCorreoAdmin", () => {
  it("solo admite correos @neutrottt.com", () => {
    expect(esCorreoAdmin("samuel@neutrottt.com")).toBe(true);
    expect(esCorreoAdmin(" Samuel@Neutrottt.com ")).toBe(true);
    expect(esCorreoAdmin("samuel@gmail.com")).toBe(false);
    expect(esCorreoAdmin("samuel@neutrottt.com.evil.com")).toBe(false);
    expect(esCorreoAdmin("samuel@neutrottt.com@x")).toBe(false);
  });
});
