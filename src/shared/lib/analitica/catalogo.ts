import type { CanalTrafico, TipoEvento } from "@/shared/lib/analitica/tipos";

export const ETIQUETAS_TIPO_EVENTO: Record<TipoEvento, string> = {
  vista_pagina: "Vista de página",
  permanencia: "Permanencia",
  salida_pagina: "Salida de página",
  interaccion: "Interacción",
  seccion_visible: "Sección visible",
  zona_corporal: "Zona corporal",
  paso_cotizacion: "Paso de cotización",
};

export const ETIQUETAS_CANAL: Record<CanalTrafico, string> = {
  directo: "Directo",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  google: "Google",
  tiktok: "TikTok",
  referencia: "Referencia",
  interno: "Interno",
};

const ETIQUETAS_RUTA: Array<[RegExp | string, string]> = [
  ["/", "Inicio"],
  ["/proyectos", "Proyectos"],
  ["/contacto", "Contacto"],
  ["/cotizacion", "Cotización · Datos"],
  ["/cotizacion/conexion", "Cotización · Conexión"],
  ["/cotizacion/tamano", "Cotización · Tamaño"],
  ["/cotizacion/ubicacion", "Cotización · Ubicación"],
  ["/cotizacion/estilo", "Cotización · Estilo"],
  ["/cotizacion/referencia", "Cotización · Referencia"],
  ["/cotizacion/confirmacion", "Cotización · Inversión"],
  ["/cotizacion/asesoria", "Asesoría · Modalidad"],
  ["/cotizacion/asesoria/agendar", "Asesoría · Agenda"],
  ["/cotizacion/asesoria/confirmar", "Asesoría · Confirmación"],
  ["/cotizacion/asesoria/reagendar", "Asesoría · Reagenda"],
  ["/cotizacion/gracias", "Cotización · Cierre"],
  ["/admin", "Administración"],
];

export function etiquetaDeRuta(ruta: string): string {
  const path = (ruta.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  let best = "Otra ruta";
  let bestLen = -1;
  for (const [key, label] of ETIQUETAS_RUTA) {
    if (typeof key !== "string") continue;
    if (path === key || (key !== "/" && path.startsWith(key))) {
      if (key.length >= bestLen) {
        best = label;
        bestLen = key.length;
      }
    }
  }
  return best;
}

export const PASOS_EMBUDO: readonly {
  clave: string;
  etiqueta: string;
  prueba: (rutas: readonly string[]) => boolean;
}[] = [
  { clave: "sitio", etiqueta: "Entrada al sitio", prueba: () => true },
  {
    clave: "cotizacion",
    etiqueta: "Inicio de cotización",
    prueba: (rutas: readonly string[]) =>
      rutas.some((r) => r.startsWith("/cotizacion")),
  },
  {
    clave: "ubicacion",
    etiqueta: "Selección de zona",
    prueba: (rutas: readonly string[]) =>
      rutas.some((r) => r.startsWith("/cotizacion/ubicacion")),
  },
  {
    clave: "cierre",
    etiqueta: "Inversión o asesoría",
    prueba: (rutas: readonly string[]) =>
      rutas.some(
        (r) =>
          r.startsWith("/cotizacion/confirmacion") ||
          r.startsWith("/cotizacion/asesoria"),
      ),
  },
  {
    clave: "completado",
    etiqueta: "Cierre (gracias / reserva)",
    prueba: (rutas: readonly string[]) =>
      rutas.some(
        (r) =>
          r.startsWith("/cotizacion/gracias") ||
          r.startsWith("/cotizacion/asesoria/agendar"),
      ),
  },
];

export const PAISES_ES: Record<string, string> = {
  CO: "Colombia",
  US: "Estados Unidos",
  MX: "México",
  ES: "España",
  AR: "Argentina",
  CL: "Chile",
  PE: "Perú",
  EC: "Ecuador",
  VE: "Venezuela",
  PA: "Panamá",
  CR: "Costa Rica",
  BR: "Brasil",
  CA: "Canadá",
  GB: "Reino Unido",
  DE: "Alemania",
  FR: "Francia",
  IT: "Italia",
  AU: "Australia",
  XX: "Desconocido",
};

export function nombrePais(codigo: string): string {
  const iso = codigo.trim().toUpperCase();
  if (!iso) return PAISES_ES.XX!;
  return PAISES_ES[iso] ?? iso;
}
