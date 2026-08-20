import { describe, expect, it } from "vitest";
import { buildOfficialQuoteDetailsText } from "./officialQuoteEmail.server";

describe("buildOfficialQuoteDetailsText", () => {
  it("solo lleva la cifra oficial, no el brief que el cliente ya escribio", () => {
    const text = buildOfficialQuoteDetailsText({
      clientName: "Mateo Duque",
      email: "mateo.duque@example.com",
      projectSize: "mediano",
      bodyPlacement: "Antebrazo izquierdo",
      sessionPrice: 1_500_000,
      sessionCount: 3,
      note: "Pieza de 18 cm, tres jornadas.",
    });

    expect(text).toContain("Sesiones");
    expect(text).toContain("Por sesión");
    expect(text).toContain("Total");
    expect(text).toContain("Pieza de 18 cm, tres jornadas.");
    expect(text).not.toContain("mateo.duque@example.com");
    expect(text).not.toContain("WhatsApp");
  });
});
