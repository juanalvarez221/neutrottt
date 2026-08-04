/** Canonical public origin for Neutrottt on Vercel. */
export const CANONICAL_SITE_URL = "https://neutrott.vercel.app";

export function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Stable production alias beats ephemeral *.vercel.app deployment hosts.
  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_SITE_URL;
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
