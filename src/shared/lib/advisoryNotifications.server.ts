import { BRAND } from "@/shared/config/brand";
import { getStudioFullAddress, STUDIO } from "@/shared/config/studio";
import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";
import { sendBrandedEmail, type EmailPayload } from "@/shared/lib/notifications/emailTransport.server";
import {
  wrapStudioEmail,
  type EmailFact,
} from "@/shared/lib/notifications/emailBrandLayout.server";

function modeLabel(mode: AdvisoryBooking["mode"]) {
  return mode === "presencial" ? "Presencial en Estudio Emerald" : "Virtual";
}

/**
 * Lo que el cliente necesita para presentarse.
 * Nada de brief, contacto ni datos que ya escribió en el cotizador.
 */
export function clientReservationFacts(booking: AdvisoryBooking): EmailFact[] {
  const facts: EmailFact[] = [
    { label: "Cuándo", value: formatSlotLabel(booking.startsAt, "es-CO") },
    { label: "Formato", value: modeLabel(booking.mode) },
    { label: "Tiempo", value: `${booking.durationMin} min aprox.` },
  ];

  if (booking.mode === "presencial") {
    facts.push({ label: "Lugar", value: getStudioFullAddress() });
    facts.push({
      label: "Cómo llegar",
      value: "Abrir en Google Maps",
      href: STUDIO.mapsUrl,
    });
  }

  if (booking.mode === "virtual" && booking.meetingLink?.trim()) {
    facts.push({
      label: "Sala",
      value: booking.meetingLink.trim(),
      href: booking.meetingLink.trim(),
    });
  }

  return facts;
}

export function buildAdvisoryBookingDetailsText(booking: AdvisoryBooking) {
  return clientReservationFacts(booking)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("\n");
}

function clientReservationClosing(booking: AdvisoryBooking, variant: "book" | "remind" | "confirm" | "reschedule") {
  const arrive =
    booking.mode === "presencial"
      ? "Llega unos minutos antes. En recepción puedes preguntar por Neutrottt."
      : "Entra a la sala unos minutos antes con el enlace.";

  if (variant === "remind") {
    return `${arrive} Si no confirmas al menos 6 horas antes, suelto el horario.`;
  }
  if (variant === "confirm") {
    return arrive;
  }
  if (variant === "reschedule") {
    return `${arrive} Un día antes te pido confirmar otra vez.`;
  }
  return `${arrive} Un día antes te escribo para que confirmes si vienes. Si no llega esa confirmación, suelto el horario.`;
}

function confirmUrl(token: string) {
  return `${getSiteOrigin()}/cotizacion/asesoria/confirmar?token=${encodeURIComponent(token)}`;
}

function rescheduleUrl(token: string) {
  return `${getSiteOrigin()}/cotizacion/asesoria/reagendar?token=${encodeURIComponent(token)}`;
}

async function sendEmail(payload: EmailPayload) {
  return sendBrandedEmail(payload);
}

async function sendWhatsApp(toPhone: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!accountSid || !authToken || !from) {
    console.info("[advisory-whatsapp:preview]", toPhone, body);
    return { ok: true as const, preview: true };
  }

  const normalized = toPhone.replace(/\D/g, "");
  const to = normalized.startsWith("57") ? `whatsapp:+${normalized}` : `whatsapp:+57${normalized}`;

  const params = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: to,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("[advisory-whatsapp:error]", detail);
    return { ok: false as const, preview: false };
  }

  return { ok: true as const, preview: false };
}

export async function sendAdvisoryBookingConfirmationEmail(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const closing = clientReservationClosing(booking, "book");
  const subject = `${BRAND.name} · El hueco quedó a tu nombre · ${slotLabel}`;
  const text = [
    `${BRAND.name}`,
    "Experto en sombras y lettering",
    "",
    `${booking.clientName},`,
    "",
    `El hueco ya tiene tu nombre: ${slotLabel}.`,
    "",
    buildAdvisoryBookingDetailsText(booking),
    "",
    closing,
    "",
    BRAND.name,
  ].join("\n");

  const html = wrapStudioEmail({
    kicker: "Asesoría",
    headline: booking.clientName,
    lead: `El hueco ya tiene tu nombre: ${slotLabel}.`,
    facts: clientReservationFacts(booking),
    closing,
  });

  return sendEmail({ to: booking.email, subject, html, text });
}

