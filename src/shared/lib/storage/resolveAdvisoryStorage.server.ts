import type { AdvisoryStorageAdapter } from "@/shared/lib/storage/advisoryStorage.types";
import { fileAdvisoryStorage } from "@/shared/lib/storage/fileAdvisoryStorage.server";
import { redisAdvisoryStorage } from "@/shared/lib/storage/redisAdvisoryStorage.server";
import { postgresAdvisoryStorage } from "@/shared/lib/storage/postgresAdvisoryStorage.server";
import { hasDatabaseConfig } from "@/shared/lib/crm/postgres.server";
import { hasUpstashConfig, isProductionRuntime } from "@/shared/lib/storage/upstashRest.server";

const MISSING_STORAGE_MESSAGE = [
  "Configuración de almacenamiento inválida en producción.",
  "La agenda de asesorías requiere DATABASE_URL (Postgres) o Upstash Redis.",
  "Define DATABASE_URL en Vercel. El fallback a archivo local solo está permitido en desarrollo.",
].join(" ");

/**
 * Postgres es la fuente de verdad. Redis queda como legado.
 * En local, sin credenciales, se usa el archivo del repo.
 */
export function resolveAdvisoryStorage(): AdvisoryStorageAdapter {
  if (hasDatabaseConfig()) {
    return postgresAdvisoryStorage;
  }

  if (hasUpstashConfig()) {
    return redisAdvisoryStorage;
  }

  if (isProductionRuntime()) {
    throw new Error(MISSING_STORAGE_MESSAGE);
  }

  return fileAdvisoryStorage;
}
