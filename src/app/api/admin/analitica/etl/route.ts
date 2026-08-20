import { NextResponse } from "next/server";
import { ejecutarEtlAnalitica } from "@/shared/lib/analitica/etlJob.server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const oro = await ejecutarEtlAnalitica();
    return NextResponse.json({ ok: true, corrida: oro.corrida });
  } catch (error) {
    console.error("[analitica:etl]", error);
    return NextResponse.json({ error: "No se pudo ejecutar el ETL." }, { status: 500 });
  }
}
