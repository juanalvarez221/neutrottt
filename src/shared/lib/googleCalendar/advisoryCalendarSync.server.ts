import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import { ADVISORY_STUDIO_NAME } from "@/shared/lib/advisoryConfig";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { getStudioFullAddress } from "@/shared/config/studio";
import {
  getGoogleCalendarConfig,
  type GoogleCalendarConfig,
} from "@/shared/lib/googleCalendar/googleCalendarConfig";
import {
  deleteCalendarEvent,
  insertCalendarEvent,
  patchCalendarEvent,
  queryBusyIntervals,
  type BusyInterval,
} from "@/shared/lib/googleCalendar/googleCalendarClient.server";

/**
 * Capa de sincronización con Google Calendar para asesorías.
 * REGLA: el sistema interno es la fuente de verdad. Estas funciones son best-effort:
 * nunca lanzan errores que rompan reservar/confirmar/liberar/reagendar.
 * Un error de configuración (habilitado pero incompleto) se registra de forma clara en server.
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
  const summary = `${tag} Asesoría Neutrottt — ${booking.clientName}`;
  const modeLabel =
    booking.mode === "presencial" ? `Presencial (${ADVISORY_STUDIO_NAME})` : "Virtual";
  const brief = booking.brief ?? {};

  // Descripción útil para operar desde Google Calendar (sin imágenes ni base64).
  const rows: Array<[string, string | undefined]> = [
    ["Cliente", booking.clientName],
    ["WhatsApp", booking.phone],
    ["Email", booking.email],
    ["Modalidad", modeLabel],
    ["Duración", `${booking.durationMin} min`],
    ["Fecha y hora", formatSlotLabel(booking.startsAt, "es-CO")],
    ["Estado", confirmed ? "Confirmada" : "Pendiente de confirmar"],
    ["Tamaño", booking.size || "Proyecto grande"],
    ["Zona corporal", brief.bodyZone],
    ["Idea / notas", booking.projectNotes || brief.openNote],
    ["Cómo llegó", brief.referral],
    ["Valores personales", brief.personalValues],
    ["Modo de colaboración", brief.collaborationMode],
    ["Nota abierta", brief.openNote],
    ["Origen", "Cotizador Neutrottt"],
  ];

  const description = rows
    .filter(([, value]) => value && value.trim())
    .map(([label, value]) => `${label}: ${value!.trim()}`)
    .join("\n");

  return {
    summary,
    description,
    location: booking.mode === "presencial" ? getStudioFullAddress() : undefined,
  };
}

/** Crea evento provisional al reservar. Devuelve el eventId a persistir, o undefined. */
export async function syncOnReserved(booking: AdvisoryBooking): Promise<string | undefined> {
  const config = resolveConfig();
  if (!config) return undefined;
  try {
    const content = eventContent(booking, false);
    const result = await insertCalendarEvent(config, {
      ...content,
      startsAt: booking.startsAt,
      endsAt: eventEndsAt(booking),
      createMeet: booking.mode === "virtual" && config.createMeet,
    });
    return result.id;
  } catch (error) {
    console.warn(
      "[google-calendar:reserved]",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/** Marca el evento como confirmado. Devuelve un nuevo eventId solo si tuvo que crearlo. */
export async function syncOnConfirmed(booking: AdvisoryBooking): Promise<string | undefined> {
  const config = resolveConfig();
  if (!config) return undefined;
  try {
    const content = eventContent(booking, true);
    if (booking.googleCalendarEventId) {
      await patchCalendarEvent(config, booking.googleCalendarEventId, {
        summary: content.summary,
        description: content.description,
        location: content.location,
      });
      return undefined;
    }
    const result = await insertCalendarEvent(config, {
      ...content,
      startsAt: booking.startsAt,
      endsAt: eventEndsAt(booking),
      createMeet: booking.mode === "virtual" && config.createMeet,
    });
    return result.id;
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
export async function syncOnRescheduled(booking: AdvisoryBooking): Promise<string | undefined> {
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
      await patchCalendarEvent(config, booking.googleCalendarEventId, payload);
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
    }
  }

  try {
    const result = await insertCalendarEvent(config, {
      ...payload,
      createMeet: booking.mode === "virtual" && config.createMeet,
    });
    return result.id;
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
  if (!config || !booking.googleCalendarEventId) return;
  try {
    await deleteCalendarEvent(config, booking.googleCalendarEventId);
  } catch (error) {
    console.warn(
      `[google-calendar:${reason}]`,
      error instanceof Error ? error.message : String(error),
    );
  }
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
