import { CANONICAL_SITE_URL } from "@/shared/lib/site";

export { CANONICAL_SITE_HOST, CANONICAL_SITE_URL, VERCEL_ALIAS_HOST } from "@/shared/lib/site";

export function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Producción publica el dominio propio, no el host efímero de un deploy.
  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_SITE_URL;
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
