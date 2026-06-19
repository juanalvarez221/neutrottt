import type { GoogleCalendarConfig } from "@/shared/lib/googleCalendar/googleCalendarConfig";
import { getGoogleAccessToken } from "@/shared/lib/googleCalendar/googleAuth.server";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const TIME_ZONE = "America/Bogota";

export type BusyInterval = { start: string; end: string };

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  createMeet?: boolean;
};

export type CalendarEventResult = {
  id: string;
  hangoutLink?: string;
};

function encodeCalendarId(config: GoogleCalendarConfig): string {
  return encodeURIComponent(config.calendarId);
}

/** Consulta los bloques ocupados del calendario en un rango. */
export async function queryBusyIntervals(
  config: GoogleCalendarConfig,
  timeMin: string,
  timeMax: string,
): Promise<BusyInterval[]> {
  const token = await getGoogleAccessToken(config);
  const response = await fetch(`${CALENDAR_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: TIME_ZONE,
      items: [{ id: config.calendarId }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`freeBusy falló (${response.status}). ${detail}`.trim());
  }

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: BusyInterval[] }>;
  };
  return data.calendars?.[config.calendarId]?.busy ?? [];
}

function buildEventBody(input: CalendarEventInput) {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startsAt, timeZone: TIME_ZONE },
    end: { dateTime: input.endsAt, timeZone: TIME_ZONE },
  };
  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `neutrottt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

export async function insertCalendarEvent(
  config: GoogleCalendarConfig,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const token = await getGoogleAccessToken(config);
  const conferenceParam = input.createMeet ? "?conferenceDataVersion=1" : "";
  const response = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events${conferenceParam}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(input)),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Crear evento falló (${response.status}). ${detail}`.trim());
  }

  const data = (await response.json()) as { id: string; hangoutLink?: string };
  return { id: data.id, hangoutLink: data.hangoutLink };
}

export async function patchCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string,
  patch: Partial<CalendarEventInput>,
): Promise<CalendarEventResult> {
  const token = await getGoogleAccessToken(config);
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) body.summary = patch.summary;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.startsAt) body.start = { dateTime: patch.startsAt, timeZone: TIME_ZONE };
  if (patch.endsAt) body.end = { dateTime: patch.endsAt, timeZone: TIME_ZONE };

  const response = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Actualizar evento falló (${response.status}). ${detail}`.trim());
  }

  const data = (await response.json()) as { id: string; hangoutLink?: string };
  return { id: data.id, hangoutLink: data.hangoutLink };
}

export async function deleteCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string,
): Promise<void> {
  const token = await getGoogleAccessToken(config);
  const response = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  // 410 = ya estaba eliminado; lo tratamos como éxito idempotente.
  if (!response.ok && response.status !== 410 && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Eliminar evento falló (${response.status}). ${detail}`.trim());
  }
}

/** ¿El rango [start, end) se solapa con algún bloque ocupado? */
export function rangeOverlapsBusy(
  startsAt: string,
  endsAt: string,
  busy: BusyInterval[],
): boolean {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return busy.some((interval) => {
    const busyStart = new Date(interval.start).getTime();
    const busyEnd = new Date(interval.end).getTime();
    return start < busyEnd && end > busyStart;
  });
}
