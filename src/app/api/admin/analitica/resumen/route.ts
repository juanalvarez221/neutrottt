import { NextResponse } from "next/server";
import { obtenerOroActualizado } from "@/shared/lib/analitica/etlJob.server";
import { CAPA_ORO_VACIA } from "@/shared/lib/analitica/tipos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const oro = await obtenerOroActualizado();
    return NextResponse.json(oro);
  } catch (error) {
    console.error("[analitica:resumen]", error);
    return NextResponse.json({
      ...CAPA_ORO_VACIA,
      generado_en: new Date().toISOString(),
    });
  }
}
