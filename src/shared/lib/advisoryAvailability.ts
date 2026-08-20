import type { BusyInterval } from "@/shared/lib/googleCalendar/googleCalendarClient.server";
import type { AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { formatSlotLabel, isSlotTaken, parseBogotaSlot } from "@/shared/lib/advisorySlots";
import type { AdvisoryStore } from "@/shared/lib/advisoryTypes";

const STEP_MIN = 15;

export function isAdvisoryAvailabilityTitle(summary?: string | null): boolean {
  const normalized = (summary ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const compact = normalized.replace(/\s+/g, " ");
  return (
    compact === "asesorias" ||
    compact === "asesoria" ||
    compact.startsWith("asesorias ") ||
    compact.startsWith("asesoria ")
  );
}

function formatTimeKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function snapUpToStep(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

function snapDownToStep(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}

/** Parte ventanas Asesorias en huecos de durationMin, sin pisar busy ni reservas internas. */
export function sliceAvailabilityWindows(input: {
  windows: BusyInterval[];
  busy: BusyInterval[];
  store: AdvisoryStore;
  durationMin: number;
  dateKey: string;
  nowMs?: number;
}): AdvisorySlot[] {
  const stepMs = STEP_MIN * 60_000;
  const durationMs = input.durationMin * 60_000;
  if (input.store.blockedDates.includes(input.dateKey)) return [];

  const nowMs = input.nowMs ?? Date.now();
  const slots: AdvisorySlot[] = [];

  for (const window of input.windows) {
    const windowStart = new Date(window.start).getTime();
    const windowEnd = new Date(window.end).getTime();
    let cursor = snapUpToStep(windowStart, stepMs);
    const lastStart = snapDownToStep(windowEnd - durationMs, stepMs);

    while (cursor <= lastStart) {
      const startsAt = new Date(cursor).toISOString();
      const endsAt = new Date(cursor + durationMs).toISOString();
      const fitsWindow = cursor >= windowStart && cursor + durationMs <= windowEnd;
      const open =
        fitsWindow &&
        cursor > nowMs &&
        !rangeOverlaps(startsAt, endsAt, input.busy) &&
        !isSlotTaken(input.store, startsAt, input.durationMin);

      if (open) {
        slots.push({
          startsAt,
          label: formatSlotLabel(startsAt, "es-CO"),
          dateKey: input.dateKey,
          time: formatTimeKey(new Date(cursor)),
        });
      }
      cursor += durationMs;
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return slots;
}

function rangeOverlaps(startsAt: string, endsAt: string, busy: BusyInterval[]): boolean {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return busy.some((interval) => {
    const busyStart = new Date(interval.start).getTime();
    const busyEnd = new Date(interval.end).getTime();
    return start < busyEnd && end > busyStart;
  });
}

export function slotFitsAvailability(input: {
  startsAt: string;
  durationMin: number;
  windows: BusyInterval[];
  busy: BusyInterval[];
}): boolean {
  const start = new Date(input.startsAt).getTime();
  const end = start + input.durationMin * 60_000;
  const insideWindow = input.windows.some((window) => {
    const windowStart = new Date(window.start).getTime();
    const windowEnd = new Date(window.end).getTime();
    return start >= windowStart && end <= windowEnd;
  });
  if (!insideWindow) return false;
  return !rangeOverlaps(input.startsAt, new Date(end).toISOString(), input.busy);
}

export function bogotaDayBounds(dateKey: string): { start: string; end: string } {
  const start = parseBogotaSlot(dateKey, "00:00");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
