import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAdminSessionSecret,
  readSessionCookieValue,
  verifySessionToken,
} from "@/shared/lib/adminSession";

export const dynamic = "force-dynamic";

export async function GET() {
  const secret = getAdminSessionSecret();
  const cookieStore = await cookies();
  const token = readSessionCookieValue((name) => cookieStore.get(name)?.value);
  const authenticated = secret ? await verifySessionToken(secret, token) : false;
  const response = NextResponse.json({ authenticated });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
