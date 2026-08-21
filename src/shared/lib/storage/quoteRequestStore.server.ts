import { createJsonDocumentStorage } from "@/shared/lib/storage/jsonDocumentStorage.server";
import { registrarHechoCrm } from "@/shared/lib/crm/personas.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";
import type { EventoCrm } from "@/shared/lib/crm/tipos";
import {
  resolveQuoteStatus,
  type QuoteStatusSlug,
} from "@/shared/lib/quoteRequestStatus";
import {
  deleteAllCotizacionesPostgres,
  listCotizacionesFromPostgres,
  upsertCotizacionPostgres,
} from "@/shared/lib/storage/postgresQuoteStore.server";

export type QuoteAdvisoryMode = "presencial" | "virtual";

export type QuoteConnectionAnswers = {
  referral?: string;
  values?: string;
  collaboration?: string;
  purpose?: string;
};

/**
 * Registro persistido de una solicitud de cotización.
 * Solo metadata liviana: nada de imágenes ni base64 pesado.
 */
export type QuoteRequestRecord = {
  id: string;
  clientName: string;
  whatsapp: string;
  email: string;
  projectSize: string;
  bodyPlacement: string;
  referenceNotes: string;
  connectionAnswers: QuoteConnectionAnswers;
  collaborationMode?: string;
  advisoryMode?: QuoteAdvisoryMode;
  advisoryScheduledAt?: string;
  advisoryBookingId?: string;
  style?: string;
  estimateSessions?: string;
  estimatePerSession?: string;
  estimateTotal?: string;
  statusLabel: string;
  statusSlug: QuoteStatusSlug;
  createdAt: string;
  updatedAt: string;
  officialSessionPrice?: number;
  officialSessionCount?: number;
  officialNote?: string;
  officialSentAt?: string;
};

/** Payload entrante desde el cliente (campos crudos, sin estado resuelto). */
export type QuoteRequestInput = {
  id?: string;
  clientName?: string;
  whatsapp?: string;
  email?: string;
  projectSize?: string;
  bodyPlacement?: string;
  referenceNotes?: string;
  connectionAnswers?: QuoteConnectionAnswers;
  collaborationMode?: string;
  advisoryMode?: QuoteAdvisoryMode;
  advisoryScheduledAt?: string;
  advisoryBookingId?: string;
  style?: string;
  estimateSessions?: string;
  estimatePerSession?: string;
  estimateTotal?: string;
  statusLabel?: string;
  statusSlug?: string;
  createdAt?: string;
};

const storage = createJsonDocumentStorage<QuoteRequestRecord[]>({
  fileName: "quote-requests.json",
  redisKey: "neutrott:quote-requests",
});

function eventoCrmDesdeCotizacion(record: QuoteRequestRecord): EventoCrm {
  if (record.statusSlug === "paid_scheduled") return "cotizacion_aceptada";
  if (record.advisoryBookingId || record.statusSlug === "advisory_scheduled") {
    return "asesoria_agendada";
  }
  return "cotizacion_enviada";
}

async function sincronizarCrm(record: QuoteRequestRecord) {
  try {
    await registrarHechoCrm({
      nombre: record.clientName,
      whatsapp: record.whatsapp,
      email: record.email,
      evento: eventoCrmDesdeCotizacion(record),
      origen: record.advisoryBookingId ? "asesoria" : "cotizacion",
      referencia_id: record.id,
    });
  } catch (error) {
    console.error("[crm:sync-cotizacion]", error);
  }
}

async function readAll(): Promise<QuoteRequestRecord[]> {
  if (hasDatabaseConfig()) {
    const fromPostgres = await listCotizacionesFromPostgres();
    if (fromPostgres) return fromPostgres;
  }
  const records = await storage.read();
  return Array.isArray(records) ? records : [];
}

async function persistAll(records: QuoteRequestRecord[], changed: QuoteRequestRecord) {
  if (hasDatabaseConfig()) {
    await upsertCotizacionPostgres(changed);
    return;
  }
  await storage.write(records);
}

