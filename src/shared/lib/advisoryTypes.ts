export type AdvisoryMode = "presencial" | "virtual";

/** reserved = cupo apartado, falta confirmar asistencia · confirmed = asistencia confirmada */
export type AdvisoryBookingStatus = "reserved" | "confirmed" | "released" | "cancelled";

/**
 * Brief liviano del cliente capturado en el cotizador.
 * Solo metadata textual: nada de imágenes ni base64.
 */
export type AdvisoryClientBrief = {
  bodyZone?: string;
  referral?: string;
  personalValues?: string;
  collaborationMode?: string;
  openNote?: string;
};

export type AdvisoryBooking = {
  id: string;
  mode: AdvisoryMode;
  startsAt: string;
  durationMin: number;
  clientName: string;
  phone: string;
  email: string;
  projectNotes?: string;
  size?: string;
  createdAt: string;
  status: AdvisoryBookingStatus;
  confirmationToken: string;
  bookingEmailSentAt?: string;
  reminderSentAt?: string;
  attendanceConfirmedAt?: string;
  releasedAt?: string;
  previousStartsAt?: string;
  googleCalendarEventId?: string;
  brief?: AdvisoryClientBrief;
};

export type ModeAvailability = {
  durationMin: number;
  weekly: Record<string, string[]>;
};

export type AdvisoryStore = {
  timezone: string;
  horizonDays: number;
  presencial: ModeAvailability;
  virtual: ModeAvailability;
  blockedDates: string[];
  bookings: AdvisoryBooking[];
};

export type AdvisorySlot = {
  startsAt: string;
  label: string;
  dateKey: string;
  time: string;
};
