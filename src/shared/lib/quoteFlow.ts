import { getQuoteConnection, isRejectedCollaboration } from "@/shared/lib/quoteConnection";
import { clearQuoteCompletionType, clearQuoteDraft } from "@/shared/lib/quoteDraft";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/shared/lib/safeStorage";

export const QUOTE_FLOW_PATHS = {
  profile: "/cotizacion",
  connection: "/cotizacion/conexion",
  quoteStart: "/cotizacion/tamano",
} as const;

export type QuoteFlowPath = (typeof QUOTE_FLOW_PATHS)[keyof typeof QUOTE_FLOW_PATHS];

const QUOTE_ONBOARDING_KEY = "quote_onboarding_complete";

export function hasCompleteQuoteProfile() {
  return getQuoteProfile() !== null;
}

export function hasApprovedQuoteConnection() {
  const connection = getQuoteConnection();
  if (!connection) return false;
  return !isRejectedCollaboration(connection.adjustments);
}

/** Onboarding = perfil + conexión aprobada. Se conserva entre visitas. */
export function hasCompletedQuoteOnboarding() {
  if (safeLocalStorageGet(QUOTE_ONBOARDING_KEY) === "1") return true;
  if (hasCompleteQuoteProfile() && hasApprovedQuoteConnection()) {
    markQuoteOnboardingComplete();
    return true;
  }
  return false;
}

export function markQuoteOnboardingComplete() {
  safeLocalStorageSet(QUOTE_ONBOARDING_KEY, "1");
}

export function clearQuoteOnboardingComplete() {
  safeLocalStorageRemove(QUOTE_ONBOARDING_KEY);
}

/** Punto de entrada según lo que ya tengamos guardado. */
export function resolveQuoteEntryPath(): QuoteFlowPath {
  if (!hasCompleteQuoteProfile()) return QUOTE_FLOW_PATHS.profile;
  if (!hasCompletedQuoteOnboarding()) return QUOTE_FLOW_PATHS.connection;
  return QUOTE_FLOW_PATHS.quoteStart;
}

/**
 * Para pasos del tatuaje: devuelve el paso de onboarding pendiente o null si ya está listo.
 * No redirige al inicio del flujo de pieza, solo valida datos permanentes del usuario.
 */
export function resolveOnboardingFallbackPath(): QuoteFlowPath | null {
  if (!hasCompleteQuoteProfile()) return QUOTE_FLOW_PATHS.profile;
  if (!hasCompletedQuoteOnboarding()) return QUOTE_FLOW_PATHS.connection;
  return null;
}

/** Limpia borrador de pieza previa al iniciar una cotización nueva. */
export function startNewQuoteSession() {
  clearQuoteDraft();
  clearQuoteCompletionType();
}

export function shouldSkipToQuote() {
  return hasCompletedQuoteOnboarding();
}
