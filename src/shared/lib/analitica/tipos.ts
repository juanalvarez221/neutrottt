/**
 * Contrato del almacén analítico Neutrottt.
 * Nombres en español. Hechos objetivos. Sin datos personales.
 *
 * Bronce: eventos crudos inmutables.
 * Plata: sesiones y vistas derivadas.
 * Oro: métricas listas para lectura (tablero).
 */

export const ZONA_HORARIA_ESTUDIO = "America/Bogota";

export const TIPOS_EVENTO = [
  "vista_pagina",
  "permanencia",
  "salida_pagina",
  "interaccion",
  "seccion_visible",
  "zona_corporal",
  "paso_cotizacion",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export type TipoDispositivo = "movil" | "tablet" | "escritorio" | "desconocido";

export type CanalTrafico =
  | "directo"
  | "instagram"
  | "whatsapp"
  | "google"
  | "tiktok"
  | "referencia"
  | "interno";

/** Evento que envía el navegador (antes de enriquecer). */
export type EventoCliente = {
  id_evento?: string;
  id_sesion: string;
  id_visitante: string;
  ocurrido_en: string;
  tipo_evento: TipoEvento;
  ruta: string;
  seccion?: string;
  etiqueta?: string;
  valor?: string;
  duracion_ms?: number;
  idioma?: string;
  dispositivo?: TipoDispositivo;
  ancho_viewport?: number;
  alto_viewport?: number;
  utm_fuente?: string;
  utm_medio?: string;
  utm_campana?: string;
  referente?: string;
};

/** Hecho crudo persistido (capa bronce). */
export type EventoBronce = EventoCliente & {
  id_evento: string;
  tipo_evento: TipoEvento;
  dispositivo: TipoDispositivo;
  canal_trafico: CanalTrafico;
  pais: string;
  region: string;
  ciudad: string;
  ingestado_en: string;
};

export type SesionPlata = {
  id_sesion: string;
  id_visitante: string;
  fecha: string;
  iniciado_en: string;
  ultimo_en: string;
  duracion_ms: number;
  vistas_pagina: number;
  interacciones: number;
  rutas: string[];
  entrada: string;
  salida: string;
  dispositivo: TipoDispositivo;
  canal_trafico: CanalTrafico;
  pais: string;
  region: string;
  ciudad: string;
  rebote: boolean;
};

export type MetricaDiaria = {
  fecha: string;
  visitas_unicas: number;
  sesiones: number;
  vistas_pagina: number;
  interacciones: number;
  duracion_media_sesion_ms: number;
  tasa_rebote: number;
  cotizaciones_iniciadas: number;
  cotizaciones_completadas: number;
  asesorias_vistas: number;
};

export type PermanenciaRuta = {
  ruta: string;
  etiqueta: string;
  vistas: number;
  sesiones_unicas: number;
  duracion_total_ms: number;
  duracion_media_ms: number;
};

export type OrigenConexion = {
  pais: string;
  region: string;
  ciudad: string;
  sesiones: number;
  visitas_unicas: number;
  duracion_media_ms: number;
};

export type InteraccionResumen = {
  etiqueta: string;
  ruta: string;
  recuento: number;
};

export type PasoEmbudo = {
  clave: string;
  etiqueta: string;
  sesiones: number;
  conversion_desde_inicio: number;
};

export type CorridaEtl = {
  ejecutado_en: string;
  filas_bronce: number;
  sesiones_plata: number;
  dias_oro: number;
  ventana_dias: number;
  duracion_ms: number;
};

export type CapaOro = {
  version: 1;
  generado_en: string;
  zona_horaria: typeof ZONA_HORARIA_ESTUDIO;
  ventana_dias: number;
  corrida: CorridaEtl;
  metricas_diarias: MetricaDiaria[];
  permanencia_rutas: PermanenciaRuta[];
  origenes_conexion: OrigenConexion[];
  interacciones: InteraccionResumen[];
  embudo: PasoEmbudo[];
  kpis: {
    visitas_unicas: number;
    sesiones: number;
    vistas_pagina: number;
    interacciones: number;
    duracion_media_sesion_ms: number;
    tasa_rebote: number;
    cotizaciones_iniciadas: number;
    cotizaciones_completadas: number;
  };
};

export const CAPA_ORO_VACIA: CapaOro = {
  version: 1,
  generado_en: "",
  zona_horaria: ZONA_HORARIA_ESTUDIO,
  ventana_dias: 30,
  corrida: {
    ejecutado_en: "",
    filas_bronce: 0,
    sesiones_plata: 0,
    dias_oro: 0,
    ventana_dias: 30,
    duracion_ms: 0,
  },
  metricas_diarias: [],
  permanencia_rutas: [],
  origenes_conexion: [],
  interacciones: [],
  embudo: [],
  kpis: {
    visitas_unicas: 0,
    sesiones: 0,
    vistas_pagina: 0,
    interacciones: 0,
    duracion_media_sesion_ms: 0,
    tasa_rebote: 0,
    cotizaciones_iniciadas: 0,
    cotizaciones_completadas: 0,
  },
};
