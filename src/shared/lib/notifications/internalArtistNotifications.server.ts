import { BRAND } from "@/shared/config/brand";
import { getStudioFullAddress, STUDIO } from "@/shared/config/studio";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { isLargeQuoteSize } from "@/shared/lib/quoteDraft";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";
import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import type { QuoteRequestRecord } from "@/shared/lib/storage/quoteRequestStore.server";
import {
  getArtistNotificationsEmail,
  sendBrandedEmail,
} from "@/shared/lib/notifications/emailTransport.server";
import {
  wrapStudioEmail,
  type EmailFact,
} from "@/shared/lib/notifications/emailBrandLayout.server";

type Row = { label: string; value?: string | null; href?: string };

function adminLink() {
  return `${getSiteOrigin()}/admin`;
}

function rowsToFacts(rows: Row[]): EmailFact[] {
  return rows
    .filter((row) => row.value && row.value.trim())
    .map((row) => ({
      label: row.label,
      value: row.value!.trim(),
      ...(row.href?.trim() ? { href: row.href.trim() } : {}),
    }));
}

function rowsToText(rows: Row[]): string {
  return rowsToFacts(rows)
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");
}

async function sendToArtist(
  subject: string,
  rows: Row[],
  kicker: string,
  headline: string,
  lead: string,
  replyTo?: string,
  action?: { href: string; label: string },
) {
  try {
    const resolvedAction = action ?? { href: adminLink(), label: "Ver en el estudio" };
    const text = [
      headline,
      "",
      lead,
      "",
      rowsToText(rows),
      "",
      resolvedAction.href,
      "",
      BRAND.name,
    ].join("\n");
    const to = getArtistNotificationsEmail();
    if (!to) {
      console.info("[internal-email:preview] (sin ARTIST_NOTIFICATIONS_EMAIL)", subject);
      console.info(text);
      return;
    }
    const result = await sendBrandedEmail({
      to,
      subject,
      html: wrapStudioEmail({
        kicker,
        headline,
        lead,
        facts: rowsToFacts(rows),
        action: resolvedAction,
      }),
      text,
      replyTo,
    });
    if (!result.ok) {
      console.warn("[internal-email:warn] no se pudo enviar:", subject);
    }
  } catch (error) {
    console.warn(
      "[internal-email:warn]",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function modeLabel(mode: AdvisoryBooking["mode"]) {
  return mode === "presencial" ? `Presencial (${getStudioFullAddress()})` : "Virtual";
}

function statusEs(status: AdvisoryBooking["status"]) {
  if (status === "confirmed") return "confirmed (asistencia confirmada)";
  if (status === "released") return "released (cupo liberado)";
  if (status === "cancelled") return "cancelled (cancelada)";
  return "reserved (pendiente de confirmar)";
}

function formatCreatedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function hasRealEstimate(record: QuoteRequestRecord): boolean {
  if (isLargeQuoteSize(record.projectSize)) return false;
  const total = record.estimateTotal?.trim();
  if (!total) return false;
  return !/definir/i.test(total);
}

function quoteAdjustUrl(quoteId: string) {
  return `${getSiteOrigin()}/admin/cotizaciones/${encodeURIComponent(quoteId)}`;
}

/** Brief completo de una cotización para Neutro. */
export function buildQuoteArtistBriefingRows(record: QuoteRequestRecord): Row[] {
  const c = record.connectionAnswers ?? {};
  const rows: Row[] = [
    { label: "Solicitud", value: record.id },
    { label: "Entró", value: formatCreatedAt(record.createdAt) },
    { label: "Nombre", value: record.clientName },
    { label: "WhatsApp", value: record.whatsapp },
    { label: "Correo", value: record.email },
    { label: "Tamaño", value: record.projectSize },
    { label: "Zona", value: record.bodyPlacement },
    { label: "Estilo", value: record.style },
    { label: "Qué quiere", value: record.referenceNotes },
    { label: "Llegó por", value: c.referral },
    { label: "Valores", value: c.values },
    { label: "Colaboración", value: record.collaborationMode ?? c.collaboration },
    { label: "Nota", value: c.purpose },
    { label: "Estado", value: record.statusLabel },
  ];

  if (hasRealEstimate(record)) {
    rows.push({ label: "Estimado orientativo", value: record.estimateTotal });
    rows.push({ label: "Sesiones (orientativo)", value: record.estimateSessions });
    rows.push({ label: "Por sesión (orientativo)", value: record.estimatePerSession });
  }

  if (record.advisoryMode) {
    rows.push({
      label: "Asesoría",
      value:
        record.advisoryMode === "presencial"
          ? `Presencial (${getStudioFullAddress()})`
          : "Virtual",
    });
  }
  if (record.advisoryScheduledAt) {
    rows.push({
      label: "Cita",
      value: formatSlotLabel(record.advisoryScheduledAt, "es-CO"),
    });
  }

  const adjustHref = quoteAdjustUrl(record.id);
  rows.push({
    label: "Ajuste",
    value: adjustHref,
    href: adjustHref,
  });

  return rows;
}

/** FASE 6.2, Correo interno por nueva cotización (flujo mediano). */
export async function sendNewQuoteInternalEmail(record: QuoteRequestRecord) {
  await sendToArtist(
    `${BRAND.name} · Brief nuevo · ${record.clientName}`,
    buildQuoteArtistBriefingRows(record),
    "Cotización",
    record.clientName,
    "Llegó un brief por el cotizador. Abre el enlace, ajusta la cifra y mándale la cotización oficial.",
    record.email,
    { href: quoteAdjustUrl(record.id), label: "Ajustar y enviar cotización" },
  );
}

/** Brief completo para Neutro: contacto, cita y lo que el cliente quiere. */
export function buildAdvisoryArtistBriefingRows(booking: AdvisoryBooking): Row[] {
  const brief = booking.brief ?? {};
  const idea = booking.projectNotes?.trim();
  const openNote = brief.openNote?.trim();
  const noteIsDistinct = Boolean(openNote && openNote !== idea);

  const rows: Row[] = [
    { label: "Reserva", value: booking.id },
    { label: "Entró", value: formatCreatedAt(booking.createdAt) },
    { label: "Nombre", value: booking.clientName },
    { label: "WhatsApp", value: booking.phone },
    { label: "Correo", value: booking.email },
    { label: "Modalidad", value: modeLabel(booking.mode) },
    { label: "Duración", value: `${booking.durationMin} min aprox.` },
    { label: "Fecha y hora", value: formatSlotLabel(booking.startsAt, "es-CO") },
    {
      label: "Horario anterior",
      value: booking.previousStartsAt
        ? formatSlotLabel(booking.previousStartsAt, "es-CO")
        : undefined,
    },
    { label: "Estado", value: statusEs(booking.status) },
    { label: "Tamaño", value: booking.size || "Proyecto grande" },
    { label: "Zona", value: brief.bodyZone },
    { label: "Qué quiere", value: idea },
    { label: "Llegó por", value: brief.referral },
    { label: "Valores", value: brief.personalValues },
    { label: "Colaboración", value: brief.collaborationMode },
    { label: "Nota", value: noteIsDistinct ? openNote : !idea ? openNote : undefined },
  ];

  if (booking.mode === "presencial") {
    rows.push({ label: "Estudio", value: getStudioFullAddress() });
    rows.push({ label: "Mapa", value: STUDIO.mapsUrl, href: STUDIO.mapsUrl });
  }

  if (booking.meetingLink?.trim()) {
    rows.push({
      label: "Sala",
      value: booking.meetingLink.trim(),
      href: booking.meetingLink.trim(),
    });
  }

  rows.push({
    label: "Agenda",
    value: booking.googleCalendarEventId ? "Ya está en Calendar" : "Sin evento en Calendar",
  });

  return rows;
}

/** FASE 6.3, Correo interno por nueva asesoría reservada (proyecto grande). */
export async function sendNewAdvisoryInternalEmail(booking: AdvisoryBooking) {
  await sendToArtist(
    `${BRAND.name} · Hueco tomado · ${booking.clientName}`,
    buildAdvisoryArtistBriefingRows(booking),
    "Cita",
    booking.clientName,
    "Llegó una cita. Debajo está todo el brief: quién es, qué quiere y cómo conectarla.",
    booking.email,
  );
}

type AdvisoryChangeKind = "confirmed" | "released" | "rescheduled" | "cancelled";

const CHANGE_COPY: Record<AdvisoryChangeKind, { kicker: string; headline: string; lead: string }> = {
  confirmed: { kicker: "Marcado", headline: "Viene", lead: "Confirmó que asiste." },
  released: { kicker: "Libreta", headline: "Hueco suelto", lead: "No confirmó. El horario volvió a la libreta." },
  rescheduled: { kicker: "Otro hueco", headline: "Lo movió", lead: "Reagendó la asesoría." },
  cancelled: { kicker: "Baja", headline: "Se cayó", lead: "La asesoría quedó cancelada." },
};

/** FASE 6.4, Correo interno por cambios importantes de una asesoría. */
export async function sendAdvisoryChangeInternalEmail(
  booking: AdvisoryBooking,
  kind: AdvisoryChangeKind,
) {
  const meta = CHANGE_COPY[kind];

  await sendToArtist(
    `${BRAND.name} · ${meta.headline} · ${booking.clientName}`,
    buildAdvisoryArtistBriefingRows(booking),
    meta.kicker,
    meta.headline,
    meta.lead,
    booking.email,
  );
}
