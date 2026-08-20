import { NextResponse } from "next/server";
import {
  upsertQuoteRequest,
  type QuoteRequestInput,
} from "@/shared/lib/storage/quoteRequestStore.server";
import { sendNewQuoteInternalEmail } from "@/shared/lib/notifications/internalArtistNotifications.server";
import { enforcePublicWrite } from "@/shared/lib/security/guardRequest.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforcePublicWrite(request, "quote");
  if (limited) return limited;

  try {
    const body = (await request.json()) as QuoteRequestInput;

    if (!body.clientName?.trim() || (!body.whatsapp?.trim() && !body.email?.trim())) {
      return NextResponse.json(
        { error: "Faltan datos mínimos para registrar la solicitud." },
        { status: 400 },
      );
    }

    const { record, created } = await upsertQuoteRequest(body);

    // Correo interno solo para cotizaciones nuevas no ligadas a una asesoría
    // (las asesorías notifican aparte desde /api/advisory/book para evitar duplicados).
    if (created && !record.advisoryBookingId) {
      await sendNewQuoteInternalEmail(record);
    }

    return NextResponse.json({ ok: true, id: record.id, created });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud de cotización." },
      { status: 500 },
    );
  }
}
