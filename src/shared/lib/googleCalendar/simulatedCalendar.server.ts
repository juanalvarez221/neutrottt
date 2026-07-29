import type { BusyInterval } from "@/shared/lib/googleCalendar/googleCalendarClient.server";

/** Tue=2 … Sat=6 in America/Bogota */
function bogotaWeekday(isoDate: string): number {
  const label = new Date(`${isoDate}T16:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

function bogotaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * SIMULADO: martes a sábado 11am–7pm (America/Bogota),
 * con algunos huecos ya "ocupados" como fixture.
 */
export function buildSimulatedBusyIntervals(timeMin: string, timeMax: string): BusyInterval[] {
  const rangeStart = new Date(timeMin);
  const rangeEnd = new Date(timeMax);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd <= rangeStart) {
    return [];
  }

  const busy: BusyInterval[] = [];
  const cursor = new Date(rangeStart.getTime());

  for (let i = 0; i < 21; i += 1) {
    const day = bogotaParts(cursor);
    const dow = bogotaWeekday(day);
    if (dow >= 2 && dow <= 6) {
      const occupied =
        dow === 2 || dow === 4 ? [11, 14, 16] : dow === 6 ? [12, 15] : [13, 17];
      for (const hour of occupied) {
        const start = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00-05:00`);
        const end = new Date(start.getTime() + 60 * 60_000);
        if (end > rangeStart && start < rangeEnd) {
          busy.push({ start: start.toISOString(), end: end.toISOString() });
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor > rangeEnd) break;
  }

  return busy;
}

export function simulateCalendarEventId(bookingId: string) {
  return `sim-cal-${bookingId}`;
}

export function simulateMeetingLink(bookingId: string) {
  return `https://meet.google.com/sim-${bookingId.slice(0, 8)}`;
}
