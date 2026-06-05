import { NextResponse } from "next/server";
import { loadAdvisoryStore, saveAdvisoryStore } from "@/shared/lib/advisoryStore.server";
import { getSlotsForDay, listUpcomingDays } from "@/shared/lib/advisorySlots";
import type { AdvisoryMode } from "@/shared/lib/advisoryTypes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const dateKey = searchParams.get("date");

  if (mode !== "presencial" && mode !== "virtual") {
    return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  }

  try {
    const store = await loadAdvisoryStore();

    if (dateKey) {
      return NextResponse.json({
        date: dateKey,
        mode,
        slots: getSlotsForDay(store, mode as AdvisoryMode, dateKey),
      });
    }

    const days = listUpcomingDays(store.horizonDays).map((day) => ({
      date: day,
      slots: getSlotsForDay(store, mode as AdvisoryMode, day),
    }));

    return NextResponse.json({ mode, days });
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
