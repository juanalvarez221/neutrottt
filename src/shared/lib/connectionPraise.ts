import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  PERSONAL_VALUES,
  VALUE_LABEL_KEYS,
  type AdjustmentOption,
  type PersonalValue,
  type QuoteConnection,
} from "@/shared/lib/quoteConnection";

const VALUE_PRAISE_KEYS: Record<PersonalValue, SiteCopyKey> = {
  duality: "quoteConnectionRewardPraiseDuality",
  joy: "quoteConnectionRewardPraiseJoy",
  light: "quoteConnectionRewardPraiseLight",
  inner_darkness: "quoteConnectionRewardPraiseInnerDarkness",
  vulnerability: "quoteConnectionRewardPraiseVulnerability",
  loyalty: "quoteConnectionRewardPraiseLoyalty",
  freedom: "quoteConnectionRewardPraiseFreedom",
  resilience: "quoteConnectionRewardPraiseResilience",
  roots: "quoteConnectionRewardPraiseRoots",
  memory: "quoteConnectionRewardPraiseMemory",
  transcendence: "quoteConnectionRewardPraiseTranscendence",
  silence: "quoteConnectionRewardPraiseSilence",
};

const ADJUST_PRAISE_KEYS: Record<AdjustmentOption, SiteCopyKey> = {
  trust_artist: "quoteConnectionRewardPraiseTrust",
  open_composition: "quoteConnectionRewardPraiseComposition",
  approve_each: "quoteConnectionRewardPraiseApprove",
  fixed_idea_only: "quoteConnectionRewardPraiseFixed",
};

const ADJUST_PRIORITY: AdjustmentOption[] = [
  "trust_artist",
  "open_composition",
  "approve_each",
];

export type ConnectionPraiseContent = {
  greeting: string;
  subtitle: string;
  valuesLabel: string;
  valueChips: string[];
  insight?: string;
  noteAck?: string;
};

export function buildConnectionPraise(
  connection: QuoteConnection,
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string,
  firstName?: string | null,
): ConnectionPraiseContent {
  const orderedValues = PERSONAL_VALUES.filter((value) =>
    connection.personalValues.includes(value),
  );

  const greeting = firstName
    ? t("quoteConnectionRewardGreetingNamed", { name: firstName })
    : t("quoteConnectionRewardGreeting");

  const valueChips = orderedValues.map((value) => t(VALUE_LABEL_KEYS[value]));

  let insight: string | undefined;
  const topValue = orderedValues[0];
  if (topValue) {
    insight = t(VALUE_PRAISE_KEYS[topValue]);
  } else {
    const adjustment = ADJUST_PRIORITY.find((option) =>
      connection.adjustments.includes(option),
    );
    if (adjustment) insight = t(ADJUST_PRAISE_KEYS[adjustment]);
  }

  const noteAck = connection.openNote.trim()
    ? t("quoteConnectionRewardNoteAck")
    : undefined;

  return {
    greeting,
    subtitle: t("quoteConnectionRewardSubtitle"),
    valuesLabel: t("quoteConnectionRewardValuesLabel"),
    valueChips,
    insight,
    noteAck,
  };
}