export async function sendAdvisoryAttendanceReminder(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const link = confirmUrl(booking.confirmationToken);
  const closing = clientReservationClosing(booking, "remind");
  const subject = `${BRAND.name} · Mañana es ${slotLabel}`;
  const text = [
    `${BRAND.name}`,
    "",
    `${booking.clientName}, mañana es tu asesoría: ${slotLabel}.`,
    "",
    buildAdvisoryBookingDetailsText(booking),
    "",
    "Confirma si vienes:",
    link,
    "",
    closing,
    "",
    BRAND.name,
  ].join("\n");

  const html = wrapStudioEmail({
    kicker: "Mañana",
    headline: "Vas a venir",
    lead: `La asesoría es ${slotLabel}. Necesito que confirmes el hueco.`,
    facts: clientReservationFacts(booking),
    action: { href: link, label: "Confirmar que voy" },
    closing,
  });

  const emailResult = await sendEmail({ to: booking.email, subject, html, text });

  const whatsappLines = [
    `${BRAND.name}. ${booking.clientName}, mañana es tu asesoría ${modeLabel(booking.mode)}: ${slotLabel}.`,
    `Confirma aquí: ${link}`,
  ];
  if (booking.mode === "virtual" && booking.meetingLink?.trim()) {
    whatsappLines.push(`Sala: ${booking.meetingLink.trim()}`);
  }
  if (booking.mode === "presencial") {
    whatsappLines.push(`Lugar: ${getStudioFullAddress()}`);
  }

  const whatsappResult = await sendWhatsApp(booking.phone, whatsappLines.join(" "));

  return {
    email: emailResult,
    whatsapp: whatsappResult,
  };
}

export async function sendAdvisorySlotReleasedNotice(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const link = rescheduleUrl(booking.confirmationToken);
  const subject = `${BRAND.name} · El hueco de ${slotLabel} volvió a la libreta`;
  const text = [
    `${BRAND.name}`,
    "",
    `${booking.clientName}, no llegó la confirmación para ${slotLabel}. Suelto el horario.`,
    "",
    "Si todavía quieres sentarte, elige otro hueco:",
    link,
    "",
    BRAND.name,
  ].join("\n");

  const html = wrapStudioEmail({
    kicker: "Libreta",
    headline: "Suelto el hueco",
    lead: `No llegó la confirmación para ${slotLabel}. El horario volvió a la libreta.`,
    action: { href: link, label: "Elegir otro hueco" },
    closing: "Si todavía quieres sentarte, hay otros espacios.",
  });

  const emailResult = await sendEmail({ to: booking.email, subject, html, text });

  const whatsappBody = [
    `${BRAND.name}. ${booking.clientName}, suelto el hueco de ${slotLabel}: no llegó la confirmación.`,
    `Otro horario: ${link}`,
  ].join(" ");

  const whatsappResult = await sendWhatsApp(booking.phone, whatsappBody);

  return {
    email: emailResult,
    whatsapp: whatsappResult,
  };
}

export async function sendAdvisoryAttendanceConfirmedEmail(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const closing = clientReservationClosing(booking, "confirm");
  const subject = `${BRAND.name} · Quedó marcado · ${slotLabel}`;
  const text = [
    `${BRAND.name}`,
    "",
    `${booking.clientName}, quedó marcado: ${slotLabel}.`,
    "",
    buildAdvisoryBookingDetailsText(booking),
    "",
    closing,
    "",
    BRAND.name,
  ].join("\n");

  const html = wrapStudioEmail({
    kicker: "Marcado",
    headline: "Te espero",
    lead: `El hueco quedó fijo: ${slotLabel}.`,
    facts: clientReservationFacts(booking),
    closing,
  });

  return sendEmail({ to: booking.email, subject, html, text });
}

export async function sendAdvisoryRescheduledEmail(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const closing = clientReservationClosing(booking, "reschedule");
  const subject = `${BRAND.name} · El hueco ahora es ${slotLabel}`;
  const text = [
    `${BRAND.name}`,
    "",
    `${booking.clientName}, movimos el hueco a ${slotLabel}.`,
    "",
    buildAdvisoryBookingDetailsText(booking),
    "",
    closing,
    "",
    BRAND.name,
  ].join("\n");

  const html = wrapStudioEmail({
    kicker: "Otro hueco",
    headline: "Lo movimos",
    lead: `El nuevo horario es ${slotLabel}.`,
    facts: clientReservationFacts(booking),
    closing,
  });

  return sendEmail({ to: booking.email, subject, html, text });
}
