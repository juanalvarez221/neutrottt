import type { AdvisoryBooking, AdvisoryMode, AdvisorySlot, AdvisoryStore } from "@/shared/lib/advisoryTypes";

const BOGOTA_OFFSET = "-05:00";

export function formatDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function getWeekdayInBogota(dateKey: string) {
  const date = parseBogotaSlot(dateKey, "12:00");
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
  }).format(date);
  const map: Record<string, string> = {
    Sun: "0",
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
  };
  return map[weekday] ?? "0";
}

export function parseBogotaSlot(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00${BOGOTA_OFFSET}`);
}

export function formatSlotLabel(startsAt: string, locale: string) {
  const date = new Date(startsAt);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDayLabel(dateKey: string, locale: string) {
  const date = parseBogotaSlot(dateKey, "12:00");
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date);
}

function bookingEnd(booking: AdvisoryBooking) {
  return new Date(new Date(booking.startsAt).getTime() + booking.durationMin * 60_000);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export function isSlotTaken(
  store: AdvisoryStore,
  startsAt: string,
  durationMin: number,
  excludeBookingId?: string,
) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return store.bookings.some((booking) => {
    if (booking.status !== "confirmed") return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    return overlaps(start, end, new Date(booking.startsAt), bookingEnd(booking));
  });
}

export function listUpcomingDays(horizonDays: number) {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < horizonDays; i += 1) {
    const day = new Date(now.getTime() + i * 86_400_000);
    days.push(formatDateKey(day));
  }
  return days;
}

export function getSlotsForDay(
  store: AdvisoryStore,
  mode: AdvisoryMode,
  dateKey: string,
): AdvisorySlot[] {
  if (store.blockedDates.includes(dateKey)) return [];

  const weekday = getWeekdayInBogota(dateKey);
  const modeConfig = store[mode];
  const times = modeConfig.weekly[weekday] ?? [];
  const now = Date.now();
  const locale = "es-CO";

  return times
    .map((time) => {
      const startsAtDate = parseBogotaSlot(dateKey, time);
      const startsAt = startsAtDate.toISOString();
      return {
        startsAt,
        label: formatSlotLabel(startsAt, locale),
        dateKey,
        time,
      };
    })
    .filter((slot) => {
      const slotTime = new Date(slot.startsAt).getTime();
      if (slotTime <= now) return false;
      return !isSlotTaken(store, slot.startsAt, modeConfig.durationMin);
    });
}
