import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionSecret,
  verifySessionToken,
} from "@/shared/lib/adminSession";

export const dynamic = "force-dynamic";

export async function GET() {
  const secret = getAdminSessionSecret();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = secret ? await verifySessionToken(secret, token) : false;
  return NextResponse.json({ authenticated });
}
