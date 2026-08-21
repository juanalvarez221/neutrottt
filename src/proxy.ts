import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionCookieValue, verifySessionToken } from "@/shared/lib/adminSession";

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
  return (
    pathname === "/admin/login" ||
    pathname === "/api/admin/auth/login" ||
    pathname === "/api/admin/auth/logout"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthExempt(pathname)) {
    return NextResponse.next();
  }

  const token = readSessionCookieValue((name) => request.cookies.get(name)?.value);
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  let valid = false;
  try {
    valid = secret ? await verifySessionToken(secret, token) : false;
  } catch (error) {
    console.error("[admin-proxy]", error);
  }

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
