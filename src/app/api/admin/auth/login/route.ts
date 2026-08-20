import { NextResponse } from "next/server";
import { authenticateAdminEmail } from "@/shared/lib/adminAccounts.server";
import { esCorreoAdmin } from "@/shared/lib/adminEmail";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  LEGACY_ADMIN_SESSION_COOKIE,
  adminSessionCookieAttrs,
  getAdminSessionSecret,
  signSessionToken,
} from "@/shared/lib/adminSession";
import { clientIp } from "@/shared/lib/security/clientIp";
import { checkRateLimit, RATE_LIMITS } from "@/shared/lib/security/rateLimit.server";
import { esPeticionDelSitio } from "@/shared/lib/security/sameOrigin";

export const dynamic = "force-dynamic";

const DENIED = () => NextResponse.json({ error: "No se pudo entrar." }, { status: 401 });

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

async function limited(
  bucket: "adminLogin" | "adminLoginEmail",
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
  return NextResponse.json(
    { error: "No se pudo entrar." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter) },
    },
  );
}

export async function POST(request: Request) {
  if (!esPeticionDelSitio(request)) return DENIED();

  const ip = clientIp(request.headers);
  const ipBlocked = await limited("adminLogin", ip);
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
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return DENIED();
  }

  if (password.length > 256) password = password.slice(0, 256);

  const emailSubject = esCorreoAdmin(email) ? email : `invalid:${ip}`;
  const emailBlocked = await limited("adminLoginEmail", emailSubject);
  if (emailBlocked) return emailBlocked;

  try {
    const account = await authenticateAdminEmail(email, password);
    if (!account) return DENIED();

    const token = await signSessionToken(secret, account.email, ADMIN_SESSION_TTL_SECONDS);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    const attrs = adminSessionCookieAttrs(ADMIN_SESSION_TTL_SECONDS);
    response.cookies.set(ADMIN_SESSION_COOKIE, token, attrs);
    if (ADMIN_SESSION_COOKIE !== LEGACY_ADMIN_SESSION_COOKIE) {
      response.cookies.set(LEGACY_ADMIN_SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    console.error("[admin-auth:login]", error);
    return DENIED();
  }
}
