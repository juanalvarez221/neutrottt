import type { AdvisoryMode } from "@/shared/lib/advisoryTypes";

export const ADVISORY_DURATIONS: Record<AdvisoryMode, number> = {
  presencial: 30,
  virtual: 15,
};

export const ADVISORY_STUDIO_NAME = "Estudio Emerald";

export function getAdvisoryDurationMin(mode: AdvisoryMode): number {
  return ADVISORY_DURATIONS[mode];
}

/** Sala de respaldo con marca Neutrottt si Google Meet no está disponible. */
export function buildAdvisoryMeetingRoomUrl(bookingId: string) {
  return `https://meet.jit.si/Neutrottt-${bookingId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

export function resolveVirtualMeetingLink(mode: AdvisoryMode, bookingId: string, existing?: string) {
  if (mode !== "virtual") return existing;
  return existing?.trim() || buildAdvisoryMeetingRoomUrl(bookingId);
}
