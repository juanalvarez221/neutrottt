import { describe, expect, it, afterEach } from "vitest";
import { getSiteOrigin } from "./siteOrigin.server";

describe("getSiteOrigin", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;

    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;

    if (originalRenderExternalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
  });

  it("usa RENDER_EXTERNAL_URL cuando está disponible", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    process.env.RENDER_EXTERNAL_URL = "https://neutrott.onrender.com";

    expect(getSiteOrigin()).toBe("https://neutrott.onrender.com");
  });
});
