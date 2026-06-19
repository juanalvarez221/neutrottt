import { NextResponse } from "next/server";
import {
  getAdvisoryBookingById,
  updateAdvisoryBooking,
} from "@/shared/lib/advisoryStore.server";
import { syncOnCancelled } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { sendAdvisoryChangeInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";

export const dynamic = "force-dynamic";

type CancelBody = { id?: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CancelBody;
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el id de la asesoría." }, { status: 400 });
    }

    const booking = await getAdvisoryBookingById(id);
    if (!booking) {
      return NextResponse.json({ error: "Asesoría no encontrada." }, { status: 404 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    // Elimina el evento de Google antes de perder el id.
    await syncOnCancelled(booking);

    const updated = await updateAdvisoryBooking(
      id,
      {
        status: "cancelled",
        releasedAt: new Date().toISOString(),
      },
      { unset: ["googleCalendarEventId"] },
    );

    if (!updated) {
      return NextResponse.json({ error: "No se pudo cancelar." }, { status: 500 });
    }

    await sendAdvisoryChangeInternalEmail(updated, "cancelled");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo cancelar la asesoría." }, { status: 500 });
  }
}
