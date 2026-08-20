import { randomUUID } from "node:crypto";
import { clasificarCanal, dispositivoDesdeAncho, geoDesdeCabeceras } from "@/shared/lib/analitica/geo";
import { appendEventosBronce } from "@/shared/lib/analitica/almacenBronce.server";
import { esUserAgentBot, validarEventoCliente } from "@/shared/lib/analitica/validarEvento";
import type { EventoBronce } from "@/shared/lib/analitica/tipos";

const MAX_LOTE = 40;

export async function ingestarLoteEventos(
  raw: unknown,
  headers: Headers,
): Promise<{ aceptados: number; rechazados: number }> {
  if (esUserAgentBot(headers.get("user-agent"))) {
    return { aceptados: 0, rechazados: 0 };
  }

  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { eventos?: unknown }).eventos)
      ? (raw as { eventos: unknown[] }).eventos
      : [];

  const lote = list.slice(0, MAX_LOTE);
  const geo = geoDesdeCabeceras(headers);
  const hostSitio =
    headers.get("x-forwarded-host") || headers.get("host") || "";
  const ahora = new Date().toISOString();
  const aceptados: EventoBronce[] = [];
  let rechazados = 0;

  for (const item of lote) {
    const cliente = validarEventoCliente(item);
    if (!cliente) {
      rechazados += 1;
      continue;
    }
    const id = cliente.id_evento && cliente.id_evento.length > 8
      ? cliente.id_evento
      : randomUUID();
    aceptados.push({
      ...cliente,
      id_evento: id,
      dispositivo:
        cliente.dispositivo ?? dispositivoDesdeAncho(cliente.ancho_viewport),
      canal_trafico: clasificarCanal({
        referente: cliente.referente,
        utm_fuente: cliente.utm_fuente,
        utm_medio: cliente.utm_medio,
        hostSitio,
      }),
      pais: geo.pais,
      region: geo.region,
      ciudad: geo.ciudad,
      ingestado_en: ahora,
    });
  }

  if (aceptados.length > 0) {
    await appendEventosBronce(aceptados);
  }
  return { aceptados: aceptados.length, rechazados };
}
