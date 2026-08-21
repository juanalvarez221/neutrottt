import {
  CANONICAL_SITE_HOST,
  VERCEL_ALIAS_HOST,
  WWW_SITE_HOST,
} from "@/shared/lib/site";

/** Hosts públicos de producción. El Origin del POST debe coincidir con uno. */
export const PRODUCTION_HOSTS = [
  CANONICAL_SITE_HOST,
  WWW_SITE_HOST,
  VERCEL_ALIAS_HOST,
] as const;

export function stripHostPort(host: string): string {
  return host.replace(/:\d+$/, "").toLowerCase();
}

export function hostFromUrl(value: string): string | null {
  try {
    return stripHostPort(new URL(value).host);
  } catch {
    return null;
  }
}

export function hostsPermitidos(requestHost: string): Set<string> {
  const allowed = new Set<string>();
  const current = stripHostPort(requestHost);
  if (current) allowed.add(current);
  for (const host of PRODUCTION_HOSTS) allowed.add(host);

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    const siteHost = hostFromUrl(site);
    if (siteHost) allowed.add(siteHost);
  }
  return allowed;
}
