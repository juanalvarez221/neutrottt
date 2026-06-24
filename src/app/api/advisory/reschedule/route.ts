import { NextResponse } from "next/server";
import { sendAdvisoryRescheduledEmail } from "@/shared/lib/advisoryNotifications.server";
import { formatSlotLabel, isSlotTaken } from "@/shared/lib/advisorySlots";
import {
  getAdvisoryBookingByToken,
  loadAdvisoryStore,
  updateAdvisoryBooking,
} from "@/shared/lib/advisoryStore.server";
import { syncOnRescheduled } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { sendAdvisoryChangeInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";

export const dynamic = "force-dynamic";

type RescheduleBody = {
  token?: string;
  startsAt?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RescheduleBody;
    const token = body.token?.trim();
    const startsAt = body.startsAt?.trim();

    if (!token || !startsAt) {
      return NextResponse.json({ error: "Faltan datos para reagendar." }, { status: 400 });
    }

    const booking = await getAdvisoryBookingByToken(token);
    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
    }

    if (booking.status !== "released") {
      return NextResponse.json(
        { error: "Solo puedes reagendar cupos liberados por falta de confirmación." },
        { status: 409 },
      );
    }

    const store = await loadAdvisoryStore();
    const durationMin = store[booking.mode].durationMin;

    if (isSlotTaken(store, startsAt, durationMin)) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible. Elige otro." },
        { status: 409 },
      );
    }

    const updated = await updateAdvisoryBooking(
      booking.id,
      {
        startsAt,
        status: "reserved",
        previousStartsAt: booking.startsAt,
        bookingEmailSentAt: new Date().toISOString(),
      },
      {
        unset: ["reminderSentAt", "attendanceConfirmedAt", "releasedAt"],
      },
    );

    if (!updated) {
      return NextResponse.json({ error: "No se pudo reagendar." }, { status: 500 });
    }

    const googleSync = await syncOnRescheduled(updated);
    if (googleSync) {
      updated.googleCalendarEventId = googleSync.eventId;
      updated.meetingLink = googleSync.meetingLink;
      await updateAdvisoryBooking(updated.id, {
        googleCalendarEventId: googleSync.eventId,
        ...(googleSync.meetingLink ? { meetingLink: googleSync.meetingLink } : {}),
      });
    }

    await sendAdvisoryChangeInternalEmail(updated, "rescheduled");
    await sendAdvisoryRescheduledEmail(updated);

    return NextResponse.json({
      ok: true,
      booking: {
        id: updated.id,
        label: formatSlotLabel(updated.startsAt, "es-CO"),
        confirmationToken: updated.confirmationToken,
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo reagendar la asesoría." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const booking = await getAdvisoryBookingByToken(token);
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      clientName: booking.clientName,
      mode: booking.mode,
      status: booking.status,
      previousLabel: booking.previousStartsAt
        ? formatSlotLabel(booking.previousStartsAt, "es-CO")
        : formatSlotLabel(booking.startsAt, "es-CO"),
    },
  });
}
