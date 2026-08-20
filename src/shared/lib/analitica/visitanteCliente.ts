export const ANALITICA_VISITANTE_KEY = "neutrott.analitica.visitante";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Identidad anónima persistente del navegador. Se une a la persona al capturar datos. */
export function leerIdVisitante(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(ANALITICA_VISITANTE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ANALITICA_VISITANTE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
