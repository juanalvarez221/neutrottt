import { createJsonDocumentStorage } from "@/shared/lib/storage/jsonDocumentStorage.server";
import {
  resolveQuoteStatus,
  type QuoteStatusSlug,
} from "@/shared/lib/quoteRequestStatus";

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

async function readAll(): Promise<QuoteRequestRecord[]> {
  const records = await storage.read();
  return Array.isArray(records) ? records : [];
}

export async function listQuoteRequests(): Promise<QuoteRequestRecord[]> {
  const records = await readAll();
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  };

  const next = existing
    ? records.map((item) => (item.id === record.id ? record : item))
    : [record, ...records];

  await storage.write(next);
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
  await storage.write(records);
  return updated;
}
