function stripPort(host: string): string {
  return host.replace(/:\d+$/, "").toLowerCase();
}

function hostFromUrl(value: string): string | null {
  try {
    return stripPort(new URL(value).host);
  } catch {
    return null;
  }
}

function requestHost(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host") || "";
  return stripPort(host);
}

/**
 * Bloquea POSTs cross-site. sendBeacon same-origin envía Origin.
 * Si Origin falta, rechaza solo cuando Sec-Fetch-Site dice cross-site.
 */
export function esPeticionDelSitio(request: Request): boolean {
  const headers = request.headers;
  const origin = headers.get("origin");
  const host = requestHost(headers);
  const allowed = new Set<string>();
  if (host) allowed.add(host);

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    const siteHost = hostFromUrl(site);
    if (siteHost) allowed.add(siteHost);
  }
  allowed.add("neutrott.vercel.app");

  if (origin) {
    const originHost = hostFromUrl(origin);
    return Boolean(originHost && allowed.has(originHost));
  }

  const fetchSite = headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  return true;
}
