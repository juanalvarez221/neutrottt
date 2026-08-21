import type { AdvisoryStore } from "@/shared/lib/advisoryTypes";
import type { AdvisoryStorageAdapter } from "@/shared/lib/storage/advisoryStorage.types";
import { getCrmSql, hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import { readSeedStore } from "@/shared/lib/storage/fileAdvisoryStorage.server";
import { redisAdvisoryStorage } from "@/shared/lib/storage/redisAdvisoryStorage.server";
import { hasUpstashConfig } from "@/shared/lib/storage/upstashRest.server";

const AGENDA_ID = "advisory-store";

type AgendaRow = {
  valor: AdvisoryStore | string;
};

function asStore(valor: AgendaRow["valor"]): AdvisoryStore | null {
  if (!valor) return null;
  if (typeof valor === "string") {
    try {
      return JSON.parse(valor) as AdvisoryStore;
    } catch {
      return null;
    }
  }
  if (typeof valor === "object" && Array.isArray(valor.bookings)) {
    return valor;
  }
  return null;
}

async function importLegacyStore(): Promise<AdvisoryStore | null> {
  if (hasUpstashConfig()) {
    try {
      const fromRedis = await redisAdvisoryStorage.read();
      if (fromRedis) return fromRedis;
    } catch (error) {
      console.error("[agenda:import-redis]", error);
    }
  }
  return readSeedStore();
}

export const postgresAdvisoryStorage: AdvisoryStorageAdapter = {
  name: "postgres",
  async read() {
    const sql = await getCrmSql();
    if (!sql) return null;
    const rows = await sql<AgendaRow[]>`
      SELECT valor FROM agenda WHERE id = ${AGENDA_ID} LIMIT 1
    `;
    const existing = asStore(rows[0]?.valor ?? "");
    if (existing) return existing;

    const imported = await importLegacyStore();
    if (!imported) return null;
    await postgresAdvisoryStorage.write(imported);
    return imported;
  },
  async write(store: AdvisoryStore) {
    const sql = await getCrmSql();
    if (!sql) {
      throw new Error("No hay DATABASE_URL para guardar la agenda.");
    }
    await sql`
      INSERT INTO agenda (id, valor, actualizado_en)
      VALUES (${AGENDA_ID}, ${sql.json(store)}, now())
      ON CONFLICT (id) DO UPDATE SET
        valor = EXCLUDED.valor,
        actualizado_en = now()
    `;
  },
};

export function canUsePostgresStorage() {
  return hasDatabaseConfig();
}
