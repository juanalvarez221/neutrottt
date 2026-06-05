import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type ReferralSource = "instagram" | "tiktok" | "acquaintance" | "other";
export type PersonalValue =
  | "honesty"
  | "family"
  | "loyalty"
  | "freedom"
  | "growth"
  | "faith"
  | "discipline"
  | "respect";
export type AdjustmentOption = "trust_artist" | "approve_each" | "open_composition" | "keep_idea";

export type QuoteConnection = {
  referralSources: ReferralSource[];
  referralOther?: string;
  personalValues: PersonalValue[];
  adjustments: AdjustmentOption[];
  openNote: string;
};

export const REFERRAL_SOURCES: ReferralSource[] = [
  "instagram",
  "tiktok",
  "acquaintance",
  "other",
];

export const PERSONAL_VALUES: PersonalValue[] = [
  "honesty",
  "family",
  "loyalty",
  "freedom",
  "growth",
  "faith",
  "discipline",
  "respect",
];

export const ADJUSTMENT_OPTIONS: AdjustmentOption[] = [
  "trust_artist",
  "approve_each",
  "open_composition",
  "keep_idea",
];

export type ConnectionSelectionMode = "single" | "multiple";

/** Modo de selección por bloque del paso de conexión. */
export const CONNECTION_SELECTION_MODES = {
  referral: "single",
  values: "multiple",
  adjustments: "single",
} as const satisfies Record<string, ConnectionSelectionMode>;

export const REFERRAL_LABEL_KEYS: Record<ReferralSource, SiteCopyKey> = {
  instagram: "quoteConnectionReferralInstagram",
  tiktok: "quoteConnectionReferralTiktok",
  acquaintance: "quoteConnectionReferralAcquaintance",
  other: "quoteConnectionReferralOther",
};

export const VALUE_LABEL_KEYS: Record<PersonalValue, SiteCopyKey> = {
  honesty: "quoteConnectionValueHonesty",
  family: "quoteConnectionValueFamily",
  loyalty: "quoteConnectionValueLoyalty",
  freedom: "quoteConnectionValueFreedom",
  growth: "quoteConnectionValueGrowth",
  faith: "quoteConnectionValueFaith",
  discipline: "quoteConnectionValueDiscipline",
  respect: "quoteConnectionValueRespect",
};

export const ADJUSTMENT_LABEL_KEYS: Record<AdjustmentOption, SiteCopyKey> = {
  trust_artist: "quoteConnectionAdjustTrust",
  approve_each: "quoteConnectionAdjustApprove",
  open_composition: "quoteConnectionAdjustComposition",
  keep_idea: "quoteConnectionAdjustKeep",
};

const QUOTE_CONNECTION_KEY = "quote_connection";

function isValidConnection(parsed: unknown): parsed is QuoteConnection {
  if (!parsed || typeof parsed !== "object") return false;
  const data = parsed as QuoteConnection;
  return (
    Array.isArray(data.referralSources) &&
    data.referralSources.length > 0 &&
    Array.isArray(data.personalValues) &&
    data.personalValues.length > 0 &&
    Array.isArray(data.adjustments) &&
    data.adjustments.length > 0 &&
    typeof data.openNote === "string"
  );
}

export function saveQuoteConnection(connection: QuoteConnection) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUOTE_CONNECTION_KEY, JSON.stringify(connection));
}

export function getQuoteConnection(): QuoteConnection | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(QUOTE_CONNECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConnection(parsed)) return null;
    if (parsed.referralSources.includes("other") && !parsed.referralOther?.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function formatReferralSummary(
  connection: QuoteConnection,
  t: (key: SiteCopyKey) => string,
) {
  const parts = connection.referralSources
    .filter((source) => source !== "other")
    .map((source) => t(REFERRAL_LABEL_KEYS[source]));
  if (connection.referralSources.includes("other")) {
    parts.push(`${t(REFERRAL_LABEL_KEYS.other)}: ${connection.referralOther?.trim() ?? ""}`);
  }
  return parts.join(", ");
}

export function mapConnectionToSmartQuote(
  connection: QuoteConnection,
  t: (key: SiteCopyKey) => string,
) {
  return {
    connectionAftercare: formatReferralSummary(connection, t),
    connectionValues: connection.personalValues
      .map((value) => t(VALUE_LABEL_KEYS[value]))
      .join(", "),
    connectionCollaboration: connection.adjustments
      .map((option) => t(ADJUSTMENT_LABEL_KEYS[option]))
      .join(", "),
    connectionPurpose: connection.openNote.trim() || undefined,
  };
}

export function formatQuoteConnectionForAdmin(connection: QuoteConnection): string {
  const referralLabels: Record<ReferralSource, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    acquaintance: "Conocido/a",
    other: "Otro",
  };
  const valueLabels: Record<PersonalValue, string> = {
    honesty: "Honestidad",
    family: "Familia",
    loyalty: "Lealtad",
    freedom: "Libertad",
    growth: "Superación",
    faith: "Fe",
    discipline: "Disciplina",
    respect: "Respeto",
  };
  const adjustmentLabels: Record<AdjustmentOption, string> = {
    trust_artist: "Confía en ajustes del artista",
    approve_each: "Aprueba cada ajuste",
    open_composition: "Abierto a escala y composición",
    keep_idea: "Idea base con cambios mínimos",
  };

  const referral = connection.referralSources
    .map((source) =>
      source === "other"
        ? `Otro (${connection.referralOther?.trim() ?? ""})`
        : referralLabels[source],
    )
    .join(", ");

  return [
    `Origen: ${referral}`,
    `Valores: ${connection.personalValues.map((v) => valueLabels[v]).join(", ")}`,
    `Ajustes: ${connection.adjustments.map((a) => adjustmentLabels[a]).join(", ")}`,
    connection.openNote.trim() ? `Nota: ${connection.openNote.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
