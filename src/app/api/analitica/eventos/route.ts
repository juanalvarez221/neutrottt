import { NextResponse } from "next/server";
import { ingestarLoteEventos } from "@/shared/lib/analitica/ingestar.server";
import { enforcePublicWrite } from "@/shared/lib/security/guardRequest.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforcePublicWrite(request, "analitica");
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    const result = await ingestarLoteEventos(payload, request.headers);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[analitica:ingesta]", error);
    return NextResponse.json({ error: "No se pudo guardar el lote." }, { status: 500 });
  }
}
