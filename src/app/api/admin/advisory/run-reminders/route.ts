import { NextResponse } from "next/server";
import { runAdvisoryRemindersJob } from "@/shared/lib/advisoryRemindersJob.server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runAdvisoryRemindersJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[admin:advisory-reminders]", error);
    return NextResponse.json({ error: "No se pudieron ejecutar los recordatorios." }, { status: 500 });
  }
}
