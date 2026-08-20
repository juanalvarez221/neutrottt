import { describe, expect, it } from "vitest";
import type { AdvisoryBooking } from "@/shared/lib/advisoryTypes";
import type { QuoteRequestRecord } from "@/shared/lib/storage/quoteRequestStore.server";
import {
  buildAdvisoryArtistBriefingRows,
  buildQuoteArtistBriefingRows,
} from "./internalArtistNotifications.server";

describe("buildAdvisoryArtistBriefingRows", () => {
  it("incluye contacto, cita y todo lo que el cliente quiere", () => {
    const booking: AdvisoryBooking = {
      id: "AS-88",
      mode: "virtual",
      startsAt: "2026-06-24T15:00:00.000Z",
      durationMin: 15,
      clientName: "Camila Restrepo",
      phone: "3008471928",
      email: "camila.restrepo@example.com",
      createdAt: "2026-06-24T12:00:00.000Z",
      status: "reserved",
      confirmationToken: "token-1",
      projectNotes: "Espalda con sombras, pieza larga",
      size: "grande",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      googleCalendarEventId: "event-1",
      brief: {
        bodyZone: "Espalda completa",
        referral: "Instagram",
        personalValues: "Oscuro y preciso",
        collaborationMode: "Que Neutro lidere",
        openNote: "Quiere empezar en octubre",
      },
    };

    const text = buildAdvisoryArtistBriefingRows(booking)
      .map((row) => `${row.label}: ${row.value}`)
      .join("\n");

    expect(text).toContain("Camila Restrepo");
    expect(text).toContain("3008471928");
    expect(text).toContain("camila.restrepo@example.com");
    expect(text).toContain("Espalda con sombras, pieza larga");
    expect(text).toContain("Espalda completa");
    expect(text).toContain("Instagram");
    expect(text).toContain("Oscuro y preciso");
    expect(text).toContain("Que Neutro lidere");
    expect(text).toContain("Quiere empezar en octubre");
    expect(text).toContain("https://meet.google.com/abc-defg-hij");
    expect(text).toContain("AS-88");
  });
});

describe("buildQuoteArtistBriefingRows", () => {
  it("incluye el brief completo y el enlace para ajustar la cifra oficial", () => {
    const record: QuoteRequestRecord = {
      id: "SQ-12",
      clientName: "Mateo Duque",
      whatsapp: "3004128891",
      email: "mateo.duque@example.com",
      projectSize: "mediano",
      bodyPlacement: "Antebrazo izquierdo",
      referenceNotes: "Lettering con sombra, pieza de 18 cm",
      style: "Sombras",
      connectionAnswers: {
        referral: "Instagram",
        values: "Oscuro y preciso",
        collaboration: "Que Neutro lidere",
        purpose: "Quiere sentarse en septiembre",
      },
      estimateSessions: "2 a 4 sesiones",
      estimatePerSession: "Días aparte: $1.500.000",
      estimateTotal: "$3.000.000 - $6.000.000",
      statusLabel: "Pendiente de Ajuste",
      statusSlug: "pending_adjustment",
      createdAt: "2026-06-24T12:00:00.000Z",
      updatedAt: "2026-06-24T12:00:00.000Z",
    };

    const text = buildQuoteArtistBriefingRows(record)
      .map((row) => `${row.label}: ${row.value}`)
      .join("\n");

    expect(text).toContain("Mateo Duque");
    expect(text).toContain("3004128891");
    expect(text).toContain("Lettering con sombra, pieza de 18 cm");
    expect(text).toContain("Instagram");
    expect(text).toContain("Que Neutro lidere");
    expect(text).toContain("/admin/cotizaciones/SQ-12");
  });
});

