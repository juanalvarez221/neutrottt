import { NextResponse } from "next/server";
import { leerEventosBronce } from "@/shared/lib/analitica/almacenBronce.server";
import { construirNavegacionVisitantes } from "@/shared/lib/analitica/navegacion";
import { fechasVentana } from "@/shared/lib/analitica/fechaEstudio";
import { listarPersonas } from "@/shared/lib/crm/personas.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const fechas = fechasVentana(new Date().toISOString(), 14);
    const [bronce, personas] = await Promise.all([
      leerEventosBronce(fechas),
      listarPersonas().catch(() => []),
    ]);
    const visitantes = construirNavegacionVisitantes(bronce, personas, 50);
    return NextResponse.json({
      generado_en: new Date().toISOString(),
      hechos: bronce.length,
      visitantes,
    });
  } catch (error) {
    console.error("[analitica:navegacion]", error);
    return NextResponse.json(
      { error: "No se pudo leer la navegación." },
      { status: 500 },
    );
  }
}
