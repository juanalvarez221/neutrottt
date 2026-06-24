import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertCalendarEvent, patchCalendarEvent, deleteCalendarEvent, queryBusyIntervals } =
  vi.hoisted(() => ({
    insertCalendarEvent: vi.fn(),
    patchCalendarEvent: vi.fn(),
    deleteCalendarEvent: vi.fn(),
    queryBusyIntervals: vi.fn(),
  }));

vi.mock("@/shared/lib/googleCalendar/googleCalendarConfig", () => ({
  getGoogleCalendarConfig: vi.fn(() => ({
    calendarId: "calendar@example.com",
    clientEmail: "service@example.com",
    privateKey: "secret",
    createMeet: true,
  })),
}));

vi.mock("@/shared/lib/googleCalendar/googleCalendarClient.server", () => ({
  insertCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
  queryBusyIntervals,
}));

import { syncOnReserved } from "./advisoryCalendarSync.server";

describe("syncOnReserved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el enlace de reunión cuando Google Calendar lo genera", async () => {
    insertCalendarEvent.mockResolvedValue({ id: "event-123", hangoutLink: "https://meet.google.com/abc-defg-hij" });

    const result = await syncOnReserved({
      id: "AS-1",
      mode: "virtual",
      startsAt: "2026-06-24T15:00:00.000Z",
      durationMin: 30,
      clientName: "Ana",
      phone: "3000000000",
      email: "ana@example.com",
      createdAt: "2026-06-24T12:00:00.000Z",
      status: "reserved",
      confirmationToken: "token-1",
    });

    expect(result).toEqual({
      eventId: "event-123",
      meetingLink: "https://meet.google.com/abc-defg-hij",
    });
  });
});
