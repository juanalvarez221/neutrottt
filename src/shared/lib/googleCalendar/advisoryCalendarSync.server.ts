import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { ADVISORY_STUDIO_NAME, buildAdvisoryMeetingRoomUrl } from "@/shared/lib/advisoryConfig";
import { formatDateKey, formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getStudioFullAddress } from "@/shared/config/studio";
import {
  brandMeetCalendarConfig,
  getGoogleCalendarConfig,
  isGoogleCalendarEnabled,
  usesSeparateMeetCalendar,
  type GoogleCalendarConfig,
} from "@/shared/lib/googleCalendar/googleCalendarConfig";
import {
  deleteCalendarEvent,
  insertCalendarEvent,
  listCalendarEvents,
  patchCalendarEvent,
  queryBusyIntervals,
  type BusyInterval,
} from "@/shared/lib/googleCalendar/googleCalendarClient.server";
import {
  bogotaDayBounds,
  partitionCalendarAvailability,
  slotFitsAvailability,
} from "@/shared/lib/advisoryAvailability";

/**
 * Disponibilidad pública: bloques Asesorias en la agenda del artista.
 * Reservas: el store interno sigue siendo la fuente de verdad; Calendar es best-effort
 * al crear/actualizar eventos y nunca debe tumbar confirmar/liberar/reagendar.
 * Meet se crea en el Calendar de Neutrottt (meetCalendarId), no en la agenda del artista.
 * El cliente nunca se invita como attendee: el enlace viaja por el correo de marca.
 */
