import { NextResponse } from "next/server";
import { runAdvisoryRemindersJob } from "@/shared/lib/advisoryRemindersJob.server";

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
    const result = await runAdvisoryRemindersJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:advisory-reminders]", error);
    return NextResponse.json({ error: "No se pudo ejecutar el cron." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
