import { describe, expect, it } from "vitest";
import { etiquetaDeRuta } from "@/shared/lib/analitica/catalogo";
import { construirSesiones, materializarOro } from "@/shared/lib/analitica/etl";
import { clasificarCanal } from "@/shared/lib/analitica/geo";
import { validarEventoCliente } from "@/shared/lib/analitica/validarEvento";
import type { EventoBronce } from "@/shared/lib/analitica/tipos";

const SESION = "11111111-1111-4111-8111-111111111111";
const VISITANTE = "22222222-2222-4222-8222-222222222222";

function hecho(
  partial: Partial<EventoBronce> & Pick<EventoBronce, "tipo_evento" | "ocurrido_en">,
): EventoBronce {
  return {
    id_evento: partial.id_evento ?? crypto.randomUUID(),
    id_sesion: SESION,
    id_visitante: VISITANTE,
    ruta: "/",
    dispositivo: "escritorio",
    canal_trafico: "instagram",
    pais: "Colombia",
    region: "ANT",
    ciudad: "Medellín",
    ingestado_en: partial.ocurrido_en,
    ...partial,
  };
}

describe("validación analítica", () => {
  it("acepta un hecho público bien formado y rechaza admin o ids inválidos", () => {
    const ok = validarEventoCliente({
      id_sesion: SESION,
      id_visitante: VISITANTE,
      ocurrido_en: new Date().toISOString(),
      tipo_evento: "vista_pagina",
      ruta: "/cotizacion/ubicacion",
    });
    expect(ok?.ruta).toBe("/cotizacion/ubicacion");
    expect(
      validarEventoCliente({
        ...ok,
        ruta: "/admin/analitica",
      }),
    ).toBeNull();
    expect(
      validarEventoCliente({
        id_sesion: "no-uuid",
        id_visitante: VISITANTE,
        ocurrido_en: new Date().toISOString(),
        tipo_evento: "vista_pagina",
        ruta: "/",
      }),
    ).toBeNull();
  });
});

describe("ETL analítico", () => {
  it("sessioniza, mide permanencia y arma el embudo en español", () => {
    const t0 = "2026-08-20T18:00:00.000Z";
    const t1 = "2026-08-20T18:00:20.000Z";
    const t2 = "2026-08-20T18:01:00.000Z";
    const eventos = [
      hecho({ tipo_evento: "vista_pagina", ocurrido_en: t0, ruta: "/" }),
      hecho({
        tipo_evento: "permanencia",
        ocurrido_en: t1,
        ruta: "/",
        duracion_ms: 20_000,
      }),
      hecho({
        tipo_evento: "vista_pagina",
        ocurrido_en: t2,
        ruta: "/cotizacion/ubicacion",
      }),
      hecho({
        tipo_evento: "zona_corporal",
        ocurrido_en: t2,
        ruta: "/cotizacion/ubicacion",
        etiqueta: "Cuello lateral derecho",
      }),
    ];
    const sesiones = construirSesiones(eventos);
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]?.rebote).toBe(false);
    expect(sesiones[0]?.vistas_pagina).toBe(2);

    const oro = materializarOro(eventos, {
      ejecutado_en: t2,
      filas_bronce: eventos.length,
      ventana_dias: 30,
      duracion_ms: 4,
    });
    expect(oro.kpis.sesiones).toBe(1);
    expect(oro.permanencia_rutas[0]?.etiqueta).toBe("Inicio");
    expect(oro.embudo.find((p) => p.clave === "ubicacion")?.sesiones).toBe(1);
    expect(oro.interacciones[0]?.etiqueta).toBe("Cuello lateral derecho");
    expect(oro.origenes_conexion[0]?.ciudad).toBe("Medellín");
  });

  it("clasifica canal y etiqueta rutas profesionales", () => {
    expect(
      clasificarCanal({ referente: "https://www.instagram.com/neutrottt" }),
    ).toBe("instagram");
    expect(clasificarCanal({ referente: null })).toBe("directo");
    expect(etiquetaDeRuta("/cotizacion/asesoria/agendar")).toBe(
      "Asesoría · Agenda",
    );
  });
});
