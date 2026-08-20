import { randomUUID } from "node:crypto";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

export type DistributedLock = {
  ok: boolean;
  release: () => Promise<void>;
};

function memoryAcquire(key: string, ttlSeconds: number): DistributedLock {
  const now = Date.now();
  const current = memoryLocks.get(key);
  if (current && current.expiresAt > now) {
    return { ok: false, release: async () => undefined };
  }
  const token = randomUUID();
  memoryLocks.set(key, { token, expiresAt: now + ttlSeconds * 1000 });
  return {
    ok: true,
    release: async () => {
      const held = memoryLocks.get(key);
      if (held?.token === token) memoryLocks.delete(key);
    },
  };
}

export async function acquireLock(key: string, ttlSeconds = 8): Promise<DistributedLock> {
  if (!hasUpstashConfig()) {
    return memoryAcquire(key, ttlSeconds);
  }

  const token = randomUUID();
  const result = await upstashCommand<string>(["SET", key, token, "NX", "EX", ttlSeconds]);
  if (result !== "OK") {
    return { ok: false, release: async () => undefined };
  }

  return {
    ok: true,
    release: async () => {
      const held = await upstashCommand<string>(["GET", key]);
      if (held === token) {
        await upstashCommand(["DEL", key]);
      }
    },
  };
}
