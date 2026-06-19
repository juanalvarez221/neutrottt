import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  hasUpstashConfig,
  isProductionRuntime,
  upstashCommand,
} from "@/shared/lib/storage/upstashRest.server";

/**
 * Storage genérico de un documento JSON.
 * Reutiliza el mismo patrón que la agenda:
 * - Desarrollo sin Upstash → archivo local en data/<fileName>.
 * - Upstash configurado → Redis (clave redisKey), en dev o prod.
 * - Producción sin Upstash → error claro (sin fallback silencioso).
 */
export type JsonDocumentStorage<T> = {
  read(): Promise<T | null>;
  write(value: T): Promise<void>;
};

function missingUpstashMessage(fileName: string) {
  return [
    `Configuración de almacenamiento inválida en producción para "${fileName}".`,
    "Define UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en el entorno (por ejemplo, en Vercel).",
    "El fallback a archivo local solo está permitido en desarrollo.",
  ].join(" ");
}

export function createJsonDocumentStorage<T>(options: {
  fileName: string;
  redisKey: string;
}): JsonDocumentStorage<T> {
  const filePath = path.join(process.cwd(), "data", options.fileName);

  async function readFromFile(): Promise<T | null> {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async function writeToFile(value: T) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async function readFromRedis(): Promise<T | null> {
    const raw = await upstashCommand<string>(["GET", options.redisKey]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async function writeToRedis(value: T) {
    const result = await upstashCommand<string>([
      "SET",
      options.redisKey,
      JSON.stringify(value),
    ]);
    if (result !== "OK") {
      throw new Error(`No se pudo guardar "${options.fileName}" en Upstash Redis.`);
    }
  }

  return {
    async read() {
      if (hasUpstashConfig()) return readFromRedis();
      if (isProductionRuntime()) throw new Error(missingUpstashMessage(options.fileName));
      return readFromFile();
    },
    async write(value: T) {
      if (hasUpstashConfig()) {
        await writeToRedis(value);
        return;
      }
      if (isProductionRuntime()) throw new Error(missingUpstashMessage(options.fileName));
      await writeToFile(value);
    },
  };
}
