import type { SmartQuoteRequest, SmartQuoteStatus } from "@/shared/lib/smartQuotes";
import { toQuoteStatusSlug, type QuoteStatusSlug } from "@/shared/lib/quoteRequestStatus";

export type QuoteRequestRecordLite = {
  id: string;
  createdAt: string;
  clientName: string;
  whatsapp: string;
  email: string;
  projectSize: string;
  bodyPlacement: string;
  referenceNotes?: string;
  style?: string;
  connectionAnswers?: {
    referral?: string;
    values?: string;
    collaboration?: string;
    purpose?: string;
  };
  advisoryMode?: "presencial" | "virtual";
  advisoryScheduledAt?: string;
  advisoryBookingId?: string;
  estimateSessions?: string;
  estimatePerSession?: string;
  estimateTotal?: string;
  statusLabel: string;
  officialSessionPrice?: number;
  officialSessionCount?: number;
};

export const QUOTE_STATUS_TONE: Record<SmartQuoteStatus, string> = {
  "Pendiente de Ajuste": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  "Asesoría Agendada": "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "Esperando Confirmacion": "border-sky-500/30 bg-sky-500/10 text-sky-100",
  Enviada: "border-amber-600/25 bg-amber-600/12 text-amber-100",
  "Pagada/Agendada": "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  Descartada: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

export const QUOTE_STATUS_SHORT: Record<SmartQuoteStatus, string> = {
  "Pendiente de Ajuste": "Por ajustar",
  "Asesoría Agendada": "Asesoría reservada",
  "Esperando Confirmacion": "Por confirmar",
  Enviada: "Enviada",
  "Pagada/Agendada": "Confirmada",
  Descartada: "Descartada",
};

export function backendToSmartQuote(record: QuoteRequestRecordLite): SmartQuoteRequest {
  return {
    id: record.id,
    createdAt: record.createdAt,
    clientName: record.clientName,
    phone: record.whatsapp,
    email: record.email,
    size: record.projectSize,
    zone: record.bodyPlacement,
    style: record.style ?? "",
    notes: record.referenceNotes ?? "",
    connectionValues: record.connectionAnswers?.values,
    connectionCollaboration: record.connectionAnswers?.collaboration,
    connectionPurpose: record.connectionAnswers?.purpose,
    connectionAftercare: record.connectionAnswers?.referral,
    requiresAdvisory: Boolean(record.advisoryMode),
    advisoryMode: record.advisoryMode,
    advisoryScheduledAt: record.advisoryScheduledAt,
    advisoryBookingId: record.advisoryBookingId,
    estimateSessions: record.estimateSessions ?? "",
    estimatePerSession: record.estimatePerSession ?? "",
    estimateTotal: record.estimateTotal ?? "",
    status: (record.statusLabel as SmartQuoteStatus) ?? "Pendiente de Ajuste",
    adminSessionPrice: record.officialSessionPrice,
    adminSessionCount: record.officialSessionCount,
  };
}

export function mergeQuotes(
  backend: SmartQuoteRequest[],
  local: SmartQuoteRequest[],
): SmartQuoteRequest[] {
  const localById = new Map(local.map((quote) => [quote.id, quote]));
  const merged = backend.map((quote) => {
    const localQuote = localById.get(quote.id);
    if (!localQuote) return quote;
    return {
      ...quote,
      adminSessionPrice: localQuote.adminSessionPrice ?? quote.adminSessionPrice,
      adminSessionCount: localQuote.adminSessionCount ?? quote.adminSessionCount,
    };
  });
  const backendIds = new Set(backend.map((quote) => quote.id));
  const localOnly = local.filter((quote) => !backendIds.has(quote.id));
  return [...merged, ...localOnly].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function quoteStatusSlug(quote: SmartQuoteRequest): QuoteStatusSlug {
  return toQuoteStatusSlug(quote.status);
}

export function isQuoteActionable(quote: SmartQuoteRequest): boolean {
  const slug = quoteStatusSlug(quote);
  return slug === "pending_adjustment" || slug === "waiting_confirmation";
}

export function isQuoteConfirmed(quote: SmartQuoteRequest): boolean {
  const slug = quoteStatusSlug(quote);
  return slug === "paid_scheduled" || slug === "advisory_scheduled";
}

export function extractClosestSessions(text: string) {
  const nums = text.match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return 1;
  if (nums.length === 1) return nums[0]!;
  return Math.round((nums[0]! + nums[1]!) / 2);
}
