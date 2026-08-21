import { ADMIN_GATE_PATH } from "@/shared/config/adminGate";
import { TIPOS_EVENTO, type EventoCliente, type TipoEvento } from "@/shared/lib/analitica/tipos";

const MAX_TEXTO = 80;
const MAX_RUTA = 180;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recortar(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function esIso(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

const RUTAS_BLOQUEADAS = ["/admin", "/api", ADMIN_GATE_PATH];

export function rutaPublica(ruta: string): boolean {
  const path = (ruta.split("?")[0] ?? "/").toLowerCase();
  return !RUTAS_BLOQUEADAS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function validarEventoCliente(raw: unknown): EventoCliente | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const tipo = recortar(e.tipo_evento, 40) as TipoEvento;
  if (!TIPOS_EVENTO.includes(tipo)) return null;

  const id_sesion = recortar(e.id_sesion, 64);
  const id_visitante = recortar(e.id_visitante, 64);
  if (!UUID_RE.test(id_sesion) || !UUID_RE.test(id_visitante)) return null;

  const ocurrido_en = recortar(e.ocurrido_en, 40);
  if (!esIso(ocurrido_en)) return null;
  const age = Date.now() - Date.parse(ocurrido_en);
  if (age > 48 * 3_600_000 || age < -5 * 60_000) return null;

  let ruta = recortar(e.ruta, MAX_RUTA) || "/";
  if (!ruta.startsWith("/")) ruta = `/${ruta}`;
  if (!rutaPublica(ruta)) return null;

  const duracion = Number(e.duracion_ms);
  const duracion_ms =
    Number.isFinite(duracion) && duracion >= 0 && duracion <= 30 * 60_000
      ? Math.round(duracion)
      : undefined;

  const dispositivoRaw = recortar(e.dispositivo, 20);
  const dispositivo =
    dispositivoRaw === "movil" ||
    dispositivoRaw === "tablet" ||
    dispositivoRaw === "escritorio"
      ? dispositivoRaw
      : undefined;

  return {
    id_evento: recortar(e.id_evento, 64) || undefined,
    id_sesion,
    id_visitante,
    ocurrido_en,
    tipo_evento: tipo,
    ruta,
    seccion: recortar(e.seccion, MAX_TEXTO) || undefined,
    etiqueta: recortar(e.etiqueta, MAX_TEXTO) || undefined,
    valor: recortar(e.valor, MAX_TEXTO) || undefined,
    duracion_ms,
    idioma: recortar(e.idioma, 12) || undefined,
    dispositivo,
    ancho_viewport: Number.isFinite(Number(e.ancho_viewport))
      ? Math.round(Number(e.ancho_viewport))
      : undefined,
    alto_viewport: Number.isFinite(Number(e.alto_viewport))
      ? Math.round(Number(e.alto_viewport))
      : undefined,
    utm_fuente: recortar(e.utm_fuente, 40) || undefined,
    utm_medio: recortar(e.utm_medio, 40) || undefined,
    utm_campana: recortar(e.utm_campana, 60) || undefined,
    referente: recortar(e.referente, 180) || undefined,
  };
}

export function esUserAgentBot(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /bot|crawler|spider|preview|slurp|facebookexternalhit|whatsapp|telegram/i.test(
    ua,
  );
}
