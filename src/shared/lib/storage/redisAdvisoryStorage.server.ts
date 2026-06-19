import type { AdvisoryStore } from "@/shared/lib/advisoryTypes";
import type { AdvisoryStorageAdapter } from "@/shared/lib/storage/advisoryStorage.types";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";

export { hasUpstashConfig };

const STORE_KEY = "neutrott:advisory-store";

export const redisAdvisoryStorage: AdvisoryStorageAdapter = {
  name: "redis",
  async read() {
    const raw = await upstashCommand<string>(["GET", STORE_KEY]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdvisoryStore;
    } catch {
      return null;
    }
  },
  async write(store: AdvisoryStore) {
    const result = await upstashCommand<string>(["SET", STORE_KEY, JSON.stringify(store)]);
    if (result !== "OK") {
      throw new Error("No se pudo guardar la agenda en Upstash Redis.");
    }
  },
};
