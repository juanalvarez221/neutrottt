export type SimulatedNotification = {
  id: string;
  createdAt: string;
  kind: "quote" | "advisory" | "advisory-change" | "shop" | "other";
  subject: string;
  title: string;
  body: string;
  meta?: Record<string, string>;
};

const globalStore = globalThis as typeof globalThis & {
  __dannielSimulatedNotifications?: SimulatedNotification[];
};

function store(): SimulatedNotification[] {
  if (!globalStore.__dannielSimulatedNotifications) {
    globalStore.__dannielSimulatedNotifications = [];
  }
  return globalStore.__dannielSimulatedNotifications;
}

/** SIMULADO: log interno visible en admin en vez de email real. */
export function pushSimulatedNotification(
  input: Omit<SimulatedNotification, "id" | "createdAt"> & { id?: string },
): SimulatedNotification {
  const entry: SimulatedNotification = {
    id: input.id ?? `ntf_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
    createdAt: new Date().toISOString(),
    kind: input.kind,
    subject: input.subject,
    title: input.title,
    body: input.body,
    meta: input.meta,
  };
  store().unshift(entry);
  if (store().length > 200) store().length = 200;
  console.info("[notifications:simulated]", entry.subject);
  return entry;
}

export function listSimulatedNotifications(): SimulatedNotification[] {
  return [...store()];
}

export function clearSimulatedNotifications() {
  store().length = 0;
}
