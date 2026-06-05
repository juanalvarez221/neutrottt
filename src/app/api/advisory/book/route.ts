import { NextResponse } from "next/server";
import {
  addAdvisoryBooking,
  loadAdvisoryStore,
} from "@/shared/lib/advisoryStore.server";
import { formatSlotLabel, isSlotTaken } from "@/shared/lib/advisorySlots";
import type { AdvisoryBooking, AdvisoryMode } from "@/shared/lib/advisoryTypes";

export const dynamic = "force-dynamic";

type BookBody = {
  mode?: AdvisoryMode;
  startsAt?: string;
  clientName?: string;
  phone?: string;
  email?: string;
  projectNotes?: string;
  size?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookBody;
    const mode = body.mode;
    const startsAt = body.startsAt?.trim();
    const clientName = body.clientName?.trim();
    const phone = body.phone?.trim();
    const email = body.email?.trim();

    if (mode !== "presencial" && mode !== "virtual") {
      return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
    }
    if (!startsAt || !clientName || !phone || !email) {
      return NextResponse.json({ error: "Faltan datos para reservar." }, { status: 400 });
    }

    const store = await loadAdvisoryStore();
    const durationMin = store[mode].durationMin;

    if (isSlotTaken(store, startsAt, durationMin)) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible. Elige otro." },
        { status: 409 },
      );
    }

    const booking: AdvisoryBooking = {
      id: `AS-${Date.now()}`,
      mode,
      startsAt,
      durationMin,
      clientName,
      phone,
      email,
      projectNotes: body.projectNotes?.trim() || undefined,
      size: body.size?.trim() || undefined,
      createdAt: new Date().toISOString(),
      status: "confirmed",
    };

    await addAdvisoryBooking(booking);

    return NextResponse.json({
      ok: true,
      booking: {
        ...booking,
        label: formatSlotLabel(booking.startsAt, "es-CO"),
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo completar la reserva." }, { status: 500 });
  }
}
