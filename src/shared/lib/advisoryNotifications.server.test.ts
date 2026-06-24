import { describe, expect, it } from "vitest";
import type { AdvisoryBooking } from "./advisoryTypes";
import { buildAdvisoryBookingDetailsText } from "./advisoryNotifications.server";

describe("buildAdvisoryBookingDetailsText", () => {
  it("incluye el enlace de reunión y la nota de envío por correo y WhatsApp", () => {
    const booking: AdvisoryBooking = {
      id: "AS-1",
      mode: "virtual",
      startsAt: "2026-06-24T15:00:00.000Z",
      durationMin: 30,
      clientName: "Camila",
      phone: "3000000000",
      email: "camila@example.com",
      createdAt: "2026-06-24T12:00:00.000Z",
      status: "reserved",
      confirmationToken: "token-1",
      projectNotes: "Quiero un diseño limpio",
      meetingLink: "https://meet.google.com/abc-defg-hij",
    };

    const text = buildAdvisoryBookingDetailsText(booking);

    expect(text).toContain("Reunión:");
    expect(text).toContain("https://meet.google.com/abc-defg-hij");
    expect(text).toContain("Detalles también enviados por correo y WhatsApp.");
  });
});
