import type { GoogleCalendarConfig } from "@/shared/lib/googleCalendar/googleCalendarConfig";
import { getGoogleAccessToken } from "@/shared/lib/googleCalendar/googleAuth.server";
import { googleFetch } from "@/shared/lib/googleCalendar/googleFetch.server";

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
  attendees?: Array<{ email: string }>;
  colorId?: string;
};

export type CalendarEventResult = {
  id: string;
  hangoutLink?: string;
};

export type ListedCalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
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
  const response = await googleFetch(`${CALENDAR_BASE}/freeBusy`, {
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

/** Lista eventos del rango (incluye recurrencias expandidas). */
export async function listCalendarEvents(
  config: GoogleCalendarConfig,
  timeMin: string,
  timeMax: string,
): Promise<ListedCalendarEvent[]> {
  const token = await getGoogleAccessToken(config);
  const events: ListedCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: TIME_ZONE,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await googleFetch(
      `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events?${params.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Listar eventos falló (${response.status}). ${detail}`.trim());
    }

    const data = (await response.json()) as {
      nextPageToken?: string;
      items?: Array<{
        id?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    for (const item of data.items ?? []) {
      const start = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00${"-05:00"}` : "");
      const end = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T00:00:00${"-05:00"}` : "");
      if (!item.id || !start || !end) continue;
      events.push({
        id: item.id,
        summary: item.summary ?? "",
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

function buildEventBody(input: CalendarEventInput) {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    colorId: input.colorId ?? (input.createMeet ? "8" : "5"),
    start: { dateTime: input.startsAt, timeZone: TIME_ZONE },
    end: { dateTime: input.endsAt, timeZone: TIME_ZONE },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  if (input.attendees?.length) {
    body.attendees = input.attendees;
  }

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

function hangoutFromEvent(data: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}): string | undefined {
  return (
    data.hangoutLink ??
    data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri
  );
}

export async function getCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string,
): Promise<CalendarEventResult> {
  const token = await getGoogleAccessToken(config);
  const response = await googleFetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Leer evento falló (${response.status}). ${detail}`.trim());
  }
  const data = (await response.json()) as { id: string } & Parameters<typeof hangoutFromEvent>[0];
  return { id: data.id, hangoutLink: hangoutFromEvent(data) };
}

export async function insertCalendarEvent(
  config: GoogleCalendarConfig,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const token = await getGoogleAccessToken(config);
  const params = new URLSearchParams();
  if (input.createMeet) params.set("conferenceDataVersion", "1");
  if (input.attendees?.length) params.set("sendUpdates", "all");
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await googleFetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(input)),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (input.createMeet && /conference/i.test(detail)) {
      return insertCalendarEvent(config, { ...input, createMeet: false });
    }
    throw new Error(`Crear evento falló (${response.status}). ${detail}`.trim());
  }

  const data = (await response.json()) as { id: string } & Parameters<typeof hangoutFromEvent>[0];
  const hangoutLink = hangoutFromEvent(data);
  if (input.createMeet && !hangoutLink) {
    const fetched = await getCalendarEvent(config, data.id);
    return { id: data.id, hangoutLink: fetched.hangoutLink };
  }
  return { id: data.id, hangoutLink };
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

  const response = await googleFetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
  const response = await googleFetch(
    `${CALENDAR_BASE}/calendars/${encodeCalendarId(config)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
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
