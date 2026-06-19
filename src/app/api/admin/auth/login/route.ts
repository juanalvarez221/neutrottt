import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  getAdminCredential,
  getAdminSessionSecret,
  signSessionToken,
  verifyAdminCredential,
} from "@/shared/lib/adminSession";

export const dynamic = "force-dynamic";

type LoginBody = {
  pin?: string;
  password?: string;
};

export async function POST(request: Request) {
  const secret = getAdminSessionSecret();
  const credential = getAdminCredential();

  if (!secret || !credential) {
    console.error(
      "[admin-auth] Configuración incompleta: define ADMIN_SESSION_SECRET y ADMIN_PIN (o ADMIN_PASSWORD) en el entorno.",
    );
    return NextResponse.json(
      { error: "Autenticación admin no configurada en el servidor." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as LoginBody;
    const input = (body.pin ?? body.password ?? "").trim();

    if (!input || !verifyAdminCredential(input)) {
      return NextResponse.json({ error: "Credencial incorrecta." }, { status: 401 });
    }

    const token = await signSessionToken(secret);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
