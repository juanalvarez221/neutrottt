import { describe, expect, it } from "vitest";
import {
  isAdvisoryAvailabilityTitle,
  partitionCalendarAvailability,
  sliceAvailabilityWindows,
  slotFitsAvailability,
} from "./advisoryAvailability";
import type { AdvisoryStore } from "./advisoryTypes";

const emptyStore: AdvisoryStore = {
  timezone: "America/Bogota",
  horizonDays: 14,
  presencial: { durationMin: 30, weekly: {} },
  virtual: { durationMin: 15, weekly: {} },
  blockedDates: [],
  bookings: [],
};

describe("isAdvisoryAvailabilityTitle", () => {
  it("acepta Asesorias y Asesorías, con o sin acento", () => {
    expect(isAdvisoryAvailabilityTitle("Asesorias")).toBe(true);
    expect(isAdvisoryAvailabilityTitle("Asesorías")).toBe(true);
    expect(isAdvisoryAvailabilityTitle("asesoria")).toBe(true);
    expect(isAdvisoryAvailabilityTitle("Asesorias virtual")).toBe(true);
    expect(isAdvisoryAvailabilityTitle("[PENDIENTE] Virtual · Camila")).toBe(false);
    expect(isAdvisoryAvailabilityTitle("Reunión")).toBe(false);
  });
});

describe("partitionCalendarAvailability", () => {
  const block = {
    start: "2026-08-22T19:00:00.000Z",
    end: "2026-08-22T21:00:00.000Z",
  };

  it("abre cupos solo con título Asesorias", () => {
    const { windows, busy } = partitionCalendarAvailability([
      { ...block, summary: "Asesorías" },
      { ...block, summary: "Tatuaje sesión" },
    ]);
    expect(windows).toEqual([block]);
    expect(busy).toHaveLength(1);
  });

  it("no deja que ubicación laboral o eventos libres tapen Asesorias", () => {
    const { windows, busy } = partitionCalendarAvailability([
      { ...block, summary: "Asesorias" },
      {
        start: "2026-08-22T00:00:00.000Z",
        end: "2026-08-23T00:00:00.000Z",
        summary: "Office",
        eventType: "workingLocation",
      },
      {
        start: "2026-08-22T20:00:00.000Z",
        end: "2026-08-22T20:30:00.000Z",
        summary: "Recordatorio",
        transparency: "transparent",
      },
    ]);
    expect(windows).toHaveLength(1);
    expect(busy).toEqual([]);
  });
});

describe("sliceAvailabilityWindows", () => {
  const window = {
    start: "2026-08-22T01:00:00.000Z",
    end: "2026-08-22T02:00:00.000Z",
  };

  it("parte 60 min en huecos de 15 para virtual", () => {
    const slots = sliceAvailabilityWindows({
      windows: [window],
      busy: [],
      store: emptyStore,
      durationMin: 15,
      dateKey: "2026-08-21",
      nowMs: Date.parse("2026-08-21T12:00:00.000Z"),
    });
    expect(slots.map((slot) => slot.time)).toEqual(["20:00", "20:15", "20:30", "20:45"]);
  });

  it("parte 60 min en huecos de 30 para presencial", () => {
    const slots = sliceAvailabilityWindows({
      windows: [window],
      busy: [],
      store: emptyStore,
      durationMin: 30,
      dateKey: "2026-08-21",
      nowMs: Date.parse("2026-08-21T12:00:00.000Z"),
    });
    expect(slots.map((slot) => slot.time)).toEqual(["20:00", "20:30"]);
  });

  it("oculta huecos que pisan otro evento", () => {
    const slots = sliceAvailabilityWindows({
      windows: [window],
      busy: [{ start: "2026-08-22T01:15:00.000Z", end: "2026-08-22T01:30:00.000Z" }],
      store: emptyStore,
      durationMin: 15,
      dateKey: "2026-08-21",
      nowMs: Date.parse("2026-08-21T12:00:00.000Z"),
    });
    expect(slots.map((slot) => slot.time)).toEqual(["20:00", "20:30", "20:45"]);
  });
});

describe("slotFitsAvailability", () => {
  it("acepta un hueco dentro de Asesorias y rechaza fuera", () => {
    const windows = [{ start: "2026-08-22T01:00:00.000Z", end: "2026-08-22T02:00:00.000Z" }];
    expect(
      slotFitsAvailability({
        startsAt: "2026-08-22T01:00:00.000Z",
        durationMin: 15,
        windows,
        busy: [],
      }),
    ).toBe(true);
    expect(
      slotFitsAvailability({
        startsAt: "2026-08-22T02:00:00.000Z",
        durationMin: 15,
        windows,
        busy: [],
      }),
    ).toBe(false);
  });
});
