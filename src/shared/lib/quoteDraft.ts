import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageSet,
  safeStorageGet,
  safeStorageRemove,
} from "@/shared/lib/safeStorage";

export type QuoteDraft = {
  size: string;
  zone?: string;
  zoneOther?: string;
  headPart?: string;
  backPart?: string;
  armLaterality?: string;
  armFaceScope?: string;
  armPart?: string;
  legLaterality?: string;
  legFaceScope?: string;
  legExtent?: string;
  /** @deprecated */
  armSide?: string;
  /** @deprecated */
  legSide?: string;
  /** @deprecated */
  legPart?: string;
  notes?: string;
};

const QUOTE_DRAFT_KEY = "quote_draft";

export function normalizeQuoteSize(size: string) {
  const normalized = size
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalized.includes("peque")) return "mediano";
  return normalized;
}

export function isLargeQuoteSize(size: string) {
  return normalizeQuoteSize(size).includes("gran");
}

/** Solo piezas medianas (8–20 cm) reciben estimado orientativo online. */
export function receivesOnlinePricing(size: string) {
  return !isLargeQuoteSize(size);
}

/** Proyectos grandes (+25 cm) requieren asesoría presencial o virtual. */
export function requiresProjectAdvisory(size: string) {
  return isLargeQuoteSize(size);
}

export function resolveQuoteSizeParam(size: string): "mediano" | "grande" {
  return isLargeQuoteSize(size) ? "grande" : "mediano";
}

export function saveQuoteDraft(draft: QuoteDraft) {
  if (typeof window === "undefined") return;
  safeLocalStorageSet(QUOTE_DRAFT_KEY, JSON.stringify(draft));
}

export function getQuoteDraft(): QuoteDraft | null {
  if (typeof window === "undefined") return null;
  const raw = safeLocalStorageGet(QUOTE_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuoteDraft;
    if (!parsed?.size) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearQuoteDraft() {
  if (typeof window === "undefined") return;
  safeLocalStorageRemove(QUOTE_DRAFT_KEY);
}

export const QUOTE_COMPLETION_KEY = "quote_completion_type";

export type QuoteCompletionType = "asesoria" | "cotizacion";

export function setQuoteCompletionType(type: QuoteCompletionType) {
  if (typeof window === "undefined") return;
  safeSessionStorageSet(QUOTE_COMPLETION_KEY, type);
}

export function getQuoteCompletionType(): QuoteCompletionType | null {
  if (typeof window === "undefined") return null;
  const value = safeStorageGet(window.sessionStorage, QUOTE_COMPLETION_KEY);
  if (value === "asesoria" || value === "cotizacion") return value;
  return null;
}

export function clearQuoteCompletionType() {
  if (typeof window === "undefined") return;
  safeStorageRemove(window.sessionStorage, QUOTE_COMPLETION_KEY);
}
