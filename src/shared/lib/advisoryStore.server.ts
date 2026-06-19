import type { AdvisoryBooking, AdvisoryStore } from "@/shared/lib/advisoryTypes";
import { advisoryBookingBlocksSlot } from "@/shared/lib/advisoryBookingLifecycle";
import { resolveAdvisoryStorage } from "@/shared/lib/storage/resolveAdvisoryStorage.server";
import { readSeedStore } from "@/shared/lib/storage/fileAdvisoryStorage.server";

let memoryStore: AdvisoryStore | null = null;

function normalizeBooking(raw: AdvisoryBooking): AdvisoryBooking {
  const status = raw.status ?? "confirmed";
  return {
    ...raw,
    status,
    confirmationToken: raw.confirmationToken ?? `legacy-${raw.id}`,
  };
}

function normalizeStore(store: AdvisoryStore): AdvisoryStore {
  return {
    ...store,
    bookings: store.bookings.map(normalizeBooking),
  };
}

export async function loadAdvisoryStore(): Promise<AdvisoryStore> {
  const adapter = resolveAdvisoryStorage();

  if (adapter.name === "file") {
    if (memoryStore) return memoryStore;
    const fromFile = await adapter.read();
    if (!fromFile) {
      throw new Error("No se pudo cargar la agenda de asesorías.");
    }
    memoryStore = normalizeStore(fromFile);
    return memoryStore;
  }

  // Adapter remoto (Redis): siempre leemos fresco para evitar datos obsoletos.
  const fromRemote = await adapter.read();
  if (fromRemote) {
    memoryStore = normalizeStore(fromRemote);
    return memoryStore;
  }

  // Primer arranque: sembramos el medio remoto con el archivo versionado.
  const seed = await readSeedStore();
  if (!seed) {
    throw new Error("No se pudo cargar la agenda de asesorías.");
  }
  const normalized = normalizeStore(seed);
  await adapter.write(normalized);
  memoryStore = normalized;
  return normalized;
}

export async function saveAdvisoryStore(store: AdvisoryStore) {
  const adapter = resolveAdvisoryStorage();
  await adapter.write(store);
  memoryStore = store;
}

export async function addAdvisoryBooking(booking: AdvisoryBooking) {
  const store = await loadAdvisoryStore();
  store.bookings = [booking, ...store.bookings.filter((item) => item.id !== booking.id)];
  await saveAdvisoryStore(store);
  return booking;
}

export async function updateAdvisoryBooking(
  bookingId: string,
  patch: Partial<AdvisoryBooking>,
  options?: { unset?: (keyof AdvisoryBooking)[] },
) {
  const store = await loadAdvisoryStore();
  const index = store.bookings.findIndex((item) => item.id === bookingId);
  if (index === -1) return null;
  const updated = { ...store.bookings[index], ...patch } as AdvisoryBooking;
  for (const key of options?.unset ?? []) {
    delete updated[key];
  }
  store.bookings[index] = updated;
  await saveAdvisoryStore(store);
  return updated;
}

export async function getAdvisoryBookingByToken(token: string) {
  const store = await loadAdvisoryStore();
  return store.bookings.find((booking) => booking.confirmationToken === token) ?? null;
}

export async function getAdvisoryBookingById(id: string) {
  const store = await loadAdvisoryStore();
  return store.bookings.find((booking) => booking.id === id) ?? null;
}

export async function listAdvisoryBookings() {
  const store = await loadAdvisoryStore();
  return store.bookings
    .filter((booking) => advisoryBookingBlocksSlot(booking.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function listAllAdvisoryBookings() {
  const store = await loadAdvisoryStore();
  return [...store.bookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
