import { NextResponse } from "next/server";
import { sendAdvisoryAttendanceConfirmedEmail } from "@/shared/lib/advisoryNotifications.server";
import {
  getAdvisoryBookingByToken,
  updateAdvisoryBooking,
} from "@/shared/lib/advisoryStore.server";
import { formatSlotLabel } from "@/shared/lib/advisorySlots";
import { syncOnConfirmed } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { sendAdvisoryChangeInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";

export const dynamic = "force-dynamic";

type ConfirmBody = {
  token?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConfirmBody;
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "Token inválido." }, { status: 400 });
    }

    const booking = await getAdvisoryBookingByToken(token);
    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
    }

    if (booking.status === "released") {
      return NextResponse.json(
        {
          error: "Este cupo ya fue liberado. Reagenda en un nuevo horario.",
          canReschedule: true,
        },
        { status: 409 },
      );
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Esta reserva fue cancelada." }, { status: 409 });
    }

    if (booking.attendanceConfirmedAt || booking.status === "confirmed") {
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
        booking: {
          id: booking.id,
          label: formatSlotLabel(booking.startsAt, "es-CO"),
          status: "confirmed",
        },
      });
    }

    const updated = await updateAdvisoryBooking(booking.id, {
      status: "confirmed",
      attendanceConfirmedAt: new Date().toISOString(),
    });

    if (!updated) {
      return NextResponse.json({ error: "No se pudo confirmar." }, { status: 500 });
    }

    const googleSync = await syncOnConfirmed(updated);
    if (googleSync) {
      updated.googleCalendarEventId = googleSync.eventId;
      updated.meetingLink = googleSync.meetingLink;
      await updateAdvisoryBooking(updated.id, {
        googleCalendarEventId: googleSync.eventId,
        ...(googleSync.meetingLink ? { meetingLink: googleSync.meetingLink } : {}),
      });
    }

    await sendAdvisoryChangeInternalEmail(updated, "confirmed");
    await sendAdvisoryAttendanceConfirmedEmail(updated);

    return NextResponse.json({
      ok: true,
      booking: {
        id: updated.id,
        label: formatSlotLabel(updated.startsAt, "es-CO"),
        mode: updated.mode,
        status: updated.status,
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar la asistencia." }, { status: 500 });
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
      startsAt: booking.startsAt,
      label: formatSlotLabel(booking.startsAt, "es-CO"),
      status: booking.status,
      attendanceConfirmedAt: booking.attendanceConfirmedAt ?? null,
      canConfirm: booking.status === "reserved",
      canReschedule: booking.status === "released",
    },
  });
}
