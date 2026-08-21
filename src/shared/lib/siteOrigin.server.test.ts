import { describe, expect, it, afterEach } from "vitest";
import { CANONICAL_SITE_URL, getSiteOrigin } from "./siteOrigin.server";

describe("getSiteOrigin", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;

    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;

    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;

    if (originalRenderExternalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
  });

  it("publica el dominio propio como origen canónico", () => {
    expect(CANONICAL_SITE_URL).toBe("https://neutrottt.com");
  });

  it("prefers NEXT_PUBLIC_SITE_URL and strips trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://neutrottt.com/";
    delete process.env.VERCEL_URL;
    delete process.env.RENDER_EXTERNAL_URL;

    expect(getSiteOrigin()).toBe("https://neutrottt.com");
  });

  it("uses canonical production alias when VERCEL_ENV is production", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "neutrott-abc.vercel.app";

    expect(getSiteOrigin()).toBe(CANONICAL_SITE_URL);
  });

  it("usa RENDER_EXTERNAL_URL cuando está disponible fuera de producción", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    process.env.RENDER_EXTERNAL_URL = "https://neutrott.onrender.com";

    expect(getSiteOrigin()).toBe("https://neutrott.onrender.com");
  });
});
