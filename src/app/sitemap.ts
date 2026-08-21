import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";

const PUBLIC_PATHS = [
  "/",
  "/proyectos",
  "/contacto",
  "/cotizacion",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const lastModified = new Date();

  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? origin : `${origin}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
