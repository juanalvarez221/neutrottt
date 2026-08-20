import { describe, expect, it } from "vitest";
import { clientIp } from "@/shared/lib/security/clientIp";
import { checkRateLimit } from "@/shared/lib/security/rateLimit.server";
import { esPeticionDelSitio } from "@/shared/lib/security/sameOrigin";

describe("clientIp", () => {
  it("usa la primera IP de x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "181.49.10.22, 10.0.0.1",
    });
    expect(clientIp(headers)).toBe("181.49.10.22");
  });
});

describe("esPeticionDelSitio", () => {
  it("acepta el dominio propio y el alias de Vercel", () => {
    const custom = new Request("https://neutrottt.com/api/quote-requests", {
      method: "POST",
      headers: {
        origin: "https://neutrottt.com",
        host: "neutrottt.com",
      },
    });
    expect(esPeticionDelSitio(custom)).toBe(true);

    const alias = new Request("https://neutrott.vercel.app/api/quote-requests", {
      method: "POST",
      headers: {
        origin: "https://neutrottt.com",
        host: "neutrott.vercel.app",
      },
    });
    expect(esPeticionDelSitio(alias)).toBe(true);
  });

  it("acepta Origin del mismo host", () => {
    const request = new Request("https://neutrott.vercel.app/api/quote-requests", {
      method: "POST",
      headers: {
        origin: "https://neutrott.vercel.app",
        host: "neutrott.vercel.app",
      },
    });
    expect(esPeticionDelSitio(request)).toBe(true);
  });

  it("rechaza un Origin cruzado", () => {
    const request = new Request("https://neutrott.vercel.app/api/quote-requests", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "neutrott.vercel.app",
      },
    });
    expect(esPeticionDelSitio(request)).toBe(false);
  });

  it("rechaza Sec-Fetch-Site cross-site si no hay Origin", () => {
    const request = new Request("https://neutrott.vercel.app/api/analitica/eventos", {
      method: "POST",
      headers: {
        host: "neutrott.vercel.app",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(esPeticionDelSitio(request)).toBe(false);
  });
});

describe("checkRateLimit", () => {
  it("deja pasar hasta el tope y luego corta", async () => {
    const subject = `test-${Date.now()}-${Math.random()}`;
    const ok1 = await checkRateLimit({
      bucket: "unit",
      subject,
      limit: 2,
      windowSeconds: 60,
    });
    const ok2 = await checkRateLimit({
      bucket: "unit",
      subject,
      limit: 2,
      windowSeconds: 60,
    });
    const blocked = await checkRateLimit({
      bucket: "unit",
      subject,
      limit: 2,
      windowSeconds: 60,
    });
    expect(ok1.ok).toBe(true);
    expect(ok2.ok).toBe(true);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
