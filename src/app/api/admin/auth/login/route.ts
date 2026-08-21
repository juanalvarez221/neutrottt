import { NextResponse } from "next/server";
import { authenticateAdminEmail } from "@/shared/lib/adminAccounts.server";
import { esCorreoValido, normalizarCorreo } from "@/shared/lib/adminEmail";
import {
  ADMIN_SESSION_TTL_SECONDS,
  getAdminSessionSecret,
  signSessionToken,
} from "@/shared/lib/adminSession";
import { setAdminSessionCookie } from "@/shared/lib/adminSessionCookies.server";
import { clientIp } from "@/shared/lib/security/clientIp";
import { checkRateLimit, RATE_LIMITS } from "@/shared/lib/security/rateLimit.server";
import { esPeticionDelSitio } from "@/shared/lib/security/sameOrigin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DENIED = () => {
  const response = NextResponse.json({ error: "No se pudo entrar." }, { status: 401 });
  response.headers.set("Cache-Control", "no-store");
  return response;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

async function limited(
  bucket: "adminAuthIp" | "adminAuthEmail",
  subject: string,
): Promise<NextResponse | null> {
  const rules = RATE_LIMITS[bucket];
  const result = await checkRateLimit({
    bucket,
    subject,
    limit: rules.limit,
    windowSeconds: rules.windowSeconds,
  });
  if (result.ok) return null;
  const response = NextResponse.json(
    { error: "No se pudo entrar." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter) },
    },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  try {
    if (!esPeticionDelSitio(request)) {
      console.warn("[admin-auth] origen rechazado");
      return DENIED();
    }

    const ip = clientIp(request.headers);
    const ipBlocked = await limited("adminAuthIp", ip);
    if (ipBlocked) return ipBlocked;

    const secret = getAdminSessionSecret();
    if (!secret) {
      console.error("[admin-auth] Falta secreto de sesión.");
      return DENIED();
    }

    let email = "";
    let password = "";
    try {
      const body = (await request.json()) as LoginBody;
      email = typeof body.email === "string" ? normalizarCorreo(body.email) : "";
      password = typeof body.password === "string" ? body.password : "";
    } catch {
      return DENIED();
    }

    if (password.length > 256) password = password.slice(0, 256);

    const emailSubject = esCorreoValido(email) ? email : `invalid:${ip}`;
    const emailBlocked = await limited("adminAuthEmail", emailSubject);
    if (emailBlocked) return emailBlocked;

    const account = await authenticateAdminEmail(email, password);
    if (!account) return DENIED();

    const token = await signSessionToken(secret, account.email, ADMIN_SESSION_TTL_SECONDS);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    setAdminSessionCookie(response, token, ADMIN_SESSION_TTL_SECONDS);
    return response;
  } catch (error) {
    console.error("[admin-auth:login]", error);
    return DENIED();
  }
}
