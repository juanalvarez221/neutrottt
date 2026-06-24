import { NextResponse } from "next/server";
import { getAdvisoryIntegrationHealth } from "@/shared/lib/advisoryIntegrations.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getAdvisoryIntegrationHealth();
    return NextResponse.json(health);
  } catch (error) {
    console.error("[admin:advisory-health]", error);
    return NextResponse.json({ error: "No se pudo revisar las integraciones." }, { status: 500 });
  }
}
