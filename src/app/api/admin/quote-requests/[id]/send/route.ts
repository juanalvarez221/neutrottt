import { NextResponse } from "next/server";
import { sendOfficialQuoteEmail } from "@/shared/lib/notifications/officialQuoteEmail.server";
import {
  getQuoteRequestById,
  isValidOfficialQuoteAdjustment,
  saveOfficialQuoteSent,
} from "@/shared/lib/storage/quoteRequestStore.server";

export const dynamic = "force-dynamic";

type SendBody = {
  sessionPrice?: number;
  sessionCount?: number;
  note?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getQuoteRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }

    const body = (await request.json()) as SendBody;
    const adjustment = {
      sessionPrice: Number(body.sessionPrice),
      sessionCount: Number(body.sessionCount),
      note: body.note?.trim() || undefined,
    };

    if (!isValidOfficialQuoteAdjustment(adjustment)) {
      return NextResponse.json(
        { error: "Revisa el precio por sesión y el número de jornadas." },
        { status: 400 },
      );
    }

    if (!existing.email?.trim()) {
      return NextResponse.json(
        { error: "Este brief no tiene correo. Neutrottt no puede mandar la cifra oficial." },
        { status: 409 },
      );
    }

    const saved = await saveOfficialQuoteSent(id, adjustment);
    if (!saved) {
      return NextResponse.json({ error: "No se pudo guardar la cifra." }, { status: 500 });
    }

    const emailResult = await sendOfficialQuoteEmail(saved);
    if (!emailResult.ok) {
      return NextResponse.json(
        {
          error: "La cifra quedó guardada, pero el correo no salió. Reintenta el envío.",
          request: saved,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, request: saved, preview: emailResult.preview });
  } catch {
    return NextResponse.json(
      { error: "No se pudo enviar la cotización oficial." },
      { status: 500 },
    );
  }
}
