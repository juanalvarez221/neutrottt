import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE_LEGACY,
  adminSessionCookieAttrs,
} from "@/shared/lib/adminSession";

function expireLegacyCookies(response: NextResponse) {
  for (const name of ADMIN_SESSION_COOKIE_LEGACY) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
}

export function setAdminSessionCookie(response: NextResponse, token: string, maxAge: number) {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieAttrs(maxAge));
  expireLegacyCookies(response);
}

export function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", adminSessionCookieAttrs(0));
  expireLegacyCookies(response);
}
