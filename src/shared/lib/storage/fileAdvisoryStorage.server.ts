import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AdvisoryStore } from "@/shared/lib/advisoryTypes";
import type { AdvisoryStorageAdapter } from "@/shared/lib/storage/advisoryStorage.types";

/**
 * Adapter de archivo local. Pensado exclusivamente para desarrollo:
 * lee y escribe en data/advisory-store.json dentro del repo.
 */
function getFilePath() {
  return path.join(process.cwd(), "data", "advisory-store.json");
}

async function readStoreFile(): Promise<AdvisoryStore | null> {
  try {
    const raw = await readFile(getFilePath(), "utf8");
    return JSON.parse(raw) as AdvisoryStore;
  } catch {
    return null;
  }
}

/**
 * Lectura del archivo semilla versionado en el repo.
 * Se usa para sembrar Redis en el primer arranque de producción.
 */
export async function readSeedStore(): Promise<AdvisoryStore | null> {
  return readStoreFile();
}

export const fileAdvisoryStorage: AdvisoryStorageAdapter = {
  name: "file",
  async read() {
    return readStoreFile();
  },
  async write(store: AdvisoryStore) {
    const filePath = getFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  },
};
