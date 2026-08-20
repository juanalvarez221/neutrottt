import { etiquetaDeRuta } from "@/shared/lib/analitica/catalogo";
import type { EventoBronce, TipoEvento } from "@/shared/lib/analitica/tipos";

const TIPOS_PASO: ReadonlySet<TipoEvento> = new Set([
  "vista_pagina",
  "interaccion",
  "seccion_visible",
  "zona_corporal",
  "paso_cotizacion",
  "salida_pagina",
]);

export type PasoNavegacion = {
  ocurrido_en: string;
  tipo_evento: TipoEvento;
  ruta: string;
  etiqueta_ruta: string;
  etiqueta?: string;
  valor?: string;
};

export type RecorridoVisitante = {
  id_visitante: string;
  persona_id: string | null;
  persona_nombre: string | null;
  sesiones: number;
  vistas: number;
  duracion_ms: number;
  dispositivo: string;
  pais: string;
  ciudad: string;
  primero_en: string;
  ultimo_en: string;
  rutas: string[];
  pasos: PasoNavegacion[];
};

export function construirNavegacionVisitantes(
  eventos: readonly EventoBronce[],
  personas: ReadonlyArray<{ id: string; nombre: string; id_visitante?: string | null }> = [],
  limite = 40,
): RecorridoVisitante[] {
  const byVisitor = new Map<string, EventoBronce[]>();
  for (const e of eventos) {
    if (!e.id_visitante) continue;
    const list = byVisitor.get(e.id_visitante) ?? [];
    list.push(e);
    byVisitor.set(e.id_visitante, list);
  }

  const personaPorVisitante = new Map<string, { id: string; nombre: string }>();
  for (const persona of personas) {
    const vid = persona.id_visitante?.trim();
    if (!vid) continue;
    personaPorVisitante.set(vid, { id: persona.id, nombre: persona.nombre });
  }

  const out: RecorridoVisitante[] = [];
  for (const [id_visitante, list] of byVisitor) {
    const ordered = [...list].sort(
      (a, b) => Date.parse(a.ocurrido_en) - Date.parse(b.ocurrido_en),
    );
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    const pasos = ordered
      .filter((e) => TIPOS_PASO.has(e.tipo_evento))
      .map((e) => ({
        ocurrido_en: e.ocurrido_en,
        tipo_evento: e.tipo_evento,
        ruta: e.ruta,
        etiqueta_ruta: etiquetaDeRuta(e.ruta),
        etiqueta: e.etiqueta,
        valor: e.valor,
      }))
      .slice(-48);
    const rutas = [
      ...new Set(
        ordered
          .filter((e) => e.tipo_evento === "vista_pagina")
          .map((e) => (e.ruta.split("?")[0] ?? e.ruta)),
      ),
    ];
    const duracion_ms = ordered.reduce((sum, e) => {
      if (e.tipo_evento === "permanencia" || e.tipo_evento === "salida_pagina") {
        return sum + (e.duracion_ms ?? 0);
      }
      return sum;
    }, 0);
    const persona = personaPorVisitante.get(id_visitante);
    const sesiones = new Set(ordered.map((e) => e.id_sesion)).size;
    out.push({
      id_visitante,
      persona_id: persona?.id ?? null,
      persona_nombre: persona?.nombre ?? null,
      sesiones,
      vistas: ordered.filter((e) => e.tipo_evento === "vista_pagina").length,
      duracion_ms,
      dispositivo: first.dispositivo,
      pais: first.pais,
      ciudad: first.ciudad,
      primero_en: first.ocurrido_en,
      ultimo_en: last.ocurrido_en,
      rutas,
      pasos,
    });
  }

  return out
    .sort((a, b) => Date.parse(b.ultimo_en) - Date.parse(a.ultimo_en))
    .slice(0, limite);
}
