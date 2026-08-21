import { CAPA_ORO_VACIA, type CapaOro } from "@/shared/lib/analitica/tipos";
import {
  escribirOroPostgres,
  leerOroPostgres,
} from "@/shared/lib/analitica/postgresAnalitica.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import { createJsonDocumentStorage } from "@/shared/lib/storage/jsonDocumentStorage.server";
import { hasUpstashConfig, upstashCommand } from "@/shared/lib/storage/upstashRest.server";

const REDIS_KEY = "neutrott:analitica:oro";

const storage = createJsonDocumentStorage<CapaOro>({
  fileName: "analitica/oro.json",
  redisKey: REDIS_KEY,
});

export async function leerCapaOro(): Promise<CapaOro> {
  if (hasDatabaseConfig()) {
    try {
      const fromPg = await leerOroPostgres();
      if (fromPg?.generado_en) return fromPg;
    } catch (error) {
      console.error("[analitica:oro:postgres]", error);
    }
  }
  try {
    const legacy = (await storage.read()) ?? CAPA_ORO_VACIA;
    if (hasDatabaseConfig() && legacy.generado_en) {
      try {
        await escribirOroPostgres(legacy);
      } catch (error) {
        console.error("[analitica:oro:import]", error);
      }
    }
    return legacy;
  } catch (error) {
    console.error("[analitica:oro:legacy]", error);
    return CAPA_ORO_VACIA;
  }
}

export async function escribirCapaOro(oro: CapaOro): Promise<void> {
  if (hasDatabaseConfig()) {
    await escribirOroPostgres(oro);
    return;
  }
  await storage.write(oro);
}

export async function vaciarCapaOroLegacy(): Promise<void> {
  if (hasUpstashConfig()) {
    try {
      await upstashCommand(["DEL", REDIS_KEY]);
    } catch (error) {
      console.error("[analitica:oro:purge-redis]", error);
    }
  }
  try {
    await storage.write(CAPA_ORO_VACIA);
  } catch (error) {
    console.error("[analitica:oro:purge-file]", error);
  }
}
