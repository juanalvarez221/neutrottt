import { describe, expect, it } from "vitest";
import { mapCotizacionRow } from "@/shared/lib/storage/postgresQuoteStore.server";

describe("mapCotizacionRow", () => {
  it("traduce la fila SQL al registro de cotización", () => {
    const record = mapCotizacionRow({
      id: "SQ-1",
      client_name: "Camila Restrepo",
      whatsapp: "573001112233",
      email: "camila@estudio.test",
      project_size: "Mediano",
      body_placement: "Brazo",
      reference_notes: "Lettering",
      connection_answers: { referral: "Instagram" },
      collaboration_mode: null,
      advisory_mode: "presencial",
      advisory_scheduled_at: "2026-08-21T15:00:00.000Z",
      advisory_booking_id: "bk-1",
      style: "Sombras",
      estimate_sessions: "2",
      estimate_per_session: "900000",
      estimate_total: "1800000",
      status_label: "Pendiente de Ajuste",
      status_slug: "pending_adjustment",
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T13:00:00.000Z",
      official_session_price: 900000,
      official_session_count: 2,
      official_note: null,
      official_sent_at: null,
    });

    expect(record.clientName).toBe("Camila Restrepo");
    expect(record.advisoryMode).toBe("presencial");
    expect(record.connectionAnswers.referral).toBe("Instagram");
    expect(record.statusSlug).toBe("pending_adjustment");
    expect(record.officialSessionPrice).toBe(900000);
  });
});
