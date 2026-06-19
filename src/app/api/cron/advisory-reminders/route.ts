import { NextResponse } from "next/server";
import {
  createConfirmationToken,
  shouldReleaseUnconfirmedSlot,
  shouldSendAttendanceReminder,
} from "@/shared/lib/advisoryBookingLifecycle";
import {
  sendAdvisoryAttendanceReminder,
  sendAdvisorySlotReleasedNotice,
} from "@/shared/lib/advisoryNotifications.server";
import {
  loadAdvisoryStore,
  updateAdvisoryBooking,
} from "@/shared/lib/advisoryStore.server";
import { syncOnReleased } from "@/shared/lib/googleCalendar/advisoryCalendarSync.server";
import { sendAdvisoryChangeInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const store = await loadAdvisoryStore();
    const now = Date.now();
    const reminders: string[] = [];
    const releases: string[] = [];

    for (const booking of store.bookings) {
      if (shouldSendAttendanceReminder(booking, now)) {
        await sendAdvisoryAttendanceReminder(booking);
        await updateAdvisoryBooking(booking.id, {
          reminderSentAt: new Date().toISOString(),
        });
        reminders.push(booking.id);
      }
    }

    const refreshed = await loadAdvisoryStore();
    for (const booking of refreshed.bookings) {
      if (shouldReleaseUnconfirmedSlot(booking, now)) {
        const newToken = createConfirmationToken();
        const released = await updateAdvisoryBooking(booking.id, {
          status: "released",
          releasedAt: new Date().toISOString(),
          confirmationToken: newToken,
        });
        if (released) {
          await syncOnReleased(booking);
          if (booking.googleCalendarEventId) {
            await updateAdvisoryBooking(booking.id, {}, { unset: ["googleCalendarEventId"] });
          }
          await sendAdvisoryChangeInternalEmail(released, "released");
          await sendAdvisorySlotReleasedNotice(released);
        }
        releases.push(booking.id);
      }
    }

    return NextResponse.json({
      ok: true,
      remindersSent: reminders.length,
      slotsReleased: releases.length,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo ejecutar el cron." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
