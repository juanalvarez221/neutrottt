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
      calendarId: "neutro@example.com",
      meetCalendarId: "neutrottt.tech@gmail.com",
      clientEmail: "service@example.com",
      privateKey: "secret",
      createMeet: true,
    })),
    isGoogleCalendarEnabled: vi.fn(() => true),
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

import { getAvailabilityAndBusy, isCalendarSlotOpen, syncOnReserved } from "./advisoryCalendarSync.server";

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
      expect.objectContaining({ calendarId: "neutro@example.com" }),
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
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("si Meet no sale, deja el evento en Neutrottt y usa sala de marca", async () => {
    insertCalendarEvent
      .mockResolvedValueOnce({ id: "event-123" })
      .mockResolvedValueOnce({ id: "brand-789" });
    patchCalendarEvent.mockResolvedValue({ id: "event-123" });

    const result = await syncOnReserved(virtualBooking);

    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(insertCalendarEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ calendarId: "neutrottt.tech@gmail.com" }),
      expect.objectContaining({ createMeet: true }),
    );
    expect(result).toEqual({
      eventId: "event-123",
      meetingLink: expect.stringContaining("meet.jit.si/Neutrottt-AS-1"),
      meetEventId: "brand-789",
    });
  });

  it("si el Calendar de Neutrottt no está compartido, bloquea igual en el artista y deja sala de marca", async () => {
    insertCalendarEvent
      .mockResolvedValueOnce({ id: "event-123" })
      .mockRejectedValueOnce(new Error("Calendar no disponible"));
    patchCalendarEvent.mockResolvedValue({ id: "event-123" });

    const result = await syncOnReserved(virtualBooking);

    expect(insertCalendarEvent.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ createMeet: false }));
    expect(result?.eventId).toBe("event-123");
    expect(result?.meetingLink).toContain("meet.jit.si/Neutrottt-AS-1");
    expect(result?.meetEventId).toBeUndefined();
  });

  it("marca también las asesorías presenciales en el Calendar de Neutrottt", async () => {
    insertCalendarEvent
      .mockResolvedValueOnce({ id: "event-presencial" })
      .mockResolvedValueOnce({ id: "brand-presencial" });

    const result = await syncOnReserved({
      ...virtualBooking,
      id: "AS-2",
      mode: "presencial",
      durationMin: 30,
    });

    expect(insertCalendarEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ calendarId: "neutrottt.tech@gmail.com" }),
      expect.objectContaining({ createMeet: false }),
    );
    expect(result).toEqual({
      eventId: "event-presencial",
      meetingLink: undefined,
      meetEventId: "brand-presencial",
    });
  });
});

describe("getAvailabilityAndBusy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lee bloques Asesorias y no cae a weekly si Google falla", async () => {
    listCalendarEvents.mockResolvedValueOnce([
      {
        id: "win",
        summary: "Asesorias",
        start: "2026-08-22T19:00:00.000Z",
        end: "2026-08-22T21:00:00.000Z",
      },
      {
        id: "busy",
        summary: "Sesión",
        start: "2026-08-22T19:30:00.000Z",
        end: "2026-08-22T20:00:00.000Z",
      },
    ]);

    const open = await getAvailabilityAndBusy(
      "2026-08-22T05:00:00.000Z",
      "2026-08-23T05:00:00.000Z",
    );
    expect(open.calendarEnabled).toBe(true);
    expect(open.windows).toHaveLength(1);
    expect(open.busy).toHaveLength(1);

    listCalendarEvents.mockRejectedValueOnce(new Error("403 forbidden"));
    listCalendarEvents.mockRejectedValueOnce(new Error("403 forbidden"));
    const closed = await getAvailabilityAndBusy(
      "2026-08-22T05:00:00.000Z",
      "2026-08-23T05:00:00.000Z",
    );
    expect(closed.calendarEnabled).toBe(true);
    expect(closed.windows).toEqual([]);
    expect(await isCalendarSlotOpen("2026-08-22T19:00:00.000Z", 30)).toBe(false);
  });
});
