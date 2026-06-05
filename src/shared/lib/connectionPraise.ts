import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  PERSONAL_VALUES,
  type AdjustmentOption,
  type PersonalValue,
  type QuoteConnection,
} from "@/shared/lib/quoteConnection";

const VALUE_NOUN_KEYS: Record<PersonalValue, SiteCopyKey> = {
  honesty: "quoteConnectionRewardNounHonesty",
  family: "quoteConnectionRewardNounFamily",
  loyalty: "quoteConnectionRewardNounLoyalty",
  freedom: "quoteConnectionRewardNounFreedom",
  growth: "quoteConnectionRewardNounGrowth",
  faith: "quoteConnectionRewardNounFaith",
  discipline: "quoteConnectionRewardNounDiscipline",
  respect: "quoteConnectionRewardNounRespect",
};

const VALUE_PRAISE_KEYS: Record<PersonalValue, SiteCopyKey> = {
  honesty: "quoteConnectionRewardPraiseHonesty",
  family: "quoteConnectionRewardPraiseFamily",
  loyalty: "quoteConnectionRewardPraiseLoyalty",
  freedom: "quoteConnectionRewardPraiseFreedom",
  growth: "quoteConnectionRewardPraiseGrowth",
  faith: "quoteConnectionRewardPraiseFaith",
  discipline: "quoteConnectionRewardPraiseDiscipline",
  respect: "quoteConnectionRewardPraiseRespect",
};

const ADJUST_PRAISE_KEYS: Record<AdjustmentOption, SiteCopyKey> = {
  trust_artist: "quoteConnectionRewardPraiseTrust",
  approve_each: "quoteConnectionRewardPraiseApprove",
  open_composition: "quoteConnectionRewardPraiseComposition",
  keep_idea: "quoteConnectionRewardPraiseKeep",
};

const ADJUST_PRIORITY: AdjustmentOption[] = [
  "trust_artist",
  "open_composition",
  "approve_each",
  "keep_idea",
];

export type ConnectionPraiseContent = {
  lead: string;
  lines: string[];
  valueChips: string[];
};

function formatNounList(
  items: string[],
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string,
): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) {
    return t("quoteConnectionRewardListTwo", { a: items[0], b: items[1] });
  }
  return t("quoteConnectionRewardListMany", {
    head: items.slice(0, -1).join(", "),
    last: items[items.length - 1],
  });
}

export function buildConnectionPraise(
  connection: QuoteConnection,
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string,
  firstName?: string | null,
): ConnectionPraiseContent {
  const orderedValues = PERSONAL_VALUES.filter((value) =>
    connection.personalValues.includes(value),
  );
  const valueNouns = orderedValues
    .slice(0, 3)
    .map((value) => t(VALUE_NOUN_KEYS[value]));
  const valuesLabel = formatNounList(valueNouns, t);

  const lead = firstName
    ? t("quoteConnectionRewardLeadNamed", { name: firstName, values: valuesLabel })
    : t("quoteConnectionRewardLead", { values: valuesLabel });

  const lines: string[] = [];
  for (const value of orderedValues.slice(0, 2)) {
    lines.push(t(VALUE_PRAISE_KEYS[value]));
  }

  const adjustment = ADJUST_PRIORITY.find((option) => connection.adjustments.includes(option));
  if (adjustment) {
    lines.push(t(ADJUST_PRAISE_KEYS[adjustment]));
  }

  if (connection.openNote.trim()) {
    lines.push(t("quoteConnectionRewardNoteAck"));
  }

  return {
    lead,
    lines: lines.slice(0, 3),
    valueChips: orderedValues.map((value) => t(VALUE_NOUN_KEYS[value])),
  };
}
