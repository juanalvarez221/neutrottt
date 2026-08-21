import { NextResponse } from "next/server";
import { isPurgeCategory } from "@/shared/lib/admin/purgeCategories";
import { vaciarCategoria } from "@/shared/lib/admin/vaciarDatos.server";
import { checkRateLimit } from "@/shared/lib/security/rateLimit.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await checkRateLimit({
    bucket: "admin-purge",
    subject: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local",
    limit: 8,
    windowSeconds: 15 * 60,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const categoria =
    payload && typeof payload === "object" && "categoria" in payload
      ? String((payload as { categoria?: unknown }).categoria ?? "")
      : "";
  const confirmacion =
    payload && typeof payload === "object" && "confirmacion" in payload
      ? String((payload as { confirmacion?: unknown }).confirmacion ?? "")
      : "";

  if (!isPurgeCategory(categoria)) {
    return NextResponse.json({ error: "Categoría desconocida." }, { status: 400 });
  }

  try {
    const result = await vaciarCategoria(categoria, confirmacion);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, categoria });
  } catch (error) {
    console.error("[admin:vaciar]", error);
    return NextResponse.json({ error: "No se pudo vaciar esa categoría." }, { status: 500 });
  }
}
