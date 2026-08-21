import { etiquetaDeRuta } from "@/shared/lib/analitica/catalogo";
import type { RecorridoVisitante } from "@/shared/lib/analitica/navegacion";

export type QuoteJourneyStep = {
  clave: string;
  etiqueta: string;
  orden: number;
  prueba: (ruta: string) => boolean;
};

export const PASOS_COTIZACION: readonly QuoteJourneyStep[] = [
  {
    clave: "datos",
    etiqueta: "Datos personales",
    orden: 1,
    prueba: (ruta) => {
      const path = ruta.split("?")[0] ?? ruta;
      return path === "/cotizacion";
    },
  },
  {
    clave: "conexion",
    etiqueta: "Filtro de conexión",
    orden: 2,
    prueba: (ruta) => ruta.startsWith("/cotizacion/conexion"),
  },
  {
    clave: "tamano",
    etiqueta: "Tamaño del proyecto",
    orden: 3,
    prueba: (ruta) => ruta.startsWith("/cotizacion/tamano"),
  },
  {
    clave: "ubicacion",
    etiqueta: "Zona corporal",
    orden: 4,
    prueba: (ruta) => ruta.startsWith("/cotizacion/ubicacion"),
  },
  {
    clave: "estilo",
    etiqueta: "Estilo",
    orden: 5,
    prueba: (ruta) => ruta.startsWith("/cotizacion/estilo"),
  },
  {
    clave: "referencia",
    etiqueta: "Referencias",
    orden: 6,
    prueba: (ruta) => ruta.startsWith("/cotizacion/referencia"),
  },
  {
    clave: "inversion",
    etiqueta: "Inversión",
    orden: 7,
    prueba: (ruta) => ruta.startsWith("/cotizacion/confirmacion"),
  },
  {
    clave: "modalidad",
    etiqueta: "Modalidad de asesoría",
    orden: 8,
    prueba: (ruta) => {
      const path = ruta.split("?")[0] ?? ruta;
      return path === "/cotizacion/asesoria";
    },
  },
  {
    clave: "agendar",
    etiqueta: "Reserva de asesoría",
    orden: 9,
    prueba: (ruta) => ruta.startsWith("/cotizacion/asesoria/agendar"),
  },
  {
    clave: "confirmar",
    etiqueta: "Confirmación de asistencia",
    orden: 10,
    prueba: (ruta) => ruta.startsWith("/cotizacion/asesoria/confirmar"),
  },
  {
    clave: "cierre",
    etiqueta: "Solicitud enviada",
    orden: 11,
    prueba: (ruta) => ruta.startsWith("/cotizacion/gracias"),
  },
];

const CIERRE_KEYS = new Set(["cierre", "agendar", "confirmar"]);

export function pasoDesdeRuta(ruta: string): QuoteJourneyStep | null {
  const path = (ruta.split("?")[0] ?? ruta).replace(/\/+$/, "") || "/";
  let best: QuoteJourneyStep | null = null;
  for (const paso of PASOS_COTIZACION) {
    if (paso.prueba(path) && (!best || paso.orden >= best.orden)) {
      best = paso;
    }
  }
  return best;
}

export type RecorridoCotizacion = RecorridoVisitante & {
  en_cotizacion: boolean;
  completo: boolean;
  ultimo_paso: QuoteJourneyStep | null;
  ultimo_paso_etiqueta: string;
};

export function clasificarRecorrido(row: RecorridoVisitante): RecorridoCotizacion {
  const rutas = row.rutas.length
    ? row.rutas
    : row.pasos.map((paso) => paso.ruta);
  let ultimo: QuoteJourneyStep | null = null;
  for (const ruta of rutas) {
    const paso = pasoDesdeRuta(ruta);
    if (paso && (!ultimo || paso.orden >= ultimo.orden)) {
      ultimo = paso;
    }
  }
  for (const paso of row.pasos) {
    const found = pasoDesdeRuta(paso.ruta);
    if (found && (!ultimo || found.orden >= ultimo.orden)) {
      ultimo = found;
    }
  }
  const en_cotizacion = rutas.some((ruta) => ruta.startsWith("/cotizacion")) || ultimo !== null;
  const completo = Boolean(ultimo && CIERRE_KEYS.has(ultimo.clave));
  return {
    ...row,
    en_cotizacion,
    completo,
    ultimo_paso: ultimo,
    ultimo_paso_etiqueta: ultimo?.etiqueta ?? etiquetaDeRuta(row.rutas.at(-1) ?? "/"),
  };
}

export function recorridosIncompletos(rows: readonly RecorridoVisitante[]): RecorridoCotizacion[] {
  return rows
    .map(clasificarRecorrido)
    .filter((row) => row.en_cotizacion && !row.completo)
    .sort((a, b) => Date.parse(b.ultimo_en) - Date.parse(a.ultimo_en));
}

export function abandonoPorPaso(rows: readonly RecorridoCotizacion[]) {
  const counts = new Map<string, { etiqueta: string; orden: number; total: number }>();
  for (const row of rows) {
    const paso = row.ultimo_paso;
    if (!paso) continue;
    const current = counts.get(paso.clave) ?? {
      etiqueta: paso.etiqueta,
      orden: paso.orden,
      total: 0,
    };
    current.total += 1;
    counts.set(paso.clave, current);
  }
  return [...counts.values()].sort((a, b) => a.orden - b.orden);
}
