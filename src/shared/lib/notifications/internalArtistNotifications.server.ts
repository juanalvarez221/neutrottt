import { BRAND } from "@/shared/config/brand";
import { getStudioFullAddress } from "@/shared/config/studio";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { isLargeQuoteSize } from "@/shared/lib/quoteDraft";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";
import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import type { QuoteRequestRecord } from "@/shared/lib/storage/quoteRequestStore.server";
import {
  getArtistNotificationsEmail,
  sendBrandedEmail,
} from "@/shared/lib/notifications/emailTransport.server";

/**
 * Notificaciones internas para el artista/estudio.
 * Objetivo: que Neutrottt tenga el brief sin entrar al panel admin.
 * Todas son best-effort: si fallan, se loguea warning y NUNCA rompen la reserva/cotización.
 */
type Row = { label: string; value?: string | null };

function adminLink() {
  return `${getSiteOrigin()}/admin`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rowsToText(rows: Row[]): string {
  return rows
    .filter((row) => row.value && row.value.trim())
    .map((row) => `${row.label}: ${row.value!.trim()}`)
    .join("\n");
}

function rowsToHtml(rows: Row[]): string {
  return rows
    .filter((row) => row.value && row.value.trim())
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#a8a29e;font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(
          row.label,
        )}</td><td style="padding:6px 0;color:#f5f5f4;font-size:14px">${escapeHtml(
          row.value!.trim(),
        )}</td></tr>`,
    )
    .join("");
}

function wrapHtml(eyebrow: string, title: string, rows: Row[], link: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:600px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d6d3d1">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 18px;font-size:22px;color:#fafaf9">${escapeHtml(title)}</h1>
        <table style="border-collapse:collapse;width:100%">${rowsToHtml(rows)}</table>
        <a href="${link}" style="display:inline-block;margin-top:22px;background:#44403c;color:#fafaf9;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:13px">Abrir panel admin</a>
      </div>
    </div>
  `;
}

async function sendToArtist(subject: string, rows: Row[], eyebrow: string, title: string) {
  try {
    const link = adminLink();
    const text = [title, "", rowsToText(rows), "", `Panel admin: ${link}`, "", `— ${BRAND.name}`].join("\n");
    const to = getArtistNotificationsEmail();
    if (!to) {
      console.info("[internal-email:preview] (sin ARTIST_NOTIFICATIONS_EMAIL)", subject);
      console.info(text);
      return;
    }
    const result = await sendBrandedEmail({
      to,
      subject,
      html: wrapHtml(eyebrow, title, rows, link),
      text,
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

/** FASE 6.2 — Correo interno por nueva cotización (flujo mediano). */
export async function sendNewQuoteInternalEmail(record: QuoteRequestRecord) {
  const c = record.connectionAnswers ?? {};
  const rows: Row[] = [
    { label: "Nombre", value: record.clientName },
    { label: "WhatsApp", value: record.whatsapp },
    { label: "Email", value: record.email },
    { label: "Tamaño", value: record.projectSize },
    { label: "Zona corporal", value: record.bodyPlacement },
  ];

  if (hasRealEstimate(record)) {
    rows.push({ label: "Estimado orientativo", value: record.estimateTotal });
    rows.push({ label: "Sesiones (orientativo)", value: record.estimateSessions });
  }

  rows.push(
    { label: "Notas / referencia", value: record.referenceNotes },
    { label: "Cómo llegó", value: c.referral },
    { label: "Valores personales", value: c.values },
    { label: "Modo de colaboración", value: record.collaborationMode ?? c.collaboration },
    { label: "Nota abierta", value: c.purpose },
    { label: "Estado actual", value: record.statusLabel },
    { label: "Creada", value: formatCreatedAt(record.createdAt) },
    { label: "Origen", value: "Cotizador Neutrottt" },
  );

  await sendToArtist(
    `Nueva cotización Neutrottt · ${record.clientName}`,
    rows,
    "Nueva cotización",
    "Nueva cotización Neutrottt",
  );
}

/** FASE 6.3 — Correo interno por nueva asesoría reservada (proyecto grande). */
export async function sendNewAdvisoryInternalEmail(booking: AdvisoryBooking) {
  const b = booking.brief ?? {};
  const rows: Row[] = [
    { label: "Nombre", value: booking.clientName },
    { label: "WhatsApp", value: booking.phone },
    { label: "Email", value: booking.email },
    { label: "Modalidad", value: modeLabel(booking.mode) },
    { label: "Duración", value: `${booking.durationMin} min` },
    { label: "Fecha y hora", value: formatSlotLabel(booking.startsAt, "es-CO") },
    { label: "Estado", value: statusEs(booking.status) },
    { label: "Tamaño", value: booking.size || "Proyecto grande" },
    { label: "Zona corporal", value: b.bodyZone },
    { label: "Idea / notas", value: booking.projectNotes || b.openNote },
    { label: "Cómo llegó", value: b.referral },
    { label: "Valores personales", value: b.personalValues },
    { label: "Modo de colaboración", value: b.collaborationMode },
    { label: "Nota abierta", value: b.openNote },
    {
      label: "Google Calendar",
      value: booking.googleCalendarEventId ? "Sincronizada con Google Calendar" : undefined,
    },
    { label: "Origen", value: "Cotizador Neutrottt" },
  ];

  await sendToArtist(
    `Nueva asesoría reservada · ${booking.clientName}`,
    rows,
    "Nueva asesoría",
    "Nueva asesoría reservada",
  );
}

type AdvisoryChangeKind = "confirmed" | "released" | "rescheduled" | "cancelled";

const CHANGE_TITLES: Record<AdvisoryChangeKind, { eyebrow: string; title: string }> = {
  confirmed: { eyebrow: "Asesoría confirmada", title: "Asesoría confirmada" },
  released: { eyebrow: "Cupo liberado", title: "Asesoría liberada" },
  rescheduled: { eyebrow: "Asesoría reagendada", title: "Asesoría reagendada" },
  cancelled: { eyebrow: "Asesoría cancelada", title: "Asesoría cancelada" },
};

/** FASE 6.4 — Correo interno por cambios importantes de una asesoría. */
export async function sendAdvisoryChangeInternalEmail(
  booking: AdvisoryBooking,
  kind: AdvisoryChangeKind,
) {
  const meta = CHANGE_TITLES[kind];
  const rows: Row[] = [
    { label: "Nombre", value: booking.clientName },
    { label: "WhatsApp", value: booking.phone },
    { label: "Email", value: booking.email },
    { label: "Modalidad", value: modeLabel(booking.mode) },
    { label: "Fecha y hora", value: formatSlotLabel(booking.startsAt, "es-CO") },
    { label: "Estado", value: statusEs(booking.status) },
    {
      label: "Google Calendar",
      value: booking.googleCalendarEventId ? "Sincronizada con Google Calendar" : "Sin evento sincronizado",
    },
  ];

  await sendToArtist(
    `${meta.title} · ${booking.clientName}`,
    rows,
    meta.eyebrow,
    meta.title,
  );
}
