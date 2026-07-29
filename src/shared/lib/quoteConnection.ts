import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { markQuoteOnboardingComplete } from "@/shared/lib/quoteFlow";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/shared/lib/safeStorage";

/**
 * Datos de origen / marketing del lead.
 * Se mantiene el nombre de storage `quote_connection` por compatibilidad
 * con borradores locales y payloads existentes (connectionAnswers).
 */
export type ReferralSource =
  | "instagram"
  | "tiktok"
  | "recommended"
  | "google"
  | "existing_client"
  | "other";

export type QuoteConnection = {
  source: ReferralSource;
  sourceOther?: string;
  marketingOptIn: boolean;
  openNote: string;
};

export const REFERRAL_SOURCES: ReferralSource[] = [
  "instagram",
  "tiktok",
  "recommended",
  "google",
  "existing_client",
  "other",
];

export const REFERRAL_LABEL_KEYS: Record<ReferralSource, SiteCopyKey> = {
  instagram: "quoteConnectionReferralInstagram",
  tiktok: "quoteConnectionReferralTiktok",
  recommended: "quoteConnectionReferralRecommended",
  google: "quoteConnectionReferralGoogle",
  existing_client: "quoteConnectionReferralExistingClient",
  other: "quoteConnectionReferralOther",
};

const QUOTE_CONNECTION_KEY = "quote_connection";

function isValidConnection(parsed: unknown): parsed is QuoteConnection {
  if (!parsed || typeof parsed !== "object") return false;
  const data = parsed as QuoteConnection;
  if (!REFERRAL_SOURCES.includes(data.source as ReferralSource)) return false;
  if (typeof data.marketingOptIn !== "boolean") return false;
  if (typeof data.openNote !== "string") return false;
  if (data.source === "other" && !data.sourceOther?.trim()) return false;
  return true;
}

export function saveQuoteConnection(connection: QuoteConnection) {
  if (typeof window === "undefined") return;
  safeLocalStorageSet(QUOTE_CONNECTION_KEY, JSON.stringify(connection));
  markQuoteOnboardingComplete();
}

export function getQuoteConnection(): QuoteConnection | null {
  if (typeof window === "undefined") return null;
  const raw = safeLocalStorageGet(QUOTE_CONNECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConnection(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatReferralSummary(
  connection: QuoteConnection,
  t: (key: SiteCopyKey) => string,
) {
  if (connection.source === "other") {
    return `${t(REFERRAL_LABEL_KEYS.other)}: ${connection.sourceOther?.trim() ?? ""}`;
  }
  return t(REFERRAL_LABEL_KEYS[connection.source]);
}

/** Mapea al shape histórico de SmartQuoteRequest / connectionAnswers. */
export function mapConnectionToSmartQuote(
  connection: QuoteConnection,
  t: (key: SiteCopyKey) => string,
) {
  return {
    connectionAftercare: formatReferralSummary(connection, t),
    connectionValues: connection.marketingOptIn
      ? t("quoteConnectionMarketingYes")
      : t("quoteConnectionMarketingNo"),
    connectionCollaboration: undefined as string | undefined,
    connectionPurpose: connection.openNote.trim() || undefined,
    marketingOptIn: connection.marketingOptIn,
  };
}

export function formatQuoteConnectionForAdmin(connection: QuoteConnection): string {
  const labels: Record<ReferralSource, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    recommended: "Recomendado por alguien",
    google: "Google / búsqueda",
    existing_client: "Ya soy cliente",
    other: "Otro",
  };
  const source =
    connection.source === "other"
      ? `Otro (${connection.sourceOther?.trim() ?? ""})`
      : labels[connection.source];

  return [
    `Origen: ${source}`,
    `Marketing: ${connection.marketingOptIn ? "Sí" : "No"}`,
    connection.openNote.trim() ? `Nota: ${connection.openNote.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
