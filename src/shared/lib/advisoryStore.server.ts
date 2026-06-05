import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AdvisoryBooking, AdvisoryStore } from "@/shared/lib/advisoryTypes";

const STORE_KEY = "neutrott:advisory-store";

let memoryStore: AdvisoryStore | null = null;

function getFilePath() {
  if (process.env.VERCEL) {
    return path.join("/tmp", "advisory-store.json");
  }
  return path.join(process.cwd(), "data", "advisory-store.json");
}

function getSeedPath() {
  return path.join(process.cwd(), "data", "advisory-store.json");
}

async function upstashCommand<T = unknown>(command: (string | number)[]) {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) return null;

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { result?: T };
  return payload.result ?? null;
}

async function readFromUpstash(): Promise<AdvisoryStore | null> {
  const raw = await upstashCommand<string>(["GET", STORE_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdvisoryStore;
  } catch {
    return null;
  }
}

async function writeToUpstash(store: AdvisoryStore) {
  const result = await upstashCommand(["SET", STORE_KEY, JSON.stringify(store)]);
  return result === "OK";
}

async function readFromFile(): Promise<AdvisoryStore | null> {
  const filePath = getFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as AdvisoryStore;
  } catch {
    try {
      const seed = await readFile(getSeedPath(), "utf8");
      const parsed = JSON.parse(seed) as AdvisoryStore;
      await writeToFile(parsed);
      return parsed;
    } catch {
      return null;
    }
  }
}

async function writeToFile(store: AdvisoryStore) {
  const filePath = getFilePath();
  if (!process.env.VERCEL) {
    await mkdir(path.dirname(filePath), { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export async function loadAdvisoryStore(): Promise<AdvisoryStore> {
  const hasRedis = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );

  if (!hasRedis && memoryStore) return memoryStore;

  const fromRedis = hasRedis ? await readFromUpstash() : null;
  if (fromRedis) {
    memoryStore = fromRedis;
    return fromRedis;
  }

  const fromFile = await readFromFile();
  if (fromFile) {
    memoryStore = fromFile;
    return fromFile;
  }

  throw new Error("No se pudo cargar la agenda de asesorías.");
}

export async function saveAdvisoryStore(store: AdvisoryStore) {
  memoryStore = store;
  const savedRedis = await writeToUpstash(store);
  if (savedRedis) return;

  try {
    await writeToFile(store);
  } catch {
    if (!memoryStore) throw new Error("No se pudo guardar la reserva.");
  }
}

export async function addAdvisoryBooking(booking: AdvisoryBooking) {
  const store = await loadAdvisoryStore();
  store.bookings = [booking, ...store.bookings.filter((item) => item.id !== booking.id)];
  await saveAdvisoryStore(store);
  return booking;
}

export async function listAdvisoryBookings() {
  const store = await loadAdvisoryStore();
  return store.bookings
    .filter((booking) => booking.status === "confirmed")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
