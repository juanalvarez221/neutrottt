import type { AdvisoryStorageAdapter } from "@/shared/lib/storage/advisoryStorage.types";
import { fileAdvisoryStorage } from "@/shared/lib/storage/fileAdvisoryStorage.server";
import { redisAdvisoryStorage } from "@/shared/lib/storage/redisAdvisoryStorage.server";
import { hasUpstashConfig, isProductionRuntime } from "@/shared/lib/storage/upstashRest.server";

const MISSING_UPSTASH_MESSAGE = [
  "Configuración de almacenamiento inválida en producción.",
  "La agenda de asesorías requiere Upstash Redis cuando NODE_ENV=production.",
  "Define las variables UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en el entorno (por ejemplo, en Vercel).",
  "El fallback a archivo local solo está permitido en desarrollo para evitar pérdida de datos.",
].join(" ");

/**
 * Selecciona el medio de almacenamiento:
 * - Si hay credenciales de Upstash → Redis (dev o prod).
 * - Si no hay credenciales y estamos en producción → error claro (sin fallback a /tmp).
 * - Si no hay credenciales y estamos en desarrollo → archivo local.
 */
export function resolveAdvisoryStorage(): AdvisoryStorageAdapter {
  if (hasUpstashConfig()) {
    return redisAdvisoryStorage;
  }

  if (isProductionRuntime()) {
    throw new Error(MISSING_UPSTASH_MESSAGE);
  }

  return fileAdvisoryStorage;
}
