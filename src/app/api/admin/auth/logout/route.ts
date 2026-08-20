import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  LEGACY_ADMIN_SESSION_COOKIE,
  adminSessionCookieAttrs,
} from "@/shared/lib/adminSession";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cleared = adminSessionCookieAttrs(0);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", cleared);
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
}
