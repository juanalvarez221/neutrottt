import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import {
  ADJUST_LINES,
  CLOSINGS,
  FALLBACK_INSIGHT,
  GENERIC_MANY,
  GENERIC_PAIR,
  GREETINGS_ANON,
  GREETINGS_NAMED,
  MULTI_OPENERS,
  NOTE_ACK,
  PAIR_BRIDGES,
  SUBTITLES,
  VALUE_CRAFT,
  VALUE_ESSENCE,
  VALUE_NOUN,
  VALUES_LABEL,
  type PraiseLang,
} from "@/shared/lib/connectionPraiseBank";
import {
  PERSONAL_VALUES,
  VALUE_LABEL_KEYS,
  type AdjustmentOption,
  type PersonalValue,
  type QuoteConnection,
} from "@/shared/lib/quoteConnection";

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
  insight: string;
  resonance?: string;
  noteAck?: string;
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

function pairKey(a: PersonalValue, b: PersonalValue): string {
  return [a, b].sort().join("|");
}

function formatValueList(
  values: PersonalValue[],
  lang: PraiseLang,
): string {
  const nouns = values.map((value) => VALUE_NOUN[value][lang]);
  if (nouns.length === 1) return nouns[0]!;
  if (nouns.length === 2) {
    return lang === "es" ? `${nouns[0]} y ${nouns[1]}` : `${nouns[0]} and ${nouns[1]}`;
  }
  const head = nouns.slice(0, -1).join(lang === "es" ? ", " : ", ");
  const last = nouns[nouns.length - 1];
  return lang === "es" ? `${head} y ${last}` : `${head}, and ${last}`;
}

function buildInsight(
  values: PersonalValue[],
  adjustments: AdjustmentOption[],
  lang: PraiseLang,
  seed: number,
): { insight: string; resonance?: string } {
  if (values.length === 0) {
    const adjustment = ADJUST_PRIORITY.find((option) => adjustments.includes(option));
    if (adjustment && adjustment !== "fixed_idea_only") {
      const line = pick(ADJUST_LINES[adjustment][lang], seed, 3);
      const close = pick(CLOSINGS[lang], seed, 5);
      return { insight: `${line} ${close}` };
    }
    return { insight: pick(FALLBACK_INSIGHT[lang], seed, 1) };
  }

  const primary = values[0]!;
  const essence = pick(VALUE_ESSENCE[primary][lang], seed, 11);
  const craft = pick(VALUE_CRAFT[primary][lang], seed, 17);
  const close = pick(CLOSINGS[lang], seed, 23);

  if (values.length === 1) {
    const adjust = ADJUST_PRIORITY.find((option) => adjustments.includes(option));
    const adjustLine =
      adjust && adjust !== "fixed_idea_only"
        ? ` ${pick(ADJUST_LINES[adjust][lang], seed, 29)}`
        : "";
    return {
      insight: `${essence} ${craft}${adjustLine}`,
      resonance: close,
    };
  }

  if (values.length === 2) {
    const secondary = values[1]!;
    const key = pairKey(primary, secondary);
    const special = PAIR_BRIDGES[key];
    const bridge = special
      ? pick(special[lang], seed, 31)
      : fill(pick(GENERIC_PAIR[lang], seed, 31), {
          a: VALUE_NOUN[primary][lang],
          b: VALUE_NOUN[secondary][lang],
        });
    const secondaryEssence = pick(VALUE_ESSENCE[secondary][lang], seed, 37);
    const adjust = ADJUST_PRIORITY.find((option) => adjustments.includes(option));
    const adjustLine =
      adjust && adjust !== "fixed_idea_only"
        ? ` ${pick(ADJUST_LINES[adjust][lang], seed, 41)}`
        : "";

    return {
      insight: `${bridge} ${essence}`,
      resonance: `${secondaryEssence} ${craft}${adjustLine} ${close}`,
    };
  }

  const opener = pick(MULTI_OPENERS[lang], seed, 43);
  const listLine = fill(pick(GENERIC_MANY[lang], seed, 47), {
    list: formatValueList(values.slice(0, 4), lang),
  });
  const second = values[1]!;
  const third = values[2];
  const pair = PAIR_BRIDGES[pairKey(primary, second)];
  const pairLine = pair
    ? pick(pair[lang], seed, 53)
    : fill(pick(GENERIC_PAIR[lang], seed, 53), {
        a: VALUE_NOUN[primary][lang],
        b: VALUE_NOUN[second][lang],
      });
  const tertiary = third ? ` ${pick(VALUE_ESSENCE[third][lang], seed, 59)}` : "";
  const adjust = ADJUST_PRIORITY.find((option) => adjustments.includes(option));
  const adjustLine =
    adjust && adjust !== "fixed_idea_only"
      ? ` ${pick(ADJUST_LINES[adjust][lang], seed, 61)}`
      : "";

  return {
    insight: `${opener} ${listLine}`,
    resonance: `${pairLine} ${essence}${tertiary} ${craft}${adjustLine} ${close}`,
  };
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
  const { insight, resonance } = buildInsight(
    orderedValues,
    connection.adjustments,
    language,
    seed,
  );

  const noteAck = connection.openNote.trim()
    ? pick(NOTE_ACK[language], seed, 71)
    : undefined;

  return {
    greeting,
    subtitle,
    valuesLabel,
    valueChips,
    insight,
    resonance,
    noteAck,
  };
}
