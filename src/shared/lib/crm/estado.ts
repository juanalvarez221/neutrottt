import {
  ETIQUETAS_ESTADO,
  type EstadoPersona,
  type EventoCrm,
} from "@/shared/lib/crm/tipos";

const RANGO: Record<EstadoPersona, number> = {
  crudo: 0,
  prospecto: 1,
  cliente: 2,
};

/** El estado nunca baja. Crudo < prospecto < cliente. */
export function estadoObjetivo(evento: EventoCrm): EstadoPersona {
  if (evento === "captura") return "crudo";
  if (evento === "cotizacion_enviada" || evento === "asesoria_agendada") {
    return "prospecto";
  }
  return "cliente";
}

export function aplicarTransicion(
  actual: EstadoPersona,
  evento: EventoCrm,
): EstadoPersona {
  const siguiente = estadoObjetivo(evento);
  return RANGO[siguiente] > RANGO[actual] ? siguiente : actual;
}

export function etiquetaEstado(estado: EstadoPersona): string {
  return ETIQUETAS_ESTADO[estado];
}

export function normalizarEmail(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Solo dígitos, para cruzar +57 300 123 con 57300123. */
export function normalizarWhatsapp(value: string | undefined | null): string {
  return (value ?? "").replace(/\D/g, "");
}
