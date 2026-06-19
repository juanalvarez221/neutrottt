import { getQuoteConnection, isRejectedCollaboration } from "@/shared/lib/quoteConnection";
import { clearQuoteCompletionType, clearQuoteDraft } from "@/shared/lib/quoteDraft";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";

export const QUOTE_FLOW_PATHS = {
  profile: "/cotizacion",
  connection: "/cotizacion/conexion",
  quoteStart: "/cotizacion/tamano",
} as const;

export type QuoteFlowPath = (typeof QUOTE_FLOW_PATHS)[keyof typeof QUOTE_FLOW_PATHS];

export function hasCompleteQuoteProfile() {
  return getQuoteProfile() !== null;
}

export function hasApprovedQuoteConnection() {
  const connection = getQuoteConnection();
  if (!connection) return false;
  return !isRejectedCollaboration(connection.adjustments);
}

/** Punto de entrada según lo que ya tengamos guardado. */
export function resolveQuoteEntryPath(): QuoteFlowPath {
  if (!hasCompleteQuoteProfile()) return QUOTE_FLOW_PATHS.profile;
  if (!hasApprovedQuoteConnection()) return QUOTE_FLOW_PATHS.connection;
  return QUOTE_FLOW_PATHS.quoteStart;
}

/** Limpia borrador de pieza previa al iniciar una cotización nueva. */
export function startNewQuoteSession() {
  clearQuoteDraft();
  clearQuoteCompletionType();
}

export function shouldSkipToQuote() {
  return hasCompleteQuoteProfile() && hasApprovedQuoteConnection();
}
