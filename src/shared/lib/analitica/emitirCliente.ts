import type { EventoCliente, TipoEvento } from "@/shared/lib/analitica/tipos";

export const ANALITICA_EVENTO_DOM = "neutrott-analitica";

export type HechoAnaliticaCliente = Partial<EventoCliente> & {
  tipo_evento: TipoEvento;
};

/** Puente para widgets que no montan el colector (selector 3D, cotización). */
export function emitirHechoAnalitica(hecho: HechoAnaliticaCliente) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANALITICA_EVENTO_DOM, { detail: hecho }));
}
