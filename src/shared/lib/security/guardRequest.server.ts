import { NextResponse } from "next/server";
import { clientIp } from "@/shared/lib/security/clientIp";
import { checkRateLimit, RATE_LIMITS } from "@/shared/lib/security/rateLimit.server";
import { esPeticionDelSitio } from "@/shared/lib/security/sameOrigin";

export type PublicGuardBucket = keyof typeof RATE_LIMITS;

export async function enforcePublicWrite(
  request: Request,
  bucket: PublicGuardBucket,
  options?: { requireSameOrigin?: boolean },
): Promise<NextResponse | null> {
  if (options?.requireSameOrigin !== false && !esPeticionDelSitio(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const rules = RATE_LIMITS[bucket];
  const result = await checkRateLimit({
    bucket,
    subject: clientIp(request.headers),
    limit: rules.limit,
    windowSeconds: rules.windowSeconds,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter) },
      },
    );
  }

  return null;
}
