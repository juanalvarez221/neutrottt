import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
  queryBusyIntervals,
  listCalendarEvents,
  getCalendarEvent,
} = vi.hoisted(() => ({
  insertCalendarEvent: vi.fn(),
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  queryBusyIntervals: vi.fn(),
  listCalendarEvents: vi.fn(),
  getCalendarEvent: vi.fn(),
}));

vi.mock("@/shared/lib/googleCalendar/googleCalendarConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./googleCalendarConfig")>();
  return {
    ...actual,
    getGoogleCalendarConfig: vi.fn(() => ({
      calendarId: "gonzalez@example.com",
      meetCalendarId: "neutrottt.tech@gmail.com",
      clientEmail: "service@example.com",
      privateKey: "secret",
      createMeet: true,
    })),
  };
});

vi.mock("@/shared/lib/googleCalendar/googleCalendarClient.server", () => ({
  insertCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
  queryBusyIntervals,
  listCalendarEvents,
  getCalendarEvent,
}));

import { syncOnReserved } from "./advisoryCalendarSync.server";

const virtualBooking = {
  id: "AS-1",
  mode: "virtual" as const,
  startsAt: "2026-06-24T15:00:00.000Z",
  durationMin: 15,
  clientName: "Ana",
  phone: "3000000000",
  email: "ana@example.com",
  createdAt: "2026-06-24T12:00:00.000Z",
  status: "reserved" as const,
  confirmationToken: "token-1",
};

describe("syncOnReserved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea el Meet en el Calendar de Neutrottt, no en la agenda del artista", async () => {
    insertCalendarEvent
      .mockResolvedValueOnce({ id: "event-123" })
      .mockResolvedValueOnce({
        id: "meet-456",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      });
    patchCalendarEvent.mockResolvedValue({ id: "event-123" });

    const result = await syncOnReserved(virtualBooking);

    expect(insertCalendarEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ calendarId: "gonzalez@example.com" }),
      expect.objectContaining({ createMeet: false }),
    );
    expect(insertCalendarEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ calendarId: "neutrottt.tech@gmail.com" }),
      expect.objectContaining({ createMeet: true }),
    );
    expect(result).toEqual({
      eventId: "event-123",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      meetEventId: "meet-456",
    });
  });

  it("si el Meet de Neutrottt falla, deja una sala de marca y no toca la agenda del artista con conferenceData", async () => {
    insertCalendarEvent
      .mockResolvedValueOnce({ id: "event-123" })
      .mockRejectedValueOnce(new Error("Meet no disponible"));
    patchCalendarEvent.mockResolvedValue({ id: "event-123" });

    const result = await syncOnReserved(virtualBooking);

    expect(insertCalendarEvent.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ createMeet: false }));
    expect(result?.eventId).toBe("event-123");
    expect(result?.meetingLink).toContain("meet.jit.si/Neutrottt-AS-1");
    expect(result?.meetEventId).toBeUndefined();
  });
});
