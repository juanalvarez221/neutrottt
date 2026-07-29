import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { ADVISORY_STUDIO_NAME } from "@/shared/lib/advisoryConfig";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getStudioFullAddress } from "@/shared/config/studio";
import type { BusyInterval } from "@/shared/lib/googleCalendar/googleCalendarClient.server";
import {
  buildSimulatedBusyIntervals,
  simulateCalendarEventId,
  simulateMeetingLink,
} from "@/shared/lib/googleCalendar/simulatedCalendar.server";

/**
 * Capa de sincronización con Google Calendar para asesorías.
 * SIMULADO: el prototipo no llama a Google; mantiene el mismo shape de retorno
 * para que el día de producción solo se reemplace esta capa.
 * REGLA: el sistema interno es la fuente de verdad. Best-effort: nunca rompe
 * reservar/confirmar/liberar/reagendar.
 */

function eventEndsAt(booking: AdvisoryBooking): string {
  return new Date(new Date(booking.startsAt).getTime() + booking.durationMin * 60_000).toISOString();
}

function eventContent(booking: AdvisoryBooking, confirmed: boolean) {
  const tag = confirmed ? "[CONFIRMADA]" : "[PENDIENTE]";
  const modeLabel =
    booking.mode === "presencial" ? `Presencial (${ADVISORY_STUDIO_NAME})` : "Virtual";
  const summary = `${tag} ${modeLabel} · ${booking.clientName}`;
  const brief = booking.brief ?? {};

  const description = [
    "Asesoría Danniel Cuervo",
    "",
    "Resumen de la sesión",
    `• Cliente: ${booking.clientName}`,
    `• Modalidad: ${modeLabel}`,
    `• Horario: ${formatSlotLabel(booking.startsAt, "es-CO")}`,
    `• Duración: ${booking.durationMin} min`,
    `• Estado: ${confirmed ? "Confirmada" : "Pendiente de confirmar"}`,
    `• WhatsApp: ${booking.phone}`,
    `• Email: ${booking.email}`,
    booking.size ? `• Tamaño del proyecto: ${booking.size}` : undefined,
    brief.bodyZone ? `• Zona corporal: ${brief.bodyZone}` : undefined,
    booking.projectNotes || brief.openNote
      ? `• Notas: ${[booking.projectNotes, brief.openNote].filter(Boolean).join(", ")}`
      : undefined,
    brief.referral ? `• Cómo llegó: ${brief.referral}` : undefined,
    "",
    "Próximos pasos",
    "• Confirma tu asistencia si aplica.",
    booking.mode === "virtual"
      ? "• El enlace de Google Meet se genera automáticamente para esta sesión."
      : undefined,
    `• Ends: ${eventEndsAt(booking)}`,
    `• Location: ${booking.mode === "presencial" ? getStudioFullAddress() : "Google Meet"}`,
    `• Summary: ${summary}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return { summary, description };
}

/** SIMULADO: crea evento provisional al reservar. */
export async function syncOnReserved(
  booking: AdvisoryBooking,
): Promise<{ eventId: string; meetingLink?: string } | undefined> {
  // SIMULADO: reemplazar con insertCalendarEvent real antes de producción
  const content = eventContent(booking, false);
  console.info("[google-calendar:simulated:reserved]", content.summary);
  return {
    eventId: simulateCalendarEventId(booking.id),
    meetingLink:
      booking.mode === "virtual" ? simulateMeetingLink(booking.id) : undefined,
  };
}

/** SIMULADO: marca el evento como confirmado. */
export async function syncOnConfirmed(
  booking: AdvisoryBooking,
): Promise<{ eventId: string; meetingLink?: string } | undefined> {
  // SIMULADO
  const content = eventContent(booking, true);
  console.info("[google-calendar:simulated:confirmed]", content.summary);
  if (booking.googleCalendarEventId) return undefined;
  return {
    eventId: simulateCalendarEventId(booking.id),
    meetingLink:
      booking.mode === "virtual" ? simulateMeetingLink(booking.id) : undefined,
  };
}

/** SIMULADO: reagenda. */
export async function syncOnRescheduled(
  booking: AdvisoryBooking,
): Promise<{ eventId: string; meetingLink?: string } | undefined> {
  // SIMULADO
  const content = eventContent(booking, false);
  console.info("[google-calendar:simulated:rescheduled]", content.summary, booking.startsAt);
  return {
    eventId: simulateCalendarEventId(booking.id),
    meetingLink:
      booking.mode === "virtual" ? simulateMeetingLink(booking.id) : undefined,
  };
}

/** SIMULADO: libera. */
export async function syncOnReleased(booking: AdvisoryBooking): Promise<void> {
  // SIMULADO
  console.info("[google-calendar:simulated:released]", booking.id);
}

/** SIMULADO: cancela. */
export async function syncOnCancelled(booking: AdvisoryBooking): Promise<void> {
  // SIMULADO
  console.info("[google-calendar:simulated:cancelled]", booking.id);
}

/** SIMULADO: bloques ocupados externos para excluir slots. */
export async function getExternalBusyIntervals(
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  // SIMULADO: reemplazar con queryBusyIntervals real antes de producción
  return buildSimulatedBusyIntervals(timeMin, timeMax);
}
