/** Precio por sesión cuando las fechas son días consecutivos. */
export const SESSION_PRICE_CONSECUTIVE_DAYS = 1_000_000;

/** Precio por sesión cuando hay más de un día entre cada cita. */
export const SESSION_PRICE_SEPARATE_DAYS = 1_200_000;

export type QuoteSessionEstimate = {
  sessions: string;
  minSessions: number;
  maxSessions: number;
  consecutivePerSession: string;
  separatePerSession: string;
  consecutiveTotal: string;
  separateTotal: string;
};

function normalizeSize(size: string) {
  return size
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function getSizeSessionRange(size: string): [number, number] {
  const normalized = normalizeSize(size);
  if (normalized.includes("gran")) return [4, 6];
  return [2, 4];
}

export function formatCop(value: number, locale: "es" | "en" = "es") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTotalRange(minSessions: number, maxSessions: number, perSession: number, locale: "es" | "en") {
  const minTotal = minSessions * perSession;
  const maxTotal = maxSessions * perSession;
  if (minTotal === maxTotal) return formatCop(minTotal, locale);
  return `${formatCop(minTotal, locale)} - ${formatCop(maxTotal, locale)}`;
}

export function buildQuoteSessionEstimate(size: string, locale: "es" | "en" = "es"): QuoteSessionEstimate {
  const [minSessions, maxSessions] = getSizeSessionRange(size);

  const sessions =
    locale === "en"
      ? minSessions === maxSessions
        ? `${minSessions} session${minSessions === 1 ? "" : "s"}`
        : `${minSessions} to ${maxSessions} sessions`
      : minSessions === maxSessions
        ? `${minSessions} sesión${minSessions === 1 ? "" : "es"}`
        : `${minSessions} a ${maxSessions} sesiones`;

  return {
    sessions,
    minSessions,
    maxSessions,
    consecutivePerSession: formatCop(SESSION_PRICE_CONSECUTIVE_DAYS, locale),
    separatePerSession: formatCop(SESSION_PRICE_SEPARATE_DAYS, locale),
    consecutiveTotal: formatTotalRange(
      minSessions,
      maxSessions,
      SESSION_PRICE_CONSECUTIVE_DAYS,
      locale,
    ),
    separateTotal: formatTotalRange(minSessions, maxSessions, SESSION_PRICE_SEPARATE_DAYS, locale),
  };
}
