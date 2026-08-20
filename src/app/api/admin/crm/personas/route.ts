import { NextResponse } from "next/server";
import { backfillCrmDesdeOperacion } from "@/shared/lib/crm/backfill.server";
import { listarPersonas } from "@/shared/lib/crm/personas.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseConfig()) {
    return NextResponse.json({
      personas: [],
      configurada: false,
      mensaje: "Falta DATABASE_URL. Crea Postgres (Neon) y pégala en Vercel.",
    });
  }

  try {
    await backfillCrmDesdeOperacion();
    const personas = await listarPersonas();
    return NextResponse.json({ personas, configurada: true });
  } catch (error) {
    console.error("[crm:listar]", error);
    return NextResponse.json({ error: "No se pudo leer el CRM." }, { status: 500 });
  }
}
