import type { QuoteRequestRecord } from "@/shared/lib/storage/quoteRequestStore.server";
import { getCrmSql } from "@/shared/lib/crm/postgres.server";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";

type CotizacionRow = {
  id: string;
  client_name: string;
  whatsapp: string;
  email: string;
  project_size: string;
  body_placement: string;
  reference_notes: string;
  connection_answers: QuoteRequestRecord["connectionAnswers"] | string;
  collaboration_mode: string | null;
  advisory_mode: QuoteRequestRecord["advisoryMode"] | null;
  advisory_scheduled_at: Date | string | null;
  advisory_booking_id: string | null;
  style: string | null;
  estimate_sessions: string | null;
  estimate_per_session: string | null;
  estimate_total: string | null;
  status_label: string;
  status_slug: QuoteRequestRecord["statusSlug"];
  created_at: Date | string;
  updated_at: Date | string;
  official_session_price: number | null;
  official_session_count: number | null;
  official_note: string | null;
  official_sent_at: Date | string | null;
};

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseAnswers(
  raw: CotizacionRow["connection_answers"],
): QuoteRequestRecord["connectionAnswers"] {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as QuoteRequestRecord["connectionAnswers"];
    } catch {
      return {};
    }
  }
  return raw;
}

export function mapCotizacionRow(row: CotizacionRow): QuoteRequestRecord {
  return {
    id: row.id,
    clientName: row.client_name,
    whatsapp: row.whatsapp,
    email: row.email,
    projectSize: row.project_size,
    bodyPlacement: row.body_placement,
    referenceNotes: row.reference_notes,
    connectionAnswers: parseAnswers(row.connection_answers),
    collaborationMode: row.collaboration_mode ?? undefined,
    advisoryMode: row.advisory_mode ?? undefined,
    advisoryScheduledAt: iso(row.advisory_scheduled_at),
    advisoryBookingId: row.advisory_booking_id ?? undefined,
    style: row.style ?? undefined,
    estimateSessions: row.estimate_sessions ?? undefined,
    estimatePerSession: row.estimate_per_session ?? undefined,
    estimateTotal: row.estimate_total ?? undefined,
    statusLabel: row.status_label,
    statusSlug: row.status_slug,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    officialSessionPrice: row.official_session_price ?? undefined,
    officialSessionCount: row.official_session_count ?? undefined,
    officialNote: row.official_note ?? undefined,
    officialSentAt: iso(row.official_sent_at),
  };
}

async function importQuotesFromRedis(): Promise<QuoteRequestRecord[]> {
  if (!hasUpstashConfig()) return [];
  try {
    const raw = await upstashCommand<string>(["GET", "neutrott:quote-requests"]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuoteRequestRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[cotizaciones:import-redis]", error);
    return [];
  }
}

export async function listCotizacionesFromPostgres(): Promise<QuoteRequestRecord[] | null> {
  const sql = await getCrmSql();
  if (!sql) return null;
  const rows = await sql<CotizacionRow[]>`
    SELECT * FROM cotizaciones ORDER BY created_at DESC
  `;
  if (rows.length === 0) {
    const imported = await importQuotesFromRedis();
    if (imported.length) {
      for (const record of imported) {
        await upsertCotizacionPostgres(record);
      }
      return imported.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }
  return rows.map(mapCotizacionRow);
}

export async function deleteAllCotizacionesPostgres(): Promise<void> {
  const sql = await getCrmSql();
  if (!sql) return;
  await sql`DELETE FROM cotizaciones`;
}

export async function upsertCotizacionPostgres(record: QuoteRequestRecord): Promise<void> {
  const sql = await getCrmSql();
  if (!sql) {
    throw new Error("No hay DATABASE_URL para guardar la cotización.");
  }
  await sql`
    INSERT INTO cotizaciones (
      id, client_name, whatsapp, email, project_size, body_placement, reference_notes,
      connection_answers, collaboration_mode, advisory_mode, advisory_scheduled_at,
      advisory_booking_id, style, estimate_sessions, estimate_per_session, estimate_total,
      status_label, status_slug, created_at, updated_at, official_session_price,
      official_session_count, official_note, official_sent_at
    ) VALUES (
      ${record.id},
      ${record.clientName},
      ${record.whatsapp},
      ${record.email},
      ${record.projectSize},
      ${record.bodyPlacement},
      ${record.referenceNotes},
      ${sql.json(record.connectionAnswers ?? {})},
      ${record.collaborationMode ?? null},
      ${record.advisoryMode ?? null},
      ${record.advisoryScheduledAt ?? null},
      ${record.advisoryBookingId ?? null},
      ${record.style ?? null},
      ${record.estimateSessions ?? null},
      ${record.estimatePerSession ?? null},
      ${record.estimateTotal ?? null},
      ${record.statusLabel},
      ${record.statusSlug},
      ${record.createdAt},
      ${record.updatedAt},
      ${record.officialSessionPrice ?? null},
      ${record.officialSessionCount ?? null},
      ${record.officialNote ?? null},
      ${record.officialSentAt ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      client_name = EXCLUDED.client_name,
      whatsapp = EXCLUDED.whatsapp,
      email = EXCLUDED.email,
      project_size = EXCLUDED.project_size,
      body_placement = EXCLUDED.body_placement,
      reference_notes = EXCLUDED.reference_notes,
      connection_answers = EXCLUDED.connection_answers,
      collaboration_mode = EXCLUDED.collaboration_mode,
      advisory_mode = EXCLUDED.advisory_mode,
      advisory_scheduled_at = EXCLUDED.advisory_scheduled_at,
      advisory_booking_id = EXCLUDED.advisory_booking_id,
      style = EXCLUDED.style,
      estimate_sessions = EXCLUDED.estimate_sessions,
      estimate_per_session = EXCLUDED.estimate_per_session,
      estimate_total = EXCLUDED.estimate_total,
      status_label = EXCLUDED.status_label,
      status_slug = EXCLUDED.status_slug,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      official_session_price = EXCLUDED.official_session_price,
      official_session_count = EXCLUDED.official_session_count,
      official_note = EXCLUDED.official_note,
      official_sent_at = EXCLUDED.official_sent_at
  `;
}
