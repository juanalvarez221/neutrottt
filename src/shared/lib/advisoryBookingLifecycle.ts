import type { AdvisoryBooking, AdvisoryBookingStatus } from "@/shared/lib/advisoryTypes";

/** Cupos que bloquean la agenda pública. */
export function advisoryBookingBlocksSlot(status: AdvisoryBookingStatus) {
  return status === "reserved" || status === "confirmed";
}

export function hoursUntilAppointment(startsAt: string, now = Date.now()) {
  return (new Date(startsAt).getTime() - now) / 3_600_000;
}

export function shouldSendAttendanceReminder(booking: AdvisoryBooking, now = Date.now()) {
  if (booking.status !== "reserved") return false;
  if (booking.reminderSentAt) return false;
  const hours = hoursUntilAppointment(booking.startsAt, now);
  return hours >= 20 && hours <= 30;
}

export function shouldReleaseUnconfirmedSlot(booking: AdvisoryBooking, now = Date.now()) {
  if (booking.status !== "reserved") return false;
  if (booking.attendanceConfirmedAt) return false;
  if (!booking.reminderSentAt) return false;
  return hoursUntilAppointment(booking.startsAt, now) <= 6;
}

export function createConfirmationToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
