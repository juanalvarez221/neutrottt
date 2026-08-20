import { NextResponse } from "next/server";
import { authenticateAdminEmail } from "@/shared/lib/adminAccounts.server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  getAdminSessionSecret,
  signSessionToken,
  verifyAdminCredential,
} from "@/shared/lib/adminSession";
import { enforcePublicWrite } from "@/shared/lib/security/guardRequest.server";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: string;
  pin?: string;
  password?: string;
};

export async function POST(request: Request) {
  const limited = await enforcePublicWrite(request, "adminLogin");
  if (limited) return limited;

  const secret = getAdminSessionSecret();
  if (!secret) {
    console.error("[admin-auth] Falta ADMIN_SESSION_SECRET.");
    return NextResponse.json(
      { error: "Autenticación admin no configurada en el servidor." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as LoginBody;
    const email = (body.email ?? "").trim().toLowerCase();
    const password = (body.password ?? body.pin ?? "").trim();

    if (!password) {
      return NextResponse.json({ error: "Credencial incorrecta." }, { status: 401 });
    }

    let sessionEmail: string | undefined;

    if (email) {
      const account = await authenticateAdminEmail(email, password);
      if (!account) {
        return NextResponse.json({ error: "Credencial incorrecta." }, { status: 401 });
      }
      sessionEmail = account.email;
    } else if (!verifyAdminCredential(password)) {
      return NextResponse.json({ error: "Credencial incorrecta." }, { status: 401 });
    }

    const token = await signSessionToken(secret, ADMIN_SESSION_TTL_SECONDS, sessionEmail);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[admin-auth:login]", error);
    return NextResponse.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
