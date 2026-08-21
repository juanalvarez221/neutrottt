import { describe, expect, it } from "vitest";
import type { RecorridoVisitante } from "@/shared/lib/analitica/navegacion";
import {
  abandonoPorPaso,
  clasificarRecorrido,
  pasoDesdeRuta,
  recorridosIncompletos,
} from "@/widgets/admin/quoteJourney";

function visitante(partial: Partial<RecorridoVisitante>): RecorridoVisitante {
  return {
    id_visitante: "abc123456789",
    persona_id: null,
    persona_nombre: null,
    sesiones: 1,
    vistas: 3,
    duracion_ms: 40_000,
    dispositivo: "movil",
    pais: "Colombia",
    ciudad: "Medellín",
    primero_en: "2026-08-20T12:00:00.000Z",
    ultimo_en: "2026-08-20T12:08:00.000Z",
    rutas: ["/cotizacion", "/cotizacion/tamano"],
    pasos: [],
    ...partial,
  };
}

describe("quoteJourney", () => {
  it("resuelve el paso más específico de la ruta", () => {
    expect(pasoDesdeRuta("/cotizacion")?.clave).toBe("datos");
    expect(pasoDesdeRuta("/cotizacion/asesoria")?.clave).toBe("modalidad");
    expect(pasoDesdeRuta("/cotizacion/asesoria/agendar")?.clave).toBe("agendar");
    expect(pasoDesdeRuta("/cotizacion/gracias")?.clave).toBe("cierre");
  });

  it("marca incompleto a quien se detuvo antes del cierre", () => {
    const row = clasificarRecorrido(
      visitante({
        rutas: ["/cotizacion", "/cotizacion/conexion", "/cotizacion/tamano"],
      }),
    );
    expect(row.en_cotizacion).toBe(true);
    expect(row.completo).toBe(false);
    expect(row.ultimo_paso?.clave).toBe("tamano");
  });

  it("marca completo si reservó asesoría o llegó a gracias", () => {
    const reserved = clasificarRecorrido(
      visitante({ rutas: ["/cotizacion", "/cotizacion/asesoria/agendar"] }),
    );
    const closed = clasificarRecorrido(
      visitante({ rutas: ["/cotizacion/confirmacion", "/cotizacion/gracias"] }),
    );
    expect(reserved.completo).toBe(true);
    expect(closed.completo).toBe(true);
    expect(recorridosIncompletos([reserved, closed])).toHaveLength(0);
  });

  it("agrupa abandonos por último paso", () => {
    const rows = recorridosIncompletos([
      visitante({ id_visitante: "one", rutas: ["/cotizacion/estilo"] }),
      visitante({ id_visitante: "two", rutas: ["/cotizacion/estilo"] }),
      visitante({ id_visitante: "three", rutas: ["/cotizacion/ubicacion"] }),
    ]);
    const grouped = abandonoPorPaso(rows);
    expect(grouped.find((row) => row.etiqueta === "Estilo")?.total).toBe(2);
    expect(grouped.find((row) => row.etiqueta === "Zona corporal")?.total).toBe(1);
  });
});
