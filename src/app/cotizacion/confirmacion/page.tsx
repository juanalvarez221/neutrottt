import { QuoteConfirmationStep } from "@/widgets/quote/QuoteConfirmationStep";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function getParam(
  source: { [key: string]: string | string[] | undefined },
  key: string,
  fallback: string,
) {
  const value = source[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function titleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatCopCompact(value: number) {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000) {
    const inMillions = rounded / 1_000_000;
    const compact = Number.isInteger(inMillions)
      ? inMillions.toFixed(0)
      : inMillions.toFixed(1).replace(".", ",");
    return `$${compact}M`;
  }

  if (rounded >= 1_000) {
    const inThousands = rounded / 1_000;
    const compact = Number.isInteger(inThousands)
      ? inThousands.toFixed(0)
      : inThousands.toFixed(1).replace(".", ",");
    return `$${compact}K`;
  }

  return `$${rounded}`;
}

function getSizeSessionRange(size: string): [number, number] {
  const normalized = normalizeText(size);
  if (normalized.includes("peque")) return [1, 2];
  if (normalized.includes("gran")) return [4, 6];
  return [2, 4];
}

function getStyleFactor(style: string) {
  const normalized = normalizeText(style);
  if (normalized.includes("malianteo")) return { priceFactor: 0.88, minAdj: 0, maxAdj: -1 };
  if (normalized.includes("linea")) return { priceFactor: 0.95, minAdj: 0, maxAdj: 0 };
  if (normalized.includes("surreal")) return { priceFactor: 1.04, minAdj: 0, maxAdj: 1 };
  return { priceFactor: 1.1, minAdj: 0, maxAdj: 1 };
}

function getZoneFactor(zone: string) {
  const normalized = normalizeText(zone);
  const zoneMap: Record<string, number> = {
    cabeza: 1.12,
    hombro: 1.06,
    espalda: 1.08,
    pecho: 1.09,
    abdomen: 1.1,
    tricep: 1.05,
    bicep: 1.04,
    antebrazo: 1,
    brazo: 1.03,
    pierna: 1.06,
    gluteo: 1.03,
  };
  return zoneMap[normalized] ?? 1.04;
}

function getEstimate(size: string, zone: string, style: string) {
  const BASE_SESSION_PRICE = 1_500_000;
  const [baseMinSessions, baseMaxSessions] = getSizeSessionRange(size);
  const styleFactor = getStyleFactor(style);
  const zoneFactor = getZoneFactor(zone);

  const minSessions = Math.max(1, baseMinSessions + styleFactor.minAdj);
  const maxSessions = Math.max(minSessions, baseMaxSessions + styleFactor.maxAdj);

  const minPerSession = BASE_SESSION_PRICE * styleFactor.priceFactor * zoneFactor * 0.92;
  const maxPerSession = BASE_SESSION_PRICE * styleFactor.priceFactor * zoneFactor * 1.08;

  const minTotal = minSessions * minPerSession;
  const maxTotal = maxSessions * maxPerSession;

  return {
    sessions: `${minSessions} a ${maxSessions} sesiones`,
    perSession: `${formatCopCompact(minPerSession)} - ${formatCopCompact(maxPerSession)} COP`,
    total: `${formatCopCompact(minTotal)} - ${formatCopCompact(maxTotal)} COP`,
  };
}

export default async function CotizacionConfirmacionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawSize = getParam(params, "size", "mediano");
  const rawZone = getParam(params, "zone", "brazo");
  const rawStyle = getParam(params, "style", "Realismo oscuro");
  const rawNotes = getParam(params, "notes", "");
  const size = titleCase(rawSize);
  const zone = titleCase(rawZone);
  const style = rawStyle;
  const estimate = getEstimate(rawSize, rawZone, rawStyle);

  return (
    <QuoteConfirmationStep
      size={size}
      zone={zone}
      style={style}
      notes={rawNotes.trim()}
      estimate={estimate}
    />
  );
}

