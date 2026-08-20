import { NextResponse } from "next/server";
import { loadAdvisoryStore, saveAdvisoryStore } from "@/shared/lib/advisoryStore.server";
import { getSlotsForDay, listUpcomingDays } from "@/shared/lib/advisorySlots";
import type { AdvisoryMode, AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { getAvailabilityAndBusy } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { rangeOverlapsBusy, type BusyInterval } from "@/shared/lib/googleCalendar/googleCalendarClient.server";
import { bogotaDayBounds, sliceAvailabilityWindows } from "@/shared/lib/advisoryAvailability";
import { timingSafeEqual } from "@/shared/lib/adminSession";
import { enforcePublicWrite } from "@/shared/lib/security/guardRequest.server";

export const dynamic = "force-dynamic";

function filterSlotsByBusy(
  slots: AdvisorySlot[],
  durationMin: number,
  busy: BusyInterval[],
): AdvisorySlot[] {
  if (busy.length === 0) return slots;
  return slots.filter((slot) => {
    const endsAt = new Date(new Date(slot.startsAt).getTime() + durationMin * 60_000).toISOString();
    return !rangeOverlapsBusy(slot.startsAt, endsAt, busy);
  });
}

export async function GET(request: Request) {
  const limited = await enforcePublicWrite(request, "slots", { requireSameOrigin: false });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const dateKey = searchParams.get("date");

  if (mode !== "presencial" && mode !== "virtual") {
    return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  }

  try {
    const store = await loadAdvisoryStore();
    const durationMin = store[mode as AdvisoryMode].durationMin;

    if (dateKey) {
      const bounds = bogotaDayBounds(dateKey);
      const schedule = await getAvailabilityAndBusy(bounds.start, bounds.end);
      const slots = schedule.calendarEnabled
        ? sliceAvailabilityWindows({
            windows: schedule.windows,
            busy: schedule.busy,
            store,
            durationMin,
            dateKey,
          })
        : filterSlotsByBusy(
            getSlotsForDay(store, mode as AdvisoryMode, dateKey),
            durationMin,
            schedule.busy,
          );
      return NextResponse.json({ date: dateKey, mode, slots, source: schedule.calendarEnabled ? "calendar" : "weekly" });
    }

    const horizon = listUpcomingDays(store.horizonDays);
    const firstDay = horizon[0];
    const lastDay = horizon[horizon.length - 1];
    if (!firstDay || !lastDay) {
      return NextResponse.json({
        mode,
        durationMin,
        studioName: mode === "presencial" ? "Estudio Emerald" : undefined,
        days: [],
        source: "weekly",
      });
    }

    const range = await getAvailabilityAndBusy(
      bogotaDayBounds(firstDay).start,
      bogotaDayBounds(lastDay).end,
    );

    const days = (
      range.calendarEnabled
        ? horizon.filter((day) => {
            if (store.blockedDates.includes(day)) return false;
            const bounds = bogotaDayBounds(day);
            const dayStart = new Date(bounds.start).getTime();
            const dayEnd = new Date(bounds.end).getTime();
            return range.windows.some((window) => {
              const windowStart = new Date(window.start).getTime();
              const windowEnd = new Date(window.end).getTime();
              return windowStart < dayEnd && windowEnd > dayStart;
            });
          })
        : horizon
    ).map((day) => ({
      date: day,
      slots: [],
    }));

    return NextResponse.json({
      mode,
      durationMin,
      studioName: mode === "presencial" ? "Estudio Emerald" : undefined,
      days,
      source: range.calendarEnabled ? "calendar" : "weekly",
    });
  } catch (error) {
    console.error("[advisory:slots]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo cargar la agenda." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const pin = request.headers.get("x-advisory-pin")?.trim() ?? "";
  const expected = process.env.ADVISORY_ADMIN_PIN?.trim() ?? "";
  if (!expected || !pin || !timingSafeEqual(pin, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      blockedDates?: string[];
      presencial?: { weekly?: Record<string, string[]> };
      virtual?: { weekly?: Record<string, string[]> };
    };
    const store = await loadAdvisoryStore();

    if (body.blockedDates) {
      store.blockedDates = body.blockedDates;
    }
    if (body.presencial?.weekly) {
      store.presencial.weekly = body.presencial.weekly;
    }
    if (body.virtual?.weekly) {
      store.virtual.weekly = body.virtual.weekly;
    }

    await saveAdvisoryStore(store);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la agenda." }, { status: 500 });
  }
}
