import { NextResponse } from "next/server";
import { registrarHechoCrm } from "@/shared/lib/crm/personas.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import { enforcePublicWrite } from "@/shared/lib/security/guardRequest.server";

export const dynamic = "force-dynamic";

type CapturaBody = {
  nombre?: string;
  whatsapp?: string;
  email?: string;
  id_visitante?: string;
};

export async function POST(request: Request) {
  const limited = await enforcePublicWrite(request, "captura");
  if (limited) return limited;

  if (!hasDatabaseConfig()) {
    return NextResponse.json({ ok: true, omitido: true });
  }

  let body: CapturaBody;
  try {
    body = (await request.json()) as CapturaBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const nombre = body.nombre?.trim() ?? "";
  const whatsapp = body.whatsapp?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  if (!nombre || (!whatsapp && !email)) {
    return NextResponse.json({ error: "Faltan datos de contacto." }, { status: 400 });
  }

  try {
    const persona = await registrarHechoCrm({
      nombre,
      whatsapp,
      email,
      evento: "captura",
      origen: "cotizador",
      id_visitante: typeof body.id_visitante === "string" ? body.id_visitante : "",
    });
    return NextResponse.json({ ok: true, id: persona?.id ?? null, estado: persona?.estado ?? null });
  } catch (error) {
    console.error("[crm:captura]", error);
    return NextResponse.json({ error: "No se pudo registrar el contacto." }, { status: 500 });
  }
}
