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

export async function runAdvisoryRemindersJob() {
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

  return {
    remindersSent: reminders.length,
    slotsReleased: releases.length,
    reminderIds: reminders,
    releasedIds: releases,
  };
}
