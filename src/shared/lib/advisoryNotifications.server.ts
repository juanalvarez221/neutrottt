import { BRAND } from "@/shared/config/brand";
import { getStudioFullAddress } from "@/shared/config/studio";
import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getSiteOrigin } from "@/shared/lib/siteOrigin.server";
import { sendBrandedEmail, type EmailPayload } from "@/shared/lib/notifications/emailTransport.server";

function modeLabel(mode: AdvisoryBooking["mode"]) {
  return mode === "presencial" ? "Presencial (Estudio Emerald)" : "Virtual";
}

function bookingDetailsText(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const lines = [
    `Modalidad: ${modeLabel(booking.mode)}`,
    `Horario: ${slotLabel}`,
    `Duración: ${booking.durationMin} min`,
    `Nombre: ${booking.clientName}`,
    `Teléfono: ${booking.phone}`,
  ];
  if (booking.mode === "presencial") {
    lines.push(`Dirección: ${getStudioFullAddress()}`);
  }
  if (booking.projectNotes) {
    lines.push(`Notas: ${booking.projectNotes}`);
  }
  return lines.join("\n");
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
  const subject = `${BRAND.name} · Asesoría reservada · ${slotLabel}`;
  const text = [
    `Hola ${booking.clientName},`,
    "",
    "Tu asesoría quedó reservada. Estos son los datos:",
    "",
    bookingDetailsText(booking),
    "",
    "Un día antes te escribiremos por correo o WhatsApp para confirmar tu asistencia.",
    "Si confirmas, el cupo queda fijo en la agenda. Si no respondes a tiempo, liberamos el horario para otra persona y te ayudamos a reagendar.",
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d6d3d1">Asesoría reservada</p>
        <h1 style="margin:0 0 16px;font-size:24px;color:#fafaf9">Hola ${booking.clientName}</h1>
        <p style="margin:0 0 20px;color:#d6d3d1">Tu cupo quedó apartado. Revisa los detalles:</p>
        <pre style="white-space:pre-wrap;background:#0c0a09;border:1px solid #292524;border-radius:12px;padding:16px;color:#f5f5f4;font-size:14px">${bookingDetailsText(booking)}</pre>
        <p style="margin:20px 0 0;color:#a8a29e;font-size:14px">Un día antes te contactaremos para confirmar asistencia. Si no confirmas a tiempo, liberamos el horario y podrás reagendar.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: booking.email, subject, html, text });
}

