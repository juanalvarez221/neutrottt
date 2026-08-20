import { describe, expect, it } from "vitest";
import type { AdvisoryBooking } from "./advisoryTypes";
import {
  buildAdvisoryBookingDetailsText,
  clientReservationFacts,
} from "./advisoryNotifications.server";

const virtualBooking: AdvisoryBooking = {
  id: "AS-1",
  mode: "virtual",
  startsAt: "2026-06-24T15:00:00.000Z",
  durationMin: 15,
  clientName: "Camila",
  phone: "3000000000",
  email: "camila@example.com",
  createdAt: "2026-06-24T12:00:00.000Z",
  status: "reserved",
  confirmationToken: "token-1",
  projectNotes: "Quiero un diseño limpio",
  size: "grande",
  meetingLink: "https://meet.google.com/abc-defg-hij",
  brief: {
    bodyZone: "Brazo derecho",
    referral: "Instagram",
    personalValues: "Oscuro y preciso",
    collaborationMode: "Que Neutro lidere",
    openNote: "Pieza de espalda a largo plazo",
  },
};

describe("clientReservationFacts", () => {
  it("solo incluye lo operativo de la reserva, no el brief que el cliente ya escribió", () => {
    const text = buildAdvisoryBookingDetailsText(virtualBooking);

    expect(text).toContain("Cuándo:");
    expect(text).toContain("Sala:");
    expect(text).toContain("https://meet.google.com/abc-defg-hij");
    expect(text).not.toContain("WhatsApp");
    expect(text).not.toContain("camila@example.com");
    expect(text).not.toContain("3000000000");
    expect(text).not.toContain("Quiero un diseño limpio");
    expect(text).not.toContain("Instagram");
    expect(text).not.toContain("Brazo derecho");
    expect(text).not.toContain("AS-1");
  });

  it("en presencial incluye lugar y mapa, no sala", () => {
    const facts = clientReservationFacts({
      ...virtualBooking,
      mode: "presencial",
      durationMin: 30,
      meetingLink: undefined,
    });
    const labels = facts.map((fact) => fact.label);

    expect(labels).toContain("Lugar");
    expect(labels).toContain("Cómo llegar");
    expect(labels).not.toContain("Sala");
  });
});
