import { leerEventosBronce } from "@/shared/lib/analitica/almacenBronce.server";
import { escribirCapaOro, leerCapaOro } from "@/shared/lib/analitica/almacenOro.server";
import { materializarOro } from "@/shared/lib/analitica/etl";
import { fechaEstudio, fechasVentana } from "@/shared/lib/analitica/fechaEstudio";
import type { CapaOro } from "@/shared/lib/analitica/tipos";

const VENTANA_DIAS = 30;
const FRESCO_MS = 10 * 60_000;

export async function ejecutarEtlAnalitica(): Promise<CapaOro> {
  const t0 = Date.now();
  const ahora = new Date().toISOString();
  const fechas = fechasVentana(ahora, VENTANA_DIAS);
  const bronce = await leerEventosBronce(fechas);
  const oro = materializarOro(bronce, {
    ejecutado_en: ahora,
    filas_bronce: bronce.length,
    ventana_dias: VENTANA_DIAS,
    duracion_ms: Date.now() - t0,
  });
  oro.corrida.duracion_ms = Date.now() - t0;
  await escribirCapaOro(oro);
  return oro;
}

export async function obtenerOroActualizado(opts?: {
  forzar?: boolean;
}): Promise<CapaOro> {
  const actual = await leerCapaOro();
  if (!opts?.forzar && actual.generado_en) {
    const age = Date.now() - Date.parse(actual.generado_en);
    if (Number.isFinite(age) && age < FRESCO_MS) return actual;
  }
  try {
    return await ejecutarEtlAnalitica();
  } catch (error) {
    if (actual.generado_en) return actual;
    throw error;
  }
}

export function etiquetaVentanaHoy(): string {
  return fechaEstudio(new Date());
}
