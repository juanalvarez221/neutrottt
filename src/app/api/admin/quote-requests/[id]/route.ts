import { NextResponse } from "next/server";
import { updateQuoteRequestStatus } from "@/shared/lib/storage/quoteRequestStore.server";

export const dynamic = "force-dynamic";

type PatchBody = {
  status?: string;
  statusSlug?: string;
  statusLabel?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;
    const status = body.status ?? body.statusSlug ?? body.statusLabel;

    if (!status?.trim()) {
      return NextResponse.json({ error: "Falta el estado a actualizar." }, { status: 400 });
    }

    const updated = await updateQuoteRequestStatus(id, status);
    if (!updated) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, request: updated });
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar el estado de la solicitud." },
      { status: 500 },
    );
  }
}
