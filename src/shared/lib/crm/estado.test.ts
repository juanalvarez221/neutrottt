import { describe, expect, it } from "vitest";
import {
  aplicarTransicion,
  estadoObjetivo,
  normalizarEmail,
  normalizarWhatsapp,
} from "@/shared/lib/crm/estado";

describe("máquina de estados CRM", () => {
  it("captura deja crudo, cotización o asesoría suben a prospecto", () => {
    expect(estadoObjetivo("captura")).toBe("crudo");
    expect(aplicarTransicion("crudo", "captura")).toBe("crudo");
    expect(aplicarTransicion("crudo", "cotizacion_enviada")).toBe("prospecto");
    expect(aplicarTransicion("crudo", "asesoria_agendada")).toBe("prospecto");
  });

  it("aceptar cotización o acuerdo en asesoría convierten en cliente", () => {
    expect(aplicarTransicion("prospecto", "cotizacion_aceptada")).toBe("cliente");
    expect(aplicarTransicion("prospecto", "acuerdo_asesoria")).toBe("cliente");
    expect(aplicarTransicion("crudo", "acuerdo_asesoria")).toBe("cliente");
  });

  it("nunca baja de cliente a prospecto o crudo", () => {
    expect(aplicarTransicion("cliente", "captura")).toBe("cliente");
    expect(aplicarTransicion("cliente", "cotizacion_enviada")).toBe("cliente");
    expect(aplicarTransicion("prospecto", "captura")).toBe("prospecto");
  });

  it("normaliza contacto para no duplicar personas", () => {
    expect(normalizarEmail("  Ana@Mail.COM ")).toBe("ana@mail.com");
    expect(normalizarWhatsapp("+57 300 123 4567")).toBe("573001234567");
  });
});
