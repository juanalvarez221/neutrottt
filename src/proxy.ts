import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminGatePath } from "@/shared/config/adminGate";
import { readSessionCookieValue, verifySessionToken } from "@/shared/lib/adminSession";

/**
 * Protege el área administrativa:
 * - La entrada pública es ADMIN_GATE_PATH, no /admin/login.
 * - /admin/* sin sesión responde 404 (no delata el panel).
 * - APIs administrativas → 401 JSON si no hay sesión.
 */
export const config = {
  matcher: ["/admin/:path*", "/k7x4n9qm2p", "/k7x4n9qm2p/", "/api/admin/:path*", "/api/advisory/bookings"],
};

function isAuthExempt(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return (
    isAdminGatePath(path) ||
    path === "/api/admin/auth/login" ||
    path === "/api/admin/auth/logout"
  );
}

function concealPanel() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
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

  return concealPanel();
}
