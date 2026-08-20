import { NextResponse } from "next/server";
import { promoverPersona } from "@/shared/lib/crm/personas.server";

export const dynamic = "force-dynamic";

type PatchBody = {
  evento?: "cotizacion_aceptada" | "acuerdo_asesoria";
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const evento = body.evento;
    if (evento !== "cotizacion_aceptada" && evento !== "acuerdo_asesoria") {
      return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    }
    const persona = await promoverPersona(id, evento);
    if (!persona) {
      return NextResponse.json({ error: "Persona no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, persona });
  } catch (error) {
    console.error("[crm:promover]", error);
    return NextResponse.json({ error: "No se pudo actualizar el estado." }, { status: 500 });
  }
}
