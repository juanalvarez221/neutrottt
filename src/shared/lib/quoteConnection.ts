import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { markQuoteOnboardingComplete } from "@/shared/lib/quoteFlow";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/shared/lib/safeStorage";

export type ReferralSource = "instagram" | "tiktok" | "acquaintance" | "other";
export type PersonalValue =
  | "duality"
  | "joy"
  | "light"
  | "inner_darkness"
  | "vulnerability"
  | "loyalty"
  | "freedom"
  | "resilience"
  | "roots"
  | "memory"
  | "transcendence"
  | "silence";
export type AdjustmentOption =
  | "trust_artist"
  | "open_composition"
  | "approve_each"
  | "fixed_idea_only";

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
  "duality",
  "joy",
  "light",
  "inner_darkness",
  "vulnerability",
  "loyalty",
  "freedom",
  "resilience",
  "roots",
  "memory",
  "transcendence",
  "silence",
];

export const ADJUSTMENT_OPTIONS: AdjustmentOption[] = [
  "trust_artist",
  "open_composition",
  "approve_each",
  "fixed_idea_only",
];

/** Opción más cerrada: sin asesoría ni evolución de la idea. */
export const REJECTED_COLLABORATION_OPTION: AdjustmentOption = "fixed_idea_only";

export function isRejectedCollaboration(adjustments: AdjustmentOption[]): boolean {
  return adjustments.includes(REJECTED_COLLABORATION_OPTION);
}

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
  duality: "quoteConnectionValueDuality",
  joy: "quoteConnectionValueJoy",
  light: "quoteConnectionValueLight",
  inner_darkness: "quoteConnectionValueInnerDarkness",
  vulnerability: "quoteConnectionValueVulnerability",
  loyalty: "quoteConnectionValueLoyalty",
  freedom: "quoteConnectionValueFreedom",
  resilience: "quoteConnectionValueResilience",
  roots: "quoteConnectionValueRoots",
  memory: "quoteConnectionValueMemory",
  transcendence: "quoteConnectionValueTranscendence",
  silence: "quoteConnectionValueSilence",
};

export const ADJUSTMENT_LABEL_KEYS: Record<AdjustmentOption, SiteCopyKey> = {
  trust_artist: "quoteConnectionAdjustTrust",
  open_composition: "quoteConnectionAdjustComposition",
  approve_each: "quoteConnectionAdjustApprove",
  fixed_idea_only: "quoteConnectionAdjustFixed",
};

const QUOTE_CONNECTION_KEY = "quote_connection";

function isValidConnection(parsed: unknown): parsed is QuoteConnection {
  if (!parsed || typeof parsed !== "object") return false;
  const data = parsed as QuoteConnection;
  return (
    Array.isArray(data.referralSources) &&
    data.referralSources.length > 0 &&
    Array.isArray(data.personalValues) &&
    data.personalValues.every((value) => PERSONAL_VALUES.includes(value as PersonalValue)) &&
    data.personalValues.length > 0 &&
    Array.isArray(data.adjustments) &&
    data.adjustments.every((option) => ADJUSTMENT_OPTIONS.includes(option as AdjustmentOption)) &&
    data.adjustments.length > 0 &&
    typeof data.openNote === "string"
  );
}

export function saveQuoteConnection(connection: QuoteConnection) {
  if (typeof window === "undefined") return;
  safeLocalStorageSet(QUOTE_CONNECTION_KEY, JSON.stringify(connection));
  if (!isRejectedCollaboration(connection.adjustments)) {
    markQuoteOnboardingComplete();
  }
}

export function getQuoteConnection(): QuoteConnection | null {
  if (typeof window === "undefined") return null;
  const raw = safeLocalStorageGet(QUOTE_CONNECTION_KEY);
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
    duality: "Dualidad",
    joy: "Alegría",
    light: "Luz",
    inner_darkness: "Oscuridad interna",
    vulnerability: "Vulnerabilidad",
    loyalty: "Lealtad",
    freedom: "Libertad",
    resilience: "Resiliencia",
    roots: "Raíces",
    memory: "Memoria",
    transcendence: "Trascendencia",
    silence: "Silencio",
  };
  const adjustmentLabels: Record<AdjustmentOption, string> = {
    trust_artist: "Guía creativa total — confía en el criterio del artista",
    open_composition: "Base clara, abierto a escala y composición",
    approve_each: "Colaboración con aprobación en cada ajuste",
    fixed_idea_only: "Idea cerrada — exactamente eso, sin asesoría",
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