function resolveConfig(): GoogleCalendarConfig | null {
  try {
    return getGoogleCalendarConfig();
  } catch (error) {
    console.error(
      "[google-calendar:config]",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

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
    "Asesoría Neutrottt",
    "",
    "Resumen de la sesión",
    `• Cliente: ${booking.clientName}`,
    `• Modalidad: ${modeLabel}`,
    `• Horario: ${formatSlotLabel(booking.startsAt, "es-CO")}`,
    `• Duración: ${booking.durationMin} min aprox.`,
    `• Estado: ${confirmed ? "Confirmada" : "Pendiente de confirmar"}`,
    `• WhatsApp: ${booking.phone}`,
    `• Email: ${booking.email}`,
    booking.size ? `• Tamaño del proyecto: ${booking.size}` : undefined,
    brief.bodyZone ? `• Zona corporal: ${brief.bodyZone}` : undefined,
    booking.projectNotes || brief.openNote
      ? `• Qué quiere: ${[booking.projectNotes, brief.openNote].filter(Boolean).join(" · ")}`
      : undefined,
    brief.referral ? `• Cómo llegó: ${brief.referral}` : undefined,
    brief.personalValues ? `• Valores: ${brief.personalValues}` : undefined,
    brief.collaborationMode ? `• Colaboración: ${brief.collaborationMode}` : undefined,
    "",
    "Próximos pasos",
    "• Confirma tu asistencia si aplica.",
    booking.mode === "virtual"
      ? "• La sala la crea la cuenta Neutrottt. El enlace llega al cliente por correo de marca."
      : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return {
    summary,
    description,
    location: booking.mode === "presencial" ? getStudioFullAddress() : "Google Meet",
    colorId: booking.mode === "virtual" ? "8" : "5",
  };
}

export type AdvisoryCalendarSyncResult = {
  eventId: string;
  meetingLink?: string;
  meetEventId?: string;
};

function descriptionWithSala(description: string, meetingLink?: string) {
  return meetingLink ? `${description}\n\nSala: ${meetingLink}` : description;
}

function locationWithSala(
  booking: AdvisoryBooking,
  fallback: string,
  meetingLink?: string,
) {
  if (booking.mode === "virtual" && meetingLink) return meetingLink;
  return fallback;
}

/**
 * Evento real en el Calendar de Neutrottt (virtual y presencial).
 * Si Google Meet no sale, el evento se queda igual: el hueco queda marcado.
 */
async function createBrandBookingEvent(
  config: GoogleCalendarConfig,
  booking: AdvisoryBooking,
  confirmed: boolean,
): Promise<{ meetingLink?: string; meetEventId?: string }> {
  if (!usesSeparateMeetCalendar(config)) {
    return {};
  }

  const meetConfig = brandMeetCalendarConfig(config);
  const content = eventContent(booking, confirmed);
  try {
    const brandEvent = await insertCalendarEvent(meetConfig, {
      ...content,
      startsAt: booking.startsAt,
      endsAt: eventEndsAt(booking),
      createMeet: booking.mode === "virtual" && config.createMeet,
    });
    return { meetingLink: brandEvent.hangoutLink, meetEventId: brandEvent.id };
  } catch (error) {
    console.warn(
      "[google-calendar:brand]",
      error instanceof Error ? error.message : String(error),
    );
    return {};
  }
}

async function patchBookingCalendars(
  config: GoogleCalendarConfig,
  booking: AdvisoryBooking,
  payload: {
    summary: string;
    description: string;
    location: string;
    startsAt?: string;
    endsAt?: string;
  },
  meetingLink?: string,
) {
  const description = descriptionWithSala(payload.description, meetingLink);
  const location = locationWithSala(booking, payload.location, meetingLink);
  const patch = {
    ...payload,
    description,
    location,
  };

  await patchCalendarEvent(config, booking.googleCalendarEventId!, patch);

  if (booking.googleMeetEventId && usesSeparateMeetCalendar(config)) {
    try {
      await patchCalendarEvent(brandMeetCalendarConfig(config), booking.googleMeetEventId, patch);
    } catch (error) {
      console.warn(
        "[google-calendar:brand-patch]",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function createBookingEvent(
  config: GoogleCalendarConfig,
  booking: AdvisoryBooking,
  confirmed: boolean,
): Promise<AdvisoryCalendarSyncResult> {
  const content = eventContent(booking, confirmed);
  const separateMeet = usesSeparateMeetCalendar(config);
  const result = await insertCalendarEvent(config, {
    ...content,
    startsAt: booking.startsAt,
    endsAt: eventEndsAt(booking),
    createMeet: booking.mode === "virtual" && config.createMeet && !separateMeet,
  });

  const brandEvent = await createBrandBookingEvent(config, booking, confirmed);
  const meetingLink =
    brandEvent.meetingLink ||
    result.hangoutLink ||
    (booking.mode === "virtual" ? buildAdvisoryMeetingRoomUrl(booking.id) : undefined);

  if (meetingLink && meetingLink !== result.hangoutLink) {
    await patchCalendarEvent(config, result.id, {
      description: descriptionWithSala(content.description, meetingLink),
      location: locationWithSala(booking, content.location, meetingLink),
    });
  }

  if (brandEvent.meetEventId && meetingLink && meetingLink !== brandEvent.meetingLink) {
    try {
      await patchCalendarEvent(brandMeetCalendarConfig(config), brandEvent.meetEventId, {
        description: descriptionWithSala(content.description, meetingLink),
        location: locationWithSala(booking, content.location, meetingLink),
      });
    } catch (error) {
      console.warn(
        "[google-calendar:brand-sala]",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    eventId: result.id,
    meetingLink,
    meetEventId: brandEvent.meetEventId,
  };
}

/** Crea evento provisional al reservar. Devuelve el eventId a persistir, o undefined. */
export async function syncOnReserved(booking: AdvisoryBooking): Promise<AdvisoryCalendarSyncResult | undefined> {
  const config = resolveConfig();
  if (!config) return undefined;
  try {
    return await createBookingEvent(config, booking, false);
  } catch (error) {
    console.warn(
      "[google-calendar:reserved]",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/** Marca el evento como confirmado. Devuelve un nuevo eventId solo si tuvo que crearlo. */
export async function syncOnConfirmed(booking: AdvisoryBooking): Promise<AdvisoryCalendarSyncResult | undefined> {
  const config = resolveConfig();
  if (!config) return undefined;
  try {
    const content = eventContent(booking, true);
    if (booking.googleCalendarEventId) {
      await patchBookingCalendars(
        config,
        booking,
        {
          summary: content.summary,
          description: content.description,
          location: content.location,
        },
        booking.meetingLink,
      );
      return undefined;
    }
    return await createBookingEvent(config, booking, true);
  } catch (error) {
    console.warn(
      "[google-calendar:confirmed]",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/**
 * Reagenda: actualiza el evento existente (vuelve a [PENDIENTE]).
 * Si el patch falla, intenta borrar el anterior y crear uno nuevo.
 * Devuelve un nuevo eventId solo si cambió.
 */
export async function syncOnRescheduled(booking: AdvisoryBooking): Promise<AdvisoryCalendarSyncResult | undefined> {
  const config = resolveConfig();
  if (!config) return undefined;

  const content = eventContent(booking, false);
  const payload = {
    ...content,
    startsAt: booking.startsAt,
    endsAt: eventEndsAt(booking),
  };

  if (booking.googleCalendarEventId) {
    try {
      await patchBookingCalendars(config, booking, payload, booking.meetingLink);
      return undefined;
    } catch (error) {
      console.warn(
        "[google-calendar:reschedule-patch]",
        error instanceof Error ? error.message : String(error),
      );
      try {
        await deleteCalendarEvent(config, booking.googleCalendarEventId);
      } catch {
        // se ignora: seguimos creando uno nuevo.
      }
      if (booking.googleMeetEventId && usesSeparateMeetCalendar(config)) {
        try {
          await deleteCalendarEvent(brandMeetCalendarConfig(config), booking.googleMeetEventId);
        } catch {
          // se ignora: recreamos la sala abajo.
        }
      }
    }
  }

  try {
    return await createBookingEvent(config, booking, false);
  } catch (error) {
    console.warn(
      "[google-calendar:reschedule-create]",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/** Libera: elimina el evento del calendario. */
export async function syncOnReleased(booking: AdvisoryBooking): Promise<void> {
  await removeEvent(booking, "released");
}

/** Cancela: elimina el evento del calendario. */
export async function syncOnCancelled(booking: AdvisoryBooking): Promise<void> {
  await removeEvent(booking, "cancelled");
}

async function removeEvent(booking: AdvisoryBooking, reason: string): Promise<void> {
  const config = resolveConfig();
  if (!config) return;

  if (booking.googleCalendarEventId) {
    try {
      await deleteCalendarEvent(config, booking.googleCalendarEventId);
    } catch (error) {
      console.warn(
        `[google-calendar:${reason}]`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (booking.googleMeetEventId && usesSeparateMeetCalendar(config)) {
    try {
      await deleteCalendarEvent(brandMeetCalendarConfig(config), booking.googleMeetEventId);
    } catch (error) {
      console.warn(
        `[google-calendar:${reason}-meet]`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * Disponibilidad pública: solo bloques cuyo título es Asesorias.
 * Si Calendar está activo, nunca se cae a la plantilla semanal.
 */
export async function getAvailabilityAndBusy(
  timeMin: string,
  timeMax: string,
): Promise<{ windows: BusyInterval[]; busy: BusyInterval[]; calendarEnabled: boolean }> {
  if (!isGoogleCalendarEnabled()) {
    return { windows: [], busy: [], calendarEnabled: false };
  }

  const config = resolveConfig();
  if (!config) {
    console.warn("[google-calendar:availability] GOOGLE_CALENDAR_ENABLED=true pero la config está incompleta.");
    return { windows: [], busy: [], calendarEnabled: true };
  }

  try {
    const events = await listCalendarEvents(config, timeMin, timeMax);
    const partitioned = partitionCalendarAvailability(events);
    return { ...partitioned, calendarEnabled: true };
  } catch (error) {
    console.warn(
      "[google-calendar:availability]",
      error instanceof Error ? error.message : String(error),
    );
    return { windows: [], busy: [], calendarEnabled: true };
  }
}

/** Si Calendar está activo, el horario debe caber en un bloque Asesorias y no pisar otro evento. */
export async function isCalendarSlotOpen(startsAt: string, durationMin: number): Promise<boolean> {
  const bounds = bogotaDayBounds(formatDateKey(new Date(startsAt)));
  const schedule = await getAvailabilityAndBusy(bounds.start, bounds.end);
  if (!schedule.calendarEnabled) return true;
  return slotFitsAvailability({
    startsAt,
    durationMin,
    windows: schedule.windows,
    busy: schedule.busy,
  });
}

/** Bloques ocupados externos para excluir slots. Fail-open: si falla, devuelve []. */
export async function getExternalBusyIntervals(
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  const config = resolveConfig();
  if (!config) return [];
  try {
    return await queryBusyIntervals(config, timeMin, timeMax);
  } catch (error) {
    console.warn(
      "[google-calendar:freebusy]",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}
