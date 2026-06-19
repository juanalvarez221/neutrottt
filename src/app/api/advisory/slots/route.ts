import { NextResponse } from "next/server";
import { loadAdvisoryStore, saveAdvisoryStore } from "@/shared/lib/advisoryStore.server";
import { getSlotsForDay, listUpcomingDays } from "@/shared/lib/advisorySlots";
import type { AdvisoryMode, AdvisorySlot } from "@/shared/lib/advisoryTypes";
import { getExternalBusyIntervals } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { rangeOverlapsBusy, type BusyInterval } from "@/shared/lib/googleCalendar/googleCalendarClient.server";

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
      const dayStart = new Date(`${dateKey}T00:00:00-05:00`).toISOString();
      const dayEnd = new Date(`${dateKey}T23:59:59-05:00`).toISOString();
      const busy = await getExternalBusyIntervals(dayStart, dayEnd);
      const slots = filterSlotsByBusy(
        getSlotsForDay(store, mode as AdvisoryMode, dateKey),
        durationMin,
        busy,
      );
      return NextResponse.json({ date: dateKey, mode, slots });
    }

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + store.horizonDays * 86_400_000).toISOString();
    const busy = await getExternalBusyIntervals(timeMin, timeMax);

    const days = listUpcomingDays(store.horizonDays).map((day) => ({
      date: day,
      slots: filterSlotsByBusy(getSlotsForDay(store, mode as AdvisoryMode, day), durationMin, busy),
    }));

    return NextResponse.json({
      mode,
      durationMin,
      studioName: mode === "presencial" ? "Estudio Emerald" : undefined,
      days,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la agenda." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const pin = request.headers.get("x-advisory-pin");
  if (!pin || pin !== process.env.ADVISORY_ADMIN_PIN) {
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
