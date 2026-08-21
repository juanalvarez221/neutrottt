export const PURGE_CATEGORIES = {
  analitica: {
    phrase: "VACIAR METRICAS",
    title: "Vaciar métricas",
    hint: "Borra eventos de uso, navegación y las métricas materializadas. No toca cotizaciones ni asesorías.",
  },
  recorridos: {
    phrase: "VACIAR RECORRIDOS",
    title: "Vaciar recorridos",
    hint: "Borra el historial de navegación y las métricas asociadas. No toca cotizaciones ni asesorías.",
  },
  cotizaciones: {
    phrase: "VACIAR COTIZACIONES",
    title: "Vaciar cotizaciones",
    hint: "Borra todas las solicitudes de cotización. No toca la agenda ni las métricas de uso.",
  },
  asesorias: {
    phrase: "VACIAR ASESORIAS",
    title: "Vaciar asesorías",
    hint: "Borra las reservas. Conserva horarios y configuración de la agenda.",
  },
} as const;

export type PurgeCategory = keyof typeof PURGE_CATEGORIES;

const CATEGORY_SET = new Set<string>(Object.keys(PURGE_CATEGORIES));

export function isPurgeCategory(value: string): value is PurgeCategory {
  return CATEGORY_SET.has(value);
}

export function confirmationMatches(categoria: PurgeCategory, typed: string): boolean {
  return typed.trim() === PURGE_CATEGORIES[categoria].phrase;
}
