import { NextResponse } from "next/server";
import { clearAdminSessionCookies } from "@/shared/lib/adminSessionCookies.server";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  clearAdminSessionCookies(response);
  return response;
}
