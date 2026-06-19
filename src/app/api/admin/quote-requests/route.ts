import { NextResponse } from "next/server";
import { listQuoteRequests } from "@/shared/lib/storage/quoteRequestStore.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requests = await listQuoteRequests();
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar las solicitudes de cotización." },
      { status: 500 },
    );
  }
}
