/**
 * Mapeo interno de estados de cotización.
 * Los textos visibles en español NO cambian (se mantienen como statusLabel).
 * Los slugs son la representación estable e interna (statusSlug).
 */
export type QuoteStatusSlug =
  | "pending_adjustment"
  | "advisory_scheduled"
  | "waiting_confirmation"
  | "sent"
  | "paid_scheduled"
  | "discarded";

export const QUOTE_STATUS_SLUGS: QuoteStatusSlug[] = [
  "pending_adjustment",
  "advisory_scheduled",
  "waiting_confirmation",
  "sent",
  "paid_scheduled",
  "discarded",
];

/** Etiqueta visible en español (canónica) por slug. */
export const QUOTE_STATUS_LABELS: Record<QuoteStatusSlug, string> = {
  pending_adjustment: "Pendiente de Ajuste",
  advisory_scheduled: "Asesoría Agendada",
  waiting_confirmation: "Esperando Confirmacion",
  sent: "Enviada",
  paid_scheduled: "Pagada/Agendada",
  discarded: "Descartada",
};

/** Normaliza texto: minúsculas, sin tildes, espacios colapsados. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Acepta variaciones con/sin tilde y errores comunes de escritura.
 * Ej: "Esperando Confirmación", "esperando confirmacion", "Asesoria Agendada".
 */
const NORMALIZED_LABEL_TO_SLUG: Record<string, QuoteStatusSlug> = {
  "pendiente de ajuste": "pending_adjustment",
  "asesoria agendada": "advisory_scheduled",
  "esperando confirmacion": "waiting_confirmation",
  enviada: "sent",
  "pagada/agendada": "paid_scheduled",
  "pagada / agendada": "paid_scheduled",
  "pagada agendada": "paid_scheduled",
  descartada: "discarded",
};

/** Convierte una etiqueta o slug a un slug válido. Default: pending_adjustment. */
export function toQuoteStatusSlug(input: string | undefined | null): QuoteStatusSlug {
  if (!input) return "pending_adjustment";
  const raw = input.trim();
  if ((QUOTE_STATUS_SLUGS as string[]).includes(raw)) {
    return raw as QuoteStatusSlug;
  }
  const slug = NORMALIZED_LABEL_TO_SLUG[normalize(raw)];
  return slug ?? "pending_adjustment";
}

/** Devuelve la etiqueta visible canónica para un slug o etiqueta. */
export function toQuoteStatusLabel(input: string | undefined | null): string {
  return QUOTE_STATUS_LABELS[toQuoteStatusSlug(input)];
}

/** Resuelve ambas representaciones a la vez. */
export function resolveQuoteStatus(input: string | undefined | null): {
  slug: QuoteStatusSlug;
  label: string;
} {
  const slug = toQuoteStatusSlug(input);
  return { slug, label: QUOTE_STATUS_LABELS[slug] };
}
