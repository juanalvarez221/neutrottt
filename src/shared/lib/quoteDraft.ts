export type QuoteDraft = {
  size: string;
  zone?: string;
  notes?: string;
};

const QUOTE_DRAFT_KEY = "quote_draft";

export function normalizeQuoteSize(size: string) {
  return size
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isLargeQuoteSize(size: string) {
  return normalizeQuoteSize(size).includes("gran");
}

export function saveQuoteDraft(draft: QuoteDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUOTE_DRAFT_KEY, JSON.stringify(draft));
}

export function getQuoteDraft(): QuoteDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(QUOTE_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuoteDraft;
    if (!parsed?.size) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const QUOTE_COMPLETION_KEY = "quote_completion_type";

export type QuoteCompletionType = "asesoria" | "cotizacion";

export function setQuoteCompletionType(type: QuoteCompletionType) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(QUOTE_COMPLETION_KEY, type);
}

export function getQuoteCompletionType(): QuoteCompletionType | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(QUOTE_COMPLETION_KEY);
  if (value === "asesoria" || value === "cotizacion") return value;
  return null;
}
