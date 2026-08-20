import { hostFromUrl, hostsPermitidos, stripHostPort } from "@/shared/lib/siteHosts";

function requestHost(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host") || "";
  return stripHostPort(host);
}

/**
 * Bloquea POSTs cross-site. sendBeacon same-origin envía Origin.
 * Si Origin falta, rechaza solo cuando Sec-Fetch-Site dice cross-site.
 */
export function esPeticionDelSitio(request: Request): boolean {
  const headers = request.headers;
  const origin = headers.get("origin");
  const allowed = hostsPermitidos(requestHost(headers));

  if (origin) {
    const originHost = hostFromUrl(origin);
    return Boolean(originHost && allowed.has(originHost));
  }

  const fetchSite = headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  return true;
}
