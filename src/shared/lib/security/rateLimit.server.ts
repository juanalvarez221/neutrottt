import { createHash } from "node:crypto";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";

const memory = new Map<string, { count: number; resetAt: number }>();

export type RateLimitInput = {
  bucket: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

function fingerprint(bucket: string, subject: string): string {
  const pepper =
    process.env.ADMIN_SESSION_SECRET?.trim() || "neutrott-rate-limit";
  return createHash("sha256")
    .update(`${pepper}:${bucket}:${subject}`)
    .digest("hex")
    .slice(0, 24);
}

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const current = memory.get(key);
  if (!current || current.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true };
  }
  current.count += 1;
  if (current.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  try {
    const id = fingerprint(input.bucket, input.subject);
    if (!hasUpstashConfig()) {
      return memoryLimit(id, input.limit, input.windowSeconds);
    }

    const key = `neutrott:rl:${input.bucket}:${id}`;
    const count = await upstashCommand<number>(["INCR", key]);
    if ((count ?? 0) === 1) {
      await upstashCommand(["EXPIRE", key, input.windowSeconds]);
    }
    if ((count ?? 0) > input.limit) {
      const ttl = await upstashCommand<number>(["TTL", key]);
      return { ok: false, retryAfter: Math.max(1, ttl && ttl > 0 ? ttl : input.windowSeconds) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[rate-limit]", error);
    return { ok: true };
  }
}

/** Ventanas usadas por las APIs públicas. */
export const RATE_LIMITS = {
  adminAuthIp: { limit: 20, windowSeconds: 15 * 60 },
  adminAuthEmail: { limit: 12, windowSeconds: 15 * 60 },
  quote: { limit: 12, windowSeconds: 60 * 60 },
  book: { limit: 6, windowSeconds: 60 * 60 },
  confirm: { limit: 30, windowSeconds: 60 * 60 },
  reschedule: { limit: 20, windowSeconds: 60 * 60 },
  analitica: { limit: 180, windowSeconds: 60 },
  slots: { limit: 120, windowSeconds: 60 },
  captura: { limit: 20, windowSeconds: 60 * 60 },
} as const;
