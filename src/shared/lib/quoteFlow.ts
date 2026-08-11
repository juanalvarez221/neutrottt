import { getQuoteConnection, isRejectedCollaboration } from "@/shared/lib/quoteConnection";
import {
  clearQuoteCompletionType,
  clearQuoteDraft,
  getQuoteDraft,
  isLargeQuoteSize,
  saveQuoteDraft,
  type QuoteDraft,
} from "@/shared/lib/quoteDraft";
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
  profileEdit: "/cotizacion?edit=1",
} as const;

export type QuoteFlowPath = (typeof QUOTE_FLOW_PATHS)[keyof typeof QUOTE_FLOW_PATHS];

const QUOTE_ONBOARDING_KEY = "quote_onboarding_complete";
const QUOTE_RESUME_KEY = "quote_resume_path";

const RESUMABLE_EXACT = new Set([
  QUOTE_FLOW_PATHS.connection,
  QUOTE_FLOW_PATHS.quoteStart,
  "/cotizacion/ubicacion",
  "/cotizacion/estilo",
  "/cotizacion/referencia",
  "/cotizacion/confirmacion",
  "/cotizacion/asesoria",
  "/cotizacion/asesoria/agendar",
]);

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

function splitResumePath(raw: string): { pathname: string; search: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/cotizacion")) return null;
  const q = trimmed.indexOf("?");
  if (q === -1) return { pathname: trimmed, search: "" };
  return { pathname: trimmed.slice(0, q), search: trimmed.slice(q) };
}

export function isResumableQuotePath(pathname: string) {
  return RESUMABLE_EXACT.has(pathname);
}

export function getQuoteResumePath(): string | null {
  if (typeof window === "undefined") return null;
  const raw = safeLocalStorageGet(QUOTE_RESUME_KEY);
  if (!raw) return null;
  const parts = splitResumePath(raw);
  if (!parts || !isResumableQuotePath(parts.pathname)) return null;
  return `${parts.pathname}${parts.search}`;
}

export function saveQuoteResumePath(path: string) {
  if (typeof window === "undefined") return;
  const parts = splitResumePath(path);
  if (!parts || !isResumableQuotePath(parts.pathname)) return;
  safeLocalStorageSet(QUOTE_RESUME_KEY, `${parts.pathname}${parts.search}`);
}

export function clearQuoteResumePath() {
  if (typeof window === "undefined") return;
  safeLocalStorageRemove(QUOTE_RESUME_KEY);
}

function draftHasLocation(draft: QuoteDraft | null) {
  if (!draft) return false;
  if (draft.selectedBodyTargets && draft.selectedBodyTargets.length > 0) return true;
  return Boolean(draft.zone?.trim());
}

function inferResumeFromDraft(): string | null {
  const draft = getQuoteDraft();
  if (!draft?.size) return null;
  const size = draft.size;
  if (draftHasLocation(draft)) {
    if (isLargeQuoteSize(size)) {
      return `/cotizacion/asesoria?size=${encodeURIComponent(size)}`;
    }
    const zone = draft.zone?.trim() || "otro";
    const params = new URLSearchParams({ size, zone });
    if (draft.zoneOther?.trim()) params.set("zoneOther", draft.zoneOther.trim());
    return `/cotizacion/confirmacion?${params.toString()}`;
  }
  return `/cotizacion/ubicacion?size=${encodeURIComponent(size)}`;
}

/**
 * Persiste el paso actual + tamaño de la URL para poder retomar luego.
 */
export function captureQuoteProgress(pathname: string, search = "") {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const size = params.get("size")?.trim();
  if (size) {
    const current = getQuoteDraft();
    saveQuoteDraft({
      ...(current ?? { size }),
      size,
    });
  }

  const normalizedSearch = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  if (!isResumableQuotePath(pathname)) return Boolean(size);
  saveQuoteResumePath(`${pathname}${normalizedSearch}`);
  return true;
}

/** Punto de entrada según onboarding (sin retoma de pieza). */
export function resolveQuoteEntryPath(): QuoteFlowPath {
  if (!hasCompleteQuoteProfile()) return QUOTE_FLOW_PATHS.profile;
  if (!hasCompletedQuoteOnboarding()) return QUOTE_FLOW_PATHS.connection;
  return QUOTE_FLOW_PATHS.quoteStart;
}

/**
 * Destino real al abrir Cotizar: respeta onboarding y retoma el paso guardado.
 */
export function resolveQuoteResumePath(): string {
  if (!hasCompleteQuoteProfile()) return QUOTE_FLOW_PATHS.profile;
  if (!hasCompletedQuoteOnboarding()) return QUOTE_FLOW_PATHS.connection;

  const resume = getQuoteResumePath();
  if (resume) return resume;

  const inferred = inferResumeFromDraft();
  if (inferred) return inferred;

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

/** Limpia borrador de pieza y punto de retoma. */
export function startNewQuoteSession() {
  clearQuoteDraft();
  clearQuoteCompletionType();
  clearQuoteResumePath();
}

export function shouldSkipToQuote() {
  return hasCompletedQuoteOnboarding();
}

type QuoteSearchParams = {
  get(name: string): string | null;
};

function withSizeQuery(path: string, size: string) {
  if (!size) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}size=${encodeURIComponent(size)}`;
}

/**
 * Paso anterior del flujo de cotización (no depende del historial del navegador).
 * Así el botón atrás siempre lleva al paso lógico previo.
 */
export function resolveQuoteBackPath(
  pathname: string,
  searchParams?: QuoteSearchParams | null,
): string {
  const size =
    searchParams?.get("size")?.trim() ||
    getQuoteDraft()?.size?.trim() ||
    "";
  const token = searchParams?.get("token")?.trim() || "";

  if (pathname === QUOTE_FLOW_PATHS.profile) return "/";
  if (pathname === QUOTE_FLOW_PATHS.connection) return QUOTE_FLOW_PATHS.profile;
  if (pathname === QUOTE_FLOW_PATHS.quoteStart) {
    return hasCompletedQuoteOnboarding() ? "/" : QUOTE_FLOW_PATHS.connection;
  }
  if (pathname.startsWith("/cotizacion/ubicacion")) {
    return QUOTE_FLOW_PATHS.quoteStart;
  }
  if (
    pathname.startsWith("/cotizacion/estilo") ||
    pathname.startsWith("/cotizacion/referencia") ||
    pathname.startsWith("/cotizacion/confirmacion")
  ) {
    return withSizeQuery("/cotizacion/ubicacion", size || "mediano");
  }
  if (pathname === "/cotizacion/asesoria") {
    return withSizeQuery("/cotizacion/ubicacion", size || "grande");
  }
  if (pathname.startsWith("/cotizacion/asesoria/agendar")) {
    return withSizeQuery("/cotizacion/asesoria", size || "grande");
  }
  if (pathname.startsWith("/cotizacion/asesoria/reagendar")) {
    return token
      ? `/cotizacion/asesoria/confirmar?token=${encodeURIComponent(token)}`
      : "/";
  }
  if (pathname.startsWith("/cotizacion/asesoria/confirmar")) return "/";
  if (pathname.startsWith("/cotizacion/gracias")) return "/";

  return "/";
}
