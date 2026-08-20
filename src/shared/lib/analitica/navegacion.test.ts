import { describe, expect, it } from "vitest";
import { construirNavegacionVisitantes } from "@/shared/lib/analitica/navegacion";
import type { EventoBronce } from "@/shared/lib/analitica/tipos";

function hecho(partial: Partial<EventoBronce>): EventoBronce {
  return {
    id_evento: "e1",
    id_sesion: "s1",
    id_visitante: "v1",
    ocurrido_en: "2026-08-20T12:00:00.000Z",
    tipo_evento: "vista_pagina",
    ruta: "/",
    dispositivo: "movil",
    canal_trafico: "directo",
    pais: "CO",
    region: "Antioquia",
    ciudad: "Medellín",
    ingestado_en: "2026-08-20T12:00:01.000Z",
    ...partial,
  };
}

describe("construirNavegacionVisitantes", () => {
  it("agrupa el recorrido por visitante y lo une a la persona", () => {
    const eventos: EventoBronce[] = [
      hecho({ ruta: "/", ocurrido_en: "2026-08-20T12:00:00.000Z" }),
      hecho({
        tipo_evento: "vista_pagina",
        ruta: "/cotizacion",
        ocurrido_en: "2026-08-20T12:01:00.000Z",
      }),
      hecho({
        tipo_evento: "zona_corporal",
        ruta: "/cotizacion/ubicacion",
        etiqueta: "Pecho",
        valor: "chest",
        ocurrido_en: "2026-08-20T12:02:00.000Z",
      }),
    ];
    const [row] = construirNavegacionVisitantes(eventos, [
      { id: "p1", nombre: "Camila Restrepo", id_visitante: "v1" },
    ]);
    expect(row?.persona_nombre).toBe("Camila Restrepo");
    expect(row?.vistas).toBe(2);
    expect(row?.pasos.some((p) => p.tipo_evento === "zona_corporal")).toBe(true);
    expect(row?.rutas).toContain("/cotizacion");
  });
});
