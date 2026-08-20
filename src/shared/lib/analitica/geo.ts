import { nombrePais } from "@/shared/lib/analitica/catalogo";
import type { CanalTrafico, TipoDispositivo } from "@/shared/lib/analitica/tipos";

export type GeoConexion = {
  pais: string;
  region: string;
  ciudad: string;
};

export function geoDesdeCabeceras(headers: Headers): GeoConexion {
  const paisIso =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    "";
  const region =
    headers.get("x-vercel-ip-country-region") ||
    headers.get("x-vercel-ip-region") ||
    "";
  const ciudad = headers.get("x-vercel-ip-city") || "";
  const pais = nombrePais(decodeURIComponent(paisIso || "XX"));
  return {
    pais,
    region: decodeURIComponent(region || "—"),
    ciudad: decodeURIComponent(ciudad || "—"),
  };
}

export function clasificarCanal(input: {
  referente?: string | null;
  utm_fuente?: string | null;
  utm_medio?: string | null;
  hostSitio?: string | null;
}): CanalTrafico {
  const fuente = (input.utm_fuente ?? "").toLowerCase();
  const medio = (input.utm_medio ?? "").toLowerCase();
  const blob = `${fuente} ${medio}`;
  if (blob.includes("instagram") || blob.includes("ig")) return "instagram";
  if (blob.includes("whatsapp") || blob.includes("wa")) return "whatsapp";
  if (blob.includes("google") || medio === "cpc" || medio === "organic") {
    return "google";
  }
  if (blob.includes("tiktok")) return "tiktok";

  const ref = (input.referente ?? "").toLowerCase();
  if (!ref) return "directo";
  try {
    const url = ref.startsWith("http") ? new URL(ref) : new URL(`https://${ref}`);
    const host = url.hostname.replace(/^www\./, "");
    const propio = (input.hostSitio ?? "").replace(/^www\./, "").toLowerCase();
    if (propio && (host === propio || host.endsWith(`.${propio}`))) return "interno";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("whatsapp") || host.includes("wa.me")) return "whatsapp";
    if (host.includes("google") || host.includes("bing")) return "google";
    if (host.includes("tiktok")) return "tiktok";
    return "referencia";
  } catch {
    return "directo";
  }
}

export function dispositivoDesdeAncho(ancho?: number): TipoDispositivo {
  if (!ancho || !Number.isFinite(ancho)) return "desconocido";
  if (ancho < 768) return "movil";
  if (ancho < 1024) return "tablet";
  return "escritorio";
}