export async function listQuoteRequests(): Promise<QuoteRequestRecord[]> {
  const records = await readAll();
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteAllQuoteRequests(): Promise<void> {
  if (hasUpstashConfig()) {
    try {
      await upstashCommand(["DEL", "neutrott:quote-requests"]);
    } catch (error) {
      console.error("[cotizaciones:purge-redis]", error);
    }
  }
  try {
    await storage.write([]);
  } catch (error) {
    console.error("[cotizaciones:purge-legacy]", error);
  }
  if (hasDatabaseConfig()) {
    await deleteAllCotizacionesPostgres();
  }
}

export async function getQuoteRequestById(id: string): Promise<QuoteRequestRecord | null> {
  const records = await readAll();
  return records.find((record) => record.id === id) ?? null;
}

export type UpsertQuoteResult = { record: QuoteRequestRecord; created: boolean };

/** Crea o reemplaza por id (dedupe por id). El backend es la fuente prioritaria. */
export async function upsertQuoteRequest(input: QuoteRequestInput): Promise<UpsertQuoteResult> {
  const records = await readAll();
  const now = new Date().toISOString();
  const existing = input.id ? records.find((record) => record.id === input.id) : undefined;

  const { slug, label } = resolveQuoteStatus(input.statusSlug ?? input.statusLabel);

  const record: QuoteRequestRecord = {
    id: input.id?.trim() || `SQ-${Date.now()}`,
    clientName: input.clientName?.trim() || "Sin nombre",
    whatsapp: input.whatsapp?.trim() || "",
    email: input.email?.trim() || "",
    projectSize: input.projectSize?.trim() || "",
    bodyPlacement: input.bodyPlacement?.trim() || "",
    referenceNotes: input.referenceNotes?.trim() || "",
    connectionAnswers: input.connectionAnswers ?? {},
    collaborationMode: input.collaborationMode?.trim() || undefined,
    advisoryMode: input.advisoryMode,
    advisoryScheduledAt: input.advisoryScheduledAt,
    advisoryBookingId: input.advisoryBookingId,
    style: input.style?.trim() || undefined,
    estimateSessions: input.estimateSessions,
    estimatePerSession: input.estimatePerSession,
    estimateTotal: input.estimateTotal,
    statusLabel: label,
    statusSlug: slug,
    createdAt: input.createdAt || existing?.createdAt || now,
    updatedAt: now,
    officialSessionPrice: existing?.officialSessionPrice,
    officialSessionCount: existing?.officialSessionCount,
    officialNote: existing?.officialNote,
    officialSentAt: existing?.officialSentAt,
  };

  const next = existing
    ? records.map((item) => (item.id === record.id ? record : item))
    : [record, ...records];

  await persistAll(next, record);
  await sincronizarCrm(record);
  return { record, created: !existing };
}

export async function updateQuoteRequestStatus(
  id: string,
  status: string,
): Promise<QuoteRequestRecord | null> {
  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) return null;

  const { slug, label } = resolveQuoteStatus(status);
  const updated: QuoteRequestRecord = {
    ...records[index],
    statusSlug: slug,
    statusLabel: label,
    updatedAt: new Date().toISOString(),
  };
  records[index] = updated;
  await persistAll(records, updated);
  await sincronizarCrm(updated);
  return updated;
}

export type OfficialQuoteAdjustment = {
  sessionPrice: number;
  sessionCount: number;
  note?: string;
};

export function isValidOfficialQuoteAdjustment(input: OfficialQuoteAdjustment): boolean {
  return (
    Number.isFinite(input.sessionPrice) &&
    input.sessionPrice > 0 &&
    Number.isInteger(input.sessionCount) &&
    input.sessionCount >= 1 &&
    input.sessionCount <= 40
  );
}

/** Guarda la cifra oficial y marca la cotización como enviada. */
export async function saveOfficialQuoteSent(
  id: string,
  adjustment: OfficialQuoteAdjustment,
): Promise<QuoteRequestRecord | null> {
  if (!isValidOfficialQuoteAdjustment(adjustment)) return null;

  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) return null;

  const { slug, label } = resolveQuoteStatus("sent");
  const updated: QuoteRequestRecord = {
    ...records[index],
    officialSessionPrice: Math.round(adjustment.sessionPrice),
    officialSessionCount: adjustment.sessionCount,
    officialNote: adjustment.note?.trim() || undefined,
    officialSentAt: new Date().toISOString(),
    statusSlug: slug,
    statusLabel: label,
    updatedAt: new Date().toISOString(),
  };
  records[index] = updated;
  await persistAll(records, updated);
  await sincronizarCrm(updated);
  return updated;
}
