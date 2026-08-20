import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { ADVISORY_STUDIO_NAME, buildAdvisoryMeetingRoomUrl } from "@/shared/lib/advisoryConfig";
import { formatDateKey, formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getStudioFullAddress } from "@/shared/config/studio";
import {
  brandMeetCalendarConfig,
  getGoogleCalendarConfig,
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
  isAdvisoryAvailabilityTitle,
  slotFitsAvailability,
} from "@/shared/lib/advisoryAvailability";

/**
 * Capa de sincronización con Google Calendar para asesorías.
 * REGLA: el sistema interno es la fuente de verdad. Estas funciones son best-effort:
 * nunca lanzan errores que rompan reservar/confirmar/liberar/reagendar.
 * Un error de configuración (habilitado pero incompleto) se registra de forma clara en server.
 *
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

function meetEventContent(booking: AdvisoryBooking) {
  return {
    summary: `Asesoría virtual · ${booking.clientName}`,
    description: [
      "Sala Neutrottt",
      `Cliente: ${booking.clientName}`,
      `Horario: ${formatSlotLabel(booking.startsAt, "es-CO")}`,
      `Duración: ${booking.durationMin} min aprox.`,
    ].join("\n"),
    location: "Google Meet",
    colorId: "8",
  };
}

async function createBrandMeeting(
  config: GoogleCalendarConfig,
  booking: AdvisoryBooking,
): Promise<{ meetingLink?: string; meetEventId?: string }> {
  if (booking.mode !== "virtual" || !config.createMeet || !usesSeparateMeetCalendar(config)) {
    return {};
  }

  const meetConfig = brandMeetCalendarConfig(config);
  try {
    const meetEvent = await insertCalendarEvent(meetConfig, {
      ...meetEventContent(booking),
      startsAt: booking.startsAt,
      endsAt: eventEndsAt(booking),
      createMeet: true,
    });
    if (meetEvent.hangoutLink) {
      return { meetingLink: meetEvent.hangoutLink, meetEventId: meetEvent.id };
    }
    if (meetEvent.id) {
      try {
        await deleteCalendarEvent(meetConfig, meetEvent.id);
      } catch {
        // sala vacía: no dejamos el evento huérfano si podemos evitarlo
      }
    }
  } catch (error) {
    console.warn(
      "[google-calendar:meet]",
      error instanceof Error ? error.message : String(error),
    );
  }
  return {};
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

  const brandMeet = await createBrandMeeting(config, booking);
  const meetingLink =
    brandMeet.meetingLink ||
    result.hangoutLink ||
    (booking.mode === "virtual" ? buildAdvisoryMeetingRoomUrl(booking.id) : undefined);

  if (meetingLink && meetingLink !== result.hangoutLink) {
    await patchCalendarEvent(config, result.id, {
      description: `${content.description}\n\nSala: ${meetingLink}`,
      location: booking.mode === "presencial" ? content.location : meetingLink,
    });
  }

  return {
    eventId: result.id,
    meetingLink,
    meetEventId: brandMeet.meetEventId,
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
      const description = booking.meetingLink
        ? `${content.description}\n\nSala: ${booking.meetingLink}`
        : content.description;
      await patchCalendarEvent(config, booking.googleCalendarEventId, {
        summary: content.summary,
        description,
        location:
          booking.meetingLink && booking.mode === "virtual" ? booking.meetingLink : content.location,
      });
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
      const description = booking.meetingLink
        ? `${content.description}\n\nSala: ${booking.meetingLink}`
        : content.description;
      await patchCalendarEvent(config, booking.googleCalendarEventId, {
        ...payload,
        description,
        location:
          booking.meetingLink && booking.mode === "virtual" ? booking.meetingLink : payload.location,
      });
      if (booking.googleMeetEventId && usesSeparateMeetCalendar(config)) {
        try {
          await patchCalendarEvent(brandMeetCalendarConfig(config), booking.googleMeetEventId, {
            ...meetEventContent(booking),
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
          });
        } catch (error) {
          console.warn(
            "[google-calendar:reschedule-meet]",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
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

/** Bloques Asesorias (disponibles) y el resto ocupado. Fail-open: windows=[], busy=[]. */
export async function getAvailabilityAndBusy(
  timeMin: string,
  timeMax: string,
): Promise<{ windows: BusyInterval[]; busy: BusyInterval[]; calendarEnabled: boolean }> {
  const config = resolveConfig();
  if (!config) return { windows: [], busy: [], calendarEnabled: false };
  try {
    const events = await listCalendarEvents(config, timeMin, timeMax);
    const windows: BusyInterval[] = [];
    const busy: BusyInterval[] = [];
    for (const event of events) {
      const interval = { start: event.start, end: event.end };
      if (isAdvisoryAvailabilityTitle(event.summary)) windows.push(interval);
      else busy.push(interval);
    }
    return { windows, busy, calendarEnabled: true };
  } catch (error) {
    console.warn(
      "[google-calendar:availability]",
      error instanceof Error ? error.message : String(error),
    );
    return { windows: [], busy: [], calendarEnabled: false };
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
