import { NextResponse } from "next/server";
import { ejecutarEtlAnalitica } from "@/shared/lib/analitica/etlJob.server";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const oro = await ejecutarEtlAnalitica();
    return NextResponse.json({ ok: true, corrida: oro.corrida });
  } catch (error) {
    console.error("[cron:analitica-etl]", error);
    return NextResponse.json({ error: "No se pudo ejecutar el ETL." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
