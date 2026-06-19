import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/shared/lib/adminSession";

/**
 * Protege el área administrativa (convención "proxy" de Next 16, antes "middleware"):
 * - Páginas /admin/* (excepto /admin/login) → redirige al login si no hay sesión.
 * - APIs administrativas → responden 401 JSON si no hay sesión.
 * El flujo público de cotización/agenda no pasa por aquí.
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/advisory/bookings"],
};

function isAuthExempt(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/api/admin/auth");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthExempt(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  const valid = secret ? await verifySessionToken(secret, token) : false;

  if (valid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = `next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl);
}
