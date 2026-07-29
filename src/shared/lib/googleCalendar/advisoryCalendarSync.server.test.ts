import { beforeEach, describe, expect, it, vi } from "vitest";

import { getExternalBusyIntervals, syncOnReserved } from "./advisoryCalendarSync.server";

describe("syncOnReserved (simulated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve eventId y meeting link simulados para asesoría virtual", async () => {
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
      eventId: "sim-cal-AS-1",
      meetingLink: "https://meet.google.com/sim-AS-1",
    });
  });
});

describe("getExternalBusyIntervals (simulated)", () => {
  it("devuelve huecos ocupados dentro del rango pedido", async () => {
    const busy = await getExternalBusyIntervals(
      "2026-07-28T05:00:00.000Z",
      "2026-08-04T05:00:00.000Z",
    );
    expect(busy.length).toBeGreaterThan(0);
    for (const slot of busy) {
      expect(slot.start).toBeTruthy();
      expect(slot.end).toBeTruthy();
      expect(new Date(slot.end).getTime()).toBeGreaterThan(new Date(slot.start).getTime());
    }
  });
});
