import { etiquetaDeRuta, PASOS_EMBUDO } from "@/shared/lib/analitica/catalogo";
import { fechaEstudio } from "@/shared/lib/analitica/fechaEstudio";
import type {
  CapaOro,
  CorridaEtl,
  EventoBronce,
  InteraccionResumen,
  MetricaDiaria,
  OrigenConexion,
  PasoEmbudo,
  PermanenciaRuta,
  SesionPlata,
} from "@/shared/lib/analitica/tipos";
import { CAPA_ORO_VACIA, ZONA_HORARIA_ESTUDIO } from "@/shared/lib/analitica/tipos";

const TIMEOUT_SESION_MS = 30 * 60_000;

function media(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sessioniza hechos bronce.
 * Una sesión cierra si pasan más de 30 min sin eventos.
 */
export function construirSesiones(eventos: readonly EventoBronce[]): SesionPlata[] {
  const bySession = new Map<string, EventoBronce[]>();
  for (const e of eventos) {
    const list = bySession.get(e.id_sesion) ?? [];
    list.push(e);
    bySession.set(e.id_sesion, list);
  }

  const out: SesionPlata[] = [];
  for (const [id_sesion, list] of bySession) {
    const ordered = [...list].sort(
      (a, b) => Date.parse(a.ocurrido_en) - Date.parse(b.ocurrido_en),
    );
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    const start = Date.parse(first.ocurrido_en);
    const end = Date.parse(last.ocurrido_en);
    const dwell = ordered.reduce((sum, e) => {
      if (e.tipo_evento === "permanencia" || e.tipo_evento === "salida_pagina") {
        return sum + (e.duracion_ms ?? 0);
      }
      return sum;
    }, 0);
    const vistas = ordered.filter((e) => e.tipo_evento === "vista_pagina").length;
    const interacciones = ordered.filter((e) =>
      e.tipo_evento === "interaccion" || e.tipo_evento === "zona_corporal",
    ).length;
    const rutas = [
      ...new Set(
        ordered
          .filter((e) => e.tipo_evento === "vista_pagina")
          .map((e) => e.ruta.split("?")[0] ?? e.ruta),
      ),
    ];
    const duracion_ms = Math.max(dwell, Math.min(end - start, TIMEOUT_SESION_MS * 4));

    out.push({
      id_sesion,
      id_visitante: first.id_visitante,
      fecha: fechaEstudio(first.ocurrido_en),
      iniciado_en: first.ocurrido_en,
      ultimo_en: last.ocurrido_en,
      duracion_ms,
      vistas_pagina: vistas,
      interacciones,
      rutas,
      entrada: rutas[0] ?? first.ruta,
      salida: rutas[rutas.length - 1] ?? last.ruta,
      dispositivo: first.dispositivo,
      canal_trafico: first.canal_trafico,
      pais: first.pais,
      region: first.region,
      ciudad: first.ciudad,
      rebote: vistas <= 1 && interacciones === 0,
    });
  }
  return out;
}

export function agregarPermanencia(
  eventos: readonly EventoBronce[],
): PermanenciaRuta[] {
  const map = new Map<
    string,
    { vistas: number; sesiones: Set<string>; duracion: number }
  >();
  for (const e of eventos) {
    const ruta = e.ruta.split("?")[0] ?? e.ruta;
    const row = map.get(ruta) ?? {
      vistas: 0,
      sesiones: new Set<string>(),
      duracion: 0,
    };
    if (e.tipo_evento === "vista_pagina") {
      row.vistas += 1;
      row.sesiones.add(e.id_sesion);
    }
    if (e.tipo_evento === "permanencia" || e.tipo_evento === "salida_pagina") {
      row.duracion += e.duracion_ms ?? 0;
      row.sesiones.add(e.id_sesion);
    }
    map.set(ruta, row);
  }
  return [...map.entries()]
    .map(([ruta, row]) => ({
      ruta,
      etiqueta: etiquetaDeRuta(ruta),
      vistas: row.vistas,
      sesiones_unicas: row.sesiones.size,
      duracion_total_ms: row.duracion,
      duracion_media_ms:
        row.sesiones.size > 0 ? row.duracion / row.sesiones.size : 0,
    }))
    .sort((a, b) => b.duracion_total_ms - a.duracion_total_ms);
}

export function agregarOrigenes(sesiones: readonly SesionPlata[]): OrigenConexion[] {
  const map = new Map<string, { sesiones: SesionPlata[]; visitantes: Set<string> }>();
  for (const s of sesiones) {
    const key = `${s.pais}|${s.region}|${s.ciudad}`;
    const row = map.get(key) ?? { sesiones: [], visitantes: new Set<string>() };
    row.sesiones.push(s);
    row.visitantes.add(s.id_visitante);
    map.set(key, row);
  }
  return [...map.entries()]
    .map(([key, row]) => {
      const [pais, region, ciudad] = key.split("|");
      return {
        pais: pais ?? "Desconocido",
        region: region ?? "—",
        ciudad: ciudad ?? "—",
        sesiones: row.sesiones.length,
        visitas_unicas: row.visitantes.size,
        duracion_media_ms: media(row.sesiones.map((s) => s.duracion_ms)),
      };
    })
    .sort((a, b) => b.sesiones - a.sesiones);
}

export function agregarInteracciones(
  eventos: readonly EventoBronce[],
): InteraccionResumen[] {
  const map = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo_evento !== "interaccion" && e.tipo_evento !== "zona_corporal") {
      continue;
    }
    const ruta = e.ruta.split("?")[0] ?? e.ruta;
    const etiqueta = e.etiqueta || e.seccion || e.tipo_evento;
    const key = `${etiqueta}|${ruta}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, recuento]) => {
      const [etiqueta, ruta] = key.split("|");
      return { etiqueta: etiqueta ?? "interaccion", ruta: ruta ?? "/", recuento };
    })
    .sort((a, b) => b.recuento - a.recuento)
    .slice(0, 40);
}

export function agregarEmbudo(sesiones: readonly SesionPlata[]): PasoEmbudo[] {
  const inicio = Math.max(sesiones.length, 1);
  return PASOS_EMBUDO.map((paso) => {
    const n = sesiones.filter((s) => paso.prueba(s.rutas)).length;
    return {
      clave: paso.clave,
      etiqueta: paso.etiqueta,
      sesiones: n,
      conversion_desde_inicio: n / inicio,
    };
  });
}

export function agregarMetricasDiarias(
  sesiones: readonly SesionPlata[],
  eventos: readonly EventoBronce[],
): MetricaDiaria[] {
  const fechas = [...new Set(sesiones.map((s) => s.fecha))].sort();
  return fechas.map((fecha) => {
    const ss = sesiones.filter((s) => s.fecha === fecha);
    const ev = eventos.filter((e) => fechaEstudio(e.ocurrido_en) === fecha);
    const visitantes = new Set(ss.map((s) => s.id_visitante));
    const rebotes = ss.filter((s) => s.rebote).length;
    const cotizaciones_iniciadas = ss.filter((s) =>
      s.rutas.some((r) => r.startsWith("/cotizacion")),
    ).length;
    const cotizaciones_completadas = ss.filter((s) =>
      s.rutas.some(
        (r) =>
          r.startsWith("/cotizacion/gracias") ||
          r.startsWith("/cotizacion/asesoria/agendar"),
      ),
    ).length;
    const asesorias_vistas = ss.filter((s) =>
      s.rutas.some((r) => r.startsWith("/cotizacion/asesoria")),
    ).length;
    return {
      fecha,
      visitas_unicas: visitantes.size,
      sesiones: ss.length,
      vistas_pagina: ev.filter((e) => e.tipo_evento === "vista_pagina").length,
      interacciones: ev.filter(
        (e) => e.tipo_evento === "interaccion" || e.tipo_evento === "zona_corporal",
      ).length,
      duracion_media_sesion_ms: media(ss.map((s) => s.duracion_ms)),
      tasa_rebote: ss.length ? rebotes / ss.length : 0,
      cotizaciones_iniciadas,
      cotizaciones_completadas,
      asesorias_vistas,
    };
  });
}

export function materializarOro(
  eventos: readonly EventoBronce[],
  corrida: Omit<CorridaEtl, "sesiones_plata" | "dias_oro">,
): CapaOro {
  if (eventos.length === 0) {
    return {
      ...CAPA_ORO_VACIA,
      generado_en: corrida.ejecutado_en,
      ventana_dias: corrida.ventana_dias,
      corrida: { ...corrida, sesiones_plata: 0, dias_oro: 0 },
    };
  }

  const sesiones = construirSesiones(eventos);
  const metricas_diarias = agregarMetricasDiarias(sesiones, eventos);
  const visitas = new Set(sesiones.map((s) => s.id_visitante)).size;
  const rebotes = sesiones.filter((s) => s.rebote).length;

  return {
    version: 1,
    generado_en: corrida.ejecutado_en,
    zona_horaria: ZONA_HORARIA_ESTUDIO,
    ventana_dias: corrida.ventana_dias,
    corrida: {
      ...corrida,
      sesiones_plata: sesiones.length,
      dias_oro: metricas_diarias.length,
    },
    metricas_diarias,
    permanencia_rutas: agregarPermanencia(eventos),
    origenes_conexion: agregarOrigenes(sesiones),
    interacciones: agregarInteracciones(eventos),
    embudo: agregarEmbudo(sesiones),
    kpis: {
      visitas_unicas: visitas,
      sesiones: sesiones.length,
      vistas_pagina: eventos.filter((e) => e.tipo_evento === "vista_pagina").length,
      interacciones: eventos.filter(
        (e) => e.tipo_evento === "interaccion" || e.tipo_evento === "zona_corporal",
      ).length,
      duracion_media_sesion_ms: media(sesiones.map((s) => s.duracion_ms)),
      tasa_rebote: sesiones.length ? rebotes / sesiones.length : 0,
      cotizaciones_iniciadas: sesiones.filter((s) =>
        s.rutas.some((r) => r.startsWith("/cotizacion")),
      ).length,
      cotizaciones_completadas: sesiones.filter((s) =>
        s.rutas.some(
          (r) =>
            r.startsWith("/cotizacion/gracias") ||
            r.startsWith("/cotizacion/asesoria/agendar"),
        ),
      ).length,
    },
  };
}
