export type AdvisoryMode = "presencial" | "virtual";

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
  status: "confirmed" | "cancelled";
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
