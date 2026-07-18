import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  FALLBACK_INSIGHT,
  GREETINGS_ANON,
  GREETINGS_NAMED,
  NOTE_ACK,
  SUBTITLES,
  VALUES_LABEL,
  type PraiseLang,
} from "@/shared/lib/connectionPraiseBank";
import { VALUE_DESCRIPTIONS } from "@/shared/lib/connectionValueDescriptions";
import {
  PERSONAL_VALUES,
  VALUE_LABEL_KEYS,
  type PersonalValue,
  type QuoteConnection,
} from "@/shared/lib/quoteConnection";

export type ConnectionPraiseValueBlock = {
  value: PersonalValue;
  label: string;
  text: string;
};

export type ConnectionPraiseContent = {
  greeting: string;
  subtitle: string;
  valuesLabel: string;
  valueChips: string[];
  valueBlocks: ConnectionPraiseValueBlock[];
  noteAck?: string;
  fallbackInsight?: string;
};

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pick<T>(items: readonly T[], seed: number, salt: number): T {
  return items[(seed + salt * 97) % items.length]!;
}

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

export function buildConnectionPraise(
  connection: QuoteConnection,
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string,
  firstName?: string | null,
  language: PraiseLang = "es",
): ConnectionPraiseContent {
  const orderedValues = PERSONAL_VALUES.filter((value) =>
    connection.personalValues.includes(value),
  );

  const seed = hashSeed(
    [
      firstName?.trim().toLowerCase() ?? "",
      orderedValues.join(","),
      connection.adjustments.join(","),
      connection.openNote.trim().slice(0, 40),
      language,
    ].join("|"),
  );

  const greeting = firstName
    ? fill(pick(GREETINGS_NAMED[language], seed, 2), { name: firstName })
    : pick(GREETINGS_ANON[language], seed, 2);

  const subtitle = pick(SUBTITLES[language], seed, 7);
  const valuesLabel = pick(VALUES_LABEL[language], seed, 13);
  const valueChips = orderedValues.map((value) => t(VALUE_LABEL_KEYS[value]));

  const valueBlocks: ConnectionPraiseValueBlock[] = orderedValues.map(
    (value, index) => ({
      value,
      label: t(VALUE_LABEL_KEYS[value]),
      text: pick(VALUE_DESCRIPTIONS[value][language], seed, 19 + index * 13),
    }),
  );

  const noteAck = connection.openNote.trim()
    ? pick(NOTE_ACK[language], seed, 71)
    : undefined;

  const fallbackInsight =
    valueBlocks.length === 0 ? pick(FALLBACK_INSIGHT[language], seed, 1) : undefined;

  return {
    greeting,
    subtitle,
    valuesLabel,
    valueChips,
    valueBlocks,
    noteAck,
    fallbackInsight,
  };
}