export async function sendAdvisoryAttendanceReminder(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const link = confirmUrl(booking.confirmationToken);
  const subject = `${BRAND.name} · Confirma tu asesoría · ${slotLabel}`;
  const text = [
    `Hola ${booking.clientName},`,
    "",
    `Tu asesoría es mañana: ${slotLabel}.`,
    "",
    "Confirma tu asistencia aquí:",
    link,
    "",
    "Si no confirmas antes de 6 horas del horario, liberamos el cupo para otra persona. Luego podrás reagendar en un nuevo espacio.",
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#fbbf24">Confirmar asistencia</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#fafaf9">¿Vas a asistir?</h1>
        <p style="margin:0 0 8px;color:#d6d3d1">Tu asesoría es <strong>${slotLabel}</strong>.</p>
        <p style="margin:0 0 20px;color:#a8a29e;font-size:14px">Confirma para mantener el cupo en la agenda.</p>
        <a href="${link}" style="display:inline-block;background:#b45309;color:#fffaf0;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Confirmar asistencia</a>
        <p style="margin:20px 0 0;color:#78716c;font-size:13px">Si no confirmas a tiempo, el horario vuelve a estar disponible y te enviamos un enlace para reagendar.</p>
      </div>
    </div>
  `;

  const emailResult = await sendEmail({ to: booking.email, subject, html, text });

  const whatsappBody = [
    `Hola ${booking.clientName}, soy ${BRAND.name}.`,
    `Confirma tu asesoría ${modeLabel(booking.mode)} para ${slotLabel}.`,
    `Enlace: ${link}`,
  ].join(" ");

  const whatsappResult = await sendWhatsApp(booking.phone, whatsappBody);

  return {
    email: emailResult,
    whatsapp: whatsappResult,
  };
}

export async function sendAdvisorySlotReleasedNotice(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const link = rescheduleUrl(booking.confirmationToken);
  const subject = `${BRAND.name} · Cupo liberado · reagenda tu asesoría`;
  const text = [
    `Hola ${booking.clientName},`,
    "",
    `No recibimos confirmación de asistencia para ${slotLabel}, así que liberamos el horario para otra persona.`,
    "",
    "Si aún quieres la asesoría, elige un nuevo cupo aquí:",
    link,
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#fb7185">Cupo liberado</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#fafaf9">¿Quieres reagendar?</h1>
        <p style="margin:0 0 8px;color:#d6d3d1">Liberamos <strong>${slotLabel}</strong> porque no confirmaste a tiempo.</p>
        <p style="margin:0 0 20px;color:#a8a29e;font-size:14px">El horario ya está disponible para otra persona. Si sigues interesado, elige otro espacio:</p>
        <a href="${link}" style="display:inline-block;background:#44403c;color:#fafaf9;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Reagendar asesoría</a>
      </div>
    </div>
  `;

  const emailResult = await sendEmail({ to: booking.email, subject, html, text });

  const whatsappBody = [
    `Hola ${booking.clientName}, liberamos tu cupo de ${slotLabel} por falta de confirmación.`,
    `Reagenda aquí: ${link}`,
  ].join(" ");

  const whatsappResult = await sendWhatsApp(booking.phone, whatsappBody);

  return {
    email: emailResult,
    whatsapp: whatsappResult,
  };
}

export async function sendAdvisoryAttendanceConfirmedEmail(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const subject = `${BRAND.name} · Asistencia confirmada · ${slotLabel}`;
  const text = [
    `Hola ${booking.clientName},`,
    "",
    `Listo: tu asistencia quedó confirmada para ${slotLabel}.`,
    "",
    bookingDetailsText(booking),
    "",
    "Nos vemos pronto.",
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#34d399">Asistencia confirmada</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#fafaf9">Te esperamos</h1>
        <p style="margin:0 0 16px;color:#d6d3d1">Tu cupo quedó fijo en la agenda para <strong>${slotLabel}</strong>.</p>
        <pre style="white-space:pre-wrap;background:#0c0a09;border:1px solid #292524;border-radius:12px;padding:16px;color:#f5f5f4;font-size:14px">${bookingDetailsText(booking)}</pre>
      </div>
    </div>
  `;

  return sendEmail({ to: booking.email, subject, html, text });
}

export async function sendAdvisoryRescheduledEmail(booking: AdvisoryBooking) {
  const slotLabel = formatSlotLabel(booking.startsAt, "es-CO");
  const subject = `${BRAND.name} · Asesoría reagendada · ${slotLabel}`;
  const text = [
    `Hola ${booking.clientName},`,
    "",
    "Tu asesoría quedó reagendada:",
    "",
    bookingDetailsText(booking),
    "",
    "Un día antes te pediremos confirmar asistencia de nuevo.",
    "",
    `— ${BRAND.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#e7e5e4;background:#0c0a09;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1c1917;border:1px solid #44403c;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#fbbf24">Reagendado</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#fafaf9">Nuevo horario</h1>
        <pre style="white-space:pre-wrap;background:#0c0a09;border:1px solid #292524;border-radius:12px;padding:16px;color:#f5f5f4;font-size:14px">${bookingDetailsText(booking)}</pre>
        <p style="margin:16px 0 0;color:#a8a29e;font-size:14px">Te recordaremos confirmar asistencia un día antes.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: booking.email, subject, html, text });
}
